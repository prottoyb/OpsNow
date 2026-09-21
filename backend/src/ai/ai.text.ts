/**
 * Removes control characters, keeping newline (10) and tab (9): C0 controls,
 * DEL and the C1 range (0x7F-0x9F), plus the Unicode line/paragraph
 * separators (0x2028/0x2029). Done with char codes rather than a regex
 * literal so the source contains no raw control bytes.
 */
export function stripControlChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isControl =
      (code < 0x20 && code !== 0x09 && code !== 0x0a) ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029;
    if (!isControl) {
      out += text[i];
    }
  }
  return out;
}
