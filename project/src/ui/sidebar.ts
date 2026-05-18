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
    wireDrawerSectionTooltips()
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
        document.getElementById('drawer-section-tooltip')?.classList.add('hidden')
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

function isDrawerIconRail(): boolean {
    const drawer = document.querySelector('.drawer')
    if (drawer?.classList.contains('is-drawer-close')) return true
    const panel = document.querySelector<HTMLElement>('.drawer-side > div')
    if (!panel) return false
    return panel.getBoundingClientRect().width < 120
}

function wireDrawerSectionTooltips(): void {
    const tooltip = document.getElementById('drawer-section-tooltip')
    const tips = document.querySelectorAll<HTMLElement>('.drawer-section-tip')
    if (!tooltip || tips.length === 0) return

    let activeTip: HTMLElement | null = null

    const hide = (): void => {
        activeTip = null
        tooltip.classList.add('hidden')
        tooltip.textContent = ''
    }

    const position = (anchor: HTMLElement): void => {
        const rect = anchor.getBoundingClientRect()
        const gap = 10
        const left = Math.min(rect.right + gap, window.innerWidth - 8)
        const top = rect.top + rect.height / 2
        tooltip.style.left = `${left}px`
        tooltip.style.top = `${top}px`
        tooltip.style.transform = 'translateY(-50%)'
    }

    const show = (anchor: HTMLElement): void => {
        if (!isDrawerIconRail()) return
        const text = anchor.dataset.tip?.trim()
        if (!text) return
        activeTip = anchor
        tooltip.textContent = text
        tooltip.classList.remove('hidden')
        position(anchor)
    }

    tips.forEach((tip) => {
        tip.addEventListener('mouseenter', () => show(tip))
        tip.addEventListener('focus', () => show(tip))
        tip.addEventListener('mouseleave', () => {
            if (activeTip === tip) hide()
        })
        tip.addEventListener('blur', () => {
            if (activeTip === tip) hide()
        })
    })

    window.addEventListener('scroll', () => {
        if (activeTip) position(activeTip)
    }, true)

    document.getElementById('app-drawer')?.addEventListener('change', hide)
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
