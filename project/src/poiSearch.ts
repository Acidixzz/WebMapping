import mapboxgl from 'mapbox-gl'
import {
  ALASKA_BOUNDS,
  ALASKA_SEARCH_BBOX,
  HAWAII_BOUNDS,
  HAWAII_SEARCH_BBOX,
  lngLatInBounds,
  US_MAINLAND_BOUNDS,
  US_MAINLAND_SEARCH_BBOX,
} from './mapBounds'
import { US_STATE_SEARCH_ANCHORS } from './stateSearchAnchors'

const SEARCH_BOX_FORWARD = 'https://api.mapbox.com/search/searchbox/v1/forward'

/** Space out Search Box calls to reduce 429 rate-limit risk (~50 per Add). */
const REQUEST_GAP_MS = 90

type SearchBoxProperties = {
  name?: string
  full_address?: string
  mapbox_id?: string
  feature_type?: string
  place_formatted?: string
}

type SavedPoi = {
  id: string
  name: string
  marker: mapboxgl.Marker
  map: mapboxgl.Map
}

type QueryBatch = {
  queryLabel: string
  ids: string[]
  /** Hue in degrees; used to avoid picking a similar color to other active batches. */
  hue: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function circularHueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

function minHueSeparation(candidate: number, usedHues: number[]): number {
  return Math.min(...usedHues.map((h) => circularHueDistance(candidate, h)))
}

/** Midpoint of the widest empty arc between hues already on the wheel. */
function hueAtLargestGap(usedHues: number[]): number {
  const sorted = [...usedHues].sort((a, b) => a - b)
  let maxGap = 0
  let mid = sorted[0]
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    const end = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + 360
    const gap = end - start
    if (gap > maxGap) {
      maxGap = gap
      mid = (start + gap / 2) % 360
    }
  }
  return mid
}

/**
 * Picks a hue as far as possible from every hue already used by visible batches
 * (many random candidates + largest-gap fallback when the wheel is crowded).
 */
function pickDistinctHue(usedHues: number[]): number {
  if (usedHues.length === 0) return Math.random() * 360

  let bestRandom = 0
  let bestScore = -1
  for (let t = 0; t < 160; t++) {
    const candidate = Math.random() * 360
    const score = minHueSeparation(candidate, usedHues)
    if (score > bestScore) {
      bestScore = score
      bestRandom = candidate
    }
  }

  const gapHue = hueAtLargestGap(usedHues)
  const candidates = [bestRandom, gapHue]
  return candidates.reduce((a, b) =>
    minHueSeparation(a, usedHues) >= minHueSeparation(b, usedHues) ? a : b,
  )
}

/** One hue family per search batch so pills and map dots stay visually matched. */
function poiBatchStylesForHue(h: number): {
  markerFill: string
  pillBg: string
  pillFg: string
  pillBorder: string
} {
  const s = 52 + Math.random() * 28
  const markerL = 40 + Math.random() * 22
  return {
    markerFill: `hsl(${h} ${s}% ${markerL}%)`,
    pillBg: `hsl(${h} ${Math.min(s + 10, 82)}% 92%)`,
    pillFg: `hsl(${h} ${Math.min(s + 6, 78)}% 30%)`,
    pillBorder: `hsl(${h} ${s * 0.75}% 78%)`,
  }
}

function displayName(query: string, props: SearchBoxProperties | undefined): string {
  if (!props) return query
  if (props.full_address) return props.full_address
  const tail = props.place_formatted ? `, ${props.place_formatted}` : ''
  return `${props.name ?? query}${tail}`
}

function isPoiFeature(props: SearchBoxProperties | undefined): boolean {
  return props?.feature_type === 'poi'
}

function searchBboxForState(state: string): string {
  if (state === 'Hawaii') return HAWAII_SEARCH_BBOX
  if (state === 'Alaska') return ALASKA_SEARCH_BBOX
  return US_MAINLAND_SEARCH_BBOX
}

function targetMapForLngLat(
  lng: number,
  lat: number,
  mainMap: mapboxgl.Map,
  hawaiiMap: mapboxgl.Map,
  alaskaMap: mapboxgl.Map,
): mapboxgl.Map | null {
  if (lngLatInBounds(lng, lat, HAWAII_BOUNDS)) return hawaiiMap
  if (lngLatInBounds(lng, lat, ALASKA_BOUNDS)) return alaskaMap
  if (lngLatInBounds(lng, lat, US_MAINLAND_BOUNDS)) return mainMap
  return null
}

function featureDedupeKey(
  feature: GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>,
): string {
  const props = feature.properties
  if (props?.mapbox_id && props.mapbox_id.length > 0) return props.mapbox_id
  const [lng, lat] = feature.geometry.coordinates
  return `${lng.toFixed(5)},${lat.toFixed(5)}`
}

