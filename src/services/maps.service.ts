/**
 * Google Maps link resolution + delivery pricing.
 *
 * Single source of truth for turning a customer-pasted Maps link into
 * coordinates, a distance, and a delivery cost. The frontend mirrors the
 * tariff table for instant preview, but the amount actually charged is
 * always the one computed here.
 */

export interface Coords {
  lat: number
  lng: number
}

export interface MapsQuote {
  resolvedUrl: string
  coords: Coords | null
  km: number | null
  deliveryCost: number | null
  /** 'driving' = road distance from a routing API; 'straight' = haversine fallback. */
  kmSource: 'driving' | 'straight' | null
}

/** Store origin — override per environment without a redeploy of the code. */
const ORIGIN: Coords = {
  lat: Number(process.env.STORE_LAT ?? -2.1647443),
  lng: Number(process.env.STORE_LNG ?? -79.912804),
}

/**
 * Continental Ecuador bounding box. Any coordinate outside it is a parsing
 * artifact (a street number, a zoom level, an id fragment), not an address —
 * we drop it instead of charging the top tier for a bogus 8000 km distance.
 */
const EC_BBOX = { minLat: -5.2, maxLat: 1.8, minLng: -81.3, maxLng: -74.9 }

/** Past this, distance is treated as unknown ("por coordinar"), not max tier. */
const MAX_DELIVERY_KM = 60

/** [maxKm, price] — first tier whose maxKm >= distance wins. */
const TARIFFS: ReadonlyArray<readonly [number, number]> = [
  [1, 2.0],
  [2.9, 2.5],
  [4.9, 3.0],
  [5.9, 3.5],
  [7.9, 4.0],
  [8.5, 4.5],
  [9.9, 5.0],
  [10.9, 5.5],
  [13.9, 6.0],
  [15.9, 6.5],
  [17.9, 7.0],
  [20.9, 8.0],
  [23.9, 9.0],
  [MAX_DELIVERY_KM, 10.0],
]

/**
 * Hosts we will follow a redirect on. Kept permissive on purpose: customers
 * paste from the Android app, the iOS app, desktop share and regional domains,
 * and every one of those produces a different host.
 */
const ALLOWED_HOST_RE =
  /^(?:(?:www|maps)\.)?(?:google\.[a-z.]{2,6}|goo\.gl|g\.co|maps\.app\.goo\.gl|app\.goo\.gl)$/i

/**
 * User agents tried in order, first one that yields coordinates wins.
 *
 * Order matters: `maps.app.goo.gl` answers a *desktop Chrome* UA with a
 * JavaScript interstitial (HTTP 200, no Location header, no coordinates
 * anywhere in the markup), but answers every other client with a clean 302 to
 * the full maps URL. So the plain agent goes first and desktop Chrome is only
 * a last resort for the pages that require it.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (compatible; TequeBot/1.0)',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
]

const NUM = '(-?\\d+\\.\\d+)'

/**
 * Ordered by trustworthiness: `!3d!4d` is the pin Google resolved, `@` is only
 * the viewport centre (off by up to a few hundred metres at low zoom).
 */
const COORD_PATTERNS: RegExp[] = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`[?&](?:q|query|destination|daddr|saddr|ll|sll|center|mlat)=(?:loc:)?${NUM},\\+?${NUM}`),
  new RegExp(`/maps/(?:search|dir|place)/${NUM},\\+?${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`"latitude"\\s*:\\s*${NUM}[\\s\\S]{0,120}?"longitude"\\s*:\\s*${NUM}`),
]

/** Whole-input bare coordinates — customers often paste just "-2.15, -79.91". */
const BARE_COORDS_RE = new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`)

/**
 * A "how to get there" link rather than a place link. Customers share these
 * straight from the directions screen, so the address we must deliver to is
 * the *destination* — the origin is our own store and would price at $2.00.
 */
const DIRECTIONS_RE = /[?&](?:daddr|destination)=|\/maps\/dir\//i

