import { NavRail } from "./NavRail";
import { Topbar } from "./Topbar";

export function AppShell({
  children,
  userInitials,
}: {
  children: React.ReactNode;
  userInitials: string;
}) {
  return (
    <div className="app">
      <NavRail userInitials={userInitials} />
      <div className="main">
        <Topbar />
        <div className="view on">{children}</div>
      </div>
    </div>
  );
}