async function fetchForwardRaw(
  query: string,
  accessToken: string,
  proximityLng: number,
  proximityLat: number,
  bbox: string,
  includeTypesPoi: boolean,
): Promise<GeoJSON.Feature[]> {
  const proximity = `${proximityLng},${proximityLat}`
  const params = new URLSearchParams({
    access_token: accessToken,
    q: query,
    limit: '10',
    country: 'US',
    bbox,
    proximity,
    language: 'en',
  })
  if (includeTypesPoi) params.set('types', 'poi')

  const url = `${SEARCH_BOX_FORWARD}?${params}`
  const res = await fetch(url)
  const text = await res.text()

  if (!res.ok) {
    let detail = text.slice(0, 240)
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (typeof parsed.message === 'string' && parsed.message.length > 0) {
        detail = parsed.message
      }
    } catch {
      /* keep raw snippet */
    }
    throw new Error(`Search Box ${res.status}: ${detail}`)
  }

  let data: GeoJSON.FeatureCollection
  try {
    data = JSON.parse(text) as GeoJSON.FeatureCollection
  } catch {
    throw new Error('Search Box returned invalid JSON.')
  }

  return data.features ?? []
}

async function searchBoxForwardAtProximity(
  query: string,
  accessToken: string,
  proximityLng: number,
  proximityLat: number,
  bbox: string,
): Promise<GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>[]> {
  let raw = await fetchForwardRaw(
    query,
    accessToken,
    proximityLng,
    proximityLat,
    bbox,
    true,
  )
  let features = raw.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties> =>
      f.geometry?.type === 'Point' && isPoiFeature(f.properties as SearchBoxProperties),
  )

  if (features.length === 0) {
    raw = await fetchForwardRaw(
      query,
      accessToken,
      proximityLng,
      proximityLat,
      bbox,
      false,
    )
    features = raw.filter(
      (f): f is GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties> =>
        f.geometry?.type === 'Point' && isPoiFeature(f.properties as SearchBoxProperties),
    )
  }

  return features
}

type NationwideSearchResult = {
  features: GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>[]
  failedRequests: number
  firstError: string | undefined
}

async function searchAllStateAnchors(
  query: string,
  accessToken: string,
  onProgress: (completed: number, total: number) => void,
): Promise<NationwideSearchResult> {
  const merged = new Map<
    string,
    GeoJSON.Feature<GeoJSON.Point, SearchBoxProperties>
  >()
  const total = US_STATE_SEARCH_ANCHORS.length
  let failedRequests = 0
  let firstError: string | undefined

  for (let i = 0; i < total; i++) {
    const anchor = US_STATE_SEARCH_ANCHORS[i]
    onProgress(i + 1, total)

    const bbox = searchBboxForState(anchor.state)

    try {
      const batch = await searchBoxForwardAtProximity(
        query,
        accessToken,
        anchor.lng,
        anchor.lat,
        bbox,
      )

      for (const f of batch) {
        const key = featureDedupeKey(f)
        if (!merged.has(key)) merged.set(key, f)
      }
    } catch (e) {
      failedRequests += 1
      const msg = e instanceof Error ? e.message : String(e)
      if (!firstError) firstError = msg
      console.warn(`[POI search] ${anchor.state}:`, msg)
    }

    if (i < total - 1) {
      await new Promise((r) => window.setTimeout(r, REQUEST_GAP_MS))
    }
  }

  return {
    features: [...merged.values()],
    failedRequests,
    firstError,
  }
}

