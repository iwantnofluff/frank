// Where Settings' X goes back to (direct instruction): the last page opened
// outside Workspace or Client Settings, kept for the tab.
export const SETTINGS_RETURN_KEY = "frank.settingsReturn";

export const isSettingsPath = (path: string) => /^\/settings(\/|$)|^\/clients\/[^/]+\/settings(\/|$)/.test(path);

export function rememberPage(path: string) {
  if (isSettingsPath(path)) return;
  try {
    sessionStorage.setItem(SETTINGS_RETURN_KEY, path);
  } catch {
    // No storage (a private window): the X goes to its fallback.
  }
}

export function settingsReturn(fallback: string): string {
  try {
    const saved = sessionStorage.getItem(SETTINGS_RETURN_KEY);
    if (saved && !isSettingsPath(saved)) return saved;
  } catch {
    // As above.
  }
  return fallback;
}
