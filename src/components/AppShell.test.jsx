import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell } from "./AppShell.jsx";

function renderShell(overrides = {}) {
  const props = {
    tab: "dashboard",
    today: "2026-08-03",
    onTabChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AppShell {...props}>content</AppShell>) };
}

describe("AppShell — nav tabs", () => {
  it("renders the Subscriptions tab between Customers and Delivery", () => {
    renderShell();

    const labels = screen
      .getAllByRole("button")
      .map((b) => b.textContent.trim())
      .filter((t) =>
        [
          "Home",
          "Customers",
          "Subs",
          "Delivery",
          "Imports",
          "Billing",
          "More",
        ].includes(t),
      );

    expect(labels).toEqual([
      "Home",
      "Customers",
      "Subs",
      "Delivery",
      "Imports",
      "Billing",
      "More",
    ]);
  });

  it("onTabChange fires with the tab id when a nav item is clicked", () => {
    const { props } = renderShell();

    fireEvent.click(screen.getByRole("button", { name: /Subs/ }));
    expect(props.onTabChange).toHaveBeenCalledWith("subscriptions");
  });

  it("shows the page title for the active tab", () => {
    renderShell({ tab: "subscriptions" });
    expect(screen.getByRole("heading", { name: "Subscriptions" })).toBeTruthy();
  });

  it("marks the active tab", () => {
    renderShell({ tab: "subscriptions" });
    const active = document.querySelector(".nav-item.active");
    expect(active?.textContent.trim()).toBe("Subs");
  });
});
