// tests/chatbot.test.js
// Comprehensive test suite for TechPulse BD Hardware Advisory Chatbot.
// Validates UI lifecycle, input handling, RAG database context injection,
// socket/budget heuristics, multi-tier remote provider fallbacks, local rules,
// safe markdown rendering, interactive action chips, and PSU advisory logic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppHarness } from "./helpers/app_harness.js";

const SAMPLE_PRODUCTS = [
  { id: "1", title: "AMD Ryzen 5 7600X Processor", vendor_name: "Star Tech", category: "Processor", current_price: 21500, in_stock: true },
  { id: "2", title: "AMD Ryzen 5 5600 Desktop Processor", vendor_name: "Ryans", category: "Processor", current_price: 11800, in_stock: true },
  { id: "3", title: "Intel Core i5-12400F 12th Gen Processor", vendor_name: "Tech Land", category: "Processor", current_price: 12500, in_stock: true },
  { id: "4", title: "MSI PRO B650M-A WIFI AM5 Motherboard", vendor_name: "Star Tech", category: "Motherboard", current_price: 19500, in_stock: true },
  { id: "5", title: "G.Skill Ripjaws V 16GB DDR4 3200MHz RAM", vendor_name: "Ryans", category: "RAM", current_price: 4200, in_stock: false },
  { id: "6", title: "Corsair Vengeance 32GB DDR5 6000MHz RAM", vendor_name: "Star Tech", category: "RAM", current_price: 12000, in_stock: true },
  { id: "7", title: "Sapphire Pulse RX 7600 8GB Graphics Card", vendor_name: "Tech Land", category: "Graphics Card", current_price: 32000, in_stock: true },
  { id: "8", title: "AMD Ryzen 5 7600X Processor", vendor_name: "Ryans", category: "Processor", current_price: 21200, in_stock: true },
  { id: "9", title: "Antec NeoECO Gold 750W Power Supply", vendor_name: "Star Tech", category: "Power Supply", current_price: 9200, in_stock: true },
  { id: "10", title: "Intel Core Ultra 7 265K Arrow Lake Processor", vendor_name: "Star Tech", category: "Processor", current_price: 52000, in_stock: true },
];

let harness;

beforeEach(() => {
  harness = createAppHarness();
  harness.api.allProducts = [...SAMPLE_PRODUCTS];
});

afterEach(() => {
  vi.restoreAllMocks();
  harness.cleanup();
});

describe("Chatbot UI Lifecycle & Modal Controls", () => {
  it("opens modal and locks scroll on openHardwareChat", () => {
    const modal = harness.document.getElementById("hardware-chat-modal");
    expect(modal.classList.contains("hidden")).toBe(true);

    harness.api.openHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(false);
    expect(harness.document.body.classList.contains("overflow-hidden")).toBe(true);
  });

  it("closes modal and releases scroll on closeHardwareChat", () => {
    const modal = harness.document.getElementById("hardware-chat-modal");
    harness.api.openHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(false);

    harness.api.closeHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(true);
    expect(harness.document.body.classList.contains("overflow-hidden")).toBe(false);
  });

  it("toggles modal state on toggleHardwareChat", () => {
    const modal = harness.document.getElementById("hardware-chat-modal");
    expect(modal.classList.contains("hidden")).toBe(true);

    harness.api.toggleHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(false);

    harness.api.toggleHardwareChat();
    expect(modal.classList.contains("hidden")).toBe(true);
  });

  it("clears conversation and resets message container on clearHardwareChat", () => {
    harness.api.chatbotConversation.push({ role: "user", content: "Test query" });
    harness.api.chatbotConversation.push({ role: "assistant", content: "Test reply" });

    harness.api.clearHardwareChat();
    expect(harness.api.chatbotConversation.length).toBe(0);

    const container = harness.document.getElementById("chat-messages-container");
    expect(container.textContent).toContain("Ask about BD cash prices");
  });

  it("manages busy state disabling and enabling chat input and send button", () => {
    const input = harness.document.getElementById("chat-input");
    const sendBtn = harness.document.getElementById("btn-chat-send");

    harness.api.setChatBusy(true);
    expect(harness.api.chatBusy).toBe(true);
    expect(input.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);

    harness.api.setChatBusy(false);
    expect(harness.api.chatBusy).toBe(false);
    expect(input.disabled).toBe(false);
    expect(sendBtn.disabled).toBe(false);
  });
});

