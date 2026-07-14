/**
 * leagues/mls/mls.js
 * ───────────────────
 * MLS-specific static data: conferences (Eastern / Western), abbreviation
 * quirks, brand colors, rooting modes, category/strength display metadata, and
 * the LEAGUE config object the generic engine (root4.js) threads through its
 * functions.
 *
 * Mirrors leagues/nfl/nfl.js in shape so root4.js can serve MLS at runtime, with
 * two soccer-specific wrinkles baked into the LEAGUE config rather than the
 * engine:
 *   1. Points table, not win %. Standings rank by points (3 win / 1 draw / 0
 *      loss). The `scoring` field below activates root4.js's points-faithful
 *      ranking path; leagues without `scoring` (NFL, MLB) keep the win-% path.
 *   2. No divisions. Each conference is a single 15-team table. We model this by
 *      giving every team a division whose name equals its conference, so the
 *      engine's conf → division → seed pipeline yields one "division winner"
 *      (the conference leader / #1 seed) plus wild cards for the rest of the
 *      top 9 that make the MLS Cup Playoffs.
 */

/* ─── Static team metadata (30 teams, ESPN abbreviations) ────────────────── *
 * MLS has no divisions within a conference — the whole conference is one table.
 * We set div === conf so the generic engine treats each conference as a single
 * division (one "division winner" = the conference's #1 seed). */
export const DIVISIONS = {
  // Eastern Conference
  ATL:["East","East"], CHI:["East","East"], CIN:["East","East"], CLB:["East","East"], CLT:["East","East"],
  DC: ["East","East"], MIA:["East","East"], MTL:["East","East"], NE: ["East","East"], NYC:["East","East"],
  NSH:["East","East"], ORL:["East","East"], PHI:["East","East"], RBNY:["East","East"], TOR:["East","East"],
  // Western Conference
  ATX:["West","West"], COL:["West","West"], DAL:["West","West"], HOU:["West","West"], LA: ["West","West"],
  LAFC:["West","West"], MIN:["West","West"], POR:["West","West"], RSL:["West","West"], SD: ["West","West"],
  SEA:["West","West"], SJ: ["West","West"], SKC:["West","West"], STL:["West","West"], VAN:["West","West"],
};

// Normalize abbreviation variants different feeds use to the canonical set above.
// The ESPN standings and scoreboard feeds already agree on the canonical codes;
// these are defensive aliases for other feeds / historical variants.
export const ABBR_ALIAS = {
  NY: "RBNY", NYRB: "RBNY", RBN: "RBNY",   // Red Bull New York
  KC: "SKC", SPKC: "SKC",                  // Sporting Kansas City
  LAG: "LA", GAL: "LA",                    // LA Galaxy
  SJE: "SJ", SJQ: "SJ",                    // San Jose Earthquakes
  AUS: "ATX",                              // Austin FC
  MON: "MTL", MTQ: "MTL",                  // CF Montréal
  DCU: "DC", WDC: "DC",                    // D.C. United
  SDFC: "SD",                              // San Diego FC
  STLC: "STL", SLC: "STL",                 // St. Louis CITY SC
  CHV: "CHI",                              // Chicago Fire (guard)
};
export const normAbbr = (a) => ABBR_ALIAS[a] || a;

// Brand primary colors (ESPN's soccer standings feed leaves team.color blank).
export const TEAM_COLOR_FALLBACK = {
  ATL:"#a6192e", CHI:"#141b4d", CIN:"#003087", CLB:"#fedd00", CLT:"#1a85c8",
  DC:"#ef3e42",  MIA:"#f7b5cd", MTL:"#0033a0", NE:"#0a2240",  NYC:"#6cace4",
  NSH:"#ece83a", ORL:"#633492", PHI:"#071b2c", RBNY:"#ed1e36", TOR:"#b81137",
  ATX:"#00b140", COL:"#862633", DAL:"#be1e2d", HOU:"#ff6b00", LA:"#00245d",
  LAFC:"#c39e6d", MIN:"#8cd2f4", POR:"#00482b", RSL:"#b30838", SD:"#005a9c",
  SEA:"#5d9741", SJ:"#0051ba",  SKC:"#002f65", STL:"#eb1928", VAN:"#00245e",
};

/* ─── Rooting modes ──────────────────────────────────────────────────────── *
 * Same mode ids as the NFL so the engine's per-mode branches are reused; only
 * the labels/descriptions change to match MLS (single-table conference, points
 * race, top-9 playoff field). MLS has no divisions, so "Conference Table"
 * stands in for the NFL's "Division Title" mode — the race to top your
 * conference (the #1 seed). */
export const MODES = [
  { id: "overall",       label: "Overall",          desc: "Base playoff contention. Conference table position + berth combined." },
  { id: "division",      label: "Conference Table",  desc: "Race to the top of your conference. Only conference-table position matters." },
  { id: "wildcard",      label: "Playoff Berth",     desc: "Just make the top 9. All conference results equally valuable." },
  { id: "conf_one_seed", label: "#1 Seed",           desc: "Claim the top seed — host every playoff round in your conference." },
  { id: "tank",          label: "Tank",              desc: "Root for losses. Best draft position wins." },
];

