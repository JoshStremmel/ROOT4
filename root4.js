/**
 * ROOT4 — The single canonical NFL calculation engine.
 *
 * All functions are pure: they take data as parameters and read nothing from
 * window.* globals. The main app (src/data.js) wraps these as window.* for
 * its JSX components. The graph app imports them directly via Vite alias.
 *
 * When you change a calculation here, BOTH the main page and the graph view
 * update automatically — there is no other copy of this logic.
 */

/* ─── League-specific static data ────────────────────────────────────────── *
 * The current league is NFL. Its divisions, brand colors, rooting modes, and
 * category/strength metadata live in leagues/nfl/nfl.js — a future league
 * (e.g. leagues/nba/nba.js) would define its own version of these and get
 * selected here instead. Everything below this block is league-agnostic. */
import {
  DIVISIONS, ABBR_ALIAS, normAbbr, TEAM_COLOR_FALLBACK,
  MODES, CATEGORY_META, STRENGTH_WEIGHT, STRENGTH_META,
} from "./leagues/nfl/nfl.js";

export {
  DIVISIONS, ABBR_ALIAS, normAbbr, TEAM_COLOR_FALLBACK,
  MODES, CATEGORY_META, STRENGTH_WEIGHT, STRENGTH_META,
};

/* ─── Core helpers ───────────────────────────────────────────────────────── */

export function winPct(t) {
  const w = t.record[0], l = t.record[1], ties = t.record[2] || 0;
  const games = w + l + ties;
  return games === 0 ? 0 : (w + 0.5 * ties) / games;
}

export function gamesBack(fav, teams) {
  const divLeader = Object.values(teams)
    .filter(t => t.conf === fav.conf && t.div === fav.div)
    .reduce((a, b) => (b.record[0] > a.record[0] ? b : a), fav);
  if (divLeader.abbr === fav.abbr) return 0;
  return ((divLeader.record[0] - fav.record[0]) + (fav.record[1] - divLeader.record[1])) / 2;
}

export function weeksRemainingFrom(weekMeta) {
  return weekMeta?.weeksRemaining ?? 0;
}

export function inDivisionContention(team, teams, weekMeta) {
  return gamesBack(team, teams) <= weeksRemainingFrom(weekMeta);
}

export function maxWins(team, weekMeta) {
  return team.record[0] + weeksRemainingFrom(weekMeta);
}

export function resolveUnderdog(g) {
  if (g.spread != null) {
    if (g.spread < 0) return g.away;
    if (g.spread > 0) return g.home;
  }
  if (g.homeMoneyLine != null && g.awayMoneyLine != null) {
    if (g.homeMoneyLine < g.awayMoneyLine) return g.away;
    if (g.awayMoneyLine < g.homeMoneyLine) return g.home;
  }
  if (g.homeFavorite != null) return g.homeFavorite ? g.away : g.home;
  return null;
}

/* ─── Team strength ──────────────────────────────────────────────────────── */

export function buildTeamStrengths(teams) {
  const out = {};
  const raw = {};
  for (const abbr of Object.keys(teams)) {
    const t = teams[abbr];
    const wp = winPct(t);
    const pd = t.pf - t.pa;
    const recent = t.results.slice(-4);
    const recentWp = recent.length ? recent.filter(r => r.win).length / recent.length : 0;
    const margins = t.results.filter(r => r.win).map(r => r.pf - r.pa);
    let consistency = 0.5;
    if (margins.length >= 2) {
      const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
      const variance = margins.reduce((s, m) => s + (m - mean) * (m - mean), 0) / margins.length;
      consistency = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / 28));
    }
    const divGames = t.results.filter(r => {
      const opp = teams[r.oppAbbr];
      return opp && opp.div === t.div && opp.conf === t.conf;
    });
    const divBonus = divGames.length ? divGames.filter(r => r.win).length / divGames.length : 0.5;
    const oppWps = t.results.map(r => winPct(teams[r.oppAbbr] || { record: [0, 0, 0] }));
    const sos = oppWps.length ? oppWps.reduce((a, b) => a + b, 0) / oppWps.length : 0.5;
    raw[abbr] = { wp, pd, recentWp, consistency, divBonus, sos };
  }
  const pds = Object.values(raw).map(r => r.pd);
  const minPd = Math.min(...pds, 0), maxPd = Math.max(...pds, 0);
  const range = (maxPd - minPd) || 1;
  for (const abbr of Object.keys(raw)) {
    const r = raw[abbr];
    const pointDiff = (r.pd - minPd) / range;
    const strengthScore = Math.max(0, Math.min(1,
      0.35 * r.wp + 0.25 * pointDiff + 0.15 * r.recentWp + 0.10 * r.consistency + 0.10 * r.divBonus + 0.05 * r.sos
    ));
    out[abbr] = {
      strengthScore: +strengthScore.toFixed(2),
      pointDiff:     +pointDiff.toFixed(2),
      sos:           +r.sos.toFixed(2),
      divisionBonus: +r.divBonus.toFixed(2),
      recentForm:    +r.recentWp.toFixed(2),
      winMarginConsistency: +r.consistency.toFixed(2),
    };
  }
  return out;
}

/* ─── Tiebreakers ────────────────────────────────────────────────────────── */