describe("Message Rendering, Markdown & DOM Safety", () => {
  it("renders user bubble with right alignment and dark theme styling", () => {
    const container = harness.document.getElementById("chat-messages-container");
    const row = harness.api.renderChatMessage("user", "Hello TechPulse!");

    expect(container.contains(row)).toBe(true);
    expect(row.className).toContain("justify-end");
    const bubble = row.querySelector("div");
    expect(bubble.className).toContain("bg-slate-900");
    expect(bubble.className).toContain("text-white");
    expect(bubble.textContent).toBe("Hello TechPulse!");
  });

  it("renders assistant bubble with markdown formatting for bold, lists, and code", () => {
    const rawText = "Recommendation:\n- **Star Tech**: ৳21,500\n- Use `DDR5` RAM";
    const container = harness.document.getElementById("chat-messages-container");
    const row = harness.api.renderChatMessage("assistant", rawText);

    expect(container.contains(row)).toBe(true);
    const bubble = row.querySelector("div");
    expect(bubble.innerHTML).toContain("<strong");
    expect(bubble.innerHTML).toContain("Star Tech</strong>");
    expect(bubble.innerHTML).toContain("<code");
    expect(bubble.innerHTML).toContain("DDR5</code>");
    expect(bubble.innerHTML).toContain("<li");
  });

  it("prevents script execution and safely escapes HTML entities in assistant text", () => {
    const maliciousInput = "<img src=x onerror=alert(1)><b>Bold text</b>";
    const container = harness.document.getElementById("chat-messages-container");
    const row = harness.api.renderChatMessage("assistant", maliciousInput);
    const bubble = row.querySelector("div");

    expect(bubble.innerHTML).not.toContain("<img src=x");
    expect(bubble.innerHTML).toContain("&lt;img src=x");
  });

  it("renders interactive action chips when suggested products are provided", () => {
    const container = harness.document.getElementById("chat-messages-container");
    const products = [SAMPLE_PRODUCTS[0], SAMPLE_PRODUCTS[3]];
    const row = harness.api.renderChatMessage("assistant", "Check these deals", products);

    const bubble = row.querySelector("div");
    const viewButtons = bubble.querySelectorAll('button[data-action="chat-view-product"]');
    const addButtons = bubble.querySelectorAll('button[data-action="chat-add-to-build"]');

    expect(viewButtons.length).toBe(2);
    expect(addButtons.length).toBe(2);
    expect(viewButtons[0].getAttribute("data-id")).toBe("1");
    expect(addButtons[1].getAttribute("data-id")).toBe("4");
  });

  it("renders animated typing indicator while fetching reply", () => {
    const container = harness.document.getElementById("chat-messages-container");
    const indicator = harness.api.renderChatTypingIndicator();

    expect(container.contains(indicator)).toBe(true);
    expect(indicator.innerHTML).toContain("animate-pulse");
    indicator.remove();
    expect(container.contains(indicator)).toBe(false);
  });
});

describe("Input Submission & Form Handling", () => {
  it("ignores empty or whitespace-only inputs without calling advisor", async () => {
    const input = harness.document.getElementById("chat-input");
    input.value = "    ";

    const initialTurns = harness.api.chatbotConversation.length;
    await harness.api.handleChatSubmit();

    expect(harness.api.chatbotConversation.length).toBe(initialTurns);
  });

  it("ignores submission when chat is already busy", async () => {
    const input = harness.document.getElementById("chat-input");
    input.value = "Show AM5 motherboards";
    harness.api.setChatBusy(true);

    const initialTurns = harness.api.chatbotConversation.length;
    await harness.api.handleChatSubmit();

    expect(harness.api.chatbotConversation.length).toBe(initialTurns);
    expect(input.value).toBe("Show AM5 motherboards");
  });

  it("sendChatPreset updates input and submits", () => {
    const input = harness.document.getElementById("chat-input");
    const form = harness.document.getElementById("chat-form");
    let submitted = false;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitted = true;
    });

    harness.api.sendChatPreset("Best GPU under 35k");
    expect(input.value).toBe("Best GPU under 35k");
    expect(submitted).toBe(true);
  });
});

