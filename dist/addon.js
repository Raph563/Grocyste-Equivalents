(()=>{'use strict';if(!globalThis.Grocyste?.available())return;
const ADDON_ID="equivalents";const window=globalThis.Grocyste.compatWindow(ADDON_ID);const Grocy=window.Grocy;const fetch=window.fetch;
window.Grocyste.register({id:ADDON_ID,name:"\u00c9quivalents et fourchettes",version:'1.0.0'});
const EXPECTED_SHOPPING_RANGE_GENERATION=window.Grocyste.configuration().instanceConfig?.shoppingRangeGeneration||null;
const MON_GROCY_SHARED_TIMER_ENTITY_ID=window.Grocyste.configuration().instanceConfig?.sharedTimerEntityId||0;

const configureProfiles=window.Grocyste.configuration().instanceConfig?.familyProfiles;

let FAMILY_PROFILES = Object.freeze([]);
function configureFamilyProfiles(profiles) { validateFamilyProfiles(profiles); FAMILY_PROFILES = Object.freeze(profiles.map(profile => Object.freeze({...profile}))); }

const DIMENSIONS = new Set(['mass', 'volume', 'count']);

function validateFamilyProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) throw new Error('Profils de famille absents');
  const ids = new Set();
  const owners = new Set();
  for (const entry of profiles) {
    if (!entry || !/^[a-z0-9-]+$/.test(entry.profile_id ?? '')) throw new Error('Identifiant de profil invalide');
    if (ids.has(entry.profile_id)) throw new Error(`Profil dupliqué: ${entry.profile_id}`);
    ids.add(entry.profile_id);
    if (!Number.isInteger(entry.owner_product_id) || entry.owner_product_id <= 0) throw new Error('Propriétaire invalide');
    if (owners.has(entry.owner_product_id)) throw new Error(`Propriétaire dupliqué: ${entry.owner_product_id}`);
    owners.add(entry.owner_product_id);
    if (!['physical', 'package_count'].includes(entry.comparison_mode)) throw new Error('Mode de comparaison invalide');
    if (entry.comparison_mode === 'physical' && !DIMENSIONS.has(entry.physical_kind)) throw new Error('Dimension physique invalide');
    if (entry.comparison_mode === 'package_count' && entry.physical_kind !== null) throw new Error('Dimension interdite pour un emballage');
    if (!Array.isArray(entry.accepted_display_qu_ids) || !entry.accepted_display_qu_ids.every(id => Number.isInteger(id) && id > 0)) throw new Error('Unités affichées invalides');
    if (!Array.isArray(entry.include_rules) || entry.include_rules.length === 0 || !Array.isArray(entry.exclude_rules) || entry.exclude_rules.length === 0) throw new Error('Règles de classement incomplètes');
  }
  return true;
}
if(typeof window!=='undefined'&&window.Grocyste?.configuration().instanceConfig?.familyProfiles?.length)configureFamilyProfiles(window.Grocyste.configuration().instanceConfig.familyProfiles);



const SI_UNITS = new Map([
  [4, ['mass', 1]],
  [12, ['mass', 1000]],
  [18, ['volume', 1]],
  [19, ['volume', 10]],
  [11, ['volume', 1000]],
]);

const invalid = reason => ({ status: 'invalid', min: null, max: null, reasons: [reason] });
const missing = reason => ({ status: 'missing', min: null, max: null, reasons: [reason] });

const physicalAmountIn = (amount, fromQuId, targetQuId, kind) => {
  const from = SI_UNITS.get(Number(fromQuId));
  const target = SI_UNITS.get(Number(targetQuId));
  if (!from || !target || from[0] !== kind || target[0] !== kind) throw new Error('Unité ou dimension physique incompatible');
  return amount * from[1] / target[1];
};

const payable = (candidate, packages, surplus = null, surplusQuId = null) => ({
  identity_key: candidate.identity_key,
  product_id: candidate.product_id,
  packages,
  amount_cents: packages * candidate.package_price_cents,
  surplus,
  surplus_qu_id: surplusQuId,
});

const chooseExtreme = (entries, direction) => [...entries].sort((left, right) => {
  const amountOrder = direction === 'min'
    ? left.amount_cents - right.amount_cents
    : right.amount_cents - left.amount_cents;
  return amountOrder || left.identity_key.localeCompare(right.identity_key);
})[0];

