// SPKLU Trans Jawa - Core Application Logic

let i18nDictionary = {};
let SPKLU_NETWORK = [];
let HIGHWAY_GRAPH = {};
let CITIES = [];
let currentLang = localStorage.getItem('lang') || 'id';

let selectedSegmentFilter = null;
let selectedSpeedFilter = 'all';
let selectedConnectors = new Set(['CCS2', 'Chademo', 'AC']);
let openDropdownId = null;

// Helper: 2 State Validator (Operasional vs Tidak Operasional)
function isOperational(item) {
  if (!item) return false;
  if (item.operational !== undefined) return Boolean(item.operational);
  if (item.is_operational !== undefined) return Boolean(item.is_operational);
  if (item.status !== undefined) {
    if (typeof item.status === 'number') return item.status === 50;
    if (typeof item.status === 'string') {
      const s = item.status.toLowerCase().trim();
      return s === 'operational' || s === '50' || s === 'active' || s === 'online';
    }
    if (typeof item.status === 'boolean') return item.status;
  }
  return true; // Default dianggap operasional jika tidak didefinisikan
}

// Helper: Hitung metrik operasional stasiun
function evaluateStationOperationalData(s) {
  const stationIsOp = isOperational(s);
  let operationalPorts = [];
  let allPorts = [];
  let operationalMachinesCount = 0;

  (s.chargers || []).forEach(charger => {
    const chargerIsOp = stationIsOp && isOperational(charger);
    let chargerHasOperationalPort = false;

    (charger.ports || []).forEach(port => {
      const portIsOp = chargerIsOp && isOperational(port);
      const portObj = { ...port, brand: charger.brand, isOperational: portIsOp };
      allPorts.push(portObj);
      if (portIsOp) {
        operationalPorts.push(portObj);
        chargerHasOperationalPort = true;
      }
    });

    if (chargerHasOperationalPort) {
      operationalMachinesCount++;
    }
  });

  // Jika tidak memiliki struktur array chargers, fallback ke data stasiun langsung
  const isCompletelyOffline = allPorts.length > 0 ? (operationalPorts.length === 0) : !stationIsOp;

  // Hitung rentang daya HANYA dari port yang operasional
  let powerValues = operationalPorts.map(p => {
    if (p.power_kw) return Number(p.power_kw);
    const m = String(p.power || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }).filter(pw => pw > 0);

  const highestPower = powerValues.length > 0 
    ? Math.max(...powerValues) 
    : (isCompletelyOffline ? 0 : (s.highest_power || 0));

  const lowestPower = powerValues.length > 0 
    ? Math.min(...powerValues) 
    : (isCompletelyOffline ? 0 : (s.lowest_power || 0));

  const operationalTypes = [...new Set(operationalPorts.map(p => p.type))];

  return {
    isCompletelyOffline,
    operationalMachinesCount,
    operationalPortsCount: operationalPorts.length,
    totalPortsCount: allPorts.length,
    highestPower,
    lowestPower,
    operationalTypes,
    allPorts
  };
}

function animatedRouting(resetSegment = false) {
  if (resetSegment) selectedSegmentFilter = null;
  if (document.startViewTransition) {
    document.startViewTransition(() => runRouting());
  } else {
    runRouting();
  }
}

// Inisialisasi & Pengaturan Tema
function initTheme() {
  const saved = localStorage.getItem('theme');
  const isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(isDark ? 'dark' : 'light');
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  setTheme(isDark ? 'light' : 'dark');
}

function setTheme(theme) {
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    if (darkIcon) darkIcon.classList.remove('hidden');
    if (lightIcon) lightIcon.classList.add('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    if (darkIcon) darkIcon.classList.add('hidden');
    if (lightIcon) lightIcon.classList.remove('hidden');
  }
  localStorage.setItem('theme', theme);
}

// Sistem Bahasa / i18n
function t(key) {
  if (!i18nDictionary[currentLang]) return key;
  return i18nDictionary[currentLang][key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;

  document.title = t('seo_title') || 'SPKLU Trans Jawa • Peta Cas Mobil Listrik Rest Area Tol';
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && t('seo_desc') !== 'seo_desc') metaDesc.setAttribute('content', t('seo_desc'));

  const btnId = document.getElementById('btn-id');
  const btnEn = document.getElementById('btn-en');
  if (btnId) btnId.className = `px-2.5 py-1 min-h-[32px] text-xs font-bold rounded transition-all ${lang === 'id' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`;
  if (btnEn) btnEn.className = `px-2.5 py-1 min-h-[32px] text-xs font-bold rounded transition-all ${lang === 'en' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'OPTION') el.textContent = t(key);
    else if (el.tagName === 'INPUT' && el.type === 'text') el.placeholder = t(key);
    else if (el.hasAttribute('title')) el.title = t(key);
    else el.textContent = t(key);
  });

  const kmInput = document.getElementById("current-km");
  if (kmInput) kmInput.placeholder = t('km_ph');
  const batteryInput = document.getElementById("battery-range");
  if (batteryInput) batteryInput.placeholder = t('battery_ph');

  animatedRouting(false);
}

// Dropdown & Searchable Popover
function populateDropdowns(cities) {
  renderDropdownItems('origin', cities, 'jakarta');
  renderDropdownItems('destination', cities, 'surabaya');
}

function renderDropdownItems(type, cities, defaultVal) {
  const listContainer = document.getElementById(`${type}-list`);
  const label = document.getElementById(`${type}-label`);
  const input = document.getElementById(type);

  if (defaultVal) {
    input.value = defaultVal;
    const initialCity = CITIES.find(c => c.id === defaultVal);
    if (initialCity) label.textContent = initialCity.name;
  }

  const currentSelected = input.value;

  if (!cities || cities.length === 0) {
    listContainer.innerHTML = `<div class="px-3 py-4 text-center text-sm text-slate-500 font-medium">Kota tidak ditemukan</div>`;
    return;
  }

  listContainer.innerHTML = cities.map(city => {
    const isSelected = city.id === currentSelected;
    return `
      <button type="button" aria-selected="${isSelected}" onclick="selectCity('${type}', '${city.id}', '${city.name}')" class="w-full flex items-center justify-between px-3 py-3 min-h-[44px] text-sm font-bold rounded-xl transition-all duration-150 ${isSelected ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">
        <span>${city.name}</span>
        ${isSelected ? '<span class="text-emerald-700 dark:text-emerald-400 text-sm">✓</span>' : ''}
      </button>
    `;
  }).join("");
}

function filterCities(type) {
  const searchInput = document.getElementById(`${type}-search`);
  const query = (searchInput.value || "").toLowerCase().trim();
  const filtered = CITIES.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
  renderDropdownItems(type, filtered);
}

function toggleDropdown(type) {
  const menu = document.getElementById(`${type}-menu`);
  const chevron = document.getElementById(`${type}-chevron`);
  const isCurrentlyOpen = openDropdownId === type;

  closeAllDropdowns();

  if (!isCurrentlyOpen) {
    const searchInput = document.getElementById(`${type}-search`);
    if (searchInput) {
      searchInput.value = '';
      renderDropdownItems(type, CITIES);
    }
    menu.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
    openDropdownId = type;

    setTimeout(() => { if (searchInput) searchInput.focus(); }, 50);
  }
}

function closeAllDropdowns() {
  ['origin', 'destination'].forEach(type => {
    const menu = document.getElementById(`${type}-menu`);
    const chevron = document.getElementById(`${type}-chevron`);
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  });
  openDropdownId = null;
}

function selectCity(type, id, name) {
  document.getElementById(type).value = id;
  document.getElementById(`${type}-label`).textContent = name;
  closeAllDropdowns();
  renderDropdownItems(type, CITIES, id);
  animatedRouting(true);
}

function swapLocations() {
  const swapBtn = document.getElementById("btn-swap");
  swapBtn.classList.toggle("swap-active");
  const originInput = document.getElementById("origin");
  const destInput = document.getElementById("destination");
  const tempVal = originInput.value;
  
  originInput.value = destInput.value;
  destInput.value = tempVal;

  const originCity = CITIES.find(c => c.id === originInput.value);
  const destCity = CITIES.find(c => c.id === destInput.value);

  if (originCity) {
    document.getElementById("origin-label").textContent = originCity.name;
    renderDropdownItems('origin', CITIES, originInput.value);
  }
  if (destCity) {
    document.getElementById("destination-label").textContent = destCity.name;
    renderDropdownItems('destination', CITIES, destInput.value);
  }
  animatedRouting(true);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#dropdown-origin-wrapper') && !e.target.closest('#dropdown-destination-wrapper')) {
    closeAllDropdowns();
  }
});

function clearKm() {
  const input = document.getElementById("current-km");
  if (input) { input.value = ""; input.focus(); }
  animatedRouting(false);
}

function toggleSegmentFilter(segKey) {
  selectedSegmentFilter = (selectedSegmentFilter === segKey) ? null : segKey;
  animatedRouting(false);
}

function setSpeedFilter(minPower) {
  selectedSpeedFilter = minPower;
  ['all', '50', '100', '200'].forEach(val => {
    const btn = document.getElementById(`btn-speed-${val}`);
    if (btn) {
      btn.setAttribute('aria-pressed', val === minPower ? "true" : "false");
      if (val === minPower) {
        btn.className = "px-2.5 py-1.5 min-h-[36px] rounded-md text-[11px] sm:text-xs font-bold transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm";
      } else {
        btn.className = "px-2.5 py-1.5 min-h-[36px] rounded-md text-[11px] sm:text-xs font-bold transition-all text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white";
      }
    }
  });
  animatedRouting(false);
}

function toggleConnector(type) {
  if (selectedConnectors.has(type)) {
    if (selectedConnectors.size > 1) selectedConnectors.delete(type);
  } else {
    selectedConnectors.add(type);
  }

  ['CCS2', 'Chademo', 'AC'].forEach(tp => {
    const btn = document.getElementById(`btn-conn-${tp.toLowerCase()}`);
    if (btn) {
      const isActive = selectedConnectors.has(tp);
      btn.setAttribute('aria-pressed', isActive ? "true" : "false");
      if (isActive) {
        btn.className = "px-2.5 py-1.5 min-h-[36px] rounded-md text-[11px] sm:text-xs font-bold transition-all bg-emerald-700 text-white shadow-sm dark:bg-emerald-600 dark:text-white active:scale-95";
      } else {
        btn.className = "px-2.5 py-1.5 min-h-[36px] rounded-md text-[11px] sm:text-xs font-bold transition-all text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white active:scale-95";
      }
    }
  });
  animatedRouting(false);
}

function formatSegment(segment, side) {
  const parts = segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1));
  if (side === 'B') return `${parts[1]} → ${parts[0]}`;
  return `${parts[0]} → ${parts[1]}`;
}

function findRoute(start, end) {
  if (start === end) return null;
  let queue = [[start, []]];
  let visited = new Set([start]);

  while (queue.length > 0) {
    let [current, path] = queue.shift();
    if (current === end) return path;

    const neighbors = HIGHWAY_GRAPH[current] || [];
    for (let edge of neighbors) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push([edge.to, [...path, edge]]);
      }
    }
  }
  return null;
}

function getBrandDot(brand) {
  const b = (brand || '').toUpperCase();
  if (b.includes('WULING')) return 'bg-rose-500';
  if (b.includes('ASTRA')) return 'bg-sky-600';
  if (b.includes('IGREEN')) return 'bg-teal-500';
  return 'bg-emerald-600 dark:bg-emerald-400';
}

// Logika Render & Filter Utama
function runRouting() {
  if (SPKLU_NETWORK.length === 0 || Object.keys(HIGHWAY_GRAPH).length === 0) return;

  const origin = document.getElementById("origin").value;
  const destination = document.getElementById("destination").value;
  const currentKmVal = document.getElementById("current-km").value.trim();
  const hasCurrentKm = currentKmVal !== "" && !isNaN(parseFloat(currentKmVal));
  const curKm = hasCurrentKm ? parseFloat(currentKmVal) : null;
  const batteryRangeVal = document.getElementById("battery-range").value.trim();
  const hasBatteryRange = batteryRangeVal !== "" && !isNaN(parseFloat(batteryRangeVal));
  const batteryRange = hasBatteryRange ? parseFloat(batteryRangeVal) : null;
  const filterWithinRange = document.getElementById("filter-within-range").checked;

  const resultsContainer = document.getElementById("results-list");
  const corridorSummary = document.getElementById("corridor-summary");
  const matchCounter = document.getElementById("match-counter");

  if (origin === destination) {
    corridorSummary.innerHTML = "";
    matchCounter.textContent = `0 ${t('spots_ahead')}`;
    resultsContainer.innerHTML = `
      <div class="text-center py-10 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-white/80 dark:bg-slate-900/40 animate-ios-card">
        <p class="text-slate-600 dark:text-slate-400 text-sm font-bold">${t('err_same_city')}</p>
      </div>
    `;
    return;
  }

  const legs = findRoute(origin, destination);
  if (!legs) {
    resultsContainer.innerHTML = `
      <div class="p-6 text-center text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-2xl bg-white/80 dark:bg-slate-900/40 animate-ios-card text-sm font-bold">
        ${t('err_no_route')}
      </div>
    `;
    return;
  }

  let chipsMarkup = `
    <button type="button" aria-pressed="${selectedSegmentFilter === null}" onclick="selectedSegmentFilter = null; animatedRouting(false)" class="whitespace-nowrap shrink-0 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition-all duration-200 ${selectedSegmentFilter === null ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'} active:scale-95">
      ${t('all_segments')}
    </button>
  `;

  chipsMarkup += legs.map(leg => {
    const isSelected = selectedSegmentFilter === leg.segment;
    return `
      <button type="button" aria-pressed="${isSelected}" onclick="toggleSegmentFilter('${leg.segment}')" class="whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-mono transition-all duration-200 ${isSelected ? 'bg-emerald-700 text-white dark:bg-emerald-600 dark:text-white font-bold shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'} active:scale-95">
        <span class="w-4 h-4 rounded text-[10px] font-black flex items-center justify-center ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400'}">${leg.side}</span>
        <span class="font-bold">${formatSegment(leg.segment, leg.side)}</span>
      </button>
    `;
  }).join("");

  corridorSummary.innerHTML = chipsMarkup;

  let matchedStations = [];
  legs.forEach(leg => {
    let stationsOnLeg = SPKLU_NETWORK.filter(s => s.segment === leg.segment && s.side === leg.side);
    stationsOnLeg.sort((a, b) => leg.order === 'asc' ? a.km - b.km : b.km - a.km);
    stationsOnLeg.forEach(s => matchedStations.push({ ...s, legOrder: leg.order }));
  });

  if (selectedSegmentFilter) {
    matchedStations = matchedStations.filter(s => s.segment === selectedSegmentFilter);
  }

  // Siapkan evaluasi status operasional untuk setiap stasiun
  matchedStations = matchedStations.map(s => {
    const opData = evaluateStationOperationalData(s);
    return {
      ...s,
      ...opData
    };
  });

  // Filter jenis colokan: Stasiun harus memiliki port operasional dari tipe yang dipilih
  if (selectedConnectors.size > 0 && selectedConnectors.size < 3) {
    matchedStations = matchedStations.filter(s => {
      // Jika stasiun mati total, tetap tampilkan selama tipe aslinya cocok (agar teridentifikasi offline)
      if (s.isCompletelyOffline) {
        return (s.types || []).some(tp => selectedConnectors.has(tp));
      }
      return s.operationalTypes.some(tp => selectedConnectors.has(tp));
    });
  }

  let passedCount = 0;
  if (hasCurrentKm) {
    const totalBefore = matchedStations.length;
    matchedStations = matchedStations.filter(s => s.legOrder === 'asc' ? s.km >= curKm : s.km <= curKm);
    passedCount = totalBefore - matchedStations.length;
  }

  // Filter kecepatan (hanya mengukur daya dari port yang operasional)
  if (selectedSpeedFilter !== 'all') {
    const minKW = parseInt(selectedSpeedFilter, 10);
    matchedStations = matchedStations.filter(s => s.highestPower >= minKW);
  }

  matchedStations = matchedStations.map((s, idx, arr) => {
    let distAhead = null;
    let distFromPrev = null;
    if (hasCurrentKm) {
      distAhead = s.legOrder === 'asc' ? (s.km - curKm) : (curKm - s.km);
      if (distAhead < 0) distAhead = 0;
    }
    distFromPrev = idx === 0 ? 0 : Math.abs(s.km - arr[idx - 1].km);
    const isWithinBattery = hasBatteryRange && distAhead !== null ? (distAhead <= batteryRange) : null;
    return { ...s, distAhead, distFromPrev, isWithinBattery };
  });

  if (filterWithinRange && hasBatteryRange && hasCurrentKm) {
    matchedStations = matchedStations.filter(s => s.isWithinBattery);
  }

  // Hitung jumlah Ultra Cepat HANYA dari stasiun yang port 200 kW-nya aktif operasional
  const ultraCount = matchedStations.filter(s => s.highestPower >= 200 && !s.isCompletelyOffline).length;
  let counterText = `${matchedStations.length} ${t('spots_ahead')} (${ultraCount} ${t('speed_ultra')} 200 kW)`;
  if (passedCount > 0) counterText += ` • <span class="text-amber-700 dark:text-amber-400 font-bold">${passedCount} ${t('past_hidden')}</span>`;
  matchCounter.innerHTML = counterText;

  if (matchedStations.length === 0) {
    resultsContainer.innerHTML = `
      <div class="text-center py-10 border border-slate-300 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 rounded-2xl animate-ios-card shadow-sm">
        <p class="text-slate-600 dark:text-slate-400 text-sm font-bold">${t('err_no_match')}</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = matchedStations.map((s, idx) => {
    const isOffline = s.isCompletelyOffline;

    let powerLabel = t('speed_fast');
    if (s.highestPower >= 200) powerLabel = t('speed_ultra');
    else if (s.highestPower >= 100) powerLabel = t('speed_rapid');

    const unitLabel = t('label_unit') || 'Mesin';
    const portLabel = t('label_port') || 'Port';

    // Kapasitas & Status Badge (Perhitungan hanya dari yang operasional)
    let capacityBadge = '';
    if (isOffline) {
      capacityBadge = `
        <span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 line-through">
          ⚠️ Tidak Beroperasi
        </span>
      `;
    } else if (s.operationalMachinesCount > 4 && s.operationalPortsCount > 10) {
      capacityBadge = `
        <span class="inline-flex items-center gap-1 font-mono text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">
          ⚡⚡ ${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})
        </span>
      `;
    } else if (s.operationalMachinesCount <= 1) {
      capacityBadge = `
        <span class="inline-flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
          ${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})
        </span>
      `;
    } else {
      capacityBadge = `
        <span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30">
          ⚡ ${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})
        </span>
      `;
    }

    // Distance & Battery Badge
    let distanceBadge = '';
    if (hasCurrentKm && s.distAhead !== null) {
      distanceBadge = `<span class="inline-flex items-center font-mono font-extrabold text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">📍 ${s.distAhead} ${t('km_ahead')}</span>`;
    } else {
      distanceBadge = idx === 0 
        ? `<span class="inline-flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">${t('first_stop')}</span>`
        : `<span class="inline-flex items-center font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">🚗 +${s.distFromPrev} ${t('from_prev_stop')}</span>`;
    }

    let batteryBadge = '';
    if (hasBatteryRange && hasCurrentKm) {
      batteryBadge = s.isWithinBattery
        ? `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">✓ ${t('within_battery')}</span>`
        : `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30">⚠️ ${t('outside_battery')}</span>`;
    }

    // Render Mesin & Port dengan Style Strikethrough jika Tidak Operasional
    const dispenserGroupMap = {};
    (s.chargers || []).forEach(charger => {
      const chargerIsOp = !isOffline && isOperational(charger);
      const portGroups = {};

      (charger.ports || []).forEach(port => {
        const portIsOp = chargerIsOp && isOperational(port);
        const groupKey = `${port.type} ${port.power}___${portIsOp}`;
        if (!portGroups[groupKey]) {
          portGroups[groupKey] = {
            type: port.type,
            power: port.power,
            isOp: portIsOp,
            count: 0
          };
        }
        portGroups[groupKey].count += 1;
      });

      const portSummaries = Object.values(portGroups).map(pg => {
        const countPrefix = pg.count > 1 ? `${pg.count}× ` : '';
        if (pg.isOp) {
          return `<span>${countPrefix}${pg.type} ${pg.power}</span>`;
        } else {
          // Strikethrough port yang tidak operasional
          return `<span class="line-through decoration-rose-500 text-slate-400 dark:text-slate-500" title="Port Tidak Beroperasi">${countPrefix}${pg.type} ${pg.power}</span>`;
        }
      }).join('<span class="text-slate-300 dark:text-slate-700 mx-1">•</span>');

      const signature = `${charger.brand}___${portSummaries}`;
      if (!dispenserGroupMap[signature]) {
        dispenserGroupMap[signature] = {
          brand: charger.brand,
          portSummaries: portSummaries,
          count: 0,
          chargerIsOp: chargerIsOp
        };
      }
      dispenserGroupMap[signature].count += 1;
    });

    const dispenserList = Object.values(dispenserGroupMap).map(item => {
      const machineCountPrefix = item.count > 1 ? `<span class="font-extrabold ${item.chargerIsOp ? 'text-emerald-800 dark:text-emerald-400' : 'text-slate-400'} mr-0.5">${item.count}×</span>` : '';
      return `
        <div class="inline-flex items-center gap-1.5 ${item.chargerIsOp ? 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700' : 'bg-slate-100/70 dark:bg-slate-900/30 border-dashed border-slate-300 dark:border-slate-800 opacity-60'} border rounded-lg px-2.5 py-1 text-xs">
          <span class="w-2 h-2 rounded-full ${item.chargerIsOp ? getBrandDot(item.brand) : 'bg-slate-400'} shrink-0"></span>
          <span class="font-bold ${item.chargerIsOp ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'} text-[11px]">${machineCountPrefix}${item.brand}</span>
          <span class="text-slate-300 dark:text-slate-600 text-[10px]" aria-hidden="true">|</span>
          <span class="font-mono text-[11px] font-bold flex items-center flex-wrap">${item.portSummaries}</span>
        </div>
      `;
    }).join("");

    const staggerDelay = Math.min(idx * 28, 250);

    // Style Card Penuh jika Stasiun Tidak Operasional
    const cardContainerStyle = isOffline 
      ? "opacity-60 bg-slate-100/50 dark:bg-slate-900/20 border-slate-300 dark:border-slate-800" 
      : "bg-white dark:bg-slate-900/60 hover:bg-slate-50/80 dark:hover:bg-slate-900/90 border-slate-300 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-600 shadow-sm hover:shadow-md";

    const titleStyle = isOffline 
      ? "line-through text-slate-400 dark:text-slate-500" 
      : "text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400";

    const powerStyle = isOffline 
      ? "line-through text-slate-400 dark:text-slate-600" 
      : "text-slate-900 dark:text-white";

    return `
      <article style="animation-delay: ${staggerDelay}ms" class="animate-ios-card group border rounded-2xl p-3.5 sm:p-4 transition-all duration-200 ${cardContainerStyle}">
        
        <div class="flex items-center justify-between gap-1.5 pb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-md ${isOffline ? 'bg-slate-200 text-slate-500 line-through' : 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'}">
              KM ${s.km}
            </span>
            <span class="text-[11px] font-extrabold px-2 py-0.5 rounded-md ${s.side === 'A' ? 'bg-sky-100 text-sky-900 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30' : 'bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30'}">
              ${s.side}
            </span>
            ${capacityBadge}
            ${distanceBadge}
            ${batteryBadge}
          </div>

          <div class="text-right shrink-0">
            <span class="font-mono font-extrabold text-base ${powerStyle}">
              ${isOffline ? '0' : (s.lowestPower !== s.highestPower ? `${s.lowestPower}~${s.highestPower}` : s.highestPower)}<span class="text-xs font-sans font-bold text-slate-500 ml-0.5">kW</span>
            </span>
            ${!isOffline ? `<span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 ml-1 hidden sm:inline">${powerLabel}</span>` : ''}
          </div>
        </div>

        <div class="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="font-extrabold text-base leading-tight transition-colors ${titleStyle}">
              ${s.name}
            </h2>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
              ${formatSegment(s.segment, s.side)}
            </span>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" aria-label="Buka di Google Maps" target="_blank" rel="noopener" 
               class="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-sm active:scale-95 transition-all">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              <span>Maps</span>
            </a>
            <a href="https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes" aria-label="Buka di Waze" target="_blank" rel="noopener" 
               class="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm active:scale-95 transition-all">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M20.5 12c0-4.69-3.81-8.5-8.5-8.5S3.5 7.31 3.5 12c0 2.21.84 4.22 2.22 5.73l-1.16 3.48c-.14.42.24.83.67.72l3.65-.91c1.37.63 2.91.98 4.54.98 4.69 0 8.5-3.81 8.5-8.5zm-11 1.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
              <span>Waze</span>
            </a>
          </div>
        </div>

        <div class="mt-2.5 flex flex-wrap gap-1.5">
          ${dispenserList}
        </div>
      </article>
    `;
  }).join("");
}

function setupCorridorDesktopScroll() {
  const el = document.getElementById("corridor-summary");
  if (!el) return;
  el.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      el.scrollLeft += e.deltaY * 0.9;
    }
  }, { passive: false });
  let isDown = false, startX = 0, scrollLeft = 0;
  el.addEventListener("mousedown", (e) => {
    isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft;
  });
  el.addEventListener("mouseleave", () => { isDown = false; });
  el.addEventListener("mouseup", () => { isDown = false; });
  el.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    el.scrollLeft = scrollLeft - ((e.pageX - el.offsetLeft) - startX) * 1.5;
  });
}

// Inisialisasi Aplikasi & PWA
async function initApp() {
  const list = document.getElementById("results-list");
  const loader = document.getElementById("initial-loader");
  const appContent = document.getElementById("app-content");

  initTheme();
  setupCorridorDesktopScroll();

  try {
    const [langRes, stationsRes, graphRes, citiesRes] = await Promise.all([
      fetch("i18n.json"), fetch("stations.json"), fetch("highway.json"), fetch("cities.json")
    ]);

    if (!langRes.ok) throw new Error(`i18n.json error ${langRes.status}`);
    if (!stationsRes.ok) throw new Error(`stations.json error ${stationsRes.status}`);
    if (!graphRes.ok) throw new Error(`highway.json error ${graphRes.status}`);
    if (!citiesRes.ok) throw new Error(`cities.json error ${citiesRes.status}`);
    
    i18nDictionary = await langRes.json();// Di dalam initApp() saat membaca stations.json
    SPKLU_NETWORK = (await stationsRes.json()).map(s => ({
    segment: s.seg || s.segment,
    side: s.sd || s.side,
    km: s.km,
    name: s.n || s.name,
    lat: s.lat,
    lng: s.lng,
    status: s.s || s.status || 50,
    types: [...new Set((s.c || []).flatMap(ch => (ch.p || []).map(pt => pt.t || pt.type)))],
    chargers: (s.c || s.chargers || []).map(ch => ({
        brand: ch.b || ch.brand,
        status: ch.s || ch.status || 50,
        ports: (ch.p || ch.ports || []).map(pt => ({
        type: pt.t || pt.type,
        power: `${pt.kw || pt.power_max || 0} kW`,
        power_max: pt.kw || pt.power_max || 0,
        status: pt.s || pt.status || 50
        }))
    }))
    }));
    HIGHWAY_GRAPH = await graphRes.json();
    CITIES = await citiesRes.json();

    populateDropdowns(CITIES);
    setLang(currentLang);
    
    setTimeout(() => {
      if (loader) {
        loader.style.opacity = '0';
        loader.style.visibility = 'hidden';
      }
      if (appContent) appContent.style.opacity = '1';
    }, 150);
    
  } catch (err) {
    console.error("Initialization Failed:", err);
    if (loader) {
      loader.style.opacity = '0';
      loader.style.visibility = 'hidden';
    }
    if (appContent) appContent.style.opacity = '1';

    if (list) {
      list.innerHTML = `
        <div class="p-6 text-center text-rose-700 bg-rose-50 border border-rose-300 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800/60 rounded-2xl text-sm font-bold animate-ios-card">
          Gagal memuat data SPKLU. Pastikan koneksi internet aktif.
        </div>
      `;
    }
  }
}

// Rumus Haversine untuk menghitung jarak antara 2 koordinat (dalam km)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Menghitung estimasi KM berdasarkan posisi GPS
function calculateKmFromCoords(userLat, userLng) {
  if (!SPKLU_NETWORK || SPKLU_NETWORK.length === 0) return null;

  // Filter stasiun yang memiliki koordinat valid dan urutkan dari yang terdekat
  const validStations = SPKLU_NETWORK
    .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number' && typeof s.km === 'number')
    .map(s => ({
      ...s,
      dist: getDistanceKm(userLat, userLng, s.lat, s.lng)
    }))
    .sort((a, b) => a.dist - b.dist);

  if (validStations.length === 0) return null;

  const s1 = validStations[0]; // Stasiun paling dekat

  // Peringatan opsional jika jarak pengguna terlalu jauh dari rute tol (> 80 km)
  if (s1.dist > 80) {
    console.warn(`Posisi GPS berjarak ${Math.round(s1.dist)} km dari titik SPKLU terdekat.`);
  }

  // Cari stasiun terdekat kedua yang berada pada ruas (segment) yang sama untuk interpolasi presisi
  const s2 = validStations.slice(1).find(s => s.segment === s1.segment && s.km !== s1.km);

  if (s2) {
    // Vektor proyeksi linier antara s1 dan s2
    const dLat = s2.lat - s1.lat;
    const dLng = s2.lng - s1.lng;
    const lenSq = dLat * dLat + dLng * dLng;

    if (lenSq > 0) {
      const t = ((userLat - s1.lat) * dLat + (userLng - s1.lng) * dLng) / lenSq;
      // Jika posisi pengguna berada di antara rentang dua rest area
      if (t >= -0.2 && t <= 1.2) {
        const clampedT = Math.max(0, Math.min(1, t));
        return Math.round(s1.km + clampedT * (s2.km - s1.km));
      }
    }
  }

  // Fallback: gunakan KM dari stasiun terdekat
  return s1.km;
}

// Handler klik tombol GPS
function detectCurrentKm() {
  if (!navigator.geolocation) {
    alert("Perangkat atau browser Anda tidak mendukung fitur lokasi (GPS).");
    return;
  }

  const iconGps = document.getElementById("icon-gps");
  const iconLoading = document.getElementById("icon-gps-loading");

  if (iconGps && iconLoading) {
    iconGps.classList.add("hidden");
    iconLoading.classList.remove("hidden");
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (iconGps && iconLoading) {
        iconGps.classList.remove("hidden");
        iconLoading.classList.add("hidden");
      }

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const detectedKm = calculateKmFromCoords(userLat, userLng);

      if (detectedKm !== null) {
        const kmInput = document.getElementById("current-km");
        if (kmInput) {
          kmInput.value = detectedKm;
          animatedRouting(false);
        }
      } else {
        alert("Tidak dapat menentukan posisi KM dari lokasi saat ini.");
      }
    },
    (error) => {
      if (iconGps && iconLoading) {
        iconGps.classList.remove("hidden");
        iconLoading.classList.add("hidden");
      }

      let errorMsg = "Gagal mengambil lokasi GPS.";
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = "Akses lokasi ditolak. Harap izinkan akses lokasi (GPS) pada browser Anda.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = "Sinyal GPS tidak tersedia atau perangkat sedang di dalam ruangan.";
      } else if (error.code === error.TIMEOUT) {
        errorMsg = "Waktu pencarian lokasi habis. Silakan coba lagi.";
      }
      alert(errorMsg);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

// PWA Install Prompt
window.addEventListener('load', () => {
  let deferredPrompt;
  const installBtn = document.getElementById('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.classList.remove('hidden');
      installBtn.classList.add('inline-flex');
    }
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.classList.add('hidden');
        deferredPrompt = null;
      } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        alert('Untuk memasang di iPhone/iPad: Tekan ikon "Share" di Safari, lalu "Add to Home Screen".');
      }
    });
  }
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone && installBtn) {
    installBtn.classList.remove('hidden');
    installBtn.classList.add('inline-flex');
  }
  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.classList.add('hidden');
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }
});

document.addEventListener("DOMContentLoaded", initApp);