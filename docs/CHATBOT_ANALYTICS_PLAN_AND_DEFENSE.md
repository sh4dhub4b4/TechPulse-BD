# System Engineering Plan: Stateless AI Assistant & Live Hardware Pulse Analytics

**Document Version:** 1.0.0  
**Project:** TechPulse BD  
**Target Environment:** Vanilla ES6 / Supabase Edge Functions / PostgreSQL  

---

## 1. Executive Summary & Architecture Overview

This document specifies the exact architecture, interface contracts, implementation steps, and validation test suites for two major platform expansions:
1. **Stateless Hardware Advisory Chatbot**: A zero-session-overhead, client-orchestrated query interface designed to assist users with hardware compatibility, pricing queries, and budget recommendations without persistent server-side conversation state.
2. **Live Hardware Pulse Analytics Grid**: A reactive metrics dashboard placed below the Buyer Feedback ticker that aggregates platform health, ingestion telemetry, user activity, and rolling 1-hour community velocity.

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT (BROWSER)                                 |
|                                                                                   |
|  +---------------------------+                      +--------------------------+  |
|  | Floating Chatbot Drawer   |                      | Live Pulse Metrics Grid  |  |
|  | - Markdown renderer       |                      | - Active Users (Channel) |  |
|  | - Context bundle builder  |                      | - 1h Feedback Velocity   |  |
|  | - Fallback client engine  |                      | - Scrape Sync Rate (24h) |  |
|  +-------------+-------------+                      +-------------+------------+  |
|                |                                                  |               |
+----------------|--------------------------------------------------|---------------+
                 |                                                  |
                 v                                                  v
+----------------------------------+              +---------------------------------+
|   SUPABASE EDGE FUNCTION / API   |              |        SUPABASE POSTGRESQL      |
|   `POST /functions/v1/chat`      |              |                                 |
|   - Stateless Prompt Synthesis   |              | - Realtime Presence Channels    |
|   - Hardware Catalog Vector/Text |              | - RPC: `get_platform_metrics()` |
|   - Token budget truncation      |              | - Rolling 1h window filters     |
+----------------------------------+              +---------------------------------+
```

---

## 2. Stateless Chatbot Specification

### 2.1 Architectural Philosophy: Why Stateless?
- **Zero Memory Leaks & Zero Session DB Overhead**: No session IDs, thread tables, or Redis cache instances required.
- **Client-Curated Context**: The browser passes the user query along with an ephemeral snapshot of the active state (e.g., currently viewed category, active PC Build Lab parts list, or search filters).
- **Graceful Offline/Local Fallback**: If the external LLM endpoint is unreachable or throttled, the client falls back to a deterministic rule-based tokenizer (matching socket compatibility, price ranges, and store availability).

### 2.2 Edge Function Contract
- **Endpoint**: `POST /functions/v1/hardware-assistant`
- **Headers**: `Content-Type: application/json`, `apikey: <ANON_KEY>`
- **Request Payload**:
```json
{
  "query": "Is Ryzen 7600 compatible with B650 motherboard under 25000 BDT?",
  "context": {
    "activeCategory": "Processor",
    "selectedComponents": [
      { "slot": "Motherboard", "title": "MSI PRO B650M-A WIFI", "price": 21500 }
    ],
    "priceMode": "CASH"
  }
}
```
- **Response Payload**:
```json
{
  "reply": "Yes, AMD Ryzen 5 7600 utilizes the AM5 socket which is natively compatible with the MSI PRO B650M-A WIFI motherboard. Best cash price in Dhaka is currently ~৳23,500 at Star Tech.",
  "suggestedActions": [
    { "label": "View Ryzen 7600", "action": "filter", "payload": "Ryzen 7600" },
    { "label": "Add to Build Lab", "action": "add_slot", "slot": "Processor" }
  ],
  "latencyMs": 420
}
```

---

## 3. Live Pulse Analytics Specification

### 3.1 Metrics To Display
Located directly underneath the `Live Buyer Feedback & Store Reviews Ticker Grid` in `web/index.html`:
1. **Active Explorers (Online Now)**: Derived from Supabase Realtime Presence (`channel: 'online-users'`).
2. **Catalog Hardware Tracked**: Total count of active indexed SKUs in `products`.
3. **Price Refreshes (24h)**: Total records updated or inserted in `price_history` within the past 24 hours.
4. **Community Feedback Velocity (1h)**: Count of reviews and forum posts submitted with `created_at > NOW() - INTERVAL '1 hour'`.

### 3.2 Database Aggregate Function (RPC)
```sql
CREATE OR REPLACE FUNCTION get_hardware_pulse_metrics()
RETURNS TABLE (
  total_products BIGINT,
  updated_today BIGINT,
  feedback_last_hour BIGINT
) 
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM products WHERE stock_status != 'Discontinued') AS total_products,
    (SELECT COUNT(*) FROM products WHERE last_scraped_at >= NOW() - INTERVAL '24 hours') AS updated_today,
    (
      (SELECT COUNT(*) FROM comments WHERE created_at >= NOW() - INTERVAL '1 hour') +
      (SELECT COUNT(*) FROM community_posts WHERE created_at >= NOW() - INTERVAL '1 hour')
    ) AS feedback_last_hour;
