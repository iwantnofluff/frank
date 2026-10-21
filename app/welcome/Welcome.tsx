"use client";

import { useEffect, useState } from "react";
import { useAddressAvailable, useEmailMyAddresses, useFindWorkspace, useSignUp } from "@/hooks/use-signup";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";
import { errorMessage } from "@/lib/errors";
import { BRAND } from "@/lib/brand";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "beingfrank.app";

// "Our Studio" → "our-studio": the address offered until it's typed over.
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "");

// An agency's own address, from wherever this page is (app.beingfrank.app,
// beingfrank.app, or frank.localhost:3000 locally).
function agencyUrl(subdomain: string, path: string) {
  const host = window.location.host.replace(/^(www|app)\./, "");
  return `${window.location.protocol}//${subdomain}.${host}${path}`;
}

// The website (direct instruction: the front door wears its header), at the
// bare domain once the DNS sends it there.
const WEBSITE = `https://${ROOT}`;
const COMPANY = [
  { label: "About", href: "/company/about" },
  { label: "Blog", href: "/company/blog" },
  { label: "Careers", href: "/company/careers" },
  { label: "Updates", href: "/company/updates" },
];
const NAV = [
  { label: "Integrations", href: "/integrations" },
  { label: "Customers", href: "/customers" },
  { label: "Pricing", href: "/pricing" },
];

type Mode = "signup" | "signin" | "forgot";

