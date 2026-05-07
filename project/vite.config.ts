import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/** GitHub project pages use /repo-name/ on the subdomain; CI sets VITE_BASE_PATH automatically. */
function basePath(): string {
  const raw = process.env.VITE_BASE_PATH?.trim()
  if (!raw || raw === '/') return '/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

export default defineConfig({
  plugins: [tailwindcss()],
  base: basePath(),
})
