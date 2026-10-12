import { redirect } from "next/navigation";

// Notifications became a section of Preferences (direct instruction); its
// old address still lands there.
export default function NotificationsSettingsRedirect() {
  redirect("/settings/general/preferences");
}
