'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const UTP_NAME = 'Universidad Tecnológica de Puebla';
const PUEBLA_CENTER = [19.0433, -98.1981];
const WORLD_LEVELS = [
  { stage: 1, name: 'Semilla', threshold: 0, nextAt: 120, elements: ['Terreno inicial', 'Primera planta'] },
  { stage: 2, name: 'Brote', threshold: 120, nextAt: 250, elements: ['Arbustos', 'Más vegetación'] },
  { stage: 3, name: 'Ruta Verde', threshold: 250, nextAt: 450, elements: ['Árboles', 'Camino verde'] },
  { stage: 4, name: 'Conductor Verde', threshold: 450, nextAt: 700, elements: ['Pequeño parque', 'Comunidad'] },
  { stage: 5, name: 'Embajador Verde', threshold: 700, nextAt: null, elements: ['Entorno ecológico completo', 'Insignia especial'] }
];

const state = {
  user: null, csrfToken: '', allowedDomains: [], rides: [], deferredInstall: null,
  near: null, ridesMap: null, ridesLayer: null, nearLayer: null,
  publishMap: null, publishMode: 'origin', publishMarkers: {}, publishLayer: null,
  ecoStage: 0, ecoLab: null, labAnimating: false
};

const els = {
  navToggle: $('#navToggle'), navLinks: $('#navLinks'), adminLink: $('#adminLink'), installBtn: $('#installBtn'),
  loginBtn: $('#loginBtn'), registerBtn: $('#registerBtn'), userMenuBtn: $('#userMenuBtn'), userInitial: $('#userInitial'), userShortName: $('#userShortName'),
  searchForm: $('#searchForm'), originFilter: $('#originFilter'), destinationFilter: $('#destinationFilter'), dateFilter: $('#dateFilter'),
  timeFromFilter: $('#timeFromFilter'), timeToFilter: $('#timeToFilter'), seatsMinFilter: $('#seatsMinFilter'), directionFilter: $('#directionFilter'),
  routeTypeFilter: $('#routeTypeFilter'), clearFilters: $('#clearFilters'),
  nearbyBtn: $('#nearbyBtn'), radiusFilter: $('#radiusFilter'), clearNearby: $('#clearNearby'), nearbyStatus: $('#nearbyStatus'),
  ridesGrid: $('#ridesGrid'), ridesEmpty: $('#ridesEmpty'), resultsSummary: $('#resultsSummary'),
  ridesMapCard: $('#ridesMapCard'), ridesMap: $('#ridesMap'), ridesMapSummary: $('#ridesMapSummary'), mapsState: $('#mapsState'),
  publishBtn: $('#publishBtn'), publishNavBtn: $('#publishNavBtn'), publishBtnDashboard: $('#publishBtnDashboard'),
  authModal: $('#authModal'), authForm: $('#authForm'), authMode: $('#authMode'), authRegisterFields: $('#authRegisterFields'),
  authTitle: $('#authTitle'), authDescription: $('#authDescription'), authName: $('#authName'), authStudentId: $('#authStudentId'),
  authCareer: $('#authCareer'), authEmail: $('#authEmail'), authPassword: $('#authPassword'), authSubmit: $('#authSubmit'),
  authError: $('#authError'), switchAuthMode: $('#switchAuthMode'), allowedDomainsHelp: $('#allowedDomainsHelp'),
  publishModal: $('#publishModal'), publishForm: $('#publishForm'), publishSubmit: $('#publishSubmit'),
  publishDirection: $('#publishDirection'), publishDestination: $('#publishDestination'), publishOrigin: $('#publishOrigin'),
  publishPickup: $('#publishPickup'), routeTypeSelect: $('#routeTypeSelect'), connectionHubWrap: $('#connectionHubWrap'),
  placeSearchInput: $('#placeSearchInput'), placeSearchBtn: $('#placeSearchBtn'), publishMap: $('#publishMap'),
  publishMapMode: $('#publishMapMode'), publishMapStatus: $('#publishMapStatus'),
  originCoords: $('#originCoords'), destinationCoords: $('#destinationCoords'), pickupCoords: $('#pickupCoords'),
  reserveModal: $('#reserveModal'), reserveForm: $('#reserveForm'), reserveRideId: $('#reserveRideId'),
  reserveTitle: $('#reserveTitle'), reserveSummary: $('#reserveSummary'), reserveSeats: $('#reserveSeats'), reserveSubmit: $('#reserveSubmit'),
  accountModal: $('#accountModal'), accountName: $('#accountName'), accountMeta: $('#accountMeta'), logoutBtn: $('#logoutBtn'),
  networkState: $('#networkState'), pwaState: $('#pwaState'),
  miniUsers: $('#miniUsers'), miniRides: $('#miniRides'), miniCo2: $('#miniCo2'),
  co2Saved: $('#co2Saved'), fuelSaved: $('#fuelSaved'), moneySaved: $('#moneySaved'), sharedSeats: $('#sharedSeats'),
  parkingPassDemo: $('#parkingPassDemo'), demoPassCode: $('#demoPassCode'), demoPassengerCount: $('#demoPassengerCount'),
  demoPassengerList: $('#demoPassengerList'), demoQr: $('#demoQr'),
  ecoLevelName: $('#ecoLevelName'), ecoPoints: $('#ecoPoints'), ecoTrips: $('#ecoTrips'), ecoCo2: $('#ecoCo2'),
  ecoProgressBar: $('#ecoProgressBar'), ecoNextLevel: $('#ecoNextLevel'), ecoBadges: $('#ecoBadges'),
  ecoWorldStageName: $('#ecoWorldStageName'), ecoWorldStageChip: $('#ecoWorldStageChip'), ecoWorldScene: $('#ecoWorldScene'),
  ecoWorldPlants: $('#ecoWorldPlants'), ecoWorldHouse: $('#ecoWorldHouse'), ecoWorldCommunity: $('#ecoWorldCommunity'),
  ecoWorldBadge: $('#ecoWorldBadge'), ecoLevelFlash: $('#ecoLevelFlash'), ecoWorldProgressBar: $('#ecoWorldProgressBar'),
  ecoWorldProgressText: $('#ecoWorldProgressText'), ecoWorldElements: $('#ecoWorldElements'),
  dashboard: $('#dashboard'), publishedList: $('#publishedList'), reservationsList: $('#reservationsList'),
  adminPanel: $('#adminPanel'), adminStats: $('#adminStats'), adminUsers: $('#adminUsers'), refreshAdminBtn: $('#refreshAdminBtn'),
  ecoLab: $('#ecoLab'), ecoLabLevel: $('#ecoLabLevel'), ecoLabPoints: $('#ecoLabPoints'), ecoLabRange: $('#ecoLabRange'),
  ecoLabAnimate: $('#ecoLabAnimate'), ecoLabReset: $('#ecoLabReset'), ecoLabStatus: $('#ecoLabStatus'),
  ecoLabScene: $('#ecoLabScene'), ecoLabPlants: $('#ecoLabPlants'), ecoLabHouse: $('#ecoLabHouse'),
  ecoLabCommunity: $('#ecoLabCommunity'), ecoLabBadge: $('#ecoLabBadge'), ecoLabLevelName: $('#ecoLabLevelName'),
  ecoLabPointsLabel: $('#ecoLabPointsLabel'), ecoLabUnlocked: $('#ecoLabUnlocked')
};

function fmtMoney(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(v || 0)); }
function fmtNumber(v) { return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Number(v || 0)); }
function fmtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}
function htmlEscape(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function toast(message, type = 'ok') {
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
  node.textContent = message;
  $('#toastStack').append(node);
  setTimeout(() => node.remove(), 4400);
}
function setBusy(btn, busy, label = 'Procesando...') {
  if (!btn) return;
  if (busy) { btn.dataset.old = btn.textContent; btn.textContent = label; btn.disabled = true; }
  else { btn.textContent = btn.dataset.old || btn.textContent; btn.disabled = false; }
}
async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  if (!['GET', 'HEAD'].includes(method) && state.csrfToken) headers['X-CSRF-Token'] = state.csrfToken;
  const res = await fetch(path, { ...options, method, headers, credentials: 'same-origin' });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}

function renderQr(target, url, size) {
  if (!target) return;
  target.replaceChildren();
  if (!url) {
    const placeholder = document.createElement('small');
    placeholder.textContent = 'QR disponible al generar el pase';
    placeholder.style.color = '#285239';
    placeholder.style.textAlign = 'center';
    target.append(placeholder);
    return;
  }
  try {
    const modules = window.RodandoQR.encode(url);
    const quiet = 4;
    const total = modules.length + quiet * 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    svg.setAttribute('width', size || '100%');
    svg.setAttribute('height', size || '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Código QR verificable del pase Rodando Parking');
    svg.style.shapeRendering = 'crispEdges';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', total); bg.setAttribute('height', total); bg.setAttribute('fill', '#fff');
    svg.append(bg);
    let d = '';
    modules.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }));
    const pixels = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pixels.setAttribute('d', d); pixels.setAttribute('fill', '#142d1e');
    svg.append(pixels);
    target.append(svg);
  } catch (error) {
    target.textContent = 'No fue posible generar el QR.';
  }
}
function parkingVerificationUrl(code) {
  return `${location.origin}/verificar-pase.html?codigo=${encodeURIComponent(code)}`;
}

