// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { wordDocument } from './word'
import { inferPage } from './pagesetup'

const html = `<html><head><style>@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;700&display=swap');.c1{color:red}body{padding:72pt;max-width:468pt}</style></head><body><p class="c1">Hello</p></body></html>`
describe('word document', () => {
  it('keeps the content and styles and writes the page setup as a Word section', () => {
    const page = inferPage(816, { top: 96, right: 96, bottom: 96, left: 96 })
    const out = wordDocument(html, page)
    expect(out).toContain('<p class="c1">Hello</p>')
    expect(out).toContain('.c1{color:red}')
    expect(out).toContain('size:612pt 792pt')
    expect(out).toContain('margin:72pt 72pt 72pt 72pt')
    expect(out).toContain('class="WordSection1"')
    expect(out).toContain('xmlns:w=')
    expect(out).not.toContain('@import')
    expect(out).not.toContain('display=swap')
  })
  it('marks landscape pages', () => {
    const out = wordDocument(html, inferPage(1122.5, { top: 96, right: 96, bottom: 96, left: 96 }))
    expect(out).toContain('mso-page-orientation:landscape')
  })
})
