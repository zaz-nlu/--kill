const files = import.meta.glob('../assets/evidence/*.webp', { eager: true, import: 'default' }) as Record<string, string>

// `E21` -> url of src/assets/evidence/E21.webp; testimony and quotes have no picture.
export function resolveEvidenceImage(id: string): string | null {
  return files[`../assets/evidence/${id}.webp`] ?? null
}