$$;
```

---

## 4. Bigpickle Execution Prompts

Use the following engineered prompts sequentially in any advanced agentic coding environment to implement and verify these features.

### Prompt 1: Analytics Subsystem & Real-Time Presence
````text
[ROLE]: Senior Full-Stack Engineer & Database Architect
[TASK]: Implement the Live Hardware Pulse Analytics Grid in TechPulse BD underneath the Buyer Feedback section.

[REQUIREMENTS]:
1. Database RPC:
   - Create a migration file in `supabase/migrations/` defining `get_hardware_pulse_metrics()` that calculates:
     a) `total_products` (active SKUs)
     b) `updated_today` (products with `last_scraped_at >= NOW() - INTERVAL '24 hours'`)
     c) `feedback_last_hour` (sum of comments + community_posts with `created_at >= NOW() - INTERVAL '1 hour'`)
   - Grant execution on the RPC to `anon` and `authenticated` roles.

2. Frontend UI (`web/index.html`):
   - Directly underneath the container `#live-reviews-ticker` inside the Buyer Feedback section, insert a 4-card KPI metric grid (`#hardware-pulse-analytics`).
   - Cards must strictly follow the existing minimalist theme tokens:
     * Background: `bg-white`, Border: `border border-slate-200/80`, Padding: `p-3`, Rounded: `rounded-md`, Shadow: `shadow-2xs`.
     * Card 1: Active Builders Online (Realtime green indicator dot + counter `#pulse-active-users`).
     * Card 2: Monitored Hardware (`#pulse-total-skus`).
     * Card 3: Price Updates (24h) (`#pulse-updated-24h`).
     * Card 4: Feedback Activity (Past 1h) (`#pulse-velocity-1h`).
   - Zero design drift: Maintain existing Inter/JetBrains Mono typography and exact border styling.

3. Frontend JavaScript (`web/app.js`):
   - Initialize Supabase Realtime Presence channel `pulse-presence` using anonymous client session ID to track live active users.
   - Fetch initial metrics from `sb.rpc('get_hardware_pulse_metrics')`.
   - Update UI DOM numbers with formatted localized numbers.
   - Refresh metrics every 60 seconds without full page reload.
````

### Prompt 2: Stateless Hardware Advisory Chatbot
````text
[ROLE]: Frontend UI/UX Specialist & LLM Integration Engineer
[TASK]: Build a high-performance, stateless hardware advisory chatbot widget for TechPulse BD.

[REQUIREMENTS]:
1. Stateless Architecture:
   - Zero local storage or database conversation persistence.
   - Conversation array exists purely in browser memory during session.
   - Each outbound LLM prompt sends:
     * System prompt with BD hardware pricing conventions (Cash vs POS Card, Elephant Road / IDB / Multiplan hubs, Socket compatibility rules for AM4/AM5/LGA1700).
     * The last 2 query-reply turns for minimal immediate co-reference.
     * Active user context (current category, search keyword, items currently in PC Build Lab).

