/** FNV-1a 32-bit hash (hex) of the trimmed script. Detects a voiceover made from an older script. */
export function scriptHash(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    const code = ch.codePointAt(0)!;
    // Hash each UTF-16 unit of the code point so astral characters are covered.
    for (const unit of code > 0xffff
      ? [Math.floor((code - 0x10000) / 0x400) + 0xd800, ((code - 0x10000) % 0x400) + 0xdc00]
      : [code]) {
      h ^= unit;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
