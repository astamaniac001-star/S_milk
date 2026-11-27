import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// Stub supabaseClient BEFORE the component imports it. Vitest hoists vi.mock.
const signOutMock = vi.fn();

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: { auth: { signOut: (...a) => signOutMock(...a) } },
}));

// vi.mock replaces ui.jsx's Btn with a plain button so the handler props are
// exercised directly rather than through the real component's variants.
vi.mock("./ui.jsx", () => ({
  Btn: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest} data-testid="btn">
      {children}
    </button>
  ),
}));

function Boom() {
  throw new Error("render exploded");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("ErrorBoundary", () => {
  it("renders children untouched when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("catches a render error and shows the recovery card", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("render exploded")).toBeInTheDocument();
    expect(screen.getByText("Reload")).toBeInTheDocument();
    expect(screen.getByText("Sign out & reload")).toBeInTheDocument();
  });

  it("signs out for real, flushes every storage key, and reloads", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload, hash: "#/billing" },
      writable: true,
    });
    signOutMock.mockRejectedValue(new Error("offline"));

    localStorage.setItem("token", "legacy");
    localStorage.setItem("sb-ref-auth-token", "live-session");
    localStorage.setItem("unrelated", "keep me");
    sessionStorage.setItem("token", "legacy-session");

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await act(async () => {
      screen.getByText("Sign out & reload").click();
    });

    expect(signOutMock).toHaveBeenCalled();
    // Auth flush removes the Supabase session + the legacy token from BOTH
    // storages; unrelated keys survive (2026-11-21 audit — leaving the live
    // session behind kept the operator signed in on a shared device).
    expect(localStorage.getItem("sb-ref-auth-token")).toBeNull();
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep me");
    expect(reload).toHaveBeenCalled();
  });

  it("Reload clears the hash before reloading", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let hash = "#/delivery";
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        get hash() {
          return hash;
        },
        set hash(v) {
          hash = v;
        },
        reload,
      },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await act(async () => {
      screen.getByText("Reload").click();
    });

    expect(hash).toBe("");
    expect(reload).toHaveBeenCalled();
  });

  it("survives a signOut that throws — the local flush still runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    signOutMock.mockImplementation(() => {
      throw new Error("sync failure");
    });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, hash: "" },
      writable: true,
    });
    localStorage.setItem("sb-x", "still-flushed");

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    await expect(
      act(async () => {
        screen.getByText("Sign out & reload").click();
      }),
    ).resolves.toBeUndefined();

    expect(localStorage.getItem("sb-x")).toBeNull();
    expect(reload).toHaveBeenCalled();
  });
});