export function computeTiebreakerReasons(rawTeams) {
  if (!rawTeams) return {};

  const pctOf = (res) => {
    if (!res || !res.length) return null;
    const w = res.filter(r => r.win).length, t = res.filter(r => r.tie).length;
    return (w + 0.5 * t) / res.length;
  };
  const netPts = (res) => (res || []).reduce((s, r) => s + (r.pf || 0) - (r.pa || 0), 0);

  const sovOf = (team) => {
    const wins = (team.results || []).filter(r => r.win);
    if (!wins.length) return null;
    let w = 0, l = 0, t = 0;
    for (const r of wins) { const o = rawTeams[r.oppAbbr]; if (!o) continue; w += o.record[0]; l += o.record[1]; t += o.record[2] || 0; }
    const g = w + l + t;
    return g ? (w + 0.5 * t) / g : null;
  };

  const sosOf = (team) => {
    const games = team.results || [];
    if (!games.length) return null;
    let w = 0, l = 0, t = 0;
    for (const r of games) { const o = rawTeams[r.oppAbbr]; if (!o) continue; w += o.record[0]; l += o.record[1]; t += o.record[2] || 0; }
    const g = w + l + t;
    return g ? (w + 0.5 * t) / g : null;
  };

  const commonOf = (a, b) => {
    const aOpps = new Set((a.results || []).map(r => r.oppAbbr).filter(x => x !== b.abbr));
    const bOpps = new Set((b.results || []).map(r => r.oppAbbr).filter(x => x !== a.abbr));
    const common = new Set([...aOpps].filter(x => bOpps.has(x)));
    if (!common.size) return null;
    const ag = (a.results || []).filter(r => common.has(r.oppAbbr));
    const bg = (b.results || []).filter(r => common.has(r.oppAbbr));
    return (ag.length >= 4 && bg.length >= 4) ? [ag, bg] : null;
  };

  const combinedRank = (abbr, pool) => {
    const byPF = [...pool].sort((a, b) => (b.pf || 0) - (a.pf || 0));
    const byPA = [...pool].sort((a, b) => (a.pa || 0) - (b.pa || 0));
    return (byPF.findIndex(t => t.abbr === abbr) + 1) + (byPA.findIndex(t => t.abbr === abbr) + 1);
  };

  const divBreak = (a, b, confPool, allPool) => {
    const h2h = (a.results || []).filter(r => r.oppAbbr === b.abbr);
    const hW = h2h.filter(r => r.win).length, hL = h2h.filter(r => !r.win && !r.tie).length;
    if (h2h.length && hW !== hL) return hW > hL ? `Head-to-head` : null;

    const aDR = (a.results || []).filter(r => { const o = rawTeams[r.oppAbbr]; return o && o.conf === a.conf && o.div === a.div; });
    const bDR = (b.results || []).filter(r => { const o = rawTeams[r.oppAbbr]; return o && o.conf === b.conf && o.div === b.div; });
    const aDp = pctOf(aDR), bDp = pctOf(bDR);
    if (aDp !== null && bDp !== null && Math.abs(aDp - bDp) > 1e-6) {
      if (aDp > bDp) { const w = aDR.filter(r => r.win).length, l = aDR.filter(r => !r.win && !r.tie).length; const bw = bDR.filter(r => r.win).length, bl = bDR.filter(r => !r.win && !r.tie).length; return `Division record (${w}-${l} vs ${bw}-${bl})`; }
      return null;
    }

    const cg = commonOf(a, b);
    if (cg) {
      const [aCG, bCG] = cg;
      const acp = pctOf(aCG), bcp = pctOf(bCG);
      if (acp !== null && bcp !== null && Math.abs(acp - bcp) > 1e-6) {
        if (acp > bcp) { const w = aCG.filter(r => r.win).length, l = aCG.filter(r => !r.win && !r.tie).length; const bw = bCG.filter(r => r.win).length, bl = bCG.filter(r => !r.win && !r.tie).length; return `Common games (${w}-${l} vs ${bw}-${bl})`; }
        return null;
      }
    }

    const aCR = (a.results || []).filter(r => rawTeams[r.oppAbbr]?.conf === a.conf);
    const bCR = (b.results || []).filter(r => rawTeams[r.oppAbbr]?.conf === b.conf);
    const aCp = pctOf(aCR), bCp = pctOf(bCR);
    if (aCp !== null && bCp !== null && Math.abs(aCp - bCp) > 1e-6) {
      if (aCp > bCp) { const w = aCR.filter(r => r.win).length, l = aCR.filter(r => !r.win && !r.tie).length; const bw = bCR.filter(r => r.win).length, bl = bCR.filter(r => !r.win && !r.tie).length; return `Conference record (${w}-${l} vs ${bw}-${bl})`; }
      return null;
    }

    const asv = sovOf(a), bsv = sovOf(b);
    if (asv !== null && bsv !== null && Math.abs(asv - bsv) > 1e-6) return asv > bsv ? `Strength of victory (${asv.toFixed(3)})` : null;

    const ass = sosOf(a), bss = sosOf(b);
    if (ass !== null && bss !== null && Math.abs(ass - bss) > 1e-6) return ass > bss ? `Strength of schedule (${ass.toFixed(3)})` : null;

    const arc = combinedRank(a.abbr, confPool), brc = combinedRank(b.abbr, confPool);
    if (arc !== brc) return arc < brc ? `Conference points rank (#${arc})` : null;

    const ara = combinedRank(a.abbr, allPool), bra = combinedRank(b.abbr, allPool);
    if (ara !== bra) return ara < bra ? `League points rank (#${ara})` : null;

    if (cg) {
      const an = netPts(cg[0]), bn = netPts(cg[1]);
      if (an !== bn) return an > bn ? `Net points, common games (${an > 0 ? '+' : ''}${an})` : null;
    }

    const an = (a.pf || 0) - (a.pa || 0), bn = (b.pf || 0) - (b.pa || 0);
    if (an !== bn) return an > bn ? `Net points in all games (${an > 0 ? '+' : ''}${an})` : null;

    return undefined;
  };

  const wcBreak = (a, b, confPool, allPool) => {
    const h2h = (a.results || []).filter(r => r.oppAbbr === b.abbr);
    const hW = h2h.filter(r => r.win).length, hL = h2h.filter(r => !r.win && !r.tie).length;
    if (h2h.length && hW !== hL) return hW > hL ? `Head-to-head` : null;

    const aCR = (a.results || []).filter(r => rawTeams[r.oppAbbr]?.conf === a.conf);
    const bCR = (b.results || []).filter(r => rawTeams[r.oppAbbr]?.conf === b.conf);
    const aCp = pctOf(aCR), bCp = pctOf(bCR);
    if (aCp !== null && bCp !== null && Math.abs(aCp - bCp) > 1e-6) {
      if (aCp > bCp) { const w = aCR.filter(r => r.win).length, l = aCR.filter(r => !r.win && !r.tie).length; const bw = bCR.filter(r => r.win).length, bl = bCR.filter(r => !r.win && !r.tie).length; return `Conference record (${w}-${l} vs ${bw}-${bl})`; }
      return null;
    }

    const cg = commonOf(a, b);
    if (cg) {
      const [aCG, bCG] = cg;
      const acp = pctOf(aCG), bcp = pctOf(bCG);
      if (acp !== null && bcp !== null && Math.abs(acp - bcp) > 1e-6) {
        if (acp > bcp) { const w = aCG.filter(r => r.win).length, l = aCG.filter(r => !r.win && !r.tie).length; const bw = bCG.filter(r => r.win).length, bl = bCG.filter(r => !r.win && !r.tie).length; return `Common games (${w}-${l} vs ${bw}-${bl})`; }
        return null;
      }
    }

    const asv = sovOf(a), bsv = sovOf(b);
    if (asv !== null && bsv !== null && Math.abs(asv - bsv) > 1e-6) return asv > bsv ? `Strength of victory (${asv.toFixed(3)})` : null;

    const ass = sosOf(a), bss = sosOf(b);
    if (ass !== null && bss !== null && Math.abs(ass - bss) > 1e-6) return ass > bss ? `Strength of schedule (${ass.toFixed(3)})` : null;

    const arc = combinedRank(a.abbr, confPool), brc = combinedRank(b.abbr, confPool);
    if (arc !== brc) return arc < brc ? `Conference points rank (#${arc})` : null;

    const ara = combinedRank(a.abbr, allPool), bra = combinedRank(b.abbr, allPool);
    if (ara !== bra) return ara < bra ? `League points rank (#${ara})` : null;

    const acn = netPts(aCR), bcn = netPts(bCR);
    if (acn !== bcn) return acn > bcn ? `Net points, conference games (${acn > 0 ? '+' : ''}${acn})` : null;

    const an = (a.pf || 0) - (a.pa || 0), bn = (b.pf || 0) - (b.pa || 0);
    if (an !== bn) return an > bn ? `Net points in all games (${an > 0 ? '+' : ''}${an})` : null;

    return undefined;
  };

  const result = {};
  const addResult = (winner, loser, reason) => {
    if (!result[winner.abbr]) result[winner.abbr] = { over: [], reasons: {}, reason };
    if (!result[winner.abbr].over.includes(loser.abbr)) result[winner.abbr].over.push(loser.abbr);
    result[winner.abbr].reasons[loser.abbr] = reason;
  };

  const allPool = Object.values(rawTeams);
  for (const conf of ["AFC", "NFC"]) {
    const confPool = allPool.filter(t => t.conf === conf);
    const byRecord = {};
    for (const t of confPool) {
      const key = `${t.record[0]}-${t.record[1]}-${t.record[2] || 0}`;
      (byRecord[key] = byRecord[key] || []).push(t);
    }
    for (const group of Object.values(byRecord)) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          const fn = a.div === b.div ? divBreak : wcBreak;
          const reason = fn(a, b, confPool, allPool);
          if (reason != null && reason !== undefined) {
            addResult(a, b, reason);
          } else if (reason === null) {
            const rb = fn(b, a, confPool, allPool);
            if (rb != null && rb !== undefined) addResult(b, a, rb);
          }
        }
      }
    }
  }
  return result;
}

/* ─── Multi-team tiebreakers ─────────────────────────────────────────────── */

function _pct(results) {
  if (!results || !results.length) return null;
  const w = results.filter(r => r.win).length, t = results.filter(r => r.tie).length;
  return (w + 0.5 * t) / results.length;
}

function _sov(abbr, teams) {
  const wins = (teams[abbr].results || []).filter(r => r.win);
  if (!wins.length) return null;
  let w = 0, l = 0, t = 0;
  for (const r of wins) { const o = teams[r.oppAbbr]; if (!o) continue; w += o.record[0]; l += o.record[1]; t += o.record[2] || 0; }
  const g = w + l + t;
  return g ? (w + 0.5 * t) / g : null;
}

function _sos(abbr, teams) {
  const games = teams[abbr].results || [];
  if (!games.length) return null;
  let w = 0, l = 0, t = 0;
  for (const r of games) { const o = teams[r.oppAbbr]; if (!o) continue; w += o.record[0]; l += o.record[1]; t += o.record[2] || 0; }
  const g = w + l + t;
  return g ? (w + 0.5 * t) / g : null;
}

// Standard competition (1224) ranking: ties share a rank, the next rank skips.
// ascending=true → smallest value earns rank 1.
function _stdRank(abbr, pool, getter, ascending) {
  const sorted = [...pool].sort((a, b) => ascending ? getter(a) - getter(b) : getter(b) - getter(a));
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && Math.abs(getter(sorted[i]) - getter(sorted[i - 1])) > 1e-9) rank = i + 1;
    if (sorted[i].abbr === abbr) return rank;
  }
  return pool.length;
}

// Combined PF+PA rank within pool (lower = better).
function _combinedRank(abbr, pool) {
  return _stdRank(abbr, pool, t => t.pf || 0, false) +
         _stdRank(abbr, pool, t => t.pa || 0, true);
}

// Find the single leader in group by metricFn.
// Returns { winner: abbr | null, detail: string }.
// winner is null when no clear leader or no data.
function _leader(group, metricFn, higherIsBetter, label) {
  const vals = {};
  for (const a of group) vals[a] = metricFn(a);
  const valid = group.filter(a => vals[a] !== null && vals[a] !== undefined);
  if (!valid.length) return { winner: null, detail: `${label}: no data` };
  valid.sort((a, b) => higherIsBetter ? vals[b] - vals[a] : vals[a] - vals[b]);
  const best = vals[valid[0]];
  const tied = valid.filter(a => Math.abs(vals[a] - best) < 1e-9);
  if (tied.length === 1)
    return { winner: valid[0], detail: `${label}: ${valid[0]} (${typeof best === 'number' ? best.toFixed(3) : best})` };
  return { winner: null, detail: `${label}: still tied (${tied.join(', ')})` };
}

// Intersection of opponents ALL group members have faced, excluding group members.
function _commonOpps(group, teams) {
  const gs = new Set(group);
  let common = null;
  for (const a of group) {
    const opps = new Set((teams[a].results || []).map(r => r.oppAbbr).filter(o => !gs.has(o)));
    common = common === null ? opps : new Set([...common].filter(o => opps.has(o)));
  }
  return common || new Set();
}

// ─── Step functions ────────────────────────────────────────────────────────

function _s_divH2H(group, teams) {
  const gs = new Set(group);
  let total = 0;
  const pcts = {};
  for (const a of group) {
    const h = (teams[a].results || []).filter(r => gs.has(r.oppAbbr));
    total += h.length;
    pcts[a] = _pct(h);
  }
  if (!total) return { winner: null, detail: 'Head-to-head: no games played between the tied teams' };
  return _leader(group, a => pcts[a], true, 'Head-to-head');
}

// WC H2H: one team must have beaten ALL others (or two-team equivalent).
function _s_wcH2HSweep(group, teams) {
  const gs = new Set(group);
  for (const a of group) {
    const beaten = new Set((teams[a].results || []).filter(r => r.win && gs.has(r.oppAbbr)).map(r => r.oppAbbr));
    if (group.filter(o => o !== a).every(o => beaten.has(o)))
      return { winner: a, detail: `Head-to-head sweep: ${a} beat ${group.filter(o => o !== a).join(', ')}` };
  }
  return { winner: null, detail: 'Head-to-head: no team swept all others' };
}

function _s_divRecord(group, teams) {
  const pcts = {};
  for (const a of group) {
    const t = teams[a];
    pcts[a] = _pct((t.results || []).filter(r => { const o = teams[r.oppAbbr]; return o && o.conf === t.conf && o.div === t.div; }));
  }
  return _leader(group, a => pcts[a], true, 'Division record');
}

function _s_confRecord(group, teams) {
  const pcts = {};
  for (const a of group) {
    const t = teams[a];
    pcts[a] = _pct((t.results || []).filter(r => teams[r.oppAbbr]?.conf === t.conf));
  }
  return _leader(group, a => pcts[a], true, 'Conference record');
}

