/**
 * Public API for the map filter system.
 *
 * Add a new filter:
 *   1. Create `./<name>.ts` exporting setter/clearer functions that call
 *      `setFilterContributions(sourceId, [...])` from `./filterStore`.
 *   2. Re-export its public surface from this barrel.
 *   3. Wire the UI to those functions.
 */

export { registerFilterMaps } from './filterStore'
export { initPoiGeographyFilter } from './poiGeography'
export { applyRentRange, clearRentRange, type RentRange } from './rent'
