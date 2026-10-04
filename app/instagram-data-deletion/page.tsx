import { use } from "react";

// Where Meta points someone who asked for their Instagram data to be
// deleted (phase54). Frank deletes it as the request arrives, so the
// answer is always that it's done.
export default function InstagramDataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = use(searchParams);
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">Your Instagram data is deleted</h1>
        <p className="sub">
          Frank has deleted what it held about your Instagram account: its username, profile picture, follower and post
          counts, and the access that let Frank read your posts. Frank never stored your posts themselves.
          {typeof code === "string" && ` Confirmation code: ${code}.`}
        </p>
      </div>
    </div>
  );
}
