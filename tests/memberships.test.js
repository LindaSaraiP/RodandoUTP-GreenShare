'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemberships, createMailer, receiptHtml, PLANS } = require('../lib/memberships');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('los planes tienen los precios publicados en la página', () => {
  assert.equal(PLANS['plus-mensual'].cents, 4900);
  assert.equal(PLANS['plus-cuatrimestral'].cents, 14900);
});

test('el recibo escapa los datos del usuario y aclara que es simulado', () => {
  const html = receiptHtml({ folio: 'RP-1', name: '<script>x</script>', email: 'a@b', plan: 'plus-mensual', card_last4: '4242',
    amount_cents: 4900, starts_at: new Date(), expires_at: new Date(), status: 'active' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Pago simulado/);
});

test('sin SMTP no se envía correo', () => assert.equal(createMailer({}), null));

test('sin sesión no se puede consultar ni comprar', async () => {
  let answered = 0;
  const m = createMemberships({ pool: {}, requireAuth: async () => { answered++; return null; }, sendMail: null });
  for (const method of ['GET', 'POST', 'DELETE']) assert.equal(await m.handle({ method }, {}, { pathname: '/api/membership' }, 'ip'), true);
  assert.equal(answered, 3);
});

test('el esquema permite una sola membresía activa y nunca guarda el número de tarjeta', () => {
  const schema = read('docs/schema-postgres.sql');
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_active/);
  assert.doesNotMatch(read('public/js/plus.js'), /body: \{[^}]*(cvv|cardNumber)/);
});
