/**
 * leagues/nfl/nfl.js
 * ───────────────────
 * NFL-specific static data: divisions/conferences, abbreviation quirks,
 * brand colors, rooting modes, and category/strength display metadata.
 *
 * root4.js imports this and re-exports the same names, so consumers of
 * @engine see no difference — this file is purely where the NFL-specific
 * data lives so a future league (e.g. leagues/nba/nba.js) can define its
 * own DIVISIONS/MODES/etc. without touching the generic engine in root4.js.
 */

/* ─── Static team metadata ───────────────────────────────────────────────── */
export const DIVISIONS = {
  BUF:["AFC","East"],  MIA:["AFC","East"],  NE:["AFC","East"],   NYJ:["AFC","East"],
  BAL:["AFC","North"], CIN:["AFC","North"], CLE:["AFC","North"], PIT:["AFC","North"],
  HOU:["AFC","South"], IND:["AFC","South"], JAX:["AFC","South"], TEN:["AFC","South"],
  DEN:["AFC","West"],  KC: ["AFC","West"],  LV: ["AFC","West"],  LAC:["AFC","West"],
  DAL:["NFC","East"],  NYG:["NFC","East"],  PHI:["NFC","East"],  WAS:["NFC","East"],
  CHI:["NFC","North"], DET:["NFC","North"], GB: ["NFC","North"], MIN:["NFC","North"],
  ATL:["NFC","South"], CAR:["NFC","South"], NO: ["NFC","South"], TB: ["NFC","South"],
  ARI:["NFC","West"],  LAR:["NFC","West"],  SF: ["NFC","West"],  SEA:["NFC","West"],
};

export const ABBR_ALIAS = { WSH: "WAS", JAC: "JAX" };
export const normAbbr = (a) => ABBR_ALIAS[a] || a;

export const TEAM_COLOR_FALLBACK = {
  PIT:"#ffb612", BAL:"#241773", CIN:"#fb4f14", CLE:"#311d00",
  BUF:"#00338d", MIA:"#008e97", NYJ:"#125740", NE:"#002a5c",
  HOU:"#03202f", IND:"#002c5f", JAX:"#006778", TEN:"#19c6ff",
  KC:"#e31837",  LAC:"#0080c6", DEN:"#fb4f14", LV:"#000000",
  DET:"#0076b6", GB:"#203731",  MIN:"#4f2683", CHI:"#0b162a",
  PHI:"#004c54", DAL:"#003594", WAS:"#5a1414", NYG:"#0b2265",
  TB:"#d50a0a",  ATL:"#a71930", NO:"#d3bc8d",  CAR:"#0085ca",
  SF:"#aa0000",  LAR:"#003594", SEA:"#002244", ARI:"#97233f",
};

export const MODES = [
  { id: "overall",       label: "Overall",        desc: "Base playoff contention. Division + wild card combined." },
  { id: "division",      label: "Division Title", desc: "Only division-rival games matter. Wild card noise removed." },
  { id: "wildcard",      label: "Wild Card",      desc: "All conference losses equally valuable." },
  { id: "conf_one_seed", label: "#1 Seed",        desc: "Climb to the top seed for a bye + home through the playoffs." },
  { id: "tank",          label: "Tank",           desc: "Root for losses. Best draft pick wins." },
];

