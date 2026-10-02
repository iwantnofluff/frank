import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Frank",
  description: "Content review and approval for agencies.",
};

// Where people write to before there's a marketing site. Change here.
const CONTACT_EMAIL = "hello@beingfrank.app";

// beingfrank.app until the marketing site exists (decided directly: a
// holding page — the logo, one line, and a contact). The proxy shows this
// for every path on the bare domain; agencies sign in at their own
// agencyname.beingfrank.app.
export default function WelcomePage() {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">Frank</h1>
        <p className="sub">Content review and approval for agencies. Coming soon.</p>
        <a className="btn primary" href={`mailto:${CONTACT_EMAIL}`} style={{ textAlign: "center" }}>
          {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
