import { calculateLineRange } from './range-calculator.mjs';

const id = value => Number.parseInt(value, 10);

export function buildShoppingRanges({ items = [], products = [], families = [], generation_id = null, evaluated_at = new Date().toISOString() } = {}) {
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
