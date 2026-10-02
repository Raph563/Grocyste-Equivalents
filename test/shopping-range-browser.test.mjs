import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { familiesFromProducts, shoppingRangeLineView, shoppingRangeTotalView } from '../src/ui/shopping-range-browser.mjs';
import { configureFamilyProfiles } from '../src/equivalents/family-profiles.mjs';

test('affiche les deux bornes et les emballages des extrêmes', () => {
  const view = shoppingRangeLineView({
    status: 'exhaustive',
    min: { identity_key: 'sku:u', packages: 1, amount_cents: 199, surplus: 500, surplus_qu_id: 4 },
    max: { identity_key: 'sku:marque', packages: 2, amount_cents: 498, surplus: 250, surplus_qu_id: 4 },
    reasons: [],
  });
  assert.equal(view.label, '1,99 € – 4,98 €');
  assert.match(view.details, /1 emballage/);
  assert.match(view.details, /2 emballages/);
  assert.match(view.details, /surplus/i);
});

test('signale explicitement une borne provisoire ou absente', () => {
  assert.match(shoppingRangeLineView({ status: 'provisional', min: { identity_key: 'sku:1', packages: 1, amount_cents: 100 }, max: { identity_key: 'sku:2', packages: 1, amount_cents: 200 }, reasons: ['Collecte incomplète'] }).label, /provisoire/i);
  assert.equal(shoppingRangeLineView({ status: 'missing', min: null, max: null, reasons: ['Fourchette absente'] }).label, 'Fourchette absente');
  assert.equal(shoppingRangeLineView({ status: 'invalid', min: null, max: null, reasons: ['Unité invalide'] }).label, 'Quantité ou unité à préciser');
});

test('le total incomplet reste un sous-total connu', () => {
  assert.equal(shoppingRangeTotalView({ status: 'exhaustive', known_min_cents: 500, known_max_cents: 900, missing_count: 0 }).label, '5,00 € – 9,00 €');
  assert.match(shoppingRangeTotalView({ status: 'incomplete', known_min_cents: 500, known_max_cents: 900, missing_count: 2 }).label, /^Sous-total connu/);
  assert.match(shoppingRangeTotalView({ status: 'provisional', known_min_cents: 500, known_max_cents: 900, missing_count: 0 }).label, /provisoire/i);
});

test('ignore une génération non activée ou périmée', () => {
  configureFamilyProfiles([{profile_id:'riz-nature',owner_product_id:70,comparison_mode:'physical',physical_kind:'mass',accepted_display_qu_ids:[4],include_rules:['riz'],exclude_rules:['plat préparé']}]);
  const value = id => JSON.stringify({ generation_id: id, owner_product_id: 70, profile_id: 'riz-nature', complete: true, expires_at: '2026-09-07T08:00:00Z', results: [] });
  const products = [
    { id: 70, userfields: { courses_u_equivalent_family_v1: value('active') } },
    { id: 71, userfields: { courses_u_equivalent_family_v1: value('autre') } },
  ];
  const families = familiesFromProducts(products, 'active', '2026-09-06T12:00:00Z');
  assert.equal(families.length, 1);
  assert.equal(families[0].owner_product_id, 70);
  assert.equal(familiesFromProducts(products, 'active', '2026-09-08T12:00:00Z')[0].complete, false);
});

test('le navigateur reste strictement en lecture seule et sans stockage', async () => {
  const source = await readFile(new URL('../src/ui/shopping-range-browser.mjs', import.meta.url), 'utf8');
  assert.match(source, /Grocy\.Api\.Get/);
  assert.doesNotMatch(source, /\.Post\(|\.Put\(|\.Delete\(|localStorage|sessionStorage|XMLHttpRequest|fetch\(/);
});