function calculateLineRange({ request, candidates, complete } = {}) {
  if (!request || !Array.isArray(candidates) || typeof complete !== 'boolean') return invalid('Demande de fourchette invalide');
  const eligible = candidates.filter(candidate => candidate?.status === 'eligible' && Number.isInteger(candidate.package_price_cents) && candidate.package_price_cents > 0 && typeof candidate.identity_key === 'string');
  const entries = [];

  if (request.comparison_mode === 'package_count') {
    if (!Number.isFinite(request.amount_display) || request.amount_display <= 0 || !Number.isInteger(request.display_qu_id)) return invalid('Quantité ou unité d’emballage invalide');
    const packages = Math.ceil(request.amount_display);
    for (const candidate of eligible) entries.push(payable(candidate, packages));
  } else if (request.comparison_mode === 'physical') {
    if (!['mass', 'volume', 'count'].includes(request.physical_kind) || !Number.isFinite(request.requested_base_amount) || request.requested_base_amount <= 0 || !Number.isInteger(request.base_qu_id)) return invalid('Quantité physique invalide');
    try {
      physicalAmountIn(request.requested_base_amount, request.base_qu_id, request.base_qu_id, request.physical_kind);
    } catch (error) {
      return invalid(error.message);
    }
    for (const candidate of eligible) {
      const basis = candidate.comparison_basis;
      if (!basis || basis.kind !== request.physical_kind || !Number.isFinite(basis.amount) || basis.amount <= 0 || !Number.isInteger(basis.qu_id)) continue;
      try {
        const packageAmount = physicalAmountIn(basis.amount, basis.qu_id, request.base_qu_id, request.physical_kind);
        const packages = Math.ceil(request.requested_base_amount / packageAmount);
        entries.push(payable(candidate, packages, packages * packageAmount - request.requested_base_amount, request.base_qu_id));
      } catch {
        // A candidate with an incompatible comparison basis is excluded, not coerced.
      }
    }
  } else {
    return invalid('Mode de comparaison invalide');
  }

  if (entries.length === 0) return missing('Aucun candidat éligible et comparable');
  return {
    status: complete ? 'exhaustive' : 'provisional',
    min: chooseExtreme(entries, 'min'),
    max: chooseExtreme(entries, 'max'),
    reasons: complete ? [] : ['Collecte Courses U incomplète'],
  };
}


const id = value => Number.parseInt(value, 10);

function buildShoppingRanges({ items = [], products = [], families = [], generation_id = null, evaluated_at = new Date().toISOString() } = {}) {
  const productsById = new Map(products.map(product => [id(product.id), product]));
  const familiesByOwner = new Map(families.map(family => [id(family.owner_product_id), family]));
  const lines = items.map(item => {
    const productId = id(item.product_id);
    const product = productsById.get(productId);
    const ownerProductId = product?.parent_product_id ? id(product.parent_product_id) : productId;
    const family = familiesByOwner.get(ownerProductId);
    if (!family) return {
      shopping_list_id: id(item.id),
      product_id: productId,
      owner_product_id: ownerProductId,
      profile_id: null,
      status: 'missing',
      min: null,
      max: null,
      reasons: ['Fourchette absente pour cette famille'],
    };
    const profile = family.profile;
    const displayQuId = id(item.display_qu_id);
    if (!profile.accepted_display_qu_ids.includes(displayQuId)) return {
      shopping_list_id: id(item.id), product_id: productId, owner_product_id: ownerProductId, profile_id: profile.profile_id,
      status: 'invalid', min: null, max: null, reasons: ['Unité affichée non admise par la famille'],
    };
    const request = profile.comparison_mode === 'physical'
      ? {
          comparison_mode: 'physical',
          physical_kind: profile.physical_kind,
          requested_base_amount: Number(item.requested_base_amount ?? item.display_amount),
          base_qu_id: id(item.base_qu_id ?? item.display_qu_id),
        }
      : {
          comparison_mode: 'package_count',
          amount_display: Number(item.display_amount),
          display_qu_id: displayQuId,
        };
    return {
      shopping_list_id: id(item.id),
      product_id: productId,
      owner_product_id: ownerProductId,
      profile_id: profile.profile_id,
      ...calculateLineRange({ request, candidates: family.candidates, complete: family.complete }),
    };
  });

  let knownMin = 0;
  let knownMax = 0;
  let missingCount = 0;
  let provisionalCount = 0;
  for (const line of lines) {
    if (line.min && line.max) {
      knownMin += line.min.amount_cents;
      knownMax += line.max.amount_cents;
      if (line.status === 'provisional') provisionalCount += 1;
    } else {
      missingCount += 1;
    }
  }
  return {
    generation_id,
    evaluated_at,
    lines,
    totals: {
      status: missingCount > 0 ? 'incomplete' : provisionalCount > 0 ? 'provisional' : 'exhaustive',
      known_min_cents: knownMin,
      known_max_cents: knownMax,
      missing_count: missingCount,
    },
  };
}


