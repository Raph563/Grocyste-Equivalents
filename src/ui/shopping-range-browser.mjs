import { FAMILY_PROFILES } from '../equivalents/family-profiles.mjs';
import { buildShoppingRanges } from '../equivalents/shopping-range.mjs';

const shoppingRangeEuro = cents => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100);
const shoppingRangeParse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? null; } catch { return null; } };
const shoppingRangeExpectedGeneration = typeof EXPECTED_SHOPPING_RANGE_GENERATION !== 'undefined' ? EXPECTED_SHOPPING_RANGE_GENERATION : null;

export function familiesFromProducts(products, expectedGeneration, evaluatedAt = new Date().toISOString()) {
  const productMap = new Map(products.map(product => [Number(product.id), product]));
  const profileMap = new Map(FAMILY_PROFILES.map(profile => [profile.profile_id, profile]));
  const evaluated = Date.parse(evaluatedAt);
  return products.flatMap(owner => {
    const family = shoppingRangeParse(owner.userfields?.courses_u_equivalent_family_v1);
    if (!family || family.generation_id !== expectedGeneration || Number(family.owner_product_id) !== Number(owner.id)) return [];
    const profile = profileMap.get(family.profile_id);
    if (!profile) return [];
    const expired = !Number.isFinite(evaluated) || !Number.isFinite(Date.parse(family.expires_at)) || evaluated > Date.parse(family.expires_at);
    const candidates = (family.results ?? []).flatMap(result => {
      if (result.status !== 'eligible' || !Number.isInteger(result.product_id)) return [];
      const product = productMap.get(Number(result.product_id));
      const reference = shoppingRangeParse(product?.userfields?.courses_u_reference_v1);
      if (!product || !reference || expired) return [{ identity_key: result.identity_key, product_id: result.product_id, status: 'price_missing' }];
      const packagePriceCents = Number.isInteger(reference.package_price_cents) ? reference.package_price_cents : Math.round(Number(reference.package_price) * 100);
      return [{ identity_key: result.identity_key, product_id: result.product_id, status: 'eligible', package_price_cents: packagePriceCents, comparison_basis: reference.comparison_basis ?? null }];
    });
    return [{ owner_product_id: Number(owner.id), profile, complete: Boolean(family.complete) && !expired, candidates }];
  });
}

const shoppingRangeExtreme = (label, value) => {
  if (!value) return '';
  const packages = `${value.packages} emballage${value.packages > 1 ? 's' : ''}`;
  const surplus = value.surplus == null ? '' : `, surplus ${new Intl.NumberFormat('fr-FR').format(value.surplus)} (unité ${value.surplus_qu_id})`;
  return `${label} : ${shoppingRangeEuro(value.amount_cents)}, ${packages}${surplus}, ${value.identity_key}`;
};

export function shoppingRangeLineView(line) {
  if (line.status === 'missing') return { label: 'Fourchette absente', details: (line.reasons ?? []).join(' — '), css: 'cu-range-missing' };
  if (line.status === 'invalid') return { label: 'Quantité ou unité à préciser', details: (line.reasons ?? []).join(' — '), css: 'cu-range-missing' };
  const range = `${shoppingRangeEuro(line.min.amount_cents)} – ${shoppingRangeEuro(line.max.amount_cents)}`;
  return {
    label: line.status === 'provisional' ? `${range} (provisoire)` : range,
    details: [shoppingRangeExtreme('Minimum', line.min), shoppingRangeExtreme('Maximum', line.max), ...(line.reasons ?? [])].filter(Boolean).join(' — '),
    css: line.status === 'provisional' ? 'cu-range-provisional' : 'cu-range-complete',
  };
}

