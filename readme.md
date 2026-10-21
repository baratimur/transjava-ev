# ⚡ Trans Java EV Charging Locator (SPKLU Trans-Jawa)

A lightweight, serverless single-page web app (SPA) designed to help electric vehicle drivers find rest area charging stations (SPKLU) across the Trans-Java toll corridor.

Built purely with vanilla HTML, Tailwind CSS (via CDN), and decoupled JSON data files. Runs 100% free with zero hosting costs on GitHub Pages or Cloudflare Pages.

---

## 🚀 Features

- **Direction-Aware Corridor Routing**: Automatic detection of **Jalur A** (eastbound/outbound) vs. **Jalur B** (westbound/inbound to Jakarta), accounting for multi-leg toll junctions (e.g. Cisumdawu via Dawuan, Solo Interchange, Gempol, and Paspro).
- **Interactive Section Filter**: Clickable corridor pills to focus on a specific segment (e.g. *Cikampek → Semarang*).
- **Physical Dispenser & Gun Breakdown**: Accurate modeling of real-world charging machines (distinguishes dedicated dual-gun CCS2 cabinets from 3-port combined tri-standard machines and shared split-power units).
- **Live Highway Mile Distance**:
  - Enter your current **KM** marker to see exact remaining kilometers to every upcoming charger and automatically hide rest areas you have already passed.
  - Omit current KM to display step-by-step driving distance between consecutive charging stops.
- **Battery Range Safety Filter**: Input remaining vehicle range in km to highlight reachable chargers and optionally filter out spots outside current battery capacity.
- **Speed Quick-Toggles**: Direct 1-tap filtering for Any speed, ≥ 50 kW, ≥ 100 kW, or 200 kW Ultra Fast.
- **Navigation Shortcuts**: Direct, 1-click coordinates links to open navigation in **Google Maps** or **Waze**.
- **Bilingual (ID / EN)**: Dynamic multi-language dictionary with saved preferences in `localStorage`.

---

## 📂 Project Architecture

```text
├── index.html       # Complete Single-Page Application (UI, graph routing, card renderer)
├── stations.json    # Curated Trans-Java rest area SPKLU database
├── highway.json     # Graph topology and routing legs connecting major cities
├── cities.json      # Origin and destination dropdown options
├── i18n.json        # Indonesian and English translation dictionary
└── README.md        # Documentation and contribution guide
