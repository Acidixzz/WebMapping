import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './style.css'
import { initPoiSearch } from './poiSearch'
import { ALASKA_BOUNDS, HAWAII_BOUNDS, US_MAINLAND_BOUNDS } from './mapBounds'

mapboxgl.accessToken =
  'pk.eyJ1Ijoib3dlbndpbHNvbjgwIiwiYSI6ImNtbmdxamsyNzBkYzEyb29tMTc5Y2ZxZjQifQ.H80u2eqZMFKdGk-75Loj7w'

const styleUrl = 'mapbox://styles/owenwilson80/cmomgmhvc000l01pz68bngoth'

const mainMap = new mapboxgl.Map({
  container: 'map-main',
  style: styleUrl,
  center: [-98.58, 39.82],
  zoom: 4,
  minZoom: 4,
  maxBounds: US_MAINLAND_BOUNDS,
})

mainMap.addControl(
  new mapboxgl.NavigationControl({
    showCompass: false,
  }),
  'bottom-right',
)

const hawaiiMap = new mapboxgl.Map({
  container: 'map-hawaii',
  style: styleUrl,
  bounds: HAWAII_BOUNDS,
  fitBoundsOptions: { padding: 8 },
  maxBounds: HAWAII_BOUNDS,
  minZoom: 4,
})

const alaskaMap = new mapboxgl.Map({
  container: 'map-alaska',
  style: styleUrl,
  bounds: ALASKA_BOUNDS,
  fitBoundsOptions: { padding: 8 },
  maxBounds: ALASKA_BOUNDS,
  minZoom: 0,
})

initPoiSearch(mainMap, hawaiiMap, alaskaMap, mapboxgl.accessToken)

const alaskaInset = document.querySelector<HTMLElement>('#inset-alaska')
const hawaiiInset = document.querySelector<HTMLElement>('#inset-hawaii')
const alaskaClose = document.querySelector<HTMLButtonElement>('#close-alaska')
const hawaiiClose = document.querySelector<HTMLButtonElement>('#close-hawaii')
const alaskaExpand = document.querySelector<HTMLButtonElement>('#expand-alaska')
const hawaiiExpand = document.querySelector<HTMLButtonElement>('#expand-hawaii')
const alaskaHeader = document.querySelector<HTMLElement>('#inset-alaska .overlay-header')
const hawaiiHeader = document.querySelector<HTMLElement>('#inset-hawaii .overlay-header')
const mapShell = document.querySelector<HTMLElement>('.map-shell')

function wireInsetClose(
  inset: HTMLElement | null,
  closeButton: HTMLButtonElement | null,
): void {
  if (!inset || !closeButton) { return; }

  closeButton.addEventListener('click', () => {
    if (inset.classList.contains('is-hidden') || inset.classList.contains('is-closing')) {
      return
    }

    void shrinkInsetByEl(inset).then(() => {
      inset.classList.add('is-closing')

      const onAnimationEnd = (): void => {
        inset.classList.remove('is-closing')
        inset.classList.add('is-hidden')
        inset.removeEventListener('animationend', onAnimationEnd)
      }

      inset.addEventListener('animationend', onAnimationEnd)
    })
  })
}

