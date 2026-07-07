# Spark Homes Scope Estimator

A mobile-first, offline-first Progressive Web App for real estate acquisition agents to walk a property, price out repairs room-by-room, capture photos, scan equipment labels, and export a full estimate — with an on-device AI Investment Advisor for completed projects.

Built as a single set of static files: **no build step, no bundler, no required backend.** Everything runs in the browser.

![License](https://img.shields.io/badge/license-MIT-green)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-yellow)
![Mobile](https://img.shields.io/badge/Mobile-First-orange)

## Features

- **Project management** — create, search, rename, duplicate, archive, delete. Each project auto-generates its room structure (Interior/General, Systems & Structure, Exterior, Kitchen, N Bathrooms, N Bedrooms) from a short intake form.
- **75+ line-item price catalog** across the 5 required sections / 19 repair groups, with per-group "No Action Needed" toggles and progress tracking.
- **Adjustable rooms** — add/remove Bathroom, Kitchen, Bedroom, and Living Area instances at any time; each gets its own copy of the relevant repair groups.
- **Pricing** — per-project unit cost overrides, global override rollout, custom (non-catalog) line items, live running totals.
- **Photo capture** — attach photos to any repair line item, thumbnail strip, one-tap remove.
- **Equipment OCR** — scan an HVAC/appliance label; the app enhances the photo (grayscale + contrast stretch), runs OCR fully on-device, and parses manufacturer/model/serial/year into an editable confirmation sheet.
- **Summary & Export** — category and room breakdowns, and one-tap export to a real `.xlsx` workbook or a full `.zip` (workbook + all photos organized by room + a raw JSON backup).
- **AI Investment Advisor** _(creative addition)_ — for completed projects only, an on-device LLM (no server, no API key) analyzes your own inspection numbers and produces an opportunity score, prioritized recommendations, risk flags, and a voice-narrated summary. Falls back to a transparent, rule-based report if the model can't load or produce valid output, so the feature never breaks the app.
- **Installable PWA** — works fully offline after first load, including OCR and AI features once their (lazily-loaded) engines have been downloaded once.

## Tech Stack

| Layer      | Choice                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI         | Vanilla JS (ES modules), hand-written CSS (no framework)                                                                                                                                                      |
| Storage    | IndexedDB (source of truth) + localStorage (lightweight app state)                                                                                                                                            |
| Offline    | Service Worker, cache-first strategy, Web App Manifest                                                                                                                                                        |
| Export     | [SheetJS](https://sheetjs.com) (`.xlsx`) + [JSZip](https://stuk.github.io/jszip/) — both lazy-loaded from CDN only on export                                                                                  |
| OCR        | [Tesseract.js](https://tesseract.projectnaptha.com/) — lazy-loaded only when "Scan Equipment" is tapped                                                                                                       |
| AI Advisor | [`@huggingface/transformers`](https://huggingface.co/docs/transformers.js) running `onnx-community/Qwen2.5-0.5B-Instruct` on-device (WebGPU with WASM fallback) — lazy-loaded only when the Advisor is opened |
| Voice      | Native `SpeechSynthesis` API                                                                                                                                                                                  |

All CDN dependencies are loaded via dynamic `import()` at the moment they're needed, so the initial page load stays small. The service worker caches them after first successful load, so repeat use (OCR, export, AI) works fully offline.

## Project Structure

```
spark-estimator/
├── index.html                  # App shell
├── manifest.json                # PWA manifest
├── sw.js                        # Service worker (offline cache)
├── css/styles.css               # Design system + all component styles
├── assets/logo.png
├── icons/                       # Generated PWA icons (192/512, regular + maskable)
└── js/
    ├── app.js                   # Bootstrap + router
    ├── core/
    │   ├── db.js                 # IndexedDB wrapper (source of truth)
    │   ├── localStore.js         # localStorage wrapper
    │   ├── icons.js               # Inline SVG icon set
    │   └── utils.js
    ├── data/
    │   ├── priceList.js           # 108 catalog items, generated from Pricing_List.csv
    │   └── roomTemplates.js       # 5 sections / 19 groups / room-type definitions
    ├── repositories/              # One per entity — all IndexedDB access goes through these
    │   ├── projectRepository.js
    │   ├── roomRepository.js
    │   ├── repairRepository.js
    │   ├── photoRepository.js
    │   ├── equipmentRepository.js
    │   └── aiReportRepository.js
    ├── services/
    │   ├── pricingService.js      # Catalog + override resolution, totals, progress
    │   ├── photoService.js        # Capture + thumbnail generation
    │   ├── ocrService.js          # Equipment label OCR pipeline
    │   ├── exportService.js       # Excel / ZIP export
    │   ├── aiService.js           # On-device AI Investment Advisor
    │   └── speechService.js       # Voice narration
    └── screens/
        ├── projectsScreen.js
        ├── newProjectWizard.js
        ├── roomsScreen.js
        ├── roomDetailScreen.js
        ├── summaryScreen.js
        └── aiAdvisorScreen.js
```

## Running It Locally

Because the app uses native ES modules (`<script type="module">`), it must be served over HTTP(S) — opening `index.html` directly via `file://` will fail (browsers block module imports from the file protocol).

```bash
cd spark-estimator
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static file server works (`npx serve`, `php -S localhost:8080`, VS Code's Live Server, etc.) — there's no build step.

## Testing on a Phone or Tablet — how to actually satisfy this requirement

This is the part that trips people up: a few of the app's features have **browser-enforced requirements that only localhost gets a free pass on.** Specifically:

- Service workers (offline support, installability) only register on `localhost` or a page served over **HTTPS**. They are blocked on plain `http://` for any other host.
- The "Add to Home Screen" / install prompt requires the same.

So `python3 -m http.server` on your laptop, opened from your phone via your laptop's LAN IP (`http://192.168.x.x:8080`), **will load the app and most features will work** (camera capture, OCR, export, AI Advisor — none of those need HTTPS), but the service worker won't register, so it won't be installable and won't work offline. For a real test of the offline/PWA behavior, you need HTTPS.

### Recommended: GitHub Pages (free, HTTPS, matches your submission anyway)

Since the take-home asks for a GitHub repo regardless, this is the path of least resistance:

1. Push this project to a GitHub repo (root of the repo, or a subfolder — see note below).
2. In the repo: **Settings → Pages → Source** → deploy from the branch/folder containing `index.html`.
3. GitHub gives you a URL like `https://<username>.github.io/<repo>/`. Open that directly on your phone's browser (Safari or Chrome).
4. From there you can "Add to Home Screen" (iOS Safari: Share → Add to Home Screen; Android Chrome: menu → Install app) and it'll behave like a native app, fully offline after first load.

**Note on paths:** every path in this project (`manifest.json`, `sw.js` registration, all `<script>`/`<link>` references) is written relative (`./`), specifically so it works whether it's deployed at a domain root or under a subpath like `/repo-name/`. No changes needed either way.

### Alternatives (also free, also HTTPS, and don't require a GitHub Pages setup step)

- **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)) — drag the project folder into the browser, get an HTTPS URL in seconds. No account required for a quick test.
- **Vercel** or **Cloudflare Pages** — connect the GitHub repo, auto-deploys on push, custom HTTPS URL.

### If you need same-network HTTPS during active development

Tools like [`ngrok`](https://ngrok.com) or [`localtunnel`](https://github.com/localtunnel/localtunnel) can put a temporary HTTPS URL in front of your local dev server (`ngrok http 8080`), so you can test service worker/install behavior on your phone before you've deployed anywhere. Useful for iterating quickly; not something to rely on for the actual submission link.

## Known Limitations

- **WebGPU availability varies by browser/device.** The AI Advisor automatically falls back to WASM (CPU) when WebGPU isn't available, which works everywhere but is slower. iOS Safari's WebGPU support is newer and less consistent than desktop/Android Chrome — first-run model download + generation may take longer there.
- **The AI Advisor's model is small (0.5B parameters)** by design, to keep the download reasonable for a browser context. It occasionally produces malformed output; the app retries once and then falls back to a deterministic, numbers-based report rather than showing an error. This is called out in the UI ("Computed insights" vs. "On-device AI").
- **OCR accuracy** depends on photo quality/lighting on the equipment label — the app enhances contrast automatically, but a blurry or glare-heavy photo will still read poorly.
- No automated end-to-end browser test suite is included (the data layer and business logic are covered by a Node-based smoke test using `fake-indexeddb`/`jsdom`; UI interaction was verified manually).