export function initPoiSearch(
  mainMap: mapboxgl.Map,
  hawaiiMap: mapboxgl.Map,
  alaskaMap: mapboxgl.Map,
  accessToken: string,
): void {
  const input = document.querySelector<HTMLInputElement>('#poi-search-input')
  const addBtn = document.querySelector<HTMLButtonElement>('#poi-add-button')
  const status = document.querySelector<HTMLElement>('#poi-search-status')
  const list = document.querySelector<HTMLUListElement>('#poi-saved-list')

  if (!input || !addBtn || !status || !list) return

  const saved = new Map<string, SavedPoi>()
  const queryBatches = new Map<string, QueryBatch>()

  function clearQueryBatch(runId: string, pillLi: HTMLLIElement): void {
    const batch = queryBatches.get(runId)
    if (!batch) return

    let touchedMain = false
    let touchedHawaii = false
    let touchedAlaska = false

    for (const id of batch.ids) {
      const poi = saved.get(id)
      if (!poi) continue
      poi.marker.remove()
      saved.delete(id)
      if (poi.map === mainMap) touchedMain = true
      else if (poi.map === hawaiiMap) touchedHawaii = true
      else if (poi.map === alaskaMap) touchedAlaska = true
    }

    queryBatches.delete(runId)
    pillLi.remove()

    if (touchedMain) mainMap.resize()
    if (touchedHawaii) hawaiiMap.resize()
    if (touchedAlaska) alaskaMap.resize()

    if (saved.size === 0) status.textContent = ''
  }

  async function searchAndAdd(): Promise<void> {
    const q = input.value.trim()
    if (!q) {
      status.textContent = 'Enter a place to search.'
      return
    }

    addBtn.disabled = true
    status.textContent = `Searching ${US_STATE_SEARCH_ANCHORS.length} state anchors… 0/${US_STATE_SEARCH_ANCHORS.length}`

    try {
      const { features, failedRequests, firstError } = await searchAllStateAnchors(
        q,
        accessToken,
        (done, total) => {
          status.textContent = `Searching state anchors… ${done}/${total}`
        },
      )

      if (features.length === 0) {
        status.textContent =
          failedRequests > 0 && firstError
            ? `Search failed: ${firstError}`
            : 'No points of interest found. Try a different search.'
        return
      }

      let added = 0
      let skippedDup = 0
      let skippedOutOfRegion = 0
      let touchedMain = false
      let touchedHawaii = false
      let touchedAlaska = false
      const runId = crypto.randomUUID()
      const batchIds: string[] = []
      const usedHues = Array.from(queryBatches.values(), (b) => b.hue)
      const batchHue = pickDistinctHue(usedHues)
      const batchStyles = poiBatchStylesForHue(batchHue)

      for (const feature of features) {
        const coords = feature.geometry.coordinates
        const [lng, lat] = coords
        const props = feature.properties
        const name = displayName(q, props)
        const stableId =
          props?.mapbox_id && props.mapbox_id.length > 0
            ? props.mapbox_id
            : `${lng.toFixed(5)},${lat.toFixed(5)}`

        if (saved.has(stableId)) {
          skippedDup += 1
          continue
        }

        const targetMap = targetMapForLngLat(lng, lat, mainMap, hawaiiMap, alaskaMap)
        if (!targetMap) {
          skippedOutOfRegion += 1
          continue
        }

        const el = document.createElement('div')
        el.className = 'poi-marker'
        el.style.backgroundColor = batchStyles.markerFill

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(name))
          .addTo(targetMap)

        // make it so that the markers don't pop up if the zoom level is so far away and if the zoom is closer, we want to query for each county.
        //once the search is complete, we want to highlight each state on the map that has all of the POIs inside.

        saved.set(stableId, { id: stableId, name, marker, map: targetMap })
        batchIds.push(stableId)

        if (targetMap === mainMap) touchedMain = true
        else if (targetMap === hawaiiMap) touchedHawaii = true
        else if (targetMap === alaskaMap) touchedAlaska = true

        added += 1
      }

      if (touchedMain) mainMap.resize()
      if (touchedHawaii) hawaiiMap.resize()
      if (touchedAlaska) alaskaMap.resize()

      if (added === 0) {
        status.textContent =
          skippedDup > 0
            ? 'Those locations are already on the map.'
            : 'No new places to add.'
        return
      }

      const dupHint = skippedDup > 0 ? ` (${skippedDup} already on the map.)` : ''
      const skipHint =
        skippedOutOfRegion > 0 ? ` (${skippedOutOfRegion} outside US map regions.)` : ''
      const failHint =
        failedRequests > 0
          ? ` (${failedRequests} state request${failedRequests === 1 ? '' : 's'} failed — results may be incomplete.)`
          : ''

      status.textContent =
        `Added ${added} place${added === 1 ? '' : 's'} (${features.length} unique matches).${dupHint}${skipHint}${failHint}`

      if (batchIds.length > 0) {
        queryBatches.set(runId, { queryLabel: q, ids: batchIds, hue: batchHue })

        const li = document.createElement('li')
        li.className = 'flex w-fit max-w-full items-center gap-0.5'

        const pillStyle = [
          `background-color:${batchStyles.pillBg}`,
          `color:${batchStyles.pillFg}`,
          `border-color:${batchStyles.pillBorder}`,
        ].join(';')

        li.innerHTML = `
          <span class="badge inline-flex min-w-0 items-center gap-1 border border-solid py-2 pl-3 pr-1" style="${pillStyle}">
            <span class="flex min-h-6 min-w-[4rem] max-w-[10rem] flex-1 items-center justify-center">
              <span class="w-full truncate text-center leading-none">${escapeHtml(q)}</span>
            </span>
            <button type="button" class="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-lg leading-none text-current hover:bg-transparent" aria-label="Remove markers for this search" title="Clear these points">×</button>
          </span>
        `

        const clearBtn = li.querySelector('button')
        clearBtn?.addEventListener('click', (e) => {
          e.stopPropagation()
          clearQueryBatch(runId, li)
        })

        list.appendChild(li)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      status.textContent =
        msg.length > 0 ? `Search failed: ${msg}` : 'Search failed. Check your connection and try again.'
      console.error(e)
    } finally {
      addBtn.disabled = false
    }
  }

  addBtn.addEventListener('click', () => void searchAndAdd())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void searchAndAdd()
  })
}
