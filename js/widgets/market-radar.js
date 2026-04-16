// ══════════════════════════════════════════════════════════════════
// js/widgets/market-radar.js — Market Radar widget (v2)
//
// Forward-looking: trade opportunities, waiver targets, FAAB budget.
// Replaces the old backward-looking trading + waivers modules.
//
// sm: "N DEALS" hero + pulse. md: top partner + FAAB. lg: radar + waivers.
//
// Depends on: theme.js, core.js (assessTeamFromGlobal, assessAllTeamsFromGlobal)
// Exposes:    window.MarketRadarWidget
// ══════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    function MarketRadarWidget({ size, myRoster, rankedTeams, sleeperUserId, currentLeague, playersData, setActiveTab }) {
        const theme = window.WrTheme?.get?.() || {};
        const colors = theme.colors || {};
        const fonts = theme.fonts || {};
        const cardStyle = window.WrTheme?.cardStyle?.() || {};
        const fs = (rem) => window.WrTheme?.fontSize?.(rem) || (rem + 'rem');

        // ── Data ────────────────────────────────────────────────
        const myAssess = React.useMemo(() => {
            if (typeof window.assessTeamFromGlobal === 'function' && myRoster?.roster_id) {
                return window.assessTeamFromGlobal(myRoster.roster_id);
            }
            return null;
        }, [myRoster?.roster_id]);

        const allAssess = React.useMemo(() => {
            if (typeof window.assessAllTeamsFromGlobal === 'function') return window.assessAllTeamsFromGlobal() || [];
            return [];
        }, []);

        // Compute trade compatibility (simplified complementarity)
        const tradeTargets = React.useMemo(() => {
            if (!myAssess || !allAssess.length) return [];
            const myNeeds = (myAssess.needs || []).map(n => typeof n === 'string' ? n : n?.pos).filter(Boolean);
            const myStrengths = (myAssess.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean);
            return allAssess
                .filter(a => a.rosterId !== myRoster?.roster_id)
                .map(a => {
                    const theirNeeds = (a.needs || []).map(n => typeof n === 'string' ? n : n?.pos).filter(Boolean);
                    const theirStrengths = (a.strengths || []).map(s => typeof s === 'string' ? s : s?.pos).filter(Boolean);
                    // Complementarity: their strengths fill my needs AND my strengths fill theirs
                    const theyFillMe = theirStrengths.filter(s => myNeeds.includes(s)).length;
                    const iFillThem = myStrengths.filter(s => theirNeeds.includes(s)).length;
                    const compat = (theyFillMe + iFillThem) * 20;
                    const roster = (currentLeague?.rosters || []).find(r => r.roster_id === a.rosterId);
                    const user = roster ? (currentLeague?.users || window.S?.leagueUsers || []).find(u => u.user_id === roster.owner_id) : null;
                    const name = user?.metadata?.team_name || user?.display_name || ('Team ' + a.rosterId);
                    return { ...a, compat, name, theyFillMe, iFillThem, theirNeeds: theirNeeds.slice(0, 3), myOffers: myStrengths.filter(s => theirNeeds.includes(s)) };
                })
                .filter(a => a.compat > 0)
                .sort((a, b) => b.compat - a.compat)
                .slice(0, 5);
        }, [myAssess, allAssess, myRoster?.roster_id]);

        // FAAB
        const faab = React.useMemo(() => {
            const budget = currentLeague?.settings?.waiver_budget || 100;
            const used = myRoster?.settings?.waiver_budget_used || 0;
            const remaining = budget - used;
            const pct = (remaining / Math.max(budget, 1)) * 100;
            return { remaining, budget, pct };
        }, [currentLeague, myRoster]);

        // Waiver wire targets (un-rostered players with highest DHQ)
        const waiverTargets = React.useMemo(() => {
            const scores = window.App?.LI?.playerScores || {};
            const rostered = new Set();
            (currentLeague?.rosters || []).forEach(r => (r.players || []).forEach(pid => rostered.add(pid)));
            const available = Object.entries(scores)
                .filter(([pid]) => !rostered.has(pid) && scores[pid] > 1500)
                .map(([pid, dhq]) => {
                    const p = playersData?.[pid] || {};
                    return { pid, name: p.full_name || pid, pos: (window.App?.normPos?.(p.position) || p.position || '?'), dhq, team: p.team || 'FA' };
                })
                .sort((a, b) => b.dhq - a.dhq)
                .slice(0, 5);
            return available;
        }, [currentLeague, playersData]);

        const dealCount = tradeTargets.length;
        const dealCol = dealCount >= 3 ? colors.positive : dealCount >= 1 ? colors.accent : colors.textMuted;

        const isClickable = size === 'sm' || size === 'md';
        const onClick = () => { if (isClickable && setActiveTab) setActiveTab('trades'); };

        // ── SM: "N DEALS" hero ──
        if (size === 'sm') {
            return (
                <div onClick={onClick} style={{
                    ...cardStyle, padding: '14px 12px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                }}>
                    <div style={{
                        fontFamily: fonts.mono, fontSize: fs(2.2), fontWeight: 700,
                        color: dealCol, lineHeight: 1,
                    }} className="wr-data-value">{dealCount}</div>
                    <div style={{ fontSize: fs(0.5), color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px', fontFamily: fonts.ui }}>
                        TRADE TARGETS
                    </div>
                    {dealCount > 0 && (
                        <div style={{
                            marginTop: '6px', width: 8, height: 8, borderRadius: '50%',
                            background: colors.positive, animation: 'pulse 1.4s infinite',
                        }} />
                    )}
                </div>
            );
        }

        // ── MD: top partner + FAAB ──
        if (size === 'md') {
            const top = tradeTargets[0];
            return (
                <div onClick={onClick} style={{ ...cardStyle, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1rem' }}>📡</span>
                        <span style={{ fontFamily: fonts.display, fontSize: fs(0.82), fontWeight: 700, color: colors.purple, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Market Radar</span>
                    </div>
                    {top ? (
                        <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontSize: fs(0.7), fontWeight: 700, color: colors.text, fontFamily: fonts.ui }}>{top.name}</div>
                            <div style={{ fontSize: fs(0.5), color: colors.textMuted, marginTop: '2px', fontFamily: fonts.ui }}>
                                wants {top.theirNeeds.join(', ') || '—'} · you have {top.myOffers.join(', ') || '—'}
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: fs(0.6), color: colors.textFaint, fontStyle: 'italic', marginBottom: '8px', fontFamily: fonts.ui }}>
                            No strong matches found
                        </div>
                    )}
                    {/* FAAB bar */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs(0.44), color: colors.textMuted, marginBottom: '3px', fontFamily: fonts.ui }}>
                            <span>FAAB</span>
                            <span>${faab.remaining} / ${faab.budget}</span>
                        </div>
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: theme.card?.radius === '0px' ? '0' : '3px', overflow: 'hidden' }}>
                            <div style={{ width: faab.pct + '%', height: '100%', background: faab.pct > 50 ? colors.positive : faab.pct > 25 ? colors.warn : colors.negative, transition: '0.3s' }} />
                        </div>
                    </div>
                </div>
            );
        }

        // ── LG / TALL: trade radar + waiver targets ──
        return (
            <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>📡</span>
                    <span style={{ fontFamily: fonts.display, fontSize: fs(0.9), fontWeight: 700, color: colors.purple, letterSpacing: '0.07em', textTransform: 'uppercase', flex: 1 }}>Market Radar</span>
                    <span style={{ fontSize: fs(0.48), color: colors.textMuted }}>{dealCount} targets</span>
                </div>

                {/* Trade partners */}
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', fontFamily: fonts.ui }}>Trade Partners</div>
                    {tradeTargets.slice(0, 3).map((t, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}>
                            <div style={{
                                width: 4, height: 28, borderRadius: 2,
                                background: t.compat >= 60 ? colors.positive : t.compat >= 30 ? colors.accent : colors.warn,
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: fs(0.58), fontWeight: 700, color: colors.text, fontFamily: fonts.ui }}>{t.name}</div>
                                <div style={{ fontSize: fs(0.44), color: colors.textMuted, fontFamily: fonts.ui }}>
                                    wants {t.theirNeeds.join(', ') || '—'}
                                </div>
                            </div>
                            <span style={{ fontSize: fs(0.48), fontWeight: 700, color: colors.accent, fontFamily: fonts.mono }}>{t.compat}%</span>
                        </div>
                    ))}
                    {tradeTargets.length === 0 && (
                        <div style={{ fontSize: fs(0.52), color: colors.textFaint, fontStyle: 'italic', padding: '8px 0', fontFamily: fonts.ui }}>No strong complementarity matches</div>
                    )}
                </div>

                {/* Waiver wire */}
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', fontFamily: fonts.ui }}>Waiver Wire</div>
                    {waiverTargets.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: fs(0.52) }}>
                            <span style={{ fontWeight: 700, color: colors.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: fonts.ui }}>{p.name}</span>
                            <span style={{ ...window.WrTheme?.badgeStyle?.(window.App?.POS_COLORS?.[p.pos] || colors.accent) || {}, fontSize: fs(0.4) }}>{p.pos}</span>
                            <span style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.textMuted, fontFamily: fonts.mono }}>{p.dhq >= 1000 ? (p.dhq / 1000).toFixed(1) + 'k' : p.dhq}</span>
                        </div>
                    ))}
                    {waiverTargets.length === 0 && (
                        <div style={{ fontSize: fs(0.52), color: colors.textFaint, fontStyle: 'italic', fontFamily: fonts.ui }}>Wire is clean</div>
                    )}
                </div>

                {/* FAAB */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs(0.44), color: colors.textMuted, marginBottom: '3px', fontFamily: fonts.ui }}>
                        <span>FAAB BUDGET</span>
                        <span>${faab.remaining} / ${faab.budget}</span>
                    </div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: theme.card?.radius === '0px' ? '0' : '3px', overflow: 'hidden' }}>
                        <div style={{ width: faab.pct + '%', height: '100%', background: faab.pct > 50 ? colors.positive : faab.pct > 25 ? colors.warn : colors.negative, transition: '0.3s' }} />
                    </div>
                </div>
            </div>
        );
    }

    window.MarketRadarWidget = MarketRadarWidget;
})();
