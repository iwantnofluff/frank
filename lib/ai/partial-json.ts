// Reading a JSON object while it's still being written (Design with Frank
// shows its direction as Frank writes it, direct instruction): the
// longest prefix that can be closed into valid JSON, closed. Whatever was
// half-written at the end (a key with no value yet, a number cut short)
// is dropped; a string cut short is kept as far as it goes.

// The open brackets at the end of this text, and whether it ends inside a
// string.
function openState(text: string): { stack: string[]; inString: boolean } {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  return { stack, inString };
}

function close(text: string): string {
  const { stack, inString } = openState(text);
  // A string cut off partway through an escape loses the backslash.
  let out = inString ? `${text.replace(/\\(u[0-9a-fA-F]{0,3})?$/, "")}"` : text;
  out = out.replace(/[\s,]+$/, "");
  return out + stack.reverse().map((b) => (b === "{" ? "}" : "]")).join("");
}

export function parsePartialJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let body = text.slice(start);
  const fenceEnd = body.indexOf("```");
  if (fenceEnd >= 0) body = body.slice(0, fenceEnd);
  // From the whole text back, cutting at each comma or opening bracket,
  // until a prefix closes cleanly.
  let cut = body.length;
  for (let tries = 0; tries < 400 && cut > 0; tries++) {
    try {
      return JSON.parse(close(body.slice(0, cut)));
    } catch {
      const prev = Math.max(body.lastIndexOf(",", cut - 1), body.lastIndexOf("{", cut - 1), body.lastIndexOf("[", cut - 1));
      if (prev < 0) return null;
      // Keep an opening bracket itself; drop a comma.
      cut = body[prev] === "," ? prev : prev + 1;
      if (cut === body.length) cut = prev;
    }
  }
  return null;
}
