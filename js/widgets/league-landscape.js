// ══════════════════════════════════════════════════════════════════
// js/widgets/league-landscape.js — League Landscape widget (v2)
//
// Merges standings + transaction ticker + competitive context.
// md: compact power rankings. lg: standings + activity. tall: + movers.
//
// Depends on: theme.js, core.js (assessAllTeamsFromGlobal)
// Exposes:    window.LeagueLandscapeWidget
// ══════════════════════════════════════════════════════════════════

(function() {
    'use strict';

    function LeagueLandscapeWidget({ size, standings, transactions, rankedTeams, sleeperUserId, currentLeague, playersData, setActiveTab, getOwnerName, getPlayerName, timeAgo }) {
        const theme = window.WrTheme?.get?.() || {};
        const colors = theme.colors || {};
        const fonts = theme.fonts || {};
        const cardStyle = window.WrTheme?.cardStyle?.() || {};
        const fs = (rem) => window.WrTheme?.fontSize?.(rem) || (rem + 'rem');

        const allAssess = React.useMemo(() => {
            if (typeof window.assessAllTeamsFromGlobal === 'function') return window.assessAllTeamsFromGlobal() || [];
            return [];
        }, []);

        // Power rankings: sort by healthScore desc
        const powerRanked = React.useMemo(() => {
            return [...allAssess].sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));
        }, [allAssess]);

        // Recent transactions
        const recentTx = React.useMemo(() => {
            if (!Array.isArray(transactions)) return [];
            return transactions.slice(0, size === 'md' ? 0 : size === 'lg' ? 3 : 5);
        }, [transactions, size]);

        const isClickable = size === 'sm' || size === 'md';
        const onClick = () => { if (isClickable && setActiveTab) setActiveTab('league'); };

        // Tier color
        const tierCol = (tier) => tier === 'ELITE' ? colors.positive : tier === 'CONTENDER' ? colors.accent : tier === 'CROSSROADS' ? colors.warn : colors.negative;

        // ── MD: compact power rankings ──
        if (size === 'md') {
            const top5 = powerRanked.slice(0, 5);
            const maxH = Math.max(...top5.map(a => a.healthScore || 0), 1);
            return (
                <div onClick={onClick} style={{ ...cardStyle, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1rem' }}>🌐</span>
                        <span style={{ fontFamily: fonts.display, fontSize: fs(0.82), fontWeight: 700, color: colors.accent, letterSpacing: '0.07em', textTransform: 'uppercase' }}>League Landscape</span>
                    </div>
                    {top5.map((a, i) => {
                        const isMe = a.rosterId && (currentLeague?.rosters || []).find(r => r.roster_id === a.rosterId)?.owner_id === sleeperUserId;
                        const name = getOwnerName ? getOwnerName(a.rosterId) : ('Team ' + (i + 1));
                        const pct = ((a.healthScore || 0) / maxH) * 100;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{ fontSize: fs(0.5), color: i < 3 ? colors.accent : colors.textMuted, fontWeight: 700, width: 14, textAlign: 'right', fontFamily: fonts.mono }}>{i + 1}</span>
                                <div style={{ flex: 1, minWidth: 0, position: 'relative', height: 16, borderRadius: theme.card?.radius === '0px' ? '0' : '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                                    <div style={{ width: pct + '%', height: '100%', background: isMe ? colors.accent : 'rgba(255,255,255,0.15)', borderRadius: 'inherit', transition: '0.3s' }} />
                                    <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: fs(0.44), fontWeight: isMe ? 800 : 500, color: isMe ? colors.text : colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%', fontFamily: fonts.ui }}>{isMe ? '★ ' : ''}{(name || '').slice(0, 14)}</span>
                                </div>
                                <span style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.textMuted, minWidth: 20, textAlign: 'right', fontFamily: fonts.mono }}>{a.healthScore || 0}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // ── LG / TALL / XL: standings + activity ──
        const showTx = size !== 'md';
        const showMovers = size === 'tall' || size === 'xl';
        const top = size === 'xl' ? powerRanked : powerRanked.slice(0, size === 'tall' ? 12 : 8);

        return (
            <div style={{ ...cardStyle, padding: '14px 16px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>🌐</span>
                    <span style={{ fontFamily: fonts.display, fontSize: fs(0.9), fontWeight: 700, color: colors.accent, letterSpacing: '0.07em', textTransform: 'uppercase', flex: 1 }}>League Landscape</span>
                    {transactions && <span style={{ fontSize: fs(0.48), color: colors.textMuted, fontFamily: fonts.ui }}>{transactions.length} moves</span>}
                </div>

                {/* Standings table */}
                <div style={{ marginBottom: showTx ? '12px' : 0 }}>
                    {top.map((a, i) => {
                        const isMe = a.rosterId && (currentLeague?.rosters || []).find(r => r.roster_id === a.rosterId)?.owner_id === sleeperUserId;
                        const name = getOwnerName ? getOwnerName(a.rosterId) : ('Team ' + (i + 1));
                        const tc = tierCol(a.tier);
                        return (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                background: isMe ? 'rgba(212,175,55,0.04)' : 'transparent',
                            }}>
                                <span style={{ fontSize: fs(0.48), color: i < 3 ? colors.accent : colors.textMuted, fontWeight: 700, width: 16, textAlign: 'right', fontFamily: fonts.mono }}>{i + 1}</span>
                                <span style={{ flex: 1, fontSize: fs(0.56), fontWeight: isMe ? 700 : 500, color: isMe ? colors.accent : colors.text, fontFamily: fonts.ui, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {isMe ? '★ ' : ''}{(name || '').slice(0, 18)}
                                </span>
                                <span style={{ ...window.WrTheme?.badgeStyle?.(tc) || {}, fontSize: fs(0.4) }}>{(a.tier || '—').slice(0, 4)}</span>
                                <span style={{ fontSize: fs(0.48), fontWeight: 700, color: colors.textMuted, minWidth: 22, textAlign: 'right', fontFamily: fonts.mono }}>{a.healthScore || 0}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Recent activity feed */}
                {showTx && recentTx.length > 0 && (
                    <div>
                        <div style={{ fontSize: fs(0.44), fontWeight: 700, color: colors.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', fontFamily: fonts.ui }}>Recent Activity</div>
                        {recentTx.map((tx, i) => {
                            const type = tx.type || 'move';
                            const typeCol = type === 'trade' ? colors.purple : type === 'waiver' ? colors.info : colors.positive;
                            return (
                                <div key={i} style={{ display: 'flex', gap: '6px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: fs(0.5), fontFamily: fonts.ui }}>
                                    <span style={{ ...window.WrTheme?.badgeStyle?.(typeCol) || {}, fontSize: fs(0.38) }}>{type.toUpperCase()}</span>
                                    <span style={{ flex: 1, color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {tx.description || tx.type || '—'}
                                    </span>
                                    {tx.created && <span style={{ fontSize: fs(0.38), color: colors.textFaint }}>{timeAgo ? timeAgo(tx.created) : ''}</span>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Movers section for tall/xl */}
                {showMovers && (
                    <div style={{ marginTop: '12px', fontSize: fs(0.5), color: colors.textFaint, fontStyle: 'italic', fontFamily: fonts.ui }}>
                        "Who's Moving" trends coming in Phase 3b
                    </div>
                )}
            </div>
        );
    }

    window.LeagueLandscapeWidget = LeagueLandscapeWidget;
})();
