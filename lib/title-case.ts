// Mirrors the database's title_case() (phase26_user_profiles.sql), which is
// what actually guarantees stored names are never lowercase — this copy
// only shows people the result before they submit.
const MINOR = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with"]);

// A capital at the start and after anything that isn't a letter or digit
// ("o'neil" -> "O'Neil", "smith-jones" -> "Smith-Jones") — the same rule as
// phase26b's title_case(). Only ever applied to an all-lowercase word.
function capitaliseParts(word: string) {
  return word.replace(/(^|[^\p{L}\p{N}])(\p{Ll})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

export function titleCase(input: string) {
  const words = input.trim().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && MINOR.has(w.toLowerCase())) return w.toLowerCase();
      if (w === w.toLowerCase()) return capitaliseParts(w);
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
