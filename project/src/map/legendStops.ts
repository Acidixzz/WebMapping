/**
 * Hardcoded median-rent ramp (matches Mapbox Studio `rent-state-fill` / `rent-county-fill`).
 */

export type RentLegendStop = {
    value: number
    color: string
}

/** Normal (non-hover) choropleth stops — shared by states and counties. */
export const MEDIAN_RENT_LEGEND_STOPS: readonly RentLegendStop[] = [
    { value: 800, color: '#2ecc71' },
    { value: 1200, color: '#f1c40f' },
    { value: 1600, color: '#e67e22' },
    { value: 2200, color: '#e74c3c' },
] as const

/** Build a left-to-right CSS gradient matching Mapbox stop positions. */
export function rentRampGradientCss(stops: readonly RentLegendStop[]): string {
    const sorted = [...stops].sort((a, b) => a.value - b.value)
    const min = sorted[0].value
    const max = sorted[sorted.length - 1].value
    const span = max - min || 1
    const parts = sorted.map((s) => {
        const pct = ((s.value - min) / span) * 100
        return `${s.color} ${pct}%`
    })
    return `linear-gradient(to right, ${parts.join(', ')})`
}
