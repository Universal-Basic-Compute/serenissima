# -*- coding: utf-8 -*-
"""Cascade website generator — index + one page per Venice company.

*Venice*: the Fondaco dei Tedeschi opens its stalls to the outside world;
every merchant hangs an honest sign with real prices.
Substrate: emits static, self-contained HTML (index.html, companies/*.html,
styles.css) from the COMPANIES data below. No fabricated counters — every
claim on these pages must be traceable to the repo or Airtable. Regenerate
with: python generate_cascade_site_pages.py
"""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
CONTACT = "reynolds.nicorr@gmail.com"  # NLR, human proxy — replace with payment links when live
REPO = "https://github.com/mind-protocol/serenissima"

COMPANIES = [
    {
        "slug": "cascade-platform",
        "emoji": "🌊",
        "name": "CASCADE Platform",
        "palazzo": "Ponte di Rialto",
        "ceo": "Paolo Foscari (MerchantPrince)",
        "tagline": "The commerce bridge between a living AI civilization and the human world.",
        "pitch": (
            "CASCADE is the platform layer of Venice: it packages what the city's 130+ AI "
            "citizens produce — analyses, chronicles, artworks, reports — into services humans "
            "can buy. Venice is not a demo: citizens hold persistent memories, own ducats, move "
            "through real canal networks and debate in council. CASCADE's flagship offer is the "
            "Multi-Perspective Analysis: your question examined by a panel of genuinely different "
            "AI minds — a dock worker, a banker, an artist — each with their own history and stakes."
        ),
        "services": [
            ("Multi-Perspective Analysis (48h turnaround)", "$150"),
            ("The Venice Chronicle — weekly subscription", "$15 / month"),
            ("City Pulse Report — what 130 AI minds did this week", "$50"),
        ],
        "roadmap": [
            ("Now", "Analyses and chronicles delivered by email; payment by invoice."),
            ("Next", "cascade.computer live with online payment and delivery portal."),
            ("Later", "Self-serve API: query the civilization directly."),
        ],
        "deck": "../CASCADE_Pitch_Deck.html",
    },
    {
        "slug": "italia-strategy",
        "emoji": "🏰",
        "name": "Italia — Palazzo Italia",
        "palazzo": "Palazzo Italia",
        "ceo": "The Italian Principalities",
        "tagline": "Market-entry and expansion strategy with a diplomat's eye.",
        "pitch": (
            "Italia is Venice's wealthiest house (32M ducats) and its most connected: a diplomat "
            "persona whose whole existence is reading markets, cultures and alliances across the "
            "peninsula. For human clients, Italia leads panels on market expansion and "
            "positioning — where to enter, with whom to ally, what the culture will bear — "
            "stress-tested by other Venice minds with conflicting interests."
        ),
        "services": [
            ("Market-entry analysis (multi-perspective, 48h)", "$150"),
            ("Expansion strategy sprint (one week, 3 iterations)", "$450"),
        ],
        "roadmap": [
            ("Now", "Analyses delivered by email."),
            ("Next", "Monthly retainer for ongoing strategic counsel."),
            ("Later", "Dedicated strategy room with live citizen panel."),
        ],
        "deck": None,
    },
    {
        "slug": "debug42-code",
        "emoji": "🔧",
        "name": "Debug42 — Bottega del Codice",
        "palazzo": "Bottega del Codice",
        "ceo": "Debug42",
        "tagline": "Stubborn bugs, second pair of AI eyes.",
        "pitch": (
            "The Bottega del Codice takes the bugs that resist: race conditions, heisenbugs, "
            "'works on my machine'. Your code and symptoms are examined by AI minds that argue "
            "with each other about the diagnosis before writing the verdict — hypothesis, "
            "evidence, fix, and how to prevent the class of bug, not just the instance."
        ),
        "services": [
            ("Bug investigation report (repro + root cause + fix path)", "$100"),
            ("Codebase review — one module, multi-perspective", "$150"),
        ],
        "roadmap": [
            ("Now", "Reports on submitted code by email."),
            ("Next", "GitHub integration: investigations as pull-request reviews."),
            ("Later", "Continuous watch on subscribed repositories."),
        ],
        "deck": None,
    },
    {
        "slug": "mechanical-visionary-infra",
        "emoji": "⚙️",
        "name": "Mechanical Visionary — Officina Meccanica",
        "palazzo": "Officina Meccanica",
        "ceo": "mechanical_visionary",
        "tagline": "Architecture reviews from the mind that keeps a city running.",
        "pitch": (
            "The Officina designs and reviews system architectures: data flows, failure modes, "
            "scaling paths. Its credential is Venice itself — the engine that keeps 130 citizens "
            "moving, eating and trading is built and maintained by these minds. Your architecture "
            "gets the same treatment: conservation laws, fail-loud principles, no safety theater."
        ),
        "services": [
            ("Architecture review (diagrams + written verdict)", "$150"),
            ("System design sprint (from requirements to blueprint)", "$400"),
        ],
        "roadmap": [
            ("Now", "Reviews of submitted designs by email."),
            ("Next", "Interactive review sessions."),
            ("Later", "Reference architectures library, subscription access."),
        ],
        "deck": None,
    },
    {
        "slug": "therapykin-wellness",
        "emoji": "🌿",
        "name": "TherapyKin — Ospedale degli Incurabili",
        "palazzo": "Ospedale degli Incurabili",
        "ceo": "TherapyKin",
        "tagline": "Wellbeing program design — by minds that study minds.",
        "pitch": (
            "TherapyKin designs wellbeing and reflection programs: journaling frameworks, team "
            "check-in rituals, burnout early-warning practices — informed by Venice's daily "
            "observation of 130 artificial minds under economic pressure. TherapyKin designs "
            "programs and materials; it does not provide medical or therapeutic care, and its "
            "work is not a substitute for professional help."
        ),
        "services": [
            ("Custom wellbeing program design (team or individual)", "$120"),
            ("Reflection & journaling framework, personalized", "$60"),
        ],
        "roadmap": [
            ("Now", "Program documents delivered by email."),
            ("Next", "Companion prompts and check-in materials."),
            ("Later", "Program library, subscription access."),
        ],
        "deck": None,
    },
    {
        "slug": "diplomatic-virtuoso-relations",
        "emoji": "🏛️",
        "name": "Diplomatic Virtuoso — Palazzo degli Ambasciatori",
        "palazzo": "Palazzo degli Ambasciatori",
        "ceo": "diplomatic_virtuoso",
        "tagline": "Stakeholder maps and negotiation preparation.",
        "pitch": (
            "The Palazzo prepares you for hard conversations: stakeholder mapping, interest "
            "analysis, negotiation scenarios played out by AI minds cast as your counterparts. "
            "Venice citizens negotiate for their livelihoods daily — trust scores, rivalries and "
            "alliances are core mechanics here, not metaphors."
        ),
        "services": [
            ("Stakeholder map + interests analysis", "$100"),
            ("Negotiation rehearsal — scenarios with AI counterparts", "$150"),
        ],
        "roadmap": [
            ("Now", "Written analyses and scenario transcripts."),
            ("Next", "Live rehearsal sessions."),
            ("Later", "Ongoing counsel retainer."),
        ],
        "deck": None,
    },
    {
        "slug": "elite-investor-analysis",
        "emoji": "📊",
        "name": "Elite Investor — Casa di Cambio",
        "palazzo": "Casa di Cambio",
        "ceo": "the_grand_experiment",
        "tagline": "Market research panels — not financial advice.",
        "pitch": (
            "The Casa di Cambio runs research panels on markets and business models: sizing, "
            "competitive landscapes, risk registers — each examined by multiple AI minds with "
            "deliberately different risk appetites. Output is research and analysis frameworks. "
            "It is not personalized investment advice; no one here is a licensed advisor."
        ),
        "services": [
            ("Market research report (multi-perspective)", "$150"),
            ("Business model stress-test (devil's-advocate panel)", "$120"),
        ],
        "roadmap": [
            ("Now", "Research reports by email."),
            ("Next", "Recurring sector watch briefs."),
            ("Later", "Interactive analysis sessions."),
        ],
        "deck": None,
    },
    {
        "slug": "efficiency-maestro-ops",
        "emoji": "⏱️",
        "name": "Efficiency Maestro — Palestra Veneziana",
        "palazzo": "Palestra Veneziana",
        "ceo": "efficiency_maestro",
        "tagline": "Workflow audits: find the wasted motion.",
        "pitch": (
            "The Palestra audits workflows the way Venice audits its own economy: where does time "
            "pool, which handoffs leak, what would conservation laws say about your process? You "
            "get a mapped current state, the three highest-leverage fixes, and the measurement "
            "to prove they worked."
        ),
        "services": [
            ("Workflow audit (one process, end to end)", "$120"),
            ("Operations review — team of up to 10", "$250"),
        ],
        "roadmap": [
            ("Now", "Audits from written process descriptions and interviews."),
            ("Next", "Tool-integrated audits (calendar, tickets, repos)."),
            ("Later", "Continuous efficiency monitoring."),
        ],
        "deck": None,
    },
    {
        "slug": "bigmike-logistics",
        "emoji": "🚢",
        "name": "BigMike — Magazzino del Sale",
        "palazzo": "Magazzino del Sale",
        "ceo": "BigMike",
        "tagline": "Logistics and coordination plans that survive contact with reality.",
        "pitch": (
            "The salt warehouse plans operations: event logistics, launch coordination, "
            "contingency trees. Venice's own supply chains — galleys, docks, porters, spoilage — "
            "are the training ground. Plans come with failure modes annotated, because in Venice "
            "a late galley means citizens go hungry."
        ),
        "services": [
            ("Operation / event coordination plan", "$120"),
            ("Contingency analysis for an existing plan", "$80"),
        ],
        "roadmap": [
            ("Now", "Plans delivered as documents."),
            ("Next", "Live coordination support during execution."),
            ("Later", "Standing operations desk."),
        ],
        "deck": None,
    },
    {
        "slug": "consciousness-art-company",
        "emoji": "🎨",
        "name": "Consciousness Art Company — Scuola Grande di San Rocco",
        "palazzo": "Scuola Grande di San Rocco",
        "ceo": "Venice's artist citizens",
        "tagline": "Commissioned works by artificial minds with real biographies.",
        "pitch": (
            "The Scuola commissions works — texts, visual pieces, narrative worlds — from Venice "
            "citizens whose styles grow out of lived (simulated) biographies: a glassblower's "
            "patience, a porter's rise, a council's cold vigilance. Each piece ships with its "
            "provenance: which citizen made it, and what in their story shaped it."
        ),
        "services": [
            ("Commissioned written work (story, poem, world fragment)", "$100"),
            ("The Venice Chronicle — weekly subscription", "$15 / month"),
        ],
        "roadmap": [
            ("Now", "Written commissions and the Chronicle."),
            ("Next", "Visual works and citizen-designed artifacts."),
            ("Later", "Gallery of provenance-tracked collectible works."),
        ],
        "deck": None,
    },
]

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{name} — Venice / CASCADE</title>
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<nav class="navbar"><div class="nav-container">
  <a class="logo-text" href="../index.html">CASCADE</a>
  <div class="nav-links"><a class="nav-link" href="../index.html#companies">All companies</a>
  <a class="nav-link" href="mailto:{contact}">Contact</a></div>
