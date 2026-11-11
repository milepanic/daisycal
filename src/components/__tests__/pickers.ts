/** Test helpers for DatePicker and TimeInput. */
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'

type Wrapper = VueWrapper | DOMWrapper<Element>

/** Types into a TimeInput and leaves it (which commits the value). */
export async function typeTime(w: Wrapper, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`)
  await input.setValue(value)
  await input.trigger('blur')
}

export function timeValue(w: Wrapper, label: string): string {
  return (w.find(`input[aria-label="${label}"]`).element as HTMLInputElement).value
}

/** Opens the DatePicker labelled `label`, pages to the month of `key` and clicks that day. */
export async function pickDate(w: Wrapper, label: string, key: string) {
  await w.find(`button[aria-label^="${label}:"]`).trigger('click')
  const picker = () => w.find('[data-testid="date-picker"]')
  for (let i = 0; i < 36 && !picker().find(`[data-date="${key}"]`).exists(); i++) {
    const first = picker().find('[data-date]').attributes('data-date')!
    const dir = key < first ? 'Previous month' : 'Next month'
    const btn = picker()
      .findAll('button')
      .find((b) => b.text() === dir)!
    await btn.trigger('click')
  }
  await picker().find(`[data-date="${key}"]`).trigger('click')
}