function wireInsetDrag(
  inset: HTMLElement | null,
  handle: HTMLElement | null,
  map: mapboxgl.Map,
  boundsEl: HTMLElement | null,
): void {
  if (!inset || !handle || !boundsEl) { return; }

  const isMobileFormFactor = (): boolean =>
    window.matchMedia('(max-width: 700px), (pointer: coarse)').matches

  let isDragging = false
  let pointerId = -1
  let offsetX = 0
  let offsetY = 0
  /** Cached from pointerdown; avoids layout reads on every pointermove */
  let shellLeft = 0
  let shellTop = 0
  let maxLeft = 0
  let maxTop = 0
  let moveRaf = 0
  let pendingLeft = 0
  let pendingTop = 0

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max)

  const flushPendingPosition = (): void => {
    inset.style.left = `${pendingLeft}px`
    inset.style.top = `${pendingTop}px`
  }

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (isMobileFormFactor()) return
    if (inset.classList.contains('expanded')) return
    if (inset.classList.contains('is-inset-flipping')) return

    const target = event.target as HTMLElement
    if (target.closest('.close-button')) return

    const shellRect = boundsEl.getBoundingClientRect()
    const rect = inset.getBoundingClientRect()

    inset.style.left = `${rect.left - shellRect.left}px`
    inset.style.top = `${rect.top - shellRect.top}px`
    inset.style.bottom = 'auto'

    shellLeft = shellRect.left
    shellTop = shellRect.top
    const iw = inset.offsetWidth
    const ih = inset.offsetHeight
    maxLeft = Math.max(shellRect.width - iw, 0)
    maxTop = Math.max(shellRect.height - ih, 0)
    pendingLeft = rect.left - shellRect.left
    pendingTop = rect.top - shellRect.top

    pointerId = event.pointerId
    offsetX = event.clientX - rect.left
    offsetY = event.clientY - rect.top
    isDragging = true
    inset.classList.add('is-dragging')
    handle.setPointerCapture(pointerId)
    event.preventDefault()
  })

  handle.addEventListener('pointermove', (event: PointerEvent) => {
    if (!isDragging || event.pointerId !== pointerId) { return; }

    pendingLeft = clamp(event.clientX - offsetX - shellLeft, 0, maxLeft)
    pendingTop = clamp(event.clientY - offsetY - shellTop, 0, maxTop)

    if (moveRaf !== 0) { return; }
    moveRaf = window.requestAnimationFrame(() => {
      moveRaf = 0
      flushPendingPosition()
    })
  })

  const stopDrag = (event: PointerEvent): void => {
    if (!isDragging || event.pointerId !== pointerId) return
    isDragging = false
    if (moveRaf !== 0) {
      window.cancelAnimationFrame(moveRaf)
      moveRaf = 0
      flushPendingPosition()
    }
    inset.classList.remove('is-dragging')
    handle.releasePointerCapture(pointerId)
    map.resize()
  }

  handle.addEventListener('pointerup', stopDrag)
  handle.addEventListener('pointercancel', stopDrag)
}

type InsetSavedLayout = Readonly<{
  left: string
  top: string
  bottom: string
  width: string
  height: string
}>

type InsetExpandMeta = Readonly<{
  inset: HTMLElement
  map: mapboxgl.Map
  expandButton: HTMLButtonElement
  ariaExpandLabel: string
  ariaShrinkLabel: string
}>

const insetExpandSavedLayout = new WeakMap<HTMLElement, InsetSavedLayout>()
const insetExpandRegistry: InsetExpandMeta[] = []

function captureInsetLayout(el: HTMLElement): InsetSavedLayout {
  const { style } = el
  return {
    left: style.left,
    top: style.top,
    bottom: style.bottom,
    width: style.width,
    height: style.height,
  }
}

function restoreInsetLayout(el: HTMLElement, snapshot: InsetSavedLayout): void {
  const { style } = el
  style.left = snapshot.left
  style.top = snapshot.top
  style.bottom = snapshot.bottom
  style.width = snapshot.width
  style.height = snapshot.height
}

const INSET_FLIP_MS = 380

/** Match FLIP settle + Daisy drawer follow-up sizing */
function scheduleInsetMapResize(map: mapboxgl.Map): void {
  queueMicrotask(() => map.resize())
  window.setTimeout(() => map.resize(), INSET_FLIP_MS + 40)
}

/** In-flight FLIP teardown (abort transforms + listener/timer when starting a new transition) */
const insetFlipAbort = new WeakMap<HTMLElement, () => void>()

function abortInsetFlip(inset: HTMLElement): void {
  insetFlipAbort.get(inset)?.()
}

