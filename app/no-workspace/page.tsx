// An address under beingfrank.app that isn't an agency (the proxy shows
// this, with a 404, for agencyname.beingfrank.app when no agency has that
// name).
export default function NoWorkspacePage() {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">No workspace here</h1>
        <p className="sub">
          There&rsquo;s no Frank workspace at this address. Check the link you were given, or ask your agency for its
          Frank address.
        </p>
      </div>
    </div>
  );
}
