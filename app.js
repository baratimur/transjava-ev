// SPKLU Trans Jawa - Core Application Logic
const APP_VERSION = '1.0.7';

let i18nDictionary = {};
let SPKLU_NETWORK = [];
let HIGHWAY_GRAPH = {};
let CITIES = [];
let currentLang = localStorage.getItem('lang') || 'id';

let selectedSegmentFilter = null;
let selectedSpeedFilter = 'all';
let selectedConnectors = new Set(['CCS2', 'Chademo', 'AC']);
let openDropdownId = null;

// State Favorit
let savedFavorites = JSON.parse(localStorage.getItem('spklu_favs')) || [];

// ==========================================
// 1. HELPERS & OPERATIONAL DATA
// ==========================================

function getStationId(s) {
  return `${s.segment}_${s.side}_${s.km}`;
}

function isOperational(item) {
  if (!item) return false;
  if (item.status !== undefined) return item.status === 50;
  return true; 
}

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

    if (chargerHasOperationalPort) operationalMachinesCount++;
  });

  const isCompletelyOffline = allPorts.length > 0 ? (operationalPorts.length === 0) : !stationIsOp;
  let powerValues = operationalPorts.map(p => Number(p.power_max) || 0).filter(pw => pw > 0);

  const highestPower = powerValues.length > 0 ? Math.max(...powerValues) : (isCompletelyOffline ? 0 : (s.highest_power || 0));
  const lowestPower = powerValues.length > 0 ? Math.min(...powerValues) : (isCompletelyOffline ? 0 : (s.lowest_power || 0));
  const operationalTypes = [...new Set(operationalPorts.map(p => p.type))];

  return { isCompletelyOffline, operationalMachinesCount, operationalPortsCount: operationalPorts.length, highestPower, lowestPower, operationalTypes };
}

// ==========================================
// 2. DETEKSI GPS & LOKASI
// ==========================================

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateKmFromCoords(userLat, userLng) {
  if (!SPKLU_NETWORK || SPKLU_NETWORK.length === 0) return null;
  const validStations = SPKLU_NETWORK
    .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number' && typeof s.km === 'number')
    .map(s => ({ ...s, dist: getDistanceKm(userLat, userLng, s.lat, s.lng) }))
    .sort((a, b) => a.dist - b.dist);

  if (validStations.length === 0) return null;
  const s1 = validStations[0];
  const s2 = validStations.slice(1).find(s => s.segment === s1.segment && s.km !== s1.km);
  
  if (s2) {
    const dLat = s2.lat - s1.lat, dLng = s2.lng - s1.lng;
    const lenSq = dLat * dLat + dLng * dLng;
    if (lenSq > 0) {
      const t = ((userLat - s1.lat) * dLat + (userLng - s1.lng) * dLng) / lenSq;
      if (t >= -0.2 && t <= 1.2) return Math.round(s1.km + Math.max(0, Math.min(1, t)) * (s2.km - s1.km));
    }
  }
  return s1.km;
}

function detectCurrentKm() {
  if (!navigator.geolocation) return alert("Browser tidak mendukung GPS.");
  const iconGps = document.getElementById("icon-gps");
  const iconLoading = document.getElementById("icon-gps-loading");
  if (iconGps && iconLoading) { iconGps.classList.add("hidden"); iconLoading.classList.remove("hidden"); }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (iconGps && iconLoading) { iconGps.classList.remove("hidden"); iconLoading.classList.add("hidden"); }
      const detectedKm = calculateKmFromCoords(pos.coords.latitude, pos.coords.longitude);
      if (detectedKm !== null) {
        const kmInput = document.getElementById("current-km");
        if (kmInput) {
          kmInput.value = detectedKm;
          onBatteryChange(); // Simpan otomatis ke persistensi
        }
      } else alert("Gagal menentukan KM.");
    },
    (err) => {
      if (iconGps && iconLoading) { iconGps.classList.remove("hidden"); iconLoading.classList.add("hidden"); }
      alert("Akses lokasi ditolak atau sinyal lemah.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

// ==========================================
// 3. NAVIGATION CHOOSER & FAVORITES
// ==========================================

let currentNavTarget = { lat: 0, lng: 0, name: '' };

function openNativeNavigation(lat, lng, name) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);
  const cleanName = encodeURIComponent(name || 'SPKLU');

  if (isAndroid) {
    window.location.href = `geo:${lat},${lng}?q=${lat},${lng}(${cleanName})`;
  } else if (isIOS) {
    currentNavTarget = { lat, lng, name: cleanName };
    showNavChooser();
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
  }
}

