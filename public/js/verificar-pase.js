'use strict';

const $ = selector => document.querySelector(selector);

const STATUS_LABELS = {
  vigente: 'PASE VIGENTE',
  vencido: 'PASE VENCIDO',
  cancelado: 'PASE CANCELADO'
};

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por confirmar';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function addInfo(container, label, text) {
  const item = document.createElement('div');
  const small = document.createElement('span');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = String(text || 'No especificado');
  item.append(small, strong);
  container.append(item);
}

function renderPerson(person, roleLabel) {
  const row = document.createElement('div');
  row.className = 'verify-person';

  const main = document.createElement('div');
  main.className = 'verify-person-main';
  const role = document.createElement('span');
  role.className = 'verify-role';
  role.textContent = roleLabel;
  const name = document.createElement('strong');
  name.textContent = person.name || 'No disponible';
  main.append(role, name);
  if (person.career) {
    const career = document.createElement('small');
    career.textContent = person.career;
    main.append(career);
  }

  const side = document.createElement('div');
  side.className = 'verify-person-side';
  if (person.studentId) {
    const id = document.createElement('small');
    id.textContent = `Matrícula ${person.studentId}`;
    side.append(id);
  }
  if (person.seats) {
    const seats = document.createElement('small');
    seats.textContent = `${person.seats} plaza${person.seats === 1 ? '' : 's'}`;
    side.append(seats);
  }

  row.append(main, side);
  return row;
}

function showError(message) {
  const state = $('#verifyState');
  state.textContent = 'PASE NO VERIFICABLE';
  state.classList.remove('pending');
  state.classList.add('invalid');
  $('#verifyIntro').textContent = message;
  $('#verifyCount').textContent = '—';
  $('#verifyBreakdown').textContent = 'No fue posible consultar la ocupación del vehículo.';
  $('#verifyMeta').replaceChildren();
  $('#verifyPassengers').replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'verify-empty';
  empty.textContent = 'Solicita al conductor un enlace o código QR vigente del pase.';
  $('#verifyPassengers').append(empty);
  $('#verifyMessage').textContent = 'Un pase cancelado, vencido o con folio incorrecto no debe autorizar el acceso.';
}

(async () => {
  const code = new URLSearchParams(location.search).get('codigo') || '';
  if (!code) {
    showError('Falta el código del pase en el enlace de verificación.');
    return;
  }

  try {
    const res = await fetch(`/api/parking/verify?codigo=${encodeURIComponent(code)}`, {
      cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || 'No se encontró el pase.');
    const pass = payload.pass;
    if (!pass) throw new Error('La respuesta de verificación está incompleta.');

    const authorized = !!payload.authorized;
    const valid = !!payload.valid;
    const status = STATUS_LABELS[pass.status] ? pass.status : 'vencido';

    const state = $('#verifyState');
    state.classList.remove('pending');
    state.classList.toggle('invalid', !valid);
    state.textContent = valid ? STATUS_LABELS.vigente : STATUS_LABELS[status];

    document.title = `${valid ? 'Pase vigente' : 'Pase no vigente'} | Rodando Parking`;
    $('#verifyIntro').textContent = `Folio ${pass.code} · ${authorized
      ? 'vista autorizada para participantes del viaje y administración'
      : 'vista pública con datos mínimos'}.`;
    $('#verifyPrivacyBadge').textContent = authorized ? 'Vista autorizada' : 'Vista pública';

    $('#verifyCount').textContent = String(pass.occupantCount ?? 1);
    $('#verifyBreakdown').textContent = `1 conductor + ${pass.seatsConfirmed || 0} plaza${pass.seatsConfirmed === 1 ? '' : 's'} de pasajero${pass.passengerCount === 1 ? '' : 's'} · ${pass.passengerCount || 0} pasajero${pass.passengerCount === 1 ? '' : 's'} confirmado${pass.passengerCount === 1 ? '' : 's'}.`;

    const metadata = $('#verifyMeta');
    metadata.replaceChildren();
    addInfo(metadata, 'Salida programada', formatDate(pass.departureAt));
    addInfo(metadata, 'Sentido del viaje', pass.direction === 'from_utp' ? 'Desde la UTP' : 'Hacia la UTP');
    addInfo(metadata, 'Origen', pass.origin);
    addInfo(metadata, 'Destino', pass.destination);
    addInfo(metadata, 'Punto de encuentro', pass.pickupPoint);
    addInfo(metadata, 'Vehículo', `${pass.vehicle || 'No registrado'}${pass.color ? ` · ${pass.color}` : ''}`);
    addInfo(metadata, 'Placa', pass.plate || 'Protegida en la vista pública');
    addInfo(metadata, 'Pase emitido', pass.generatedAt ? formatDate(pass.generatedAt) : 'Fecha no disponible');

    const people = $('#verifyPassengers');
    people.replaceChildren();
    if (pass.driver) people.append(renderPerson({ ...pass.driver, seats: 0 }, 'Conductor'));
    const passengers = Array.isArray(pass.passengers) ? pass.passengers : [];
    passengers.forEach((passenger, index) => {
      people.append(renderPerson({
        ...passenger,
        name: passenger.name || `Pasajero ${index + 1}`
      }, 'Pasajero'));
    });
    if (!passengers.length) {
      const empty = document.createElement('div');
      empty.className = 'verify-empty';
      empty.textContent = 'El viaje no registra pasajeros confirmados en este momento.';
      people.append(empty);
    }

    $('#verifyPeopleNote').textContent = authorized
      ? 'Vista autorizada: se muestran nombres completos, matrículas y placas por tratarse de un participante confirmado o de administración.'
      : 'Vista pública: por privacidad se muestran nombres abreviados y se ocultan matrículas, carreras y placas.';

    let message = '';
    if (status === 'cancelado') {
      message = 'El viaje fue cancelado y este pase quedó invalidado automáticamente. No debe permitir el acceso.';
    } else if (status === 'vencido') {
      message = 'La vigencia del pase terminó 12 horas después de la salida programada. Solicita un pase de un viaje vigente.';
    } else if (!valid) {
      message = 'El pase no cumple las condiciones de vigencia u ocupación confirmada. No debe permitir el acceso.';
    } else if (authorized) {
      message = 'Pase vigente. La información completa está visible porque tu cuenta pertenece a este viaje.';
    } else {
      message = 'Pase vigente. La información personal permanece protegida en esta verificación pública.';
    }
    $('#verifyMessage').textContent = message;
  } catch (error) {
    showError(error.message || 'No se pudo verificar el pase. Revisa tu conexión e inténtalo de nuevo.');
  }
})();
