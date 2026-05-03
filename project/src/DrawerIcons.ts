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