function showNavChooser() {
  const modal = document.getElementById('nav-chooser');
  const backdrop = document.getElementById('nav-chooser-backdrop');
  const panel = document.getElementById('nav-chooser-panel');
  if (!modal || !backdrop || !panel) return;
  modal.classList.remove('hidden'); modal.classList.add('flex');
  void modal.offsetWidth;
  backdrop.classList.remove('opacity-0'); backdrop.classList.add('opacity-100');
  panel.classList.remove('translate-y-full'); panel.classList.add('translate-y-0');
}

function closeNavChooser() {
  const modal = document.getElementById('nav-chooser');
  const backdrop = document.getElementById('nav-chooser-backdrop');
  const panel = document.getElementById('nav-chooser-panel');
  if (!modal || !backdrop || !panel) return;
  backdrop.classList.remove('opacity-100'); backdrop.classList.add('opacity-0');
  panel.classList.remove('translate-y-0'); panel.classList.add('translate-y-full');
  setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
}

function launchNavApp(appType) {
  const { lat, lng, name } = currentNavTarget;
  if (appType === 'gmaps') window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  else if (appType === 'waze') window.location.href = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  else if (appType === 'apple') window.location.href = `https://maps.apple.com/?daddr=${lat},${lng}&q=${name}`;
  closeNavChooser();
}

function toggleFavorite(sId) {
  if (savedFavorites.includes(sId)) savedFavorites = savedFavorites.filter(id => id !== sId);
  else savedFavorites.push(sId);
  localStorage.setItem('spklu_favs', JSON.stringify(savedFavorites));
  renderFavorites();
  animatedRouting(false);
}

function clearFavorites(e) {
  e.stopPropagation();
  if (confirm('Hapus semua SPKLU tersimpan?')) {
    savedFavorites = [];
    localStorage.setItem('spklu_favs', JSON.stringify(savedFavorites));
    renderFavorites();
    animatedRouting(false);
  }
}

function toggleFavorites() {
  const content = document.getElementById('favorites-content');
  const chevron = document.getElementById('fav-chevron');
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden'); chevron.classList.remove('rotate-180');
  } else {
    content.classList.add('hidden'); chevron.classList.add('rotate-180');
  }
}

function renderFavorites() {
  const section = document.getElementById('favorites-section');
  const content = document.getElementById('favorites-content');
  const countEl = document.getElementById('fav-count');

  if (savedFavorites.length === 0) {
    section.classList.add('hidden'); return;
  }
  section.classList.remove('hidden');
  countEl.textContent = savedFavorites.length;

  const favStations = SPKLU_NETWORK.filter(s => savedFavorites.includes(getStationId(s)));
  const currentKmVal = document.getElementById("current-km")?.value.trim() || "";
  const hasCurrentKm = currentKmVal !== "" && !isNaN(parseFloat(currentKmVal));
  const curKm = hasCurrentKm ? parseFloat(currentKmVal) : null;

  const processedFavs = favStations.map((s, idx) => {
    let opData = evaluateStationOperationalData(s);
    let distAhead = null;
    if (hasCurrentKm) distAhead = Math.abs(s.km - curKm);
    return { ...s, ...opData, distAhead, distFromPrev: 0, isWithinBattery: true, isFavList: true };
  });

  content.innerHTML = processedFavs.map((s, idx) => generateStationCardHTML(s, idx, true)).join("");
}

// ==========================================
// 4. PERSISTENT FILTERS
// ==========================================

function loadPersistentFilters() {
  const batteryInput = document.getElementById("battery-range");
  const rangeCheckbox = document.getElementById("filter-within-range");
  const kmInput = document.getElementById("current-km");

  const savedBattery = localStorage.getItem("spklu_battery_range");
  if (savedBattery !== null && batteryInput) batteryInput.value = savedBattery;

  const savedRangeFilter = localStorage.getItem("spklu_filter_within_range");
  if (savedRangeFilter !== null && rangeCheckbox) rangeCheckbox.checked = savedRangeFilter === "true";
  
  const savedKm = localStorage.getItem("spklu_current_km");
  if (savedKm !== null && kmInput) kmInput.value = savedKm;
}

function onBatteryChange() {
  const batteryInput = document.getElementById("battery-range");
  const kmInput = document.getElementById("current-km");
  if (batteryInput) localStorage.setItem("spklu_battery_range", batteryInput.value.trim());
  if (kmInput) localStorage.setItem("spklu_current_km", kmInput.value.trim());
  animatedRouting(false);
}

