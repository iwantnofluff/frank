// Launch Checklist (direct instruction, 2 Nov 2026): what's left before
// Frank takes real money, and moving its AI to its own Claude account.
// Static: each item's state is as of the date the page gives, updated by
// hand as items are done.

type State = "done" | "todo" | "yours";

const TAG: Record<State, { label: string; tone: string }> = {
  done: { label: "Done", tone: "green" },
  todo: { label: "To do", tone: "amber" },
  yours: { label: "In your dashboards", tone: "blue" },
};

function Item({ state, title, children }: { state: State; title: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="sl">
        <b>{title}</b>
        <span>{children}</span>
      </span>
      <span className={`tag ${TAG[state].tone}`}>{TAG[state].label}</span>
    </div>
  );
}

export default function AdminLaunchGuidePage() {
  return (
    <div className="adminguide">
      <div className="adminhead">
        <div>
          <h1 className="h1">Launch Checklist</h1>
          <p className="sub">
            What&rsquo;s left before Frank takes real money, as of 2 Nov 2026. Sign-up, the free trial, plans and
            limits, Paddle&rsquo;s checkout, read-only after the trial, this admin area and the privacy policy are
            already built.
          </p>
        </div>
      </div>

      <div className="msection-h">Before Taking Money</div>
      <p className="msection-d">Start with Paddle: its review takes days and depends on the website and terms.</p>
      <section className="panel" aria-label="Before taking money">
        <Item state="yours" title="Paddle in Live mode">
          Live and staging still bill through Paddle&rsquo;s sandbox. Paddle reviews the domain and website before
          approving live payments. Then the live keys, client token and webhook secret go into Vercel&rsquo;s
          production settings, and live is redeployed.
        </Item>
        <Item state="todo" title="Terms of Service and a refund policy">
          Neither page exists yet, and Paddle needs both, plus prices on the website. The privacy policy is done.
        </Item>
        <Item state="done" title="AI allowances per plan">
          Free 30, Starter 150, Growth 400, Agency 1,000 requests a month, and the newer, cheaper Claude models (1.64).
        </Item>
        <Item state="yours" title="AI spend limits">
          A monthly limit in the Anthropic console, and in OpenAI and Google if ChatGPT and Gemini stay on offer.
        </Item>
        <Item state="done" title="Supabase on Pro">Done.</Item>
        <Item state="yours" title="Supabase spend cap off, billing alert on">
          See Costs and Monitoring: with the cap on, going over an allowance slows or stops the service.
        </Item>
        <Item state="yours" title="Vercel on Pro">Hobby doesn&rsquo;t allow commercial use.</Item>
        <Item state="todo" title="Sign-up emails through Resend">
          Supabase&rsquo;s built-in email for confirmations and password resets sends only a few an hour. Point it at
          Resend in Supabase&rsquo;s Auth settings.
        </Item>
        <Item state="todo" title="Test workspaces off live">
          Raj Test 2 and others. Keep Frank Review until Meta&rsquo;s review is done, and mark it Internal (on its
          page in Workspaces) so it stays out of the figures.
        </Item>
        <Item state="done" title="Workspaces can't change their own plan">
          Found 2 Nov 2026: an Owner could set their own plan, limits and trial through the API without paying. Closed
          by phase129 (live needs it run).
        </Item>
      </section>

      <div className="msection-h">Soon After</div>
      <p className="msection-d">Not needed to take money, but worth doing in the first weeks.</p>
      <section className="panel" aria-label="Soon after">
        <Item state="todo" title="Error monitoring and an uptime check">
          So a crash or an outage reaches you before a customer does. Sentry, or similar, is a new service for Frank.
        </Item>
        <Item state="todo" title="A support route">
          A help email or chat, and a welcome email series for new sign-ups (Resend can send it).
        </Item>
        <Item state="yours" title="Meta app review">
          For the Instagram feed only. Frank can launch without it.
        </Item>
        <Item state="todo" title="Client comment sorting and the AI allowance">
          Every client comment is sorted by AI and counts as a request, so a busy free trial could use its 30 on
          comments alone. Decide: stop counting them, or always run them on Haiku 5.5.
        </Item>
      </section>

      <div className="msection-h">Frank&rsquo;s Own Claude Account</div>
      <p className="msection-d">
        Frank&rsquo;s AI runs on No Fluff&rsquo;s Anthropic account today. Moving it takes about half an hour, with
        Claude doing the Vercel part.
      </p>
      <section className="panel" aria-label="Frank's own Claude account">
        <Item state="yours" title="1. A new organisation called Frank">
          In the Anthropic console, with Frank&rsquo;s own card or invoicing. Inside it, two workspaces: Production and
          Staging.
        </Item>
        <Item state="yours" title="2. A spend limit and an API key in each workspace">
          Keep the keys somewhere safe; each is shown once.
        </Item>
        <Item state="todo" title="3. The new keys into Vercel">
          For live and for staging, then redeploy, and check a real request works and is logged.
        </Item>
        <Item state="yours" title="4. Retire the old key">
          Once the new ones work, delete Frank&rsquo;s key from No Fluff&rsquo;s account. The same steps apply to
          OpenAI and Google if they stay.
        </Item>
      </section>
    </div>
  );
}