2. UI & Interaction:
   - Floating action trigger button at bottom-right (`#btn-chatbot-trigger`) styled as a sleek dark button (`bg-slate-900 text-white rounded-full p-3 shadow-xl`).
   - Collapsible slide-out drawer / modal dialog (`#hardware-chat-modal`) with:
     * Header with status indicator ("Stateless Advisor • Live") and close button.
     * Scrollable conversation area (`#chat-messages-container`, with `custom-scrollbar`).
     * Quick preset prompts: "Recommend AM5 build under 70k", "Star Tech vs Ryans cash price for 7600X", "Will 650W PSU handle RTX 4070?".
     * Input form (`#chat-input`, `#btn-chat-send`) with Enter-to-send and disabled state while querying.
   - Integrate with `setModalScrollLock` to avoid background jitter when open on mobile devices.

3. Deterministic Fallback Engine:
   - If Supabase Edge Function is unavailable or key is exhausted, execute local regex heuristic parser:
     * Match processor sockets ("AM5" -> DDR5 only, "AM4" -> DDR4, "LGA1700" -> DDR4/DDR5).
     * Search `allProducts` array for query keywords and return top 3 cash bargains directly in the chat.
````

### Prompt 3: Unit & Integration Verification Suite
````text
[ROLE]: QA Automation Engineer & Test Specialist
[TASK]: Create automated unit and integration tests for both the Stateless Chatbot and Analytics subsystems.

[REQUIREMENTS]:
1. Unit Tests (`tests/pulse_analytics.test.js`):
   - Test `get_hardware_pulse_metrics` data parser:
     * Validates handling of zero counts, nulls, and high-volume numbers.
     * Verifies aggregation of comments + posts into 1-hour feedback velocity.
   - Test URL unwrapper / sanitizer against all Wayback formats.
   - Test chatbot fallback heuristic logic:
     * Verify AM5 socket incompatibility flags DDR4 RAM.
     * Verify budget query filters products by `current_price <= budget`.

2. Integration & DOM Tests (`tests/ui_integration.test.js`):
   - Test presence channel subscribe and unsubscribe lifecycle without memory leak.
   - Test modal opening locks `document.body.classList.contains('overflow-hidden')` and unlocks upon closing.
   - Test chatbot drawer open/close/escape key dismissal.
   - Run via headless Node/JSDOM test runner (e.g. `npx vitest run`).
````

---

## 5. Automated Test Suite Templates

### 5.1 Unit Tests (`tests/pulse_unit.test.js`)
```javascript
import { describe, it, expect } from "vitest";

// Heuristic fallback tester
function evaluateHardwareCompatibility(cpuSocket, ramType) {
  if (cpuSocket === "AM5" && ramType === "DDR4") {
    return { compatible: false, reason: "AM5 platform strictly requires DDR5 memory." };
  }
  if (cpuSocket === "AM4" && ramType === "DDR5") {
    return { compatible: false, reason: "AM4 platform only supports DDR4 memory." };
  }
  return { compatible: true, reason: "Electrically and physically compatible." };
}

// 1-Hour Rolling Activity Calculator
function calculateOneHourVelocity(records, currentTime) {
  const oneHourAgo = new Date(currentTime.getTime() - 60 * 60 * 1000);
  return records.filter(r => new Date(r.created_at) >= oneHourAgo).length;
}

describe("Stateless Assistant Logic", () => {
  it("flags AM5 and DDR4 as incompatible", () => {
    const result = evaluateHardwareCompatibility("AM5", "DDR4");
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain("strictly requires DDR5");
  });

  it("permits AM5 and DDR5 as compatible", () => {
    const result = evaluateHardwareCompatibility("AM5", "DDR5");
    expect(result.compatible).toBe(true);
  });
});

describe("Analytics 1-Hour Velocity Calculator", () => {
  it("counts only events within the last 60 minutes", () => {
    const now = new Date("2026-11-03T16:00:00Z");
    const mockEvents = [
      { id: 1, created_at: "2026-11-03T15:45:00Z" }, // 15 mins ago (Valid)
      { id: 2, created_at: "2026-11-03T15:05:00Z" }, // 55 mins ago (Valid)
      { id: 3, created_at: "2026-11-03T14:30:00Z" }, // 90 mins ago (Expired)
    ];
    const velocity = calculateOneHourVelocity(mockEvents, now);
    expect(velocity).toBe(2);
  });
});
```

