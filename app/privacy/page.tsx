import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy · Frank",
  description: "How Frank, by No Fluff Pvt Ltd, collects, uses and protects personal data.",
};

// Frank's privacy policy (direct instruction): public on beingfrank.app and
// every agency's address, as Meta's App Review and India's DPDP Act need.
// Every claim here matches what the code does; change both together.
export default function PrivacyPage() {
  return (
    <div className="authwrap scroll">
      <article className="authcard legal">
        <div className="mark authmark">F</div>
        <div className="welcomehead">
          <h1 className="h1">Privacy policy</h1>
          <p className="sub">Last updated 7 October 2026</p>
        </div>

        <p>
          Frank is a content planning and approval tool for marketing agencies and their clients. It is run by No Fluff
          Pvt Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;), 501 Labernam, 17 D&rsquo;Monte Park Road, Bandra West, Mumbai
          400050, Maharashtra, India. This policy explains what personal data Frank collects, why, who it is shared
          with, and the choices you have.
        </p>

        <h2>Who is responsible for your data</h2>
        <p>
          We are responsible for the accounts people use to sign in to Frank. The content an agency puts into Frank (its
          clients&rsquo; briefs, artwork, captions and comments) belongs to that agency, which decides what goes in and
          who sees it. We process that content on the agency&rsquo;s behalf, to provide Frank to them.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Account details:</b> your name, email address, password (stored only as a secure hash by our
            authentication provider), profile photo if you add one, and your role in an agency.
          </li>
          <li>
            <b>Agency details:</b> the agency&rsquo;s name, web address, logo and settings, and the names and logos of
            its clients.
          </li>
          <li>
            <b>Content:</b> files you upload (images, videos, documents), briefs, captions, comments and approvals.
          </li>
          <li>
            <b>Review link visitors:</b> the name you type before commenting on a shared post, and your comments.
          </li>
          <li>
            <b>Billing:</b> the agency&rsquo;s plan and payment status. Card and payment details are handled by our
            payment provider, Paddle, and never reach us.
          </li>
          <li>
            <b>Usage of AI features:</b> a record of each AI request (who made it, which AI model and when), so
            the agency&rsquo;s monthly limit can be applied. The record doesn&rsquo;t include the content.
          </li>
          <li>
            <b>Connected Instagram accounts:</b> see the next section.
          </li>
        </ul>

        <h2>Instagram data</h2>
        <p>
          An agency can connect a client&rsquo;s Instagram Business or Creator account, through Instagram&rsquo;s own
          sign-in, so Frank can show planned posts among the account&rsquo;s real ones. Frank only reads; it never
          posts, comments, sends messages or changes anything on Instagram. Frank never sees the account&rsquo;s
          password.
        </p>
        <ul>
          <li>
            <b>What we keep:</b> the account&rsquo;s Instagram IDs, username, name, profile picture address, follower
            and post counts, and who connected it and when. The access token Instagram issues is encrypted (AES-256-GCM)
            before it is stored, and only our servers can read it.
          </li>
          <li>
            <b>What we don&rsquo;t keep:</b> posts. They are read from Instagram when someone opens the preview, held
            in our server&rsquo;s memory for up to 10 minutes, then dropped. Images load from Instagram directly.
          </li>
          <li>
            <b>Who sees it:</b> only the agency that connected the account and that client, inside Frank.
          </li>
          <li>
            <b>Removing it:</b> an agency Owner or Admin can disconnect the account in Frank at any time. You can also
            remove Frank in Instagram&rsquo;s settings (Apps and websites); Instagram then tells us, and we delete the
            account&rsquo;s data and token straight away. A deletion request made through Meta is confirmed at{" "}
            <a href="/instagram-data-deletion">beingfrank.app/instagram-data-deletion</a>.
          </li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To provide Frank: sign-in, planning, reviews, approvals and comments.</li>
          <li>To send emails Frank needs to: invitations, sign-up confirmations, password resets and notifications.</li>
          <li>To run AI features when someone asks for them, such as drafting copy or checking a post.</li>
          <li>To bill the agency for its plan.</li>
          <li>To keep Frank secure and working, and to fix problems.</li>
        </ul>
        <p>
          We do not sell personal data, use it for advertising, or share it with anyone except the service providers
          below. Frank has no advertising or analytics trackers.
        </p>

        <h2>Service providers</h2>
        <p>These companies process data for us, only to provide their service to Frank:</p>
        <ul>
          <li><b>Vercel</b>: hosts the Frank app.</li>
          <li><b>Supabase</b>: stores Frank&rsquo;s database and uploaded files, and handles sign-in.</li>
          <li>
            <b>Anthropic, OpenAI and Google</b>: generate AI results. Only the content needed for the request you made
            is sent, at the moment you make it.
          </li>
          <li><b>Resend</b>: sends Frank&rsquo;s emails.</li>
          <li><b>Paddle</b>: takes payments as our reseller, under its own privacy policy.</li>
          <li><b>Meta (Instagram)</b>: provides the connected account&rsquo;s profile and posts.</li>
        </ul>
        <p>
          Some of these providers process data outside India, including in the United States. We use them only for the
          purposes in this policy.
        </p>

        <h2>How long we keep it</h2>
        <ul>
          <li>Account and agency data: while the agency uses Frank, and deleted on request after that.</li>
          <li>
            An approved post&rsquo;s artwork: removed 7 days after its live date. Its comments and captions stay with
            the agency&rsquo;s records.
          </li>
          <li>Instagram data: until the account is disconnected or a deletion request arrives, as above.</li>
        </ul>

        <h2>Security</h2>
        <p>
          All connections to Frank use HTTPS. Each agency&rsquo;s data is kept separate by access rules in the
          database, so one agency can never read another&rsquo;s. Files are private and reached only through
          short-lived links. Access tokens for connected accounts are encrypted.
        </p>

        <h2>Cookies and storage</h2>
        <p>
          Frank uses cookies only to keep you signed in. It also keeps a few things in your browser&rsquo;s storage,
          such as recent picture links, so pages load quickly; this is cleared when you sign out. There are no
          advertising or tracking cookies.
        </p>

        <h2>Your rights</h2>
        <p>
          Under India&rsquo;s Digital Personal Data Protection Act, 2023, you can ask to see the personal data we hold
          about you, correct or update it, or have it erased, and you can withdraw consent where we rely on it. You can
          also nominate someone to act for you. Content an agency holds about you may need to be requested through that
          agency. We reply within 30 days. If you are not satisfied, you can complain to the Data Protection Board of
          India.
        </p>

        <h2>Children</h2>
        <p>Frank is a business tool and is not meant for anyone under 18.</p>

        <h2>Changes</h2>
        <p>
          If we change this policy, we will update the date above, and tell agencies by email about any significant
          change.
        </p>

        <h2>Contact and grievances</h2>
        <p>
          For any question, request or complaint about your data, email{" "}
          <a href="mailto:raj@nofluff.in">raj@nofluff.in</a> or write to No Fluff Pvt Ltd, 501 Labernam, 17 D&rsquo;Monte
          Park Road, Bandra West, Mumbai 400050, Maharashtra, India.
        </p>
      </article>
    </div>
  );
}
