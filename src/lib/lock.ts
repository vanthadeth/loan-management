// While a popup or sheet is open the page behind it must not scroll (see body.popup-open in styles.css).
let n = 0

export function lockScroll() {
  n++
  document.body.classList.add('popup-open')
  return () => {
    n = Math.max(0, n - 1)
    if (!n) document.body.classList.remove('popup-open')
  }
}
