import { PLANS, planById } from "@/lib/plans";

// Costs and Monitoring (direct instruction, 2 Nov 2026): a note for the
// platform admin on how Frank's running costs work and where to watch
// them, from the conversation about launching. Static: figures are
// approximate and dated, so the page says when it was written.

function Row({ title, note, children }: { title: string; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <b>{title}</b>
        {children && <span>{children}</span>}
      </span>
      {note && <span className="srow-note">{note}</span>}
    </div>
  );
}

export default function AdminCostsGuidePage() {
  const starter = planById("starter")!;
  return (
    <div className="adminguide">
      <div className="adminhead">
        <div>
          <h1 className="h1">Costs and Monitoring</h1>
          <p className="sub">
            How Frank&rsquo;s running costs work, and where to keep an eye on them. Written 2 Nov 2026. Prices are
            approximate: check each provider&rsquo;s pricing page before relying on a figure.
          </p>
        </div>
      </div>

      <div className="msection-h">Who Pays for What</div>
      <p className="msection-d">
        Agencies pay Frank a plan price through Paddle. Frank pays every service below. No agency or client ever has
        an account with any of them.
      </p>
      <table className="admintbl">
        <thead>
          <tr>
            <th>Service</th>
            <th>What it does</th>
            <th>How it bills</th>
            <th>Now</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="admintbl-name">Supabase</td>
            <td>The database, sign-ins and every uploaded file</td>
            <td>One project, monthly, plus usage above what the plan includes</td>
            <td>Pro</td>
          </tr>
          <tr>
            <td className="admintbl-name">Vercel</td>
            <td>Runs the website and the app</td>
            <td>Per seat a month, plus usage above what the plan includes</td>
            <td>Hobby. Move to Pro before launch: Hobby doesn&rsquo;t allow commercial use</td>
          </tr>
          <tr>
            <td className="admintbl-name">Anthropic (Claude)</td>
            <td>Frank&rsquo;s AI: drafting, proofreading, checks, Design with Frank</td>
            <td>Per token used, prepaid credit or a monthly invoice</td>
            <td>No Fluff&rsquo;s account. To move to Frank&rsquo;s own (see Launch Checklist)</td>
          </tr>
          <tr>
            <td className="admintbl-name">OpenAI, Google</td>
            <td>Only when a workspace picks ChatGPT or Gemini</td>
            <td>Per token used</td>
            <td>Optional</td>
          </tr>
          <tr>
            <td className="admintbl-name">Paddle</td>
            <td>Takes payments, and handles sales tax as the seller of record</td>
            <td>A fee on each payment</td>
            <td>Sandbox (test mode)</td>
          </tr>
          <tr>
            <td className="admintbl-name">Resend</td>
            <td>Frank&rsquo;s emails: invites, notifications, resets</td>
            <td>Free up to a monthly number of emails, then a monthly plan</td>
            <td>In use</td>
          </tr>
        </tbody>
      </table>

      <div className="msection-h">AI</div>
      <p className="msection-d">
        Every workspace&rsquo;s AI runs on Frank&rsquo;s one key. Anthropic bills Frank for every word sent and
        received. Each plan&rsquo;s monthly allowance caps what one workspace can cost; when it runs out, Frank says
        so and it resets on the 1st. Each request&rsquo;s tokens are recorded (since 1.64), so real costs can be
        measured.
      </p>
      <section className="panel" aria-label="AI allowances">
        {PLANS.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            note={`${p.aiRequests.toLocaleString("en")} requests a month`}
          >
            {p.monthly === null ? "Custom price; add more in the workspace's override" : p.monthly === 0 ? "The 30-day trial" : `$${p.monthly} a month`}
          </Row>
        ))}
      </section>
      <p className="msection-d">What one request costs Frank, roughly:</p>
      <table className="admintbl">
        <thead>
          <tr>
            <th>Model</th>
            <th>Per million tokens (in / out)</th>
            <th>Typical request</th>
            <th>Heavy request (images)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="admintbl-name">Claude Opus 5.5 (the default)</td>
            <td>$4 / $20</td>
            <td>~$0.05</td>
            <td>~$0.20</td>
          </tr>
          <tr>
            <td className="admintbl-name">Claude Sonnet 5.5</td>
            <td>$2 / $10</td>
            <td>~$0.025</td>
            <td>~$0.10</td>
          </tr>
          <tr>
            <td className="admintbl-name">Claude Haiku 5.5</td>
            <td>$0.10 / $0.50</td>
            <td>~$0.001</td>
            <td>under $0.01</td>
          </tr>
        </tbody>
      </table>
      <p className="msection-d" style={{ marginTop: 8 }}>
        At 100 workspaces, if every one used its whole allowance on Opus, the bill would be a few thousand dollars a
        month. Most use a fraction, so expect a few hundred. The allowances keep each plan&rsquo;s worst case well
        under its price: Starter&rsquo;s {starter.aiRequests} requests at $0.10 is ${starter.aiRequests / 10} against ${starter.monthly}. The risk is free
        trials, which bring no revenue: keep their allowance small.
      </p>
      <section className="panel" aria-label="AI controls">
        <Row title="Allowances per plan">Set in Frank, above. Changing them is a small change to Frank itself.</Row>
        <Row title="A monthly spend limit">
          Set in the Anthropic console (and OpenAI and Google, if used), so a bug or one heavy user can&rsquo;t run up
          a surprise bill.
        </Row>
        <Row title="Usage tier">
          New Anthropic accounts are limited in requests per minute. The limit rises as total spend grows, or ask
          Anthropic to raise it.
        </Row>
        <Row title="Separate workspaces for live and staging">
          In the Anthropic console, so test traffic stays out of the live bill.
        </Row>
      </section>

      <div className="msection-h">Supabase</div>
      <p className="msection-d">
        Frank is one Supabase project with one database. Every workspace&rsquo;s posts, comments and files sit in the
        same tables, each row marked with its workspace, and the database&rsquo;s rules keep every workspace to its
        own rows. Supabase doesn&rsquo;t see workspaces, only one project getting bigger, so how each workspace is
        doing is watched here in Frank Admin.
      </p>
      <table className="admintbl">
        <thead>
          <tr>
            <th>What</th>
            <th>Included in Pro</th>
            <th>Above that</th>
            <th>What drives it in Frank</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="admintbl-name">File storage</td>
            <td>~100 GB</td>
            <td>~$0.02 per GB a month</td>
            <td>Artwork and videos workspaces upload</td>
          </tr>
          <tr>
            <td className="admintbl-name">Downloads</td>
            <td>~250 GB a month</td>
            <td>~$0.09 per GB</td>
            <td>People viewing those files, videos most of all</td>
          </tr>
          <tr>
            <td className="admintbl-name">Sign-ins</td>
            <td>100,000 people a month</td>
            <td>A tiny amount each</td>
            <td>No concern at 100 workspaces</td>
          </tr>
          <tr>
            <td className="admintbl-name">Database size</td>
            <td>~8 GB</td>
            <td>A small amount per GB</td>
            <td>Text: Frank uses little</td>
          </tr>
          <tr>
            <td className="admintbl-name">Server size</td>
            <td>A small starter server</td>
            <td>About $15 to $60 or more a month per step up</td>
            <td>How busy Frank is at once</td>
          </tr>
        </tbody>
      </table>
      <p className="msection-d" style={{ marginTop: 8 }}>
        Pro is about $25 a month. Expect roughly $50 to $300 a month at 100 workspaces, mostly downloads (a client
        watching a 200 MB Reel ten times downloads 2 GB). That&rsquo;s small against the revenue, and usually less
        than the AI.
      </p>
      <section className="panel" aria-label="Supabase spend cap">
        <Row title="Turn off the spend cap before launch" note="Important">
          Pro&rsquo;s spend cap is on by default. With it on, going over an allowance doesn&rsquo;t cost more: Supabase
          slows or stops parts of the service instead, which paying customers would feel. Turn it off in Supabase&rsquo;s
          billing settings and set a billing alert, so going over costs a little rather than causing an outage.
        </Row>
      </section>

      <div className="msection-h">Monitoring</div>
      <p className="msection-d">Where to look, and how often.</p>
      <table className="admintbl">
        <thead>
          <tr>
            <th>Where</th>
            <th>What it tells you</th>
            <th>How often</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="admintbl-name">Frank Admin, Overview</td>
            <td>Revenue, sign-ups, and who needs a look: failed payments, trials ending, near a limit, gone quiet</td>
            <td>Weekly</td>
          </tr>
          <tr>
            <td className="admintbl-name">Supabase, Usage</td>
            <td>Storage, downloads and server use against what Pro includes</td>
            <td>Monthly, or when an alert comes</td>
          </tr>
          <tr>
            <td className="admintbl-name">Supabase, Reports</td>
            <td>Whether the database is working too hard. High CPU or memory for days means a bigger server.</td>
            <td>Monthly</td>
          </tr>
          <tr>
            <td className="admintbl-name">Vercel, Usage</td>
            <td>Website traffic and server time</td>
            <td>Monthly</td>
          </tr>
          <tr>
            <td className="admintbl-name">Anthropic console, Usage</td>
            <td>The AI bill, by day and model</td>
            <td>Monthly</td>
          </tr>
          <tr>
            <td className="admintbl-name">Error monitoring (not set up yet)</td>
            <td>Something broke for a customer, before they say so. Sentry is the usual choice; an uptime check emails
              if the site goes down. Both have free tiers.</td>
            <td>By email, as it happens</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