// minGames: minimum common games each team must have (0 = no minimum).
function _s_commonOpps(group, teams, minGames) {
  const cs = _commonOpps(group, teams);
  if (!cs.size) return { winner: null, detail: 'Common opponents: no opponents in common' };
  const pcts = {};
  for (const a of group) {
    const cg = (teams[a].results || []).filter(r => cs.has(r.oppAbbr));
    if (minGames > 0 && cg.length < minGames)
      return { winner: null, detail: `Common opponents: fewer than ${minGames} common games` };
    pcts[a] = _pct(cg);
  }
  return _leader(group, a => pcts[a], true, 'Common opponents');
}

function _s_confRank(group, teams) {
  const conf = teams[group[0]]?.conf;
  const pool = Object.values(teams).filter(t => t.conf === conf);
  return _leader(group, a => _combinedRank(a, pool), false, 'Conference points rank');
}

function _s_allRank(group, teams) {
  return _leader(group, a => _combinedRank(a, Object.values(teams)), false, 'All-team points rank');
}

function _s_netCommon(group, teams) {
  const cs = _commonOpps(group, teams);
  if (!cs.size) return { winner: null, detail: 'Net points (common games): no common opponents' };
  const net = {};
  for (const a of group)
    net[a] = (teams[a].results || []).filter(r => cs.has(r.oppAbbr)).reduce((s, r) => s + (r.pf || 0) - (r.pa || 0), 0);
  return _leader(group, a => net[a], true, 'Net points, common games');
}

function _s_netConf(group, teams) {
  const net = {};
  for (const a of group) {
    const t = teams[a];
    net[a] = (t.results || []).filter(r => teams[r.oppAbbr]?.conf === t.conf).reduce((s, r) => s + (r.pf || 0) - (r.pa || 0), 0);
  }
  return _leader(group, a => net[a], true, 'Net points, conference games');
}

function _s_netAll(group, teams) {
  const net = {};
  for (const a of group) { const t = teams[a]; net[a] = (t.pf || 0) - (t.pa || 0); }
  return _leader(group, a => net[a], true, 'Net points, all games');
}

function _s_netTDs(group, teams) {
  const hasTDs = group.some(a => (teams[a].results || []).some(r => r.tdsFor !== undefined));
  if (!hasTDs) return { winner: null, detail: 'Net touchdowns: data not available' };
  const net = {};
  for (const a of group)
    net[a] = (teams[a].results || []).reduce((s, r) => s + (r.tdsFor || 0) - (r.tdsAgainst || 0), 0);
  return _leader(group, a => net[a], true, 'Net touchdowns, all games');
}

// ─── Step lists ────────────────────────────────────────────────────────────

function _divSteps(group, teams) {
  return [
    { num: 1,  label: 'Head-to-head',               run: () => _s_divH2H(group, teams) },
    { num: 2,  label: 'Division record',             run: () => _s_divRecord(group, teams) },
    { num: 3,  label: 'Common opponents',            run: () => _s_commonOpps(group, teams, 0) },
    { num: 4,  label: 'Conference record',           run: () => _s_confRecord(group, teams) },
    { num: 5,  label: 'Strength of victory',         run: () => _leader(group, a => _sov(a, teams), true, 'Strength of victory') },
    { num: 6,  label: 'Strength of schedule',        run: () => _leader(group, a => _sos(a, teams), true, 'Strength of schedule') },
    { num: 7,  label: 'Conference points rank',      run: () => _s_confRank(group, teams) },
    { num: 8,  label: 'All-team points rank',        run: () => _s_allRank(group, teams) },
    { num: 9,  label: 'Net points, common games',    run: () => _s_netCommon(group, teams) },
    { num: 10, label: 'Net points, all games',       run: () => _s_netAll(group, teams) },
    { num: 11, label: 'Net touchdowns',              run: () => _s_netTDs(group, teams) },
  ];
}

function _wcSteps(group, teams) {
  return [
    { num: 2,  label: 'Head-to-head sweep',          run: () => _s_wcH2HSweep(group, teams) },
    { num: 3,  label: 'Conference record',           run: () => _s_confRecord(group, teams) },
    { num: 4,  label: 'Common opponents (4+ games)', run: () => _s_commonOpps(group, teams, 4) },
    { num: 5,  label: 'Strength of victory',         run: () => _leader(group, a => _sov(a, teams), true, 'Strength of victory') },
    { num: 6,  label: 'Strength of schedule',        run: () => _leader(group, a => _sos(a, teams), true, 'Strength of schedule') },
    { num: 7,  label: 'Conference points rank',      run: () => _s_confRank(group, teams) },
    { num: 8,  label: 'All-team points rank',        run: () => _s_allRank(group, teams) },
    { num: 9,  label: 'Net points, conference games', run: () => _s_netConf(group, teams) },
    { num: 10, label: 'Net points, all games',       run: () => _s_netAll(group, teams) },
    { num: 11, label: 'Net touchdowns',              run: () => _s_netTDs(group, teams) },
  ];
}

// ─── Division reduction (WC Step 1) ────────────────────────────────────────
// Returns one representative per division. Calls _rankGroup with 'division'
// for any division that has multiple entries — no infinite recursion because
// _rankGroup never calls _divReduce when forcedType === 'division'.

function _divReduce(group, teams) {
  const byDiv = {};
  for (const a of group) {
    const key = `${teams[a].conf}:${teams[a].div}`;
    (byDiv[key] = byDiv[key] || []).push(a);
  }
  return Object.values(byDiv).map(members =>
    members.length === 1 ? members[0] : _rankGroup(members, teams, 'division').ranked[0].abbr
  );
}

// ─── Core ranking engine ────────────────────────────────────────────────────

function _rankGroup(group, teams, forcedType) {
  const ranked = [];
  let remaining = [...group];
  let rank = 1;

  while (remaining.length > 1) {
    const tieType = forcedType ||
      (new Set(remaining.map(a => `${teams[a]?.conf}:${teams[a]?.div}`)).size === 1 ? 'division' : 'wildcard');

    // For wild card ties, reduce each division to one representative first.
    let active = remaining;
    if (tieType === 'wildcard') {
      const reps = _divReduce(remaining, teams);
      if (reps.length < remaining.length) active = reps;
    }

    const steps = tieType === 'division' ? _divSteps(active, teams) : _wcSteps(active, teams);
    let winner = null, resolvedStep = null;
    for (const s of steps) {
      const res = s.run();
      if (res.winner) { winner = res.winner; resolvedStep = { step: s.num, stepLabel: s.label, detail: res.detail }; break; }
    }

    if (!winner) {
      for (const a of remaining)
        ranked.push({ abbr: a, rank, step: 12, stepLabel: 'Coin toss', detail: 'Cannot be determined — coin toss required' });
      return { ranked, coinTossRequired: true };
    }

    ranked.push({ abbr: winner, rank, ...resolvedStep });
    remaining = remaining.filter(a => a !== winner);
    rank++;
    // Remaining teams restart at Step 1 on the next iteration (reset rule).
    // If 3+ → 2, the same step functions handle the two-team case naturally:
    // the WC "sweep" requirement reduces to a plain head-to-head win.
  }

  if (remaining.length === 1)
    ranked.push({ abbr: remaining[0], rank, step: 0, stepLabel: 'Last remaining', detail: 'All other tied teams ranked above' });

  return { ranked, coinTossRequired: false };
}

/**
 * Rank 3 or more teams with the same win percentage using NFL multi-team
 * tiebreaker rules.
 *
 * Uses division tiebreaker steps when all teams share a division; wild-card
 * steps (with per-division reduction as Step 1) otherwise.
 *
 * Reset rule: after one team separates, the remaining teams restart at Step 1.
 * When the group falls to two teams, the same step functions handle the
 * two-team format — the wild-card "sweep" requirement equals a plain head-to-
 * head win for two teams, so no special casing is needed.
 *
 * Step 11 (net touchdowns) is silently skipped when GameResult objects do not
 * carry tdsFor/tdsAgainst fields.
 *
 * @param {string[]} tiedAbbrs  abbreviations of the tied teams (≥ 2)
 * @param {Record<string, TeamData>} teams  all teams in the league
 * @returns {{ ranked: MultiTieEntry[], coinTossRequired: boolean }}
 */
export function resolveMultiTie(tiedAbbrs, teams) {
  if (!tiedAbbrs || tiedAbbrs.length < 2)
    return {
      ranked: (tiedAbbrs || []).map(a => ({ abbr: a, rank: 1, step: 0, stepLabel: 'Only team', detail: '' })),
      coinTossRequired: false,
    };
  return _rankGroup([...tiedAbbrs], teams, null);
}

/* ─── Standings ──────────────────────────────────────────────────────────── */

export function computeStandings(teams, tiebreakerReasons) {
  const teamList = Object.values(teams || {});
  const tb = tiebreakerReasons || {};

  const sortByPct = (a, b) => {
    const pd = winPct(b) - winPct(a);
    if (Math.abs(pd) > 1e-6) return pd;
    if (b.record[0] !== a.record[0]) return b.record[0] - a.record[0];
    if (tb[a.abbr]?.over.includes(b.abbr)) return -1;
    if (tb[b.abbr]?.over.includes(a.abbr)) return 1;
    return 0;
  };

  const gb = (leader, team) =>
    ((leader.record[0] - team.record[0]) + (team.record[1] - leader.record[1])) / 2;

  const out = { AFC: [], NFC: [], byTeam: {}, divisions: {} };

  for (const conf of ["AFC", "NFC"]) {
    const divs = {};
    for (const t of teamList.filter(t => t.conf === conf)) (divs[t.div] = divs[t.div] || []).push(t);
    for (const d of Object.keys(divs)) divs[d].sort(sortByPct);
    out.divisions[conf] = divs;

    const order = ["East", "North", "South", "West"].filter(d => divs[d]);
    const winners = order.map(d => divs[d][0]).filter(Boolean).sort(sortByPct);
    winners.forEach((t, i) => {
      out[conf].push({ seed: i + 1, team: t.abbr, kind: "division" });
      out.byTeam[t.abbr] = { seed: i + 1, kind: "division", conf };
    });
    const winnersSet = new Set(winners.map(t => t.abbr));
    const rest = teamList.filter(t => t.conf === conf && !winnersSet.has(t.abbr)).sort(sortByPct);
    for (let i = 0; i < 3 && i < rest.length; i++) {
      out[conf].push({ seed: 5 + i, team: rest[i].abbr, kind: "wildcard" });
      out.byTeam[rest[i].abbr] = { seed: 5 + i, kind: "wildcard", conf };
    }
    const lastWC = rest[2];
    for (let i = 3; i < rest.length; i++) {
      const g = lastWC ? gb(lastWC, rest[i]) : null;
      out.byTeam[rest[i].abbr] = { seed: null, kind: "out", conf, gamesBehind: g > 0 ? g : null };
    }
  }

  for (const conf of ["AFC", "NFC"]) {
    for (const div of ["North", "South", "East", "West"]) {
      const divTeams = (out.divisions[conf] || {})[div];
      if (!divTeams || !divTeams.length) continue;
      const leader = divTeams[0];
      for (const t of divTeams) {
        const g = gb(leader, t);
        if (out.byTeam[t.abbr]) out.byTeam[t.abbr].gamesBehind = g > 0 ? g : null;
      }
    }
  }

  return out;
}

