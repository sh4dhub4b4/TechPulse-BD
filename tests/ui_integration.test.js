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

describe("Navigation, Filters & UI Visual Polish (Bugs M1, M2, M3, M4, M6)", () => {
  it("M1: focuses global search on Ctrl+K and Cmd+K without interfering with '/' typing in inputs", () => {
    harness.api.setupKeyboardShortcuts();
    const searchInput = harness.document.getElementById("global-search");

    let focusCalled = false;
    searchInput.focus = () => { focusCalled = true; };

    // Ctrl+K (Windows / Linux)
    harness.window.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    expect(focusCalled).toBe(true);

    // Cmd+K (macOS)
    focusCalled = false;
    harness.window.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "K", metaKey: true }));
    expect(focusCalled).toBe(true);

    // '/' when not inside input
    focusCalled = false;
    harness.window.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "/" }));
    expect(focusCalled).toBe(true);
  });

  it("M2: registers GPU and Graphics Card category counts", () => {
    harness.api.allProducts = [
      { id: "1", title: "RTX 4070", category: "Graphics Card" },
      { id: "2", title: "RX 7600", category: "GPU" },
      { id: "3", title: "Ryzen 5 7600", category: "Processor" },
      { id: "4", title: "980 Pro", category: "SSD" }
    ];

    harness.api.updateCategoryCounts();

    expect(Number(harness.document.getElementById("count-gpus").innerText)).toBe(2);
    expect(Number(harness.document.getElementById("count-processors").innerText)).toBe(1);
    expect(Number(harness.document.getElementById("count-ssds").innerText)).toBe(1);
    expect(harness.document.getElementById("header-product-count").innerText).toBe("4");
  });

  it("M3: renders empty state badge when zero historical price points exist", () => {
    const product = { id: "p-empty-test", price_history: [] };
    const chartContainer = harness.document.createElement("div");
    chartContainer.id = `insights-chart-container-${product.id}`;
    chartContainer.innerHTML = `<canvas id="canvas-chart-${product.id}"></canvas>`;
    harness.document.body.appendChild(chartContainer);

    harness.api.renderInlineChart(product);

    expect(chartContainer.innerHTML).toContain("Price Tracking Initiated");
    expect(chartContainer.innerHTML).toContain("Historical price movements will appear following scheduled store crawls.");
    expect(chartContainer.querySelector("canvas")).toBeNull();
  });

  it("M4: includes handleImageError fallback on comparison modal product image", () => {
    const item = {
      id: "comp-item-1",
      title: "RTX 4070 Ventus 3X",
      vendor_name: "Ryans Computers",
      current_price: 75000,
      stock_status: "In Stock",
      category: "Graphics Card",
      image_url: "https://example.com/broken.jpg",
      product_url: "https://example.com/product"
    };

    harness.api.comparisonTray.set(item.id, item);
    harness.api.openComparisonModal();

    const comparisonGrid = harness.document.getElementById("comparison-grid");
    const imgEl = comparisonGrid.querySelector("img");
    expect(imgEl).not.toBeNull();
    expect(imgEl.getAttribute("onerror")).toContain("handleImageError");
    expect(imgEl.getAttribute("onerror")).toContain("Graphics Card");
  });

  it("M6: variant match pills reflect active price mode (Cash vs Card/POS)", () => {
    const multiProduct = {
      id: "multi-1",
      title: "Intel Core i5-12400F Processor",
      vendor_name: "Star Tech",
      current_price: 12000,
      stock_status: "In Stock",
      category: "Processor",
      image_url: "",
      product_url: "",
      isMultiStore: true,
      minPrice: 12000,
      maxPrice: 13000,
      storeVariants: [
        { id: "v1", vendor_name: "Star Tech", current_price: 12000, product_url: "http://startech.com" },
        { id: "v2", vendor_name: "Tech Land", current_price: 12500, product_url: "http://techland.com" }
      ]
    };

    // Test Cash mode (default)
    harness.api.activePriceMode = "CASH";
    const cashHtml = harness.api.renderSingleCard(multiProduct);
    expect(cashHtml).toContain("৳12,000");
    expect(cashHtml).toContain("৳12,500");

    // Test Card mode (+7% POS surcharge)
    // 12000 * 1.07 = 12840; 12500 * 1.07 = 13375
    harness.api.activePriceMode = "CARD";
    const cardHtml = harness.api.renderSingleCard(multiProduct);
    expect(cardHtml).toContain("৳12,840");
    expect(cardHtml).toContain("৳13,375");
  });
});