/** Destination-only patterns: these can never capture the origin. */
const DEST_PATTERNS: RegExp[] = [
  new RegExp(`[?&](?:daddr|destination)=(?:loc:)?${NUM},\\+?${NUM}`),
  new RegExp(`/maps/dir/[^/?#]*/${NUM},\\+?${NUM}`),
]

/** Closer than this to the store, a directions hit is the origin, not a home. */
const SAME_PLACE_KM = 0.05

/**
 * Percent-decode without losing the whole string to one bad escape.
 *
 * Maps HTML embeds its deep link percent-encoded (`%213d-2.04%214d-79.85`)
 * inside 200 KB of minified JS full of stray `%`. A single `decodeURIComponent`
 * over that throws, so every coordinate in the body stayed invisible.
 */
function decodeSafe(text: string): string {
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (seq) => {
    try {
      return decodeURIComponent(seq)
    } catch {
      return seq
    }
  })
}

/** Every plausible pair a pattern finds, in document order. */
function matchAllCoords(text: string, pattern: RegExp): Coords[] {
  const found: Coords[] = []
  for (const match of text.matchAll(new RegExp(pattern.source, 'gi'))) {
    const lat = parseFloat(match[1]!)
    const lng = parseFloat(match[2]!)
    if (isPlausible(lat, lng)) found.push({ lat, lng })
  }
  return found
}

function isPlausible(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return (
    lat >= EC_BBOX.minLat &&
    lat <= EC_BBOX.maxLat &&
    lng >= EC_BBOX.minLng &&
    lng <= EC_BBOX.maxLng
  )
}

/**
 * Pull a plausible coordinate pair out of a URL, or of an HTML body.
 *
 * `preferLast` picks the final match instead of the first: a directions page
 * lists its waypoints in travel order, so the last `!3d!4d` is the destination.
 */
export function extractCoords(text: string, preferLast = false): Coords | null {
  if (!text) return null

  const bare = text.match(BARE_COORDS_RE)
  if (bare) {
    const lat = parseFloat(bare[1]!)
    const lng = parseFloat(bare[2]!)
    if (isPlausible(lat, lng)) return { lat, lng }
  }

  const decoded = decodeSafe(text)

  for (const candidate of decoded === text ? [text] : [text, decoded]) {
    for (const pattern of COORD_PATTERNS) {
      // Collect every hit: a bad `@` match must not shadow a good `!3d!4d`,
      // and on a route we need the last pair, not the first.
      const hits = matchAllCoords(candidate, pattern)
      if (hits.length) return preferLast ? hits[hits.length - 1]! : hits[0]!
    }
  }

  return null
}

/**
 * Coordinates of the delivery address for a directions link.
 *
 * Tries the destination-only URL params first, then falls back to the last
 * waypoint in the page — and refuses a hit sitting on the store itself, which
 * is the origin leaking through rather than a customer address.
 */
export function extractDestinationCoords(url: string, body: string): Coords | null {
  for (const source of [url, decodeSafe(url)]) {
    for (const pattern of DEST_PATTERNS) {
      const hits = matchAllCoords(source, pattern)
      if (hits.length) return hits[0]!
    }
  }

  const last = extractCoords(body, true)
  if (last && haversineKm(ORIGIN, last) > SAME_PLACE_KM) return last
  return null
}

/**
 * Normalise whatever the customer pasted into a fetchable URL.
 * Handles missing protocol, surrounding chat text, and trailing punctuation.
 */
