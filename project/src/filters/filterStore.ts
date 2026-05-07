import type { Map as MapboxMap } from 'mapbox-gl'

/**
 * Generic Mapbox layer-filter coordination.
 *
 * Each independent feature (rent range, mortgage range, POI containment, ...)
 * lives in its own module and registers a "source" of layer contributions.
 * The store merges every active contribution per layer with that layer's
 * original Studio filter via:
 *
 *     setFilter(layerId, ['all', baseFilter, contribA, contribB, ...])
 *
 * `null` contributions are skipped, so a filter can be effectively disabled
 * just by emitting `{ expr: null }` for its layers.
 *
 * Goals:
 *   - Filter modules never know about each other.
 *   - Studio-authored filters (zoom, sub-source, etc.) are always preserved.
 *   - Map style reloads are handled once, here.
 *   - Adding a new filter = one new file + register its source.
 */

/** A single filter's effect on a single layer. */
export type LayerContribution = {
    layerId: string
    /** Mapbox filter expression to AND with the base, or null when this contribution is inactive. */
    expr: unknown | null
}

const baseFilterByMapLayer = new WeakMap<MapboxMap, Map<string, unknown>>()
const warnedMissingByMap = new WeakMap<MapboxMap, Set<string>>()
let registeredMaps: MapboxMap[] = []
const contributionsBySource = new Map<string, LayerContribution[]>()

/**
 * Log a one-time warning when a contribution targets a layer that doesn't
 * exist in the loaded style. Includes nearby fill / line layer ids so the
 * mismatch is easy to fix in the filter module.
 */
function warnMissingLayerOnce(map: MapboxMap, layerId: string): void {
    let warned = warnedMissingByMap.get(map)
    if (!warned) {
        warned = new Set()
        warnedMissingByMap.set(map, warned)
    }
    if (warned.has(layerId)) return
    warned.add(layerId)

    const styleLayers = map.getStyle()?.layers ?? []
    const fillIds = styleLayers
        .filter((l) => 'type' in l && l.type === 'fill')
        .map((l) => l.id)
    const lineIds = styleLayers
        .filter((l) => 'type' in l && l.type === 'line')
        .map((l) => l.id)
    console.warn(
        `[filters] layer "${layerId}" not found in style. Filter is being silently skipped on this layer.\n  Fill layers in style: ${JSON.stringify(fillIds)}\n  Line layers in style: ${JSON.stringify(lineIds)}`,
    )
}

function captureBaseFilter(map: MapboxMap, layerId: string): unknown {
    let cache = baseFilterByMapLayer.get(map)
    if (!cache) {
        cache = new Map()
        baseFilterByMapLayer.set(map, cache)
    }
    if (!cache.has(layerId)) {
        cache.set(layerId, map.getFilter(layerId) ?? null)
    }
    return cache.get(layerId) ?? null
}

function combineAll(filters: unknown[]): unknown | null {
    const real = filters.filter((f) => f !== null && f !== undefined)
    if (real.length === 0) return null
    if (real.length === 1) return real[0]
    return ['all', ...real]
}

/** Collect all currently-active contributions for a single layer. */
function activeExprsForLayer(layerId: string): unknown[] {
    const exprs: unknown[] = []
    for (const contribs of contributionsBySource.values()) {
        for (const c of contribs) {
            if (c.layerId === layerId && c.expr !== null) exprs.push(c.expr)
        }
    }
    return exprs
}

/** Set of every layerId touched by any registered source. */
function allTouchedLayerIds(): Set<string> {
    const ids = new Set<string>()
    for (const contribs of contributionsBySource.values()) {
        for (const c of contribs) ids.add(c.layerId)
    }
    return ids
}

function applyToMap(map: MapboxMap): void {
    if (!map.isStyleLoaded()) {
        map.once('style.load', () => applyToMap(map))
        return
    }
    for (const layerId of allTouchedLayerIds()) {
        if (!map.getLayer(layerId)) {
            warnMissingLayerOnce(map, layerId)
            continue
        }
        const base = captureBaseFilter(map, layerId)
        const exprs = activeExprsForLayer(layerId)
        const combined = combineAll([base, ...exprs])
        map.setFilter(layerId, combined as never)
    }
}

function applyAll(): void {
    for (const map of registeredMaps) applyToMap(map)
}

/**
 * Register the maps that should respond to filter contributions. Re-applies
 * the active state on every style reload (which invalidates cached base
 * filters).
 */
export function registerFilterMaps(...maps: MapboxMap[]): void {
    registeredMaps = maps
    for (const map of registeredMaps) {
        map.on('style.load', () => {
            baseFilterByMapLayer.delete(map)
            warnedMissingByMap.delete(map)
            applyToMap(map)
        })
    }
    applyAll()
}

/**
 * Replace the contributions registered under `sourceId` and re-apply.
 * Pass an empty array (or all-null exprs) to disable that source.
 */
export function setFilterContributions(
    sourceId: string,
    contributions: LayerContribution[],
): void {
    contributionsBySource.set(sourceId, contributions)
    applyAll()
}

/** Drop a source entirely. */
export function clearFilterContributions(sourceId: string): void {
    contributionsBySource.delete(sourceId)
    applyAll()
}
