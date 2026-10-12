// While a menu or dropdown is open, the page behind it is darkened and blurred (the #scrim element in index.html).
// Popups inside a sheet skip it: the sheet's own backdrop already does the job.
let open = 0

export function showScrim() {
  open++
  document.body.classList.add('menu-open')
  return () => {
    open = Math.max(0, open - 1)
    if (!open) document.body.classList.remove('menu-open')
  }
}