export function normalizeMapsUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()

  const urlMatch = trimmed.match(/(https?:\/\/[^\s<>"']+)/i)
  let candidate = urlMatch
    ? urlMatch[1]!
    : /^(?:www\.|maps\.|goo\.gl|g\.co)/i.test(trimmed)
      ? `https://${trimmed.split(/\s+/)[0]}`
      : null
  if (!candidate) return null

  candidate = candidate.replace(/[.,;)\]]+$/, '')

  try {
    const parsed = new URL(candidate)
    if (!ALLOWED_HOST_RE.test(parsed.hostname)) return null
    parsed.protocol = 'https:'
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Road distance in km, or null when no routing service answers.
 *
 * Straight-line distance under-charges badly here: Guayaquil and Samborondón
 * are split by rivers, so a 15 km haversine is 20+ km of actual riding. Google
 * Routes API is preferred because its number is the one the customer compares
 * against. Among the free no-key engines, Valhalla goes before OSRM: its auto
 * costing picks the same big-avenue routes Google does (22.8 km to Monte Tabor
 * where OSRM's shortest-path answer was 19.4 km and Google showed 22 km).
 */
async function drivingKm(a: Coords, b: Coords): Promise<number | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    const km = await googleDrivingKm(a, b, key)
    if (km !== null) return km
  }
  return (await valhallaDrivingKm(a, b)) ?? (await osrmDrivingKm(a, b))
}

async function valhallaDrivingKm(a: Coords, b: Coords): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TequeBot/1.0' },
      body: JSON.stringify({
        locations: [{ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }],
        costing: 'auto',
        units: 'kilometers',
      }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { trip?: { summary?: { length?: number } } }
    const km = data.trip?.summary?.length
    return typeof km === 'number' && km > 0 ? km : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Google's optimal-route distance runs systematically short of what the
 * courier rides (and of what the Maps app shows with live traffic), so it is
 * padded by this factor. 1.10 was calibrated 2026-08-19 against three
 * customer-validated fares: Monte Tabor 21.48→23.63 km ($9), Policentro
 * 2.87→3.16 km ($3), San Fernando 5.39→5.93 km ($4). Tune via env if the
 * tariff table or the city changes; the fallback engines are not padded
 * because Valhalla already routes the way Google's app does.
 */
const GOOGLE_KM_FACTOR = Number(process.env.GOOGLE_KM_FACTOR ?? 1.1)

async function googleDrivingKm(a: Coords, b: Coords, key: string): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
        destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
        travelMode: 'DRIVE',
      }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { routes?: Array<{ distanceMeters?: number }> }
    const meters = data.routes?.[0]?.distanceMeters
    return typeof meters === 'number' && meters > 0 ? (meters / 1000) * GOOGLE_KM_FACTOR : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function osrmDrivingKm(a: Coords, b: Coords): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false&alternatives=false`
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TequeBot/1.0' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as { code?: string; routes?: Array<{ distance?: number }> }
    const meters = data.code === 'Ok' ? data.routes?.[0]?.distance : undefined
    return typeof meters === 'number' && meters > 0 ? meters / 1000 : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The text address a Maps link carries when it carries no coordinates.
 *
 * Links shared from the Maps app ("Compartir" on a place) redirect to
 * `maps.google.com/?q=<place name, street, city>&ftid=...` — a *name*, not a
 * pin. Every coordinate pattern above misses it, and the 800 KB HTML behind it
 * holds no `!3d!4d` either, so these links resolved to "no coords" and the
 * order shipped for $0. They are the single most common way a customer shares
 * an address, so the text is worth geocoding.
 */
export function extractPlaceQuery(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  for (const key of ['q', 'query', 'destination', 'daddr']) {
    const raw = parsed.searchParams.get(key)
    if (!raw) continue
    const value = raw.replace(/^loc:/i, '').trim()
    // A coordinate pair is the caller's job, not the geocoder's.
    if (!value || BARE_COORDS_RE.test(value)) continue
    // Needs at least one letter to be an address rather than a stray id.
    if (!/[a-zA-ZÀ-ÿ]/.test(value)) continue
    return value
  }

  return null
}

/**
 * Coordinates for a written address, via Google Geocoding.
 *
 * Biased to the store's region so a bare "Alhambra" resolves to the mall in
 * Samborondón rather than the palace in Granada, and the result is still put
 * through the Ecuador bounding box before it can price anything.
 */
async function geocodeAddress(query: string): Promise<Coords | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(query)}` +
      '&region=ec&language=es' +
      `&bounds=${EC_BBOX.minLat},${EC_BBOX.minLng}|${EC_BBOX.maxLat},${EC_BBOX.maxLng}` +
      `&key=${key}`
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    const data = (await response.json()) as {
      status?: string
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>
    }
    if (data.status !== 'OK') return null
    const loc = data.results?.[0]?.geometry?.location
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null
    return isPlausible(loc.lat, loc.lng) ? { lat: loc.lat, lng: loc.lng } : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Tariff for a distance, or null when it is beyond the delivery radius. */
export function getDeliveryCost(km: number): number | null {
  if (!Number.isFinite(km) || km < 0) return null
  for (const [maxKm, price] of TARIFFS) {
    if (km <= maxKm) return price
  }
  return null
}

/**
 * Follow the link (short links redirect to a URL carrying the coordinates) and
 * fall back to scanning the HTML body — some `place//data=...` links resolve
 * without any coordinate in the URL itself.
 */
async function followAndRead(url: string, userAgent: string): Promise<{ finalUrl: string; body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'es-EC,es;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    let body = ''
    try {
      body = (await response.text()).slice(0, 200_000)
    } catch {
      // Body is optional — the final URL alone is often enough.
    }
    return { finalUrl: response.url || url, body }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve a pasted Maps link into a delivery quote.
 * Never throws: an unresolvable link yields null coords, which the caller
 * renders as "envío por coordinar" rather than a wrong charge.
 */
export async function quoteFromMapsUrl(raw: string): Promise<MapsQuote> {
  const empty: MapsQuote = { resolvedUrl: raw, coords: null, km: null, deliveryCost: null, kmSource: null }

  // A pasted "lat,lng" needs no network round trip.
  const direct = extractCoords(raw ?? '')
  const normalized = normalizeMapsUrl(raw ?? '')
  if (!normalized) return direct ? await finalize(raw, direct) : empty

  // A pasted long directions URL carries both waypoints — take the destination.
  const fromUrl = DIRECTIONS_RE.test(normalized)
    ? extractDestinationCoords(normalized, normalized)
    : extractCoords(normalized)
  if (fromUrl) return await finalize(normalized, fromUrl)

  let lastUrl = normalized
  // Held from the first redirect that carried a written address, so a link with
  // no coordinates anywhere still has something to geocode at the end.
  let placeQuery: string | null = extractPlaceQuery(normalized)

  for (const userAgent of USER_AGENTS) {
    try {
      const { finalUrl, body } = await followAndRead(normalized, userAgent)
      lastUrl = finalUrl
      // A directions link must be read destination-first, or we would quote the
      // distance from the store to the store and charge the cheapest tier.
      const coords = DIRECTIONS_RE.test(finalUrl)
        ? extractDestinationCoords(finalUrl, body)
        : extractCoords(finalUrl) ?? extractCoords(body)
      if (coords) return await finalize(finalUrl, coords)
      placeQuery ??= extractPlaceQuery(finalUrl)
    } catch {
      // Timeout or network error — fall through to the next user agent.
    }
  }

  if (direct) return await finalize(lastUrl, direct)

  // Last resort: the link named a place instead of pinning one. Geocoding the
  // name is what stops these orders from shipping free — they used to fall
  // through to "unresolved", which prices delivery at $0.
  if (placeQuery) {
    const geocoded = await geocodeAddress(placeQuery)
    if (geocoded) return await finalize(lastUrl, geocoded)
  }

  return { ...empty, resolvedUrl: lastUrl }
}

async function finalize(resolvedUrl: string, coords: Coords | null): Promise<MapsQuote> {
  if (!coords) return { resolvedUrl, coords: null, km: null, deliveryCost: null, kmSource: null }
  const straight = haversineKm(ORIGIN, coords)
  // Skip the routing round trip for a pin on the store itself, and refuse a
  // routing answer wildly off the straight line (a snapped-to-wrong-road
  // artifact), falling back to haversine as before.
  let km = straight
  let kmSource: MapsQuote['kmSource'] = 'straight'
  if (straight > SAME_PLACE_KM) {
    const road = await drivingKm(ORIGIN, coords)
    if (road !== null && road >= straight * 0.9 && road <= straight * 3 + 2) {
      km = road
      kmSource = 'driving'
    }
  }
  const deliveryCost = getDeliveryCost(km)
  // Out of radius: report the distance but leave the price to be coordinated.
  return { resolvedUrl, coords, km: Math.round(km * 100) / 100, deliveryCost, kmSource }
}
