// Google's HTML export carries the Doc's page setup only as the body's max-width and padding:
//   width = max-width + left padding + right padding, margins = the padding.
// The page height is not exported, so it is inferred from the width of the standard paper sizes.

export interface PageSetup {
  /** page width / height in CSS px (96 dpi) and in mm */
  wPx: number
  hPx: number
  wMm: number
  hMm: number
  /** margins in CSS px */
  top: number
  right: number
  bottom: number
  left: number
  name: string
}

const PX_PER_PT = 96 / 72
const MM_PER_PX = 25.4 / 96

/** [width pt, height pt, name], checked in this order within 3pt of the width. */
const SIZES: [number, number, string][] = [
  [595.3, 841.9, 'A4'],
  [612, 792, 'Letter'],
  [419.5, 595.3, 'A5'],
  [841.9, 595.3, 'A4 landscape'],
  [792, 612, 'Letter landscape'],
  [1008, 612, 'Legal landscape'],
  [1190.6, 841.9, 'A3 landscape'],
]

export function inferPage(widthPx: number, margins: { top: number; right: number; bottom: number; left: number }): PageSetup {
  const wPt = widthPx / PX_PER_PT
  const hit = SIZES.find(([w]) => Math.abs(w - wPt) <= 3)
  // unknown width: keep the A4 proportions, turned on its side when the page is wide
  const hPt = hit ? hit[1] : wPt > 700 ? wPt / 1.414 : wPt * 1.414
  const hPx = hPt * PX_PER_PT
  return {
    wPx: widthPx, hPx, wMm: widthPx * MM_PER_PX, hMm: hPx * MM_PER_PX, ...margins, name: hit ? hit[2] : 'Custom',
  }
}

/** Reads the page setup from a rendered Google Docs export. */
export function readPageSetup(d: Document): PageSetup {
  const cs = d.defaultView!.getComputedStyle(d.body)
  const px = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
  const margins = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
  const max = cs.maxWidth === 'none' ? 0 : px(cs.maxWidth)
  // no max-width: the document fills the frame, so fall back to a Letter-wide page like Google's default
  const width = max ? max + margins.left + margins.right : 816
  return inferPage(width, margins)
}