export const CATEGORY_META = {
  DivisionRivalTank:     { label: "Conference rival",   tone: "fav",     help: "Their loss directly improves your conference-table position." },
  OpponentTanking:       { label: "Opponent tanking",   tone: "neutral", help: "An upcoming team for you — soften them up first." },
  PlayoffSoftening:      { label: "Playoff impact",     tone: "fav",     help: "A conference playoff contender — their loss directly tightens the race for you." },
  UpsetRooting:          { label: "Upset rooting",      tone: "warn",    help: "Heavy favorite in your conference. Trap-game potential." },
  DraftPositioning:      { label: "Draft positioning",  tone: "neutral", help: "Stuck in no-man's-land; keep them losing." },
  Dislikes:              { label: "Personal rivalry",   tone: "warn",    help: "Boosted because you marked them as disliked." },
  TankPositioning:       { label: "Tank positioning",   tone: "fav",     help: "Protect your draft position — bring teams below you up." },
  SOVRooting:            { label: "Result quality",     tone: "muted",   help: "You beat this team — root for them to keep winning and make that result look better." },
  UnderdogPick:          { label: "Underdog pick",      tone: "muted",   help: "No direct playoff impact — rooting for the upset." },
  PlayoffSeeding:        { label: "Playoff seeding",    tone: "neutral", help: "Both teams are in the playoffs; this game only affects seed position." },
  direct_playoff_impact: { label: "Playoff impact",     tone: "fav",     help: "Direct playoff math: their loss improves your odds." },
  no_impact:             { label: "No impact",          tone: "muted",   help: "Not in your conference; result doesn't move your odds." },
};

export const STRENGTH_WEIGHT = { high: 0.35, medium: 0.20, low: 0.10 };

export const STRENGTH_META = {
  high:   { label: "High",   weight: 0.35, color: "var(--accent)" },
  medium: { label: "Medium", weight: 0.20, color: "oklch(0.66 0.10 50)" },
  low:    { label: "Low",    weight: 0.10, color: "var(--text-faint)" },
};

/* ─── League config ──────────────────────────────────────────────────────── */
export const LEAGUE = {
  id: "mls",
  name: "MLS",
  sportPath: "soccer",             // URL segment: who2root4/soccer
  espnSport: "soccer/usa.1",       // ESPN API path segment
  gamesPerSeason: 34,              // regular-season matches per team
  recentFormGames: 6,              // trailing matches sampled for strength's "recent form" signal
  conferences: ["East", "West"],   // the engine's two "conferences"
  divisionOrder: ["East", "West"], // one division per conference (div name = conf)
  wildcards: 8,                    // playoff berths beyond the conference leader (seeds 2–9)
  byes: 1,                         // the #1 seed hosts every round → treat as the "#1 seed" reward
  playoffSeeds: 9,                 // MLS Cup Playoff berths per conference (top 9)
  tiesAllowed: true,              // regular-season matches can end in a draw
  periodNoun: "match",             // remaining-count unit: "N matches left"
  periodNounPlural: "matches",     // irregular plural (avoids "matchs")
  periodLabelThisWeek: "This Week",// weekly grouping like the NFL (not day-by-day)
  seedTerm: "seed",
  seasonSpansYears: false,         // MLS runs within one calendar year (Feb–Dec) → "2026 Season"
  // Points table: 3 for a win, 1 for a draw, 0 for a loss. The presence of this
  // `scoring` object switches root4.js onto its points-faithful ranking path
  // (standings by points, "points back", max-reachable-points contention math).
  scoring: { win: 3, draw: 1, loss: 0 },
  // Plain-language tiebreaker procedures, rendered on the Standings page.
  // MLS breaks equal points with these ordered criteria; steps that need data
  // we don't ingest (disciplinary points, away goals) are omitted and simply
  // fall through to no ordering.
  tiebreakerProcedures: {
    div: {
      tag: "CONF", title: "Conference-standings tie-breaker procedure",
      steps: [
        "Total number of wins",
        "Goal differential",
        "Goals for",
        "Head-to-head results among the tied clubs",
        "Fewest disciplinary points",
        "Away goal differential, then away goals",
        "Home goal differential, then home goals",
        "Coin toss / drawing of lots",
      ],
    },
    wc: {
      tag: "Playoffs", title: "Playoff-seeding tie-breaker procedure",
      steps: [
        "Total number of wins",
        "Goal differential",
        "Goals for",
        "Head-to-head results among the tied clubs",
        "Fewest disciplinary points",
        "Away goal differential, then away goals",
        "Home goal differential, then home goals",
        "Coin toss / drawing of lots",
      ],
    },
  },
};
