import './style.css'

const HomeType = {
  RENT: 'rent',
  HOME: 'home',
} as const

const radios = document.querySelectorAll<HTMLInputElement>('input[name="HomeType"]')

radios.forEach((radio) => {
  radio.addEventListener('change', () => {
    const selected = document.querySelector<HTMLInputElement>('input[name="HomeType"]:checked')

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

const drawer = document.getElementById('app-drawer') as HTMLInputElement | undefined

drawer?.addEventListener('change', () => {
  document.querySelectorAll<HTMLDetailsElement>('details').forEach((e) => {
    if (drawer) e.classList.toggle('collapse-arrow', drawer.checked)
  })
})

document.querySelectorAll('summary').forEach((summary) => {
  summary.addEventListener('click', (e) => {
    const details = summary.closest('details')
    const d = drawer
    if (details && d && !d.checked) {
      e.preventDefault()
      d.checked = true
      d.dispatchEvent(new Event('change', { bubbles: true }))
      details.open = true
    }
  })
})

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function clampLoHi(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi)
}

function snapToStep(raw: number, lo: number, hi: number, step: number): number {
  let v = clampLoHi(raw, lo, hi)
  const st = Number(step)
  const s = Number.isFinite(st) && st > 0 ? st : 1
  v = lo + Math.round((v - lo) / s) * s
  return clampLoHi(v, lo, hi)
}

type MinMaxOpts = {
  floor: number
  ceiling: number
  step: number
  defaultMin: number
  defaultMax: number
}

/**
 * Currency min/max fields only: snap to step, keep min ≤ max, digits while focused.
 */
function wireCurrencyMinMax(
  minSel: string,
  maxSel: string,
  { floor, ceiling, step, defaultMin, defaultMax }: MinMaxOpts,
): void {
  const minInp = document.querySelector<HTMLInputElement>(minSel)
  const maxInp = document.querySelector<HTMLInputElement>(maxSel)
  if (!(minInp && maxInp)) return

  let mn = snapToStep(defaultMin, floor, ceiling, step)
  let mx = snapToStep(defaultMax, floor, ceiling, step)
  if (mx < mn) {
    mn = mx
    mx = snapToStep(mx, mn, ceiling, step)
  }

  let editingMin = false
  let editingMax = false

  function coerce(): void {
    mn = clampLoHi(mn, floor, mx)
    mx = clampLoHi(mx, mn, ceiling)
    mn = snapToStep(mn, floor, ceiling, step)
    mx = snapToStep(mx, floor, ceiling, step)
    if (mx < mn) mx = mn
    mn = clampLoHi(mn, floor, mx)
    mx = clampLoHi(mx, mn, ceiling)
  }

  function pushDisplays(): void {
    coerce()
    if (!minInp || !maxInp) return
    if (!editingMin) minInp.value = usdWhole.format(mn)
    if (!editingMax) maxInp.value = usdWhole.format(mx)
  }

  function digitsFrom(inp: HTMLInputElement): number | undefined {
    const d = inp.value.replace(/\D/g, '')
    if (d === '') return undefined
    return Number(d)
  }

  minInp.addEventListener('focus', () => {
    editingMin = true
    coerce()
    minInp.value = String(mn)
    minInp.select()
  })

  maxInp.addEventListener('focus', () => {
    editingMax = true
    coerce()
    maxInp.value = String(mx)
    maxInp.select()
  })

  minInp.addEventListener('blur', () => {
    editingMin = false
    const v = digitsFrom(minInp)
    if (v !== undefined) {
      mn = snapToStep(v, floor, ceiling, step)
      mn = clampLoHi(mn, floor, mx)
    }
    pushDisplays()
  })

  maxInp.addEventListener('blur', () => {
    editingMax = false
    const v = digitsFrom(maxInp)
    if (v !== undefined) {
      mx = snapToStep(v, floor, ceiling, step)
      mx = clampLoHi(mx, mn, ceiling)
    }
    pushDisplays()
  })

  minInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') minInp.blur()
    if (e.key === 'Escape') {
      pushDisplays()
      minInp.blur()
    }
  })

  maxInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') maxInp.blur()
    if (e.key === 'Escape') {
      pushDisplays()
      maxInp.blur()
    }
  })

  pushDisplays()
}

wireCurrencyMinMax('#rent-min-display', '#rent-max-display', {
  floor: 300,
  ceiling: 8000,
  step: 50,
  defaultMin: 300,
  defaultMax: 8000,
})

wireCurrencyMinMax('#mortgage-min-display', '#mortgage-max-display', {
  floor: 300,
  ceiling: 12000,
  step: 50,
  defaultMin: 300,
  defaultMax: 1200,
})