describe("Hardware Heuristics, Sockets & PSU Advisor", () => {
  it("detects socket types including LGA1851 from natural language queries", () => {
    const detect = harness.api.detectChatSocket;
    expect(detect("Looking for an AM5 board")).toBe("AM5");
    expect(detect("Can I put this in an am4 socket?")).toBe("AM4");
    expect(detect("Intel LGA 1700 processor")).toBe("LGA1700");
    expect(detect("Intel LGA 1851 motherboard")).toBe("LGA1851");
    expect(detect("What is the best mouse?")).toBeNull();
  });

  it("infers CPU sockets including Core Ultra 200 series from title strings", () => {
    const infer = harness.api.inferProductSocket;
    expect(infer("AMD Ryzen 7 7800X3D Processor")).toBe("AM5");
    expect(infer("AMD Ryzen 5 8500G 6-Core")).toBe("AM5");
    expect(infer("AMD Ryzen 5 5600X Desktop Processor")).toBe("AM4");
    expect(infer("Intel Core i5 12400F Processor")).toBe("LGA1700");
    expect(infer("Intel Core i7 13700K 16-Core Processor")).toBe("LGA1700");
    expect(infer("Intel Core Ultra 7 265K Arrow Lake Processor")).toBe("LGA1851");
  });

  it("evaluates GPU PSU wattage requirements accurately", () => {
    const evaluate = harness.api.evaluateChatPsuRequirements;

    const rtx4070Check = evaluate("Will 650W PSU handle RTX 4070?");
    expect(rtx4070Check.gpu).toContain("RTX 4070");
    expect(rtx4070Check.isSufficient).toBe(true);
    expect(rtx4070Check.note).toContain("Yes, a quality 650W PSU is sufficient");

    const rtx4090Check = evaluate("Can I run RTX 4090 on 650 watt PSU?");
    expect(rtx4090Check.isSufficient).toBe(false);
    expect(rtx4090Check.note).toContain("Caution");

    const generalCheck = evaluate("What power supply for RX 7900 XTX?");
    expect(generalCheck.gpu).toContain("RX 7900");
    expect(generalCheck.recommendedWattage).toBe(750);
  });

  it("filters out stop words and extracts hardware tokens", () => {
    const extract = harness.api.extractChatKeywords;
    const tokens = extract("Is the Ryzen 7600X in stock with price under 25k?");
    expect(tokens).toContain("ryzen");
    expect(tokens).toContain("7600x");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
  });

  it("parses multiple BDT budget representations accurately", () => {
    const parse = harness.api.parseChatBudget;
    expect(parse("GPU under 32k")).toBe(32000);
    expect(parse("PC under 1.5 lakh")).toBe(150000);
    expect(parse("Processor below 15 thousand")).toBe(15000);
    expect(parse("Board with budget of 20,000")).toBe(20000);
  });
});

describe("Catalog Matching, Multi-Store & RAG Logic", () => {
  it("matches and ranks relevant products within budget", () => {
    const matches = harness.api.findChatProducts("Ryzen 7600 under 25k");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].title).toContain("Ryzen 5 7600X");
    expect(matches[0].current_price).toBeLessThanOrEqual(25000);
  });

  it("retrieves SKUs from both stores on multi-vendor comparative queries", () => {
    const matches = harness.api.findChatProducts("Star Tech vs Ryans cash price for 7600X");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const vendors = matches.map((p) => p.vendor_name);
    expect(vendors).toContain("Star Tech");
    expect(vendors).toContain("Ryans");
  });

  it("groups products by distinct component categories on build queries", () => {
    const matches = harness.api.findChatProducts("Recommend AM5 build under 70k");
    expect(matches.length).toBeGreaterThan(1);
    const categories = new Set(matches.map((p) => p.category));
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });
});

describe("Multi-Tier AI Advisor Fallback Execution", () => {
  it("Tier 1: Successfully calls Pollinations.ai with injected RAG catalog context", async () => {
    let capturedBody = null;
    const mockResponseText = "AMD Ryzen 5 7600X is available at Star Tech for ৳21,500.";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockResponseText,
    });
    harness.window.fetch = mockFetch;
    globalThis.fetch = mockFetch;

    const reply = await harness.api.requestRemoteAdvisor("Ryzen 7600X price", []);
    expect(reply).toBe(mockResponseText);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("https://text.pollinations.ai/");
    capturedBody = JSON.parse(callArgs[1].body);

    const systemMessage = capturedBody.messages.find((m) => m.role === "system");
    expect(systemMessage.content).toContain("Live Database Inventory & Pricing (Bangladesh Market):");
  });

  it("Tier 2: Falls back to Supabase Edge Function when Pollinations.ai fails", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("Pollinations API timeout"));
    harness.window.fetch = failingFetch;
    globalThis.fetch = failingFetch;

    harness.sb.functions.invoke = vi.fn().mockResolvedValue({
      data: { reply: "Edge function hardware recommendation." },
      error: null,
    });

    const reply = await harness.api.requestRemoteAdvisor("Need recommendation", []);
    expect(reply).toBe("Edge function hardware recommendation.");
    expect(harness.sb.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("Tier 3: Gracefully falls back to local advisor heuristics with PSU advice", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("Pollinations down"));
    harness.window.fetch = failingFetch;
    globalThis.fetch = failingFetch;
    harness.sb.functions.invoke = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("Supabase Edge Function down"),
    });

    const container = harness.document.getElementById("chat-messages-container");
    await harness.api.askHardwareAdvisor("Will 650W PSU handle RTX 4070?");

    const conversation = harness.api.chatbotConversation;
    expect(conversation.length).toBe(2);
    expect(conversation[1].content).toContain("PSU Check: Yes, a quality 650W PSU is sufficient for RTX 4070");

    const bubbles = container.querySelectorAll("div.whitespace-pre-line");
    expect(bubbles.length).toBe(2);
  });
});
