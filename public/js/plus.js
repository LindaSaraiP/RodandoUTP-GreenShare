'use strict';

/* Rodando Plus: membresía con pago simulado. Usa state, api, toast, htmlEscape, fmtMoney y openAuth de app.js. */
(() => {
  const PLANS = {
    'plus-mensual': { name: 'Rodando Plus · Mensual', price: 49 },
    'plus-cuatrimestral': { name: 'Rodando Plus · Cuatrimestral', price: 149 }
  };
  const status = $('#plusStatus'), modal = $('#plusModal'), body = $('#plusModalBody');
  let membership = null;
  const longDate = v => new Date(v).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  function render() {
    $$('.plus-badge').forEach(n => n.remove());
    status.hidden = !membership;
    if (!membership) return;
    $('#userMenuBtn').insertAdjacentHTML('beforeend', '<span class="plus-badge">PLUS</span>');
    status.innerHTML = `<div><strong>⭐ ${htmlEscape(membership.planName)}</strong><small>Folio ${htmlEscape(membership.folio)} · vigente hasta el ${longDate(membership.expiresAt)} ·
      <a href="${htmlEscape(membership.receiptUrl)}" target="_blank" rel="noopener">ver recibo</a></small></div>
      <button class="pill-btn outline" type="button" id="plusCancel">Cancelar membresía</button>`;
    $('#plusCancel').addEventListener('click', async e => {
      if (!confirm('¿Cancelar tu membresía Rodando Plus?')) return;
      setBusy(e.currentTarget, true);
      try { await api('/api/membership', { method: 'DELETE' }); toast('Membresía cancelada.'); }
      catch (err) { toast(err.message, 'error'); }
      load();
    });
  }

  async function load() {
    const user = state.user?.id ?? null;
    let found = null;
    if (user) { try { found = (await api('/api/membership')).membership; } catch { found = null; } }
    if (user !== (state.user?.id ?? null)) return;   // cambió la sesión mientras se consultaba
    membership = found;
    render();
  }

  function checkout(planId) {
    if (!requireLogin('contratar Rodando Plus')) return;
    if (membership) return toast(`Ya tienes Plus hasta el ${longDate(membership.expiresAt)}.`, 'warn');
    const plan = PLANS[planId];
    body.innerHTML = `<h3>${htmlEscape(plan.name)} · ${fmtMoney(plan.price)}</h3>
      <p class="plus-sim"><b>Pago simulado.</b> Escribe cualquier dato: no uses una tarjeta real. No se cobra nada y el número no se guarda.</p>
      <form id="plusForm" autocomplete="off" novalidate>
        <label for="plusCard">Número de tarjeta</label><input id="plusCard" inputmode="numeric" maxlength="19" placeholder="4242 4242 4242 4242">
        <div class="plus-row"><div><label for="plusExp">Vencimiento</label><input id="plusExp" inputmode="numeric" maxlength="5" placeholder="MM/AA"></div>
        <div><label for="plusCvv">CVV</label><input id="plusCvv" inputmode="numeric" maxlength="4" placeholder="123"></div></div>
        <p class="plus-error" id="plusError" role="alert"></p>
        <div class="plus-actions"><button class="pill-btn solid" type="submit" id="plusPay">Pagar ${fmtMoney(plan.price)} (simulado)</button>
        <button class="pill-btn outline" type="button" data-plus-close>Cerrar</button></div>
      </form>`;
    const card = $('#plusCard'), exp = $('#plusExp'), cvv = $('#plusCvv');
    card.addEventListener('input', () => { card.value = card.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
    exp.addEventListener('input', () => { const d = exp.value.replace(/\D/g, '').slice(0, 4); exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; });
    cvv.addEventListener('input', () => { cvv.value = cvv.value.replace(/\D/g, ''); });
    $('#plusForm').addEventListener('submit', async e => {
      e.preventDefault();
      const digits = card.value.replace(/\D/g, ''), error = $('#plusError');
      error.textContent = digits.length < 4 ? 'Escribe el número de la tarjeta.' : !exp.value ? 'Escribe el vencimiento.' : cvv.value.length < 3 ? 'Escribe el CVV.' : '';
      if (error.textContent) return;
      const pay = $('#plusPay');
      setBusy(pay, true, 'Procesando pago…');
      try {
        const data = await api('/api/membership', { method: 'POST', body: { plan: planId, cardLast4: digits.slice(-4) } });
        membership = data.membership;
        render();
        body.innerHTML = `<h3>¡Pago aprobado! Bienvenido a Plus ⭐</h3><div class="plus-receipt">
          <div><span>Folio</span><b>${htmlEscape(membership.folio)}</b></div><div><span>Plan</span><b>${htmlEscape(membership.planName)}</b></div>
          <div><span>Total</span><b>${fmtMoney(membership.amountCents / 100)}</b></div><div><span>Vigente hasta</span><b>${longDate(membership.expiresAt)}</b></div></div>
          <p class="helper">${data.emailEnabled ? `Enviaremos tu recibo a ${htmlEscape(data.email)}.` : 'Tu recibo queda disponible aquí.'} Pago simulado: no se realizó ningún cargo.</p>
          <div class="plus-actions"><a class="pill-btn solid" href="${htmlEscape(membership.receiptUrl)}" target="_blank" rel="noopener">Ver recibo</a>
          <button class="pill-btn outline" type="button" data-plus-close>Listo</button></div>`;
      } catch (err) { error.textContent = err.message; setBusy(pay, false); }
    });
    if (!modal.open) modal.showModal();
  }

  modal.addEventListener('click', e => { if (e.target.closest('[data-plus-close]')) modal.close(); });
  $$('[data-plus-plan]').forEach(b => b.addEventListener('click', () => checkout(b.dataset.plusPlan)));
  window.addEventListener('rodando:session', load);
  if (state.user) load();
})();
