'use strict';
const $ = s => document.querySelector(s);
function addInfo(node, label, text) {
  const item = document.createElement('div');
  const small = document.createElement('span'); small.textContent = label;
  const strong = document.createElement('strong'); strong.textContent = String(text || 'No especificado');
  item.append(small, strong); node.append(item);
}
(async () => {
  const code = new URLSearchParams(location.search).get('codigo') || '';
  const state = $('#verifyState');
  if (!code) {
    state.textContent = 'Falta el código del pase'; state.classList.add('invalid'); return;
  }
  try {
    const res = await fetch(`/api/parking/verify?codigo=${encodeURIComponent(code)}`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || 'Pase no encontrado');
    const { pass, valid } = payload;
    state.textContent = valid ? 'PASE VÁLIDO' : 'PASE NO VÁLIDO';
    state.classList.toggle('invalid', !valid);
    $('#verifyCount').textContent = pass.passengerCount;
    $('#verifyIntro').textContent = `Código: ${pass.code}`;
    const metadata = $('#verifyMeta');
    addInfo(metadata, 'Conductor', pass.driver.name);
    addInfo(metadata, 'Matrícula', pass.driver.studentId);
    addInfo(metadata, 'Origen', pass.origin);
    addInfo(metadata, 'Destino', pass.destination);
    addInfo(metadata, 'Horario', new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(pass.departureAt)));
    addInfo(metadata, 'Vehículo', `${pass.vehicle} · ${pass.color} · placa ${pass.plateLast4}`);
    const passengers = $('#verifyPassengers');
    for (const passenger of pass.passengers) {
      const row = document.createElement('div'); row.className = 'verify-person';
      const identity = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = passenger.name;
      const career = document.createElement('small'); career.textContent = passenger.career;
      identity.append(name, career);
      const matricula = document.createElement('small'); matricula.textContent = passenger.studentId;
      row.append(identity, matricula); passengers.append(row);
    }
  } catch (error) {
    state.textContent = error.message; state.classList.add('invalid');
  }
})();
