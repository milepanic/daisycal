/** Lets click handlers ignore the click that the browser fires right after a pointer drag. */
let until = 0

export function markDragged(ms = 400) {
  until = Date.now() + ms
}

export function wasJustDragged(): boolean {
  return Date.now() < until
}