function networkState() {
  els.networkState.textContent = navigator.onLine ? 'En línea' : 'Sin conexión';
}
function pwaState(label) {
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  els.pwaState.textContent = label || (installed ? 'PWA instalada' : 'PWA lista');
}
function requireLogin(action) {
  if (state.user) return true;
  toast(`Debes iniciar sesión para ${action}.`, 'warn');
  openAuth('login');
  return false;
}

async function loadSession() {
  const data = await api('/api/session');
  state.user = data.user;
  state.csrfToken = data.csrfToken;
  state.allowedDomains = data.allowedDomains || [];
  renderCommunity(data.community);
  renderAuthState();
}
function renderCommunity(stats) {
  if (!stats) return;
  els.miniUsers.textContent = fmtNumber(stats.users);
  els.miniRides.textContent = fmtNumber(stats.rides);
  els.miniCo2.textContent = `${fmtNumber(stats.estimatedCo2Kg)} kg`;
  els.co2Saved.textContent = `${fmtNumber(stats.estimatedCo2Kg)} kg`;
  els.fuelSaved.textContent = `${fmtNumber(stats.gasolineSavedLiters)} L`;
  els.moneySaved.textContent = fmtMoney(stats.monthlySavingsPesos);
  els.sharedSeats.textContent = fmtNumber(stats.sharedSeats);
}

function renderAuthState() {
  const logged = !!state.user;
  window.dispatchEvent(new CustomEvent('rodando:session', { detail: { user: state.user, csrfToken: state.csrfToken } }));
  els.loginBtn.hidden = logged;
  els.registerBtn.hidden = logged;
  els.userMenuBtn.hidden = !logged;
  els.dashboard.hidden = !logged;
  const isAdmin = logged && state.user.role === 'admin';
  els.adminPanel.hidden = !isAdmin;
  els.adminLink.hidden = !isAdmin;
  if (logged) {
    els.userShortName.textContent = state.user.name.split(' ')[0];
    els.userInitial.textContent = state.user.name.charAt(0).toUpperCase();
    els.accountName.textContent = state.user.name;
    els.accountMeta.textContent = `${state.user.career} · ${state.user.studentId} · ${state.user.email}`;
    loadDashboard().catch(err => toast(err.message, 'error'));
    if (isAdmin) loadAdmin().catch(err => toast(err.message, 'error'));
  } else {
    renderGuestEco();
    els.publishedList.innerHTML = '';
    els.reservationsList.innerHTML = '';
    els.adminStats.innerHTML = '';
    els.adminUsers.innerHTML = '';
  }
}

function openAuth(mode = 'login') {
  const register = mode === 'register';
  els.authMode.value = mode;
  els.authRegisterFields.hidden = !register;
  els.authTitle.textContent = register ? 'Crear cuenta institucional' : 'Iniciar sesión';
  els.authDescription.textContent = register ? 'Regístrate con tu correo UTP para publicar y reservar viajes.' : 'Accede para ver tu panel, reservas, pases y EcoRodando.';
  els.authSubmit.textContent = register ? 'Crear cuenta' : 'Entrar';
  els.switchAuthMode.textContent = register ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  els.allowedDomainsHelp.textContent = `Correos permitidos: ${state.allowedDomains.map(x => '@' + x).join(' y ')}`;
  els.authError.hidden = true;
  els.authModal.showModal();
}

function updateConnectionField() {
  const show = els.routeTypeSelect.value === 'connection';
  els.connectionHubWrap.hidden = !show;
  els.publishForm.elements.connectionHub.required = show;
}
function localDatetimeInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function openPublish() {
  if (!requireLogin('publicar un viaje')) return;
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  els.publishForm.elements.departureAt.value = localDatetimeInput(d);
  updateConnectionField();
  els.publishModal.showModal();
  requestAnimationFrame(() => {
    ensurePublishMap();
    state.publishMap?.invalidateSize();
  });
}
function applyDirectionDefaults() {
  const direction = els.publishDirection.value;
  if (direction === 'from_utp') {
    if (!els.publishOrigin.value.trim() || els.publishOrigin.value.trim() === UTP_NAME) els.publishOrigin.value = 'UTP';
    if (els.publishDestination.value.trim() === UTP_NAME) els.publishDestination.value = '';
    els.publishDestination.placeholder = 'Zona de destino (Ej. Cholula)';
    els.publishOrigin.placeholder = 'UTP';
  } else {
    if (!els.publishDestination.value.trim() || els.publishDestination.value.trim() === UTP_NAME) els.publishDestination.value = UTP_NAME;
    if (els.publishOrigin.value.trim() === UTP_NAME) els.publishOrigin.value = 'UTP';
    els.publishOrigin.placeholder = 'Zona de origen (Ej. Cholula)';
    els.publishDestination.placeholder = 'Destino';
  }
}
function openReserve(ride) {
  if (!requireLogin('reservar')) return;
  els.reserveRideId.value = ride.id;
  els.reserveTitle.textContent = `${ride.origin} → ${ride.destination}`;
  els.reserveSummary.innerHTML = `
    <strong>${htmlEscape(ride.driver.name)}</strong><br />
    ${htmlEscape(fmtDate(ride.departureAt))}<br />
    Destino: ${htmlEscape(ride.destination)}<br />
    Punto de encuentro: ${htmlEscape(ride.pickupPoint)}<br />
    ${ride.routeType === 'connection' ? `Conexión en ${htmlEscape(ride.connectionHub)}<br />` : ''}
    Aportación por lugar: <strong>${htmlEscape(fmtMoney(ride.contribution))}</strong>`;
  els.reserveSeats.innerHTML = '';
  for (let i = 1; i <= Math.min(ride.seatsAvailable, 3); i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `${i} lugar${i === 1 ? '' : 'es'}`;
    els.reserveSeats.append(opt);
  }
  els.reserveModal.showModal();
}

