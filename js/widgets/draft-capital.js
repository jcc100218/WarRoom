// ══════════════════════════════════════════════════════════════════
// js/widgets/draft-capital.js — Draft Capital widget (v2)
//
// Forward-looking: pick inventory, values, draft countdown.
// sm: total pick value hero. md: pick pills + countdown. lg: + value chart.
//
// Depends on: theme.js, core.js (PlayerValue, S.tradedPicks)
// Exposes:    window.DraftCapitalWidget
// ══════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    function DraftCapitalWidget({ size, myRoster, currentLeague, playersData, briefDraftInfo, setActiveTab }) {
        const theme = window.WrTheme?.get?.() || {};
        const colors = theme.colors || {};
        const fonts = theme.fonts || {};
        const cardStyle = window.WrTheme?.cardStyle?.() || {};
        const fs = (rem) => window.WrTheme?.fontSize?.(rem) || (rem + 'rem');

        const myRid = myRoster?.roster_id;
        const season = String(currentLeague?.season || new Date().getFullYear());
        const draftRounds = currentLeague?.settings?.draft_rounds || 5;
        const totalTeams = currentLeague?.rosters?.length || 12;
        const tradedPicks = window.S?.tradedPicks || [];

        // ── Pick inventory ──────────────────────────────────────
        const picks = React.useMemo(() => {
            const inv = [];
            const pvFn = window.App?.PlayerValue?.getPickValue;
            for (let yr = parseInt(season); yr <= parseInt(season) + 2; yr++) {
                for (let rd = 1; rd <= draftRounds; rd++) {
                    // Check if we traded this pick away
                    const tradedAway = tradedPicks.find(p =>
                        parseInt(p.season) === yr && p.round === rd &&
                        p.roster_id === myRid && p.owner_id !== myRid
                    );
                    if (tradedAway) continue;

                    // Check if we acquired picks at this round from others
                    const acquired = tradedPicks.filter(p =>
                        parseInt(p.season) === yr && p.round === rd &&
                        p.owner_id === myRid && p.roster_id !== myRid
                    );

                    // Own pick (not traded away)
                    if (!tradedAway) {
                        const val = pvFn ? pvFn(yr, rd, totalTeams, Math.ceil(totalTeams / 2)) : Math.max(500, 10000 - rd * 2000);
                        inv.push({ year: yr, round: rd, own: true, value: val, label: yr === parseInt(season) ? 'R' + rd : "'" + String(yr).slice(-2) + ' R' + rd });
                    }

                    // Acquired picks
                    acquired.forEach(a => {
                        const fromRoster = (currentLeague?.rosters || []).find(r => r.roster_id === a.roster_id);
                        const fromUser = fromRoster ? (window.S?.leagueUsers || []).find(u => u.user_id === fromRoster.owner_id) : null;
                        const fromName = fromUser?.display_name || ('T' + a.roster_id);
                        const val = pvFn ? pvFn(yr, rd, totalTeams, Math.ceil(totalTeams / 2)) : Math.max(500, 10000 - rd * 2000);
                        inv.push({ year: yr, round: rd, own: false, from: fromName, value: val, label: (yr === parseInt(season) ? '' : "'" + String(yr).slice(-2) + ' ') + 'R' + rd + ' (' + fromName.slice(0, 6) + ')' });
                    });
                }
            }
            return inv;
        }, [myRid, season, draftRounds, totalTeams, tradedPicks]);

        const totalValue = picks.reduce((s, p) => s + (p.value || 0), 0);
        const pickCount = picks.length;
        const maxRoundVal = Math.max(...picks.map(p => p.value || 0), 1);

        // Draft countdown
        const countdown = React.useMemo(() => {
            if (!briefDraftInfo?.start_time || briefDraftInfo.status !== 'pre_draft') return null;
            const diff = briefDraftInfo.start_time - Date.now();
            if (diff <= 0) return { text: 'DRAFT IS LIVE', live: true };
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return { text: days > 0 ? days + 'd ' + hours + 'h' : hours + 'h', live: false };
        }, [briefDraftInfo]);

        const valCol = totalValue >= 20000 ? colors.positive : totalValue >= 10000 ? colors.accent : colors.negative;
        const isClickable = size === 'sm' || size === 'md';
        const onClick = () => { if (isClickable && setActiveTab) setActiveTab('draft'); };

        // ── SM: total value hero ──
        if (size === 'sm') {
            return (
                <div onClick={onClick} style={{
                    ...cardStyle, padding: '14px 12px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
                }}>
                    <div style={{
                        fontFamily: fonts.mono, fontSize: fs(1.6), fontWeight: 700,
                        color: valCol, lineHeight: 1,
                    }} className="wr-data-value">
                        {totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue}
                    </div>
                    <div style={{ fontSize: fs(0.5), color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '4px', fontFamily: fonts.ui }}>
                        {pickCount} PICKS
                    </div>
                    {countdown && (
                        <div style={{
                            marginTop: '6px', fontSize: fs(0.44),
                            color: countdown.live ? colors.positive : colors.accent,
                            fontWeight: 700, fontFamily: fonts.ui,
                        }}>{countdown.text}</div>
                    )}
                </div>
            );
        }

        // ── MD: pick pills + countdown ──
        if (size === 'md') {
            return (
                <div onClick={onClick} style={{ ...cardStyle, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1rem' }}>🎯</span>
                        <span style={{ fontFamily: fonts.display, fontSize: fs(0.82), fontWeight: 700, color: colors.warn, letterSpacing: '0.07em', textTransform: 'uppercase', flex: 1 }}>Draft Capital</span>
                        {countdown && <span style={{ fontSize: fs(0.48), color: countdown.live ? colors.positive : colors.accent, fontWeight: 700, fontFamily: fonts.ui }}>{countdown.text}</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                        {picks.slice(0, 10).map((p, i) => {
                            const pct = (p.value / maxRoundVal) * 100;
                            return (
                                <div key={i} style={{
                                    position: 'relative', overflow: 'hidden',
                                    padding: '3px 8px', fontSize: fs(0.48), fontWeight: 700,
                                    borderRadius: theme.card?.radius === '0px' ? '0' : '4px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid ' + (p.own ? 'rgba(255,255,255,0.08)' : colors.accent + '44'),
                                    color: p.own ? colors.text : colors.accent,
                                    fontFamily: fonts.ui,
                                }}>
                                    {/* Value bar behind text */}
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct + '%', background: colors.accent + '12', transition: '0.3s' }} />
                                    <span style={{ position: 'relative', zIndex: 1 }}>{p.label}</span>
                                </div>
                            );
                        })}
                        {picks.length > 10 && <span style={{ fontSize: fs(0.44), color: colors.textFaint, alignSelf: 'center' }}>+{picks.length - 10}</span>}
                    </div>
                    <div style={{ fontSize: fs(0.5), color: colors.textMuted, fontFamily: fonts.mono }}>
                        Total: {totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue} DHQ value · {pickCount} picks
                    </div>
                </div>
            );
        }

        // ── LG: full inventory + value comparison ──
        return (
            <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>🎯</span>
                    <span style={{ fontFamily: fonts.display, fontSize: fs(0.9), fontWeight: 700, color: colors.warn, letterSpacing: '0.07em', textTransform: 'uppercase', flex: 1 }}>Draft Capital</span>
                    {countdown && (
                        <span style={{
                            fontSize: fs(0.52), fontWeight: 700,
                            color: countdown.live ? colors.positive : colors.accent,
                            fontFamily: fonts.ui,
                        }}>{countdown.live ? '🔴 ' : '📅 '}{countdown.text}</span>
                    )}
                </div>

                {/* Pick inventory with value bars */}
                <div style={{ marginBottom: '12px' }}>
                    {picks.map((p, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}>
                            <span style={{ fontSize: fs(0.52), fontWeight: 700, color: p.own ? colors.text : colors.accent, minWidth: 80, fontFamily: fonts.ui }}>
                                {p.label}
                            </span>
                            <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: theme.card?.radius === '0px' ? '0' : '3px', overflow: 'hidden' }}>
                                <div style={{ width: ((p.value / maxRoundVal) * 100) + '%', height: '100%', background: p.round <= 2 ? colors.accent : colors.textMuted + '66', transition: '0.3s' }} />
                            </div>
                            <span style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.textMuted, minWidth: 36, textAlign: 'right', fontFamily: fonts.mono }}>
                                {p.value >= 1000 ? (p.value / 1000).toFixed(1) + 'k' : p.value}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Total */}
                <div style={{
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid ' + (colors.border || 'rgba(255,255,255,0.06)'),
                    borderRadius: theme.card?.radius === '0px' ? '0' : '6px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ fontSize: fs(0.52), color: colors.textMuted, fontFamily: fonts.ui }}>TOTAL CAPITAL</span>
                    <span style={{ fontSize: fs(1.0), fontWeight: 700, color: valCol, fontFamily: fonts.mono }} className="wr-data-value">
                        {totalValue >= 1000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue}
                    </span>
                </div>
            </div>
        );
    }

    window.DraftCapitalWidget = DraftCapitalWidget;
})();
