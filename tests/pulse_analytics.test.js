// tests/pulse_analytics.test.js
// Unit tests for the Live Hardware Pulse metrics parser, the SQL aggregation
// behind it, URL unwrapping/sanitizing, and the chatbot fallback heuristics.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAppHarness } from "./helpers/app_harness.js";

const MIGRATION_PATH = fileURLToPath(
  new URL("../supabase/migrations/20261103000000_hardware_pulse_metrics.sql", import.meta.url)
);

const PRODUCTS = [
  { id: "1", title: "AMD Ryzen 5 7600X Processor", vendor_name: "Star Tech", category: "Processor", current_price: 17000 },
  { id: "2", title: "AMD Ryzen 5 8500G 6 Core AM5 Processor", vendor_name: "Tech Land", category: "Processor", current_price: 13500 },
  { id: "3", title: "Intel Core i5 12400F Processor", vendor_name: "Ryans", category: "Processor", current_price: 12000 },
  { id: "4", title: "AMD Ryzen 9 7950X AM5 Processor", vendor_name: "Star Tech", category: "Processor", current_price: 78000 },
  { id: "5", title: "Corsair Vengeance 16GB DDR5 Desktop RAM", vendor_name: "Star Tech", category: "RAM", current_price: 6500 },
  { id: "6", title: "G.Skill Ripjaws 16GB DDR4 Desktop RAM", vendor_name: "Ryans", category: "RAM", current_price: 3800 },
  { id: "7", title: "Samsung 980 Pro 1TB NVMe SSD", vendor_name: "Star Tech", category: "SSD", current_price: 9500 },
  { id: "8", title: "Premium RTX 4070 Graphics Card", vendor_name: "Tech Land", category: "Graphics Card", current_price: 72000 },
];

let harness;

beforeEach(() => {
  harness = createAppHarness();
});

afterEach(() => {
  harness.cleanup();
});

function seedCatalog(items = PRODUCTS) {
  harness.api.allProducts = items;
}

describe("parseHardwarePulseMetrics", () => {
  it("normalizes zero, null and numeric string counts", () => {
    const metrics = harness.api.parseHardwarePulseMetrics([
      { total_products: 0, updated_today: null, feedback_last_hour: "42" },
    ]);

    expect(metrics).toEqual({
      total_products: 0,
      updated_today: 0,
      feedback_last_hour: 42,
    });
  });

  it("accepts a bare row object as well as the RPC array shape", () => {
    const metrics = harness.api.parseHardwarePulseMetrics({
      total_products: 3120,
      updated_today: 88,
      feedback_last_hour: 7,
    });

    expect(metrics).toEqual({ total_products: 3120, updated_today: 88, feedback_last_hour: 7 });
  });

  it("returns null when the RPC returns no rows", () => {
    expect(harness.api.parseHardwarePulseMetrics([])).toBeNull();
    expect(harness.api.parseHardwarePulseMetrics(null)).toBeNull();
    expect(harness.api.parseHardwarePulseMetrics(undefined)).toBeNull();
  });

  it("clamps negative and non-numeric counts to zero", () => {
    const metrics = harness.api.parseHardwarePulseMetrics([
      { total_products: -5, updated_today: "not-a-number", feedback_last_hour: NaN },
    ]);

    expect(metrics).toEqual({ total_products: 0, updated_today: 0, feedback_last_hour: 0 });
  });

  it("keeps high-volume counts finite and floors fractional values", () => {
    const metrics = harness.api.parseHardwarePulseMetrics([
      { total_products: 987654321, updated_today: "1234567", feedback_last_hour: 99.9 },
    ]);

    expect(metrics).toEqual({ total_products: 987654321, updated_today: 1234567, feedback_last_hour: 99 });
  });

  it("renders high-volume metrics with locale separators", async () => {
    harness.sb.rpc = async () => ({
      data: [{ total_products: 1234567, updated_today: 42, feedback_last_hour: 3 }],
      error: null,
    });

    await harness.api.fetchHardwarePulseMetrics();

    const total = harness.document.getElementById("pulse-total-skus");
    expect(total.innerText).toBe((1234567).toLocaleString());
    expect(harness.document.getElementById("pulse-updated-24h").innerText).toBe("42");
    expect(harness.document.getElementById("pulse-velocity-1h").innerText).toBe("3");
  });
});

describe("get_hardware_pulse_metrics SQL aggregation", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("sums comments and community posts created within the last hour", () => {
    expect(sql).toMatch(/FROM\s+public\.comments\s+WHERE\s+created_at\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'1 hour'/i);
    expect(sql).toMatch(/FROM\s+public\.community_posts\s+WHERE\s+created_at\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'1 hour'/i);

    const feedbackBlock = sql.slice(sql.indexOf("feedback_last_hour"));
    expect(feedbackBlock).toMatch(/comments[\s\S]*\+\s*\(\s*SELECT COUNT\(\*\) FROM public\.community_posts/i);
  });

  it("counts the catalog and the last 24 hours of scraper updates", () => {
    expect(sql).toMatch(/SELECT COUNT\(\*\) FROM public\.products/i);
    expect(sql).toMatch(/last_scraped_at\s*>=\s*NOW\(\)\s*-\s*INTERVAL\s*'24 hours'/i);
  });

  it("grants execution to anonymous and authenticated clients", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_hardware_pulse_metrics\(\) TO anon, authenticated;/i);
  });
});

