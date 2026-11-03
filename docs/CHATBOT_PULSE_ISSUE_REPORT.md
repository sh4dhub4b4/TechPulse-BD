# Incident Report — Chatbot Trigger Error & Missing Live Pulse Analytics

Date: 2026-11-03
Build: `web/` (`index.html`, `app.js`, `style.min.css`)

---

## 1. Problem statement

### 1.1 Reported error

Clicking the floating chatbot button (`#btn-chatbot-trigger`) repeatedly threw:

```
Uncaught ReferenceError: toggleHardwareChat is not defined
    at HTMLButtonElement.onclick
```

The button markup is plain HTML:

```html
<!-- web/index.html:762-764 -->
<button id="btn-chatbot-trigger" onclick="toggleHardwareChat()">
```

The function is defined in `web/app.js:1865` as a top-level function declaration, so it should be a global
and be reachable from the inline `onclick`.

### 1.2 Reported missing section

No analytics block appears below the "Recent Buyer Feedback & Store Reviews" section.

---

## 2. Root cause

### 2.1 Chatbot error — stale cached `app.js`

The HTML and the JavaScript in the browser were from different releases:

| Asset | State in the failing browser |
| --- | --- |
| `index.html` | New — contains `#btn-chatbot-trigger` (added with the chatbot feature) |
| `app.js` | Old — cached copy from before the chatbot feature, with no `toggleHardwareChat` |

Evidence:

- The pre-chatbot commit `9a4bf80` has **no** `toggleHardwareChat` in `web/app.js` and **no** chatbot trigger in
  `web/index.html`. The failing page had the new trigger but the old script, i.e. a mixed cache.
- Loading the current repo in Chromium on a fresh URL returns `typeof toggleHardwareChat === "function"` and the
  drawer opens normally, so the current source is not broken.
- A normal re-navigation to the same local URL served the previously cached document/asset; only a fresh
  cache key (`?fresh=1`) received the new files. This is the same mechanism that produced the mismatch.

This is not a JavaScript defect; it is an asset-caching/deployment defect. Function declarations are hoisted
before execution, so a runtime error early in `app.js` cannot make `toggleHardwareChat` undefined — only a
script that was never loaded, was never parsed, or is an older build can do that.

### 2.2 Missing analytics — it is inside a Community-only container

The pulse grid is rendered in the HTML, but nested inside the Community composer wrapper:

```html
<!-- web/index.html:378 -->
<div id="community-post-composer" class="hidden space-y-3">
  ...
  <!-- line 431: reviews ticker -->
  <div id="live-reviews-ticker">...</div>

  <!-- lines 435-456: pulse grid, same card, below the reviews -->
  <div id="hardware-pulse-analytics">...</div>
</div>
```

`switchMainFeedMode()` (`web/app.js:383-461`) hides the wrapper for every mode and only un-hides it for COMMUNITY:

```js
if (postComposer) postComposer.classList.add("hidden");   // line 426, every switch
...
} else if (mode === "COMMUNITY") {
  if (postComposer) postComposer.classList.remove("hidden"); // line 457
}
```

Default mode is `activeFeedMode = "CATALOG"` (`web/app.js:12`), and the failing session was on `#build-lab`.
So in Catalog, Build Lab, and Price Radar the wrapper — reviews ticker **and** analytics grid — is hidden.
Switch to the Community tab (`#community`) and the grid is there, directly below the reviews.

### 2.3 Missing analytics — the metric values also have no data source yet

Even inside Community, three of the four numbers stay as the HTML placeholder `—`:

- `fetchHardwarePulseMetrics()` calls `sb.rpc("get_hardware_pulse_metrics")` (`web/app.js:1816`).
- That RPC is defined in `supabase/migrations/20261103000000_hardware_pulse_metrics.sql`, but the migration
  has **not been applied** to the remote project.
- PostgREST answers `PGRST202` ("Could not find the function ... in the schema cache"). The catch block only
  logs (`web/app.js:1825`); there is no fallback count, so the cards keep their `—` placeholder.
