import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Fills public/sw.js with the list of files that make up the app shell and a version derived from their
 * contents, so every deploy gets a fresh cache and the worker precaches exactly what index.html loads.
 * Chunks loaded on demand (PDF export) are not precached; the worker caches them the first time they are used.
 */
function precacheShell(): Plugin {
  let outDir = 'dist'
  return {
    name: 'precache-shell',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir },
    closeBundle() {
      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const fromHtml = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
      const statics = readdirSync(outDir).filter((f) => /\.(png|svg|webmanifest)$/.test(f)).map((f) => '/' + f)
      const files = ['/', ...new Set(fromHtml), ...statics]
      const hash = createHash('sha256')
      for (const f of files) hash.update(readFileSync(join(outDir, f === '/' ? 'index.html' : f.slice(1))))
      const sw = join(outDir, 'sw.js')
      const src = readFileSync(sw, 'utf8')
        .replace(/\/\*__VERSION__\*\/'[^']*'/, JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace(/\/\*__PRECACHE__\*\/\[[^\]]*\]/, JSON.stringify(files))
      writeFileSync(sw, src)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), precacheShell()],
})
