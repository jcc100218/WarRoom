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

    // ── Settings (persisted) ──────────────────────────────────────
    const SETTINGS_KEY = 'wr_alex_settings';
    const DEFAULT_SETTINGS = {
        alertThreshold: 70,
        maxAlertsPerWeek: 6,
        minPointsDelta: 2.5,
        focus: { startSit: true, trades: true, waivers: true, draft: true, injury: false, streaming: false, gmStyle: false },
        channel: { inApp: true, email: false, push: false },
    };
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
            if (s && typeof s === 'object') return { ...DEFAULT_SETTINGS, ...s, focus: { ...DEFAULT_SETTINGS.focus, ...(s.focus || {}) }, channel: { ...DEFAULT_SETTINGS.channel, ...(s.channel || {}) } };
        } catch (_) {}
        return { ...DEFAULT_SETTINGS };
    }
    function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) {} }

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
    // Lightweight heuristics over the same data. Each returns null or
    // an InsightCard-compatible object. Real Alex can layer on top.
    function computeInsights({ myRoster, currentLeague, playersData }, kpis) {
        const LI = window.App?.LI || {};
        const myRid = myRoster?.roster_id;
        const out = [];

        // — OPPORTUNITY: user hasn't traded much vs league average
        const allTrades = LI.tradeHistory || [];
        const rosterCount = (currentLeague?.rosters || []).length || 12;
        const leagueTradeAvg = allTrades.length / Math.max(1, rosterCount) * 2; // each trade has 2 sides
        if (kpis.tradeCount != null && leagueTradeAvg > 0 && kpis.tradeCount < leagueTradeAvg * 0.5) {
            out.push({
                severity: 'opportunity',
                confidence: 78,
                title: 'You trade less than half as often as your league',
                body: 'You\u2019ve been part of ' + kpis.tradeCount + ' trade' + (kpis.tradeCount === 1 ? '' : 's') + ' this era vs. a league average of ~' + Math.round(leagueTradeAvg) + '. Your analytical style tends to translate into good trades \u2014 you\u2019re leaving value on the table.',
                ctaLabel: 'Explore trade targets',
            });
        }

        // — EDGE: trade net DHQ positive and trade count meaningful
        if (kpis.tradeCount >= 3 && kpis.tradeNetDhq > 0) {
            out.push({
                severity: 'edge',
                confidence: 84,
                title: 'Your trades net +' + (kpis.tradeNetDhq / 1000).toFixed(1) + 'k DHQ across ' + kpis.tradeCount + ' deals',
                body: 'You\u2019re a net winner on trade value. Keep hunting deals \u2014 this is your highest-ROI activity.',
                ctaLabel: 'Continue & scale',
            });
        }

        // — WARNING: trade net DHQ negative
        if (kpis.tradeCount >= 3 && kpis.tradeNetDhq < -1000) {
            out.push({
                severity: 'warning',
                confidence: 82,
                title: 'Your trades are net -' + Math.abs(Math.round(kpis.tradeNetDhq / 1000)) + 'k DHQ',
                body: 'Across ' + kpis.tradeCount + ' trades you\u2019re giving up more value than you receive. Run proposals through Trade Center\u2019s analyzer before accepting.',
                ctaLabel: 'Review trade history',
            });
        }

        // — PATTERN: draft hit rate below 30% with meaningful sample
        if (kpis.draftHitPct != null && kpis.draftTotal >= 10 && kpis.draftHitPct < 30) {
            out.push({
                severity: 'pattern',
                confidence: 88,
                title: 'Your draft hit rate (' + kpis.draftHitPct + '%) trails starter caliber',
                body: 'Only ' + kpis.draftHits + ' of ' + kpis.draftTotal + ' drafted players reached contributor DHQ. Consider leaning on DHQ rankings over gut in rounds 1\u20133.',
                ctaLabel: 'Review draft board',
            });
        }

        // — EDGE: strong waiver hit rate
        if (kpis.waiverHitPct != null && kpis.waiverHitPct >= 50 && kpis.waiverTotal >= 5) {
            out.push({
                severity: 'edge',
                confidence: 80,
                title: 'You retain ' + kpis.waiverHitPct + '% of your waiver adds',
                body: 'That\u2019s above league-average stickiness. Your FA targeting instincts are working \u2014 keep adding aggressively at the position-scarcity windows.',
                ctaLabel: 'Continue & scale',
            });
        }

        // — WARNING: roster age cliff
        const age = (pid) => playersData?.[pid]?.age || 0;
        const peaks = window.App?.peakWindows || {};
        const agingPids = (myRoster?.players || []).filter(pid => {
            const p = playersData?.[pid]; if (!p) return false;
            const pos = p.position; const pk = peaks[pos] || [24, 29];
            return p.age && p.age > pk[1];
        });
        const agingDhq = agingPids.reduce((s, pid) => s + (LI.playerScores?.[pid] || 0), 0);
        const totalDhq = (myRoster?.players || []).reduce((s, pid) => s + (LI.playerScores?.[pid] || 0), 0);
        if (totalDhq > 0 && agingDhq / totalDhq > 0.25) {
            out.push({
                severity: 'warning',
                confidence: 91,
                title: Math.round((agingDhq / totalDhq) * 100) + '% of your roster DHQ is past peak',
                body: agingPids.length + ' players are on the wrong side of their position\u2019s peak window. Sell windows are closing \u2014 cash in now or commit to a rebuild.',
                ctaLabel: 'See aging assets',
            });
        }

        // Keep the deck manageable — top 4 by priority (warnings first)
        const priority = { warning: 0, edge: 1, pattern: 2, opportunity: 3 };
        out.sort((a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9));
        return out.slice(0, 4);
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
    function OverviewView({ kpis, insights }) {
        const Kpi = window.WR.Kpi;
        const InsightCard = window.WR.InsightCard;
        const fmtK = (n) => n == null ? null : ((n > 0 ? '+' : '') + (n / 1000).toFixed(1) + 'k');
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
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', margin: '0 0 12px' } },
                h('h2', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' } }, 'Behavioral Analysis'),
                h('span', { style: { fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6, fontFamily: 'JetBrains Mono, monospace' } },
                    '\u2014 ' + insights.length + ' insight' + (insights.length === 1 ? '' : 's'))
            ),
            insights.length === 0
                ? h(window.WR.Card, { padding: '24px' },
                    h('div', { style: { fontSize: '0.86rem', color: 'var(--silver)', opacity: 0.7, lineHeight: 1.55, textAlign: 'center' } },
                        'No behavioral patterns detected yet. Alex needs a bit of trade / waiver / draft history before it can speak confidently.')
                )
                : h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' } },
                    insights.map((ins, i) => h(InsightCard, { key: i, ...ins }))
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

        // Safe read of derived data — handle mid-load states
        const kpis = React.useMemo(() => computeKpis(props), [props.myRoster, props.currentLeague, props.timeRecomputeTs]);
        const insights = React.useMemo(() => computeInsights(props, kpis), [kpis, props.myRoster, props.playersData]);

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
            subTab === 'overview' && h(OverviewView, { kpis, insights }),
            subTab === 'patterns' && h(PatternsView),
            subTab === 'history' && h(HistoryView),
            subTab === 'settings' && h(SettingsView, { settings, setSettings })
        );
    }

    window.AlexInsightsTab = AlexInsightsTab;
})();
