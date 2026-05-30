/**
 * TypeScript declarations for src/engine.js.
 * The graph app imports engine symbols via the @engine Vite alias.
 */

export interface GameResult {
  week: number;
  win: boolean;
  tie: boolean;
  pf: number;
  pa: number;
  oppAbbr: string;
  home: boolean;
}

export interface TeamData {
  abbr: string;
  conf: string;
  div: string;
  city: string;
  name: string;
  color: string;
  logo: string | null;
  record: [number, number, number];
  pf: number;
  pa: number;
  results: GameResult[];
}

export interface ScheduleGame {
  id: string;
  eventId: string;
  away: string;
  home: string;
  kickoff: string;
  network: string;
  slot: string;
  spread: number | null;
  homeMoneyLine: null;
  awayMoneyLine: null;
  homeFavorite: boolean;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  winner: "home" | "away" | "tie" | null;
  date: string | undefined;
  venue: string | undefined;
  headline: string | undefined;
}

export interface WeekMeta {
  week: number;
  season: number;
  label: string;
  seasonType: string;
  weeksRemaining: number;
  simWeek?: number | null;
}

export interface TeamStrength {
  strengthScore: number;
  pointDiff: number;
  sos: number;
  divisionBonus: number;
  recentForm: number;
  winMarginConsistency: number;
}

export interface StandingEntry {
  seed: number | null;
  kind: "division" | "wildcard" | "out";
  conf: string;
  gamesBehind?: number | null;
}

export interface StandingsResult {
  AFC: Array<{ seed: number; team: string; kind: string }>;
  NFC: Array<{ seed: number; team: string; kind: string }>;
  byTeam: Record<string, StandingEntry>;
  divisions: Record<string, Record<string, TeamData[]>>;
}

export interface TiebreakerEntry {
  over: string[];
  /** Per-opponent reason: losers[abbr] → the step that resolved that specific matchup. */
  reasons: Record<string, string>;
  /** Reason for the first recorded win (kept for backward compatibility). */
  reason: string;
}

export interface ModeDefinition {
  id: string;
  label: string;
  desc: string;
}

export interface CategoryMeta {
  label: string;
  tone: string;
  help: string;
}

export interface StrengthMeta {
  label: string;
  weight: number;
  color: string;
}

export declare const DIVISIONS: Record<string, [string, string]>;
export declare const ABBR_ALIAS: Record<string, string>;
export declare function normAbbr(a: string): string;
export declare const TEAM_COLOR_FALLBACK: Record<string, string>;
export declare const MODES: ModeDefinition[];
export declare const CATEGORY_META: Record<string, CategoryMeta>;
export declare const STRENGTH_WEIGHT: { high: number; medium: number; low: number };
export declare const STRENGTH_META: Record<string, StrengthMeta>;

export declare function winPct(t: Pick<TeamData, "record">): number;
export declare function gamesBack(fav: TeamData, teams: Record<string, TeamData>): number;
export declare function weeksRemainingFrom(weekMeta: WeekMeta | null | undefined): number;
export declare function inDivisionContention(team: TeamData, teams: Record<string, TeamData>, weekMeta: WeekMeta): boolean;
export declare function maxWins(team: TeamData, weekMeta: WeekMeta): number;
export declare function resolveUnderdog(g: ScheduleGame): string | null;

export declare function buildTeamStrengths(teams: Record<string, TeamData>): Record<string, TeamStrength>;
export declare function computeTiebreakerReasons(rawTeams: Record<string, TeamData>): Record<string, TiebreakerEntry>;

export interface MultiTieEntry {
  abbr: string;
  /** 1-based position. Tied teams share a rank when a coin toss is reached. */
  rank: number;
  /** Step number that separated this team (0 = last survivor, 12 = coin toss). */
  step: number;
  stepLabel: string;
  /** Human-readable explanation for the UI. */
  detail: string;
}

export interface MultiTieResult {
  ranked: MultiTieEntry[];
  /** True when at least one position could not be resolved and requires a coin toss. */
  coinTossRequired: boolean;
}

/**
 * Rank 3 or more teams with the same win percentage using NFL multi-team
 * tiebreaker rules with the reset rule.
 *
 * Automatically applies division tiebreaker steps when all teams share a
 * division, or wild-card steps (with per-division reduction) otherwise.
 */
export declare function resolveMultiTie(tiedAbbrs: string[], teams: Record<string, TeamData>): MultiTieResult;
export declare function computeStandings(teams: Record<string, TeamData>, tiebreakerReasons: Record<string, TiebreakerEntry>): StandingsResult;
export declare function availableModes(favAbbr: string, teams: Record<string, TeamData>, weekMeta: WeekMeta): string[];
export declare function favTeamGame(favAbbr: string, mode: string, teams: Record<string, TeamData>, schedule: ScheduleGame[], weekMeta: WeekMeta): object | null;
export declare function ownGameImpact(favAbbr: string, mode: string, teams: Record<string, TeamData>, weekMeta: WeekMeta): number;

export declare function modeScore(candidate: string, opponent: string, fav: TeamData, mode: string, dislikes: string[], teams: Record<string, TeamData>, weekMeta: WeekMeta): number;
export declare function computeRecommendations(favAbbr: string, dislikes: string[], mode: string, teams: Record<string, TeamData>, schedule: ScheduleGame[], strengths: Record<string, TeamStrength>, weekMeta: WeekMeta): object[];
export declare function computeScenarios(favAbbr: string, teams: Record<string, TeamData>, schedule: ScheduleGame[], weekMeta: WeekMeta): object[];
