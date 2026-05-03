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

const hawaiiInset = document.querySelector<HTMLElement>('#inset-hawaii')
const alaskaInset = document.querySelector<HTMLElement>('#inset-alaska')
const hawaiiClose = document.querySelector<HTMLButtonElement>('#close-hawaii')
const alaskaClose = document.querySelector<HTMLButtonElement>('#close-alaska')
const hawaiiHeader = document.querySelector<HTMLElement>('#inset-hawaii .overlay-header')
const alaskaHeader = document.querySelector<HTMLElement>('#inset-alaska .overlay-header')
const mapShell = document.querySelector<HTMLElement>('.map-shell')

function wireInsetClose(
  inset: HTMLElement | null,
  closeButton: HTMLButtonElement | null,
): void {
  if (!inset || !closeButton) return

  closeButton.addEventListener('click', () => {
    if (inset.classList.contains('is-hidden') || inset.classList.contains('is-closing')) {
      return
    }

    inset.classList.add('is-closing')

    const onAnimationEnd = (): void => {
      inset.classList.remove('is-closing')
      inset.classList.add('is-hidden')
      inset.removeEventListener('animationend', onAnimationEnd)
    }

    inset.addEventListener('animationend', onAnimationEnd)
  })
}

function wireInsetDrag(
  inset: HTMLElement | null,
  handle: HTMLElement | null,
  map: mapboxgl.Map,
  boundsEl: HTMLElement | null,
): void {
  if (!inset || !handle || !boundsEl) return

  const isMobileFormFactor = (): boolean =>
    window.matchMedia('(max-width: 700px), (pointer: coarse)').matches

  let isDragging = false
  let pointerId = -1
  let offsetX = 0
  let offsetY = 0

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max)

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (isMobileFormFactor()) return

    const target = event.target as HTMLElement
    if (target.closest('.close-button')) return

    const shellRect = boundsEl.getBoundingClientRect()
    const rect = inset.getBoundingClientRect()

    inset.style.left = `${rect.left - shellRect.left}px`
    inset.style.top = `${rect.top - shellRect.top}px`
    inset.style.bottom = 'auto'

    pointerId = event.pointerId
    offsetX = event.clientX - rect.left
    offsetY = event.clientY - rect.top
    isDragging = true
    inset.classList.add('is-dragging')
    handle.setPointerCapture(pointerId)
    event.preventDefault()
  })

  handle.addEventListener('pointermove', (event: PointerEvent) => {
    if (!isDragging || event.pointerId !== pointerId) return

    const shellRect = boundsEl.getBoundingClientRect()
    const iw = inset.offsetWidth
    const ih = inset.offsetHeight
    const maxLeft = Math.max(shellRect.width - iw, 0)
    const maxTop = Math.max(shellRect.height - ih, 0)
    const nextLeft = clamp(event.clientX - offsetX - shellRect.left, 0, maxLeft)
    const nextTop = clamp(event.clientY - offsetY - shellRect.top, 0, maxTop)

    inset.style.left = `${nextLeft}px`
    inset.style.top = `${nextTop}px`
  })

  const stopDrag = (event: PointerEvent): void => {
    if (!isDragging || event.pointerId !== pointerId) return
    isDragging = false
    inset.classList.remove('is-dragging')
    handle.releasePointerCapture(pointerId)
    map.resize()
  }

  handle.addEventListener('pointerup', stopDrag)
  handle.addEventListener('pointercancel', stopDrag)
}

wireInsetClose(hawaiiInset, hawaiiClose)
wireInsetClose(alaskaInset, alaskaClose)
wireInsetDrag(hawaiiInset, hawaiiHeader, hawaiiMap, mapShell)
wireInsetDrag(alaskaInset, alaskaHeader, alaskaMap, mapShell)

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
