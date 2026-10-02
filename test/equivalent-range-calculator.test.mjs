import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLineRange } from '../src/equivalents/range-calculator.mjs';

const candidate = (identity_key, price, amount, qu_id = 4, kind = 'mass') => ({
  identity_key,
  status: 'eligible',
  package_price_cents: price,
  comparison_basis: { amount, qu_id, kind },
  product_id: Number(identity_key.replace(/\D/g, '')) || 1,
});

test('500 g de riz achètent des emballages entiers et conservent le surplus', () => {
  const line = calculateLineRange({
    request: { comparison_mode: 'physical', physical_kind: 'mass', requested_base_amount: 500, base_qu_id: 4 },
    candidates: [candidate('sku:1', 199, 1000), candidate('sku:2', 349, 2000)],
    complete: true,
  });
  assert.equal(line.status, 'exhaustive');
  assert.deepEqual(line.min, { identity_key: 'sku:1', product_id: 1, packages: 1, amount_cents: 199, surplus: 500, surplus_qu_id: 4 });
  assert.equal(line.max.amount_cents, 349);
  assert.equal(line.max.surplus, 1500);
});

test('convertit kilogrammes et grammes dans la même dimension', () => {
  const line = calculateLineRange({
    request: { comparison_mode: 'physical', physical_kind: 'mass', requested_base_amount: 1500, base_qu_id: 4 },
    candidates: [candidate('sku:10', 120, 1, 12), candidate('sku:20', 190, 500, 4)],
    complete: true,
  });
  assert.equal(line.min.packages, 2);
  assert.equal(line.min.amount_cents, 240);
  assert.equal(line.max.packages, 3);
  assert.equal(line.max.amount_cents, 570);
});

test('un emballage affiché est toujours arrondi au supérieur', () => {
  const line = calculateLineRange({
    request: { comparison_mode: 'package_count', amount_display: 0.25, display_qu_id: 41 },
    candidates: [candidate('sku:7', 250, 1, 41, 'count')],
    complete: true,
  });
  assert.equal(line.min.packages, 1);
  assert.equal(line.min.amount_cents, 250);
  assert.equal(line.min.surplus, null);
});

test('trie les égalités par identité et accepte le même SKU aux deux extrêmes', () => {
  const line = calculateLineRange({
    request: { comparison_mode: 'package_count', amount_display: 1, display_qu_id: 8 },
    candidates: [candidate('sku:z', 100, 1, 8, 'count'), candidate('sku:a', 100, 1, 8, 'count')],
    complete: true,
  });
  assert.equal(line.min.identity_key, 'sku:a');
  assert.equal(line.max.identity_key, 'sku:a');
  const one = calculateLineRange({ request: { comparison_mode: 'package_count', amount_display: 1, display_qu_id: 8 }, candidates: [candidate('sku:solo', 100, 1, 8, 'count')], complete: true });
  assert.equal(one.min.identity_key, one.max.identity_key);
});

test('refuse dimension, unité, quantité nulle, négative ou non finie', () => {
  for (const request of [
    { comparison_mode: 'physical', physical_kind: 'mass', requested_base_amount: 1, base_qu_id: 11 },
    { comparison_mode: 'physical', physical_kind: 'mass', requested_base_amount: 0, base_qu_id: 4 },
    { comparison_mode: 'package_count', amount_display: -1, display_qu_id: 8 },
    { comparison_mode: 'package_count', amount_display: Number.NaN, display_qu_id: 8 },
  ]) assert.equal(calculateLineRange({ request, candidates: [candidate('sku:1', 100, 100)], complete: true }).status, 'invalid');
});

test('une famille incomplète avec prix reste provisoire', () => {
  assert.equal(calculateLineRange({ request: { comparison_mode: 'package_count', amount_display: 1, display_qu_id: 8 }, candidates: [candidate('sku:1', 100, 1, 8, 'count')], complete: false }).status, 'provisional');
});
