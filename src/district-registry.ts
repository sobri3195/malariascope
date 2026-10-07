import { normalize, type Row } from './analytics.ts';
import registry from '../public/data/district-registry.json' with { type: 'json' };
export type DistrictIdentity = {
  canonicalName: string;
  code?: string | null;
  geometryCode?: string | null;
  aliases: string[];
  normalizedName?: string;
};
export function identityNames(identity: DistrictIdentity) {
  return new Set(
    [identity.canonicalName, identity.normalizedName || '', ...identity.aliases]
      .filter(Boolean)
      .map(normalize),
  );
}
export function resolveDistrict(
  identity: DistrictIdentity,
  rows: Row[],
  entries: DistrictIdentity[] = registry.districts,
) {
  const requestedCode = identity.geometryCode || identity.code;
  const names = identityNames(identity);
  const codedEntries = requestedCode
    ? entries.filter(
        (entry) => entry.code === requestedCode || entry.geometryCode === requestedCode,
      )
    : [];
  const candidatesByRegistry = codedEntries.length
    ? codedEntries
    : entries.filter((entry) => [...identityNames(entry)].some((name) => names.has(name)));
  if (candidatesByRegistry.length > 1)
    return { row: null, status: 'Manual geographic match required.' };
  const registered = candidatesByRegistry[0];
  if (
    requestedCode &&
    registered?.code &&
    requestedCode !== registered.code &&
    requestedCode !== registered.geometryCode
  )
    return { row: null, status: 'UNMATCHED' };
  if (registered) for (const name of identityNames(registered)) names.add(name);
  const code = registered?.code || requestedCode;
  const coded = code ? rows.filter((r) => r.district_code === String(code)) : [];
  const named = rows.filter((r) => names.has(normalize(r.district)) && (!code || !r.district_code));
  const candidates = coded.length ? coded : named;
  return {
    row: candidates.length === 1 ? candidates[0] : null,
    status:
      candidates.length > 1
        ? 'Manual geographic match required.'
        : candidates.length
          ? 'MATCHED'
          : 'UNMATCHED',
  };
}
export function featureDistrictIdentity(feature: any): DistrictIdentity {
  const p = feature.properties || {};
  return {
    canonicalName: String(p.canonical_name || p.district || p.name || ''),
    normalizedName: typeof p.normalized_name === 'string' ? p.normalized_name : undefined,
    code: p.district_code || p.code,
    geometryCode: p.geometryCode,
    aliases: Array.isArray(p.aliases)
      ? p.aliases.filter((a: unknown) => typeof a === 'string')
      : [],
  };
}