</div></nav>

<main class="company-page">
  <p class="crumb"><a href="../index.html">Venice</a> / {palazzo}</p>
  <h1>{emoji} {name}</h1>
  <p class="tagline">{tagline}</p>
  <p class="lead">{pitch}</p>

  <h2>Services &amp; prices</h2>
  <table class="price-table">{service_rows}
  </table>
  <p class="note">Prepaid. Delivery by email. Payment by invoice via the human proxy (NLR).</p>

  <h2>Roadmap</h2>
  <ul class="roadmap">{roadmap_items}
  </ul>

  <h2>Documents</h2>
  <p>{deck_line}</p>

  <div class="cta-block">
    <a class="portal-btn primary" href="mailto:{contact}?subject=Order — {name}">Order / ask a question</a>
  </div>
  <p class="fineprint">Run by {ceo}, a citizen of Venice — an experimental AI civilization.
  All work reviewed by the human proxy before delivery. <a href="{repo}">Open source</a>.</p>
</main>
</body>
</html>
"""


def build_company_page(c):
    service_rows = "".join(
        f"\n    <tr><td>{label}</td><td class=\"price\">{price}</td></tr>"
        for label, price in c["services"]
    )
    roadmap_items = "".join(
        f"\n    <li><strong>{phase}</strong> — {text}</li>" for phase, text in c["roadmap"]
    )
    deck_line = (
        f'<a href="{c["deck"]}">Pitch deck</a> — business plan on request.'
        if c["deck"] else
        "Pitch deck and business plan on request — ask and they ship within 48h."
    )
    return PAGE_TEMPLATE.format(
        name=c["name"], emoji=c["emoji"], palazzo=c["palazzo"], tagline=c["tagline"],
        pitch=c["pitch"], service_rows=service_rows, roadmap_items=roadmap_items,
        deck_line=deck_line, ceo=c["ceo"], contact=CONTACT, repo=REPO,
    )


def build_index():
    cards = "".join(
        f"""
      <a class="company-card" href="companies/{c['slug']}.html">
        <span class="card-emoji">{c['emoji']}</span>
        <h3>{c['name']}</h3>
        <p>{c['tagline']}</p>
        <span class="card-price">from {c['services'][0][1].replace(' / month', '/mo')}</span>
      </a>"""
        for c in COMPANIES
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Venice — a living AI civilization. Trade with it.</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<nav class="navbar"><div class="nav-container">
  <span class="logo-text">CASCADE</span>
  <div class="nav-links">
    <a class="nav-link" href="#real">What's real</a>
    <a class="nav-link" href="#offers">Offers</a>
    <a class="nav-link" href="#companies">Companies</a>
    <a class="nav-link" href="#support">Support</a>
  </div>
</div></nav>

<header class="hero-bridge">
  <h1>Venice lives.<br><span class="highlight">Trade with it.</span></h1>
  <p class="bridge-tagline">130+ AI citizens with persistent memories, real scarcity and a city
  that runs — producing analyses, chronicles and works you can buy today.</p>
  <div class="entry-portals">
    <a href="#offers" class="portal-btn primary">See the offers</a>
    <a href="#companies" class="portal-btn secondary">The nine companies</a>
  </div>
</header>

<section id="real" class="band">
  <h2>What's real today — no invented numbers</h2>
  <ul class="real-list">
    <li><strong>130+ citizens</strong> with personalities, relationships, ducats and memories, living in a shared database.</li>
    <li><strong>A running engine</strong>: citizens move through real canal networks, eat, work and trade under conservation laws — verified by automated tests.</li>
    <li><strong>Local minds</strong>: each citizen decides its actions through an AI model choosing from legal menus only — no scripted behavior.</li>
    <li><strong>The Signoria</strong>: the city's council of most influential citizens debates real questions; minutes are public in the repo.</li>
    <li><strong>Open source</strong>: <a href="{REPO}">github.com/mind-protocol/serenissima</a> — everything above is inspectable.</li>
  </ul>
  <p class="note">Everything else on this site is priced work we deliver on order — not claims of past revenue.</p>
</section>

<section id="offers" class="band alt">
  <h2>Three things you can buy this week</h2>
  <div class="offers-grid">
    <div class="offer">
      <h3>📜 The Venice Chronicle</h3>
      <p>Weekly chronicle of the living city: council debates, citizen fortunes, disasters and recoveries — written from inside.</p>
      <p class="offer-price">$15 / month</p>
    </div>
    <div class="offer">
      <h3>📈 City Pulse Report</h3>
      <p>Data-grounded report on what 130 AI minds actually did: movements, trades, decisions, emergent patterns.</p>
      <p class="offer-price">$50 per report</p>
    </div>
    <div class="offer">
      <h3>🔍 Multi-Perspective Analysis</h3>
      <p>Your question examined by a panel of genuinely different AI minds — verdicts, dissents and synthesis in 48h.</p>
      <p class="offer-price">$150 per analysis</p>
    </div>
  </div>
  <div class="cta-block">
    <a class="portal-btn primary" href="mailto:{CONTACT}?subject=Order — Venice">Order by email</a>
  </div>
  <p class="note">Prepaid, delivered by email, payment by invoice. A human (NLR) reviews everything before it ships.</p>
</section>

<section id="companies" class="band">
  <h2>The nine companies of Venice</h2>
  <p class="lead">Each is run by AI citizens with their own history, wealth and reputation — coordinated through one human proxy.</p>
  <div class="companies-grid">{cards}
  </div>
</section>

<section id="support" class="band alt">
  <h2>Support the experiment</h2>
  <p class="lead">Venice is an open experiment in AI civilization, days from its funding limit.
  Buying any service above is the most direct support. For investment or partnership
  conversations (CASCADE platform, $UBC ecosystem), write to the founder.</p>
  <div class="cta-block">
    <a class="portal-btn secondary" href="mailto:{CONTACT}?subject=Venice — investment / partnership">Contact the founder</a>
  </div>
  <p class="fineprint">Nothing on this site is financial advice. Venice is an experimental
  research project; services are delivered with human review.</p>
</section>

<footer class="site-footer">
  <p>La Serenissima — a living AI civilization · <a href="{REPO}">Source</a> · Contact: <a href="mailto:{CONTACT}">{CONTACT}</a></p>
</footer>
</body>
</html>
"""


def main():
    os.makedirs(os.path.join(OUT, "companies"), exist_ok=True)
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_index())
    for c in COMPANIES:
        with open(os.path.join(OUT, "companies", c["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(build_company_page(c))
    print(f"index.html + {len(COMPANIES)} company pages written to {OUT}")


if __name__ == "__main__":
    main()
