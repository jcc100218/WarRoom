// ══════════════════════════════════════════════════════════════════
// js/tabs/alex-insights.js — AlexInsightsTab: personalized pattern
// recognition & performance analytics. "Option A" placement: new
// top-level tab with sub-tabs Overview / Patterns / Decision History
// / Model Settings.
//
// Depends on: window.WR.* primitives (wr-primitives.js),
//             window.App.LI (playerScores, tradeHistory, draftOutcomes, championships),
//             window.S (transactions, rosters, matchups, leagueUsers).
// Exposes:    window.AlexInsightsTab
// ══════════════════════════════════════════════════════════════════

(function () {
    const h = React.createElement;
    const { useState, useEffect } = React;

    // ── Settings access ───────────────────────────────────────────
    // Delegates to window.WR.AlexSettings so every Alex surface shares
    // the same tuning. Falls back to a safe inline default if the helper
    // hasn't loaded yet (e.g., script-order edge case).
    const DEFAULT_SETTINGS = (window.WR?.AlexSettings?.DEFAULTS) || {
        alertThreshold: 70, maxAlertsPerWeek: 6, minPointsDelta: 2.5,
        focus: { startSit: true, trades: true, waivers: true, draft: true, injury: false, streaming: false, gmStyle: false },
        channel: { inApp: true, email: false, push: false },
    };
    function loadSettings() { return window.WR?.AlexSettings?.get?.() || { ...DEFAULT_SETTINGS }; }
    function saveSettings(s) {
        if (window.WR?.AlexSettings?.save) window.WR.AlexSettings.save(s);
        else try { localStorage.setItem('wr_alex_settings', JSON.stringify(s)); } catch (_) {}
    }

    // ── KPI computations ──────────────────────────────────────────
    // Best-effort from data already in window.App.LI / window.S. Fields
    // we don't have yet return null so the tile shows a dash.
    function computeKpis({ myRoster, currentLeague, playersData }) {
        const LI = window.App?.LI || {};
        const myRid = myRoster?.roster_id;

        // Trade success: net DHQ delta across all trades I was part of.
        let tradeNetDhq = 0, tradeCount = 0;
        (LI.tradeHistory || []).forEach(t => {
            if (!t.sides || !t.sides[myRid]) return;
            tradeCount++;
            const myIn = (t.sides[myRid].players || []).reduce((s, pid) => s + (LI.playerScores?.[pid] || 0), 0);
            // Sum of what I gave — players on the OTHER side(s)
            let myOut = 0;
            Object.entries(t.sides).forEach(([rid, side]) => {
                if (String(rid) === String(myRid)) return;
                (side.players || []).forEach(pid => { myOut += LI.playerScores?.[pid] || 0; });
            });
            tradeNetDhq += (myIn - myOut);
        });

        // Waiver hit rate: % of waiver/FA adds still on my roster.
        const txns = [];
        const txnMap = window.S?.transactions || {};
        if (txnMap && typeof txnMap === 'object' && !Array.isArray(txnMap)) {
            Object.values(txnMap).forEach(arr => { if (Array.isArray(arr)) txns.push(...arr); });
        }
        const myPlayers = new Set(myRoster?.players || []);
        let waiverTotal = 0, waiverKept = 0;
        txns.forEach(t => {
            if (t.type !== 'waiver' && t.type !== 'free_agent') return;
            if (!t.adds) return;
            Object.entries(t.adds).forEach(([pid, rid]) => {
                if (String(rid) !== String(myRid)) return;
                waiverTotal++;
                if (myPlayers.has(pid)) waiverKept++;
            });
        });
        const waiverHitPct = waiverTotal > 0 ? Math.round((waiverKept / waiverTotal) * 100) : null;

        // Draft hit rate: % of my drafted players now worth ≥3000 DHQ (contributor threshold).
        const draftPicks = (LI.draftOutcomes || []).filter(d => String(d.roster_id) === String(myRid));
        let draftHits = 0;
        draftPicks.forEach(d => {
            const dhq = LI.playerScores?.[d.pid] || 0;
            if (dhq >= 3000) draftHits++;
        });
        const draftHitPct = draftPicks.length > 0 ? Math.round((draftHits / draftPicks.length) * 100) : null;

        // Best decision type: whichever hit rate is highest and has a sample.
        const candidates = [
            { label: 'TRADES',  pct: tradeCount >= 3 && tradeNetDhq > 0 ? 100 : (tradeCount >= 1 ? (tradeNetDhq > 0 ? 65 : 40) : null) },
            { label: 'WAIVERS', pct: waiverHitPct },
            { label: 'DRAFT',   pct: draftHitPct },
        ].filter(c => c.pct != null).sort((a, b) => b.pct - a.pct);
        const best = candidates[0];

        return {
            decisionAccuracy: null,  // placeholder — needs start/sit history
            tradeNetDhq,
            tradeCount,
            waiverHitPct,
            waiverKept,
            waiverTotal,
            draftHitPct,
            draftHits,
            draftTotal: draftPicks.length,
            bestType: best ? best.label : null,
            bestPct: best ? best.pct : null,
        };
    }

    // ── Insight generation ────────────────────────────────────────
    // Each heuristic returns a card-compatible object or pushes nothing.
    // All carry a `focus` tag so WR.AlexSettings.filterInsights can hide
    // them when the user disables that focus area. Confidence values are
    // calibrated so the alert-threshold slider reads intuitively.
    function computeInsights(props, kpis) {
        const { myRoster, currentLeague, playersData } = props;
        const LI = window.App?.LI || {};
        const myRid = myRoster?.roster_id;
        const out = [];
        const rosterCount = (currentLeague?.rosters || []).length || 12;

        // ── Trades ────────────────────────────────────────────────
        const allTrades = LI.tradeHistory || [];
        const leagueTradeAvg = allTrades.length / Math.max(1, rosterCount) * 2;
        if (kpis.tradeCount != null && leagueTradeAvg > 0 && kpis.tradeCount < leagueTradeAvg * 0.5) {
            out.push({
                focus: 'trades', severity: 'opportunity', confidence: 78,
                title: 'You trade less than half as often as your league',
                body: 'You\u2019ve been part of ' + kpis.tradeCount + ' trade' + (kpis.tradeCount === 1 ? '' : 's') + ' vs. a league average of ~' + Math.round(leagueTradeAvg) + '. Your analytical style tends to translate into good trades \u2014 you\u2019re leaving value on the table.',
                ctaLabel: 'Explore trade targets',
            });
        }
        if (kpis.tradeCount >= 3 && kpis.tradeNetDhq > 0) {
            out.push({
                focus: 'trades', severity: 'edge', confidence: 84,
                title: 'Your trades net +' + (kpis.tradeNetDhq / 1000).toFixed(1) + 'k DHQ across ' + kpis.tradeCount + ' deals',
                body: 'You\u2019re a net winner on trade value. Keep hunting deals \u2014 this is your highest-ROI activity.',
                ctaLabel: 'Continue & scale',
            });
        }
        if (kpis.tradeCount >= 3 && kpis.tradeNetDhq < -1000) {
            out.push({
                focus: 'trades', severity: 'warning', confidence: 82,
                title: 'Your trades are net -' + Math.abs(Math.round(kpis.tradeNetDhq / 1000)) + 'k DHQ',
                body: 'Across ' + kpis.tradeCount + ' trades you\u2019re giving up more value than you receive. Run proposals through Trade Center\u2019s analyzer before accepting.',
                ctaLabel: 'Review trade history',
            });
        }
        // NEW: Trade partner diversity
        if (kpis.tradeCount >= 4 && myRid != null) {
            const partnerCounts = {};
            allTrades.forEach(t => {
                if (!t.sides || !t.sides[myRid]) return;
                Object.keys(t.sides).forEach(rid => {
                    if (String(rid) !== String(myRid)) partnerCounts[rid] = (partnerCounts[rid] || 0) + 1;
                });
            });
            const partners = Object.entries(partnerCounts).sort((a, b) => b[1] - a[1]);
            const top2Share = partners.length ? (partners.slice(0, 2).reduce((s, p) => s + p[1], 0) / kpis.tradeCount) : 0;
            if (top2Share >= 0.75 && partners.length >= 3) {
                out.push({
                    focus: 'trades', severity: 'pattern', confidence: 74,
                    title: 'Most of your trades go through just 2 managers',
                    body: Math.round(top2Share * 100) + '% of your trades are with ' + partners.length + ' owners, concentrated in 2. Broadening the pool opens mismatched-need exchanges that tight partner loops miss.',
                    ctaLabel: 'See all owners',
                });
            }
        }

        // ── Waivers / FA ──────────────────────────────────────────
        if (kpis.waiverHitPct != null && kpis.waiverHitPct >= 50 && kpis.waiverTotal >= 5) {
            out.push({
                focus: 'waivers', severity: 'edge', confidence: 80,
                title: 'You retain ' + kpis.waiverHitPct + '% of your waiver adds',
                body: 'That\u2019s above league-average stickiness. Your FA targeting instincts are working \u2014 keep adding aggressively at the position-scarcity windows.',
                ctaLabel: 'Continue & scale',
            });
        }
        if (kpis.waiverHitPct != null && kpis.waiverHitPct < 25 && kpis.waiverTotal >= 6) {
            out.push({
                focus: 'waivers', severity: 'pattern', confidence: 78,
                title: 'Your waiver retention rate is ' + kpis.waiverHitPct + '%',
                body: Math.round(kpis.waiverTotal - kpis.waiverKept) + ' of ' + kpis.waiverTotal + ' waiver/FA adds were dropped within weeks. Slow down and run DHQ + tier checks before burning FAAB.',
                ctaLabel: 'Review FAAB log',
            });
        }
        // NEW: FAAB usage pattern
        const myFaab = myRoster?.settings?.waiver_budget_used || 0;
        const budget = currentLeague?.settings?.waiver_budget || 100;
        if (budget > 0) {
            const spentPct = myFaab / budget;
            // Compute league avg spend
            let leagueSpent = 0, managerCount = 0;
            (currentLeague?.rosters || []).forEach(r => {
                if (r.settings?.waiver_budget_used != null) {
                    leagueSpent += r.settings.waiver_budget_used;
                    managerCount++;
                }
            });
            const leagueAvgPct = managerCount > 0 ? (leagueSpent / (managerCount * budget)) : 0;
            if (spentPct < 0.15 && leagueAvgPct > 0.35) {
                out.push({
                    focus: 'waivers', severity: 'opportunity', confidence: 72,
                    title: 'You\u2019re sitting on ' + Math.round((1 - spentPct) * 100) + '% of your FAAB',
                    body: 'League average is ' + Math.round(leagueAvgPct * 100) + '% spent. Unspent FAAB at season end is zero value \u2014 bid aggressively on the 2\u20133 impact adds you\u2019re tracking.',
                    ctaLabel: 'Open Free Agency',
                });
            }
            if (spentPct > 0.85 && (currentLeague?.settings?.waiver_budget > 0)) {
                out.push({
                    focus: 'waivers', severity: 'warning', confidence: 70,
                    title: 'You\u2019ve burned ' + Math.round(spentPct * 100) + '% of your FAAB',
                    body: 'Only $' + Math.round(budget * (1 - spentPct)) + ' left. Playoff-push adds are expensive \u2014 conserve for clear upgrades.',
                    ctaLabel: 'Review waiver log',
                });
            }
        }

        // ── Draft ─────────────────────────────────────────────────
        if (kpis.draftHitPct != null && kpis.draftTotal >= 10 && kpis.draftHitPct < 30) {
            out.push({
                focus: 'draft', severity: 'pattern', confidence: 88,
                title: 'Your draft hit rate (' + kpis.draftHitPct + '%) trails starter caliber',
                body: 'Only ' + kpis.draftHits + ' of ' + kpis.draftTotal + ' drafted players reached contributor DHQ. Consider leaning on DHQ rankings over gut in rounds 1\u20133.',
                ctaLabel: 'Review draft board',
            });
        }
        if (kpis.draftHitPct != null && kpis.draftTotal >= 10 && kpis.draftHitPct >= 55) {
            out.push({
                focus: 'draft', severity: 'edge', confidence: 82,
                title: 'Your drafts hit ' + kpis.draftHitPct + '% \u2014 elite',
                body: kpis.draftHits + '/' + kpis.draftTotal + ' of your picks reached contributor DHQ. You\u2019re outdrafting the league. Prioritize draft capital in any trade.',
                ctaLabel: 'See pick values',
            });
        }
        // NEW: Position bias in drafting
        const draftPicks = (LI.draftOutcomes || []).filter(d => String(d.roster_id) === String(myRid));
        if (draftPicks.length >= 8) {
            const byPos = {};
            draftPicks.forEach(d => { byPos[d.pos] = (byPos[d.pos] || 0) + 1; });
            const topPos = Object.entries(byPos).sort((a, b) => b[1] - a[1])[0];
            if (topPos && topPos[1] / draftPicks.length > 0.45) {
                out.push({
                    focus: 'draft', severity: 'pattern', confidence: 76,
                    title: 'You draft ' + topPos[0] + ' ' + Math.round(topPos[1] / draftPicks.length * 100) + '% of the time',
                    body: 'Over ' + draftPicks.length + ' career picks, ' + topPos[1] + ' went to ' + topPos[0] + '. Heavy concentration can starve depth at other positions \u2014 worth checking your roster-construction tier.',
                    ctaLabel: 'Open Roster Analytics',
                });
            }
        }

        // ── GM style / roster ─────────────────────────────────────
        const peaks = window.App?.peakWindows || {};
        const myPlayers = myRoster?.players || [];
        const totalDhq = myPlayers.reduce((s, pid) => s + (LI.playerScores?.[pid] || 0), 0);
        const agingPids = myPlayers.filter(pid => {
            const p = playersData?.[pid]; if (!p) return false;
            const pk = peaks[p.position] || [24, 29];
            return p.age && p.age > pk[1];
        });
        const agingDhq = agingPids.reduce((s, pid) => s + (LI.playerScores?.[pid] || 0), 0);
        if (totalDhq > 0 && agingDhq / totalDhq > 0.25) {
            out.push({
                focus: 'gmStyle', severity: 'warning', confidence: 91,
                title: Math.round((agingDhq / totalDhq) * 100) + '% of your roster DHQ is past peak',
                body: agingPids.length + ' players are on the wrong side of their position\u2019s peak window. Sell windows are closing \u2014 cash in now or commit to a rebuild.',
                ctaLabel: 'See aging assets',
            });
        }
        // NEW: Elite concentration
        const eliteCount = myPlayers.filter(pid => (LI.playerScores?.[pid] || 0) >= 7000).length;
        if (myPlayers.length >= 10 && eliteCount === 0) {
            out.push({
                focus: 'gmStyle', severity: 'warning', confidence: 85,
                title: 'Your roster has zero elite-tier (7000+ DHQ) players',
                body: 'Championship cores are built around 2\u20134 elites. Without one, you\u2019re capped at \u201Cgood\u201D \u2014 accumulate picks and flip mid-tier depth for a cornerstone.',
                ctaLabel: 'Find a cornerstone target',
            });
        } else if (eliteCount >= 4) {
            out.push({
                focus: 'gmStyle', severity: 'edge', confidence: 80,
                title: 'You hold ' + eliteCount + ' elite-tier players',
                body: 'Championship-caliber concentration. Protect this core \u2014 prioritize ageing-RB insurance and depth at FLEX before chasing another star.',
                ctaLabel: 'Stabilize lineup',
            });
        }
        // NEW: Rebuild tier + young stud surplus (rebuilder edge)
        const risingPids = myPlayers.filter(pid => {
            const p = playersData?.[pid]; if (!p || !p.age) return false;
            const pk = peaks[p.position] || [24, 29];
            return p.age < pk[0] && (LI.playerScores?.[pid] || 0) >= 4000;
        });
        if (risingPids.length >= 3 && eliteCount < 2) {
            out.push({
                focus: 'gmStyle', severity: 'opportunity', confidence: 76,
                title: 'You\u2019re sitting on ' + risingPids.length + ' rising mid-tier players',
                body: 'Pre-peak players at 4000+ DHQ are your highest-appreciation assets. If you aren\u2019t contending, bundle 2 of them for a proven elite now.',
                ctaLabel: 'Explore consolidation trades',
            });
        }

        // ── Start/Sit — lineup efficiency ────────────────────────
        // Proxy via window.S.matchups: compare actual points vs optimal.
        try {
            const matchups = Array.isArray(window.S?.matchups) ? window.S.matchups : [];
            const mine = matchups.filter(m => m.roster_id === myRid && m.points != null);
            if (mine.length >= 4) {
                // Optimal isn't in the payload, but we can flag low-scoring weeks vs opponents.
                const avg = mine.reduce((s, m) => s + (m.points || 0), 0) / mine.length;
                const lowWeeks = mine.filter(m => (m.points || 0) < avg * 0.75).length;
                if (lowWeeks >= 3) {
                    out.push({
                        focus: 'startSit', severity: 'pattern', confidence: 70,
                        title: lowWeeks + ' of ' + mine.length + ' weeks were 25%+ below your average',
                        body: 'Lineup variance is eating wins. Either volatile plays or frequent start-sit misses. Use the Compare tab\u2019s matchup view to pre-commit starters.',
                        ctaLabel: 'Open Compare',
                    });
                }
            }
        } catch (_) {}

        // ── Injury behavior ──────────────────────────────────────
        const injuredHigh = myPlayers.filter(pid => {
            const p = playersData?.[pid];
            const dhq = LI.playerScores?.[pid] || 0;
            return p?.injury_status && ['IR', 'Out', 'Doubtful'].includes(p.injury_status) && dhq >= 3000;
        });
        if (injuredHigh.length >= 2) {
            out.push({
                focus: 'injury', severity: 'warning', confidence: 73,
                title: injuredHigh.length + ' high-DHQ players are injured',
                body: 'Contributor-tier assets stacked in Out/Doubtful/IR status. Deploy IR slots + hunt short-term-upside replacements before the news breaks league-wide.',
                ctaLabel: 'Open Free Agency',
            });
        }

        // ── Streaming K/DEF ──────────────────────────────────────
        const streamables = myPlayers.filter(pid => {
            const p = playersData?.[pid];
            return p && (p.position === 'K' || p.position === 'DEF');
        });
        if (streamables.length === 0 && currentLeague?.settings) {
            out.push({
                focus: 'streaming', severity: 'opportunity', confidence: 60,
                title: 'You don\u2019t roster a K or DEF',
                body: 'Streaming these weekly based on matchup is fine \u2014 just don\u2019t leave the slot empty. Auto-pilot settings may cost you 6\u20138 pts per week.',
                ctaLabel: 'Check Free Agency',
            });
        }

        // Priority-sort (warning → edge → pattern → opportunity).
        const priority = { warning: 0, edge: 1, pattern: 2, opportunity: 3 };
        out.sort((a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9));
        return out;
    }

    // ── AI-generated novel insights ───────────────────────────────
    // Asks Alex (via window.dhqAI) to produce 1-2 *novel* behavioral
    // insights that don't overlap with the heuristic pool. Cached for
    // 24h to keep LLM spend reasonable. Result shape is compatible
    // with the heuristic insights so they render in the same card grid.
    const AI_CACHE_KEY = 'wr_alex_ai_insights';
    const AI_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    function loadCachedAiInsights() {
        try {
            const raw = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || 'null');
            if (!raw || !raw.ts) return { insights: [], ts: 0 };
            if (Date.now() - raw.ts > AI_CACHE_TTL_MS) return { insights: [], ts: 0 };
            return raw;
        } catch (_) { return { insights: [], ts: 0 }; }
    }
    function saveCachedAiInsights(insights) {
        try { localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ insights, ts: Date.now() })); } catch (_) {}
    }
    function clearCachedAiInsights() { try { localStorage.removeItem(AI_CACHE_KEY); } catch (_) {} }

    async function generateAiInsights({ myRoster, currentLeague, playersData }, kpis, heuristicTitles) {
        const aiFn = typeof window.dhqAI === 'function' ? window.dhqAI : null;
        if (!aiFn) return { error: 'dhqAI not loaded' };

        // Build compact context: KPIs + recent trades + roster snapshot.
        const LI = window.App?.LI || {};
        const topHolds = (myRoster?.players || [])
            .map(pid => ({ pid, dhq: LI.playerScores?.[pid] || 0, name: playersData?.[pid]?.full_name, pos: playersData?.[pid]?.position, age: playersData?.[pid]?.age }))
            .sort((a, b) => b.dhq - a.dhq).slice(0, 6);
        const recentTrades = (LI.tradeHistory || [])
            .filter(t => t.sides && t.sides[myRoster?.roster_id])
            .slice(0, 3)
            .map(t => {
                const mine = (t.sides[myRoster.roster_id].players || []).map(pid => playersData?.[pid]?.full_name || pid).join(', ');
                const partners = Object.entries(t.sides).filter(([rid]) => String(rid) !== String(myRoster.roster_id));
                const theirs = partners.flatMap(([, side]) => (side.players || []).map(pid => playersData?.[pid]?.full_name || pid)).join(', ');
                return '- Traded ' + (mine || 'picks') + ' for ' + (theirs || 'picks');
            }).join('\n');

        const contextLines = [
            'LEAGUE: ' + (currentLeague?.name || 'Dynasty') + ', ' + (currentLeague?.rosters?.length || 12) + ' teams',
            'TRADES: ' + (kpis.tradeCount || 0) + ' completed, net DHQ ' + (kpis.tradeNetDhq > 0 ? '+' : '') + Math.round((kpis.tradeNetDhq || 0) / 1000) + 'k',
            'WAIVERS: ' + (kpis.waiverHitPct != null ? (kpis.waiverHitPct + '% retention over ' + kpis.waiverTotal + ' adds') : 'n/a'),
            'DRAFT: ' + (kpis.draftHitPct != null ? (kpis.draftHitPct + '% hit rate over ' + kpis.draftTotal + ' picks') : 'n/a'),
            'TOP HOLDS: ' + topHolds.map(p => (p.name || p.pid) + ' (' + (p.pos || '?') + ', ' + (p.age || '?') + 'yo, ' + p.dhq + ' DHQ)').join('; '),
            recentTrades ? 'RECENT TRADES:\n' + recentTrades : 'RECENT TRADES: none in view',
            heuristicTitles && heuristicTitles.length ? 'ALREADY SURFACED:\n- ' + heuristicTitles.join('\n- ') : '',
        ].filter(Boolean).join('\n');

        const prompt = [
            'You are Alex, an analytical fantasy-football GM assistant. Generate EXACTLY 2 novel behavioral insights about this manager that are NOT already in the "ALREADY SURFACED" list.',
            'Look for unusual patterns in how they build their roster, manage trades, use waivers, or allocate draft capital. Prefer non-obvious findings over generic ones.',
            '',
            'Return ONLY a JSON array with exactly 2 objects in this exact shape:',
            '[{',
            '  "severity": "warning" | "edge" | "pattern" | "opportunity",',
            '  "confidence": integer 50-95,',
            '  "focus": "trades" | "waivers" | "draft" | "startSit" | "injury" | "streaming" | "gmStyle",',
            '  "title": "short headline, under 80 chars",',
            '  "body": "2 sentences with a specific number or detail",',
            '  "ctaLabel": "action verb phrase, e.g. \'Open Trade Center\'"',
            '}]',
            '',
            'No markdown, no prose, no comments. Just the JSON array.',
        ].join('\n');

        try {
            // Use the existing `strategy-analysis` route — same provider
            // (Gemini Flash), same tier, semantically a strategy read on
            // the user's managerial patterns. Avoids a cross-repo routing
            // change to add a bespoke `alex-insights` type.
            const reply = await aiFn('strategy-analysis', prompt, contextLines);
            if (!reply || typeof reply !== 'string') return { error: 'empty reply' };
            // Tolerate replies wrapped in ```json fences or surrounded by text.
            const match = reply.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (!match) return { error: 'no JSON array in reply' };
            const parsed = JSON.parse(match[0]);
            if (!Array.isArray(parsed)) return { error: 'reply is not an array' };
            // Validate + normalize
            const cleaned = parsed.filter(x => x && x.severity && x.title).map(x => ({
                severity: String(x.severity).toLowerCase(),
                confidence: Math.max(50, Math.min(95, parseInt(x.confidence) || 70)),
                focus: x.focus || null,
                title: String(x.title).slice(0, 120),
                body: String(x.body || '').slice(0, 400),
                ctaLabel: x.ctaLabel ? String(x.ctaLabel).slice(0, 40) : null,
                isAi: true,
            }));
            return { insights: cleaned };
        } catch (e) {
            return { error: String(e.message || e) };
        }
    }

    // ── Hero ──────────────────────────────────────────────────────
    function Hero({ active }) {
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' } },
            h('div', {
                style: {
                    width: '48px', height: '48px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(212,175,55,0.06))',
                    border: '1px solid rgba(212,175,55,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem',
                }
            }, '\uD83E\uDDE0'),
            h('div', null,
                h('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em' } }, 'Alex Insights'),
                h('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.7, marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' } }, 'Personalized pattern recognition across your managerial history')
            ),
            h('div', {
                style: {
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 12px', borderRadius: '999px',
                    background: active ? 'rgba(46,204,113,0.08)' : 'rgba(208,208,208,0.06)',
                    border: active ? '1px solid rgba(46,204,113,0.35)' : '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.68rem', color: active ? '#2ECC71' : 'var(--silver)',
                    letterSpacing: '0.08em', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                }
            },
                h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: active ? '#2ECC71' : '#7d8291', boxShadow: active ? '0 0 8px rgba(46,204,113,0.7)' : 'none' } }),
                active ? 'ALEX ACTIVE' : 'ALEX IDLE'
            )
        );
    }

    // ── Sub-tab row ───────────────────────────────────────────────
    function SubTabs({ value, onChange, tabs }) {
        return h('div', { style: { display: 'flex', gap: '28px', margin: '0 0 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' } },
            tabs.map(t => h('div', {
                key: t.k,
                onClick: () => onChange(t.k),
                style: {
                    padding: '10px 2px', fontSize: '0.86rem', cursor: 'pointer', fontWeight: value === t.k ? 600 : 500,
                    color: value === t.k ? 'var(--gold)' : 'var(--silver)', opacity: value === t.k ? 1 : 0.65,
                    borderBottom: '2px solid ' + (value === t.k ? 'var(--gold)' : 'transparent'),
                    fontFamily: 'DM Sans, sans-serif',
                }
            }, t.label))
        );
    }

    // ── Overview sub-tab ──────────────────────────────────────────
    function OverviewView({ kpis, insights, props }) {
        const Kpi = window.WR.Kpi;
        const InsightCard = window.WR.InsightCard;
        const fmtK = (n) => n == null ? null : ((n > 0 ? '+' : '') + (n / 1000).toFixed(1) + 'k');

        // AI-generated insights — separate from heuristic insights, cached
        // for 24h, tagged with isAi so the card badge can distinguish them.
        const [aiState, setAiState] = useState(() => loadCachedAiInsights());
        const [aiLoading, setAiLoading] = useState(false);
        const [aiError, setAiError] = useState(null);
        const aiInsights = (aiState?.insights || []).filter(x => !window.WR?.AlexSettings || window.WR.AlexSettings.shouldShow(x));
        const merged = [...insights, ...aiInsights];

        const doGenerate = async () => {
            setAiLoading(true); setAiError(null);
            const titles = insights.map(i => i.title);
            const r = await generateAiInsights(props, kpis, titles);
            setAiLoading(false);
            if (r.error) { setAiError(r.error); return; }
            setAiState({ insights: r.insights, ts: Date.now() });
            saveCachedAiInsights(r.insights);
        };
        const doClear = () => { clearCachedAiInsights(); setAiState({ insights: [], ts: 0 }); };

        const cacheAge = aiState?.ts ? Math.round((Date.now() - aiState.ts) / 60000) : null;

        return h(React.Fragment, null,
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' } },
                h(Kpi, {
                    label: 'Decision Accuracy',
                    value: kpis.decisionAccuracy != null ? (kpis.decisionAccuracy + '%') : '\u2014',
                    tone: 'mute',
                    sub: 'Needs start/sit history',
                }),
                h(Kpi, {
                    label: 'Trade Net DHQ',
                    value: fmtK(kpis.tradeNetDhq) || '\u2014',
                    tone: kpis.tradeNetDhq > 0 ? 'win' : kpis.tradeNetDhq < 0 ? 'loss' : 'plain',
                    sub: (kpis.tradeCount || 0) + ' trade' + (kpis.tradeCount === 1 ? '' : 's'),
                }),
                h(Kpi, {
                    label: 'Waiver Hit Rate',
                    value: kpis.waiverHitPct != null ? (kpis.waiverHitPct + '%') : '\u2014',
                    tone: kpis.waiverHitPct >= 50 ? 'win' : kpis.waiverHitPct >= 30 ? 'gold' : 'mute',
                    sub: kpis.waiverTotal ? (kpis.waiverKept + '/' + kpis.waiverTotal + ' kept') : 'No waiver history yet',
                }),
                h(Kpi, {
                    label: 'Best Decision Type',
                    value: kpis.bestType || '\u2014',
                    tone: 'gold',
                    sub: kpis.bestPct != null ? (kpis.bestPct + '% positive rate') : 'Need more data',
                })
            ),
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', margin: '0 0 12px', flexWrap: 'wrap' } },
                h('h2', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' } }, 'Behavioral Analysis'),
                h('span', { style: { fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6, fontFamily: 'JetBrains Mono, monospace' } },
                    '\u2014 ' + merged.length + ' insight' + (merged.length === 1 ? '' : 's') + (aiInsights.length ? ' (' + aiInsights.length + ' AI)' : '')),
                // Spacer pushes the AI controls to the right
                h('div', { style: { flex: 1 } }),
                h('button', {
                    onClick: doGenerate,
                    disabled: aiLoading,
                    style: {
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600,
                        fontFamily: 'DM Sans, sans-serif',
                        background: aiLoading ? 'rgba(124,107,248,0.08)' : 'rgba(124,107,248,0.12)',
                        border: '1px solid rgba(124,107,248,0.35)',
                        color: '#9b8afb',
                        cursor: aiLoading ? 'wait' : 'pointer',
                        opacity: aiLoading ? 0.7 : 1,
                    }
                }, '\u2728 ', aiLoading ? 'Thinking…' : (aiInsights.length ? 'Regenerate AI insights' : 'Generate with Alex')),
                aiInsights.length > 0 && h('button', {
                    onClick: doClear,
                    style: {
                        padding: '6px 10px', borderRadius: '6px', fontSize: '0.7rem',
                        fontFamily: 'DM Sans, sans-serif', background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.08)', color: 'var(--silver)',
                        cursor: 'pointer',
                    }
                }, 'Clear AI'),
                aiInsights.length > 0 && cacheAge != null && h('span', { style: { fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.5, fontFamily: 'JetBrains Mono, monospace' } },
                    cacheAge < 1 ? 'just now' : cacheAge < 60 ? cacheAge + 'm ago' : Math.floor(cacheAge / 60) + 'h ago')
            ),
            aiError && h('div', { style: { padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '6px', fontSize: '0.78rem', color: '#E74C3C' } },
                'Alex couldn\u2019t generate insights: ', aiError),
            merged.length === 0
                ? h(window.WR.Card, { padding: '24px' },
                    h('div', { style: { fontSize: '0.86rem', color: 'var(--silver)', opacity: 0.7, lineHeight: 1.55, textAlign: 'center' } },
                        'No behavioral patterns detected yet. Alex needs a bit of trade / waiver / draft history before it can speak confidently.')
                )
                : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' } },
                    merged.map((ins, i) => h('div', { key: i, style: { position: 'relative' } },
                        h(InsightCard, ins),
                        ins.isAi && h('div', { style: { position: 'absolute', top: 10, right: 10, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.12em', padding: '2px 6px', borderRadius: '4px', background: 'rgba(124,107,248,0.2)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.4)' } }, '\u2728 AI')
                    ))
                )
        );
    }

    // ── Patterns sub-tab (placeholder / "coming soon" scaffolding) ─
    function PatternsView() {
        return h(window.WR.Card, { padding: '32px' },
            h('div', { style: { textAlign: 'center', color: 'var(--silver)', opacity: 0.75, lineHeight: 1.6 } },
                h('div', { style: { fontSize: '1.6rem', marginBottom: '8px' } }, '\u301C'),
                h('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.2rem', color: 'var(--white)', margin: '0 0 8px' } }, 'Patterns'),
                h('p', { style: { fontSize: '0.85rem', maxWidth: '440px', margin: '0 auto', lineHeight: 1.55 } },
                    'Deep-dive charts across your draft, trade, and waiver decisions \u2014 binned by position, timing, and counterparty. Shipping after the Overview lands.')
            )
        );
    }

    // ── Decision History sub-tab ──────────────────────────────────
    function HistoryView() {
        // Pull from Scout field log (localStorage key used elsewhere) + recent transactions
        let log = [];
        try { log = JSON.parse(localStorage.getItem('scout_field_log_v1') || '[]'); } catch (_) {}
        const txns = [];
        const txnMap = window.S?.transactions || {};
        if (txnMap && typeof txnMap === 'object' && !Array.isArray(txnMap)) {
            Object.values(txnMap).forEach(arr => { if (Array.isArray(arr)) txns.push(...arr); });
        }
        const myRid = window.S?.myRosterId;
        const mine = txns.filter(t => {
            const addsMe = t.adds && Object.values(t.adds).some(r => String(r) === String(myRid));
            const dropsMe = t.drops && Object.values(t.drops).some(r => String(r) === String(myRid));
            return addsMe || dropsMe;
        }).sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 25);

        if (!log.length && !mine.length) {
            return h(window.WR.Card, { padding: '32px' },
                h('div', { style: { textAlign: 'center', color: 'var(--silver)', opacity: 0.7 } },
                    'No decisions logged yet. Your trades, waivers, and Scout field-log entries will show up here.')
            );
        }
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
            mine.map((t, i) => {
                const date = t.created ? new Date(t.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '\u2014';
                const kind = t.type === 'trade' ? 'trade' : t.type === 'waiver' ? 'waiver' : 'fa';
                const count = Object.keys(t.adds || {}).filter(pid => String(t.adds[pid]) === String(myRid)).length;
                return h(window.WR.Card, { key: 'tx' + i, padding: '10px 14px' },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                        h(window.WR.Badge, { label: kind, kind }),
                        h('div', { style: { flex: 1, fontSize: '0.82rem', color: 'var(--white)' } },
                            count + ' player' + (count === 1 ? '' : 's') + ' ' + (kind === 'trade' ? 'swapped' : 'added')
                        ),
                        h('div', { style: { fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6, fontFamily: 'JetBrains Mono, monospace' } }, date)
                    )
                );
            })
        );
    }

    // ── Model Settings sub-tab ────────────────────────────────────
    function SettingsView({ settings, setSettings }) {
        const update = (patch) => { const next = { ...settings, ...patch }; setSettings(next); saveSettings(next); };
        const updateFocus = (k, v) => update({ focus: { ...settings.focus, [k]: v } });
        const updateChannel = (k, v) => update({ channel: { ...settings.channel, [k]: v } });

        const sliderRow = (label, key, min, max, step, format) => h('div', { style: { marginBottom: '16px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } },
                h('span', { style: { fontSize: '0.82rem', color: 'var(--white)', opacity: 0.88 } }, label),
                h('span', { style: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold)' } },
                    format ? format(settings[key]) : settings[key])
            ),
            h('input', {
                type: 'range', min, max, step: step || 1,
                value: settings[key],
                onChange: e => update({ [key]: Number(e.target.value) }),
                style: { width: '100%', accentColor: '#D4AF37' },
            })
        );

        const focusChip = (k, label) => h('button', {
            key: k, onClick: () => updateFocus(k, !settings.focus[k]),
            style: {
                padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                border: '1px solid ' + (settings.focus[k] ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'),
                background: settings.focus[k] ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.02)',
                color: settings.focus[k] ? 'var(--gold)' : 'var(--silver)',
            }
        }, label);
        const chanChip = (k, label) => h('button', {
            key: k, onClick: () => updateChannel(k, !settings.channel[k]),
            style: {
                padding: '6px 12px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 500,
                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                border: '1px solid ' + (settings.channel[k] ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'),
                background: settings.channel[k] ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.02)',
                color: settings.channel[k] ? 'var(--gold)' : 'var(--silver)',
            }
        }, label);

        return h('div', { style: { display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '14px' } },
            h(window.WR.Card, { padding: '20px 22px' },
                h('h3', { style: { fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 16px' } }, 'Model tuning'),
                sliderRow('Alert threshold \u2014 Confidence %', 'alertThreshold', 0, 100, 1),
                sliderRow('Max alerts per week', 'maxAlertsPerWeek', 1, 20, 1),
                sliderRow('Min projected-points delta to surface', 'minPointsDelta', 0, 10, 0.5, v => Number(v).toFixed(1)),
                h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' } },
                    h('button', { onClick: () => { const p = { ...DEFAULT_SETTINGS, alertThreshold: 85, maxAlertsPerWeek: 3, minPointsDelta: 4 }; setSettings(p); saveSettings(p); }, style: presetBtnStyle }, 'Conservative'),
                    h('button', { onClick: () => { const p = { ...DEFAULT_SETTINGS }; setSettings(p); saveSettings(p); }, style: presetBtnStyle }, 'Balanced'),
                    h('button', { onClick: () => { const p = { ...DEFAULT_SETTINGS, alertThreshold: 55, maxAlertsPerWeek: 12, minPointsDelta: 1 }; setSettings(p); saveSettings(p); }, style: presetBtnStyle }, 'Aggressive')
                )
            ),
            h(window.WR.Card, { padding: '20px 22px' },
                h('h3', { style: { fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '0.96rem', margin: '0 0 16px' } }, 'Focus areas'),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px' } },
                    focusChip('startSit', 'Start / Sit'),
                    focusChip('trades', 'Trades'),
                    focusChip('waivers', 'Waivers'),
                    focusChip('draft', 'Draft'),
                    focusChip('injury', 'Injury watch'),
                    focusChip('streaming', 'Streaming'),
                    focusChip('gmStyle', 'GM style')
                ),
                h('div', { style: { fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginTop: '12px', lineHeight: 1.5 } },
                    'Alex only surfaces insights for active focus areas. History still logs everything.'),
                h('div', { style: { marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' } },
                    h('div', { style: { fontSize: '0.82rem', color: 'var(--white)', opacity: 0.88, marginBottom: '10px' } }, 'Notification channel'),
                    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '7px' } },
                        chanChip('inApp', 'In-app'),
                        chanChip('email', 'Email (daily)'),
                        chanChip('push', 'Push')
                    )
                )
            )
        );
    }

    const presetBtnStyle = {
        flex: 1, padding: '7px 10px', borderRadius: '6px',
        fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
        color: 'var(--silver)', fontFamily: 'DM Sans, sans-serif',
    };

    // ── Main component ────────────────────────────────────────────
    function AlexInsightsTab(props) {
        const [subTab, setSubTab] = useState(() => {
            try { return localStorage.getItem('wr_alex_subtab') || 'overview'; } catch { return 'overview'; }
        });
        useEffect(() => { try { localStorage.setItem('wr_alex_subtab', subTab); } catch {} }, [subTab]);

        const [settings, setSettings] = useState(loadSettings);

        // Keep local state in sync with cross-surface setting changes so
        // Overview filters update when the user tweaks sliders elsewhere.
        useEffect(() => {
            if (!window.WR?.AlexSettings?.subscribe) return;
            return window.WR.AlexSettings.subscribe((next) => setSettings(next || loadSettings()));
        }, []);

        // Safe read of derived data — handle mid-load states
        const kpis = React.useMemo(() => computeKpis(props), [props.myRoster, props.currentLeague, props.timeRecomputeTs]);
        const rawInsights = React.useMemo(() => computeInsights(props, kpis), [kpis, props.myRoster, props.playersData]);
        // Filter through AlexSettings — applies alertThreshold + focus areas + maxAlertsPerWeek.
        const insights = React.useMemo(() => {
            if (window.WR?.AlexSettings?.filterInsights) return window.WR.AlexSettings.filterInsights(rawInsights);
            return rawInsights.slice(0, 6);
        }, [rawInsights, settings]);

        return h('div', { style: { padding: '24px 28px 60px', maxWidth: '1360px', margin: '0 auto' } },
            h(Hero, { active: !!(window.App?.LI_LOADED) }),
            h(SubTabs, {
                value: subTab,
                onChange: setSubTab,
                tabs: [
                    { k: 'overview', label: 'Overview' },
                    { k: 'patterns', label: 'Patterns' },
                    { k: 'history', label: 'Decision History' },
                    { k: 'settings', label: 'Model Settings' },
                ]
            }),
            subTab === 'overview' && h(OverviewView, { kpis, insights, props }),
            subTab === 'patterns' && h(PatternsView),
            subTab === 'history' && h(HistoryView),
            subTab === 'settings' && h(SettingsView, { settings, setSettings })
        );
    }

    window.AlexInsightsTab = AlexInsightsTab;
})();
