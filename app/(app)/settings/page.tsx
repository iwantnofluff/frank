import { redirect } from "next/navigation";
import { FIRST_SETTINGS_PAGE } from "@/lib/settings-nav";

export default function SettingsPage() {
  redirect(FIRST_SETTINGS_PAGE);
}