/* ─── Available modes ────────────────────────────────────────────────────── */

export function availableModes(favAbbr, teams, weekMeta) {
  const fav = teams[favAbbr];
  if (!fav) return ["overall", "tank"];
  const wr = weeksRemainingFrom(weekMeta);
  const mxW = (t) => t.record[0] + wr;
  const all = ["overall"];
  const divPeers = Object.values(teams).filter(t => t.conf === fav.conf && t.div === fav.div && t.abbr !== favAbbr);
  if (divPeers.every(p => p.record[0] <= mxW(fav))) all.push("division");
  const confNonDiv = Object.values(teams).filter(t => t.conf === fav.conf && t.div !== fav.div && t.abbr !== favAbbr);
  if (confNonDiv.filter(t => t.record[0] > mxW(fav)).length < 3) all.push("wildcard");
  const confPeers = Object.values(teams).filter(t => t.conf === fav.conf && t.abbr !== favAbbr);
  if (confPeers.every(p => p.record[0] <= mxW(fav))) all.push("conf_one_seed");
  all.push("tank");
  return all;
}

/* ─── Favorite team's own game ───────────────────────────────────────────── */

export function favTeamGame(favAbbr, mode = "overall", teams, schedule, weekMeta) {
  const ours = (schedule || []).filter(g => g.home === favAbbr || g.away === favAbbr);
  if (!ours.length) return null;
  const upcoming = ours.find(g => !g.completed);
  const g = upcoming || ours[ours.length - 1];
  const fav = teams[favAbbr];
  const oppAbbr = g.home === favAbbr ? g.away : g.home;
  const opp = teams[oppAbbr];
  const isHome = g.home === favAbbr;

  if (g.completed && !upcoming) {
    const favScore = isHome ? g.homeScore : g.awayScore;
    const oppScore = isHome ? g.awayScore : g.homeScore;
    const won = favScore != null && oppScore != null && favScore > oppScore;
    const tied = favScore != null && favScore === oppScore;
    const verb = tied ? "tied" : won ? "beat" : "lost to";
    const blurb = tied
      ? `${favAbbr} and ${oppAbbr} tied ${favScore}-${oppScore}.`
      : won
        ? `${favAbbr} ${verb} ${oppAbbr} ${favScore}-${oppScore}.`
        : `${favAbbr} ${verb} ${oppAbbr} ${oppScore}-${favScore}.`;
    return { ...g, fav: favAbbr, opp: oppAbbr, isHome, blurb, underdog: null, completed: true, favScore, oppScore, won, tied };
  }

  const fGB = gamesBack(fav, teams);
  const wr = weeksRemainingFrom(weekMeta);
  const isDivRival = opp.div === fav.div && opp.conf === fav.conf;

  let blurb = "";
  if (mode === "tank") {
    blurb = `TANK mode: root for ${oppAbbr} (${opp.record[0]}-${opp.record[1]}) to WIN — a ${favAbbr} loss improves your draft slot.`;
  } else if (mode === "division" || inDivisionContention(fav, teams, weekMeta)) {
    if (fGB === 0) {
      // Check if a win would clinch the division outright
      const winClinches = Object.values(teams)
        .filter(t => t.conf === fav.conf && t.div === fav.div && t.abbr !== favAbbr)
        .every(r => {
          const rPlayed = r.record[0] + r.record[1] + (r.record[2] || 0);
          return (fav.record[0] + 1) > (r.record[0] + Math.max(0, 17 - rPlayed));
        });
      if (winClinches) {
        blurb = isDivRival
          ? `A win clinches the ${fav.div} division title — beat ${oppAbbr} to lock it up!`
          : `Win to CLINCH the ${fav.div} division title!`;
      } else {
        blurb = isDivRival
          ? `Win to extend your division lead over ${oppAbbr} (${gamesBack(opp, teams).toFixed(1)} GB behind, ${wr} week${wr !== 1 ? 's' : ''} left).`
          : `Win to stay atop the ${fav.div} (${wr} week${wr !== 1 ? 's' : ''} left).`;
      }
    } else {
      blurb = isDivRival
        ? `Win to cut the gap — ${favAbbr} is ${fGB.toFixed(1)} GB back with ${wr} week${wr !== 1 ? 's' : ''} left.`
        : `Win to stay in the ${fav.div} race (${fGB.toFixed(1)} GB back, ${wr} week${wr !== 1 ? 's' : ''} left).`;
    }
  } else if (mode === "conf_one_seed") {
    const leader = Object.values(teams).filter(t => t.conf === fav.conf)
      .reduce((a, b) => b.record[0] > a.record[0] ? b : a, fav);
    blurb = `Win to chase the ${fav.conf} #1 seed (${leader.record[0] - fav.record[0]}W behind ${leader.abbr}, ${wr} weeks left).`;
  } else {
    blurb = `Win to strengthen your ${fav.conf} wildcard position.`;
  }

  let underdog = null;
  if (g.spread != null) underdog = g.spread < 0 ? g.away : (g.spread > 0 ? g.home : null);
  else if (g.homeFavorite != null) underdog = g.homeFavorite ? g.away : g.home;

  return { ...g, fav: favAbbr, opp: oppAbbr, isHome, blurb, underdog, completed: false };
}

/* ─── Own-game impact score ──────────────────────────────────────────────── */

export function ownGameImpact(favAbbr, mode, teams, weekMeta) {
  const fav = teams?.[favAbbr];
  if (!fav) return 1.0;
  const gamesPlayed = fav.record[0] + fav.record[1] + (fav.record[2] || 0);
  const rem = Math.max(0, 17 - gamesPlayed);
  if (rem === 0) return 0;
  if (mode === "tank") return 1.0;
  const confTeams = Object.values(teams).filter(t => t.conf === fav.conf && t.abbr !== favAbbr);
  const maxFavWins = fav.record[0] + rem;
  const eliminated = confTeams.filter(t => t.record[0] > maxFavWins).length >= 7;
  if (eliminated) return 0;
  if (mode === "conf_one_seed") {
    const tiebreakerReasons = computeTiebreakerReasons(teams);
    const standings = computeStandings(teams, tiebreakerReasons);
    const seed = standings.byTeam[favAbbr] || {};
    if (seed.seed === 1) {
      const closest = confTeams.slice().sort((a, b) => b.record[0] - a.record[0])[0];
      if (!closest || closest.record[0] + (Math.max(0, 17 - (closest.record[0] + closest.record[1] + (closest.record[2] || 0)))) < fav.record[0]) return 0;
    }
  }
  return 1.0;
}

/* ─── Recommendation internals ───────────────────────────────────────────── */

// True when a team is mathematically eliminated from all playoff contention:
// 7+ conference teams already have more wins than this team can possibly reach.
function _elimFromPlayoffs(team, teams) {
  const played = team.record[0] + team.record[1] + (team.record[2] || 0);
  const maxWins = team.record[0] + Math.max(0, 17 - played);
  const confPeers = Object.values(teams).filter(t => t.conf === team.conf && t.abbr !== team.abbr);
  return confPeers.filter(t => t.record[0] > maxWins).length >= 7;
}

// True when a team is mathematically eliminated from winning their division:
// a divisional rival already has more wins than this team can possibly reach.
function _elimFromDivision(team, teams) {
  const played = team.record[0] + team.record[1] + (team.record[2] || 0);
  const maxWins = team.record[0] + Math.max(0, 17 - played);
  return Object.values(teams).some(
    t => t.conf === team.conf && t.div === team.div && t.abbr !== team.abbr && t.record[0] > maxWins
  );
}

// True when a team has clinched their division: their current wins exceed
// the maximum possible wins of every divisional rival.
function _clinched(team, teams) {
  const rivals = Object.values(teams).filter(t => t.conf === team.conf && t.div === team.div && t.abbr !== team.abbr);
  if (!rivals.length) return false;
  return rivals.every(r => {
    const rPlayed = r.record[0] + r.record[1] + (r.record[2] || 0);
    return team.record[0] > r.record[0] + Math.max(0, 17 - rPlayed);
  });
}

// True when a non-division-leader team is eliminated from wild card contention:
// 3+ other non-division-leader conference teams already have more wins than this team
// can possibly reach. Division leaders compete for div seeds rather than WC spots, so
// they're excluded from the blocker count.
function _elimFromWildcard(team, teams) {
  const played = team.record[0] + team.record[1] + (team.record[2] || 0);
  const maxWins = team.record[0] + Math.max(0, 17 - played);
  const conf = team.conf;
  const divLeaderAbbrs = new Set();
  const divs = [...new Set(Object.values(teams).filter(t => t.conf === conf).map(t => t.div))];
  for (const div of divs) {
    const divTeams = Object.values(teams).filter(t => t.conf === conf && t.div === div);
    const leader = divTeams.reduce((best, t) => winPct(t) > winPct(best) ? t : best, divTeams[0]);
    divLeaderAbbrs.add(leader.abbr);
  }
  if (divLeaderAbbrs.has(team.abbr)) return false;
  const rivals = Object.values(teams).filter(
    t => t.conf === conf && t.abbr !== team.abbr && !divLeaderAbbrs.has(t.abbr)
  );
  return rivals.filter(t => t.record[0] > maxWins).length >= 3;
}

