# TechPulse BD

> **Centralized Bangladesh PC Hardware Price Aggregator & Intelligence Engine**

TechPulse BD is a real-time hardware intelligence platform designed specifically for the Bangladeshi consumer technology ecosystem. It continuously crawls, aggregates, and benchmarks computer component pricing and inventory availability across major Bangladeshi computer markets (Elephant Road, Multiplan Center, IDB Bhaban) including **Star Tech**, **Ryans Computers**, **Tech Land**, **PC House**, **UCC**, and more.

---

## Key Features

### 1. Multi-Store Parametric Catalog & Price Radar
- **Live Dual-Price Detection**: Differentiates between spot cash/MFS discount pricing and card/POS credit pricing (typically 7–12% higher).
- **Arbitrage & Deal Detection**: Surfaces authentic price drops and liquidation bargains across stores using rolling price history data.
- **Deep Linking & Stock Auditing**: Instant inventory tracking with "Exclude Out of Stock" filtering.

### 2. Stateless Hardware Advisory Chatbot (RAG Engine)
- **Retrieval-Augmented Generation (RAG)**: Injects live database pricing, inventory, and vendor availability directly into AI prompts to prevent hallucinated prices.
- **Three-Tier Fallback Resilience**:
  1. *Primary*: Keyless public LLM endpoint via Pollinations.ai.
  2. *Secondary*: Supabase Edge Functions (`POST /functions/v1/hardware-assistant`).
  3. *Tertiary*: Deterministic offline rule tokenizer and compatibility validator.
- **Built-in Sizing & Sockets**: Instant checks for AM4 (DDR4), AM5 (DDR5), LGA1700 (DDR4/DDR5), and LGA1851 (Core Ultra 200 series DDR5) along with GPU-to-PSU wattage calculation.
- **Interactive Action Chips & Markdown**: 1-click `[View in Catalog]` and `[+ Add to Build Lab]` chips with safe, XSS-proof Markdown formatting.

### 3. PC Build Lab
- Real-time compatibility checker verifying motherboard socket, RAM generation, and wattage limits.
- Persistent configuration state synced to `localStorage`.

### 4. Live Hardware Pulse Analytics Grid
- Real-time visitor tracking via Supabase Realtime Presence (`online-users` channel).
- Live metrics grid displaying indexed SKU volume, 24-hour scraper refresh rates, and community feedback velocity.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Vanilla ES6 JavaScript, HTML5, Tailwind CSS, Lucide Icons, Chart.js |
| **Backend & Realtime** | Supabase PostgreSQL, Realtime Presence, Edge Functions, Row-Level Security (RLS) |
| **Scraper Subsystem** | Go 1.25, Colly, HTTP client with CDN image proxy and Wayback archive mirrors |
| **Testing & QA** | Vitest 5.1, JSDOM, Node.js security & E2E break test suites |

---

## Getting Started

### Prerequisites
- **Node.js**: v18.0 or higher (v24 LTS recommended)
- **Python 3**: For lightweight static server
- **Go**: 1.25+ (optional, required only for scraper development)

### Installation
```bash
# Clone the repository
git clone https://github.com/sh4dhub4b4/TechPulse-BD.git
cd TechPulse-BD

# Install dependencies
npm install
```

### Running the Web Application
```bash
# Launch local web server (defaults to http://localhost:5173)
npm start
```

### Building Tailored CSS
```bash
# Compile and minify Tailwind CSS styles
npm run build:css
```

---

## Testing & Quality Assurance

TechPulse BD employs a comprehensive multi-layered test suite:

```bash
# Run full Vitest unit & integration test suite (52 tests)
npm test

# Run chatbot-specific test suite
npx vitest run tests/chatbot.test.js

# Run E2E security, RLS, and penetration defenses
npm run test:security

# Run user perspective journey walkthrough
npm run test:e2e
```

### Test Coverage Highlights
- **`tests/chatbot.test.js`**: UI modal lifecycle, safe markdown parser, XSS sanitization, RAG catalog injection, multi-store comparison, PSU wattage advisor, and 3-tier fallback execution.
- **`tests/pulse_analytics.test.js`**: Realtime presence synchronization, metrics parsing, and URL cleaning.
- **`tests/ui_integration.test.js`**: Navigation hash switching, build lab state persistence, and DOM event delegation.
- **`tests/e2e_break_test.js`**: RLS gate verification, unauthenticated batch ingestion blocking, and ReDoS resistance.

---

## Documentation

- **[docs/CHATBOT_TEST_AND_ENHANCEMENT_REPORT.md](docs/CHATBOT_TEST_AND_ENHANCEMENT_REPORT.md)**: Detailed report of recent chatbot engineering upgrades and test matrices.
- **[docs/CHATBOT_ANALYTICS_PLAN_AND_DEFENSE.md](docs/CHATBOT_ANALYTICS_PLAN_AND_DEFENSE.md)**: System engineering plan, architectural contracts, and academic defense for the dual-price telemetry radar.
- **[docs/CHATBOT_PULSE_ISSUE_REPORT.md](docs/CHATBOT_PULSE_ISSUE_REPORT.md)**: Incident root cause analysis and resolution documentation.

---

## License

This project is developed as part of the Software Project Development and Defense curriculum. Distributed under the MIT License.
