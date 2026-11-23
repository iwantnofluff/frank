// A review link's address (direct instruction: say whose and what it is):
// /review/<client>/<post or project>/<code>. Only the code opens it — the
// names are for reading, so a renamed client or post leaves the link
// working, and a link made before the names (/review/<code>) still does.
export function slugify(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function reviewLinkPath(token: string, client: string | null | undefined, title: string | null | undefined): string {
  const names = [slugify(client), slugify(title)].filter(Boolean);
  return ["/review", ...names, token].join("/");
}
