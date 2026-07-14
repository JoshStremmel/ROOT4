/**
 * leagues/mlb/mlb.js
 * ───────────────────
 * MLB-specific static data: leagues/divisions, abbreviation quirks, brand
 * colors, rooting modes, category/strength display metadata, and the LEAGUE
 * config object the generic engine (root4.js) threads through its functions.
 *
 * Mirrors leagues/nfl/nfl.js exactly in shape so root4.js can serve either
 * league at runtime. MLB's two "conferences" are the American League (AL) and
 * National League (NL); each has three divisions: East / Central / West.
 */

/* ─── Static team metadata (30 teams, ESPN abbreviations) ────────────────── */
export const DIVISIONS = {
  // American League
  BAL:["AL","East"],    BOS:["AL","East"],    NYY:["AL","East"],  TB: ["AL","East"],    TOR:["AL","East"],
  CHW:["AL","Central"], CLE:["AL","Central"], DET:["AL","Central"], KC: ["AL","Central"], MIN:["AL","Central"],
  HOU:["AL","West"],    LAA:["AL","West"],    ATH:["AL","West"],  SEA:["AL","West"],    TEX:["AL","West"],
  // National League
  ATL:["NL","East"],    MIA:["NL","East"],    NYM:["NL","East"],  PHI:["NL","East"],    WSH:["NL","East"],
  CHC:["NL","Central"], CIN:["NL","Central"], MIL:["NL","Central"], PIT:["NL","Central"], STL:["NL","Central"],
  ARI:["NL","West"],    COL:["NL","West"],    LAD:["NL","West"],  SD: ["NL","West"],    SF: ["NL","West"],
};

// Normalize the abbreviation variants different feeds use to the canonical set above.
export const ABBR_ALIAS = {
  CWS: "CHW", CHA: "CHW",           // White Sox
  OAK: "ATH", LV: "ATH", ATHL: "ATH", // Athletics (Oakland → Sacramento)
  SFG: "SF", SDP: "SD", TBR: "TB", TBD: "TB",
  KCR: "KC", WSN: "WSH", WSA: "WSH", WAS: "WSH",
  ANA: "LAA", FLA: "MIA", AZ: "ARI",
};
export const normAbbr = (a) => ABBR_ALIAS[a] || a;

export const TEAM_COLOR_FALLBACK = {
  BAL:"#df4601", BOS:"#bd3039", NYY:"#0c2340", TB:"#092c5c",  TOR:"#134a8e",
  CHW:"#27251f", CLE:"#00385d", DET:"#0c2340", KC:"#004687",  MIN:"#002b5c",
  HOU:"#002d62", LAA:"#ba0021", ATH:"#003831", SEA:"#0c2c56", TEX:"#003278",
  ATL:"#ce1141", MIA:"#00a3e0", NYM:"#002d72", PHI:"#e81828", WSH:"#ab0003",
  CHC:"#0e3386", CIN:"#c6011f", MIL:"#12284b", PIT:"#fdb827", STL:"#c41e3a",
  ARI:"#a71930", COL:"#333366", LAD:"#005a9c", SD:"#2f241d",  SF:"#fd5a1e",
};

export const MODES = [
  { id: "overall",       label: "Overall",        desc: "Base playoff contention. Division + wild card combined." },
  { id: "division",      label: "Division Title", desc: "Only division-rival games matter. Wild card noise removed." },
  { id: "wildcard",      label: "Wild Card",      desc: "All league losses equally valuable." },
  { id: "conf_one_seed", label: "Playoff Bye",    desc: "Climb to a top-2 seed for a first-round bye." },
  { id: "tank",          label: "Tank",           desc: "Root for losses. Best draft-lottery odds win." },
];

