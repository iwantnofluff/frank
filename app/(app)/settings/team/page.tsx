import { redirect } from "next/navigation";

// The old address, from before Settings' left menu.
export default function OldSettingsPage() {
  redirect("/settings/team/users");
}
