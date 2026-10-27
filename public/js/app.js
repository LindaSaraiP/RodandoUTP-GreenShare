'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, csrfToken: '', allowedDomains: [], rides: [], deferredInstall: null };

const els = {
  navToggle: $('#navToggle'), navLinks: $('#navLinks'), adminLink: $('#adminLink'), installBtn: $('#installBtn'),
  loginBtn: $('#loginBtn'), registerBtn: $('#registerBtn'), userMenuBtn: $('#userMenuBtn'), userInitial: $('#userInitial'), userShortName: $('#userShortName'),
  searchForm: $('#searchForm'), originFilter: $('#originFilter'), dateFilter: $('#dateFilter'), routeTypeFilter: $('#routeTypeFilter'), clearFilters: $('#clearFilters'), ridesGrid: $('#ridesGrid'), ridesEmpty: $('#ridesEmpty'), resultsSummary: $('#resultsSummary'),
  publishBtn: $('#publishBtn'), publishBtnDashboard: $('#publishBtnDashboard'), authModal: $('#authModal'), authForm: $('#authForm'), authMode: $('#authMode'), authRegisterFields: $('#authRegisterFields'), authTitle: $('#authTitle'), authDescription: $('#authDescription'), authName: $('#authName'), authStudentId: $('#authStudentId'), authCareer: $('#authCareer'), authEmail: $('#authEmail'), authPassword: $('#authPassword'), authSubmit: $('#authSubmit'), authError: $('#authError'), switchAuthMode: $('#switchAuthMode'), allowedDomainsHelp: $('#allowedDomainsHelp'),
  publishModal: $('#publishModal'), publishForm: $('#publishForm'), routeTypeSelect: $('#routeTypeSelect'), connectionHubWrap: $('#connectionHubWrap'),
  reserveModal: $('#reserveModal'), reserveForm: $('#reserveForm'), reserveRideId: $('#reserveRideId'), reserveTitle: $('#reserveTitle'), reserveSummary: $('#reserveSummary'), reserveSeats: $('#reserveSeats'),
  accountModal: $('#accountModal'), accountName: $('#accountName'), accountMeta: $('#accountMeta'), logoutBtn: $('#logoutBtn'),
  networkState: $('#networkState'), pwaState: $('#pwaState'),
  miniUsers: $('#miniUsers'), miniRides: $('#miniRides'), miniCo2: $('#miniCo2'), co2Saved: $('#co2Saved'), fuelSaved: $('#fuelSaved'), moneySaved: $('#moneySaved'), sharedSeats: $('#sharedSeats'),
  parkingPassDemo: $('#parkingPassDemo'), demoPassCode: $('#demoPassCode'), demoPassengerCount: $('#demoPassengerCount'), demoPassengerList: $('#demoPassengerList'), demoQr: $('#demoQr'),
  ecoTree: $('#ecoTree'), ecoLevelName: $('#ecoLevelName'), ecoPoints: $('#ecoPoints'), ecoTrips: $('#ecoTrips'), ecoCo2: $('#ecoCo2'), ecoProgressBar: $('#ecoProgressBar'), ecoNextLevel: $('#ecoNextLevel'), ecoBadges: $('#ecoBadges'),
  dashboard: $('#dashboard'), publishedList: $('#publishedList'), reservationsList: $('#reservationsList'),
  adminPanel: $('#adminPanel'), adminStats: $('#adminStats'), adminUsers: $('#adminUsers'), refreshAdminBtn: $('#refreshAdminBtn')
};

