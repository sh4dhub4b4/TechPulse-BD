// tests/ui_integration.test.js
// JSDOM integration tests for the Live Hardware Pulse presence lifecycle,
// modal scroll locking, and the stateless chatbot drawer interactions.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppHarness } from "./helpers/app_harness.js";

let harness;

beforeEach(() => {
  harness = createAppHarness();
});

afterEach(() => {
  harness.cleanup();
});

describe("Hardware Pulse presence lifecycle", () => {
  it("subscribes and tracks the visitor on the pulse-presence channel", () => {
    harness.api.initHardwarePulse();

    expect(harness.sb.channels).toHaveLength(1);

    const channel = harness.sb.channels[0];
    expect(channel.name).toBe("pulse-presence");
    expect(channel.options.config.presence.key).toBeTruthy();
    expect(channel.subscribed).toBe(true);
    expect(channel.tracked).toHaveLength(1);
    expect(channel.tracked[0]).toHaveProperty("online_at");
  });

  it("removes the previous channel when re-initialized, so listeners do not leak", () => {
    harness.api.initHardwarePulse();
    const first = harness.sb.channels[0];

    harness.api.initHardwarePulse();
    const second = harness.sb.channels[1];

    expect(harness.sb.channels).toHaveLength(2);
    expect(first.removed).toBe(true);
    expect(second).not.toBe(first);
    expect(second.removed).toBe(false);
    expect(harness.api.pulsePresenceChannel).toBe(second);
    expect(harness.api.pulseRefreshTimer).not.toBeNull();
  });

  it("tears down the channel and refresh timer without leftovers", () => {
    harness.api.initHardwarePulse();
    const channel = harness.sb.channels[0];
    const timer = harness.api.pulseRefreshTimer;

    harness.api.teardownHardwarePulse();

    expect(channel.removed).toBe(true);
    expect(harness.sb.removedChannels).toEqual([channel]);
    expect(harness.api.pulsePresenceChannel).toBeNull();
    expect(harness.api.pulseRefreshTimer).toBeNull();
    expect(timer).not.toBeNull();

    // A second teardown is a no-op, not a double remove.
    harness.api.teardownHardwarePulse();
    expect(harness.sb.removedChannels).toEqual([channel]);
  });

  it("tears down when the page is hidden", () => {
    harness.api.initHardwarePulse();
    const channel = harness.sb.channels[0];

    harness.window.dispatchEvent(new harness.window.Event("pagehide"));

    expect(channel.removed).toBe(true);
    expect(harness.api.pulsePresenceChannel).toBeNull();
    expect(harness.api.pulseRefreshTimer).toBeNull();
  });

  it("renders the active user count from the presence sync event", () => {
    harness.api.initHardwarePulse();
    const channel = harness.sb.channels[0];

    channel.setPresence({ alice: [{}], bob: [{}], carol: [{}] });

    const syncHandler = channel.handlers.find(
      (entry) => entry.type === "presence" && entry.filter && entry.filter.event === "sync"
    );
    expect(syncHandler).toBeDefined();
    syncHandler.callback();

    expect(harness.document.getElementById("pulse-active-users").innerText).toBe("3");
  });
});

describe("modal scroll locking", () => {
  it("locks the body while a modal is open and unlocks when it closes", () => {
    const { body } = harness.document;
    const modal = harness.document.getElementById("review-modal");

    harness.api.openReviewModal();
    expect(modal.classList.contains("hidden")).toBe(false);
    expect(body.classList.contains("overflow-hidden")).toBe(true);

    harness.api.closeReviewModal();
    expect(modal.classList.contains("hidden")).toBe(true);
    expect(body.classList.contains("overflow-hidden")).toBe(false);
  });

  it("stays locked while any modal remains open", () => {
    const { body } = harness.document;

    harness.api.openReviewModal();
    harness.api.openHardwareChat();
    harness.api.closeHardwareChat();

    expect(body.classList.contains("overflow-hidden")).toBe(true);

    harness.api.closeReviewModal();
    expect(body.classList.contains("overflow-hidden")).toBe(false);
  });
});

describe("stateless chatbot drawer", () => {
  it("opens and closes with the trigger and toggles the scroll lock", () => {
    const modal = harness.document.getElementById("hardware-chat-modal");
    const { body } = harness.document;

    harness.api.toggleHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(false);
    expect(body.classList.contains("overflow-hidden")).toBe(true);

    harness.api.toggleHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(true);
    expect(body.classList.contains("overflow-hidden")).toBe(false);
  });

  it("dismisses the drawer on Escape and releases the scroll lock", () => {
    const modal = harness.document.getElementById("hardware-chat-modal");
    harness.api.setupKeyboardShortcuts();

    harness.api.openHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(false);

    harness.window.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Escape" }));

    expect(modal.classList.contains("hidden")).toBe(true);
    expect(harness.document.body.classList.contains("overflow-hidden")).toBe(false);
  });
});