function onRangeFilterChange() {
  const rangeCheckbox = document.getElementById("filter-within-range");
  if (rangeCheckbox) localStorage.setItem("spklu_filter_within_range", rangeCheckbox.checked);
  animatedRouting(false);
}

// ==========================================
// 5. UI COMPONENTS & SCROLL
// ==========================================

function setupCorridorDesktopScroll() {
  const el = document.getElementById("corridor-summary");
  if (!el) return;
  el.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY * 0.9; }
  }, { passive: false });
  let isDown = false, startX = 0, scrollLeft = 0;
  el.addEventListener("mousedown", (e) => { isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  el.addEventListener("mouseleave", () => { isDown = false; });
  el.addEventListener("mouseup", () => { isDown = false; });
  el.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    el.scrollLeft = scrollLeft - ((e.pageX - el.offsetLeft) - startX) * 1.5;
  });
}

function animatedRouting(resetSegment = false) {
  if (resetSegment) selectedSegmentFilter = null;
  if (document.startViewTransition) document.startViewTransition(() => runRouting());
  else runRouting();
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  setTheme(saved ? (saved === 'dark' ? 'dark' : 'light') : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}
function toggleTheme() { setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'); }
function setTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.getElementById('theme-icon-dark').classList.toggle('hidden', theme !== 'dark');
  document.getElementById('theme-icon-light').classList.toggle('hidden', theme === 'dark');
  localStorage.setItem('theme', theme);
}

function t(key) { return i18nDictionary[currentLang] ? (i18nDictionary[currentLang][key] || key) : key; }

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;

  document.title = t('seo_title');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', t('seo_desc'));

  const btnId = document.getElementById('btn-id');
  const btnEn = document.getElementById('btn-en');
  if (btnId) btnId.className = `px-2 h-6 text-[10px] font-bold rounded transition-all ${lang === 'id' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`;
  if (btnEn) btnEn.className = `px-2 h-6 text-[10px] font-bold rounded transition-all ${lang === 'en' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`;

  const swapBtn = document.getElementById('btn-swap');
  if (swapBtn) { swapBtn.title = t('swap_tooltip'); swapBtn.setAttribute('aria-label', t('swap_tooltip')); }

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (el.tagName === 'INPUT') el.placeholder = t(key);
    else if (el.tagName === 'OPTION') el.textContent = t(key);
    else if (el.children.length > 0 && !el.hasAttribute('data-i18n-replace')) {
      Array.from(el.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') node.nodeValue = t(key) + ' ';
      });
      el.title = t(key); el.setAttribute('aria-label', t(key));
    } else el.textContent = t(key);
  });

  renderFavorites();
  animatedRouting(false);
}

function populateDropdowns(cities) {
  renderDropdownItems('origin', cities, 'jakarta');
  renderDropdownItems('destination', cities, 'surabaya');
}

function renderDropdownItems(type, cities, defaultVal) {
  const listContainer = document.getElementById(`${type}-list`);
  const input = document.getElementById(type);
  if (defaultVal) {
    input.value = defaultVal;
    const initialCity = CITIES.find(c => c.id === defaultVal);
    if (initialCity) document.getElementById(`${type}-label`).textContent = initialCity.name;
  }
  const currentSelected = input.value;
  if (!cities || cities.length === 0) {
    listContainer.innerHTML = `<div class="px-2 py-3 text-center text-xs text-slate-500">Kota tidak ditemukan</div>`;
    return;
  }
  listContainer.innerHTML = cities.map(city => {
    const isSelected = city.id === currentSelected;
    return `<button type="button" aria-selected="${isSelected}" onclick="selectCity('${type}', '${city.id}', '${city.name.replace(/'/g, "\\'")}')" class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${isSelected ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}"><span>${city.name}</span>${isSelected ? '<span class="text-emerald-600 dark:text-emerald-400 text-xs">✓</span>' : ''}</button>`;
  }).join("");
}

function filterCities(type) {
  const query = (document.getElementById(`${type}-search`).value || "").toLowerCase().trim();
  renderDropdownItems(type, CITIES.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)));
}

function toggleDropdown(type) {
  closeAllDropdowns();
  if (openDropdownId !== type) {
    const searchInput = document.getElementById(`${type}-search`);
    if (searchInput) { searchInput.value = ''; renderDropdownItems(type, CITIES); }
    document.getElementById(`${type}-menu`).classList.remove('hidden');
    document.getElementById(`${type}-chevron`).classList.add('rotate-180');
    openDropdownId = type;
    setTimeout(() => { if (searchInput) searchInput.focus(); }, 50);
  }
}

