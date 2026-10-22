// A recording stand-in for the Web Audio API: enough to see what a bar schedules without any sound hardware.
export function fakeContext() {
  const started: { type: string; at: number }[] = []
  const param = () => ({
    value: 0,
    calls: [] as number[],
    setValueAtTime(_v: number, t: number) { this.calls.push(t); return this },
    linearRampToValueAtTime(_v: number, t: number) { this.calls.push(t); return this },
    exponentialRampToValueAtTime(_v: number, t: number) { this.calls.push(t); return this },
  })
  const node = (kind: string) => {
    const n: Record<string, unknown> = {
      kind,
      connect: () => n,
      disconnect: () => undefined,
      start: (t: number) => { started.push({ type: kind, at: t }) },
      stop: () => undefined,
      type: 'sine',
      buffer: null,
    }
    for (const p of ['gain', 'frequency', 'detune', 'Q', 'delayTime']) n[p] = param()
    return n
  }
  const ctx = {
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'),
    createDelay: () => node('delay'),
  }
  return { ctx: ctx as unknown as BaseAudioContext, started }
}