- `pulse-active-users` is the exception: it is filled by the Realtime presence `sync` event, not by the RPC.

So "no analytics" has two independent causes: the whole block is hidden outside Community mode, and the
counts have no backend until the migration is deployed.

---

## 3. What I did

1. Inspected `web/index.html` and `web/app.js` around the trigger, pulse grid, `switchMainFeedMode()`,
   `initHardwarePulse()`, and `fetchHardwarePulseMetrics()`.
2. Confirmed the current source defines `toggleHardwareChat` and that the old commit does not, matching the
   symptom to a mixed HTML/JS cache.
3. Reproduced the caching behaviour on a local server: plain navigation reused the cached document; a fresh
   query string served the updated one.
4. Applied the fix in `web/index.html` — cache-busting version query on both entry assets:

   ```html
   <link rel="stylesheet" href="style.min.css?v=20261103">
   <script src="app.js?v=20261103"></script>
   ```

   The comment in the file says to bump the token whenever `app.js` or the CSS changes.
5. Verified the versioned script loads, `toggleHardwareChat` resolves, and the drawer opens with the body
   scroll lock applied.

---

## 4. What I tested

| Check | Command / method | Result |
| --- | --- | --- |
| Current JS parses | `node --check web/app.js` | Pass |
| Unit + integration suite | `npx vitest run` | 2 files, 28 tests, all pass |
| Fresh page load (Chromium via Playwright, local server) | `typeof window.toggleHardwareChat` | `"function"` |
| Drawer behaviour | `toggleHardwareChat()` in page context | modal visible, `body.overflow-hidden` set |
| Old build really lacks the function | `git show 9a4bf80:web/app.js` | no `toggleHardwareChat` match |
| Old build really lacks the button | `git show 9a4bf80:web/index.html` | no `btn-chatbot-trigger` match |
| Cache behaviour | navigate same URL, then new query string | old asset reused until the query changed |
| Post-fix asset URLs | DOM inspection | `app.js?v=20261103`, `style.min.css?v=20261103` |
| Remote RPC | page console | `PGRST202` for `public.get_hardware_pulse_metrics` |

---

## 5. What I could not verify

- **The user's actual browser/host.** I cannot inspect their cache, CDN, or server headers. The error was not
  reproducible on a fresh load of the current source.
- **That the deployment actually contains the current `app.js`.** The cache-busting query forces the browser to
  ask for a fresh copy, but it cannot fix a server that is still serving an old file. If the error survives a
  hard refresh, the deployed `app.js` is old and must be redeployed.
- **Edge Tracking Prevention.** The console also logged `Tracking Prevention blocked access to storage`.
  Playwright runs Chromium, not Edge, so I could not exercise Edge's blocked-storage path. It only affects
  Build Lab persistence and pulse session IDs; it is not a cause of the `ReferenceError` (hoisting still
  defines the function even if a later top-level statement throws).
- **Remote database state.** The pulse metric values cannot be validated until the migration is applied; only
  the SQL text and the client-side parser are tested.

---

## 6. Why there is no analytics section below buyer reviews — short answer

The analytics grid exists and is placed immediately after `#live-reviews-ticker`, but both live inside
`#community-post-composer`, which is `hidden` unless the app is in **Community** mode. The reported session was
on `#build-lab`, so the entire card (reviews + analytics) was invisible. Additionally, even in Community mode,
the three catalog/feedback counters stay at `—` until `get_hardware_pulse_metrics` is applied to the remote
Supabase project.

---

## 7. Remaining actions

1. Redeploy the updated `web/index.html` (and confirm the current `web/app.js` is on the server).
2. Hard refresh once (`Ctrl+F5`) to drop the old `index.html`; subsequent asset requests use the versioned URLs.
3. Apply `supabase/migrations/20261103000000_hardware_pulse_metrics.sql` to the remote project.
4. Optional: if the analytics grid should be visible outside Community mode, move `#hardware-pulse-analytics`
   out of `#community-post-composer` in `web/index.html`.