function rideCard(ride) {
  const passengerNames = ride.passengers.slice(0, 3).map(p => `<span>${htmlEscape(p.name)} · ${htmlEscape(p.career || p.studentId)}</span>`).join('') || '<span>Sin pasajeros aún</span>';
  const directionLabel = ride.direction === 'from_utp' ? 'Regreso desde la UTP' : 'Viaje hacia la UTP';
  const node = document.createElement('article');
  node.className = 'card ride-card';
  node.dataset.rideId = String(ride.id);
  const distance = ride.distanceKm != null ? `<span class="strip-pill strong">A ${fmtNumber(ride.distanceKm)} km de ti</span>` : '';
  node.innerHTML = `
    <div class="ride-top">
      <div>
        <span class="chip ${ride.routeType === 'connection' ? 'lime' : 'green'}">${ride.routeType === 'connection' ? 'Con conexión' : 'Ruta directa'}</span>
        <span class="chip direction-chip">${htmlEscape(directionLabel)}</span>
        <h3>${htmlEscape(ride.origin)} → ${htmlEscape(ride.destination)}</h3>
        <p>Conduce ${htmlEscape(ride.driver.name)} · ${ride.driver.verified ? 'Cuenta verificada' : 'Pendiente'}</p>
      </div>
      <div class="price-tag"><small>Aportación</small>${htmlEscape(fmtMoney(ride.contribution))}</div>
    </div>
    <div class="ride-strip">
      <span class="strip-pill strong">${ride.seatsAvailable} lugar${ride.seatsAvailable === 1 ? '' : 'es'} disponible${ride.seatsAvailable === 1 ? '' : 's'}</span>
      <span class="strip-pill">${ride.occupantCount} ocupante${ride.occupantCount === 1 ? '' : 's'}</span>
      ${distance}
      ${ride.parkingEligible ? '<span class="strip-pill">Rodando Parking</span>' : ''}
      ${ride.routeType === 'connection' ? `<span class="strip-pill">Hub: ${htmlEscape(ride.connectionHub)}</span>` : ''}
    </div>
    <div class="ride-meta">
      <div><small>Salida</small><b>${htmlEscape(fmtDate(ride.departureAt))}</b></div>
      <div><small>Encuentro</small><b>${htmlEscape(ride.pickupPoint)}</b></div>
      <div><small>Vehículo</small><b>${htmlEscape(ride.vehicle)} · ${htmlEscape(ride.color)}</b></div>
      <div><small>Pasajeros confirmados</small><b>${ride.passengerCount}</b></div>
    </div>
    <div class="passenger-preview">
      <strong>Pasajeros visibles</strong>
      <div class="inline-users">${passengerNames}</div>
    </div>
    <p class="ride-footer-note">${htmlEscape(ride.notes || 'Viaje compartido para reducir emisiones y gastos de traslado.')}</p>
    <div class="ride-actions"></div>`;
  const actions = $('.ride-actions', node);
  if (state.user && state.user.id === ride.driver.id) {
    const own = document.createElement('button');
    own.type = 'button'; own.className = 'pill-btn outline'; own.textContent = 'Es tu viaje'; own.disabled = true;
    actions.append(own);
  } else {
    const reserve = document.createElement('button');
    reserve.type = 'button'; reserve.className = 'pill-btn solid';
    reserve.textContent = ride.seatsAvailable < 1 ? 'Sin lugares' : 'Reservar';
    reserve.disabled = ride.seatsAvailable < 1;
    reserve.addEventListener('click', () => openReserve(ride));
    actions.append(reserve);
  }
  return node;
}
function renderRides(rides) {
  state.rides = rides;
  els.ridesGrid.innerHTML = '';
  const nearText = state.near ? ` en un radio de ${state.near.radius} km` : '';
  els.resultsSummary.textContent = `${rides.length} viaje${rides.length === 1 ? '' : 's'} encontrado${rides.length === 1 ? '' : 's'}${nearText}`;
  els.ridesEmpty.hidden = rides.length > 0;
  rides.forEach(ride => els.ridesGrid.append(rideCard(ride)));
  const passRide = rides.find(r => r.parkingCode) || rides.find(r => r.parkingEligible && r.passengerCount >= 1) || rides[0];
  if (passRide) renderParkingDemo(passRide);
  renderRidesMap(rides);
}
async function loadRides() {
  const params = new URLSearchParams();
  if (els.originFilter.value.trim()) params.set('origin', els.originFilter.value.trim());
  if (els.destinationFilter.value.trim()) params.set('destination', els.destinationFilter.value.trim());
  if (els.dateFilter.value) params.set('date', els.dateFilter.value);
  if (els.timeFromFilter.value) params.set('timeFrom', els.timeFromFilter.value);
  if (els.timeToFilter.value) params.set('timeTo', els.timeToFilter.value);
  if (els.seatsMinFilter.value) params.set('seatsMin', els.seatsMinFilter.value);
  if (els.directionFilter.value) params.set('direction', els.directionFilter.value);
  if (els.routeTypeFilter.value) params.set('routeType', els.routeTypeFilter.value);
  if (state.near) {
    params.set('nearby', '1');
    params.set('lat', state.near.lat);
    params.set('lng', state.near.lng);
    params.set('radius', state.near.radius);
  }
  try {
    const data = await api(`/api/rides?${params}`);
    renderRides(data.rides);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function searchNearby() {
  if (!('geolocation' in navigator)) {
    toast('Tu navegador no permite geolocalización. Usa los filtros normales.', 'warn');
    return;
  }
  setBusy(els.nearbyBtn, true, 'Obteniendo ubicación...');
  els.nearbyStatus.textContent = 'Solicitando permiso de ubicación...';
  navigator.geolocation.getCurrentPosition(async position => {
    state.near = {
      lat: Number(position.coords.latitude.toFixed(6)),
      lng: Number(position.coords.longitude.toFixed(6)),
      radius: Number(els.radiusFilter.value) || 5
    };
    els.nearbyStatus.textContent = `Ubicación usada solo para esta búsqueda: radio de ${state.near.radius} km.`;
    els.clearNearby.hidden = false;
    setBusy(els.nearbyBtn, false);
    await loadRides();
  }, error => {
    state.near = null;
    els.clearNearby.hidden = true;
    els.nearbyStatus.textContent = 'No se concedió la ubicación. La búsqueda normal sigue disponible.';
    setBusy(els.nearbyBtn, false);
    toast(error.code === 1 ? 'Permiso de ubicación rechazado. Puedes seguir buscando con filtros.' : 'No se pudo obtener tu ubicación.', 'warn');
    loadRides();
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}
function clearNearby() {
  state.near = null;
  els.clearNearby.hidden = true;
  els.nearbyStatus.textContent = 'Búsqueda por cercanía desactivada.';
  loadRides();
}

/* ---------------- Mapas Leaflet + OpenStreetMap ---------------- */
function ensureRidesMap() {
  if (!window.L) { els.mapsState.textContent = 'Mapa no disponible'; return null; }
  if (state.ridesMap) return state.ridesMap;
  state.ridesMap = window.L.map('ridesMap', { scrollWheelZoom: true }).setView(PUEBLA_CENTER, 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.ridesMap);
  state.ridesLayer = window.L.layerGroup().addTo(state.ridesMap);
  state.nearLayer = window.L.layerGroup().addTo(state.ridesMap);
  return state.ridesMap;
}
function renderRidesMap(rides) {
  const map = ensureRidesMap();
  if (!map) return;
  state.ridesLayer.clearLayers();
  state.nearLayer.clearLayers();
  const withCoords = rides.filter(ride => ride.pickupLat != null && ride.pickupLng != null);
  for (const ride of withCoords) {
    const marker = window.L.marker([ride.pickupLat, ride.pickupLng]);
    const distance = ride.distanceKm != null ? `<br><strong>A ${fmtNumber(ride.distanceKm)} km</strong>` : '';
    marker.bindPopup(`<strong>${htmlEscape(ride.origin)} → ${htmlEscape(ride.destination)}</strong><br>
      ${htmlEscape(fmtDate(ride.departureAt))}${distance}<br>
      ${ride.seatsAvailable} lugar${ride.seatsAvailable === 1 ? '' : 'es'} disponible${ride.seatsAvailable === 1 ? '' : 's'}<br>
      Encuentro: ${htmlEscape(ride.pickupPoint)}`);
    state.ridesLayer.addLayer(marker);
  }
  if (state.near) {
    window.L.circle([state.near.lat, state.near.lng], {
      radius: state.near.radius * 1000, color: '#1e7b46', fillColor: '#58b86c', fillOpacity: .12, weight: 2
    }).addTo(state.nearLayer);
    window.L.circleMarker([state.near.lat, state.near.lng], {
      radius: 7, color: '#ffffff', weight: 3, fillColor: '#0f4028', fillOpacity: 1
    }).bindPopup('Tu ubicación aproximada (no se guarda en el servidor)').addTo(state.nearLayer);
  }
  const points = withCoords.map(ride => [ride.pickupLat, ride.pickupLng]);
  if (state.near) {
    points.push([state.near.lat, state.near.lng]);
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    els.ridesMapSummary.textContent = `${withCoords.length} punto${withCoords.length === 1 ? '' : 's'} de encuentro dentro de ${state.near.radius} km.`;
  } else if (points.length) {
    map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    els.ridesMapSummary.textContent = `${withCoords.length} ruta${withCoords.length === 1 ? '' : 's'} con coordenadas reales. Las rutas antiguas sin coordenadas siguen apareciendo en la lista.`;
  } else {
    map.setView(PUEBLA_CENTER, 12);
    els.ridesMapSummary.textContent = 'Todavía no hay rutas con coordenadas. Publica una para verla en el mapa.';
  }
  setTimeout(() => map.invalidateSize(), 80);
}

function ensurePublishMap() {
  if (!window.L || state.publishMap) {
    state.publishMap?.invalidateSize();
    return state.publishMap;
  }
  state.publishMap = window.L.map('publishMap', { scrollWheelZoom: true }).setView(PUEBLA_CENTER, 12);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(state.publishMap);
  state.publishLayer = window.L.layerGroup().addTo(state.publishMap);
  state.publishMap.on('click', event => placePublishMarker(state.publishMode, event.latlng));
  return state.publishMap;
}
function setPublishMode(mode) {
  if (!['origin', 'destination', 'pickup'].includes(mode)) return;
  state.publishMode = mode;
  const labels = { origin: 'Marca: origen', destination: 'Marca: destino', pickup: 'Marca: punto de encuentro' };
  els.publishMapMode.textContent = labels[mode];
  $$('.map-mode-btn').forEach(button => button.classList.toggle('active', button.dataset.mapMode === mode));
}
function coordinateText(latlng) {
  return `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}
function setCoordinateFields(mode, latlng) {
  const map = {
    origin: { lat: '#originLat', lng: '#originLng', label: els.originCoords },
    destination: { lat: '#destinationLat', lng: '#destinationLng', label: els.destinationCoords },
    pickup: { lat: '#pickupLat', lng: '#pickupLng', label: els.pickupCoords }
  }[mode];
  $(map.lat).value = latlng.lat.toFixed(6);
  $(map.lng).value = latlng.lng.toFixed(6);
  map.label.textContent = coordinateText(latlng);
}
function placePublishMarker(mode, latlng, label, fly = true) {
  const map = ensurePublishMap();
  if (!map) return;
  try {
    const marker = window.L.marker(latlng, { draggable: true });
    state.publishMarkers[mode]?.remove();
    marker.addTo(state.publishLayer);
    marker.bindTooltip(`${mode === 'origin' ? 'Origen' : mode === 'destination' ? 'Destino' : 'Punto de encuentro'}${label ? ': ' + htmlEscape(label) : ''}`, { permanent: false });
    marker.on('dragend', () => {
      const point = marker.getLatLng();
      setCoordinateFields(mode, point);
      els.publishMapStatus.textContent = `Coordenadas actualizadas: ${coordinateText(point)}.`;
    });
    state.publishMarkers[mode] = marker;
    setCoordinateFields(mode, latlng);
    if (fly) map.setView(latlng, 16);
    els.publishMapStatus.textContent = `Punto de ${mode === 'origin' ? 'origen' : mode === 'destination' ? 'destino' : 'encuentro'} guardado en ${coordinateText(latlng)}.`;
  } catch (error) {
    toast('No se pudo colocar el marcador en el mapa.', 'error');
  }
}
async function searchPlace() {
  const query = els.placeSearchInput.value.trim();
  if (query.length < 3) { toast('Escribe una dirección o lugar de al menos 3 caracteres.', 'warn'); return; }
  setBusy(els.placeSearchBtn, true, 'Buscando...');
  els.publishMapStatus.textContent = 'Consultando OpenStreetMap / Nominatim...';
  try {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'mx', 'accept-language': 'es', q: query });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!res.ok) throw new Error('El servicio de direcciones no respondió.');
    const results = await res.json();
    if (!results.length) throw new Error('No se encontró el lugar. Intenta con una dirección más específica.');
    const place = results[0];
    const latlng = { lat: Number(place.lat), lng: Number(place.lon) };
    const shortName = String(place.display_name || query).split(',')[0].slice(0, 80);
    placePublishMarker(state.publishMode, latlng, shortName);
    if (state.publishMode === 'origin') els.publishOrigin.value = shortName.slice(0, 60);
    if (state.publishMode === 'destination') els.publishDestination.value = shortName.slice(0, 90);
    if (state.publishMode === 'pickup') els.publishPickup.value = String(place.display_name || query).slice(0, 90);
    els.publishMapStatus.textContent = `Lugar encontrado: ${shortName}. Puedes arrastrar el marcador para corregirlo.`;
  } catch (error) {
    els.publishMapStatus.textContent = error.message;
    toast(error.message, 'error');
  } finally {
    setBusy(els.placeSearchBtn, false);
  }
}
function resetPublishMap() {
  Object.values(state.publishMarkers).forEach(marker => marker?.remove());
  state.publishMarkers = {};
  ['#originLat', '#originLng', '#destinationLat', '#destinationLng', '#pickupLat', '#pickupLng'].forEach(id => { $(id).value = ''; });
  els.originCoords.textContent = 'Sin coordenadas';
  els.destinationCoords.textContent = 'Sin coordenadas';
  els.pickupCoords.textContent = 'Sin coordenadas';
  if (state.publishMap) state.publishMap.setView(PUEBLA_CENTER, 12);
  setPublishMode('origin');
}

/* ---------------- Rodando Parking ---------------- */
function rideToPass(ride) {
  const seatsConfirmed = Number(ride.seatsConfirmed ?? ride.passengers?.reduce((sum, p) => sum + Number(p.seats || 0), 0) ?? 0);
  const departure = new Date(ride.departureAt).getTime();
  let status = 'vigente';
  if (ride.status === 'cancelled' || ride.parkingStatus === 'cancelado') status = 'cancelado';
  else if (ride.parkingStatus === 'vencido' || (Number.isFinite(departure) && Date.now() > departure + 12 * 3600000)) status = 'vencido';
  return {
    rideId: ride.id, __rideId: ride.id,
    code: ride.parkingCode || '', status,
    statusLabel: status === 'cancelado' ? 'Cancelado' : status === 'vencido' ? 'Vencido' : 'Vigente',
    generatedAt: ride.parkingGeneratedAt, occupantCount: Number(ride.occupantCount || 1 + seatsConfirmed),
    passengerCount: Number(ride.passengerCount || ride.passengers?.length || 0), seatsConfirmed,
    origin: ride.origin, destination: ride.destination, direction: ride.direction,
    pickupPoint: ride.pickupPoint, departureAt: ride.departureAt,
    vehicle: ride.vehicle, color: ride.color,
    plate: ride.plateFull || (ride.plateLast4 ? `Solo últimos 4: ${ride.plateLast4}` : 'No registrada'),
    plateFull: ride.plateFull || '', plateLast4: ride.plateLast4,
    driver: { name: ride.driver?.name, studentId: ride.driver?.studentId, career: ride.driver?.career },
    passengers: (ride.passengers || []).map(p => ({ name: p.name, studentId: p.studentId, career: p.career, seats: p.seats, role: 'pasajero' })),
    qrPayload: `/verificar-pase.html?codigo=${encodeURIComponent(ride.parkingCode || '')}`,
    verificationUrl: parkingVerificationUrl(ride.parkingCode || '')
  };
}
function renderParkingDemo(source) {
  if (!source) return;
  const pass = source.code && source.occupantCount != null ? source : rideToPass(source);
  els.demoPassCode.textContent = pass.code || 'Pendiente de emisión';
  els.demoPassengerCount.textContent = pass.occupantCount || 1;
  const people = [
    { role: 'Conductor', name: pass.driver?.name || 'Conductor', studentId: pass.driver?.studentId || '', career: pass.driver?.career || '' },
    ...(pass.passengers || []).map(p => ({ role: 'Pasajero', name: p.name, studentId: p.studentId, career: p.career, seats: p.seats }))
  ];
  els.demoPassengerList.innerHTML = people.map(p => `
    <div class="passenger-row">
      <div><span class="role-pill">${htmlEscape(p.role)}</span><strong>${htmlEscape(p.name)}</strong><small>${htmlEscape(p.career || '')}</small></div>
      <div class="passenger-id"><small>${htmlEscape(p.studentId || 'Sin matrícula')}</small>${p.seats ? `<small>${p.seats} plaza${p.seats === 1 ? '' : 's'}</small>` : ''}</div>
    </div>`).join('') || '<p class="helper">Esta ruta todavía no tiene pasajeros confirmados.</p>';
  renderQr(els.demoQr, pass.code ? parkingVerificationUrl(pass.code) : null);
}
function passCard(pass) {
  const card = document.createElement('div');
  card.className = 'dashboard-pass-card';
  const statusClass = pass.status === 'cancelado' ? 'cancelled' : pass.status === 'vencido' ? 'expired' : 'active';
  const people = [
    { role: 'Conductor', name: pass.driver?.name, studentId: pass.driver?.studentId, career: pass.driver?.career },
    ...(pass.passengers || []).map(p => ({ role: 'Pasajero', name: p.name, studentId: p.studentId, career: p.career, seats: p.seats }))
  ];
  card.innerHTML = `
    <div class="dashboard-pass-head">
      <div>
        <small>Pase Rodando Parking</small>
        <h3>${htmlEscape(pass.code)}</h3>
        <span class="pass-status ${statusClass}">${htmlEscape(pass.statusLabel || pass.status)}</span>
      </div>
      <div class="passenger-count-block">
        <span>Ocupantes del vehículo</span>
        <strong>${Number(pass.occupantCount || 1)}</strong>
        <small>Conductor incluido</small>
      </div>
    </div>
    <div class="pass-route-grid">
      <div><small>Origen</small><strong>${htmlEscape(pass.origin)}</strong></div>
      <div><small>Destino</small><strong>${htmlEscape(pass.destination)}</strong></div>
      <div><small>Salida</small><strong>${htmlEscape(fmtDate(pass.departureAt))}</strong></div>
      <div><small>Punto de encuentro</small><strong>${htmlEscape(pass.pickupPoint || 'No especificado')}</strong></div>
    </div>
    <div class="pass-vehicle-grid">
      <div><small>Vehículo</small><strong>${htmlEscape(pass.vehicle)} · ${htmlEscape(pass.color)}</strong></div>
      <div><small>Placas</small><strong>${htmlEscape(pass.plate || 'No registradas')}</strong></div>
    </div>
    <div class="pass-people">
      <h4>Ocupantes autorizados</h4>
      ${people.map(p => `<div class="pass-person"><div><span class="role-pill">${htmlEscape(p.role)}</span><strong>${htmlEscape(p.name || 'No disponible')}</strong><small>${htmlEscape(p.career || '')}</small></div><div class="passenger-id"><small>${htmlEscape(p.studentId || 'Sin matrícula')}</small>${p.seats ? `<small>${p.seats} plaza${p.seats === 1 ? '' : 's'}</small>` : ''}</div></div>`).join('')}
    </div>
    <div class="dashboard-pass-footer">
      <div class="qr-box"></div>
      <div>
        <p>Este pase acredita la ocupación compartida del vehículo. El QR abre la verificación pública mínima.</p>
        <p class="helper">Folio único e intransferible. Nombres, matrículas y placas solo se muestran a participantes autorizados.</p>
      </div>
    </div>
    <div class="pass-downloads"></div>`;
  renderQr($('.qr-box', card), parkingVerificationUrl(pass.code));
  const downloads = $('.pass-downloads', card);
  if (pass.status !== 'cancelado') {
    const pdf = document.createElement('button');
    pdf.type = 'button'; pdf.className = 'pill-btn solid'; pdf.textContent = 'Descargar pase PDF';
    pdf.addEventListener('click', () => downloadPassPdf(pass, pdf));
    downloads.append(pdf);
    const png = document.createElement('button');
    png.type = 'button'; png.className = 'pill-btn outline'; png.textContent = 'Descargar imagen PNG';
    png.addEventListener('click', () => downloadPassPng(pass, png));
    downloads.append(png);
  } else {
    downloads.innerHTML = '<p class="pass-cancelled-note">Pase invalidado: el viaje fue cancelado.</p>';
  }
  return card;
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function downloadPassPdf(pass, button) {
  const rideId = pass.rideId || pass.__rideId || button?.dataset.passRide || button?.closest('[data-pass-ride]')?.dataset.passRide;
  if (!rideId) { toast('No se pudo identificar el viaje del pase.', 'error'); return; }
  setBusy(button, true, 'Generando PDF...');
  try {
    const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/parking-pass.pdf`, { credentials: 'same-origin' });
    if (!res.ok) {
      let payload = {};
      try { payload = await res.json(); } catch {}
      throw new Error(payload.error || 'No se pudo generar el PDF.');
    }
    const blob = await res.blob();
    triggerDownload(blob, `RodandoParking_${pass.code}.pdf`);
    toast('Pase PDF descargado.');
  } catch (error) {
    toast(error.message, 'error');
  } finally { setBusy(button, false); }
}
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/);
  let line = '', lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}