export function modeScore(candidate, opponent, fav, mode, dislikes, teams, weekMeta) {
  const o = teams[opponent];
  if (!o) return 0;
  const isSameDiv = o.div === fav.div && o.conf === fav.conf;
  const isSameConf = o.conf === fav.conf;
  const wr = weeksRemainingFrom(weekMeta);
  const favGB = gamesBack(fav, teams);
  let score = 0;

  if (mode === "division") {
    // Score only when both teams are mathematically alive in their division race.
    if (isSameDiv && !_elimFromDivision(fav, teams) && !_elimFromDivision(o, teams)) {
      const urgency = Math.max(0, 1 - favGB / Math.max(wr, 1));
      score += 0.25 + 0.25 * urgency;
    }
  } else if (mode === "wildcard") {
    // Clinched teams hold a division seed and are no longer in the wild card pool.
    if (isSameConf && !_elimFromPlayoffs(o, teams) && !_clinched(o, teams)) score += 0.20;
  } else if (mode === "conf_one_seed") {
    if (isSameConf && !_elimFromPlayoffs(o, teams)) score += 0.20 + 0.10 * Math.min(o.record[0] / 17, 1);
  } else { // overall
    if (isSameDiv && !_elimFromDivision(fav, teams) && !_elimFromDivision(o, teams)) {
      // Division race is active for both — weight by urgency
      const urgency = Math.max(0, 1 - favGB / Math.max(wr, 1));
      score += 0.20 + 0.20 * urgency;
    } else if (isSameConf && !_elimFromPlayoffs(o, teams) && !_clinched(o, teams)) {
      // Conference competitor (including div rivals who fell out of the div race)
      score += 0.20;
    }
  }
  // Seeding fallback: when a conf team has clinched their division they're
  // definitely in the playoffs and their result still affects seed position.
  // Only applies to clinched teams — eliminated-but-not-clinched teams have
  // no playoff relevance and should score 0.
  if (score < 0.06 && isSameConf && !_elimFromPlayoffs(fav, teams) && _clinched(o, teams)) {
    score = 0.06;
  }
  if (dislikes.includes(opponent)) score += 0.15;
  const favPct = winPct(fav), oppPct = winPct(o);
  score += Math.max(0, 0.10 - Math.abs(favPct - oppPct) * 0.2);
  return score;
}

export function scenarioRows(home, away, fav, dislikes, mode, futureFavOpponents, teams, weekMeta) {
  const out = [];
  const homeT = teams[home], awayT = teams[away];

  // Division rivals — root against them (weight 0.50 beats every other category).
  // Include specific games-back context so the reasoning reflects the actual standing.
  const homeIsDivRival = homeT.div === fav.div && homeT.conf === fav.conf && home !== fav.abbr;
  const awayIsDivRival = awayT.div === fav.div && awayT.conf === fav.conf && away !== fav.abbr;
  const _divGB = (rival) => {
    const gb = ((fav.record[0] - rival.record[0]) + (rival.record[1] - fav.record[1])) / 2;
    if (Math.abs(gb) < 0.1) return `tied with you in the ${fav.div}`;
    return gb > 0
      ? `${gb.toFixed(1)} GB behind you in the ${fav.div}`
      : `${(-gb).toFixed(1)} GB ahead of you in the ${fav.div}`;
  };
  if (homeIsDivRival && awayIsDivRival) {
    // Prefer the rival that's still alive in the division race as the "bigger threat".
    // If both or neither are alive, fall back to win pct.
    const homeAlive = !_elimFromDivision(homeT, teams);
    const awayAlive = !_elimFromDivision(awayT, teams);
    const biggerThreat = homeAlive && !awayAlive ? home
                       : awayAlive && !homeAlive ? away
                       : winPct(homeT) >= winPct(awayT) ? home : away;
    const rootSide = biggerThreat === home ? away : home;
    const bt = teams[biggerThreat];
    const btAlive = !_elimFromDivision(bt, teams);
    out.push({
      root_for: rootSide, against: biggerThreat,
      category: "DivisionRivalTank", strength: "high", strength_weight: 0.50,
      why: btAlive
        ? `${biggerThreat} (${bt.record[0]}-${bt.record[1]}, ${_divGB(bt)}) is the bigger division threat`
        : `${biggerThreat} (${bt.record[0]}-${bt.record[1]}) is a division rival`,
    });
  } else if (homeIsDivRival) {
    const alive = !_elimFromDivision(homeT, teams);
    out.push({ root_for: away, against: home, category: "DivisionRivalTank", strength: "high", strength_weight: 0.50,
      why: alive
        ? `${home} (${homeT.record[0]}-${homeT.record[1]}) is a division rival, ${_divGB(homeT)}`
        : `${home} (${homeT.record[0]}-${homeT.record[1]}) is a division rival` });
  } else if (awayIsDivRival) {
    const alive = !_elimFromDivision(awayT, teams);
    out.push({ root_for: home, against: away, category: "DivisionRivalTank", strength: "high", strength_weight: 0.50,
      why: alive
        ? `${away} (${awayT.record[0]}-${awayT.record[1]}) is a division rival, ${_divGB(awayT)}`
        : `${away} (${awayT.record[0]}-${awayT.record[1]}) is a division rival` });
  }

  for (const team of [home, away]) {
    if (!futureFavOpponents.has(team)) continue;
    const opp = team === home ? away : home;
    const t = teams[team];
    const w = t.record[0], l = t.record[1];
    if (w > l) {
      out.push({ root_for: opp, against: team, category: "OpponentTanking", strength: "medium", strength_weight: STRENGTH_WEIGHT.medium, why: `${team} (${w}-${l}) is an upcoming opponent on a winning record — cool their momentum` });
    } else if (l > w) {
      out.push({ root_for: opp, against: team, category: "OpponentTanking", strength: "medium", strength_weight: STRENGTH_WEIGHT.medium, why: `${team} (${w}-${l}) is an upcoming opponent on a skid — keep their locker room fractured` });
    }
  }

  if (mode !== "division") {
    for (const team of [home, away]) {
      const t = teams[team];
      if (team === fav.abbr || t.conf !== fav.conf) continue;
      if (t.record[0] > t.record[1] && !_elimFromWildcard(t, teams) && !_elimFromPlayoffs(fav, teams) && !_clinched(t, teams)) {
        const opp = team === home ? away : home;
        const favWP = winPct(fav), teamWP = winPct(t);
        const posnTarget = { division: "division title odds", conf_one_seed: "#1 seed odds" }[mode] || "wild card odds";
        let posnStr;
        if (teamWP > favWP + 0.01) {
          posnStr = `(${t.record[0]}-${t.record[1]}) holds a spot above you — their loss improves your ${posnTarget}`;
        } else if (teamWP >= favWP - 0.01) {
          posnStr = `(${t.record[0]}-${t.record[1]}) is level with you — their loss gives you the edge in ${posnTarget}`;
        } else {
          posnStr = `(${t.record[0]}-${t.record[1]}) is behind you — their loss strengthens your ${posnTarget}`;
        }
        out.push({ root_for: opp, against: team, category: "PlayoffSoftening", strength: "high", strength_weight: STRENGTH_WEIGHT.high,
          why: `${team} ${posnStr}` });
      }
    }
  }

  if (mode !== "division") {
    if (homeT.conf === fav.conf && home !== fav.abbr) {
      const gap = homeT.record[0] - awayT.record[0];
      if (gap >= 4) {
        out.push({ root_for: away, against: home, category: "UpsetRooting", strength: "medium", strength_weight: STRENGTH_WEIGHT.medium, why: `${home} (${homeT.record[0]}-${homeT.record[1]}) is a heavy home favorite vs ${away} (${awayT.record[0]}-${awayT.record[1]}, ${gap}-win gap) — trap-game upset` });
      }
    }
  }

  // Draft positioning only makes sense when fav is already eliminated from playoffs.
  // Suggesting draft picks while fav still has playoff stakes is a distraction.
  if ((mode === "overall" || mode === "wildcard") && _elimFromPlayoffs(fav, teams)) {
    for (const team of [home, away]) {
      if (team === fav.abbr) continue;
      const t = teams[team];
      const isDivRival = t.div === fav.div && t.conf === fav.conf;
      const isConfThreat = t.conf === fav.conf;
      if (!(isDivRival || isConfThreat)) continue;
      const w = t.record[0];
      if (w >= 6 && w <= 9) {
        const opp = team === home ? away : home;
        const label = isDivRival ? "division rival" : "conference threat";
        out.push({ root_for: opp, against: team, category: "DraftPositioning", strength: "low", strength_weight: STRENGTH_WEIGHT.low, why: `${team} (${t.record[0]}-${t.record[1]}) is a ${label} stuck in no man's land — keep them losing` });
      }
    }
  }

  for (const team of [home, away]) {
    if (dislikes.includes(team)) {
      const opp = team === home ? away : home;
      out.push({ root_for: opp, against: team, category: "Dislikes", strength: "medium", strength_weight: STRENGTH_WEIGHT.medium, why: `you dislike ${team}` });
    }
  }

  // SOV: if fav beat one of these teams earlier, root for them to keep winning
  // (higher opp win pct = fav's win over them looks more impressive).
  // Only applies to non-division rivals (those are already handled above).
  for (const team of [home, away]) {
    if (team === fav.abbr) continue;
    const t = teams[team];
    if (t.div === fav.div && t.conf === fav.conf) continue;
    const favBeatThem = (fav.results || []).some(r => r.win && r.oppAbbr === team);
    if (favBeatThem) {
      out.push({
        root_for: team, against: team === home ? away : home,
        category: "SOVRooting", strength: "low", strength_weight: STRENGTH_WEIGHT.low,
        why: `You beat ${team} earlier this season — root for them to keep winning and make that win look better`,
      });
    }
  }

  return out;
}

