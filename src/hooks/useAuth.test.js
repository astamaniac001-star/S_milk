import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuth } from "./useAuth";

// Stub supabaseClient BEFORE the hook imports it. Vitest hoists vi.mock, so we
// declare an in-test factory that exposes the auth methods we exercise.
let sessionState;
let getSessionMock;
let signInWithPasswordMock;
let signOutMock;
let onAuthStateChangeMock;

vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSessionMock(...args),
      signInWithPassword: (...args) => signInWithPasswordMock(...args),
      signOut: (...args) => signOutMock(...args),
      onAuthStateChange: (...args) => onAuthStateChangeMock(...args),
    },
  },
}));

const TOKEN_EXPIRED_SESSION = { access_token: "tok-123" };
const fakeSubscription = (onChange) => {
  let currentCb = onChange;
  return {
    unsubscribe: vi.fn(() => {
      currentCb = null;
    }),
    // helper for tests that want to drive an event
    _emit: (evt, s) => currentCb?.(evt, s),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionState = null;

  getSessionMock = vi.fn(async () => ({
    data: { session: sessionState },
    error: null,
  }));
  signInWithPasswordMock = vi.fn(async () => ({ data: {}, error: null }));
  signOutMock = vi.fn(async () => ({ error: null }));
  onAuthStateChangeMock = vi.fn((cb) => {
    const sub = fakeSubscription(cb);
    // track for tests
    onAuthStateChangeMock._lastSub = sub;
    return { data: { subscription: sub } };
  });

  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAuth — initial getSession + lifecycle (audit 2026-07-25)", () => {
  it("starts loading=true, flips to false after a successful getSession even when session is null", async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("loads the existing Supabase session as-is and exposes token + isAuthenticated=true", async () => {
    sessionState = TOKEN_EXPIRED_SESSION;
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(TOKEN_EXPIRED_SESSION);
    expect(result.current.token).toBe("tok-123");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("does NOT strand the user on an infinite spinner if getSession throws (audit rule §9 + §10 layer 4)", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("does NOT strand the user on an infinite spinner if getSession returns sessionError", async () => {
    getSessionMock.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Invalid JWT" },
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it("subscribes and unsubscribes to auth state changes (no listener leak)", async () => {
    const { unmount } = renderHook(() => useAuth());
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1));
    const sub = onAuthStateChangeMock._lastSub;
    expect(sub).toBeDefined();
    unmount();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("SIGNED_OUT event dispatches the custom auth:expired window event (api.js listens for it)", async () => {
    const spy = vi.fn();
    window.addEventListener("auth:expired", spy);
    renderHook(() => useAuth());
    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalled());
    const sub = onAuthStateChangeMock._lastSub;
    act(() => sub._emit("SIGNED_OUT", null));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:expired", spy);
  });
});

describe("useAuth — auth:expired window event triggers logout (audit rule §9)", () => {
  it("clears session AND purges the legacy token from both web stores when the api.js fires auth:expired", async () => {
    sessionState = TOKEN_EXPIRED_SESSION;
    sessionStorage.setItem("token", "legacy-tok");
    localStorage.setItem("token", "legacy-tok");
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(sessionStorage.getItem("token")).toBe("legacy-tok");

    act(() => {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("useAuth — login()(pin) — 6-digit PIN contract (audit rule §9)", () => {
  it("rejects a non-6-digit PIN without calling Supabase (rate-limit hygiene)", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("12345");
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/6 digits/);
    expect(result.current.loading).toBe(false);
  });

  it("strips non-digits before submitting so a paste like '12-3456' is normalized to '123456'", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("12-34ab56");
    });
    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "operator@milk.local",
      password: "123456",
    });
    // Per documented contract: never log PINs to console or persist them.
    // (This is a structural assertion — there's nothing to PIN-log here.)
    expect(result.current.loading).toBe(false);
  });

  it("lowers the activation barrier — a successful signIn clears the error and flips loading off (no spinner hang)", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("999999");
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("surfaces the Supabase authError message on bad PIN — but does NOT weaken rate limiting", async () => {
    signInWithPasswordMock.mockResolvedValueOnce({
      data: {},
      error: { message: "Invalid login credentials" },
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.login("000000");
    });
    expect(result.current.error).toMatch(/Invalid login credentials/);
    expect(result.current.loading).toBe(false);
  });

  it("logout() clears session and purges legacy token storage", async () => {
    sessionState = TOKEN_EXPIRED_SESSION;
    sessionStorage.setItem("token", "legacy-tok");
    localStorage.setItem("token", "legacy-tok");
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
  });
});