function closeAllDropdowns() {
  ['origin', 'destination'].forEach(type => {
    document.getElementById(`${type}-menu`)?.classList.add('hidden');
    document.getElementById(`${type}-chevron`)?.classList.remove('rotate-180');
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
  document.getElementById("btn-swap").classList.toggle("swap-active");
  const originInput = document.getElementById("origin"), destInput = document.getElementById("destination");
  const tempVal = originInput.value; originInput.value = destInput.value; destInput.value = tempVal;
  const originCity = CITIES.find(c => c.id === originInput.value), destCity = CITIES.find(c => c.id === destInput.value);
  if (originCity) { document.getElementById("origin-label").textContent = originCity.name; renderDropdownItems('origin', CITIES, originInput.value); }
  if (destCity) { document.getElementById("destination-label").textContent = destCity.name; renderDropdownItems('destination', CITIES, destInput.value); }
  animatedRouting(true);
}

document.addEventListener('click', (e) => { if (!e.target.closest('#dropdown-origin-wrapper') && !e.target.closest('#dropdown-destination-wrapper')) closeAllDropdowns(); });
function clearKm() { 
  document.getElementById("current-km").value = ""; 
  localStorage.removeItem("spklu_current_km");
  animatedRouting(false); 
}
function toggleSegmentFilter(segKey) { selectedSegmentFilter = (selectedSegmentFilter === segKey) ? null : segKey; animatedRouting(false); }
function setSpeedFilter(minPower) {
  selectedSpeedFilter = minPower;
  ['all', '50', '100', '200'].forEach(val => {
    const btn = document.getElementById(`btn-speed-${val}`);
    if (btn) btn.className = val === minPower ? "h-6 px-1.5 rounded text-[11px] font-bold transition-all bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "h-6 px-1.5 rounded text-[11px] font-bold transition-all text-slate-600 dark:text-slate-300";
  });
  animatedRouting(false);
}
function toggleConnector(type) {
  if (selectedConnectors.has(type)) { if (selectedConnectors.size > 1) selectedConnectors.delete(type); } else selectedConnectors.add(type);
  ['CCS2', 'Chademo', 'AC'].forEach(tp => {
    const btn = document.getElementById(`btn-conn-${tp.toLowerCase()}`);
    if (btn) btn.className = selectedConnectors.has(tp) ? "h-6 px-1.5 rounded text-[11px] font-bold transition-all bg-emerald-600 text-white shadow-sm dark:bg-emerald-600 active:scale-95" : "h-6 px-1.5 rounded text-[11px] font-bold transition-all text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white active:scale-95";
  });
  animatedRouting(false);
}

function formatSegment(segment, side) {
  const parts = segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1));
  return side === 'B' ? `${parts[1]} → ${parts[0]}` : `${parts[0]} → ${parts[1]}`;
}

