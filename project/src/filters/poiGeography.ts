import type { Map as MapboxMap } from 'mapbox-gl'
import { setFilterContributions, type LayerContribution } from './filterStore'
import { getVisiblePoiGeography, hasSavedPoi } from '../poi'
import {
    RENT_COUNTY_FILL_LAYER_ID,
    RENT_COUNTY_LINE_LAYER_ID,
    RENT_STATE_FILL_LAYER_ID,
    RENT_STATE_LINE_LAYER_ID,
} from './rent'

const SOURCE_ID = 'poiGeography'

/** State name field on rent state tiles (matches POI geocode labels). */
const STATE_NAME_FIELD = 'rent_state_csv_NAME'

/** County polygon fields tried in order for geography matching. */
const COUNTY_NAME_FIELDS = ['NAMELSAD', 'NAME', 'county_name', 'COUNTY_NAME'] as const
const COUNTY_STATE_FIELD = 'STATE_NAME'

function buildStateExpr(states: string[]): unknown | null {
    if (states.length === 0) return ['==', ['literal', 1], 0]
    return ['in', ['get', STATE_NAME_FIELD], ['literal', states]]
}

function buildCountyExpr(pairs: ReadonlyArray<{ state: string; county: string }>): unknown | null {
    if (pairs.length === 0) return ['==', ['literal', 1], 0]

    const clauses: unknown[] = pairs.map(({ state, county }) => {
        const countyMatch = COUNTY_NAME_FIELDS.map(
            (field) => ['==', ['get', field], county] as unknown,
        )
        return [
            'all',
            ['==', ['get', COUNTY_STATE_FIELD], state],
            ['any', ...countyMatch],
        ]
    })

    return ['any', ...clauses]
}

function applyGeographyFilter(): void {
    if (!hasSavedPoi()) {
        setFilterContributions(SOURCE_ID, [])
        return
    }

    const geo = getVisiblePoiGeography()

    // No visible batches — drop geography filter so all states/counties show again.
    if (geo.states.length === 0) {
        setFilterContributions(SOURCE_ID, [])
        return
    }

    const stateExpr = buildStateExpr(geo.states)
    const countyExpr = buildCountyExpr(geo.pairs)

    const contributions: LayerContribution[] = [
        { layerId: RENT_STATE_FILL_LAYER_ID, expr: stateExpr },
        { layerId: RENT_STATE_LINE_LAYER_ID, expr: stateExpr },
        { layerId: RENT_COUNTY_FILL_LAYER_ID, expr: countyExpr },
        { layerId: RENT_COUNTY_LINE_LAYER_ID, expr: countyExpr },
    ]

    setFilterContributions(SOURCE_ID, contributions)
}

/** Register POI geography filtering (via filter store). Re-apply after style reload. */
export function initPoiGeographyFilter(mainMap: MapboxMap): void {
    const refresh = (): void => applyGeographyFilter()

    window.addEventListener('poi-counts-changed', refresh)
    window.addEventListener('poi-visibility-changed', refresh)
    mainMap.on('style.load', refresh)
    refresh()
}