function drawRounded(ctx, x, y, w, h, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
async function downloadPassPng(pass, button) {
  setBusy(button, true, 'Generando PNG...');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 1720;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4faf5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f4028'; ctx.fillRect(0, 0, canvas.width, 286);
    drawRounded(ctx, 70, 58, 92, 92, 24, '#dff7a1');
    ctx.fillStyle = '#0f4028'; ctx.font = 'bold 58px Arial'; ctx.fillText('R', 106, 124);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px Arial'; ctx.fillText('Rodando UTP', 190, 95);
    ctx.fillStyle = '#cdebd5'; ctx.font = '26px Arial'; ctx.fillText('GreenShare', 190, 132);
    ctx.fillStyle = '#dff7a1'; ctx.font = 'bold 22px Arial'; ctx.fillText('PASE RODANDO PARKING', 70, 210);
    ctx.fillStyle = '#cdebd5'; ctx.font = '20px Arial'; ctx.fillText('Movilidad colaborativa universitaria', 70, 244);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px Arial'; ctx.fillText((pass.statusLabel || 'Vigente').toUpperCase(), 1130, 95);
    ctx.font = '20px Arial'; ctx.fillStyle = '#cdebd5'; ctx.fillText('Folio único', 1130, 130);
    ctx.font = 'bold 22px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText(pass.code, 1130, 162);
    ctx.textAlign = 'left';

    drawRounded(ctx, 60, 320, 1080, 190, 24, '#eaf7ec', '#cfe4d4');
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 22px Arial'; ctx.fillText('OCUPANTES DEL VEHÍCULO', 90, 365);
    ctx.fillStyle = '#0f4028'; ctx.font = 'bold 104px Arial'; ctx.fillText(String(pass.occupantCount || 1), 90, 475);
    ctx.fillStyle = '#5d7563'; ctx.font = '22px Arial'; ctx.fillText('conductor incluido', 250, 448);
    ctx.fillStyle = '#173126'; ctx.font = 'bold 28px Arial'; ctx.fillText(`${pass.passengerCount || 0} pasajero${pass.passengerCount === 1 ? '' : 's'} registrado${pass.passengerCount === 1 ? '' : 's'}`, 540, 385);
    ctx.fillStyle = '#5d7563'; ctx.font = '22px Arial'; ctx.fillText(`${pass.seatsConfirmed || 0} plaza${pass.seatsConfirmed === 1 ? '' : 's'} de pasajero + 1 conductor`, 540, 425);
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 23px Arial'; ctx.fillText(`Estado: ${pass.statusLabel || 'Vigente'}`, 540, 466);

    drawRounded(ctx, 60, 540, 525, 190, 22, '#ffffff', '#cfe4d4');
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 19px Arial'; ctx.fillText('RUTA DEL VIAJE', 86, 580);
    ctx.fillStyle = '#5d7563'; ctx.font = '17px Arial'; ctx.fillText('ORIGEN', 86, 612);
    ctx.fillStyle = '#173126'; ctx.font = 'bold 25px Arial'; drawWrappedText(ctx, pass.origin, 86, 644, 470, 28, 1);
    ctx.fillStyle = '#5d7563'; ctx.font = '17px Arial'; ctx.fillText('DESTINO', 86, 678);
    ctx.fillStyle = '#173126'; ctx.font = 'bold 25px Arial'; drawWrappedText(ctx, pass.destination, 86, 708, 470, 28, 1);

    drawRounded(ctx, 615, 540, 525, 190, 22, '#ffffff', '#cfe4d4');
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 19px Arial'; ctx.fillText('VEHÍCULO Y CONDUCTOR', 641, 580);
    ctx.fillStyle = '#173126'; ctx.font = 'bold 26px Arial'; drawWrappedText(ctx, pass.driver?.name, 641, 616, 470, 30, 1);
    ctx.fillStyle = '#5d7563'; ctx.font = '19px Arial'; ctx.fillText(`Matrícula: ${pass.driver?.studentId || 'No registrada'}`, 641, 652);
    ctx.fillText(`${pass.vehicle || ''} · ${pass.color || ''}`, 641, 682);
    ctx.fillStyle = '#0f4028'; ctx.font = 'bold 22px Arial'; ctx.fillText(`Placas: ${pass.plate || 'No registradas'}`, 641, 712);

    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 19px Arial'; ctx.fillText('OCUPANTES AUTORIZADOS', 60, 786);
    const people = [{ role: 'CONDUCTOR', name: pass.driver?.name, studentId: pass.driver?.studentId }, ...(pass.passengers || []).map(p => ({ role: 'PASAJERO', name: p.name, studentId: p.studentId }))];
    let rowY = 812;
    for (const person of people.slice(0, 8)) {
      drawRounded(ctx, 60, rowY, 690, 42, 10, person.role === 'CONDUCTOR' ? '#eaf7ec' : '#ffffff', '#e3efe6');
      ctx.fillStyle = person.role === 'CONDUCTOR' ? '#1e7b46' : '#5d7563'; ctx.font = 'bold 14px Arial'; ctx.fillText(person.role, 78, rowY + 27);
      ctx.fillStyle = '#173126'; ctx.font = 'bold 19px Arial'; drawWrappedText(ctx, person.name, 170, rowY + 28, 430, 22, 1);
      ctx.fillStyle = '#5d7563'; ctx.font = '16px Arial'; ctx.textAlign = 'right'; ctx.fillText(person.studentId || '', 730, rowY + 27); ctx.textAlign = 'left';
      rowY += 50;
    }

    // QR grande y verificable
    const qrSize = 370, qrX = 780, qrY = 790;
    drawRounded(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 24, '#ffffff', '#cfe4d4');
    const modules = window.RodandoQR.encode(parkingVerificationUrl(pass.code));
    const quiet = 4, total = modules.length + quiet * 2, cell = qrSize / total;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = '#142d1e';
    modules.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) ctx.fillRect(qrX + (x + quiet) * cell, qrY + (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
    }));
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText('ESCANEA PARA VERIFICAR', qrX + qrSize / 2, qrY + qrSize + 55); ctx.textAlign = 'left';

    ctx.fillStyle = '#5d7563'; ctx.font = '20px Arial';
    ctx.fillText(`Salida: ${fmtDate(pass.departureAt)}`, 60, 1420);
    ctx.fillText(`Punto de encuentro: ${pass.pickupPoint || 'No especificado'}`, 60, 1458);
    ctx.fillStyle = '#0f4028'; ctx.font = 'bold 22px Arial'; ctx.fillText('Pase personal e intransferible', 60, 1540);
    ctx.fillStyle = '#5d7563'; ctx.font = '17px Arial';
    ctx.fillText('La verificación pública muestra datos mínimos. Nombres completos, matrículas y placas', 60, 1580);
    ctx.fillText('se reservan para participantes autorizados y administración.', 60, 1608);
    ctx.fillStyle = '#1e7b46'; ctx.font = 'bold 18px Arial'; ctx.fillText('Rodando UTP GreenShare', 60, 1670);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    triggerDownload(blob, `RodandoParking_${pass.code}.png`);
    toast('Imagen PNG descargada.');
  } catch (error) {
    toast(error.message, 'error');
  } finally { setBusy(button, false); }
}

