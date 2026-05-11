import { applyRentRange } from '../filters'
import { wireCurrencyMinMax } from './currencyMinMax'

/**
 * Sidebar / drawer interactions:
 *   - Home-type radio (rent vs mortgage)
 *   - Drawer open/close + summary expand
 *   - Rent / mortgage min-max currency widgets, with the rent fields wired to
 *     the central filter store via `applyRentRange`.
 *
 * Idempotent: safe to call once after the DOM is ready.
 */

const HomeType = {
    RENT: 'rent',
    HOME: 'home',
} as const

const RENT_FLOOR = 0
const RENT_CEILING = 3000

const MORTGAGE_FLOOR = 0
const MORTGAGE_CEILING = 12000
const MORTGAGE_DEFAULT_MAX = 12000

export function initSidebar(): void {
    wireHomeTypeRadio()
    wireDrawer()
    wireRentBudget()
    wireMortgageBudget()
}

function wireHomeTypeRadio(): void {
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="HomeType"]')

    radios.forEach((radio) => {
        radio.addEventListener('change', () => {
            const selected = document.querySelector<HTMLInputElement>(
                'input[name="HomeType"]:checked',
            )
            if (!selected) return

            switch (selected.id) {
                case HomeType.RENT:
                    break
                case HomeType.HOME:
                    break
                default:
                    break
            }
        })
    })
}

function wireDrawer(): void {
    const drawer = document.getElementById('app-drawer') as HTMLInputElement | null

    drawer?.addEventListener('change', () => {
        document.querySelectorAll<HTMLDetailsElement>('details').forEach((e) => {
            if (drawer) e.classList.toggle('collapse-arrow', drawer.checked)
        })
    })

    document.querySelectorAll('summary').forEach((summary) => {
        summary.addEventListener('click', (e) => {
            const details = summary.closest('details')
            if (details && drawer && !drawer.checked) {
                e.preventDefault()
                drawer.checked = true
                drawer.dispatchEvent(new Event('change', { bubbles: true }))
                details.open = true
            }
        })
    })
}

function wireRentBudget(): void {
    wireCurrencyMinMax('#rent-min-display', '#rent-max-display', {
        floor: RENT_FLOOR,
        ceiling: RENT_CEILING,
        step: 50,
        defaultMin: RENT_FLOOR,
        defaultMax: RENT_CEILING,
        onChange: (min, max) => {
            // When a slider sits at its limit, treat that side as unbounded so
            // we don't hide polygons whose rent legitimately falls outside the
            // UI's clamp range.
            applyRentRange({
                min: min > RENT_FLOOR ? min : null,
                max: max < RENT_CEILING ? max : null,
            })
        },
    })
}

function wireMortgageBudget(): void {
    wireCurrencyMinMax('#mortgage-min-display', '#mortgage-max-display', {
        floor: MORTGAGE_FLOOR,
        ceiling: MORTGAGE_CEILING,
        step: 50,
        defaultMin: MORTGAGE_FLOOR,
        defaultMax: MORTGAGE_DEFAULT_MAX,
    })
}
