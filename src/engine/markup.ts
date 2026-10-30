// Weak points inside a statement are written {{id:phrase}}. The id ties the phrase to the present step whose `target` it is.

export interface Seg { text: string; mark?: string }

const MARK = /\{\{([\w-]+):([^}]*)\}\}/g

export function parseMarked(text: string): Seg[] {
  const out: Seg[] = []
  let at = 0
  for (const m of text.matchAll(MARK)) {
    const i = m.index ?? 0
    if (i > at) out.push({ text: text.slice(at, i) })
    out.push({ text: m[2], mark: m[1] })
    at = i + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

export function plainText(text: string): string {
  return text.replace(MARK, (_all, _id, phrase: string) => phrase)
}
