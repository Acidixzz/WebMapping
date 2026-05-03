import type { LngLatBoundsLike } from 'mapbox-gl'

/** Main map `maxBounds` — contiguous US view box. */
export const US_MAINLAND_BOUNDS: LngLatBoundsLike = [
  [-132.0, 20.0],
  [-60.0, 54.5],
]

/** Hawaii inset map bounds (matches `map.ts` inset). */
export const HAWAII_BOUNDS: LngLatBoundsLike = [
  [-162.4, 18.2],
  [-153.6, 23.1],
]

/** Alaska inset map bounds (matches `map.ts` inset). */
export const ALASKA_BOUNDS: LngLatBoundsLike = [
  [-195.0, 50.2],
  [-108.0, 72.8],
]

function boundsToSearchBbox(bounds: LngLatBoundsLike): string {
  const sw = bounds[0] as [number, number]
  const ne = bounds[1] as [number, number]
  return `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`
}

/**
 * Search Box API `bbox`: min longitude, min latitude, max longitude, max latitude.
 * Longitudes must stay within [-180, 180] — invalid boxes cause requests to fail.
 * @see https://docs.mapbox.com/api/search/search-box/#search-request
 */
export const US_MAINLAND_SEARCH_BBOX = boundsToSearchBbox(US_MAINLAND_BOUNDS)
export const HAWAII_SEARCH_BBOX = boundsToSearchBbox(HAWAII_BOUNDS)

/**
 * Map inset can use longitudes below -180; Search Box cannot. Use a valid mainland+southeast Alaska box.
 * (Far western Aleutians are outside this bbox.)
 */
export const ALASKA_SEARCH_BBOX = '-179.99,51.2,-129.98,71.7'

/** Axis-aligned bounds test (same rectangles as Mapbox `maxBounds`). */
export function lngLatInBounds(
  lng: number,
  lat: number,
  bounds: LngLatBoundsLike,
): boolean {
  const sw = bounds[0] as [number, number]
  const ne = bounds[1] as [number, number]
  return lng >= sw[0] && lng <= ne[0] && lat >= sw[1] && lat <= ne[1]
}
