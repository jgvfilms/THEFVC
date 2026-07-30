import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { ActivityFeed } from "@/components/activity-feed";
import { IndustryNews } from "@/components/industry-news";
import { Newspaper } from "lucide-react";

export function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="hsl(240 5% 5%)" />
              <circle cx="16" cy="16" r="8" fill="none" stroke="hsl(41 76% 55%)" strokeWidth="2" />
              <circle cx="16" cy="16" r="2.5" fill="hsl(41 76% 55%)" />
            </svg>
            <span className="font-display text-lg font-600 tracking-tight">THEFVC<span className="text-primary">.IS</span></span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/crew" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-crew">Browse Crew</Link>
            {user ? (
              <Link href="/app" className="rounded-lg bg-primary px-4 py-2 text-sm font-500 text-primary-foreground hover:opacity-90 transition-opacity" data-testid="link-dashboard">Dashboard</Link>
            ) : (
              <>
                <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-login">Log in</Link>
                <Link href="/auth" className="rounded-lg bg-primary px-4 py-2 text-sm font-500 text-primary-foreground hover:opacity-90 transition-opacity" data-testid="link-signup">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 50% 30%, hsl(41 76% 55% / 0.15), transparent 60%)" }} />
        <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-4 py-1.5 text-xs font-500 text-muted-foreground" data-testid="badge-beta">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now in early access
          </div>
          <h1 className="font-display text-4xl font-700 leading-[1.1] tracking-tight sm:text-5xl md:text-6xl" data-testid="hero-title">
            Less paperwork.<br />
            More frames.<br />
            <span className="text-primary">Better stories.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg" data-testid="hero-subtitle">
            The all-in-one operating system for indie filmmaking. Payments, crew finder, and production management — built by filmmakers, for filmmakers.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth" className="flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-600 text-primary-foreground hover:opacity-90 transition-opacity sm:w-auto" data-testid="cta-signup">
              Start free — no credit card
            </Link>
            <Link href="/crew" className="flex w-full items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-500 text-foreground hover:bg-card transition-colors sm:w-auto" data-testid="cta-browse">
              Browse the crew directory
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground" data-testid="hero-note">Free tier includes 3 projects. No withdrawal fees on Pro for the first $10K/mo.</p>
        </div>
      </section>

      {/* PROBLEM STAT */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="font-display text-6xl font-700 text-primary sm:text-7xl" data-testid="stat-30">30%</p>
          <p className="mt-4 text-lg text-muted-foreground" data-testid="stat-description">
            of indie film budgets vanish into admin overhead — spreadsheets, paper contracts, manual payments, lost call sheets. FVC takes that back.
          </p>
        </div>
      </section>

      {/* THREE PILLARS */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-12 text-center font-display text-3xl font-600" data-testid="pillars-title">Three tools. One workflow.</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6" data-testid="pillar-payments">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
              <h3 className="mb-2 font-display text-xl font-600">Payments</h3>
              <p className="text-sm text-muted-foreground">Pay crew via Stripe. Auto-collect W-9s, generate 1099s, categorize by department. Virtual cards for production budgets coming Phase 2.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6" data-testid="pillar-crew">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M17 11a3 3 0 100-6"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M17 21v-2a4 4 0 00-3-3.87"/></svg>
              </div>
              <h3 className="mb-2 font-display text-xl font-600">Crew Finder</h3>
              <p className="text-sm text-muted-foreground">Geo-search crew by role, city, and availability. Vouch system. Pre-loaded SAG contract templates. No more Facebook group posts.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6" data-testid="pillar-dashboard">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              </div>
              <h3 className="mb-2 font-display text-xl font-600">Production Dashboard</h3>
              <p className="text-sm text-muted-foreground">Auto-generate call sheets, QR face ID for check-in, schedule sync across devices. Your set, organized — without the spreadsheet sprawl.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-12 text-center font-display text-3xl font-600" data-testid="pricing-title">Pricing that grows with you</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-6" data-testid="pricing-free">
              <h3 className="font-display text-lg font-600">Free</h3>
              <p className="mt-1 text-sm text-muted-foreground">For solo creators</p>
              <p className="mt-4 font-display text-4xl font-700">$0<span className="text-base text-muted-foreground">/mo</span></p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>3 active projects</li>
                <li>Crew finder access</li>
                <li>Standard withdrawal fees</li>
                <li>Basic call sheets</li>
              </ul>
              <Link href="/auth" className="mt-6 block rounded-lg border border-border py-2 text-center text-sm font-500 hover:bg-secondary transition-colors">Start free</Link>
            </div>
            <div className="relative rounded-xl border-2 border-primary bg-card p-6" data-testid="pricing-pro">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-600 text-primary-foreground">Popular</div>
              <h3 className="font-display text-lg font-600">Pro</h3>
              <p className="mt-1 text-sm text-muted-foreground">For working filmmakers</p>
              <p className="mt-4 font-display text-4xl font-700">$15<span className="text-base text-muted-foreground">/mo</span></p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>Unlimited projects</li>
                <li>Tax exports (1099/W-9)</li>
                <li>No withdrawal fees (first $10K/mo)</li>
                <li>Auto-generated call sheets</li>
                <li>Priority crew listings</li>
              </ul>
              <Link href="/auth" className="mt-6 block rounded-lg bg-primary py-2 text-center text-sm font-600 text-primary-foreground hover:opacity-90 transition-opacity">Go Pro</Link>
            </div>
            <div className="rounded-xl border border-border bg-card p-6" data-testid="pricing-studio">
              <h3 className="font-display text-lg font-600">Studio</h3>
              <p className="mt-1 text-sm text-muted-foreground">For production companies</p>
              <p className="mt-4 font-display text-4xl font-700">$49<span className="text-base text-muted-foreground">/mo</span></p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>Everything in Pro</li>
                <li>Team accounts (up to 10 seats)</li>
                <li>Bulk payments</li>
                <li>API access</li>
                <li>White-label call sheets</li>
              </ul>
              <Link href="/auth" className="mt-6 block rounded-lg border border-border py-2 text-center text-sm font-500 hover:bg-secondary transition-colors">Contact us</Link>
            </div>
          </div>
        </div>
      </section>

      {/* COMMUNITY FEED + INDUSTRY NEWS */}
      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-2 text-center font-display text-3xl font-600" data-testid="feed-section-title">What's happening in the collective</h2>
          <p className="mb-10 text-center text-sm text-muted-foreground">
            Member activity, industry news, and the latest from the world of indie film
          </p>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
            {/* Left: Member Activity Feed */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Member Activity</h3>
              <ActivityFeed publicMode={true} />
            </div>
            {/* Right: Industry News */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-2">
                <Newspaper className="h-4 w-4" />
                Industry News
              </h3>
              <IndustryNews limit={8} />
            </div>
          </div>
        </div>
      </section>

      {/* AI ROADMAP */}
      <section className="border-t border-border py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="mb-12 text-center font-display text-3xl font-600" data-testid="roadmap-title">The AI roadmap</h2>
          <div className="space-y-4">
            {[
              { phase: "Phase 1", time: "6-9 months", title: "Script Whisperer", desc: "Scene breakdowns, character schedules, script-to-schedule automation." },
              { phase: "Phase 2", time: "9-12 months", title: "Call Sheet Oracle", desc: "AI-generated call sheets that adapt to weather, location, and crew availability." },
              { phase: "Phase 3", time: "12-18 months", title: "Dailies Brain", desc: "Upload dailies, get auto-tagged scenes, continuity tracking, and director's notes." },
              { phase: "Phase 4", time: "18-24 months", title: "Budget Guardian", desc: "Real-time budget tracking with predictive overruns and cost-saving suggestions." },
              { phase: "Phase 5", time: "Moonshot", title: "Festival Matchmaker", desc: "Match your finished film to the right festivals based on programming history and fit." },
            ].map((item, i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-5" data-testid={`roadmap-${i}`}>
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-700 text-accent-foreground">{i + 1}</div>
                  {i < 4 && <div className="mt-1 h-full w-px bg-border" />}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-primary">{item.phase}</span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </div>
                  <h3 className="mt-1 font-display text-lg font-600">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-display text-4xl font-700" data-testid="cta-title">Ditch the spreadsheets.<br /><span className="text-primary">Arm the revolution.</span></h2>
          <p className="mt-4 text-muted-foreground" data-testid="cta-subtitle">Join the first 1,000 indie filmmakers building on FVC.</p>
          <Link href="/auth" className="mt-8 inline-flex items-center rounded-lg bg-primary px-8 py-3 text-sm font-600 text-primary-foreground hover:opacity-90 transition-opacity" data-testid="cta-final">
            Get started free
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="6" fill="hsl(240 5% 5%)" />
              <circle cx="16" cy="16" r="8" fill="none" stroke="hsl(41 76% 55%)" strokeWidth="2" />
              <circle cx="16" cy="16" r="2.5" fill="hsl(41 76% 55%)" />
            </svg>
            <span className="font-display text-sm font-600">THEFVC.IS</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Film Video Collective. Built by filmmakers, for filmmakers.</p>
        </div>
      </footer>
    </div>
  );
}
