import { AuthPanel } from "@/components/ui/AuthPanel";

// A suspended agency's address (phase37) — shown, with a 403, for every
// page there. Nothing has been deleted.
export default function WorkspacePausedPage() {
  return (
    <div className="authwrap">
      <AuthPanel title={<>This workspace is paused</>} sub={<>This Frank workspace has been paused. Nothing has been deleted. Contact the agency, or Frank, to have it turned back on.</>} />
    </div>
  );
}
