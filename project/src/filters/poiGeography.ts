import type { Map as MapboxMap } from 'mapbox-gl'
import { setFilterContributions, type LayerContribution } from './filterStore'
import { getVisiblePoiGeography, hasSavedPoi } from '../poi'
import {
    COUNTY_NAME_FIELDS,
    COUNTY_STATE_FIELD,
    RENT_STATE_NAME_FIELD,
    countyLabelVariants,
    isUnknownCountyLabel,
    stateLabelVariants,
} from '../geo/countyMatch'
import {
    RENT_COUNTY_FILL_LAYER_ID,
    RENT_COUNTY_LINE_LAYER_ID,
    RENT_STATE_FILL_LAYER_ID,
    RENT_STATE_LINE_LAYER_ID,
} from './rent'

const SOURCE_ID = 'poiGeography'

function buildStateExpr(states: string[]): unknown | null {
    if (states.length === 0) return ['==', ['literal', 1], 0]

    const labels = new Set<string>()
    for (const state of states) {
        for (const v of stateLabelVariants(state)) labels.add(v)
    }

    return ['in', ['get', RENT_STATE_NAME_FIELD], ['literal', [...labels]]]
}

function countyFieldEqualsAnyVariant(field: string, variants: string[]): unknown[] {
    return variants.map((label) => ['==', ['get', field], label] as unknown)
}

function buildPairClause(state: string, county: string): unknown {
    const stateVariants = stateLabelVariants(state)
    const stateMatch =
        stateVariants.length === 1
            ? (['==', ['get', COUNTY_STATE_FIELD], stateVariants[0]] as unknown)
            : (['in', ['get', COUNTY_STATE_FIELD], ['literal', stateVariants]] as unknown)

    if (isUnknownCountyLabel(county)) {
        return stateMatch
    }

    const countyVariants = countyLabelVariants(county)
    const countyMatchPerField = COUNTY_NAME_FIELDS.map((field) => [
        'any',
        ...countyFieldEqualsAnyVariant(field, countyVariants),
    ])

    return ['all', stateMatch, ['any', ...countyMatchPerField]]
}

function buildCountyExpr(pairs: ReadonlyArray<{ state: string; county: string }>): unknown | null {
    if (pairs.length === 0) return ['==', ['literal', 1], 0]

    const clauses = pairs.map(({ state, county }) => buildPairClause(state, county))
    return ['any', ...clauses]
}

function applyGeographyFilter(): void {
    if (!hasSavedPoi()) {
        setFilterContributions(SOURCE_ID, [])
        return
    }

    const geo = getVisiblePoiGeography()

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