export function scoreGameTank(home, away, fav, teams, weekMeta) {
  if (home === fav.abbr || away === fav.abbr) return null;
  const favWins = fav.record[0];
  const hW = teams[home].record[0], aW = teams[away].record[0];
  const [rootAbbr, againstAbbr, rootWins] = hW <= aW ? [home, away, hW] : [away, home, aW];
  const minGap = Math.min(Math.abs(hW - favWins), Math.abs(aW - favWins));
  let base = minGap === 0 ? 0.5 : minGap === 1 ? 0.35 : minGap === 2 ? 0.20 : minGap === 3 ? 0.10 : 0.05;
  const isDivRival = teams[rootAbbr].div === fav.div && teams[rootAbbr].conf === fav.conf;
  if (isDivRival) base = Math.min(base + 0.15, 1.0);
  const rootT = teams[rootAbbr];
  const rootRec = `${rootT.record[0]}-${rootT.record[1]}`;
  let why;
  if (rootWins < favWins) why = `${rootAbbr} (${rootRec}) is below you — their win brings them up and protects your draft slot`;
  else if (rootWins === favWins) why = `${rootAbbr} (${rootRec}) is tied with you — their win separates them from your draft range`;
  else why = `neither team threatens your draft slot; root for the worse-record team to clear the field`;
  const strength = base >= 0.35 ? "high" : (base >= 0.20 ? "medium" : "low");
  return { rootFor: rootAbbr, against: againstAbbr, score: base, strength, strength_weight: STRENGTH_WEIGHT[strength], category: "TankPositioning", reasonsAll: [why] };
}

export function buildReasoning(rootAbbr, againstAbbr, fav, mode, score, teams, weekMeta) {
  const parts = [];
  const opp = teams[againstAbbr];
  const targetByMode = { division: "division title odds", conf_one_seed: "#1 seed odds", wildcard: "wild card odds", overall: "wild card odds", tank: "draft slot" };
  const target = targetByMode[mode];
  const isDivRival = opp.div === fav.div && opp.conf === fav.conf;
  // Division rival reasoning only when BOTH teams are alive in the division race.
  // If either is eliminated, they fall through to conference competitor logic below.
  if (isDivRival && !_elimFromDivision(fav, teams) && !_elimFromDivision(opp, teams)) {
    const fGB = gamesBack(fav, teams), oGB = gamesBack(opp, teams), wr = weeksRemainingFrom(weekMeta);
    if (inDivisionContention(fav, teams, weekMeta) && inDivisionContention(opp, teams, weekMeta)) {
      let gbStr;
      if (fGB === 0 && oGB > 0) gbStr = `${againstAbbr} is ${oGB.toFixed(1)} GB behind you`;
      else if (oGB === 0 && fGB > 0) gbStr = `you are ${fGB.toFixed(1)} GB behind ${againstAbbr}`;
      else if (fGB < oGB) gbStr = `${againstAbbr} is ${(oGB - fGB).toFixed(1)} GB behind you`;
      else if (oGB < fGB) gbStr = `you are ${(fGB - oGB).toFixed(1)} GB behind ${againstAbbr}`;
      else gbStr = "tied in the division";
      parts.push(`${againstAbbr} is a division rival in a title race (${gbStr}, ${wr} week${wr !== 1 ? 's' : ''} left) — their loss directly helps your ${target}`);
    } else {
      parts.push(`${againstAbbr} is a division rival — their loss improves ${target}`);
    }
  } else if (opp.conf === fav.conf) {
    const oppElim = _elimFromPlayoffs(opp, teams);
    const oppWCElim = _elimFromWildcard(opp, teams);
    const favElim = _elimFromPlayoffs(fav, teams);
    const oppClinched = _clinched(opp, teams);
    if (mode === "conf_one_seed") {
      if (!oppElim) {
        const clinchNote = oppClinched ? `, clinched the ${opp.conf} ${opp.div},` : '';
        parts.push(`${againstAbbr}${clinchNote} (${opp.record[0]}-${opp.record[1]}) is a ${fav.conf} rival — their loss improves ${target}`);
      }
    } else if (oppClinched) {
      // Issue 3: team has clinched their division — note it so the user knows the game
      // only affects seeding, not the wild card race
      parts.push(`${againstAbbr} has clinched the ${opp.conf} ${opp.div} — this game only affects conference seeding`);
    } else if (!oppWCElim && !favElim) {
      // Verify fav can actually reach a wild card spot, not just "not technically eliminated"
      const wr = weeksRemainingFrom(weekMeta);
      const favMaxWins = fav.record[0] + wr;
      const wcBlockers = Object.values(teams).filter(
        t => t.conf === fav.conf && t.div !== fav.div && t.abbr !== fav.abbr && t.record[0] > favMaxWins
      ).length;
      if (wcBlockers < 3) {
        const favWP = winPct(fav), oppWP = winPct(opp);
        let standingStr;
        if (oppWP > favWP + 0.005) {
          standingStr = `(${opp.record[0]}-${opp.record[1]}) holds a spot above you — their loss helps your ${target}`;
        } else if (favWP > oppWP + 0.005) {
          standingStr = `(${opp.record[0]}-${opp.record[1]}) is behind you — their loss strengthens your ${target}`;
        } else {
          standingStr = `(${opp.record[0]}-${opp.record[1]}) is level with you — their loss helps your ${target}`;
        }
        parts.push(`${againstAbbr} ${standingStr}`);
      }
    }
  }
  return parts.length ? parts : ["no direct playoff impact"];
}

/* ─── Main computations ──────────────────────────────────────────────────── */

export function computeRecommendations(favAbbr, dislikes, mode = "overall", teams, schedule, strengths, weekMeta) {
  const fav = teams?.[favAbbr];
  if (!fav) return [];
  dislikes = (dislikes || []).map(d => d.toUpperCase());
  const futureFavOpponents = new Set(
    (schedule || []).filter(g => g.home === favAbbr || g.away === favAbbr).map(g => g.home === favAbbr ? g.away : g.home)
  );

  const recs = [];
  for (const g of (schedule || [])) {
    if (g.home === favAbbr || g.away === favAbbr) continue;
    if (g.completed) continue;

    if (mode === "tank") {
      const r = scoreGameTank(g.home, g.away, fav, teams, weekMeta);
      if (r) recs.push({ gameId: g.id, ...r, kickoff: g.kickoff, network: g.network, slot: g.slot, spread: g.spread, underdog: resolveUnderdog(g), reasoning: r.reasonsAll[0] });
      continue;
    }

    let playoffRoot = null, playoffAgainst = null, playoffScore = 0;
    const homeT = teams[g.home], awayT = teams[g.away];
    if (homeT.conf === fav.conf || awayT.conf === fav.conf) {
      const h = modeScore(g.home, g.away, fav, mode, dislikes, teams, weekMeta);
      const a = modeScore(g.away, g.home, fav, mode, dislikes, teams, weekMeta);
      const underdog = resolveUnderdog(g);
      const _ud = 0.02;
      const adjH = h + (g.home === underdog ? _ud : 0);
      const adjA = a + (g.away === underdog ? _ud : 0);
      if (adjH >= adjA) { playoffRoot = g.home; playoffAgainst = g.away; playoffScore = h; }
      else              { playoffRoot = g.away; playoffAgainst = g.home; playoffScore = a; }
    } else {
      playoffRoot = g.home; playoffAgainst = g.away; playoffScore = 0;
    }

    const scenarios = scenarioRows(g.home, g.away, fav, dislikes, mode, futureFavOpponents, teams, weekMeta);
    const homeWeight = scenarios.filter(s => s.root_for === g.home).reduce((a, b) => a + b.strength_weight, 0);
    const awayWeight = scenarios.filter(s => s.root_for === g.away).reduce((a, b) => a + b.strength_weight, 0);

    let rootAbbr, againstAbbr, category, strength, strengthWeight, score, reasonsAll;
    if (homeWeight > 0 || awayWeight > 0) {
      const winnerSide = homeWeight >= awayWeight ? g.home : g.away;
      rootAbbr = winnerSide;
      againstAbbr = winnerSide === g.home ? g.away : g.home;
      const matching = scenarios.filter(s => s.root_for === rootAbbr).sort((a, b) => b.strength_weight - a.strength_weight);
      const primary = matching[0];
      category = primary.category;
      strength = primary.strength;
      strengthWeight = primary.strength_weight;
      score = rootAbbr === playoffRoot ? playoffScore : 0;
      reasonsAll = [primary.why];
      if (matching.length > 1 && matching[1].strength_weight >= 0.20 && matching[1].category !== primary.category) {
        reasonsAll.push(matching[1].why);
      }
      if (playoffScore > 0 && rootAbbr === playoffRoot && primary.strength_weight < 0.35) {
        reasonsAll.push(...buildReasoning(rootAbbr, againstAbbr, fav, mode, playoffScore, teams, weekMeta));
      }
    } else {
      rootAbbr = playoffRoot; againstAbbr = playoffAgainst;
      score = playoffScore;
      strengthWeight = 0;
      // Call buildReasoning first — if it can't produce a meaningful reason
      // (eliminated teams, out-of-conference games) the score should be 0.
      reasonsAll = buildReasoning(rootAbbr, againstAbbr, fav, mode, score, teams, weekMeta);
      const hasReason = !(reasonsAll.length === 1 && reasonsAll[0] === 'no direct playoff impact');
      if (score > 0 && hasReason) {
        // If the opponent has clinched their division the game is seeding-only, not WC
        const oppTeam = teams[againstAbbr];
        const isSeedingOnly = oppTeam && oppTeam.conf === fav.conf && _clinched(oppTeam, teams);
        category = isSeedingOnly ? "PlayoffSeeding" : "direct_playoff_impact";
        strength  = isSeedingOnly ? "medium"          : "low";
      } else {
        score = 0; category = "no_impact"; strength = "";
      }
    }

    // DivisionRivalTank: downgrade strength when the score reflects seeding-only
    // impact (or no impact at all). The label stays "Division rival" but drops
    // from HIGH to LOW so the badge accurately signals the game's importance.
    if (category === "DivisionRivalTank") {
      if (score === 0 || score < 0.15) {
        strength = "low";
        strengthWeight = STRENGTH_WEIGHT.low;
      }
    }

    if (score > 0) {
      const homeStr = (strengths[g.home]?.strengthScore || 0.5);
      const awayStr = (strengths[g.away]?.strengthScore || 0.5);
      score = Math.min(score + 0.05 * (homeStr + awayStr) / 2, 1.0);
    }

    // Last resort: if still no impact and no reason, back the underdog
    if (category === 'no_impact' && reasonsAll.length === 1 && reasonsAll[0] === 'no direct playoff impact') {
      const ud = resolveUnderdog(g);
      if (ud) {
        rootAbbr = ud;
        againstAbbr = ud === g.home ? g.away : g.home;
        category = 'UnderdogPick';
        strength = 'low';
        reasonsAll = ['No direct playoff impact — rooting for the underdog'];
      }
    }

    recs.push({
      gameId: g.id, rootFor: rootAbbr, against: againstAbbr,
      score, category, strength, strength_weight: strengthWeight,
      reasoning: reasonsAll[0], reasonsAll,
      kickoff: g.kickoff, network: g.network, slot: g.slot,
      spread: g.spread, underdog: resolveUnderdog(g),
    });
  }

  recs.sort((a, b) => (b.score - a.score) || (b.strength_weight - a.strength_weight));
  return recs;
}

