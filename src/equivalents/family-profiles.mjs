export let FAMILY_PROFILES = Object.freeze([]);
export function configureFamilyProfiles(profiles) { validateFamilyProfiles(profiles); FAMILY_PROFILES = Object.freeze(profiles.map(profile => Object.freeze({...profile}))); }

const DIMENSIONS = new Set(['mass', 'volume', 'count']);

export function validateFamilyProfiles(profiles) {
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