export const CATEGORY_META = {
  DivisionRivalTank:     { label: "Division rival",      tone: "fav",     help: "Their loss directly improves your division standing." },
  OpponentTanking:       { label: "Opponent tanking",    tone: "neutral", help: "An upcoming team for you — soften them up first." },
  PlayoffSoftening:      { label: "Playoff impact",      tone: "fav",     help: "A league playoff contender — their loss directly tightens the race for you." },
  UpsetRooting:          { label: "Upset rooting",       tone: "warn",    help: "Heavy home favorite in your league. Trap-game potential." },
  DraftPositioning:      { label: "Draft positioning",   tone: "neutral", help: "Stuck in no-man's-land; keep them losing." },
  Dislikes:              { label: "Personal rivalry",    tone: "warn",    help: "Boosted because you marked them as disliked." },
  TankPositioning:       { label: "Tank positioning",    tone: "fav",     help: "Protect your draft-lottery odds — bring teams below you up." },
  SeriesRooting:         { label: "Season series",       tone: "muted",   help: "Tracks your regular-season series vs this team — rooted to make a series lead look better, or a series deficit sting less." },
  UnderdogPick:          { label: "Underdog pick",       tone: "muted",   help: "No direct playoff impact — rooting for the upset." },
  PlayoffSeeding:        { label: "Playoff seeding",     tone: "neutral", help: "Both teams are in the playoffs; this game only affects seed position." },
  direct_playoff_impact: { label: "Playoff impact",      tone: "fav",     help: "Direct playoff math: their loss improves your odds." },
  no_impact:             { label: "No impact",           tone: "muted",   help: "Not in your league; result doesn't move your odds." },
};

export const STRENGTH_WEIGHT = { high: 0.35, medium: 0.20, low: 0.10 };

export const STRENGTH_META = {
  high:   { label: "High",   weight: 0.35, color: "var(--accent)" },
  medium: { label: "Medium", weight: 0.20, color: "oklch(0.66 0.10 50)" },
  low:    { label: "Low",    weight: 0.10, color: "var(--text-faint)" },
};

/* ─── League config ──────────────────────────────────────────────────────── */
export const LEAGUE = {
  id: "mlb",
  name: "MLB",
  sportPath: "baseball",          // URL segment: who2root4/baseball
  espnSport: "baseball/mlb",      // ESPN API path segment
  gamesPerSeason: 162,
  recentFormGames: 10,            // trailing games sampled for strength's "recent form" signal
  conferences: ["AL", "NL"],
  divisionOrder: ["East", "Central", "West"],
  wildcards: 3,                   // wild-card berths per league
  byes: 2,                        // top-2 seeds receive a first-round bye
  playoffSeeds: 6,                // berths per league (3 division winners + 3 wildcards)
  tiesAllowed: false,             // baseball games never end tied
  periodNoun: "game",             // remaining-count unit: "N games left"
  periodLabelThisWeek: "Today",   // tab / header label (NFL says "This Week")
  seedTerm: "seed",
  seasonSpansYears: false,        // MLB's regular season runs entirely within one
                                  // calendar year (Apr–Oct) — display "2026 Season",
                                  // not a spanning "2026-27" like the NFL
  // MLB scrapped the Game 163 in 2022 — ties are now broken mathematically.
  // The same ordered criteria apply to division-title and wild-card ties.
  tiebreakerProcedures: {
    div: {
      tag: "DIV", title: "Division tie-breaker procedure",
      steps: [
        "Head-to-head record (season series between the tied clubs)",
        "Higher winning % in intradivision games",
        "Higher winning % in intraleague games",
        "Higher winning % in the last half of intraleague games",
        "Higher winning % in the last half plus one intraleague game (repeat back one game at a time until broken)",
      ],
    },
    wc: {
      tag: "WC", title: "Wild-card tie-breaker procedure",
      steps: [
        "Head-to-head record (season series between the tied clubs)",
        "Higher winning % in intradivision games",
        "Higher winning % in intraleague games",
        "Higher winning % in the last half of intraleague games",
        "Higher winning % in the last half plus one intraleague game (repeat back one game at a time until broken)",
      ],
    },
  },
};