### 5.2 Integration Tests (`tests/ui_integration.test.js`)
```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

describe("DOM & Modal Scroll Lock Integration", () => {
  let dom, document, window;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <body>
        <div id="chat-modal" class="hidden"></div>
        <div id="review-modal" class="hidden"></div>
      </body>
    `);
    document = dom.window.document;
    window = dom.window;
  });

  function setModalScrollLock(isLocked) {
    if (isLocked) {
      document.body.classList.add("overflow-hidden");
    } else {
      const open = document.querySelectorAll("#chat-modal:not(.hidden), #review-modal:not(.hidden)");
      if (open.length === 0) {
        document.body.classList.remove("overflow-hidden");
      }
    }
  }

  it("applies overflow-hidden when a modal opens and removes it when closed", () => {
    const chatModal = document.getElementById("chat-modal");
    
    // Open modal
    chatModal.classList.remove("hidden");
    setModalScrollLock(true);
    expect(document.body.classList.contains("overflow-hidden")).toBe(true);

    // Close modal
    chatModal.classList.add("hidden");
    setModalScrollLock(false);
    expect(document.body.classList.contains("overflow-hidden")).toBe(false);
  });
});
```

---

## 6. Academic Defense: Justification for the `Price Radar` Tab

If your academic supervisor deducted marks for the **Price Radar** feature, use the following structured points during your evaluation or project report:

### 1. Market-Specific Problem Statement (The Bangladeshi Dual-Pricing Asymmetry)
In standard e-commerce markets, the price displayed is the price paid. However, in the **Bangladeshi Computer Hardware Ecosystem (Elephant Road, Multiplan Center, IDB Bhaban)**, retailers operate under a **dual-tier pricing structure**:
- **Cash / MFS (bKash/Nagad) Discount Price**: A discounted figure (often 7% to 12% below list price) offered exclusively for direct bank transfers or cash transactions.
- **Card POS / EMI List Price**: The official MRP used when swiping credit cards or enrolling in 6-to-12-month installment loans (0% EMI charges are absorbed into higher retail card prices).

Standard catalogs only display one static number. The **Price Radar** isolates this pricing asymmetry, dynamically calculating the spread between cash discounts and credit POS charges so buyers know their true out-of-pocket expenditure before visiting physical markets.

### 2. Algorithmic Deal Arbitrage Detection
The Price Radar does not merely mirror the catalog; it acts as an **algorithmic anomaly filter**:
- **Margin Spread Calculation**: It computes the delta between regular reference pricing and spot cash pricing:
  $$\Delta = P_{\text{regular}} - P_{\text{cash}}$$
- **Time-Decay Auditing**: It correlates historical price updates (`price_history`) to identify products that have experienced rapid downward price shifts within recent scraping cycles, surfacing true clearances rather than marketing gimmicks.

### 3. Separation of Concerns (UI/UX Engineering)
- **Catalog Tab**: Optimized for **parametric exploration** (searching sockets, form factors, RAM types, and component compatibility).
- **Price Radar Tab**: Optimized for **financial decision-making and arbitrage** (ranking hardware by maximum instant savings, vendor price differentials, and stock volatility).
- Combining both into one single view creates cognitive clutter. Dedicating a tab to financial price telemetry follows the established user experience models of global price aggregators (e.g., **Idealo**, **Geizhals**, and **CamelCamelCamel**).
