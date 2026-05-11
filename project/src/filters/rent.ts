import { setFilterContributions, type LayerContribution } from './filterStore'

/**
 * Rent-range filter for the state and county polygon layers.
 *
 * Hides polygons whose rent value falls outside [min, max] by emitting a
 * filter expression to the central filter store. Paint properties (zoom-based
 * opacity, color ramps, etc.) are preserved because we use `setFilter`, not
 * `setPaintProperty`.
 */

/** Source id this module owns in the filter store. */
const SOURCE_ID = 'rentRange'

/** Layer ids in the Mapbox Studio style (exported where map UI needs them). */
export const RENT_STATE_FILL_LAYER_ID = 'rent-state-fill'
export const RENT_COUNTY_FILL_LAYER_ID = 'rent-county-fill'
export const RENT_STATE_LINE_LAYER_ID = 'rent-state-14x3h1'
export const RENT_COUNTY_LINE_LAYER_ID = 'rent-county-4255ie'

/** Property names holding the rent value on each tile. */
export const RENT_STATE_MEDIAN_RENT_PROPERTY = 'rent_state_csv_B25111_001E'
const STATE_RENT_FIELD = RENT_STATE_MEDIAN_RENT_PROPERTY
export const RENT_COUNTY_MEDIAN_RENT_PROPERTY = 'median_rent'
const COUNTY_RENT_FIELD = RENT_COUNTY_MEDIAN_RENT_PROPERTY

export type RentRange = {
    min: number | null
    max: number | null
}

/**
 * Build the price filter for a layer. Returns null when this contribution
 * should be inactive (range fully unbounded). Features with a missing/
 * non-numeric rent value are kept visible so misconfigured tiles don't hide
 * everything.
 */
function buildPriceExpr(range: RentRange, field: string): unknown | null {
    if (range.min === null && range.max === null) return null

    const inRange: unknown[] = ['all', ['has', field]]
    if (range.min !== null) {
        inRange.push(['>=', ['to-number', ['get', field], 0], range.min])
    }
    if (range.max !== null) {
        inRange.push(['<=', ['to-number', ['get', field], 0], range.max])
    }

    return ['any', ['!', ['has', field]], inRange]
}

/**
 * Set the active rent filter. Pass `null` for either bound to leave that
 * side unbounded.
 */
export function applyRentRange(range: RentRange): void {
    const stateExpr = buildPriceExpr(range, STATE_RENT_FIELD)
    const countyExpr = buildPriceExpr(range, COUNTY_RENT_FIELD)

    const contributions: LayerContribution[] = [
        { layerId: RENT_STATE_FILL_LAYER_ID, expr: stateExpr },
        { layerId: RENT_STATE_LINE_LAYER_ID, expr: stateExpr },
        { layerId: RENT_COUNTY_FILL_LAYER_ID, expr: countyExpr },
        { layerId: RENT_COUNTY_LINE_LAYER_ID, expr: countyExpr },
    ]

    setFilterContributions(SOURCE_ID, contributions)
}

/** Convenience: clear any active rent filter. */
export function clearRentRange(): void {
    applyRentRange({ min: null, max: null })
}
