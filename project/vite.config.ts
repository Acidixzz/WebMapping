import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const GITHUB_PAGES_BASE = '/WebMapping/project/'

/** GitHub Pages: https://acidixzz.github.io/WebMapping/project/ */
function resolveBase(mode: string): string {
    const raw = process.env.VITE_BASE_PATH?.trim()
    if (raw) return raw.endsWith('/') ? raw : `${raw}/`
    if (mode === 'pages') return GITHUB_PAGES_BASE
    return '/'
}

export default defineConfig(({ mode }) => ({
    plugins: [tailwindcss()],
    base: resolveBase(mode),
    preview: {
        // npm run preview:pages — open the same URL path as production
        open: mode === 'pages' ? GITHUB_PAGES_BASE : undefined,
    },
}))
