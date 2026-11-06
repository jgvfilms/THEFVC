import { LandingShell } from "./landing";

// Moved off the homepage so the landing page only describes what ships today.
const PHASES = [
  { phase: "Phase 1", time: "6–9 months", title: "Script Whisperer", desc: "Scene breakdowns, character schedules, script-to-schedule automation." },
  { phase: "Phase 2", time: "9–12 months", title: "Call Sheet Oracle", desc: "AI-generated call sheets that adapt to weather, location, and crew availability." },
  { phase: "Phase 3", time: "12–18 months", title: "Dailies Brain", desc: "Upload dailies, get auto-tagged scenes, continuity tracking, and director's notes." },
  { phase: "Phase 4", time: "18–24 months", title: "Budget Guardian", desc: "Real-time budget tracking with predictive overruns and cost-saving suggestions." },
  { phase: "Phase 5", time: "Moonshot", title: "Festival Matchmaker", desc: "Match your finished film to the right festivals based on programming history and fit." },
];

export function RoadmapPage() {
  return (
    <LandingShell>
      <section className="wrap page-body" aria-labelledby="roadmap-title">
        <div className="sec-head">
          <p className="label">Roadmap</p>
          <h1 id="roadmap-title" className="display" data-testid="roadmap-title" style={{ fontSize: "clamp(2.8rem, 6.4vw, 6rem)" }}>
            The AI roadmap<span className="dot">.</span>
          </h1>
        </div>
        <p className="note">What we plan to build next. None of this is available yet, and the timing is an estimate that may change.</p>
        {PHASES.map((p, i) => (
          <div key={p.title} className="phase" data-testid={`roadmap-${i}`}>
            <p className="label"><b>{p.phase}</b> / {p.time}</p>
            <div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          </div>
        ))}
      </section>
    </LandingShell>
  );
}