export function computeScenarios(favAbbr, teams, schedule, weekMeta) {
  const fav = teams?.[favAbbr];
  if (!fav) return [];

  const tiebreakerReasons = computeTiebreakerReasons(teams);
  const standings = computeStandings(teams, tiebreakerReasons);
  const seed = standings.byTeam[favAbbr] || {};
  const favWins = fav.record[0];
  const favLosses = fav.record[1];

  const gamesPlayed = (t) => t.record[0] + t.record[1] + (t.record[2] || 0);
  const teamRem = (t) => Math.max(0, 17 - gamesPlayed(t));
  const favRem = teamRem(fav);
  const maxFavWins = favWins + favRem;

  const divRivals = Object.values(teams).filter(t => t.conf === fav.conf && t.div === fav.div && t.abbr !== favAbbr);
  const confTeams = Object.values(teams).filter(t => t.conf === fav.conf).sort((a, b) => winPct(b) - winPct(a) || b.record[0] - a.record[0]);

  const scenarios = [];

  function magicSplit(myWins, myRem, theirWins, theirRem) {
    const theirMax = theirWins + theirRem;
    if (theirMax < myWins) return null;
    const magic = theirMax - myWins + 1;
    const total = myRem + theirRem;
    if (total === 0 || magic > total) return null;
    let tWins = Math.max(0, Math.min(Math.round(magic * myRem / total), myRem));
    let rLosses = magic - tWins;
    if (rLosses > theirRem) { rLosses = theirRem; tWins = Math.min(Math.max(0, magic - rLosses), myRem); }
    return { winsNeeded: tWins, rivalLosses: rLosses };
  }

  function h2hList(vsAbbrs) {
    const s = new Set(vsAbbrs);
    return (schedule || [])
      .filter(g => !g.completed && (g.home === favAbbr || g.away === favAbbr))
      .map(g => g.home === favAbbr ? g.away : g.home)
      .filter(a => s.has(a));
  }

  function makeWinReq(winsNeeded, vsAbbrs = []) {
    const h2h = h2hList(vsAbbrs);
    const rationale = winsNeeded <= h2h.length && h2h.length > 0
      ? `Win ${winsNeeded} game${winsNeeded !== 1 ? 's' : ''} (vs ${h2h.slice(0, winsNeeded).join(" or ")})`
      : `Win ${winsNeeded} of ${favRem} remaining games`;
    return { type: "win", team: favAbbr, rationale, week: "Any week" };
  }

  function makeLossReq(rival, losses, rem) {
    return { type: "loss", team: rival.abbr, rationale: `${losses} more loss${losses !== 1 ? "es" : ""} (${rem} remaining)`, week: "Any week" };
  }

  // Division scenarios
  if (divRivals.length) {
    const divClinched = divRivals.every(r => favWins > r.record[0] + teamRem(r));
    const divEliminated = divRivals.some(r => r.record[0] > maxFavWins);

    if (divClinched) {
      scenarios.push({ id: "div-clinched", kind: "clinched", title: `${fav.conf} ${fav.div} title — Clinched`, summary: `${favAbbr} has already secured the ${fav.div} division title.`, requires: [], likelihood: 1.0, urgency: "low", isClinched: true });
    } else if (divEliminated) {
      const leader = divRivals.find(r => r.record[0] > maxFavWins);
      scenarios.push({ id: "div-eliminated", kind: "eliminated", title: `Eliminated from the ${fav.conf} ${fav.div} title`, summary: `${leader?.abbr} already has more wins than ${favAbbr}'s maximum possible total.`, requires: [], likelihood: 0, urgency: "low", isClinched: true });
    } else if (favRem > 0) {
      const woRivalReqs = [];
      for (const rival of divRivals) {
        const rMax = rival.record[0] + teamRem(rival);
        if (rMax >= maxFavWins) {
          const needed = rMax - maxFavWins + 1;
          woRivalReqs.push({ rival, losses: needed, rem: teamRem(rival) });
        }
      }
      const req1 = [makeWinReq(favRem, divRivals.map(r => r.abbr))];
      for (const { rival, losses, rem } of woRivalReqs) req1.push(makeLossReq(rival, losses, rem));
      scenarios.push({ id: "div-clinch-1", kind: "clinch", title: woRivalReqs.length === 0 ? `Clinch the ${fav.conf} ${fav.div} — Win out (no help needed)` : `Clinch the ${fav.conf} ${fav.div} — Win every game`, summary: woRivalReqs.length === 0 ? `${favAbbr} wins all ${favRem} remaining games and secures the division title outright.` : `${favAbbr} wins all ${favRem} remaining — still needs ${woRivalReqs.map(r => `${r.rival.abbr} to drop ${r.losses}`).join(" and ")}.`, requires: req1, likelihood: Math.max(0.05, Math.min(0.90, 0.75 - woRivalReqs.length * 0.05)), urgency: favRem <= 2 ? "high" : "med" });

      let propMaxWins = 0;
      const propRivalReqs = [];
      for (const rival of divRivals) {
        const rRem = teamRem(rival);
        const mn = magicSplit(favWins, favRem, rival.record[0], rRem);
        if (!mn) continue;
        if (mn.winsNeeded > propMaxWins) propMaxWins = mn.winsNeeded;
        if (mn.rivalLosses > 0) propRivalReqs.push({ rival, losses: mn.rivalLosses, rem: rRem });
      }
      if ((propMaxWins > 0 || propRivalReqs.length) && propMaxWins < favRem) {
        const req2 = [];
        if (propMaxWins > 0) req2.push(makeWinReq(propMaxWins, divRivals.map(r => r.abbr)));
        for (const { rival, losses, rem } of propRivalReqs) req2.push(makeLossReq(rival, losses, rem));
        const gap = Math.max(0, ...divRivals.map(r => r.record[0] - favWins));
        const lhood2 = Math.max(0.05, Math.min(0.88, 0.65 - gap * 0.10 - propMaxWins * 0.03));
        const sp = [];
        if (propMaxWins > 0) sp.push(`${favAbbr} wins ${propMaxWins} more`);
        if (propRivalReqs.length) sp.push(propRivalReqs.map(({ rival, losses }) => `${rival.abbr} loses ${losses} more`).join("; "));
        scenarios.push({ id: "div-clinch-2", kind: "clinch", title: `Clinch the ${fav.conf} ${fav.div} — Get some help`, summary: sp.join(" — ") + ".", requires: req2, likelihood: lhood2, urgency: propMaxWins <= 2 ? "high" : propMaxWins <= 4 ? "med" : "low" });
      }
    }
  }

  // Wildcard scenarios
  {
    const isDivLeader = divRivals.length > 0 && divRivals.every(r => r.record[0] < favWins);
    if (!isDivLeader) {
      const teamsCanExceedCurrent = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] + teamRem(t) > favWins).length;
      const wcClinched = teamsCanExceedCurrent < 7;
      const wcEliminated = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] > maxFavWins).length >= 7;

      if (wcClinched) {
        scenarios.push({ id: "wc-clinched", kind: "clinched", title: `${fav.conf} playoff berth — Clinched`, summary: `${favAbbr} has mathematically secured a playoff spot.`, requires: [], likelihood: 1.0, urgency: "low", isClinched: true });
      } else if (wcEliminated) {
        scenarios.push({ id: "wc-eliminated", kind: "eliminated", title: `Eliminated from ${fav.conf} playoff contention`, summary: `${favAbbr} is mathematically eliminated from the playoffs.`, requires: [], likelihood: 0, urgency: "low", isClinched: true });
      } else {
        const teamsCanExceedMax = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] + teamRem(t) > maxFavWins).length;
        if (teamsCanExceedMax < 7 && favRem > 0) {
          scenarios.push({ id: "wc-clinch-1", kind: "clinch", title: `Lock down a ${fav.conf} wildcard — Control your destiny`, summary: `${favAbbr} wins all ${favRem} remaining games and clinches without needing any help.`, requires: [makeWinReq(favRem)], likelihood: Math.max(0.10, 0.65 - favRem * 0.06), urgency: favRem <= 2 ? "high" : "med" });
        }
        const dangerTeams = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] < favWins && t.record[0] + teamRem(t) >= favWins).slice(0, 3);
        if (dangerTeams.length > 0) {
          let wcMaxWins = 0;
          const wcRivalReqs = [];
          for (const danger of dangerTeams) {
            const dRem = teamRem(danger);
            const mn = magicSplit(favWins, favRem, danger.record[0], dRem);
            if (!mn) continue;
            if (mn.winsNeeded > wcMaxWins) wcMaxWins = mn.winsNeeded;
            if (mn.rivalLosses > 0) wcRivalReqs.push({ rival: danger, losses: mn.rivalLosses, rem: dRem });
          }
          if (wcMaxWins < favRem && (wcMaxWins > 0 || wcRivalReqs.length)) {
            const req2 = [];
            if (wcMaxWins > 0) req2.push(makeWinReq(wcMaxWins, dangerTeams.map(t => t.abbr)));
            for (const { rival, losses, rem } of wcRivalReqs) req2.push(makeLossReq(rival, losses, rem));
            const sp2 = [];
            if (wcMaxWins > 0) sp2.push(`${favAbbr} wins ${wcMaxWins} more`);
            if (wcRivalReqs.length) sp2.push(wcRivalReqs.map(({ rival, losses }) => `${rival.abbr} loses ${losses} more`).join("; "));
            scenarios.push({ id: "wc-clinch-2", kind: "clinch", title: `Lock down a ${fav.conf} wildcard — Hold off the pack`, summary: sp2.join(" — ") + ".", requires: req2, likelihood: Math.max(0.05, Math.min(0.80, 0.55 - wcMaxWins * 0.04)), urgency: seed.kind === "out" ? "high" : "med" });
          }
        }
      }
    }
  }

  // Elimination watch
  {
    const definitivelyOut = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] > maxFavWins).length >= 7;
    if (!definitivelyOut && favLosses >= 6) {
      const threats = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] < favWins && t.record[0] + teamRem(t) >= favWins).slice(0, 3);
      const definitivelyAhead = confTeams.filter(t => t.abbr !== favAbbr && t.record[0] >= favWins).length;
      if (threats.length >= 2 && definitivelyAhead >= 4) {
        const elimLossesNeeded = Math.max(1, favWins - threats[0].record[0] + 1);
        const threatWinsNeeded = (t) => Math.max(1, favWins - t.record[0] + 1);
        scenarios.push({ id: "elim-watch", kind: "elimination", title: `Elimination watch — ${fav.conf} wild card`, summary: `${favAbbr} loses ${elimLossesNeeded} more while ${threats.map(t => `${t.abbr} wins ${threatWinsNeeded(t)}`).join(" and ")} — playoff spot gone.`, requires: [{ type: "loss", team: favAbbr, rationale: `Lose ${elimLossesNeeded} more game${elimLossesNeeded !== 1 ? "s" : ""} (${favRem} remaining)`, week: "Any week" }, { type: "win", team: threats[0].abbr, rationale: `Win ${threatWinsNeeded(threats[0])} more to match ${favAbbr}'s wins (${teamRem(threats[0])} remaining)`, week: "Any week" }, ...(threats[1] ? [{ type: "win", team: threats[1].abbr, rationale: `Win ${threatWinsNeeded(threats[1])} more to match ${favAbbr}'s wins (${teamRem(threats[1])} remaining)`, week: "Any week" }] : [])], likelihood: 0.18, urgency: "low" });
      }
    }
  }

  // Division elimination watch
  if (divRivals.length > 0) {
    const divEliminated = divRivals.some(r => r.record[0] > maxFavWins);
    const divClinched = divRivals.every(r => favWins > r.record[0] + teamRem(r));
    if (!divEliminated && !divClinched && favRem > 0) {
      const elimThreat = divRivals.filter(r => r.record[0] + teamRem(r) >= maxFavWins).sort((a, b) => b.record[0] - a.record[0])[0];
      if (elimThreat) {
        const threatRem = teamRem(elimThreat);
        const winsToElim = maxFavWins + 1 - elimThreat.record[0];
        const favLossesToElim = Math.max(1, elimThreat.record[0] - favWins + 1);
        scenarios.push({ id: "div-elim-watch", kind: "elimination", title: `Elimination watch — ${fav.conf} ${fav.div} title`, summary: `${favAbbr} loses ${favLossesToElim} more while ${elimThreat.abbr} wins ${winsToElim} more — division title gone.`, requires: [{ type: "loss", team: favAbbr, rationale: `Lose ${favLossesToElim} more game${favLossesToElim !== 1 ? "s" : ""} (${favRem} remaining)`, week: "Any week" }, { type: "win", team: elimThreat.abbr, rationale: `Win ${winsToElim} more to exceed ${favAbbr}'s max wins (${threatRem} remaining)`, week: "Any week" }], likelihood: 0.20, urgency: "med" });
      }
    }
  }

  // #1 seed / bye chase
  if ([1, 2, 3].includes(seed.seed)) {
    const confLeader = confTeams[0];
    if (confLeader.abbr !== favAbbr) {
      const lRem = teamRem(confLeader);
      const mn = magicSplit(favWins, favRem, confLeader.record[0], lRem);
      if (mn) {
        const requires = [];
        if (mn.winsNeeded > 0) requires.push({ type: "win", team: favAbbr, rationale: `Win ${mn.winsNeeded} of ${favRem} remaining games`, week: "Any week" });
        if (mn.rivalLosses > 0) requires.push({ type: "loss", team: confLeader.abbr, rationale: `${mn.rivalLosses} more loss${mn.rivalLosses !== 1 ? "es" : ""} (${lRem} remaining)`, week: "Any week" });
        scenarios.push({ id: "bye-chase", kind: "clinch", title: `Climb to the #1 seed (bye week + home field)`, summary: `${favAbbr} needs ${mn.winsNeeded} more win${mn.winsNeeded !== 1 ? 's' : ''} and ${confLeader.abbr} to stumble.`, requires, likelihood: 0.22, urgency: "med" });
      }
    }
  }

  return scenarios;
}