// The website's header, as its Framer design has it: the logo home, the
// site's sections, and Sign In and Try Frank Free, which switch this page.
function Header({ onMode }: { onMode: (m: Mode) => void }) {
  const [companyOpen, setCompanyOpen] = useState(false);
  return (
    <header className="fd-head">
      <div className="fd-headin">
        <a className="fd-logo" href={WEBSITE} aria-label="Frank home">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own SVG */}
          <img src={BRAND.headerStrapline} alt="Frank, faster approvals" />
        </a>
        <nav className="fd-nav" aria-label="Website">
          <div className="fd-drop" onMouseLeave={() => setCompanyOpen(false)}>
            <button type="button" className="fd-link" aria-expanded={companyOpen} onClick={() => setCompanyOpen((o) => !o)}>
              Company
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {companyOpen && (
              <div className="fd-menu">
                {COMPANY.map((c) => (
                  <a key={c.href} href={`${WEBSITE}${c.href}`}>
                    {c.label}
                  </a>
                ))}
              </div>
            )}
          </div>
          {NAV.map((n) => (
            <a key={n.href} className="fd-link" href={`${WEBSITE}${n.href}`}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="fd-actions">
          <button type="button" className="fd-link" onClick={() => onMode("signin")}>
            Sign In
          </button>
          <button type="button" className="fd-cta" onClick={() => onMode("signup")}>
            Try Frank Free
          </button>
        </div>
      </div>
    </header>
  );
}

const TITLES: Record<Mode, { title: string; sub: string }> = {
  signup: { title: "Sign Up", sub: "Start your 30-day free trial. No card needed." },
  signin: { title: "Sign In", sub: "Enter your workspace address to sign in." },
  forgot: { title: "Find Your Workspace", sub: "We\u2019ll email you the address of every workspace you belong to." },
};

// Sign up to start; ?signin opens on Sign in (direct instruction: the
// website's Log In button links here). In the website's Sign Up design:
// a light serif heading, a line under it, and a soft grey card with a dark
// full-width button and a switch to the other.
export function Welcome({ startOnSignIn = false }: { startOnSignIn?: boolean }) {
  const [mode, setMode] = useState<Mode>(startOnSignIn ? "signin" : "signup");
  // Once signed up, there's only "check your email" left: no switching.
  const [signedUp, setSignedUp] = useState(false);
  const { title, sub } = signedUp ? { title: "Check Your Email", sub: "One last step to your workspace." } : TITLES[mode];
  return (
    <>
      <Header onMode={(m) => !signedUp && setMode(m)} />
      <main className="fd-main">
        <h1 className="fd-title">{title}</h1>
        <p className="fd-sub">{sub}</p>
        <div className="fd-card">
          {mode === "signup" ? (
            <SignUp onDone={() => setSignedUp(true)} />
          ) : mode === "signin" ? (
            <SignIn onForgot={() => setMode("forgot")} />
          ) : (
            <Forgot />
          )}
          {!signedUp && (
            <button
              type="button"
              className="fd-switch"
              onClick={() => setMode(mode === "signup" ? "signin" : mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signup" ? "Already have an account?" : mode === "signin" ? "New to Frank? Try it free" : "Back to Sign In"}
            </button>
          )}
        </div>
        <p className="fd-foot">
          <a href="/privacy">Privacy policy</a>
        </p>
      </main>
    </>
  );
}

function SignUp({ onDone }: { onDone: () => void }) {
  const signUp = useSignUp();
  const [agencyName, setAgencyName] = useState("");
  const [typedAddress, setAddress] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Offered from the agency's name until typed over.
  const subdomain = typedAddress ?? slug(agencyName);
  // Asked once typing pauses.
  const [asked, setAsked] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setAsked(subdomain), 350);
    return () => clearTimeout(t);
  }, [subdomain]);
  const { data: check } = useAddressAvailable(asked);
  const checked = check && asked === subdomain ? check : null;

  if (signUp.data) {
    return (
      <div className="signdone">
        <p className="sub">
          We sent a link to {email}. Open it to confirm your email and go to your workspace at{" "}
          <b>{signUp.data.address}</b>.
        </p>
        <p className="sub">
          Your 30-day free trial has started. Invite your team, add a client and send your first post for approval, with
          no card needed.
        </p>
      </div>
    );
  }

  return (
    <form
      className="signform"
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
          setProblem(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`);
          return;
        }
        setProblem(null);
        signUp.mutate({ agencyName, subdomain, firstName, lastName, email, password }, { onSuccess: onDone });
      }}
    >
      <label className="authfield">
        <span>Workspace name</span>
        <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} autoComplete="organization" />
      </label>
      <label className="authfield">
        <span>Your address</span>
        <span className="subfield">
          <input
            required
            aria-label="Your address"
            value={subdomain}
            onChange={(e) => setAddress(clean(e.target.value))}
          />
          <span>.{ROOT}</span>
        </span>
        {checked && (
          <small className={checked.available ? "addr-ok" : "addr-bad"}>
            {checked.available ? "Available" : checked.problem}
          </small>
        )}
      </label>
      <div className="frow">
        <label className="authfield">
          <span>First name</span>
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
        </label>
        <label className="authfield">
          <span>Last name</span>
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </label>
      </div>
      <label className="authfield">
        <span>Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="authfield">
        <span>Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {(problem || signUp.error) && <p className="autherr">{problem ?? errorMessage(signUp.error, "Couldn't sign you up")}</p>}
      <button className="btn primary" type="submit" disabled={signUp.isPending || checked?.available === false}>
        {signUp.isPending ? "Setting up…" : "Start Free Trial"}
      </button>
      <p className="sub signsmall">Free for 30 days, no card needed. Then choose a plan, or it becomes read-only.</p>
    </form>
  );
}

function SignIn({ onForgot }: { onForgot: () => void }) {
  const find = useFindWorkspace();
  const [address, setAddress] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <form
      className="signform"
      onSubmit={async (e) => {
        e.preventDefault();
        setMissing(false);
        const found = await find.mutateAsync(address).catch(() => null);
        if (found) window.location.href = agencyUrl(found, "/login");
        else setMissing(true);
      }}
    >
      <label className="authfield">
        <span>Your workspace URL</span>
        <span className="subfield">
          <input required aria-label="Your workspace URL" value={address} onChange={(e) => setAddress(clean(e.target.value))} />
          <span>.{ROOT}</span>
        </span>
      </label>
      {missing && <p className="autherr">There&rsquo;s no Frank workspace at {address}.{ROOT}.</p>}
      <button className="btn primary" type="submit" disabled={find.isPending}>
        {find.isPending ? "Finding it…" : "Continue"}
      </button>
      <button type="button" className="authlink linkish" onClick={onForgot}>
        Forgot your address?
      </button>
    </form>
  );
}

function Forgot() {
  const send = useEmailMyAddresses();
  const [email, setEmail] = useState("");
  if (send.isSuccess) {
    return (
      <div className="signdone">
        <b>Check your email</b>
        <p className="sub">If {email} has a Frank account, we&rsquo;ve sent it the address of every workspace it belongs to.</p>
      </div>
    );
  }
  return (
    <form
      className="signform"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate(email);
      }}
    >
      <p className="sub">Enter your email and we&rsquo;ll send you your workspace addresses.</p>
      <label className="authfield">
        <span>Email</span>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      {send.error && <p className="autherr">{errorMessage(send.error, "Couldn't send it")}</p>}
      <button className="btn primary" type="submit" disabled={send.isPending}>
        {send.isPending ? "Sending…" : "Email My Addresses"}
      </button>
    </form>
  );
}