const shoppingRangeEuro = cents => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(cents / 100);
const shoppingRangeParse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value ?? null; } catch { return null; } };
const shoppingRangeExpectedGeneration = typeof EXPECTED_SHOPPING_RANGE_GENERATION !== 'undefined' ? EXPECTED_SHOPPING_RANGE_GENERATION : null;

function familiesFromProducts(products, expectedGeneration, evaluatedAt = new Date().toISOString()) {
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

function shoppingRangeLineView(line) {
  if (line.status === 'missing') return { label: 'Fourchette absente', details: (line.reasons ?? []).join(' — '), css: 'cu-range-missing' };
  if (line.status === 'invalid') return { label: 'Quantité ou unité à préciser', details: (line.reasons ?? []).join(' — '), css: 'cu-range-missing' };
  const range = `${shoppingRangeEuro(line.min.amount_cents)} – ${shoppingRangeEuro(line.max.amount_cents)}`;
  return {
    label: line.status === 'provisional' ? `${range} (provisoire)` : range,
    details: [shoppingRangeExtreme('Minimum', line.min), shoppingRangeExtreme('Maximum', line.max), ...(line.reasons ?? [])].filter(Boolean).join(' — '),
    css: line.status === 'provisional' ? 'cu-range-provisional' : 'cu-range-complete',
  };
}

function shoppingRangeTotalView(total) {
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
  const historicalUnit = labels.findIndex(label => (label.includes('dernier prix') || label.includes('coût historique') || label.includes('last price')) && (label.includes('unité') || label.includes('unit')));
  const currentTotal = labels.findIndex(label => (label.includes('dernier prix') || label.includes('prix actuel') || label.includes('last price')) && label.includes('total'));
  if (historicalUnit < 0 || currentTotal < 0) throw new Error('Colonnes de prix introuvables');
  return { historicalUnit, currentTotal };
}

function shoppingRangeApply(model) {
  const table = document.querySelector('#shoppinglist-table');
  if (!table) return;
  let indexes;try{indexes=shoppingRangeColumnIndexes(table);}catch{indexes=null;}
  let companion=null;
  if(indexes){table.querySelectorAll('thead th')[indexes.historicalUnit].textContent = 'Coût historique (unité)';table.querySelectorAll('thead th')[indexes.currentTotal].textContent = 'Prix actuel min–max';}
  else {
    companion=document.getElementById('grocyste-shopping-ranges');
    if(!companion){companion=document.createElement('section');companion.id='grocyste-shopping-ranges';companion.className='card p-3 my-3';table.parentElement.after(companion);}
    companion.replaceChildren();const title=document.createElement('h3');title.textContent='Fourchettes de prix actuels';companion.append(title);
  }
  for (const line of model.lines) {
    const row=document.querySelector(`#shoppinglistitem-${line.shopping_list_id}-row`);
    let cell=indexes?row?.cells[indexes.currentTotal]:null;
    if(companion&&row){cell=document.createElement('div');const name=document.createElement('strong');name.textContent=row.cells[1]?.textContent?.trim()||`Produit ${line.owner_product_id}`;companion.append(name,cell);}
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
  const total = indexes?document.querySelector('#total-value'):document.createElement('p');
  if (total) {
    if(companion){total.className='cu-shopping-range-total';companion.append(total);}
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

if(configureProfiles?.length)configureFamilyProfiles(configureProfiles);

})();
