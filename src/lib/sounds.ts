/**
 * Small UI sounds synthesized with the Web Audio API (no audio files to load).
 * Silently does nothing where audio is unavailable (tests, old browsers, blocked autoplay).
 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** One soft bell-like note: sine with a short attack and an exponential fade. */
function note(ac: AudioContext, freq: number, at: number, length: number, volume: number) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(gain).connect(ac.destination)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** Rising two-note "ding" (G5 → D6, a fifth apart) played when a task is completed. */
export function playCompleteSound() {
  const ac = audio()
  if (!ac) return
  try {
    const t = ac.currentTime
    note(ac, 783.99, t, 0.18, 0.12)
    note(ac, 1174.66, t + 0.08, 0.35, 0.1)
  } catch {
    // Audio is a nicety; never let it break completing a task.
  }
}
