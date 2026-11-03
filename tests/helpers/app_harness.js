// tests/helpers/app_harness.js
// Loads the production browser script (web/app.js) into a JSDOM realm with
// stubbed Supabase, lucide and Chart globals. No app logic is duplicated here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const APP_PATH = fileURLToPath(new URL("../../web/app.js", import.meta.url));

const FIXTURE = `<!doctype html>
<html>
  <body>
    <input id="global-search" type="text" />
    <div id="review-modal" class="hidden"></div>
    <div id="comparison-modal" class="hidden"></div>
    <div id="profile-modal" class="hidden"></div>
    <div id="auth-modal" class="hidden"></div>

    <button id="btn-chatbot-trigger" type="button"></button>
    <div id="hardware-chat-modal" class="hidden">
      <div id="chat-messages-container"></div>
      <form id="chat-form">
        <input id="chat-input" type="text" />
        <button id="btn-chat-send" type="submit"></button>
      </form>
    </div>

    <div id="pulse-total-skus"></div>
    <div id="pulse-updated-24h"></div>
    <div id="pulse-velocity-1h"></div>
    <div id="pulse-active-users"></div>
  </body>
</html>`;

// A chainable, awaitable stand-in for a Supabase query builder.
// Any method call returns the same builder, and awaiting it resolves the result.
function makeQuery(result) {
  const query = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === "then") return (resolve) => resolve(result);
      if (prop === "catch" || prop === "finally") return () => query;
      return () => query;
    },
    apply() {
      return query;
    },
  });
  return query;
}

function createSupabaseStub() {
  const sb = {
    channels: [],
    removedChannels: [],
    invokeCalls: [],
    rpcCalls: [],
    from: () => makeQuery({ data: [], error: null, count: 0 }),
    rpc: async (name, args) => {
      sb.rpcCalls.push({ name, args });
      return {
        data: [{ total_products: 0, updated_today: 0, feedback_last_hour: 0 }],
        error: null,
      };
    },
    channel(name, options) {
      const channel = {
        name,
        options,
        subscribed: false,
        unsubscribed: false,
        removed: false,
        tracked: [],
        handlers: [],
        presence: {},
        on(type, filter, callback) {
          channel.handlers.push({ type, filter, callback });
          return channel;
        },
        subscribe(callback) {
          channel.subscribed = true;
          if (callback) callback("SUBSCRIBED");
          return channel;
        },
        track(payload) {
          channel.tracked.push(payload);
          return Promise.resolve("ok");
        },
        presenceState() {
          return channel.presence;
        },
        setPresence(state) {
          channel.presence = state;
        },
        unsubscribe() {
          channel.unsubscribed = true;
          return Promise.resolve("ok");
        },
      };
      sb.channels.push(channel);
      return channel;
    },
    removeChannel(channel) {
      channel.removed = true;
      sb.removedChannels.push(channel);
      return Promise.resolve("ok");
    },
    functions: {
      invoke: async (name, payload) => {
        sb.invokeCalls.push({ name, payload });
        return { data: null, error: new Error("advisor offline in tests") };
      },
    },
  };
  return sb;
}

export function createAppHarness() {
  const dom = new JSDOM(FIXTURE, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const document = window.document;

  const sb = createSupabaseStub();
  window.supabase = { createClient: () => sb };
  window.lucide = { createIcons() {} };
  window.Chart = class {
    constructor() {}
    destroy() {}
  };

  // App boot runs heavy catalog/auth work on DOMContentLoaded. Tests drive the
  // individual entry points instead, so suppress that one listener while the
  // production script is evaluated.
  document.addEventListener = function (type, listener, options) {
    if (type === "DOMContentLoaded") return;
    return EventTarget.prototype.addEventListener.call(this, type, listener, options);
  };

  const source = readFileSync(APP_PATH, "utf8");
  let api;
  try {
    api = window.eval(`(function () {
${source}
;return {
  get allProducts() { return allProducts; },
  set allProducts(value) { allProducts = value; },
  get chatbotConversation() { return chatbotConversation; },
  get chatBusy() { return chatBusy; },
  get pulsePresenceChannel() { return pulsePresenceChannel; },
  get pulseRefreshTimer() { return pulseRefreshTimer; },
  get buildLabSlots() { return buildLabSlots; },
  CHATBOT_SYSTEM_PROMPT,
  CHATBOT_HISTORY_MESSAGES,
  initHardwarePulse,
  teardownHardwarePulse,
  parseHardwarePulseMetrics,
  fetchHardwarePulseMetrics,
  setPulseMetric,
  toggleHardwareChat,
  openHardwareChat,
  closeHardwareChat,
  sendChatPreset,
  handleChatSubmit,
  askHardwareAdvisor,
  requestRemoteAdvisor,
  buildChatContext,
  renderChatMessage,
  setChatBusy,
  detectChatSocket,
  parseChatBudget,
  extractChatKeywords,
  findChatProducts,
  buildLocalAdvisorReply,
  cleanProductUrl,
  sanitizeUrl,
  setModalScrollLock,
  openReviewModal,
  closeReviewModal,
  setupKeyboardShortcuts
};
})()`);
  } finally {
    delete document.addEventListener;
  }

  return {
    dom,
    window,
    document,
    sb,
    api,
    cleanup() {
      try {
        api.teardownHardwarePulse();
      } catch (err) {
        // Harness teardown must never mask a test failure.
      }
      window.close();
    },
  };
}