function prefersInsetFlipAnimation(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clearInsetFlipArtifacts(inset: HTMLElement): void {
  inset.style.removeProperty('transform')
  inset.style.removeProperty('transition')
  inset.style.removeProperty('will-change')
  inset.style.removeProperty('transform-origin')
  inset.classList.remove('is-inset-flipping')
}

/**
 * FLIP: layout jumps between small card and shell fill; animate with transform between rects.
 */
function animateInsetFlip(
  inset: HTMLElement,
  map: mapboxgl.Map,
  mode: 'expand' | 'shrink',
  snap: InsetSavedLayout | undefined,
): Promise<void> {
  if (!prefersInsetFlipAnimation()) {
    if (mode === 'expand') {
      inset.classList.add('expanded')
    }
    else {
      inset.classList.remove('expanded')
      if (snap) {
        restoreInsetLayout(inset, snap)
      }
    }
    scheduleInsetMapResize(map)
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    abortInsetFlip(inset)

    const firstRect = inset.getBoundingClientRect()

    if (mode === 'expand') {
      inset.classList.add('expanded')
    }
    else {
      inset.classList.remove('expanded')
      if (snap) {
        restoreInsetLayout(inset, snap)
      }
    }

    void inset.offsetWidth

    const lastRect = inset.getBoundingClientRect()
    const lw = Math.max(lastRect.width, 1e-3)
    const lh = Math.max(lastRect.height, 1e-3)
    const dx = firstRect.left - lastRect.left
    const dy = firstRect.top - lastRect.top
    const sx = firstRect.width / lw
    const sy = firstRect.height / lh

    let settled = false
    let fallbackTimer = 0

    const settle = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(fallbackTimer)
      inset.removeEventListener('transitionend', onTransitionEnd)
      insetFlipAbort.delete(inset)
      clearInsetFlipArtifacts(inset)
      resolve()
      scheduleInsetMapResize(map)
    }

    function onTransitionEnd(ev: TransitionEvent): void {
      if (ev.target !== inset || ev.propertyName !== 'transform') {
        return
      }
      settle()
    }

    fallbackTimer = window.setTimeout(settle, INSET_FLIP_MS + 120)

    insetFlipAbort.set(inset, () => {
      window.clearTimeout(fallbackTimer)
      inset.removeEventListener('transitionend', onTransitionEnd)
      if (!settled) {
        settled = true
        insetFlipAbort.delete(inset)
        clearInsetFlipArtifacts(inset)
        resolve()
        scheduleInsetMapResize(map)
      }
    })

    inset.classList.add('is-inset-flipping')
    inset.style.transformOrigin = '0 0'
    inset.style.willChange = 'transform'
    inset.style.transition = 'none'
    inset.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`

    inset.addEventListener('transitionend', onTransitionEnd)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (settled) return
        inset.style.transition =
          `transform ${INSET_FLIP_MS}ms cubic-bezier(0.22, 0.82, 0.22, 1)`
        inset.style.transform = ''
        inset.style.removeProperty('will-change')
      })
    })
  })
}

async function shrinkInsetByEl(inset: HTMLElement): Promise<void> {
  abortInsetFlip(inset)

  const meta = insetExpandRegistry.find((r) => r.inset === inset)
  if (!meta?.inset.classList.contains('expanded')) {
    return
  }

  const snap = insetExpandSavedLayout.get(inset)
  insetExpandSavedLayout.delete(inset)
  meta.expandButton.setAttribute('aria-expanded', 'false')
  meta.expandButton.setAttribute('aria-label', meta.ariaExpandLabel)

  await animateInsetFlip(inset, meta.map, 'shrink', snap)
}

async function collapseOtherInset(keepOpen: HTMLElement): Promise<void> {
  const expandedOthers = insetExpandRegistry.filter(
    ({ inset }) => inset !== keepOpen && inset.classList.contains('expanded'),
  )
  for (const { inset } of expandedOthers) {
    await shrinkInsetByEl(inset)
  }
}

/** Expand / shrink Alaska or Hawaii inset; restores drag offsets when shrinking */
function wireInsetExpandToggle(meta: InsetExpandMeta): void {
  insetExpandRegistry.push(meta)
  const { inset, expandButton, map, ariaShrinkLabel } = meta

  expandButton.addEventListener('click', () => {
    void (async () => {
      if (inset.classList.contains('expanded')) {
        await shrinkInsetByEl(inset)
        return
      }

      insetExpandSavedLayout.set(inset, captureInsetLayout(inset))

      await collapseOtherInset(inset)

      expandButton.setAttribute('aria-expanded', 'true')
      expandButton.setAttribute('aria-label', ariaShrinkLabel)
      await animateInsetFlip(inset, map, 'expand', undefined)
    })()
  })
}

wireInsetClose(hawaiiInset, hawaiiClose)
wireInsetClose(alaskaInset, alaskaClose)
wireInsetDrag(hawaiiInset, hawaiiHeader, hawaiiMap, mapShell)
wireInsetDrag(alaskaInset, alaskaHeader, alaskaMap, mapShell)
if (alaskaInset && alaskaExpand) {
  wireInsetExpandToggle({
    inset: alaskaInset,
    map: alaskaMap,
    expandButton: alaskaExpand,
    ariaExpandLabel: 'Expand Alaska inset',
    ariaShrinkLabel: 'Minimize Alaska inset',
  })
}
if (hawaiiInset && hawaiiExpand) {
  wireInsetExpandToggle({
    inset: hawaiiInset,
    map: hawaiiMap,
    expandButton: hawaiiExpand,
    ariaExpandLabel: 'Expand Hawaii inset',
    ariaShrinkLabel: 'Minimize Hawaii inset',
  })
}

function resizeMaps(): void {
  mainMap.resize()
  hawaiiMap.resize()
  alaskaMap.resize()
}

const drawerToggle = document.querySelector<HTMLInputElement>('#app-drawer')
drawerToggle?.addEventListener('change', () => {
  resizeMaps()
  window.setTimeout(resizeMaps, 220)
})

window.addEventListener('resize', resizeMaps)
