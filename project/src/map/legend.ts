import { getPoiLegendRows, setPoiBatchVisible } from '../poi'
import { MEDIAN_RENT_LEGEND_STOPS, rentRampGradientCss } from './legendStops'

const LEGEND_SHOW_HIDE_MS = 220

const legendEl = () => document.getElementById('map-legend')
const rentRampEl = () => document.getElementById('legend-rent-ramp')
const rentBarEl = () => document.getElementById('legend-rent-ramp-bar')
const rentMinEl = () => document.getElementById('legend-rent-min')
const rentMaxEl = () => document.getElementById('legend-rent-max')
const rentFootnoteEl = () => document.getElementById('legend-rent-footnote')
const poiListEl = () => document.getElementById('legend-poi-list')
const poiEmptyEl = () => document.getElementById('legend-poi-empty')

let rentRampPainted = false

export type SetLegendVisibleOptions = {
    /** When false, show/hide immediately (e.g. initial drawer sync). Default true. */
    animate?: boolean
}

function formatRentValue(value: number): string {
    return `$${Math.round(value).toLocaleString()}`
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function emitLegendVisibility(visible: boolean): void {
    window.dispatchEvent(
        new CustomEvent('legend-visibility-changed', { detail: { visible } }),
    )
}

function paintRentRampOnce(): void {
    if (rentRampPainted) return

    const ramp = rentRampEl()
    const bar = rentBarEl()
    const minLabel = rentMinEl()
    const maxLabel = rentMaxEl()
    const footnote = rentFootnoteEl()
    if (!ramp || !bar || !minLabel || !maxLabel) return

    const stops = MEDIAN_RENT_LEGEND_STOPS
    const min = stops[0].value
    const max = stops[stops.length - 1].value

    bar.style.background = rentRampGradientCss(stops)
    minLabel.textContent = formatRentValue(min)
    maxLabel.textContent = formatRentValue(max)
    bar.setAttribute(
        'aria-label',
        `Median rent color scale from ${formatRentValue(min)} – ${formatRentValue(max)}`,
    )

    ramp.classList.remove('hidden')
    ramp.setAttribute('aria-hidden', 'false')
    footnote?.classList.remove('hidden')
    rentRampPainted = true
}

function onLegendAnimationEnd(
    legend: HTMLElement,
    animationName: 'inset-close' | 'inset-open',
    done: () => void,
): (ev: AnimationEvent) => void {
    return (ev: AnimationEvent) => {
        if (ev.target !== legend || ev.animationName !== animationName) return
        done()
    }
}

function setLegendVisibleInstant(legend: HTMLElement, visible: boolean): void {
    legend.classList.remove('is-closing', 'is-opening')
    legend.classList.toggle('is-hidden', !visible)
    emitLegendVisibility(visible)
}

async function hideLegendAnimated(legend: HTMLElement): Promise<void> {
    if (legend.classList.contains('is-hidden') || legend.classList.contains('is-closing')) return

    if (prefersReducedMotion()) {
        setLegendVisibleInstant(legend, false)
        return
    }

    legend.classList.remove('is-opening')

    return new Promise((resolve) => {
        let settled = false
        const settle = (): void => {
            if (settled) return
            settled = true
            window.clearTimeout(fallback)
            legend.removeEventListener('animationend', onEnd)
            legend.classList.remove('is-closing')
            legend.classList.add('is-hidden')
            emitLegendVisibility(false)
            resolve()
        }

        const onEnd = onLegendAnimationEnd(legend, 'inset-close', settle)
        const fallback = window.setTimeout(settle, LEGEND_SHOW_HIDE_MS + 80)

        legend.classList.add('is-closing')
        legend.addEventListener('animationend', onEnd)
    })
}

async function showLegendAnimated(legend: HTMLElement): Promise<void> {
    if (!legend.classList.contains('is-hidden')) return
    if (legend.classList.contains('is-opening')) return

    if (prefersReducedMotion()) {
        setLegendVisibleInstant(legend, true)
        return
    }

    legend.classList.remove('is-closing', 'is-hidden')
    legend.classList.add('is-opening')
    void legend.offsetWidth

    return new Promise((resolve) => {
        let settled = false
        const settle = (): void => {
            if (settled) return
            settled = true
            window.clearTimeout(fallback)
            legend.removeEventListener('animationend', onEnd)
            legend.classList.remove('is-opening')
            emitLegendVisibility(true)
            resolve()
        }

        const onEnd = onLegendAnimationEnd(legend, 'inset-open', settle)
        const fallback = window.setTimeout(settle, LEGEND_SHOW_HIDE_MS + 80)

        legend.addEventListener('animationend', onEnd)
    })
}

function renderPoiRows(): void {
    const ul = poiListEl()
    const empty = poiEmptyEl()
    if (!ul || !empty) return

    const rows = getPoiLegendRows()
    ul.replaceChildren()

    if (rows.length === 0) {
        empty.classList.remove('hidden')
        return
    }

    empty.classList.add('hidden')

    for (const row of rows) {
        const li = document.createElement('li')
        li.className = 'map-legend-poi-row'
        if (!row.visible) li.classList.add('map-legend-poi-row--hidden')

        const swatchStyle = row.visible
            ? `background:${row.markerFill}`
            : 'background:#94a3b8'

        li.innerHTML = `
          <label class="map-legend-poi-toggle">
            <input type="checkbox" class="toggle toggle-xs" ${row.visible ? 'checked' : ''}
              aria-label="Show ${escapeHtml(row.label)} on map" data-run-id="${escapeHtml(row.runId)}" />
          </label>
          <span class="map-legend-poi-swatch" style="${swatchStyle}"></span>
          <span class="map-legend-poi-label">${escapeHtml(row.label)}</span>
          <span class="map-legend-poi-count">${row.count}</span>
        `

        const toggle = li.querySelector<HTMLInputElement>('input[data-run-id]')
        toggle?.addEventListener('change', () => {
            if (!toggle) return
            setPoiBatchVisible(row.runId, toggle.checked)
            renderPoiRows()
        })

        ul.appendChild(li)
    }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Mount legend UI. Rent ramp is static; POI rows refresh on search / visibility changes. */
export function initMapLegend(): void {
    paintRentRampOnce()
    renderPoiRows()

    window.addEventListener('poi-counts-changed', () => renderPoiRows())
    window.addEventListener('poi-visibility-changed', () => renderPoiRows())
}

/** Show or hide the on-map legend card (Map display toggle). */
export function setLegendVisible(visible: boolean, options?: SetLegendVisibleOptions): void {
    const legend = legendEl()
    if (!legend) return

    const animate = options?.animate !== false

    if (visible) {
        if (!legend.classList.contains('is-hidden')) return
        if (animate) void showLegendAnimated(legend)
        else setLegendVisibleInstant(legend, true)
        return
    }

    if (legend.classList.contains('is-hidden')) return
    if (animate) void hideLegendAnimated(legend)
    else setLegendVisibleInstant(legend, false)
}

export function isLegendVisible(): boolean {
    const legend = legendEl()
    if (!legend) return false
    return !legend.classList.contains('is-hidden')
}