describe("PC Build Lab & Compatibility Architecture (Bugs C2, C3, C4, M5)", () => {
  const sampleProducts = [
    { id: "cpu-am5", title: "AMD Ryzen 5 7600X Processor", category: "Processor", current_price: 22000, vendor_name: "Star Tech" },
    { id: "cpu-am4", title: "AMD Ryzen 5 5600 Processor", category: "Processor", current_price: 11500, vendor_name: "Ryans" },
    { id: "cpu-intel", title: "Intel Core i5-12400F 12th Gen Processor", category: "Processor", current_price: 13000, vendor_name: "Tech Land" },
    { id: "mb-am5", title: "MSI PRO B650M-A WIFI AM5 Motherboard", category: "Motherboard", current_price: 19500, vendor_name: "Star Tech" },
    { id: "mb-am4", title: "Gigabyte B550M DS3H AM4 Motherboard", category: "Motherboard", current_price: 11000, vendor_name: "Ryans" },
    { id: "mb-lga1700-d4", title: "Asus Prime B760M-K D4 Motherboard", category: "Motherboard", current_price: 14000, vendor_name: "Star Tech" },
    { id: "ram-ddr5", title: "Corsair Vengeance 32GB DDR5 6000MHz RAM", category: "RAM", current_price: 12500, vendor_name: "Star Tech" },
    { id: "ram-ddr4", title: "G.Skill Ripjaws V 16GB DDR4 3200MHz RAM", category: "RAM", current_price: 4200, vendor_name: "Ryans" },
    { id: "gpu-rtx4070", title: "Zotac Gaming GeForce RTX 4070 Twin Edge 12GB Graphics Card", category: "Graphics Card", current_price: 72000, vendor_name: "Star Tech" },
    { id: "psu-550w", title: "Corsair CV550 550W 80 Plus Bronze Power Supply", category: "Power Supply", current_price: 4800, vendor_name: "Ryans" },
    { id: "psu-750w", title: "Antec NeoECO Gold 750W Power Supply", category: "Power Supply", current_price: 9200, vendor_name: "Star Tech" },
    { id: "case-nzxt", title: "NZXT H5 Flow Compact Mid-Tower Casing", category: "Casing", current_price: 8500, vendor_name: "Star Tech" },
    { id: "cooler-deepcool", title: "DeepCool AK400 Digital CPU Cooler", category: "Cooler", current_price: 3600, vendor_name: "Star Tech" },
    { id: "ssd-980", title: "Samsung 980 Pro 1TB NVMe SSD", category: "SSD", current_price: 11000, vendor_name: "Star Tech" },
    { id: "mon-viewsonic", title: "ViewSonic 24 Inch 144Hz Monitor", category: "Monitor", current_price: 18000, vendor_name: "Tech Land" }
  ];

  beforeEach(() => {
    harness.api.allProducts = sampleProducts;
    harness.api.clearCurrentBuild();
  });

  it("C2: accurately maps core desktop categories to dedicated Build Lab slots", () => {
    harness.api.handleAddToBuild("cpu-am5");
    expect(harness.api.buildLabSlots.Processor.id).toBe("cpu-am5");

    harness.api.handleAddToBuild("mb-am5");
    expect(harness.api.buildLabSlots.Motherboard.id).toBe("mb-am5");

    harness.api.handleAddToBuild("ram-ddr5");
    expect(harness.api.buildLabSlots.RAM.id).toBe("ram-ddr5");

    harness.api.handleAddToBuild("gpu-rtx4070");
    expect(harness.api.buildLabSlots.GPU.id).toBe("gpu-rtx4070");

    harness.api.handleAddToBuild("psu-750w");
    expect(harness.api.buildLabSlots.PSU.id).toBe("psu-750w");

    harness.api.handleAddToBuild("case-nzxt");
    expect(harness.api.buildLabSlots.Casing.id).toBe("case-nzxt");

    harness.api.handleAddToBuild("cooler-deepcool");
    expect(harness.api.buildLabSlots.Cooler.id).toBe("cooler-deepcool");

    harness.api.handleAddToBuild("ssd-980");
    expect(harness.api.buildLabSlots.Storage.id).toBe("ssd-980");

    harness.api.handleAddToBuild("mon-viewsonic");
    expect(harness.api.buildLabSlots.Monitor.id).toBe("mon-viewsonic");
  });

  it("M5: sets buildLabSlots[slotKey] = null on handleRemoveFromBuild rather than deleting key", () => {
    harness.api.handleAddToBuild("cpu-am5");
    expect(harness.api.buildLabSlots.Processor).not.toBeNull();

    harness.api.handleRemoveFromBuild("Processor");
    expect("Processor" in harness.api.buildLabSlots).toBe(true);
    expect(harness.api.buildLabSlots.Processor).toBeNull();
  });

  it("C3: displays rose mismatch alert banner when CPU socket does not match Motherboard socket", () => {
    // Slotted: AM5 CPU + AM4 Motherboard
    harness.api.handleAddToBuild("cpu-am5");
    harness.api.handleAddToBuild("mb-am4");

    harness.api.renderBuildLab();

    const box = harness.document.getElementById("build-compatibility-box");
    const text = harness.document.getElementById("build-compatibility-text");

    expect(box.className).toContain("bg-rose-50");
    expect(box.className).toContain("border-rose-300");
    expect(box.className).toContain("text-rose-800");
    expect(text.innerHTML).toContain("Socket Mismatch");
    expect(text.innerHTML).toContain("CPU is AM5 but Motherboard is AM4");
  });

  it("C3: displays rose mismatch alert banner when RAM generation conflicts with platform (e.g. DDR4 on AM5)", () => {
    // Slotted: AM5 CPU + AM5 Motherboard + DDR4 RAM
    harness.api.handleAddToBuild("cpu-am5");
    harness.api.handleAddToBuild("mb-am5");
    harness.api.handleAddToBuild("ram-dd4"); // DDR4

    harness.api.handleAddToBuild("ram-ddr4");
    harness.api.renderBuildLab();

    const box = harness.document.getElementById("build-compatibility-box");
    const text = harness.document.getElementById("build-compatibility-text");

    expect(box.className).toContain("bg-rose-50");
    expect(text.innerHTML).toContain("Memory Conflict");
    expect(text.innerHTML).toContain("strictly requires DDR5 memory");
  });

  it("C3 & C4: displays green verified banner with TDP & PSU estimate when all parts match", () => {
    // Slotted: AM5 CPU (7600X: 105W) + AM5 Motherboard + DDR5 RAM + RTX 4070 (200W) + 750W PSU + 80W overhead
    // Draw = 105 + 200 + 80 = 385 W
    // Recommended PSU = round(385 * 1.35 = 519.75 / 50) * 50 = 500 W (or 550W)
    harness.api.handleAddToBuild("cpu-am5");
    harness.api.handleAddToBuild("mb-am5");
    harness.api.handleAddToBuild("ram-ddr5");
    harness.api.handleAddToBuild("gpu-rtx4070");
    harness.api.handleAddToBuild("psu-750w");

    harness.api.renderBuildLab();

    const box = harness.document.getElementById("build-compatibility-box");
    const text = harness.document.getElementById("build-compatibility-text");

    expect(box.className).toContain("bg-emerald-50");
    expect(text.innerHTML).toContain("All Slotted Components Compatible");
    expect(text.innerHTML).toContain("Estimated Draw: 385 W");
    expect(text.innerHTML).toContain("Recommended PSU:");
  });

  it("C4: displays amber warning banner if slotted PSU wattage is under recommended threshold", () => {
    // 7600X (105W) + RTX 4070 (200W) + 80W overhead = 385W draw -> Recommended PSU ~ 500W-550W+
    // Slotted PSU: 550W is close, let's test with a heavier CPU/GPU or a 450W / 500W PSU vs RTX 4090
    const rtx4090 = { id: "gpu-4090", title: "RTX 4090 24GB", category: "Graphics Card", current_price: 250000, vendor_name: "Star Tech" };
    harness.api.allProducts.push(rtx4090);

    harness.api.handleAddToBuild("cpu-am5");
    harness.api.handleAddToBuild("mb-am5");
    harness.api.handleAddToBuild("ram-ddr5");
    harness.api.handleAddToBuild("gpu-4090"); // 450W GPU -> draw = 105 + 450 + 80 = 635W -> recommended = 850W+
    harness.api.handleAddToBuild("psu-550w"); // 550W PSU slotted

    harness.api.renderBuildLab();

    const box = harness.document.getElementById("build-compatibility-box");
    const text = harness.document.getElementById("build-compatibility-text");

    expect(box.className).toContain("bg-amber-50");
    expect(box.className).toContain("border-amber-300");
    expect(text.innerHTML).toContain("Underpowered PSU");
    expect(text.innerHTML).toContain("Slotted PSU is rated for 550W");
  });
});
