/**
 * Application entry point.
 *
 * Reads top-to-bottom as a "table of contents" of every subsystem.
 * Each step delegates to its own folder:
 *
 *   - `./geo`       Geographic data (bounds, state capital anchors)
 *   - `./map`       Mapbox map creation + inset chrome + resize wiring
 *   - `./poi`       POI search subsystem (input, suggestions, markers, counts)
 *   - `./filters`   Layer-filter store + per-feature filter modules (rent, ...)
 *   - `./ui`        Sidebar / drawer widgets and their wiring
 */

import './style.css'

import { createMaps, wireInsets, wireMapResize, wireStateHoverMaps } from './map/'
import { initPoiSearch } from './poi'
import { registerFilterMaps } from './filters'
import { initSidebar } from './ui'

const trio = createMaps()
const { mainMap, hawaiiMap, alaskaMap, mapboxAccessToken } = trio

initPoiSearch(mainMap, hawaiiMap, alaskaMap, mapboxAccessToken)
wireStateHoverMaps(trio)
wireInsets(trio)
wireMapResize(trio)
registerFilterMaps(mainMap, hawaiiMap, alaskaMap)
initSidebar()
