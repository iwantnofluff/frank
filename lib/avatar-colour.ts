const AVATAR_COLOURS = [
  "#007BFF",
  "#2BB65B",
  "#FF8A00",
  "#DD2A7B",
  "#6228D7",
  "#00547F",
];

export function avatarColour(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLOURS.length;
  return AVATAR_COLOURS[hash];
}
