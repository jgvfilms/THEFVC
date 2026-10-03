import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import "./landing.css";

// Plans are written into the page because production has no subscription_tiers
// rows yet, so /api/subscription-tiers returns []. Prices are intentionally
// omitted until paid plans are set up. Switch back to the API once they are.
const PLANS = [
  {
    id: "free",
    name: "Free",
    kind: "Free",
    for: "For your first short or a single project you’re crewing up.",
    features: ["Up to 3 productions", "Up to 5 crew members", "Crew directory and public profile"],
    cta: "Start free",
    primary: false,
  },
  {
    id: "pro",
    name: "Pro",
    kind: "Monthly subscription",
    for: "For working filmmakers running several projects a year and paying crew.",
    features: ["Unlimited productions", "Crew payments and invoicing", "W-9 collection and 1099 prep"],
    cta: "Get started",
    primary: true,
  },
  {
    id: "studio",
    name: "Studio",
    kind: "Monthly subscription",
    for: "For production companies and collectives with many projects running at once.",
    features: ["Unlimited productions", "Unlimited crew members", "Everything in Pro", "Priority support"],
    cta: "Get started",
    primary: false,
  },
];

function Dot() {
  return <span className="dot">.</span>;
}

/** Nav + footer shared by the landing page and the pages moved off it. */
// Signup is closed for now: signup buttons stay on the page but don't link
// anywhere, and read "COMING SOON" on hover or focus.
function ComingSoonButton({ label, variant = "btn-primary", testId }: { label: string; variant?: string; testId?: string }) {
  return (
    <span className={`btn ${variant} btn-soon`} role="link" aria-disabled="true" tabIndex={0}
      aria-label={`${label}, coming soon`} data-testid={testId}>
      <span className="soon-default" aria-hidden="true">{label}</span>
      <span className="soon-hover" aria-hidden="true">COMING SOON</span>
    </span>
  );
}

function JoinComingSoon({ testId }: { testId: string }) {
  return <ComingSoonButton label="Join THE FVC" testId={testId} />;
}