function fmtMoney(v) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(v || 0)); }
function fmtNumber(v) { return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(Number(v || 0)); }
function fmtDate(value) { return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function htmlEscape(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }
function toast(message, type = 'ok') {
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
  node.textContent = message;
  $('#toastStack').append(node);
  setTimeout(() => node.remove(), 4200);
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

function renderQr(target, url) {
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
    const size = modules.length + quiet * 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Código QR verificable del pase Rodando Parking');
    svg.style.shapeRendering = 'crispEdges';
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff');
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
  els.loginBtn.hidden = logged; els.registerBtn.hidden = logged; els.userMenuBtn.hidden = !logged;
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
    els.publishedList.innerHTML = ''; els.reservationsList.innerHTML = '';
    els.adminStats.innerHTML = ''; els.adminUsers.innerHTML = '';
  }
}

function openAuth(mode = 'login') {
  const register = mode === 'register';
  els.authMode.value = mode;
  els.authRegisterFields.hidden = !register;
  els.authTitle.textContent = register ? 'Crear cuenta institucional' : 'Iniciar sesión';
  els.authDescription.textContent = register ? 'Regístrate con tu correo UTP para publicar y reservar viajes.' : 'Accede para ver tu panel, reservas y EcoRodando.';
  els.authSubmit.textContent = register ? 'Crear cuenta' : 'Entrar';
  els.switchAuthMode.textContent = register ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  els.allowedDomainsHelp.textContent = `Correos permitidos: ${state.allowedDomains.map(x => '@' + x).join(' y ')}`;
  els.authError.hidden = true;
  els.authModal.showModal();
}
function openPublish() {
  if (!requireLogin('publicar un viaje')) return;
  const d = new Date(Date.now() + 3600000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  els.publishForm.elements.departureAt.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  updateConnectionField();
  els.publishModal.showModal();
}
function updateConnectionField() {
  const show = els.routeTypeSelect.value === 'connection';
  els.connectionHubWrap.hidden = !show;
  els.publishForm.elements.connectionHub.required = show;
}
function openReserve(ride) {
  if (!requireLogin('reservar')) return;
  els.reserveRideId.value = ride.id;
  els.reserveTitle.textContent = `${ride.origin} → UTP`;
  els.reserveSummary.innerHTML = `
    <strong>${htmlEscape(ride.driver.name)}</strong><br />
    ${htmlEscape(fmtDate(ride.departureAt))}<br />
    Punto de encuentro: ${htmlEscape(ride.pickupPoint)}<br />
    ${ride.routeType === 'connection' ? `Conexión en ${htmlEscape(ride.connectionHub)}<br />` : ''}
    Aportación por lugar: <strong>${htmlEscape(fmtMoney(ride.contribution))}</strong>`;
  els.reserveSeats.innerHTML = '';
  for (let i = 1; i <= Math.min(ride.seatsAvailable, 3); i++) {
    const opt = document.createElement('option'); opt.value = i; opt.textContent = `${i} lugar${i===1?'':'es'}`; els.reserveSeats.append(opt);
  }
  els.reserveModal.showModal();
}

function rideCard(ride) {
  const passengerNames = ride.passengers.slice(0,3).map(p => `<span>${htmlEscape(p.name)} · ${htmlEscape(p.career || p.studentId)}</span>`).join('') || '<span>Sin pasajeros aún</span>';
  const node = document.createElement('article');
  node.className = 'card ride-card';
  node.innerHTML = `
    <div class="ride-top">
      <div>
        <span class="chip ${ride.routeType === 'connection' ? 'lime' : 'green'}">${ride.routeType === 'connection' ? 'Con conexión' : 'Ruta directa'}</span>
        <h3>${htmlEscape(ride.origin)} → UTP</h3>
        <p>Conduce ${htmlEscape(ride.driver.name)} · ${ride.driver.verified ? 'Cuenta verificada' : 'Pendiente'}</p>
      </div>
      <div class="price-tag"><small>Aportación</small>${htmlEscape(fmtMoney(ride.contribution))}</div>
    </div>
    <div class="ride-strip">
      <span class="strip-pill strong">${ride.seatsAvailable} lugar${ride.seatsAvailable === 1 ? '' : 'es'} disponible${ride.seatsAvailable === 1 ? '' : 's'}</span>
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
    const own = document.createElement('button'); own.className = 'pill-btn outline'; own.textContent = 'Es tu viaje'; own.disabled = true; actions.append(own);
  } else {
    const reserve = document.createElement('button'); reserve.className = 'pill-btn solid'; reserve.textContent = 'Reservar'; reserve.disabled = ride.seatsAvailable < 1; reserve.addEventListener('click', () => openReserve(ride)); actions.append(reserve);
  }
  return node;
}
function renderRides(rides) {
  state.rides = rides;
  els.ridesGrid.innerHTML = '';
  els.resultsSummary.textContent = `${rides.length} viaje${rides.length === 1 ? '' : 's'} encontrado${rides.length === 1 ? '' : 's'}`;
  els.ridesEmpty.hidden = rides.length > 0;
  if (!rides.length) return;
  rides.forEach(ride => els.ridesGrid.append(rideCard(ride)));
  const passRide = rides.find(r => r.parkingCode) || rides.find(r => r.parkingEligible && r.passengerCount >= 2) || rides[0];
  if (passRide) renderParkingDemo(passRide);
}
async function loadRides() {
  const params = new URLSearchParams();
  if (els.originFilter.value.trim()) params.set('origin', els.originFilter.value.trim());
  if (els.dateFilter.value) params.set('date', els.dateFilter.value);
  if (els.routeTypeFilter.value) params.set('routeType', els.routeTypeFilter.value);
  try {
    const data = await api(`/api/rides?${params}`);
    renderRides(data.rides);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderParkingDemo(ride, generatedPass) {
  const passCode = generatedPass?.code || ride.parkingCode || 'Pendiente de emisión';
  const count = generatedPass?.passengerCount || ride.passengerCount || 0;
  els.demoPassCode.textContent = passCode;
  els.demoPassengerCount.textContent = count;
  els.demoPassengerList.innerHTML = ride.passengers.length
    ? ride.passengers.map(p => `<div class="passenger-row"><div><strong>${htmlEscape(p.name)}</strong><small>${htmlEscape(p.career || '')}</small></div><div><small>${htmlEscape(p.studentId)}</small></div></div>`).join('')
    : '<p class="helper">Esta ruta todavía no tiene pasajeros confirmados suficientes.</p>';
  renderQr(els.demoQr, (generatedPass?.code || ride.parkingCode) ? parkingVerificationUrl(passCode) : null);
}

function renderGuestEco() {
  updateTreeStage(1);
  els.ecoLevelName.textContent = 'Semilla';
  els.ecoPoints.textContent = '0';
  els.ecoTrips.textContent = '0';
  els.ecoCo2.textContent = '0 kg';
  els.ecoProgressBar.style.width = '0%';
  els.ecoNextLevel.textContent = 'Inicia sesión para ver tu árbol crecer.';
  els.ecoBadges.innerHTML = ['Primer viaje', 'Conexión verde', 'Parking colaborativo', 'Bosque UTP'].map(name => `<div class="badge-card off"><strong>${name}</strong><small>Bloqueado</small></div>`).join('');
}
function updateTreeStage(stage) {
  els.ecoTree.className = `tree-breath stage-${Math.max(1, Math.min(5, stage))}`;
}
function renderEco(eco) {
  updateTreeStage(eco.treeStage || 1);
  els.ecoLevelName.textContent = eco.level?.name || 'Semilla';
  els.ecoPoints.textContent = fmtNumber(eco.points);
  els.ecoTrips.textContent = fmtNumber(eco.completedTrips || eco.events || 0);
  els.ecoCo2.textContent = `${fmtNumber(eco.co2Kg)} kg`;
  els.ecoProgressBar.style.width = `${computeProgress(eco)}%`;
  els.ecoNextLevel.textContent = eco.level?.nextAt ? `Te faltan ${Math.max(0, eco.level.nextAt - eco.points)} EcoPuntos para ${nextLevelLabel(eco.level.nextAt)}.` : 'Llegaste al máximo nivel de EcoRodando.';
  els.ecoBadges.innerHTML = (eco.badges || []).map(b => `<div class="badge-card ${b.unlocked ? '' : 'off'}"><strong>${htmlEscape(b.code)} · ${htmlEscape(b.name)}</strong><small>${b.unlocked ? 'Desbloqueado' : 'Sigue compartiendo viajes'}</small></div>`).join('');
}
function computeProgress(eco) {
  const points = Number(eco.points || 0);
  const next = eco.level?.nextAt;
  if (!next) return 100;
  const thresholds = [0,120,250,450,700];
  let start = 0;
  for (const t of thresholds) if (t <= points) start = t;
  return Math.max(5, Math.min(100, ((points - start) / (next - start)) * 100));
}
function nextLevelLabel(nextAt) {
  if (nextAt === 120) return 'Brote';
  if (nextAt === 250) return 'Raíz Verde';
  if (nextAt === 450) return 'Árbol Vivo';
  if (nextAt === 700) return 'Bosque UTP';
  return 'el siguiente nivel';
}

function dashboardItem(ride, mine = true) {
  const wrap = document.createElement('div');
  wrap.className = 'dashboard-item';
  wrap.innerHTML = `
    <div class="dashboard-item-top">
      <div>
        <h4>${htmlEscape(ride.origin)} → UTP</h4>
        <p>${htmlEscape(fmtDate(ride.departureAt))}</p>
      </div>
      <span class="status-tag ${ride.status}">${ride.status === 'completed' ? 'Completado' : ride.status === 'cancelled' ? 'Cancelado' : 'Activo'}</span>
    </div>
    <p><strong>${htmlEscape(ride.passengerCount || 0)}</strong> pasajero(s) confirmados · ${htmlEscape(fmtMoney(ride.contribution))} por lugar</p>
    <p>Vehículo: ${htmlEscape(ride.vehicle)} · ${htmlEscape(ride.color)} · Punto: ${htmlEscape(ride.pickupPoint)}</p>
    ${ride.routeType === 'connection' ? `<p>Conexión en ${htmlEscape(ride.connectionHub)}</p>` : ''}
    <div class="actions-row"></div>`;
  const actions = $('.actions-row', wrap);
  if (mine && ride.status === 'active') {
    const cancel = document.createElement('button'); cancel.className = 'pill-btn outline mini'; cancel.textContent = 'Cancelar'; cancel.addEventListener('click', () => cancelRide(ride.id)); actions.append(cancel);
    if (ride.parkingEligible) {
      const pass = document.createElement('button'); pass.className = 'pill-btn solid mini'; pass.textContent = 'Generar pase'; pass.addEventListener('click', () => generatePass(ride.id)); actions.append(pass);
    }
    const depart = new Date(ride.departureAt).getTime();
    if (Date.now() >= depart - 30 * 60000) {
      const complete = document.createElement('button'); complete.className = 'pill-btn solid mini'; complete.textContent = 'Finalizar viaje'; complete.addEventListener('click', () => completeRide(ride.id)); actions.append(complete);
    }
  }
  if (ride.parkingCode) {
    const passCard = document.createElement('div');
    passCard.className = 'dashboard-pass-card';
    passCard.innerHTML = `
      <div class="parking-pass-hero">
        <div><small>Pase Rodando Parking</small><h3>${htmlEscape(ride.parkingCode)}</h3></div>
        <div class="passenger-count-block"><span>Pasajeros</span><strong>${ride.passengerCount}</strong></div>
      </div>
      <div class="passenger-list">${ride.passengers.map(p => `<div class="passenger-row"><div><strong>${htmlEscape(p.name)}</strong><small>${htmlEscape(p.career || '')}</small></div><div><small>${htmlEscape(p.studentId)}</small></div></div>`).join('')}</div>
      <div class="parking-pass-footer"><div class="qr-box"></div><div><p>Este pase hace visible la ocupación compartida del vehículo.</p><p class="helper">Conductor: ${htmlEscape(ride.driver.name)}</p></div></div>`;
    renderQr($('.qr-box', passCard), parkingVerificationUrl(ride.parkingCode));
    wrap.append(passCard);
  }
  return wrap;
}
function reservationItem(entry) {
  const ride = entry.ride;
  const wrap = document.createElement('div');
  wrap.className = 'dashboard-item';
  wrap.innerHTML = `
    <div class="dashboard-item-top">
      <div>
        <h4>${htmlEscape(ride.origin)} → UTP</h4>
        <p>${htmlEscape(fmtDate(ride.departureAt))} · Con ${htmlEscape(ride.driver.name)}</p>
      </div>
      <span class="status-tag ${entry.reservationStatus}">${entry.reservationStatus === 'cancelled' ? 'Cancelada' : 'Confirmada'}</span>
    </div>
    <p>Lugares reservados: <strong>${entry.seats}</strong></p>
    <p>Punto de encuentro: ${htmlEscape(ride.pickupPoint)}</p>
    <div class="actions-row"></div>`;
  const actions = $('.actions-row', wrap);
  if (entry.reservationStatus === 'confirmed' && ride.status === 'active') {
    const cancel = document.createElement('button'); cancel.className = 'pill-btn outline mini'; cancel.textContent = 'Cancelar reserva'; cancel.addEventListener('click', () => cancelReservation(ride.id)); actions.append(cancel);
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
  const passRide = data.published.find(r => r.parkingCode) || data.published.find(r => r.parkingEligible && r.passengerCount >= 2);
  if (passRide) renderParkingDemo(passRide);
}
async function cancelRide(id) {
  if (!confirm('¿Cancelar este viaje?')) return;
  try { await api(`/api/rides/${id}`, { method: 'DELETE' }); toast('Viaje cancelado.'); await refreshEverything(); } catch (e) { toast(e.message, 'error'); }
}
async function cancelReservation(id) {
  if (!confirm('¿Cancelar tu reservación?')) return;
  try { await api(`/api/rides/${id}/reserve`, { method: 'DELETE' }); toast('Reservación cancelada.'); await refreshEverything(); } catch (e) { toast(e.message, 'error'); }
}
async function completeRide(id) {
  if (!confirm('¿Finalizar este viaje?')) return;
  try { await api(`/api/rides/${id}/complete`, { method: 'POST' }); toast('Viaje finalizado y EcoPuntos actualizados.'); await refreshEverything(); } catch (e) { toast(e.message, 'error'); }
}
async function generatePass(id) {
  try {
    const data = await api(`/api/rides/${id}/parking-pass`, { method: 'POST' });
    renderParkingDemo(data.pass.ride, data.pass);
    toast(`Pase generado: ${data.pass.code}`);
    await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdmin() {
  if (!state.user || state.user.role !== 'admin') return;
  const [overview, users] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users')]);
  renderAdminOverview(overview);
  renderAdminUsers(users.users);
}
function renderAdminOverview(data) {
  const totals = [
    ['Usuarios', data.totals.users], ['Viajes', data.totals.rides], ['Activos', data.totals.activeRides], ['Reservaciones', data.totals.reservations],
    ['Con conexión', data.totals.connectionRides], ['Rodando Parking', data.totals.parkingEnabled], ['EcoEventos', data.totals.ecoEvents], ['CO₂e', `${fmtNumber(data.community.estimatedCo2Kg)} kg`]
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
        <button class="pill-btn outline mini" data-admin-verify="${user.id}" data-verified="${user.verified ? 1 : 0}">${user.verified ? 'Quitar verif.' : 'Verificar'}</button>
        <button class="pill-btn outline mini" data-admin-role="${user.id}" data-role="${user.role}">${user.role === 'admin' ? 'Pasar a usuario' : 'Hacer admin'}</button>
        ${state.user && user.id !== state.user.id ? `<button class="pill-btn solid mini" data-admin-delete="${user.id}">Eliminar</button>` : ''}
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
  try { await api(`/api/admin/users/${id}`, { method: 'DELETE' }); toast('Usuario eliminado.'); await loadAdmin(); } catch (e) { toast(e.message, 'error'); }
}

async function refreshEverything() {
  await Promise.all([loadSession(), loadRides()]);
  if (state.user) await loadDashboard();
  if (state.user?.role === 'admin') await loadAdmin();
}

els.searchForm.addEventListener('submit', e => { e.preventDefault(); loadRides(); });
els.clearFilters.addEventListener('click', () => { els.searchForm.reset(); loadRides(); });
els.loginBtn.addEventListener('click', () => openAuth('login'));
els.registerBtn.addEventListener('click', () => openAuth('register'));
els.switchAuthMode.addEventListener('click', () => openAuth(els.authMode.value === 'login' ? 'register' : 'login'));
els.userMenuBtn.addEventListener('click', () => els.accountModal.showModal());
els.logoutBtn.addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  state.user = null; els.accountModal.close(); await refreshEverything(); toast('Sesión cerrada.');
});
[els.publishBtn, els.publishBtnDashboard].forEach(btn => btn && btn.addEventListener('click', openPublish));
els.routeTypeSelect.addEventListener('change', updateConnectionField);
$$('[data-close]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.close).close()));

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
    pickupPoint: f.pickupPoint.value,
    departureAt: new Date(f.departureAt.value).toISOString(),
    seatsTotal: Number(f.seatsTotal.value),
    contribution: Number(f.contribution.value),
    vehicle: f.vehicle.value,
    color: f.color.value,
    plateLast4: f.plateLast4.value,
    routeType: f.routeType.value,
    connectionHub: f.connectionHub?.value || '',
    parkingEligible: f.parkingEligible.checked,
    notes: f.notes.value
  };
  const submit = $('button.pill-btn.solid:last-of-type', els.publishForm) || els.publishForm.querySelector('button[type="submit"]');
  setBusy(submit, true, 'Publicando...');
  try {
    await api('/api/rides', { method: 'POST', body });
    els.publishModal.close(); els.publishForm.reset(); updateConnectionField(); toast('Ruta publicada.'); await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
  finally { setBusy(submit, false); }
});

els.reserveForm.addEventListener('submit', async e => {
  e.preventDefault();
  const submit = $('button.pill-btn.solid:last-of-type', els.reserveForm) || els.reserveForm.querySelector('button[type="submit"]');
  setBusy(submit, true, 'Reservando...');
  try {
    await api(`/api/rides/${els.reserveRideId.value}/reserve`, { method: 'POST', body: { seats: Number(els.reserveSeats.value) } });
    els.reserveModal.close(); toast('Reserva confirmada.'); await refreshEverything();
  } catch (e) { toast(e.message, 'error'); }
  finally { setBusy(submit, false); }
});

els.navToggle.addEventListener('click', () => els.navLinks.classList.toggle('open'));
$$('.nav-links a').forEach(a => a.addEventListener('click', () => els.navLinks.classList.remove('open')));
window.addEventListener('online', networkState); window.addEventListener('offline', networkState);

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  els.installBtn.hidden = false;
  pwaState('PWA instalable');
});
els.installBtn.addEventListener('click', async () => {
  if (!state.deferredInstall) return toast('Usa el menú del navegador para instalar la app.', 'warn');
  state.deferredInstall.prompt(); await state.deferredInstall.userChoice; state.deferredInstall = null; els.installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => { state.deferredInstall = null; els.installBtn.hidden = true; pwaState('PWA instalada'); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try { await navigator.serviceWorker.register('/service-worker.js'); pwaState(); }
    catch { pwaState('SW no disponible'); }
  });
}

(async function init() {
  networkState(); pwaState(); renderGuestEco(); renderQr(els.demoQr, null);
  try { await loadSession(); } catch (e) { toast('No se pudo cargar la sesión.', 'error'); }
  await loadRides();
})();
