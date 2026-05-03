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
const SEARCH_BOX_SUGGEST = 'https://api.mapbox.com/search/searchbox/v1/suggest'

/** Space out Search Box calls to reduce 429 rate-limit risk (~50 per Add). */
const REQUEST_GAP_MS = 90

/** Debounce Mapbox `/suggest` while typing (separate from forward anchor batching). */
const SUGGEST_DEBOUNCE_MS = 280

/** Bias suggest results toward the continental US (lng, lat). */
const US_SUGGEST_PROXIMITY = '-98,39'

type SearchBoxProperties = {
  name?: string
  address?: string
  full_address?: string
  mapbox_id?: string
  feature_type?: string
  place_formatted?: string
  brand?: string[]
  brand_id?: string[]
  poi_category_ids?: string[]
}

/** From `/suggest` — used to narrow nationwide `/forward` results to a chain or category. */
type SearchBoxSuggestion = {
  name: string
  name_preferred?: string
  mapbox_id: string
  feature_type: string
  place_formatted: string
  brand?: string[]
  brand_id?: string[]
  poi_category_ids?: string[]
}

/**
 * When the user picks an autocomplete row, forward hits are filtered to features
 * that share the same brand IDs, brand names, or POI category IDs when present.
 */
type PoiSelectionFilter = {
  /** Human-readable label (e.g. brand or category name). */
  label: string
  brandNames: string[]
  brandIds: string[]
  poiCategoryIds: string[]
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

function poiPopupPlaceTitle(query: string, props: SearchBoxProperties | undefined): string {
  const n = props?.name?.trim()
  return n && n.length > 0 ? n : query.trim()
}

/**
 * Street/locality line for the popup. Strips a leading POI name from `full_address` when Mapbox
 * returns "Name, street, city…" so the second line is not a duplicate of the title.
 */
function poiPopupAddressLine(
  props: SearchBoxProperties | undefined,
  placeTitle: string,
): string {
  if (!props) return ''

  const title = placeTitle.trim()
  const fa = props.full_address?.trim()
  if (fa) {
    const lowerFa = fa.toLowerCase()
    const lowerTitle = title.toLowerCase()
    const prefixed = `${title}, `
    if (lowerFa.startsWith(prefixed.toLowerCase())) {
      return fa.slice(prefixed.length).trim()
    }
    if (lowerTitle && lowerFa.startsWith(lowerTitle)) {
      return fa.slice(title.length).replace(/^[, ]\s*/, '').trim()
    }
    if (!lowerTitle || lowerFa === lowerTitle) {
      /* full_address is only the name — fall through */
    } else {
      return fa
    }
  }

  const parts: string[] = []
  if (props.address?.trim()) parts.push(props.address.trim())
  if (props.place_formatted?.trim()) parts.push(props.place_formatted.trim())
  return parts.join(', ')
}

function createPoiPopupElement(title: string, addressLine: string): HTMLElement {
  const root = document.createElement('div')
  root.style.maxWidth = '260px'

  const head = document.createElement('div')
  head.textContent = title
  head.style.fontWeight = '600'
  head.style.fontSize = '13px'
  head.style.lineHeight = '1.3'
  root.appendChild(head)

  if (addressLine.trim().length > 0) {
    const addr = document.createElement('div')
    addr.textContent = addressLine
    addr.style.marginTop = '6px'
    addr.style.fontSize = '12px'
    addr.style.lineHeight = '1.4'
    addr.style.opacity = '0.88'
    root.appendChild(addr)
  }

  return root
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

function normStr(s: string): string {
  return s.trim().toLowerCase()
}

function brandsMatch(forwardBrand: string, wanted: string): boolean {
  const a = normStr(forwardBrand)
  const b = normStr(wanted)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/**
 * Keeps forward results that align with the autocomplete row (brand / category / name).
 */
function forwardFeatureMatchesSelection(
  props: SearchBoxProperties | undefined,
  sel: PoiSelectionFilter,
): boolean {
  const ids = props?.brand_id ?? []
  const names = props?.brand ?? []
  const catIds = props?.poi_category_ids ?? []
  const poiName = normStr(props?.name ?? '')

  const checks: boolean[] = []

  if (sel.brandIds.length > 0)
    checks.push(sel.brandIds.some((id) => ids.includes(id)))

  if (sel.brandNames.length > 0) {
    checks.push(
      sel.brandNames.some((want) => names.some((b) => brandsMatch(b, want))) ||
      sel.brandNames.some((want) => poiName.includes(normStr(want))),
    )
  }

  if (sel.poiCategoryIds.length > 0)
    checks.push(sel.poiCategoryIds.some((id) => catIds.includes(id)))

  if (checks.length === 0) return true
  return checks.some(Boolean)
}

function poiFilterFromSuggestion(s: SearchBoxSuggestion): PoiSelectionFilter | null {
  const brands =
    s.brand?.filter((b): b is string => typeof b === 'string' && b.trim().length > 0) ?? []
  const ids =
    s.brand_id?.filter((b): b is string => typeof b === 'string' && b.length > 0) ?? []
  const cats =
    s.poi_category_ids?.filter((c): c is string => typeof c === 'string' && c.length > 0) ??
    []

  if (s.feature_type === 'category' && cats.length > 0) {
    return {
      label: s.name_preferred ?? s.name,
      brandNames: [],
      brandIds: [],
      poiCategoryIds: cats,
    }
  }

  if (s.feature_type === 'poi' && (ids.length > 0 || brands.length > 0)) {
    return {
      label: brands[0] ?? s.name_preferred ?? s.name,
      brandNames: brands.length > 0 ? brands : [s.name_preferred ?? s.name],
      brandIds: ids,
      poiCategoryIds: cats,
    }
  }

  if (s.feature_type === 'poi') {
    const anchor = normStr(s.name_preferred ?? s.name)
    if (anchor.length < 3) return null
    return {
      label: s.name_preferred ?? s.name,
      brandNames: [s.name_preferred ?? s.name],
      brandIds: [],
      poiCategoryIds: cats,
    }
  }

  return null
}

async function fetchSearchBoxSuggest(
  query: string,
  accessToken: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SearchBoxSuggestion[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const params = new URLSearchParams({
    access_token: accessToken,
    q: trimmed,
    session_token: sessionToken,
    language: 'en',
    limit: '8',
    country: 'US',
    proximity: US_SUGGEST_PROXIMITY,
    bbox: US_MAINLAND_SEARCH_BBOX,
    types: 'poi,category',
  })

  const url = `${SEARCH_BOX_SUGGEST}?${params}`
  const res = await fetch(url, { signal })
  const text = await res.text()

  if (!res.ok) {
    let detail = text.slice(0, 240)
    try {
      const parsed = JSON.parse(text) as { message?: string }
      if (typeof parsed.message === 'string' && parsed.message.length > 0)
        detail = parsed.message
    } catch {
      /* ignore */
    }
    throw new Error(`Search Box suggest ${res.status}: ${detail}`)
  }

  let data: { suggestions?: SearchBoxSuggestion[] }
  try {
    data = JSON.parse(text) as { suggestions?: SearchBoxSuggestion[] }
  } catch {
    throw new Error('Search Box suggest returned invalid JSON.')
  }

  return data.suggestions ?? []
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

function formatSuggestionSubtitle(s: SearchBoxSuggestion): string {
  const parts: string[] = []
  if (s.feature_type === 'category') parts.push('Category')
  else if (s.feature_type === 'poi') parts.push('Place')

  const brandJoined = (s.brand ?? [])
    .filter((b): b is string => typeof b === 'string' && b.length > 0)
    .slice(0, 1)
    .join(' · ')
  if (brandJoined) parts.push(brandJoined)

  return parts.join(' · ')
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
  const wrap = document.querySelector<HTMLElement>('#poi-search-wrap')
  const suggestList = document.querySelector<HTMLUListElement>('#poi-suggest-list')
  const filterHint = document.querySelector<HTMLElement>('#poi-brand-filter-hint')
  const filterText = document.querySelector<HTMLElement>('#poi-brand-filter-text')
  const clearFilterBtn =
    document.querySelector<HTMLButtonElement>('#poi-clear-suggest-filter')

  if (
    !input ||
    !addBtn ||
    !status ||
    !list ||
    !wrap ||
    !suggestList ||
    !filterHint ||
    !filterText ||
    !clearFilterBtn
  ) {
    return
  }

  const poiInput = input
  const poiAddBtn = addBtn
  const poiStatus = status
  const poiSavedList = list
  const poiSuggestList = suggestList
  const poiFilterHint = filterHint
  const poiFilterText = filterText
  const poiClearFilterBtn = clearFilterBtn
  const poiWrap = wrap

  const saved = new Map<string, SavedPoi>()
  const queryBatches = new Map<string, QueryBatch>()

  let poiSelectionFilter: PoiSelectionFilter | null = null
  let suggestSessionToken = crypto.randomUUID()
  let suggestDebounce: ReturnType<typeof setTimeout> | undefined
  let suggestAbort: AbortController | null = null
  let lastSuggestions: SearchBoxSuggestion[] = []
  let activeSuggestIndex = -1

  /** `requestAnimationFrame` id for syncing popover geometry while scrolling/resizing */
  let syncSuggestRafId = 0

  function syncSuggestPopoverPosition(): void {
    if (poiSuggestList.classList.contains('hidden')) return

    const anchor = poiWrap.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    const gap = 4

    let left = anchor.left
    let width = anchor.width

    if (left < margin) {
      width -= margin - left
      left = margin
    }
    const maxRight = vw - margin
    if (left + width > maxRight) width = Math.max(120, maxRight - left)

    const top = anchor.bottom + gap
    const maxBottom = vh - margin
    const maxHeight = Math.min(13 * 16, Math.max(96, maxBottom - top))

    Object.assign(poiSuggestList.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: '9999',
    })
  }

  function scheduleSuggestPopoverSync(): void {
    if (poiSuggestList.classList.contains('hidden')) return
    if (syncSuggestRafId !== 0) cancelAnimationFrame(syncSuggestRafId)
    syncSuggestRafId = requestAnimationFrame(() => {
      syncSuggestRafId = 0
      syncSuggestPopoverPosition()
    })
  }

  function refreshFilterHint(): void {
    if (!poiSelectionFilter) {
      poiFilterHint.classList.add('hidden')
      poiFilterText.textContent = ''
      return
    }

    poiFilterHint.classList.remove('hidden')
    poiFilterText.textContent = `Autocomplete filter: ${poiSelectionFilter.label}. Only POIs matching this choice are added.`
  }

  function clearPoiSelectionFilter(): void {
    poiSelectionFilter = null
    refreshFilterHint()
    suggestSessionToken = crypto.randomUUID()
  }

  function closeSuggestUi(): void {
    if (suggestDebounce !== undefined) {
      window.clearTimeout(suggestDebounce)
      suggestDebounce = undefined
    }

    suggestAbort?.abort()
    suggestAbort = null

    if (syncSuggestRafId !== 0) {
      cancelAnimationFrame(syncSuggestRafId)
      syncSuggestRafId = 0
    }

    poiSuggestList.replaceChildren()
    poiSuggestList.classList.add('hidden')
    poiInput.setAttribute('aria-expanded', 'false')

    lastSuggestions = []
    activeSuggestIndex = -1
  }

  function updateSuggestHighlight(): void {
    const buttons = poiSuggestList.querySelectorAll<HTMLButtonElement>('button[role="option"]')
    buttons.forEach((btn, idx) => {
      btn.classList.toggle('bg-base-200', idx === activeSuggestIndex)
      btn.toggleAttribute('aria-selected', idx === activeSuggestIndex)
    })
    const cur = buttons[activeSuggestIndex]
    cur?.scrollIntoView({ block: 'nearest' })
  }

  function renderSuggestions(items: SearchBoxSuggestion[]): void {
    poiSuggestList.replaceChildren()
    lastSuggestions = items

    activeSuggestIndex = items.length ? 0 : -1

    for (let idx = 0; idx < items.length; idx += 1) {
      const s = items[idx]
      const li = document.createElement('li')
      li.setAttribute('role', 'none')

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.setAttribute('role', 'option')
      btn.setAttribute(
        'aria-selected',
        idx === activeSuggestIndex ? 'true' : 'false',
      )
      btn.className =
        'flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-base-200'
      if (idx === activeSuggestIndex) btn.classList.add('bg-base-200')

      const title = s.name_preferred ?? s.name
      const line1 = document.createElement('span')
      line1.className = 'truncate font-medium text-base-content'
      line1.textContent = title

      const line2 = document.createElement('span')
      line2.className = 'truncate text-[10px] leading-tight text-base-content/60'
      line2.textContent = formatSuggestionSubtitle(s)

      btn.append(line1, line2)

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
      })
      btn.addEventListener('click', () => {
        applySuggestion(s)
      })

      li.appendChild(btn)
      poiSuggestList.appendChild(li)
    }
  }

  function applySuggestion(s: SearchBoxSuggestion): void {
    poiInput.value = s.name_preferred ?? s.name
    poiSelectionFilter = poiFilterFromSuggestion(s)
    refreshFilterHint()
    closeSuggestUi()
    suggestSessionToken = crypto.randomUUID()
  }

  function scheduleSuggest(): void {
    if (suggestDebounce !== undefined) window.clearTimeout(suggestDebounce)

    suggestDebounce = window.setTimeout(() => {
      suggestDebounce = undefined
      void loadSuggestions()
    }, SUGGEST_DEBOUNCE_MS)
  }

  async function loadSuggestions(): Promise<void> {
    const q = poiInput.value.trim()
    if (q.length < 2) {
      closeSuggestUi()
      return
    }

    suggestAbort?.abort()
    suggestAbort = new AbortController()
    const { signal } = suggestAbort

    try {
      const items = await fetchSearchBoxSuggest(
        q,
        accessToken,
        suggestSessionToken,
        signal,
      )

      if (signal.aborted || poiInput.value.trim() !== q) return

      if (items.length === 0) {
        closeSuggestUi()
        return
      }

      renderSuggestions(items)
      poiSuggestList.classList.remove('hidden')
      poiInput.setAttribute('aria-expanded', 'true')
      syncSuggestPopoverPosition()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof Error && e.name === 'AbortError') return
      console.warn('[POI suggest]', e)
      closeSuggestUi()
    }
  }

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

    if (saved.size === 0) poiStatus.textContent = ''
  }

  async function searchAndAdd(): Promise<void> {
    closeSuggestUi()

    const q = poiInput.value.trim()
    if (!q) {
      poiStatus.textContent = 'Enter a place to search.'
      return
    }

    poiAddBtn.disabled = true
    poiStatus.textContent = `Searching ${US_STATE_SEARCH_ANCHORS.length} state anchors… 0/${US_STATE_SEARCH_ANCHORS.length}`
    poiClearFilterBtn.classList.add('hidden')

    try {
      const {
        features: mergedFeatures,
        failedRequests,
        firstError,
      } = await searchAllStateAnchors(q, accessToken, (done, total) => {
        poiStatus.textContent = `Searching state anchors… ${done}/${total}`
      })

      const narrowedFilter = poiSelectionFilter

      const totalMerged = mergedFeatures.length
      const features =
        narrowedFilter === null
          ? mergedFeatures
          : mergedFeatures.filter((f) =>
            forwardFeatureMatchesSelection(
              f.properties as SearchBoxProperties,
              narrowedFilter,
            ),
          )

      const excludedByFilter = totalMerged - features.length

      if (features.length === 0) {
        if (totalMerged > 0 && narrowedFilter !== null) {
          poiStatus.textContent =
            'Every nationwide match was filtered out by your autocomplete choice. Clear the filter or pick a different suggestion.'
        } else {
          poiStatus.textContent =
            failedRequests > 0 && firstError
              ? `Search failed: ${firstError}`
              : 'No points of interest found. Try a different search.'
        }
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
        const popupTitle = poiPopupPlaceTitle(q, props)
        const popupAddress = poiPopupAddressLine(props, popupTitle)
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
          .setPopup(
            new mapboxgl.Popup({ offset: 14 }).setDOMContent(
              createPoiPopupElement(popupTitle, popupAddress),
            ),
          )
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
        poiStatus.textContent =
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

      const autocompleteHint =
        excludedByFilter > 0
          ? ` (${excludedByFilter} excluded by autocomplete filter.)`
          : ''

      poiStatus.textContent =
        `Added ${added} place${added === 1 ? '' : 's'} (${features.length} unique matches).${dupHint}${skipHint}${autocompleteHint}${failHint}`

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

        poiSavedList.appendChild(li)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      poiStatus.textContent =
        msg.length > 0 ? `Search failed: ${msg}` : 'Search failed. Check your connection and try again.'
      console.error(e)
    } finally {
      poiAddBtn.disabled = false;
      poiClearFilterBtn.classList.remove('hidden')
      clearPoiSelectionFilter();
      setTimeout(() => {
        poiStatus.textContent = ''
      }, 2000)
    }
  }

  poiAddBtn.addEventListener('click', () => void searchAndAdd())

  poiClearFilterBtn.addEventListener('click', () => {
    clearPoiSelectionFilter()
  })

  poiInput.addEventListener('input', () => {
    scheduleSuggest()
  })

  /** Keep focus on the search field while interacting with floating suggestions (popover is outside the wrap). */
  poiSuggestList.addEventListener('mousedown', (e) => {
    if (!poiSuggestList.classList.contains('hidden')) e.preventDefault()
  })

  window.addEventListener('resize', () => {
    scheduleSuggestPopoverSync()
  })
  document.addEventListener(
    'scroll',
    () => {
      scheduleSuggestPopoverSync()
    },
    true,
  )

  poiInput.addEventListener('keydown', (e) => {
    const listOpen =
      !poiSuggestList.classList.contains('hidden') && lastSuggestions.length > 0

    if (listOpen && e.key === 'ArrowDown') {
      e.preventDefault()
      activeSuggestIndex = Math.min(
        activeSuggestIndex + 1,
        lastSuggestions.length - 1,
      )
      updateSuggestHighlight()
      return
    }

    if (listOpen && e.key === 'ArrowUp') {
      e.preventDefault()
      activeSuggestIndex = Math.max(activeSuggestIndex - 1, 0)
      updateSuggestHighlight()
      return
    }

    if (listOpen && e.key === 'Escape') {
      e.preventDefault()
      closeSuggestUi()
      return
    }

    if (e.key === 'Enter') {
      if (listOpen && activeSuggestIndex >= 0) {
        const pick = lastSuggestions[activeSuggestIndex]
        if (pick) {
          e.preventDefault()
          applySuggestion(pick)
          return
        }
      }
      void searchAndAdd()
      return
    }
  })

  poiInput.addEventListener('blur', () => {
    window.setTimeout(() => closeSuggestUi(), 120)
  })

  document.addEventListener('pointerdown', (e) => {
    const t = e.target
    if (!(t instanceof Node)) return
    if (!(poiWrap.contains(t) || poiSuggestList.contains(t))) closeSuggestUi()
  })
}
