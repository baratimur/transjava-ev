# ⚡ Trans Java EV Charging Locator (SPKLU Trans-Jawa)

A lightweight, serverless single-page application (SPA) designed to help electric vehicle drivers find rest area charging stations (SPKLU) across the Trans-Java toll corridor.

The project runs completely static with zero backend hosting costs on GitHub Pages, Cloudflare Pages, or any static web host.

---

## 🚀 Key Features

* **Direction-Aware Corridor Routing**: Automatically matches travel direction (**Jalur A** outbound/eastbound vs. **Jalur B** inbound/westbound to Jakarta), correctly traversing major toll junctions (Cisumdawu via Dawuan, Semarang–Solo, Solo–Yogyakarta, Gempol, and Paspro).
* **Interactive Section Zoom**: Clickable highway segment chips (e.g. *Cikampek → Dawuan*, *Dawuan → Semarang*) allow filtering down to a single stretch of road.
* **Realistic Hardware Modeling**:
* Individual physical dispenser units are tracked separately under each rest area.
* Dedicated DC fast chargers (CCS2) are capped at a maximum of 2 ports per machine.
* 3-port dispensers are reserved exclusively for combined tri-standard units (1x CCS2 + 1x CHAdeMO + 1x AC).
* High-capacity multi-gun sites (such as 6-gun banks) are accurately split across physical dual-gun cabinets.


* **Smart Highway Distance**:
* **With Current KM Input**: Calculates exact remaining driving distance to every upcoming station and hides stations already passed.
* **Without Current KM Input**: Displays leg-by-leg driving distance from the previous charging stop.


* **Battery Range Safety Filter**: Enter your car's remaining battery range in kilometers to mark reachable stops and filter out locations beyond safe driving range.
* **One-Tap Speed Filters**: Direct quick-toggles for All speeds, ≥ 50 kW, ≥ 100 kW, or 200 kW Ultra Fast.
* **Navigation App Integration**: Instant coordinate links to launch turn-by-turn navigation directly in **Google Maps** or **Waze**.
* **Bilingual UI (ID / EN)**: Fully localized interface with language preferences remembered in browser storage.

---

## 📂 Project Structure

```text
├── index.html       # Single-Page Application (UI, path routing, filtering, compact card layout)
├── stations.json    # Trans-Java rest area SPKLU database with port breakdowns
├── highway.json     # Graph topology and routing legs connecting toll corridors
├── cities.json      # Origin and destination dropdown options
├── i18n.json        # Indonesian and English translation dictionaries
└── README.md        # Project documentation and contributor guidelines

```

---

## 🛠️ Data Schema

### `stations.json`

Every station entry consolidates all charging hardware at that specific rest area location:

```json
{
  "segment": "jakarta-cikampek",
  "side": "A",
  "km": 57,
  "name": "KM 57 A (Japek)",
  "lowest_power": 22,
  "highest_power": 200,
  "types": ["CCS2", "Chademo", "AC"],
  "chargers": [
    {
      "brand": "PLN",
      "total_ports": 2,
      "shared": true,
      "ports": [
        { "type": "CCS2", "power": "200 kW", "power_max": 200 },
        { "type": "CCS2", "power": "200 kW", "power_max": 200 }
      ]
    },
    {
      "brand": "iGreen+",
      "total_ports": 2,
      "shared": true,
      "ports": [
        { "type": "CCS2", "power": "120 kW", "power_max": 120 },
        { "type": "CCS2", "power": "120 kW", "power_max": 120 }
      ]
    },
    {
      "brand": "PLN",
      "total_ports": 3,
      "shared": true,
      "ports": [
        { "type": "CCS2", "power": "50 kW", "power_max": 50 },
        { "type": "Chademo", "power": "50 kW", "power_max": 50 },
        { "type": "AC", "power": "22 kW", "power_max": 22 }
      ]
    }
  ],
  "lat": -6.367231,
  "lng": 107.360798
}

```

### Hardware Modeling Guidelines

1. **`chargers` Array**: Each element represents one physical dispenser cabinet in the parking bay.
2. **Pure DC / CCS2 Dispensers**: Maximum `total_ports: 2` per machine (dual-gun). If a site offers 6 CCS2 guns, configure them as 3 separate dispensers of 2 ports each.
3. **Tri-Standard Units**: A machine only has `total_ports: 3` if it combines multi-standard plugs (e.g. 1x CCS2 + 1x CHAdeMO + 1x AC Type 2).
4. **Scope**: Only rest areas and toll operational offices located directly along Trans-Java toll expressways are included. Off-toll dealerships, urban streets, and non-toll arterial roads are excluded.

---

## 🤝 Contributing

Contributions, station updates, and pull requests are very welcome! If you spot newly installed chargers, upgraded power ratings, or changed rest area amenities:

1. Fork the repository: [github.com/baratimur/transjava-ev](https://www.google.com/search?q=https://github.com/baratimur/transjava-ev).
2. Create a dedicated branch:
```bash
git checkout -b update-km-spklu

```


3. Update `stations.json` with the new dispenser configuration, plug types, or wattage.
4. Validate your JSON syntax:
```bash
python3 -m json.tool stations.json > /dev/null

```


5. Commit your changes and open a Pull Request with a short description of the rest area and corridor updated.

---

## 💻 Local Development

Because standard browser security prevents JavaScript `fetch()` calls over raw `file://` URIs, serve the directory using any local web server:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js
npx serve .

```

Open `http://localhost:8000` in your browser.

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to GitHub under your account.
2. Navigate to **Settings** → **Pages**.
3. Under **Build and deployment**:
* **Source**: `Deploy from a branch`
* **Branch**: `main` (or `master`), Folder: `/(root)`


4. Click **Save**. Your site will be live within 60 seconds at `https://<your-username>.github.io/<repo-name>/`.

---

## 📄 License & Disclaimer

Released under the [MIT License](https://www.google.com/search?q=LICENSE).

Station specifications are curated from public concessionaire records and EV driver community reports[cite: 3]. Always verify real-time stall availability and operational status through official operator apps (PLN Mobile, Astra Otopower, etc.) prior to road trips.
