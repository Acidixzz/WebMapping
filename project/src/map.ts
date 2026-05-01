import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './style.css'

mapboxgl.accessToken =
  'pk.eyJ1Ijoib3dlbndpbHNvbjgwIiwiYSI6ImNtbmdxamsyNzBkYzEyb29tMTc5Y2ZxZjQifQ.H80u2eqZMFKdGk-75Loj7w'

const styleUrl = 'mapbox://styles/owenwilson80/cmomgmhvc000l01pz68bngoth'

const usMainlandBounds: mapboxgl.LngLatBoundsLike = [
  [-132.0, 20.0],
  [-60.0, 54.5],
]

const hawaiiBounds: mapboxgl.LngLatBoundsLike = [
  [-162.4, 18.2],
  [-153.6, 23.1],
]

const alaskaBounds: mapboxgl.LngLatBoundsLike = [
  [-195.0, 50.2],
  [-108.0, 72.8],
]

const mainMap = new mapboxgl.Map({
  container: 'map-main',
  style: styleUrl,
  center: [-98.58, 39.82],
  zoom: 4,
  minZoom: 4,
  maxBounds: usMainlandBounds,
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
  bounds: hawaiiBounds,
  fitBoundsOptions: { padding: 8 },
  maxBounds: hawaiiBounds,
  minZoom: 4,
})

const alaskaMap = new mapboxgl.Map({
  container: 'map-alaska',
  style: styleUrl,
  bounds: alaskaBounds,
  fitBoundsOptions: { padding: 8 },
  maxBounds: alaskaBounds,
  minZoom: 0,
})

const hawaiiInset = document.querySelector<HTMLElement>('#inset-hawaii')
const alaskaInset = document.querySelector<HTMLElement>('#inset-alaska')
const hawaiiClose = document.querySelector<HTMLButtonElement>('#close-hawaii')
const alaskaClose = document.querySelector<HTMLButtonElement>('#close-alaska')
const hawaiiHeader = document.querySelector<HTMLElement>('#inset-hawaii .overlay-header')
const alaskaHeader = document.querySelector<HTMLElement>('#inset-alaska .overlay-header')

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
): void {
  if (!inset || !handle) return

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

    const rect = inset.getBoundingClientRect()
    inset.style.left = `${rect.left}px`
    inset.style.top = `${rect.top}px`
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

    const rect = inset.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width
    const maxY = window.innerHeight - rect.height
    const nextLeft = clamp(event.clientX - offsetX, 0, Math.max(maxX, 0))
    const nextTop = clamp(event.clientY - offsetY, 0, Math.max(maxY, 0))

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
wireInsetDrag(hawaiiInset, hawaiiHeader, hawaiiMap)
wireInsetDrag(alaskaInset, alaskaHeader, alaskaMap)

window.addEventListener('resize', () => {
  hawaiiMap.resize()
  alaskaMap.resize()
})
