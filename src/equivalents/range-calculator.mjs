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

export function calculateLineRange({ request, candidates, complete } = {}) {
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