// ── Best-games views (league-agnostic) ─────────────────────────────────────
// Used when no favorite team is selected: surface the week's most watchable
// games. Both are pure rankings over the shared schedule/strength shapes, so
// they carry no rooting logic and work for any league.

// Highest-quality upcoming games: reward two strong teams AND an even matchup.
export function computeTopMatchups(schedule, strengths, limit = 6) {
  return (schedule || [])
    .filter(g => !g.completed)
    .map(g => {
      const hs = strengths?.[g.home]?.strengthScore ?? 0.5;
      const as = strengths?.[g.away]?.strengthScore ?? 0.5;
      const quality = (hs + as) / 2;          // both good = marquee
      const balance = 1 - Math.abs(hs - as);  // evenly matched = better game
      return { ...g, watchScore: quality * 0.65 + balance * 0.35 };
    })
    .sort((a, b) => b.watchScore - a.watchScore)
    .slice(0, limit);
}

// Biggest point spreads: the underdogs most likely to make for an upset watch.
export function computeUnderdogWatch(schedule, limit = 6) {
  return (schedule || [])
    .filter(g => !g.completed && g.spread != null && Math.abs(g.spread) > 0)
    .map(g => {
      const underdogAbbr = resolveUnderdog(g);
      const favoriteAbbr = underdogAbbr ? (underdogAbbr === g.home ? g.away : g.home) : null;
      return { ...g, underdogAbbr, favoriteAbbr, spreadMag: Math.abs(g.spread) };
    })
    .sort((a, b) => b.spreadMag - a.spreadMag)
    .slice(0, limit);
}

// Plain-language reasons outlining what a game means for the playoff picture.
// Reads each team's division standing (leader / games back / still alive) and the
// relationship between the two teams (division, conference, cross-conference).
export function playoffImplicationReasons(home, away, teams, weekMeta) {
  const reasons = [];
  const wr = weeksRemainingFrom(weekMeta);
  const fmtGb = (gb) => (Number.isInteger(gb) ? String(gb) : gb.toFixed(1));
  const ctx = (t) => {
    const gb = gamesBack(t, teams);
    return { gb, leader: gb === 0, alive: gb <= wr, wp: winPct(t) };
  };
  const H = ctx(home), A = ctx(away);
  const sameDiv = home.conf === away.conf && home.div === away.div;
  const sameConf = home.conf === away.conf;

  if (sameDiv) {
    reasons.push(`Division showdown — a direct swing in the ${home.conf} ${home.div} race.`);
    if (H.leader && A.leader) {
      reasons.push(`Winner takes sole possession of first place in the ${home.div}.`);
    } else if (H.leader || A.leader) {
      const leader = H.leader ? home : away;
      const chaser = H.leader ? away : home;
      reasons.push(`${chaser.name} can pull even with the first-place ${leader.name}.`);
    } else {
      reasons.push(`Both teams are chasing the ${home.conf} ${home.div} lead.`);
    }
  } else if (sameConf) {
    reasons.push(`${home.conf} clash with wild-card seeding on the line.`);
  } else {
    reasons.push(`Cross-conference result shapes playoff tiebreakers and strength of schedule.`);
  }

  const note = (t, c) => {
    if (c.leader) return `${t.name} lead the ${t.div} and can build separation.`;
    if (c.alive) return `${t.name} sit ${fmtGb(c.gb)} back in the ${t.div} — every game counts.`;
    return null;
  };
  const nh = note(home, H); if (nh) reasons.push(nh);
  const na = note(away, A); if (na) reasons.push(na);

  if (H.wp >= 0.6 && A.wp >= 0.6) {
    reasons.push(`Two winning teams — a likely January seeding tiebreaker.`);
  }
  return reasons.slice(0, 3);
}

// League-wide playoff implications: rank upcoming games by how much they swing the
// overall playoff picture, independent of any favorite team. A game matters most
// when both teams are still alive in their division race and playing well — two
// contenders meeting is a seeding/berth swing game. Uses win pct + games-back to
// gauge stakes and team strength to gauge quality. Each game carries plain-language
// reasons outlining its playoff stakes.
export function computePlayoffImplications(schedule, teams, weekMeta, strengths, limit = 6) {
  const wr = weeksRemainingFrom(weekMeta);
  const contention = (t) => {
    if (!t) return 0;
    const alive = gamesBack(t, teams) <= wr ? 1 : 0; // still in the division hunt
    // Winning teams have the most at stake for seeding/berths.
    return alive * (0.4 + winPct(t));
  };
  return (schedule || [])
    .filter(g => !g.completed && teams?.[g.home] && teams?.[g.away])
    .map(g => {
      const ch = contention(teams[g.home]);
      const ca = contention(teams[g.away]);
      const stakes = (ch + ca) / 2;              // both in the hunt = high stakes
      const headToHead = Math.min(ch, ca);       // two contenders = swing game
      const sh = strengths?.[g.home]?.strengthScore ?? 0.5;
      const sa = strengths?.[g.away]?.strengthScore ?? 0.5;
      const quality = (sh + sa) / 2;
      const implicationScore = stakes * 0.5 + headToHead * 0.3 + quality * 0.2;
      const reasons = playoffImplicationReasons(teams[g.home], teams[g.away], teams, weekMeta);
      return { ...g, implicationScore, reasons };
    })
    .sort((a, b) => b.implicationScore - a.implicationScore)
    .slice(0, limit);
}