export function LandingShell({ children, theme }: { children: React.ReactNode; theme?: string }) {
  const { user } = useAuth();
  return (
    <div className={theme && theme !== "warm" ? `fvc-lp theme-${theme}` : "fvc-lp"}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="nav">
        <div className="wrap nav-in">
          <Link href="/" className="logo" aria-label="THEFVC.IS home">THEFVC<Dot />IS</Link>
          <nav className="nav-links" aria-label="Primary">
            <Link href="/crew" data-testid="link-crew">Find Crew</Link>
            <a href="/#how">How It Works</a>
            <a href="/#pricing">Pricing</a>
          </nav>
          <div className="nav-right">
            {user ? (
              <Link href="/app" className="btn btn-primary" data-testid="link-dashboard">Dashboard</Link>
            ) : (
              <>
                <Link href="/auth" className="nav-login" data-testid="link-login">Log In</Link>
                <JoinComingSoon testId="link-signup" />
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer>
        <div className="wrap foot">
          <Link href="/" className="logo">THEFVC<Dot />IS</Link>
          <nav aria-label="Footer">
            <Link href="/crew">Find Crew</Link>
            <a href="/#how">How It Works</a>
            <a href="/#pricing">Pricing</a>
            <Link href="/roadmap">Roadmap</Link>
            <Link href="/news">Industry News</Link>
            <Link href="/auth">Log In</Link>
          </nav>
          <p className="label">© 2026 Film Video Collective</p>
        </div>
      </footer>
    </div>
  );
}

export function Landing() {
  return (
    <LandingShell>
      {/* HERO */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="label" data-testid="badge-beta">Film Video Collective / <b>Early Access</b></p>
            <h1 id="hero-title" className="display" data-testid="hero-title">
              Independent<br />doesn’t mean<br />alone<Dot />
            </h1>
            <p className="lede" data-testid="hero-subtitle">
              Find your crew. Bring your production together. Keep the work moving. FVC gives independent filmmakers a shared place to make it happen.
            </p>
            <div className="cta-row">
              <div className="cta-stack">
                <JoinComingSoon testId="cta-signup" />
                <span className="cta-note">Free to get started</span>
              </div>
              <Link href="/crew" className="btn btn-ghost" data-testid="cta-browse">Find Your Crew</Link>
            </div>
          </div>

          <div className="hero-media">
            {/* Laid out like a magazine plate: the photo sits inside a printed
                frame with crop marks, a folio line and a margin caption. */}
            <figure className="plate">
              <img
                className="photo"
                src="/images/crew-on-location.jpg"
                alt="A film crew on location in the sun: a boom operator in headphones, a camera operator on a ladder with a cinema camera, and crew members talking through the next setup."
                width={1120}
                height={1120}
              />
              <span className="crop tl" aria-hidden="true" /><span className="crop tr" aria-hidden="true" />
              <span className="crop bl" aria-hidden="true" /><span className="crop br" aria-hidden="true" />
              <div className="plate-overlay" aria-hidden="true">
                <div className="plate-folio"><span>FVC<b>/</b>Field Notes</span><span>No. 01</span></div>
                <span className="plate-side">On location — between setups</span>
                <span className="plate-fig">Fig. 01</span>
              </div>
            </figure>
            <div className="peek" aria-label="Sample product preview: crew list">
              <div className="peek-head">
                <span className="label"><b>Salt Flats</b> / Crew</span>
                <span className="sample-tag">Sample</span>
              </div>
              <div className="peek-row"><div><div className="who">Maya Ortiz</div><div className="role">Director of Photography</div></div><span className="chip ok">Confirmed</span></div>
              <div className="peek-row"><div><div className="who">Dev Raman</div><div className="role">Gaffer</div></div><span className="chip ok">Confirmed</span></div>
              <div className="peek-row"><div><div className="who">June Park</div><div className="role">Sound Mixer</div></div><span className="chip wait">Invited</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT: one production, three connected views */}
      <section className="band" aria-labelledby="product-title">
        <div className="wrap">
          <div className="sec-head">
            <p className="label">One production, three views</p>
            <h2 id="product-title" className="display">The people. The plan.<br />The production<Dot /></h2>
          </div>

          <div className="prod" aria-label="Sample production: Salt Flats">
            <div className="prod-bar">
              <span className="prod-title">Salt Flats</span>
              <div className="prod-meta">
                <span className="label">Short film</span>
                <span className="label">Trona, CA</span>
                <span className="label"><b>Oct 14 – 17, 2026</b></span>
              </div>
              <span className="sample-tag">Sample content</span>
            </div>
            <div className="views">
              <div className="view" data-testid="view-crew">
                <div className="view-h"><h3>Crew</h3><span className="label">6 of 8 confirmed</span></div>
                <ul className="rows">
                  <li className="linked"><span className="n">Maya Ortiz</span><span className="s">Director of Photography</span><span className="r"><span className="chip ok">Confirmed</span><span className="num">$850/day</span></span></li>
                  <li><span className="n">Dev Raman</span><span className="s">Gaffer</span><span className="r"><span className="chip ok">Confirmed</span><span className="num">$600/day</span></span></li>
                  <li className="linked"><span className="n">Luis Echevarría</span><span className="s">1st AC</span><span className="r"><span className="chip ok">Confirmed</span><span className="num">$450/day</span></span></li>
                  <li><span className="n">June Park</span><span className="s">Sound Mixer</span><span className="r"><span className="chip wait">Invited</span><span className="num">$550/day</span></span></li>
                  <li><span className="n">Ade Bello</span><span className="s">Production Designer</span><span className="r"><span className="chip wait">Invited</span><span className="num">$500/day</span></span></li>
                </ul>
              </div>
              <div className="view" data-testid="view-plan">
                <div className="view-h"><h3>Plan</h3><span className="label">Status</span></div>
                <ol className="pipeline">
                  <li className="done">Pre-production</li>
                  <li className="cur">In production</li>
                  <li>Post</li>
                  <li>Wrapped</li>
                </ol>
                <dl className="facts">
                  <dt>Shoot</dt><dd className="num">Oct 14 – 17</dd>
                  <dt>Location</dt><dd>Trona, CA</dd>
                  <dt>Type</dt><dd>Short film</dd>
                  <dt>Budget</dt><dd className="num">$18,000</dd>
                </dl>
              </div>
              <div className="view" data-testid="view-payments">
                <div className="view-h"><h3>Payments</h3><span className="label">Via Stripe</span></div>
                <ul className="rows">
                  <li className="linked"><span className="n">Maya Ortiz</span><span className="s">DP · 2 days</span><span className="r"><span className="chip ok">Paid</span><span className="num">$1,700.00</span></span></li>
                  <li className="linked"><span className="n">Luis Echevarría</span><span className="s">1st AC · 2 days</span><span className="r"><span className="chip wait">Pending</span><span className="num">$900.00</span></span></li>
                </ul>
                <div className="totals">
                  <span className="k">Paid through FVC</span><span className="num">$2,600.00</span>
                </div>
              </div>
            </div>
          </div>
          <p className="prod-caption">The same crew, from booking to payment. Names marked in orange appear in both the crew list and the payment log.</p>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="band" id="how" aria-labelledby="how-title">
        <div className="wrap">
          <div className="sec-head">
            <p className="label">How it works</p>
            <h2 id="how-title" className="display">From first call<br />to final payment<Dot /></h2>
          </div>

          <article className="spread" data-testid="step-crew">
            <div className="spread-text">
              <p className="label">Crew</p>
              <h3 className="display">Find the people who make it possible<Dot /></h3>
              <p>Discover crew by role and location, and learn about the people behind the work.</p>
              <Link href="/crew" className="textlink">Explore the Crew</Link>
            </div>
            <div className="spread-detail">
              <div className="card" aria-label="Sample crew search">
                <div className="card-h"><span className="label"><b>Find Crew</b></span><span className="sample-tag">Sample</span></div>
                <div className="filters" aria-hidden="true">
                  <span className="filter">Role: <b>Gaffer</b></span>
                  <span className="filter">City: <b>Los Angeles</b></span>
                  <span className="filter">Availability: <b>Open</b></span>
                </div>
                <div className="person">
                  <div className="avatar" aria-hidden="true">DR</div>
                  <div><div className="n">Dev Raman</div><div className="s">Gaffer · Los Angeles, CA</div><div className="tags"><span>Night exteriors</span><span>Aputure</span><span>Narrative</span></div></div>
                  <span className="chip ok">Available</span>
                </div>
                <div className="person">
                  <div className="avatar" aria-hidden="true">TO</div>
                  <div><div className="n">Tess Okafor</div><div className="s">Gaffer · Pasadena, CA</div><div className="tags"><span>Music videos</span><span>Small crews</span></div></div>
                  <span className="chip wait">Booked</span>
                </div>
              </div>
            </div>
          </article>

          <article className="spread flip" data-testid="step-production">
            <div className="spread-text">
              <p className="label">Production</p>
              <h3 className="display">Get everyone on the same page<Dot /></h3>
              <p>Keep dates, location, budget and your crew list in one shared production, so nobody is working from an old text thread.</p>
            </div>
            <div className="spread-detail">
              <div className="card" aria-label="Sample production detail">
                <div className="card-h"><span className="label"><b>Salt Flats</b> / Production</span><span className="chip now">In production</span></div>
                <dl className="facts">
                  <dt>Shoot dates</dt><dd className="num">Oct 14 – 17, 2026</dd>
                  <dt>Location</dt><dd>Trona, CA</dd>
                  <dt>Crew</dt><dd className="num">6 confirmed · 2 invited</dd>
                  <dt>Budget</dt><dd className="num">$18,000</dd>
                </dl>
              </div>
            </div>
          </article>

          <article className="spread" data-testid="step-payments">
            <div className="spread-text">
              <p className="label">Payments</p>
              <h3 className="display">Keep the business side moving<Dot /></h3>
              <p>Pay crew and keep W-9s with the project, so tax season doesn’t start with a hunt through your inbox.</p>
            </div>
            <div className="spread-detail">
              <div className="card" aria-label="Sample crew payment">
                <div className="card-h"><span className="label"><b>Pay Crew</b> / Salt Flats</span><span className="sample-tag">Sample</span></div>
                <div className="pay-line"><span className="k">Crew member</span><span>Maya Ortiz, DP</span></div>
                <div className="pay-line"><span className="k">2 days × $850</span><span className="num">$1,700.00</span></div>
                <div className="pay-line"><span className="k">W-9</span><span className="chip ok">On file</span></div>
                <div className="pay-line"><span className="k">Status</span><span className="chip ok">Paid</span></div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* PRICING */}
      <section className="band" id="pricing" aria-labelledby="pricing-title">
        <div className="wrap">
          <div className="sec-head">
            <p className="label">Pricing</p>
            <h2 id="pricing-title" className="display" data-testid="pricing-title">Room for your first project.<br />And the next one<Dot /></h2>
          </div>
          <div className="plans">
            {PLANS.map((plan) => (
              <div key={plan.id} className="plan" data-testid={`pricing-${plan.id}`}>
                <h3>{plan.name}</h3>
                <p className="for">{plan.for}</p>
                <div className="plan-kind">{plan.kind}</div>
                <ul>
                  {plan.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <ComingSoonButton label={plan.cta} variant={plan.primary ? "btn-primary" : "btn-ghost"} testId={`pricing-cta-${plan.id}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="band" aria-labelledby="closing-title">
        <div className="wrap closing">
          <h2 id="closing-title" className="display" data-testid="cta-title">Your next film starts<br />with your people<Dot /></h2>
          <div className="closing-side">
            <p>Find your collaborators and bring your next production together on FVC.</p>
            <div className="cta-row" style={{ alignItems: "center" }}>
              <JoinComingSoon testId="cta-final" />
              <Link href="/crew" className="textlink">Browse Crew</Link>
            </div>
          </div>
        </div>
      </section>
    </LandingShell>
  );
}