describe("Wayback URL unwrapping and sanitizing", () => {
  it("strips every archived prefix format used by the scrapers", () => {
    const unwrap = harness.api.cleanProductUrl;

    expect(
      unwrap("https://web.archive.org/web/20261015023927/https://www.ryans.com/storage/products/a.jpg")
    ).toBe("https://www.ryans.com/storage/products/a.jpg");

    expect(
      unwrap("https://web.archive.org/web/20260000000000id_/https://www.ryans.com/storage/products/b.jpg")
    ).toBe("https://www.ryans.com/storage/products/b.jpg");

    expect(
      unwrap("https://web.archive.org/web/20260505191404_id/https://www.ryans.com/storage/products/c.jpg")
    ).toBe("https://www.ryans.com/storage/products/c.jpg");

    expect(
      unwrap("https://web.archive.org/web/20261015023927if_/http://example.com/a?b=1&c=2")
    ).toBe("http://example.com/a?b=1&c=2");
  });

  it("leaves live vendor URLs untouched and returns empty for blanks", () => {
    const unwrap = harness.api.cleanProductUrl;

    expect(unwrap("https://www.startech.com.bd/amd-ryzen-5-7600x")).toBe(
      "https://www.startech.com.bd/amd-ryzen-5-7600x"
    );
    expect(unwrap("")).toBe("");
    expect(unwrap(null)).toBe("");
    expect(unwrap(undefined)).toBe("");
  });

  it("normalizes protocol-relative and scheme-less image URLs", () => {
    const sanitize = harness.api.sanitizeUrl;

    expect(sanitize("  https://cdn.example.com/img/a.png  ")).toBe("https://cdn.example.com/img/a.png");
    expect(sanitize("//cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(sanitize("://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });

  it("rejects non-http(s) and malformed URLs", () => {
    const sanitize = harness.api.sanitizeUrl;

    expect(sanitize("javascript:alert(1)")).toBe("");
    expect(sanitize("data:image/svg+xml;base64,abc")).toBe("");
    expect(sanitize("not a url")).toBe("");
    expect(sanitize("")).toBe("");
  });

  it("proxies Ryans assets through the Wayback mirror resizer", () => {
    const proxied = harness.api.sanitizeUrl("https://www.ryans.com/storage/products/x.jpg");

    expect(proxied.startsWith("https://images.weserv.nl/?url=")).toBe(true);

    const mirrored = decodeURIComponent(proxied.split("?url=")[1]);
    expect(mirrored).toContain("https://web.archive.org/web/20260000000000id_/");
    expect(mirrored).toContain("https://www.ryans.com/storage/products/x.jpg");
  });
});

describe("chatbot fallback heuristics", () => {
  it("flags DDR4 as incompatible with AM5", () => {
    seedCatalog();
    const reply = harness.api.buildLocalAdvisorReply("Is AM5 compatible with DDR4 under 50k?");

    expect(reply).toContain("AM5 memory rule: DDR5 memory only.");
    expect(reply).toContain("Compatibility: DDR4 will not work on AM5.");
    expect(reply).not.toContain("will not work on AM4");
  });

  it("flags DDR5 as incompatible with AM4 and allows both on LGA1700", () => {
    seedCatalog();

    expect(harness.api.buildLocalAdvisorReply("Can I use DDR5 on AM4?")).toContain(
      "Compatibility: DDR5 will not work on AM4."
    );
    expect(harness.api.buildLocalAdvisorReply("Will LGA1700 take DDR5?")).toContain(
      "Compatibility: DDR5 works only if the chosen LGA1700 motherboard supports it."
    );
  });

  it("filters products by current_price <= budget, including the boundary", () => {
    seedCatalog();

    const atBoundary = harness.api.findChatProducts("processor under 12k");
    expect(atBoundary.map((p) => p.id)).toEqual(["3"]);
    expect(atBoundary[0].current_price).toBe(12000);

    const am5 = harness.api.findChatProducts("AM5 under 50k");
    expect(am5.length).toBeGreaterThan(0);
    expect(am5.every((p) => Number(p.current_price) <= 50000)).toBe(true);
    expect(am5.some((p) => Number(p.current_price) === 78000)).toBe(false);
  });

  it("reports no matching SKUs when the model is outside the catalog", () => {
    seedCatalog();
    const reply = harness.api.buildLocalAdvisorReply("RTX 5090 under 50k");

    expect(reply).toContain("No matching SKUs");
    expect(reply).not.toContain("Top cash bargains");
    expect(reply).toContain("৳50,000");
  });

  it("extracts BDT budgets in k, thousand and lakh units", () => {
    const parse = harness.api.parseChatBudget;

    expect(parse("AM5 build under 70k")).toBe(70000);
    expect(parse("monitor within 25 thousand")).toBe(25000);
    expect(parse("budget of 1.5 lakh")).toBe(150000);
    expect(parse("no budget here")).toBeNull();
  });
});
