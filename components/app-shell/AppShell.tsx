import { NavRail } from "./NavRail";
import { Topbar } from "./Topbar";
import { AgencyTheme } from "./AgencyTheme";

export function AppShell({
  children,
  userInitials,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userInitials: string;
  userName: string | null;
  userEmail: string;
}) {
  return (
    <div className="app">
      <AgencyTheme />
      <NavRail userInitials={userInitials} userName={userName} userEmail={userEmail} />
      <div className="main">
        <Topbar />
        <div className="view on">{children}</div>
      </div>
    </div>
  );
}
