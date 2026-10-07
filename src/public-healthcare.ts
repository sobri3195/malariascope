export const facilityRegion = { south: -9.5, west: 131.9, north: 0.5, east: 141.1 };
export const facilityEndpoint = 'https://overpass-api.de/api/interpreter';
export type PublicFacility = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  url: string;
};
export type FacilitySnapshot = {
  facilities: PublicFacility[];
  retrieved: string;
  dataPeriod: string | null;
  source: string;
  license: string;
  bounds: typeof facilityRegion;
  truncated: boolean;
};
export function facilityQuery(bounds: typeof facilityRegion) {
  return `[out:json][timeout:25];nwr["amenity"~"^(hospital|clinic|doctors)$"]["military"!~"."]["access"!~"^(private|no|permit|restricted|military)$"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out center tags 3001;`;
}
export function publicFacilities(response: any, bounds: typeof facilityRegion): PublicFacility[] {
  const facilities: PublicFacility[] = [];
  const seen = new Set<string>();
  for (const e of response.elements || []) {
    const tags = e.tags || {},
      lat = e.lat ?? e.center?.lat,
      lon = e.lon ?? e.center?.lon;
    if (
      !['hospital', 'clinic', 'doctors'].includes(tags.amenity) ||
      !['node', 'way', 'relation'].includes(e.type) ||
      !Number.isSafeInteger(e.id)
    )
      continue;
    // Retain ordinary public healthcare only; never propagate raw OSM tags or operational features.
    if (
      Object.keys(tags).some((key) => /military/i.test(key)) ||
      Object.values(tags).some((value) =>
        /military|army|navy|air force|armed forces|\btni\b|\brsad\b|\brsau\b|\brsal\b|rumah sakit tentara|rumkit|angkatan|pertahanan|garrison|barracks|naval|troop|deployment/i.test(
          String(value),
        ),
      ) ||
      ['private', 'no', 'permit', 'restricted', 'military'].includes(tags.access)
    )
      continue;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < bounds.south ||
      lat > bounds.north ||
      lon < bounds.west ||
      lon > bounds.east
    )
      continue;
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    facilities.push({
      id,
      name: typeof tags.name === 'string' ? tags.name.slice(0, 160) : `Public ${tags.amenity}`,
      type: tags.amenity,
      lat,
      lon,
      url: `https://www.openstreetmap.org/${id}`,
    });
  }
  return facilities.slice(0, 3000);
}
export async function fetchPublicFacilities(signal: AbortSignal): Promise<FacilitySnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 35000);
  try {
    const url = `${facilityEndpoint}?${new URLSearchParams({ data: facilityQuery(facilityRegion) })}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok)
      throw Error(
        `Public facility service returned ${response.status}. Try again later; no facility positions are synthesized.`,
      );
    const body = await response.json();
    if (!Array.isArray(body.elements)) throw Error('Public facility response is invalid.');
    return {
      facilities: publicFacilities(body, facilityRegion),
      retrieved: new Date().toISOString(),
      dataPeriod:
        typeof body.osm3s?.timestamp_osm_base === 'string' &&
        Number.isFinite(Date.parse(body.osm3s.timestamp_osm_base))
          ? body.osm3s.timestamp_osm_base
          : null,
      source: 'OpenStreetMap via Overpass API',
      license: 'Open Database License (ODbL) · © OpenStreetMap contributors',
      bounds: facilityRegion,
      truncated: body.elements.length > 3000,
    };
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted)
      throw Error(
        'Public facility service timed out. Try again later; no facility positions are synthesized.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function validateFacilitySnapshot(body: any): FacilitySnapshot {
  if (!Array.isArray(body?.facilities) || !body.facilities.length)
    throw Error('Public facility snapshot not connected — zero facilities.');
  if (body.facilities.length > 3000) throw Error('Maximum 3,000 public facilities.');
  for (const key of ['source', 'license', 'retrieved'])
    if (typeof body[key] !== 'string' || !body[key].trim())
      throw Error(`Facility snapshot requires ${key}.`);
  if (!Number.isFinite(Date.parse(body.retrieved)))
    throw Error('Invalid facility retrieval timestamp.');
  const elements = body.facilities.flatMap((f: any) => {
    if (Object.keys(f).some((k) => /military|troop|deployment|tactical|route/i.test(k))) return [];
    const match = typeof f.id === 'string' ? /^(node|way|relation)\/(\d+)$/.exec(f.id) : null;
    if (!match || f.url !== `https://www.openstreetmap.org/${f.id}`) return [];
    return [
      {
        type: match[1],
        id: Number(match[2]),
        lat: f.lat,
        lon: f.lon,
        tags: { amenity: f.type, name: f.name, access: f.access || 'yes' },
      },
    ];
  });
  const facilities = publicFacilities({ elements }, facilityRegion);
  if (!facilities.length)
    throw Error('No valid, unrestricted public healthcare records in snapshot.');
  return {
    facilities,
    source: body.source,
    license: body.license,
    retrieved: body.retrieved,
    dataPeriod:
      typeof body.dataPeriod === 'string' && Number.isFinite(Date.parse(body.dataPeriod))
        ? body.dataPeriod
        : null,
    bounds: facilityRegion,
    truncated: body.truncated === true,
  };
}
