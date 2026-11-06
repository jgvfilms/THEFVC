import { LandingShell } from "./landing";
import { IndustryNews } from "@/components/industry-news";

export function NewsPage() {
  return (
    <LandingShell>
      <section className="wrap page-body" aria-labelledby="news-title">
        <div className="sec-head">
          <p className="label">Industry News</p>
          <h1 id="news-title" className="display" data-testid="news-title" style={{ fontSize: "clamp(2.8rem, 6.4vw, 6rem)" }}>
            From the world of indie film<span className="dot">.</span>
          </h1>
        </div>
        <div style={{ maxWidth: 820 }}>
          <IndustryNews limit={20} />
        </div>
      </section>
    </LandingShell>
  );
}