/* ---------------- Dashboard ---------------- */
function statusText(ride) {
  if (ride.status === 'completed') return 'Completado';
  if (ride.status === 'cancelled') return 'Cancelado';
  return 'Activo';
}
function dashboardItem(ride, mine = true) {
  const wrap = document.createElement('div');
  wrap.className = 'dashboard-item';
  const canPass = ride.parkingEligible && ride.status !== 'cancelled' && ride.passengerCount >= 1;
  wrap.dataset.passRide = String(ride.id);
  wrap.innerHTML = `
    <div class="dashboard-item-top">
      <div>
        <h4>${htmlEscape(ride.origin)} → ${htmlEscape(ride.destination)}</h4>
        <p>${htmlEscape(fmtDate(ride.departureAt))} · ${ride.direction === 'from_utp' ? 'Regreso desde la UTP' : 'Hacia la UTP'}</p>
      </div>
      <span class="status-tag ${ride.status}">${statusText(ride)}</span>
    </div>
    <p><strong>${ride.occupantCount || 1}</strong> ocupante(s) · ${ride.passengerCount || 0} pasajero(s) confirmados · ${htmlEscape(fmtMoney(ride.contribution))} por lugar</p>
    <p>Vehículo: ${htmlEscape(ride.vehicle)} · ${htmlEscape(ride.color)} · Punto: ${htmlEscape(ride.pickupPoint)}</p>
    ${ride.routeType === 'connection' ? `<p>Conexión en ${htmlEscape(ride.connectionHub)}</p>` : ''}
    <div class="actions-row"></div>`;
  const actions = $('.actions-row', wrap);
  if (mine && ride.status === 'active') {
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'pill-btn outline mini'; cancel.textContent = 'Cancelar';
    cancel.addEventListener('click', () => cancelRide(ride.id));
    actions.append(cancel);
    if (canPass) {
      const pass = document.createElement('button');
      pass.type = 'button'; pass.className = 'pill-btn solid mini'; pass.textContent = ride.parkingCode ? 'Ver pase' : 'Generar pase';
      pass.addEventListener('click', () => generatePass(ride.id, wrap));
      actions.append(pass);
    }
    const depart = new Date(ride.departureAt).getTime();
    if (Date.now() >= depart) {
      const complete = document.createElement('button');
      complete.type = 'button'; complete.className = 'pill-btn solid mini'; complete.textContent = 'Finalizar viaje';
      complete.addEventListener('click', () => completeRide(ride.id));
      actions.append(complete);
    }
  }
  if (!mine && ride.status === 'active' && canPass) {
    const pass = document.createElement('button');
    pass.type = 'button'; pass.className = 'pill-btn solid mini'; pass.textContent = ride.parkingCode ? 'Ver pase' : 'Generar pase';
    pass.addEventListener('click', () => generatePass(ride.id, wrap));
    actions.append(pass);
  }
  if (ride.parkingCode) {
    const card = passCard(rideToPass(ride));
    card.dataset.passRide = String(ride.id);
    wrap.append(card);
  }
  return wrap;
}
function reservationItem(entry) {
  const ride = entry.ride;
  const wrap = document.createElement('div');
  wrap.className = 'dashboard-item';
  wrap.dataset.passRide = String(ride.id);
  const canPass = entry.reservationStatus === 'confirmed' && ride.parkingEligible && ride.status !== 'cancelled' && ride.passengerCount >= 1;
  wrap.innerHTML = `
    <div class="dashboard-item-top">
      <div>
        <h4>${htmlEscape(ride.origin)} → ${htmlEscape(ride.destination)}</h4>
        <p>${htmlEscape(fmtDate(ride.departureAt))} · Con ${htmlEscape(ride.driver.name)}</p>
      </div>
      <span class="status-tag ${entry.reservationStatus}">${entry.reservationStatus === 'cancelled' ? 'Cancelada' : 'Confirmada'}</span>
    </div>
    <p>Lugares reservados: <strong>${entry.seats}</strong> · Ocupantes del vehículo: <strong>${ride.occupantCount || 1}</strong></p>
    <p>Punto de encuentro: ${htmlEscape(ride.pickupPoint)}</p>
    <div class="actions-row"></div>`;
  const actions = $('.actions-row', wrap);
  if (entry.reservationStatus === 'confirmed' && ride.status === 'active') {
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'pill-btn outline mini'; cancel.textContent = 'Cancelar reserva';
    cancel.addEventListener('click', () => cancelReservation(ride.id));
    actions.append(cancel);
  }
  if (canPass) {
    const pass = document.createElement('button');
    pass.type = 'button'; pass.className = 'pill-btn solid mini'; pass.textContent = ride.parkingCode ? 'Ver pase' : 'Generar pase';
    pass.addEventListener('click', () => generatePass(ride.id, wrap));
    actions.append(pass);
  }
  if (ride.parkingCode) {
    const card = passCard(rideToPass(ride));
    card.dataset.passRide = String(ride.id);
    wrap.append(card);
  }
  return wrap;
}
async function loadDashboard() {
  if (!state.user) return;
  const data = await api('/api/dashboard');
  renderEco(data.eco);
  els.publishedList.innerHTML = '';
  els.reservationsList.innerHTML = '';
  if (!data.published.length) els.publishedList.innerHTML = '<div class="dashboard-item"><p>Aún no publicas viajes.</p></div>';
  if (!data.reservations.length) els.reservationsList.innerHTML = '<div class="dashboard-item"><p>Aún no has reservado viajes.</p></div>';
  data.published.forEach(ride => els.publishedList.append(dashboardItem(ride, true)));
  data.reservations.forEach(entry => els.reservationsList.append(reservationItem(entry)));
  const passRide = data.published.find(r => r.parkingCode) || data.reservations.map(r => r.ride).find(r => r.parkingCode);
  if (passRide) renderParkingDemo(passRide);
}
async function cancelRide(id) {
  if (!confirm('¿Cancelar este viaje? El pase de estacionamiento quedará invalidado.')) return;
  try { await api(`/api/rides/${id}`, { method: 'DELETE' }); toast('Viaje cancelado y pase invalidado.'); await refreshEverything(); }
  catch (e) { toast(e.message, 'error'); }
}
async function cancelReservation(id) {
  if (!confirm('¿Cancelar tu reservación?')) return;
  try { await api(`/api/rides/${id}/reserve`, { method: 'DELETE' }); toast('Reservación cancelada.'); await refreshEverything(); }
  catch (e) { toast(e.message, 'error'); }
}
async function completeRide(id) {
  if (!confirm('¿Finalizar este viaje?')) return;
  try { await api(`/api/rides/${id}/complete`, { method: 'POST' }); toast('Viaje finalizado y EcoPuntos actualizados.'); await refreshEverything(); }
  catch (e) { toast(e.message, 'error'); }
}
async function generatePass(id, container) {
  try {
    const data = await api(`/api/rides/${id}/parking-pass`, { method: 'POST' });
    renderParkingDemo(data.pass);
    toast(`Pase disponible: ${data.pass.code}`);
    if (container) {
      container.querySelector('.dashboard-pass-card')?.remove();
      const card = passCard({ ...data.pass, rideId: id, __rideId: id });
      card.dataset.passRide = String(id);
      container.append(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- EcoRodando: escena SVG/CSS ---------------- */
function levelForPoints(points) {
  let current = WORLD_LEVELS[0];
  for (const level of WORLD_LEVELS) if (points >= level.threshold) current = level;
  return current;
}
function treeMarkup(x, y, scale = 1, kind = 'tree') {
  if (kind === 'bush') return `<g transform="translate(${x} ${y}) scale(${scale})"><ellipse cx="0" cy="0" rx="25" ry="18" fill="#58b86c"/><ellipse cx="-16" cy="4" rx="18" ry="13" fill="#7bcf72"/><ellipse cx="16" cy="3" rx="18" ry="13" fill="#46a95b"/></g>`;
  if (kind === 'flower') return `<g transform="translate(${x} ${y}) scale(${scale})"><line x1="0" y1="16" x2="0" y2="0" stroke="#2f8a4b" stroke-width="3"/><circle cx="0" cy="-4" r="7" fill="#dff7a1"/><circle cx="0" cy="-4" r="3" fill="#f2c94c"/></g>`;
  return `<g transform="translate(${x} ${y}) scale(${scale})"><rect x="-5" y="-26" width="10" height="34" rx="4" fill="#7c5a35"/><circle cx="0" cy="-48" r="34" fill="#2f9a55"/><circle cx="-22" cy="-34" r="24" fill="#58b86c"/><circle cx="23" cy="-35" r="25" fill="#46a95b"/><circle cx="5" cy="-64" r="23" fill="#7bcf72"/></g>`;
}
function worldArt(stage) {
  const trees = [];
  const bushes = [];
  if (stage >= 1) trees.push(treeMarkup(300, 300, 0.35, 'flower'));
  if (stage >= 2) { bushes.push(treeMarkup(175, 300, 0.8, 'bush'), treeMarkup(455, 305, 0.7, 'bush')); trees.push(treeMarkup(300, 300, 0.55, 'tree')); }
  if (stage >= 3) { trees.push(treeMarkup(105, 300, 0.85), treeMarkup(505, 298, 0.95), treeMarkup(395, 305, 0.6)); bushes.push(treeMarkup(230, 306, 0.65, 'bush')); }
  if (stage >= 4) { trees.push(treeMarkup(55, 300, 0.7), treeMarkup(555, 302, 0.75), treeMarkup(345, 300, 0.9)); bushes.push(treeMarkup(280, 310, 0.7, 'bush'), treeMarkup(430, 312, 0.55, 'bush')); }
  if (stage >= 5) { trees.push(treeMarkup(150, 292, 0.75), treeMarkup(470, 290, 0.8), treeMarkup(250, 308, 0.55)); bushes.push(treeMarkup(80, 312, 0.55, 'bush'), treeMarkup(520, 314, 0.6, 'bush')); for (let i = 0; i < 5; i++) trees.push(treeMarkup(195 + i * 55, 318, 0.45, 'flower')); }
  return `<svg viewBox="0 0 600 330" class="world-art" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
    <defs><linearGradient id="hillGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8e08c"/><stop offset="1" stop-color="#5cba68"/></linearGradient></defs>
    ${bushes.join('')}
    ${stage >= 4 ? '<g transform="translate(432 282)"><rect x="-22" y="-26" width="44" height="7" rx="3" fill="#7c5a35"/><rect x="-18" y="-19" width="5" height="19" fill="#6b4d2e"/><rect x="13" y="-19" width="5" height="19" fill="#6b4d2e"/></g>' : ''}
    ${trees.join('')}
  </svg>`;
}
function houseMarkup() {
  return `<svg viewBox="0 0 140 120" aria-hidden="true"><rect x="34" y="52" width="72" height="56" rx="7" fill="#f4fbf3" stroke="#8bc39a" stroke-width="3"/><path d="M20 56 L70 18 L120 56 Z" fill="#1e7b46"/><rect x="58" y="76" width="24" height="32" rx="4" fill="#a9d8b2"/><rect x="42" y="64" width="12" height="12" rx="2" fill="#dff7a1"/><rect x="86" y="64" width="12" height="12" rx="2" fill="#dff7a1"/></svg>`;
}
function communityMarkup() {
  return `<svg viewBox="0 0 260 120" aria-hidden="true">
    <rect x="12" y="54" width="54" height="54" rx="6" fill="#ffffff" stroke="#8bc39a" stroke-width="3"/><path d="M4 56 L39 28 L74 56 Z" fill="#2f9a55"/>
    <rect x="92" y="38" width="64" height="70" rx="6" fill="#f4fbf3" stroke="#8bc39a" stroke-width="3"/><path d="M82 42 L124 12 L166 42 Z" fill="#1e7b46"/>
    <rect x="182" y="60" width="66" height="48" rx="6" fill="#ffffff" stroke="#8bc39a" stroke-width="3"/><path d="M174 62 L215 36 L256 62 Z" fill="#46a95b"/>
    <rect x="32" y="76" width="12" height="14" rx="2" fill="#dff7a1"/><rect x="112" y="62" width="14" height="16" rx="2" fill="#dff7a1"/><rect x="202" y="78" width="14" height="14" rx="2" fill="#dff7a1"/>
  </svg>`;
}
function paintWorld(parts, stage, points, { animate = false, isLab = false } = {}) {
  const scene = parts.scene, plants = parts.plants, house = parts.house, community = parts.community, badge = parts.badge;
  const safeStage = Math.max(1, Math.min(5, stage));
  scene.classList.toggle('level-2', safeStage >= 2);
  scene.classList.toggle('level-3', safeStage >= 3);
  scene.classList.toggle('level-4', safeStage >= 4);
  scene.classList.toggle('level-5', safeStage >= 5);
  scene.classList.toggle('is-lab', !!isLab);
  scene.dataset.stage = String(safeStage);
  plants.innerHTML = worldArt(safeStage);
  if (house) { house.innerHTML = safeStage >= 4 ? houseMarkup() : ''; house.hidden = safeStage < 4; }
  if (community) { community.innerHTML = safeStage >= 4 ? communityMarkup() : ''; community.hidden = safeStage < 4; }
  if (badge) badge.hidden = safeStage < 5;
  if (animate) {
    scene.classList.remove('world-evolving');
    void scene.offsetWidth;
    scene.classList.add('world-evolving');
    setTimeout(() => scene.classList.remove('world-evolving'), 1400);
  }
  return safeStage;
}
function showLevelFlash(stage, name) {
  if (!els.ecoLevelFlash) return;
  els.ecoLevelFlash.textContent = `Nivel ${stage} — ${name}`;
  els.ecoLevelFlash.hidden = false;
  els.ecoLevelFlash.classList.remove('show');
  void els.ecoLevelFlash.offsetWidth;
  els.ecoLevelFlash.classList.add('show');
  setTimeout(() => { els.ecoLevelFlash.hidden = true; }, 2600);
}
function renderEcoWorld(points, world, animate = false) {
  const level = levelForPoints(points);
  const stage = world?.stage || level.stage;
  const previousStage = state.ecoStage;
  state.ecoStage = stage;
  paintWorld({
    scene: els.ecoWorldScene, plants: els.ecoWorldPlants, house: els.ecoWorldHouse,
    community: els.ecoWorldCommunity, badge: els.ecoWorldBadge
  }, stage, points, { animate });
  const progress = world?.progress ?? (level.nextAt ? Math.max(0, Math.min(100, ((points - level.threshold) / (level.nextAt - level.threshold)) * 100)) : 100);
  els.ecoWorldStageName.textContent = level.name;
  els.ecoWorldStageChip.textContent = `Nivel ${stage} de 5`;
  els.ecoWorldProgressBar.style.width = `${progress}%`;
  els.ecoWorldProgressText.textContent = level.nextAt
    ? `${fmtNumber(points)} EcoPuntos · faltan ${fmtNumber(Math.max(0, level.nextAt - points))} para ${levelForPoints(level.nextAt).name}.`
    : `${fmtNumber(points)} EcoPuntos · nivel máximo alcanzado.`;
  const unlocked = WORLD_LEVELS.slice(0, stage).flatMap(item => item.elements);
  els.ecoWorldElements.innerHTML = unlocked.map(item => `<span>${htmlEscape(item)}</span>`).join('');
  if (animate && previousStage && stage > previousStage) showLevelFlash(stage, level.name);
}
function renderGuestEco() {
  state.ecoStage = 1;
  renderEcoWorld(0, { stage: 1, progress: 0 });
  els.ecoLevelName.textContent = 'Semilla';
  els.ecoPoints.textContent = '0';
  els.ecoTrips.textContent = '0';
  els.ecoCo2.textContent = '0 kg';
  els.ecoProgressBar.style.width = '0%';
  els.ecoNextLevel.textContent = 'Inicia sesión para ver tu mundo crecer.';
  els.ecoBadges.innerHTML = WORLD_LEVELS.map(level => `<div class="badge-card off"><strong>${htmlEscape(level.name)}</strong><small>Bloqueado</small></div>`).join('');
}
function renderEco(eco) {
  if (!eco) return;
  renderEcoWorld(Number(eco.points || 0), eco.world, true);
  els.ecoLevelName.textContent = eco.level?.name || 'Semilla';
  els.ecoPoints.textContent = fmtNumber(eco.points);
  els.ecoTrips.textContent = fmtNumber(eco.completedTrips || eco.events || 0);
  els.ecoCo2.textContent = `${fmtNumber(eco.co2Kg)} kg`;
  els.ecoProgressBar.style.width = `${eco.world?.progress ?? 0}%`;
  els.ecoNextLevel.textContent = eco.world?.nextAt
    ? `Te faltan ${Math.max(0, eco.world.nextAt - eco.points)} EcoPuntos para ${eco.world.nextName}.`
    : 'Llegaste al máximo nivel de EcoRodando.';
  els.ecoBadges.innerHTML = (eco.badges || []).map(b => `<div class="badge-card ${b.unlocked ? '' : 'off'}"><strong>${htmlEscape(b.name)}</strong><small>${b.unlocked ? 'Desbloqueado' : 'Sigue compartiendo viajes'}</small></div>`).join('');
}

/* ---------------- Administración y laboratorio ---------------- */
async function loadAdmin() {
  if (!state.user || state.user.role !== 'admin') return;
  const [overview, users, lab] = await Promise.all([
    api('/api/admin/overview'), api('/api/admin/users'), api('/api/admin/eco-lab')
  ]);
  state.ecoLab = lab;
  renderAdminOverview(overview);
  renderAdminUsers(users.users);
  setupEcoLab(lab);
}
function renderAdminOverview(data) {
  const totals = [
    ['Usuarios', data.totals.users], ['Viajes', data.totals.rides], ['Activos', data.totals.activeRides],
    ['Regreso UTP', data.totals.returnRides], ['Con mapa', data.totals.geolocatedRides],
    ['Reservaciones', data.totals.reservations], ['Rodando Parking', data.totals.parkingEnabled],
    ['Pases emitidos', data.totals.parkingPasses], ['Con conexión', data.totals.connectionRides],
    ['EcoEventos', data.totals.ecoEvents], ['CO₂e', `${fmtNumber(data.community.estimatedCo2Kg)} kg`]
  ];
  els.adminStats.innerHTML = totals.map(([k, v]) => `<div class="admin-stat"><strong>${htmlEscape(String(v))}</strong><span>${htmlEscape(k)}</span></div>`).join('');
}
function renderAdminUsers(users) {
  els.adminUsers.innerHTML = users.map(user => `
    <div class="admin-user-row">
      <div class="user-meta">
        <strong>${htmlEscape(user.name)}</strong>
        <div><span class="role-badge">${htmlEscape(user.role)}</span><span class="verify-badge">${user.verified ? 'verificado' : 'pendiente'}</span></div>
        <small>${htmlEscape(user.studentId)} · ${htmlEscape(user.career)}</small>
        <small>${htmlEscape(user.email)}</small>
      </div>
      <div class="user-meta">
        <small>Viajes: ${user.rideCount}</small>
        <small>Reservas: ${user.reservationCount}</small>
        <small>EcoPuntos: ${user.ecoPoints}</small>
      </div>
      <div class="admin-actions">
        <button type="button" class="pill-btn outline mini" data-admin-verify="${user.id}" data-verified="${user.verified ? 1 : 0}">${user.verified ? 'Quitar verif.' : 'Verificar'}</button>
        <button type="button" class="pill-btn outline mini" data-admin-role="${user.id}" data-role="${user.role}">${user.role === 'admin' ? 'Pasar a usuario' : 'Hacer admin'}</button>
        ${state.user && user.id !== state.user.id ? `<button type="button" class="pill-btn solid mini" data-admin-delete="${user.id}">Eliminar</button>` : ''}
      </div>
    </div>`).join('');
  $$('[data-admin-verify]', els.adminUsers).forEach(btn => btn.addEventListener('click', () => updateAdminUser(btn.dataset.adminVerify, { verified: btn.dataset.verified !== '1', role: null })));
  $$('[data-admin-role]', els.adminUsers).forEach(btn => btn.addEventListener('click', () => updateAdminUser(btn.dataset.adminRole, { role: btn.dataset.role === 'admin' ? 'user' : 'admin', verified: null })));
  $$('[data-admin-delete]', els.adminUsers).forEach(btn => btn.addEventListener('click', () => deleteAdminUser(btn.dataset.adminDelete)));
}
async function updateAdminUser(id, patch) {
  try {
    const role = patch.role ?? ($(`[data-admin-role="${id}"]`)?.dataset.role || 'user');
    const verified = patch.verified ?? ($(`[data-admin-verify="${id}"]`)?.dataset.verified === '1');
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: { role, verified } });
    toast('Usuario actualizado.');
    await loadAdmin();
  } catch (e) { toast(e.message, 'error'); }
}
async function deleteAdminUser(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  try { await api(`/api/admin/users/${id}`, { method: 'DELETE' }); toast('Usuario eliminado.'); await loadAdmin(); }
  catch (e) { toast(e.message, 'error'); }
}

function setupEcoLab(lab) {
  els.ecoLab.hidden = false;
  els.ecoLabStatus.textContent = lab.notice || 'MODO SIMULACIÓN — SOLO ADMINISTRACIÓN. No se modifica la base de datos.';
  updateEcoLab(Number(els.ecoLabPoints.value) || 0, false);
}
function updateEcoLab(points, animate = false) {
  const value = Math.max(0, Math.min(900, Number(points) || 0));
  const level = levelForPoints(value);
  els.ecoLabPoints.value = String(value);
  els.ecoLabRange.value = String(Math.min(900, value));
  els.ecoLabLevel.value = String(level.stage);
  els.ecoLabLevelName.textContent = `${level.name} · ${value} EcoPuntos`;
  els.ecoLabPointsLabel.textContent = `${fmtNumber(value)} EcoPuntos simulados (no persistentes)`;
  const unlocked = WORLD_LEVELS.slice(0, level.stage).flatMap(item => item.elements);
  els.ecoLabUnlocked.textContent = `Elementos desbloqueados: ${unlocked.join(', ')}.`;
  paintWorld({
    scene: els.ecoLabScene, plants: els.ecoLabPlants, house: els.ecoLabHouse,
    community: els.ecoLabCommunity, badge: els.ecoLabBadge
  }, level.stage, value, { animate, isLab: true });
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function animateEcoLab() {
  if (state.labAnimating) return;
  state.labAnimating = true;
  setBusy(els.ecoLabAnimate, true, 'Evolucionando...');
  const target = Number(els.ecoLabPoints.value) || 0;
  try {
    updateEcoLab(0, true);
    await delay(650);
    for (const level of WORLD_LEVELS) {
      if (level.threshold > target) break;
      const nextThreshold = level.threshold;
      const finalPoints = target >= (level.nextAt || target) ? (level.nextAt || target) : target;
      updateEcoLab(finalPoints, true);
      await delay(720);
    }
    updateEcoLab(target, true);
  } finally {
    state.labAnimating = false;
    setBusy(els.ecoLabAnimate, false);
  }
}

async function refreshEverything() {
  await Promise.all([loadSession(), loadRides()]);
  if (state.user) await loadDashboard();
  if (state.user?.role === 'admin') await loadAdmin();
}

/* ---------------- Eventos ---------------- */
els.searchForm.addEventListener('submit', e => { e.preventDefault(); loadRides(); });
els.clearFilters.addEventListener('click', () => {
  els.searchForm.reset();
  state.near = null;
  els.clearNearby.hidden = true;
  els.nearbyStatus.textContent = '';
  loadRides();
});
els.nearbyBtn.addEventListener('click', searchNearby);
els.clearNearby.addEventListener('click', clearNearby);
els.radiusFilter.addEventListener('change', () => {
  if (!state.near) return;
  state.near.radius = Number(els.radiusFilter.value) || 5;
  els.nearbyStatus.textContent = `Radio actualizado a ${state.near.radius} km.`;
  loadRides();
});
els.loginBtn.addEventListener('click', () => openAuth('login'));
els.registerBtn.addEventListener('click', () => openAuth('register'));
els.switchAuthMode.addEventListener('click', () => openAuth(els.authMode.value === 'login' ? 'register' : 'login'));
els.userMenuBtn.addEventListener('click', () => els.accountModal.showModal());
els.logoutBtn.addEventListener('click', async () => {
  await window.RodandoPush?.disconnectCurrentUser();
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  state.user = null; els.accountModal.close(); await refreshEverything(); toast('Sesión cerrada.');
});
[els.publishBtn, els.publishNavBtn, els.publishBtnDashboard].forEach(btn => btn && btn.addEventListener('click', openPublish));
els.routeTypeSelect.addEventListener('change', updateConnectionField);
els.publishDirection.addEventListener('change', applyDirectionDefaults);
$$('[data-close]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.close)?.close()));

els.authForm.addEventListener('submit', async e => {
  e.preventDefault();
  const mode = els.authMode.value;
  setBusy(els.authSubmit, true, mode === 'register' ? 'Creando...' : 'Entrando...');
  try {
    const body = { email: els.authEmail.value, password: els.authPassword.value };
    if (mode === 'register') {
      body.name = els.authName.value; body.studentId = els.authStudentId.value; body.career = els.authCareer.value;
    }
    const data = await api(mode === 'register' ? '/api/register' : '/api/login', { method: 'POST', body });
    state.user = data.user; state.csrfToken = data.csrfToken;
    els.authModal.close(); els.authForm.reset();
    renderAuthState();
    await loadRides();
    toast(mode === 'register' ? 'Cuenta creada correctamente.' : 'Sesión iniciada.');
  } catch (e) {
    els.authError.hidden = false; els.authError.textContent = e.message; toast(e.message, 'error');
  } finally { setBusy(els.authSubmit, false); }
});

els.publishForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = els.publishForm.elements;
  const body = {
    origin: f.origin.value,
    destination: f.destination.value,
    direction: f.direction.value,
    pickupPoint: f.pickupPoint.value,
    departureAt: new Date(f.departureAt.value).toISOString(),
    seatsTotal: Number(f.seatsTotal.value),
    contribution: Number(f.contribution.value),
    vehicle: f.vehicle.value,
    color: f.color.value,
    plateFull: f.plateFull.value,
    routeType: f.routeType.value,
    connectionHub: f.connectionHub?.value || '',
    parkingEligible: f.parkingEligible.checked,
    notes: f.notes.value,
    originLat: f.originLat.value || null,
    originLng: f.originLng.value || null,
    destinationLat: f.destinationLat.value || null,
    destinationLng: f.destinationLng.value || null,
    pickupLat: f.pickupLat.value || null,
    pickupLng: f.pickupLng.value || null
  };
  if (!body.originLat || !body.originLng) {
    toast('Marca el origen en el mapa antes de publicar, para que la búsqueda por cercanía funcione.', 'warn');
    setPublishMode('origin');
    els.publishMap?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  setBusy(els.publishSubmit, true, 'Publicando...');
  try {
    await api('/api/rides', { method: 'POST', body });
    els.publishModal.close();
    els.publishForm.reset();
    updateConnectionField();
    applyDirectionDefaults();
    resetPublishMap();
    toast('Ruta publicada con coordenadas reales.');
    await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
  finally { setBusy(els.publishSubmit, false); }
});

els.reserveForm.addEventListener('submit', async e => {
  e.preventDefault();
  setBusy(els.reserveSubmit, true, 'Reservando...');
  try {
    await api(`/api/rides/${els.reserveRideId.value}/reserve`, { method: 'POST', body: { seats: Number(els.reserveSeats.value) } });
    els.reserveModal.close(); toast('Reserva confirmada.'); await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
  finally { setBusy(els.reserveSubmit, false); }
});

els.placeSearchBtn.addEventListener('click', searchPlace);
els.placeSearchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); searchPlace(); }
});
$$('.map-mode-btn').forEach(button => button.addEventListener('click', () => setPublishMode(button.dataset.mapMode)));
els.publishModal.addEventListener('close', () => { state.publishMap?.invalidateSize(); });

els.ecoLabRange.addEventListener('input', () => updateEcoLab(Number(els.ecoLabRange.value), false));
els.ecoLabPoints.addEventListener('input', () => updateEcoLab(Number(els.ecoLabPoints.value), false));
els.ecoLabLevel.addEventListener('change', () => {
  const level = WORLD_LEVELS[Number(els.ecoLabLevel.value) - 1] || WORLD_LEVELS[0];
  updateEcoLab(level.threshold, true);
});
els.ecoLabAnimate.addEventListener('click', animateEcoLab);
els.ecoLabReset.addEventListener('click', () => {
  els.ecoLabPoints.value = '0';
  els.ecoLabRange.value = '0';
  updateEcoLab(0, true);
  els.ecoLabStatus.textContent = 'Simulación reiniciada. La base de datos real no fue modificada.';
});

els.navToggle.addEventListener('click', () => els.navLinks.classList.toggle('open'));
$$('.nav-links a').forEach(a => a.addEventListener('click', () => els.navLinks.classList.remove('open')));
window.addEventListener('online', networkState);
window.addEventListener('offline', networkState);

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  els.installBtn.hidden = false;
  pwaState('PWA instalable');
});
els.installBtn.addEventListener('click', async () => {
  if (!state.deferredInstall) return toast('Usa el menú del navegador para instalar la app.', 'warn');
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall = null;
  els.installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => {
  state.deferredInstall = null;
  els.installBtn.hidden = true;
  pwaState('PWA instalada');
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      registration.update();
      pwaState();
    } catch { pwaState('SW no disponible'); }
  });
}

(async function init() {
  networkState();
  pwaState();
  renderGuestEco();
  renderQr(els.demoQr, null);
  setPublishMode('origin');
  try { await loadSession(); } catch (e) { toast('No se pudo cargar la sesión.', 'error'); }
  await loadRides();
  ensureRidesMap();
})();
