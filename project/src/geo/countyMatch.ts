/** State name field on rent state tiles (matches POI geocode labels). */
export const RENT_STATE_NAME_FIELD = 'rent_state_csv_NAME'

/** County polygon fields tried in order for geography matching. */
export const COUNTY_NAME_FIELDS = ['NAMELSAD', 'NAME', 'county_name', 'COUNTY_NAME'] as const

export const COUNTY_STATE_FIELD = 'STATE_NAME'

const COUNTY_SUFFIX_RE = /\s+(County|Parish|Borough|Census Area|Municipality)$/i

export function pickCountyStateFromTileProps(
    props: Record<string, unknown> | null | undefined,
): { state: string; county: string } | null {
    if (!props || typeof props !== 'object') return null

    let county: string | undefined
    for (const field of COUNTY_NAME_FIELDS) {
        const v = props[field]
        if (typeof v === 'string' && v.trim().length > 0) {
            county = v.trim()
            break
        }
    }

    const stateRaw =
        props[COUNTY_STATE_FIELD] ??
        props.state ??
        props.STATE ??
        props.state_name ??
        props.STUSPS
    const state = typeof stateRaw === 'string' && stateRaw.trim().length > 0 ? stateRaw.trim() : undefined

    if (!county || !state) return null
    return { state, county }
}

/** Labels to try when matching POI county names to tile attributes. */
export function countyLabelVariants(county: string): string[] {
    const base = county.trim()
    if (!base) return []

    const variants = new Set<string>([base])
    if (!COUNTY_SUFFIX_RE.test(base)) {
        variants.add(`${base} County`)
        variants.add(`${base} Parish`)
        variants.add(`${base} Borough`)
    }

    const stripped = base.replace(COUNTY_SUFFIX_RE, '').trim()
    if (stripped.length > 0) variants.add(stripped)

    return [...variants]
}

/** Labels to try when matching POI state names to county-tile STATE_NAME. */
export function stateLabelVariants(state: string): string[] {
    const base = state.trim()
    if (!base) return []
    return [base]
}

export function isUnknownCountyLabel(county: string): boolean {
    return county.trim().toLowerCase() === 'unknown county'
}