export const CATEGORY_META = {
  DivisionRivalTank:     { label: "Division rival",      tone: "fav",     help: "Their loss directly improves your division standing." },
  OpponentTanking:       { label: "Opponent tanking",    tone: "neutral", help: "An upcoming team for you — soften them up first." },
  PlayoffSoftening:      { label: "Playoff impact",      tone: "fav",     help: "A conference playoff contender — their loss directly tightens the race for you." },
  UpsetRooting:          { label: "Upset rooting",       tone: "warn",    help: "Heavy home favorite in your conference. Trap-game potential." },
  DraftPositioning:      { label: "Draft positioning",   tone: "neutral", help: "Stuck in no-man's-land; keep them losing." },
  Dislikes:              { label: "Personal rivalry",    tone: "warn",    help: "Boosted because you marked them as disliked." },
  TankPositioning:       { label: "Tank positioning",    tone: "fav",     help: "Protect your draft slot — bring teams below you up." },
  SOVRooting:            { label: "Strength of victory", tone: "muted",   help: "You beat this team — root for them to keep winning and make that win look better." },
  UnderdogPick:          { label: "Underdog pick",       tone: "muted",   help: "No direct playoff impact — rooting for the upset." },
  PlayoffSeeding:        { label: "Playoff seeding",     tone: "neutral", help: "Both teams are in the playoffs; this game only affects seed position." },
  direct_playoff_impact: { label: "Playoff impact",      tone: "fav",     help: "Direct playoff math: their loss improves your odds." },
  no_impact:             { label: "No impact",           tone: "muted",   help: "Not in your conference; result doesn't move your odds." },
};

export const STRENGTH_WEIGHT = { high: 0.35, medium: 0.20, low: 0.10 };

export const STRENGTH_META = {
  high:   { label: "High",   weight: 0.35, color: "var(--accent)" },
  medium: { label: "Medium", weight: 0.20, color: "oklch(0.66 0.10 50)" },
  low:    { label: "Low",    weight: 0.10, color: "var(--text-faint)" },
};

/* ─── League config ──────────────────────────────────────────────────────── *
 * Every constant the generic engine (root4.js) used to hard-code lives here so
 * a second league (leagues/mlb/mlb.js) can supply its own values. The engine
 * threads this object through its pure functions as the `league` parameter. */
export const LEAGUE = {
  id: "nfl",
  name: "NFL",
  sportPath: "football",          // URL segment: who2root4/football
  espnSport: "football/nfl",      // ESPN API path segment
  gamesPerSeason: 17,             // regular-season games per team
  recentFormGames: 4,             // trailing games sampled for strength's "recent form" signal
  conferences: ["AFC", "NFC"],    // the engine's two "conferences"
  divisionOrder: ["North", "South", "East", "West"], // display order within a conference
  wildcards: 3,                   // wild-card berths per conference
  byes: 1,                        // top seeds that receive a first-round bye
  playoffSeeds: 7,                // berths per conference (division winners + wildcards)
  tiesAllowed: true,
  periodNoun: "week",             // "this week" / "N weeks left"
  periodLabelThisWeek: "This Week",
  seedTerm: "seed",
  seasonSpansYears: true,         // regular season runs Sept–Feb: display as "2025-26", not a bare year
  // Plain-language tiebreaker procedures, rendered on the Standings page.
  tiebreakerProcedures: {
    div: {
      tag: "DIV", title: "Divisional tie-breaker procedure",
      steps: [
        "Head-to-head (best won-lost-tied % in games between the clubs)",
        "Best won-lost-tied % in games played within the division",
        "Best won-lost-tied % in common games",
        "Best won-lost-tied % in games played within the conference",
        "Strength of victory",
        "Strength of schedule",
        "Best combined ranking in conference points scored & allowed",
        "Best combined ranking in NFL points scored & allowed",
        "Best net points in common games",
        "Best net points in all games",
        "Best net touchdowns in all games",
        "Coin toss",
      ],
    },
    wc: {
      tag: "WC", title: "Wild-card tie-breaker procedure",
      steps: [
        "Apply divisional tie-breaker to eliminate all but the highest-ranked club in each division first",
        "Head-to-head sweep (only if one club has beaten or lost to each of the others)",
        "Best won-lost-tied % in games played within the conference",
        "Best won-lost-tied % in common games (minimum of four)",
        "Strength of victory",
        "Strength of schedule",
        "Best combined ranking in conference points scored & allowed",
        "Best combined ranking in NFL points scored & allowed",
        "Best net points in conference games",
        "Best net points in all games",
        "Best net touchdowns in all games",
        "Coin toss",
      ],
    },
  },
};
