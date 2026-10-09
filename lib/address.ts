// An agency's address (agencyname.beingfrank.app): the database's refusals,
// in words a person can act on (phase36, phase41).
export function addressError(message: string): string | null {
  if (message.includes("agencies_subdomain_format")) {
    return "That address isn't allowed: use 2–32 lower-case letters, numbers or hyphens, and not a reserved name like www or admin.";
  }
  if (message.includes("previously used by another agency")) return "That address belonged to another workspace, so it can't be used.";
  if (message.includes("duplicate") || message.includes("unique")) return "Another workspace already has that address.";
  return null;
}