function findRoute(start, end) {
  if (start === end) return null;
  let queue = [[start, []]], visited = new Set([start]);
  while (queue.length > 0) {
    let [current, path] = queue.shift();
    if (current === end) return path;
    const neighbors = HIGHWAY_GRAPH[current] || [];
    for (let edge of neighbors) {
      if (!visited.has(edge.to)) { visited.add(edge.to); queue.push([edge.to, [...path, edge]]); }
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

// ==========================================
// 6. SHARED HTML CARD GENERATOR
// ==========================================

function generateStationCardHTML(s, idx, isFavList = false) {
  const sId = getStationId(s);
  const isOffline = s.isCompletelyOffline;
  const isFav = savedFavorites.includes(sId);
  const unitLabel = t('label_unit');
  const portLabel = t('label_port');

  let capacityBadge = '';
  if (isOffline) capacityBadge = `<span class="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 line-through">⚠️ Off</span>`;
  else if (s.operationalMachinesCount > 4 && s.operationalPortsCount > 10) capacityBadge = `<span class="inline-flex items-center gap-0.5 font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30">⚡⚡ ${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})</span>`;
  else if (s.operationalMachinesCount <= 1) capacityBadge = `<span class="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})</span>`;
  else capacityBadge = `<span class="inline-flex items-center gap-0.5 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30">⚡ ${s.operationalMachinesCount} ${unitLabel} (${s.operationalPortsCount} ${portLabel})</span>`;

  let distanceBadge = '';
  if (s.distAhead !== null && s.distAhead !== undefined) {
    distanceBadge = `<span class="inline-flex items-center font-mono font-extrabold text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">📍 ${Math.round(s.distAhead)} ${t('km_ahead')}</span>`;
  } else if (!isFavList) {
    distanceBadge = idx === 0 
      ? `<span class="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">${t('first_stop')}</span>`
      : `<span class="inline-flex items-center font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">🚗 +${s.distFromPrev} ${t('from_prev_stop')}</span>`;
  }

  let batteryBadge = '';
  if (s.isWithinBattery !== null && s.isWithinBattery !== undefined && !isFavList) {
    batteryBadge = s.isWithinBattery
      ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">✓ ${t('within_battery')}</span>`
      : `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30">⚠️ ${t('outside_battery')}</span>`;
  }

  const dispenserGroupMap = {};
  (s.chargers || []).forEach(charger => {
    const chargerIsOp = !isOffline && isOperational(charger);
    const portGroups = {};
    (charger.ports || []).forEach(port => {
      const portIsOp = chargerIsOp && isOperational(port);
      const powerLabel = port.power_max || (typeof port.power === 'string' ? port.power.replace(' kW','') : port.power);
      const groupKey = `${port.type} ${powerLabel}___${portIsOp}`;
      if (!portGroups[groupKey]) portGroups[groupKey] = { type: port.type, power: powerLabel, isOp: portIsOp, count: 0 };
      portGroups[groupKey].count += 1;
    });

    const portSummaries = Object.values(portGroups).map(pg => {
      const countPrefix = pg.count > 1 ? `${pg.count}× ` : '';
      return pg.isOp 
        ? `<span>${countPrefix}${pg.type} ${pg.power}</span>` 
        : `<span class="line-through decoration-rose-500 text-slate-400 dark:text-slate-500" title="Port Mati">${countPrefix}${pg.type} ${pg.power}</span>`;
    }).join('<span class="text-slate-300 dark:text-slate-700 mx-1">•</span>');

    const signature = `${charger.brand}___${portSummaries}`;
    if (!dispenserGroupMap[signature]) dispenserGroupMap[signature] = { brand: charger.brand, portSummaries: portSummaries, count: 0, chargerIsOp: chargerIsOp };
    dispenserGroupMap[signature].count += 1;
  });

  const dispenserList = Object.values(dispenserGroupMap).map(item => {
    const machineCountPrefix = item.count > 1 ? `<span class="font-extrabold ${item.chargerIsOp ? 'text-emerald-800 dark:text-emerald-400' : 'text-slate-400'} mr-0.5">${item.count}×</span>` : '';
    return `
      <div class="inline-flex items-center gap-1 ${item.chargerIsOp ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800' : 'bg-slate-100/70 dark:bg-slate-900/30 border-dashed border-slate-300 dark:border-slate-800 opacity-60'} border rounded px-1.5 py-0.5 text-[10px]">
        <span class="w-1.5 h-1.5 rounded-full ${item.chargerIsOp ? getBrandDot(item.brand) : 'bg-slate-400'} shrink-0"></span>
        <span class="font-bold ${item.chargerIsOp ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'}">${machineCountPrefix}${item.brand}</span>
        <span class="text-slate-300 dark:text-slate-700" aria-hidden="true">|</span>
        <span class="font-mono font-bold flex items-center flex-wrap">${item.portSummaries}</span>
      </div>
    `;
  }).join("");

  const staggerDelay = Math.min(idx * 20, 200);
  const cardContainerStyle = isOffline ? "opacity-60 bg-slate-100/50 dark:bg-slate-900/20 border-slate-300 dark:border-slate-800" : "bg-white dark:bg-slate-900/60 hover:bg-slate-50/80 dark:hover:bg-slate-900/90 border-slate-200 dark:border-slate-800/80 shadow-sm";
  const titleStyle = isOffline ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400";
  
  const heartSVG = isFav 
    ? `<svg class="w-4 h-4 fill-rose-500 text-rose-500" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    : `<svg class="w-4 h-4 fill-transparent stroke-slate-400 hover:stroke-rose-500 transition-colors" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"></path></svg>`;

  return `
    <article style="animation-delay: ${staggerDelay}ms" class="animate-ios-card group border rounded-xl p-2.5 sm:p-3 transition-all ${cardContainerStyle}">
      <div class="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
        <div class="flex items-center gap-1 flex-wrap">
          <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded ${s.side === 'A' ? 'bg-sky-100 text-sky-900 border border-sky-200 dark:bg-sky-500/20 dark:text-sky-400 dark:border-sky-500/30' : 'bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30'}">${s.side}</span>
          ${capacityBadge}
          ${distanceBadge}
          ${batteryBadge}
        </div>
        <div class="text-right shrink-0">
          <span class="font-mono font-extrabold text-sm sm:text-base ${isOffline ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}">
            ${isOffline ? '0' : (s.lowestPower !== s.highestPower ? `${s.lowestPower}~${s.highestPower}` : s.highestPower)}<span class="text-[10px] font-sans font-bold text-slate-400 ml-0.5">kW</span>
          </span>
        </div>
      </div>
      <div class="mt-1.5 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <h2 class="font-extrabold text-xs sm:text-sm leading-tight transition-colors ${titleStyle} truncate">${s.name}</h2>
          <span class="text-[10px] text-slate-400 font-medium">${formatSegment(s.segment, s.side)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" onclick="toggleFavorite('${sId}')" aria-label="Simpan Favorit" title="Simpan" class="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 shadow-sm active:scale-90 transition-all">
            ${heartSVG}
          </button>
          
          <button type="button" onclick="openNativeNavigation(${s.lat}, ${s.lng}, '${s.name.replace(/'/g, "\\'")}')" aria-label="Navigasi ke ${s.name}" title="Navigasi" class="inline-flex sm:hidden items-center justify-center h-7 w-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95 transition-all">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
          </button>
          <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" aria-label="Buka di Google Maps" title="Maps" target="_blank" rel="noopener" class="hidden sm:inline-flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm active:scale-95 transition-all">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </a>
          <a href="https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes" aria-label="Buka di Waze" title="Waze" target="_blank" rel="noopener" class="hidden sm:inline-flex items-center justify-center h-7 w-7 rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-sm active:scale-95 transition-all">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M20.5 12c0-4.69-3.81-8.5-8.5-8.5S3.5 7.31 3.5 12c0 2.21.84 4.22 2.22 5.73l-1.16 3.48c-.14.42.24.83.67.72l3.65-.91c1.37.63 2.91.98 4.54.98 4.69 0 8.5-3.81 8.5-8.5zm-11 1.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
          </a>
        </div>
      </div>
      <div class="mt-1.5 flex flex-wrap gap-1">${dispenserList}</div>
    </article>
  `;
}

// ==========================================
// 7. MAIN ROUTING & FILTERING ALGORITHM
// ==========================================

function runRouting() {
  if (SPKLU_NETWORK.length === 0 || Object.keys(HIGHWAY_GRAPH).length === 0) return;

  const origin = document.getElementById("origin").value;
  const destination = document.getElementById("destination").value;
  const currentKmVal = document.getElementById("current-km")?.value.trim() || "";
  const hasCurrentKm = currentKmVal !== "" && !isNaN(parseFloat(currentKmVal));
  const curKm = hasCurrentKm ? parseFloat(currentKmVal) : null;
  const batteryRangeVal = document.getElementById("battery-range")?.value.trim() || "";
  const hasBatteryRange = batteryRangeVal !== "" && !isNaN(parseFloat(batteryRangeVal));
  const batteryRange = hasBatteryRange ? parseFloat(batteryRangeVal) : null;
  const filterWithinRange = document.getElementById("filter-within-range")?.checked || false;

  const resultsContainer = document.getElementById("results-list");
  const corridorSummary = document.getElementById("corridor-summary");
  const matchCounter = document.getElementById("match-counter");

  if (origin === destination) {
    corridorSummary.innerHTML = "";
    matchCounter.textContent = `0 ${t('spots_ahead')}`;
    resultsContainer.innerHTML = `<div class="text-center py-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-white/80 dark:bg-slate-900/40 animate-ios-card"><p class="text-slate-600 dark:text-slate-400 text-xs font-bold">${t('err_same_city')}</p></div>`;
    return;
  }

  const legs = findRoute(origin, destination);
  if (!legs) {
    resultsContainer.innerHTML = `<div class="p-6 text-center text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-white/80 dark:bg-slate-900/40 animate-ios-card text-xs font-bold">${t('err_no_route')}</div>`;
    return;
  }

  // Render Horizontal Tabs untuk Segment (Ruas Jalan)
  let chipsMarkup = `<button type="button" aria-pressed="${selectedSegmentFilter === null}" onclick="selectedSegmentFilter = null; animatedRouting(false)" class="whitespace-nowrap shrink-0 h-7 px-2.5 rounded-md text-[11px] font-bold transition-all ${selectedSegmentFilter === null ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'} active:scale-95">${t('all_segments')}</button>`;
  chipsMarkup += legs.map(leg => {
    const isSelected = selectedSegmentFilter === leg.segment;
    return `<button type="button" aria-pressed="${isSelected}" onclick="toggleSegmentFilter('${leg.segment}')" class="whitespace-nowrap shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-mono transition-all ${isSelected ? 'bg-emerald-700 text-white dark:bg-emerald-600 font-bold shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'} active:scale-95"><span class="w-3.5 h-3.5 rounded text-[9px] font-black flex items-center justify-center ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400'}">${leg.side}</span><span class="font-bold">${formatSegment(leg.segment, leg.side)}</span></button>`;
  }).join("");
  corridorSummary.innerHTML = chipsMarkup;

  let matchedStations = [];
  legs.forEach(leg => {
    let stationsOnLeg = SPKLU_NETWORK.filter(s => s.segment === leg.segment && s.side === leg.side);
    stationsOnLeg.sort((a, b) => leg.order === 'asc' ? a.km - b.km : b.km - a.km);
    stationsOnLeg.forEach(s => matchedStations.push({ ...s, legOrder: leg.order }));
  });

  if (selectedSegmentFilter) matchedStations = matchedStations.filter(s => s.segment === selectedSegmentFilter);
  matchedStations = matchedStations.map(s => ({ ...s, ...evaluateStationOperationalData(s) }));

  if (selectedConnectors.size > 0 && selectedConnectors.size < 3) {
    matchedStations = matchedStations.filter(s => s.isCompletelyOffline ? (s.types || []).some(tp => selectedConnectors.has(tp)) : s.operationalTypes.some(tp => selectedConnectors.has(tp)));
  }

  if (selectedSpeedFilter !== 'all') {
    const minKW = parseInt(selectedSpeedFilter, 10);
    matchedStations = matchedStations.filter(s => s.highestPower >= minKW);
  }

  // --- CROSS-SEGMENT DISTANCE CALCULATION LOGIC ---
  let userLegIndex = -1;
  if (hasCurrentKm) {
    let minDiff = Infinity;
    matchedStations.forEach((s) => {
      let diff = Math.abs(s.km - curKm);
      if (diff < minDiff) {
        minDiff = diff;
        userLegIndex = legs.findIndex(l => l.segment === s.segment);
      }
    });
    if (userLegIndex === -1) userLegIndex = 0;
  }

  let firstAheadIdx = -1;
  if (hasCurrentKm) {
    for (let i = 0; i < matchedStations.length; i++) {
      const s = matchedStations[i];
      const sLegIdx = legs.findIndex(l => l.segment === s.segment);
      
      if (sLegIdx > userLegIndex) {
        firstAheadIdx = i;
        break;
      } else if (sLegIdx === userLegIndex) {
        const isAhead = s.legOrder === 'asc' ? (s.km >= curKm) : (s.km <= curKm);
        if (isAhead) {
          firstAheadIdx = i;
          break;
        }
      }
    }
  }

  let passedCount = 0;
  if (hasCurrentKm) {
    if (firstAheadIdx === -1) {
      passedCount = matchedStations.length;
      matchedStations = [];
    } else {
      passedCount = firstAheadIdx;
      let keptStations = matchedStations.slice(passedCount);
      let accumulatedDistance = 0;

      keptStations = keptStations.map((s, idx) => {
        let distFromPrev = 0;
        if (idx === 0) {
          const sLegIdx = legs.findIndex(l => l.segment === s.segment);
          if (sLegIdx === userLegIndex) {
            accumulatedDistance = Math.abs(s.km - curKm);
          } else {
            if (passedCount > 0) {
              const prev = matchedStations[passedCount - 1];
              let distToNext = (s.segment === prev.segment) ? Math.abs(s.km - prev.km) : Math.round(getDistanceKm(s.lat, s.lng, prev.lat, prev.lng) * 1.15);
              let userToPrev = 0;
              const prevLegIdx = legs.findIndex(l => l.segment === prev.segment);
              if (prevLegIdx === userLegIndex) userToPrev = Math.abs(curKm - prev.km);
              accumulatedDistance = userToPrev + distToNext;
            } else accumulatedDistance = Math.abs(s.km - curKm);
          }
        } else {
          const prev = keptStations[idx - 1];
          if (s.segment === prev.segment) distFromPrev = Math.abs(s.km - prev.km);
          else distFromPrev = Math.round(getDistanceKm(s.lat, s.lng, prev.lat, prev.lng) * 1.15);
          accumulatedDistance += distFromPrev;
        }
        
        let distAhead = accumulatedDistance;
        let isWithinBattery = hasBatteryRange ? (distAhead <= batteryRange) : null;
        return { ...s, distFromPrev, distAhead, isWithinBattery };
      });
      matchedStations = keptStations;
    }
  } else {
    // Normal Mapping (no GPS/curKm)
    matchedStations = matchedStations.map((s, idx, arr) => {
      let distFromPrev = 0;
      if (idx > 0) {
        const prev = arr[idx - 1];
        if (s.segment === prev.segment) distFromPrev = Math.abs(s.km - prev.km);
        else distFromPrev = Math.round(getDistanceKm(s.lat, s.lng, prev.lat, prev.lng) * 1.15);
      }
      return { ...s, distFromPrev, distAhead: null, isWithinBattery: null };
    });
  }

  if (filterWithinRange && hasBatteryRange && hasCurrentKm) {
    matchedStations = matchedStations.filter(s => s.isWithinBattery);
  }
  // --- END DISTANCE LOGIC ---

  const ultraCount = matchedStations.filter(s => s.highestPower >= 200 && !s.isCompletelyOffline).length;
  let counterText = `${matchedStations.length} ${t('spots_ahead')} (${ultraCount} ${t('speed_ultra')} 200 kW)`;
  if (passedCount > 0) counterText += ` • <span class="text-amber-700 dark:text-amber-400 font-bold">${passedCount} ${t('past_hidden')}</span>`;
  matchCounter.innerHTML = counterText;

  if (matchedStations.length === 0) {
    resultsContainer.innerHTML = `<div class="text-center py-6 border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 rounded-xl animate-ios-card shadow-sm"><p class="text-slate-600 dark:text-slate-400 text-xs font-bold">${t('err_no_match')}</p></div>`;
    return;
  }

  resultsContainer.innerHTML = matchedStations.map((s, idx) => generateStationCardHTML(s, idx)).join("");
}

// ==========================================
// 8. APP INITIALIZATION
// ==========================================

async function initApp() {
  const loader = document.getElementById("initial-loader");
  const appContent = document.getElementById("app-content");

  initTheme();
  setupCorridorDesktopScroll();

  try {
    const [langRes, stationsRes, graphRes, citiesRes] = await Promise.all([
      fetch(`i18n.json?v=${APP_VERSION}`),
      fetch(`stations.json?v=${APP_VERSION}`),
      fetch(`highway.json?v=${APP_VERSION}`),
      fetch(`cities.json?v=${APP_VERSION}`)
    ]);

    i18nDictionary = await langRes.json();
    HIGHWAY_GRAPH = await graphRes.json();
    CITIES = await citiesRes.json();
    
    SPKLU_NETWORK = (await stationsRes.json()).map(s => ({
      segment: s.seg || s.segment, side: s.sd || s.side, km: s.km, name: s.n || s.name, lat: s.lat, lng: s.lng,
      status: s.s !== undefined ? s.s : (s.status !== undefined ? s.status : 50),
      types: [...new Set((s.c || s.chargers || []).flatMap(ch => (ch.p || ch.ports || []).map(pt => pt.t || pt.type)))],
      chargers: (s.c || s.chargers || []).map(ch => ({
        brand: ch.b || ch.brand, status: ch.s !== undefined ? ch.s : (ch.status !== undefined ? ch.status : 50),
        ports: (ch.p || ch.ports || []).map(pt => ({ type: pt.t || pt.type, power_max: pt.kw !== undefined ? pt.kw : 0, status: pt.s !== undefined ? pt.s : 50 }))
      }))
    }));

    populateDropdowns(CITIES);
    setLang(currentLang);
    loadPersistentFilters();
    renderFavorites();
    
    setTimeout(() => {
      if (loader) { loader.style.opacity = '0'; loader.style.visibility = 'hidden'; }
      if (appContent) appContent.style.opacity = '1';
    }, 150);
  } catch (err) {
    if (loader) { loader.style.opacity = '0'; loader.style.visibility = 'hidden'; }
    if (appContent) appContent.style.opacity = '1';
    document.getElementById("results-list").innerHTML = `<div class="p-5 text-center text-rose-700 bg-rose-50 border border-rose-300 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800/60 rounded-xl text-xs font-bold animate-ios-card">Gagal memuat data SPKLU. Pastikan koneksi internet aktif.</div>`;
  }
}

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(console.warn);
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
  }
  let deferredPrompt;
  const installBtn = document.getElementById('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (installBtn) { installBtn.classList.remove('hidden'); installBtn.classList.add('inline-flex'); }
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        if ((await deferredPrompt.userChoice).outcome === 'accepted') installBtn.classList.add('hidden');
        deferredPrompt = null;
      } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        alert('Untuk memasang di iPhone/iPad: Tekan ikon "Share" di Safari, lalu "Add to Home Screen".');
      }
    });
  }
});

document.addEventListener("DOMContentLoaded", initApp);