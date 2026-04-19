// ══════════════════════════════════════════════════════════════════
// js/widgets/power-rankings.js — Power Rankings Home widget (Phase 3)
//
// Three ranking views (same set as the old League Map panel):
//   - Blended:   sorted by healthScore   (0-100)
//   - Contender: sorted by optimal PPG   (current starting lineup)
//   - Dynasty:   sorted by total roster DHQ
//
// The active view is stored on window._wrPrView so selection persists across
// re-renders (matches how the League Map panel did it).
//
// Sizes: sm (my rank) · md (my rank + blended bar) · lg (top 5 blended) ·
//        tall / xxl (view tabs + top 10 + me row).
//
// Depends on: window.assessAllTeamsFromGlobal, window.App.calcOptimalPPG,
//             window.App.LI.playerScores
// Exposes:    window.PowerRankingsWidget
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const VIEW_COLORS = {
        top: '#2ECC71', mid: 'var(--silver)', bottom: '#E74C3C',
    };

    function rowColor(i) {
        if (i < 3) return VIEW_COLORS.top;
        if (i < 8) return VIEW_COLORS.mid;
        return VIEW_COLORS.bottom;
    }

    function PowerRankingsWidget({ size, sleeperUserId, currentLeague, playersData, setActiveTab }) {
        const [view, setView] = React.useState(() => window._wrPrView || 'blended');
        React.useEffect(() => { window._wrPrView = view; }, [view]);

        const assessments = React.useMemo(() => {
            if (typeof window.assessAllTeamsFromGlobal === 'function') {
                try { return window.assessAllTeamsFromGlobal() || []; } catch { return []; }
            }
            return [];
        }, []);

        const views = React.useMemo(() => {
            const rp = currentLeague?.roster_positions || [];
            const rosters = currentLeague?.rosters || [];
            const stats = (window.S && window.S.playerStats) || {};

            const blended = [...assessments].sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));

            const contender = assessments.map(t => {
                const r = rosters.find(r2 => r2.roster_id === t.rosterId);
                const ppg = typeof window.App?.calcOptimalPPG === 'function'
                    ? (window.App.calcOptimalPPG(r?.players || [], playersData, stats, rp) || 0)
                    : 0;
                return { ...t, ppg };
            }).sort((a, b) => b.ppg - a.ppg);

            const dynasty = assessments.map(t => {
                const r = rosters.find(r2 => r2.roster_id === t.rosterId);
                const totalDhq = (r?.players || []).reduce((s, pid) => s + ((window.App?.LI?.playerScores || {})[pid] || 0), 0);
                return { ...t, totalDhq };
            }).sort((a, b) => b.totalDhq - a.totalDhq);

            return {
                blended:   { label: 'Blended',   data: blended,   valFn: t => t.healthScore || 0, fmtFn: v => String(v) },
                contender: { label: 'Contender', data: contender, valFn: t => t.ppg || 0,         fmtFn: v => v > 0 ? v.toFixed(1) : '\u2014' },
                dynasty:   { label: 'Dynasty',   data: dynasty,   valFn: t => t.totalDhq || 0,    fmtFn: v => v > 0 ? ((v / 1000).toFixed(1) + 'K') : '\u2014' },
            };
        }, [assessments, currentLeague, playersData]);

        const cur = views[view] || views.blended;
        const mine = cur.data.findIndex(t => t.ownerId === sleeperUserId);

        const base = {
            background: 'var(--off-black)',
            border: '1px solid rgba(212,175,55,0.12)',
            borderRadius: '10px', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            height: '100%', minHeight: 0,
        };
        function jumpToLeague() { if (setActiveTab) setActiveTab('league'); }

        if (!assessments.length) {
            return React.createElement('div', { style: { ...base, alignItems: 'center', justifyContent: 'center' } },
                React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--silver)', opacity: 0.55 } }, 'League intelligence loading…')
            );
        }

        // ── sm: My rank ─────────────────────────────────────────
        if (size === 'sm') {
            const rank = mine >= 0 ? mine + 1 : null;
            const col = rank && rank <= 3 ? VIEW_COLORS.top : rank && rank <= 8 ? VIEW_COLORS.mid : VIEW_COLORS.bottom;
            return React.createElement('div', { style: { ...base, cursor: 'pointer', textAlign: 'center', justifyContent: 'center' }, onClick: jumpToLeague },
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.65 } }, 'Power Rank'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.4rem', fontWeight: 700, color: col } }, rank ? '#' + rank : '—'),
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.55 } }, cur.label + ' · of ' + cur.data.length)
            );
        }

        // ── md: my rank + blended mini-bar ───────────────────────
        if (size === 'md') {
            const rank = mine >= 0 ? mine + 1 : null;
            const col = rank && rank <= 3 ? VIEW_COLORS.top : rank && rank <= 8 ? VIEW_COLORS.mid : VIEW_COLORS.bottom;
            const maxVal = cur.valFn(cur.data[0]) || 1;
            return React.createElement('div', { style: base },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '0.9rem' } }, '📈'),
                    React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em' } }, 'Power Rankings'),
                    React.createElement('div', { style: { marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.6 } }, cur.label)
                ),
                React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
                    React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.35rem', fontWeight: 700, color: col } }, rank ? '#' + rank : '—'),
                    React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.55 } }, 'of ' + cur.data.length)
                ),
                React.createElement('div', { style: { display: 'flex', gap: '1px', height: '6px', borderRadius: '3px', overflow: 'hidden' } },
                    ...cur.data.map((t, i) => {
                        const val = cur.valFn(t);
                        const pct = (val / maxVal) * 100;
                        const isMe = t.ownerId === sleeperUserId;
                        return React.createElement('div', {
                            key: t.rosterId,
                            title: (i + 1) + '. ' + t.ownerName + ' — ' + cur.fmtFn(val),
                            style: {
                                flex: 1,
                                background: isMe ? 'var(--gold)' : rowColor(i),
                                opacity: isMe ? 1 : 0.5,
                            }
                        });
                    })
                )
            );
        }

        // ── lg / tall / xxl: top 5 (or 10 for tall) with view tabs ───
        const topN = size === 'tall' || size === 'xxl' ? 10 : 5;
        const top = cur.data.slice(0, topN);
        const showMe = mine >= topN;
        const displayData = showMe ? [...top, cur.data[mine]] : top;
        const remaining = cur.data.length - displayData.length;
        const maxVal = cur.valFn(cur.data[0]) || 1;

        return React.createElement('div', { style: base },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                React.createElement('span', { style: { fontSize: '0.95rem' } }, '📈'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em' } }, 'Power Rankings'),
                React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', gap: '3px' } },
                    ...['blended', 'contender', 'dynasty'].map(k =>
                        React.createElement('button', {
                            key: k,
                            onClick: () => setView(k),
                            style: {
                                padding: '2px 7px', fontSize: '0.6rem', fontFamily: 'Inter, sans-serif',
                                borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.04em',
                                border: '1px solid ' + (view === k ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                                background: view === k ? 'rgba(212,175,55,0.12)' : 'transparent',
                                color: view === k ? 'var(--gold)' : 'var(--silver)',
                            }
                        }, views[k].label)
                    )
                )
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1, minHeight: 0 } },
                ...displayData.map((t, di) => {
                    const i = cur.data.indexOf(t);
                    const isMe = t.ownerId === sleeperUserId;
                    const val = cur.valFn(t);
                    const pct = Math.min(100, Math.round((val / maxVal) * 100));
                    const col = rowColor(i);
                    return React.createElement('div', {
                        key: t.rosterId,
                        style: {
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '4px 6px', borderRadius: '4px',
                            background: isMe ? 'rgba(212,175,55,0.08)' : 'transparent',
                            borderTop: showMe && di === topN ? '1px dashed rgba(212,175,55,0.25)' : 'none',
                        }
                    },
                        React.createElement('span', { style: { fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)', width: '18px', textAlign: 'center' } }, i + 1),
                        React.createElement('span', {
                            style: {
                                flex: 1, fontSize: '0.74rem', color: isMe ? 'var(--gold)' : 'var(--white)',
                                fontWeight: isMe ? 700 : 500,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }
                        }, t.ownerName + (isMe ? ' ★' : '')),
                        React.createElement('div', { style: { width: '44px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 } },
                            React.createElement('div', { style: { width: pct + '%', height: '100%', background: col } })
                        ),
                        React.createElement('span', { style: { fontSize: '0.72rem', fontWeight: 700, color: col, width: '32px', textAlign: 'right' } }, cur.fmtFn(val))
                    );
                }),
                remaining > 0
                    ? React.createElement('div', {
                        onClick: jumpToLeague,
                        style: { fontSize: '0.66rem', color: 'var(--silver)', opacity: 0.55, textAlign: 'center', padding: '4px', cursor: 'pointer' }
                    }, '+ ' + remaining + ' more')
                    : null
            )
        );
    }

    window.PowerRankingsWidget = PowerRankingsWidget;
})();