export function shoppingRangeTotalView(total) {
  const range = `${shoppingRangeEuro(total.known_min_cents)} – ${shoppingRangeEuro(total.known_max_cents)}`;
  if (total.status === 'incomplete') return { label: `Sous-total connu ${range} (${total.missing_count} ligne${total.missing_count > 1 ? 's' : ''} absente${total.missing_count > 1 ? 's' : ''})`, css: 'cu-shopping-total-partial' };
  if (total.status === 'provisional') return { label: `${range} (provisoire)`, css: 'cu-shopping-total-partial' };
  return { label: range, css: 'cu-range-complete' };
}

function shoppingRangeRenderedItems(apiItems) {
  const apiMap = new Map(apiItems.map(item => [Number(item.id), item]));
  return [...document.querySelectorAll('#shoppinglist-table tbody tr[id^="shoppinglistitem-"]')].flatMap(row => {
    const item = apiMap.get(Number(row.id.match(/^shoppinglistitem-(\d+)-row$/)?.[1]));
    const amount = Number(row.cells[2]?.querySelector('.custom-sort')?.textContent?.trim());
    return item && Number.isFinite(amount) ? [{ id: Number(item.id), product_id: Number(item.product_id), display_amount: amount, display_qu_id: Number(item.qu_id) }] : [];
  });
}

function shoppingRangeColumnIndexes(table) {
  const labels = [...table.querySelectorAll('thead th')].map(node => node.textContent.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr-FR'));
  const historicalUnit = labels.findIndex(label => (label.includes('dernier prix') || label.includes('coût historique')) && label.includes('unité'));
  const currentTotal = labels.findIndex(label => (label.includes('dernier prix') || label.includes('prix actuel')) && label.includes('total'));
  if (historicalUnit < 0 || currentTotal < 0) throw new Error('Colonnes de prix introuvables');
  return { historicalUnit, currentTotal };
}

function shoppingRangeApply(model) {
  const table = document.querySelector('#shoppinglist-table');
  if (!table) return;
  const indexes = shoppingRangeColumnIndexes(table);
  table.querySelectorAll('thead th')[indexes.historicalUnit].textContent = 'Coût historique (unité)';
  table.querySelectorAll('thead th')[indexes.currentTotal].textContent = 'Prix actuel min–max';
  for (const line of model.lines) {
    const cell = document.querySelector(`#shoppinglistitem-${line.shopping_list_id}-row`)?.cells[indexes.currentTotal];
    if (!cell) continue;
    const view = shoppingRangeLineView(line);
    cell.replaceChildren();
    const details = document.createElement('details');
    details.className = `cu-shopping-range ${view.css}`;
    const summary = document.createElement('summary');
    summary.textContent = view.label;
    details.append(summary);
    const explanation = document.createElement('p');
    explanation.textContent = view.details;
    details.append(explanation);
    cell.append(details);
  }
  const total = document.querySelector('#total-value');
  if (total) {
    const view = shoppingRangeTotalView(model.totals);
    total.classList.remove('locale-number', 'locale-number-currency', 'cu-range-complete', 'cu-shopping-total-partial');
    total.classList.add(view.css);
    total.textContent = view.label;
  }
}

function shoppingRangeGet(entity) {
  return new Promise((resolve, reject) => Grocy.Api.Get(`objects/${entity}`, value => Array.isArray(value) ? resolve(value) : reject(new Error('Réponse invalide')), () => reject(new Error('Lecture indisponible'))));
}

async function startShoppingRange() {
  if (!shoppingRangeExpectedGeneration || !document.querySelector('#shoppinglist-table')) return;
  try {
    const [products, items] = await Promise.all(['products', 'shopping_list'].map(shoppingRangeGet));
    const families = familiesFromProducts(products, shoppingRangeExpectedGeneration);
    shoppingRangeApply(buildShoppingRanges({ items: shoppingRangeRenderedItems(items), products, families, generation_id: shoppingRangeExpectedGeneration }));
  } catch {
    const total = document.querySelector('#total-value');
    if (total) total.textContent = 'Fourchette indisponible';
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'complete') startShoppingRange();
  else window.addEventListener('load', startShoppingRange, { once: true });
}
