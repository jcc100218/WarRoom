// ══════════════════════════════════════════════════════════════════
// js/widgets/competitive-tiers.js — Competitive Tiers Home widget (Phase 3)
//
// Groups every team in the league into ELITE / CONTENDER / CROSSROADS /
// REBUILDING using the shared assessAllTeamsFromGlobal() helper.
// Replaces the equivalent section of the (deprecated) League Map tab.
//
// Sizes: sm (my tier + count) · md (my tier + tier counts bar) ·
//        lg (4 stacked tier rows, top teams) · tall / xxl (full detail).
//
// Depends on: window.assessAllTeamsFromGlobal
// Exposes:    window.CompetitiveTiersWidget
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    const TIER_ORDER = ['ELITE', 'CONTENDER', 'CROSSROADS', 'REBUILDING'];
    const TIER_COLORS = {
        ELITE: '#D4AF37',
        CONTENDER: '#2ECC71',
        CROSSROADS: '#F0A500',
        REBUILDING: '#E74C3C',
    };

    function groupByTier(assessments) {
        const buckets = { ELITE: [], CONTENDER: [], CROSSROADS: [], REBUILDING: [] };
        (assessments || []).forEach(a => { if (buckets[a.tier]) buckets[a.tier].push(a); });
        TIER_ORDER.forEach(t => buckets[t].sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0)));
        return buckets;
    }

    function CompetitiveTiersWidget({ size, sleeperUserId, setActiveTab }) {
        const assessments = React.useMemo(() => {
            if (typeof window.assessAllTeamsFromGlobal === 'function') {
                try { return window.assessAllTeamsFromGlobal() || []; } catch { return []; }
            }
            return [];
        }, []);

        const tiers = React.useMemo(() => groupByTier(assessments), [assessments]);
        const mine = assessments.find(a => a.ownerId === sleeperUserId);

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

        // ── sm: My tier + total teams ────────────────────────────
        if (size === 'sm') {
            const col = mine ? TIER_COLORS[mine.tier] : 'var(--silver)';
            return React.createElement('div', { style: { ...base, cursor: 'pointer', textAlign: 'center', justifyContent: 'center' }, onClick: jumpToLeague },
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.65 } }, 'My Tier'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: col } }, mine?.tier || '—'),
                React.createElement('div', { style: { fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.55 } }, assessments.length + ' team' + (assessments.length === 1 ? '' : 's') + ' tracked')
            );
        }

        // ── md: tier count bar ───────────────────────────────────
        if (size === 'md') {
            const total = assessments.length || 1;
            return React.createElement('div', { style: base },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '0.9rem' } }, '🏆'),
                    React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em' } }, 'Competitive Tiers'),
                    React.createElement('div', { style: { marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.6 } }, 'you: ' + (mine?.tier || '—'))
                ),
                React.createElement('div', { style: { display: 'flex', height: '18px', borderRadius: '4px', overflow: 'hidden', gap: '1px' } },
                    ...TIER_ORDER.map(t => {
                        const count = tiers[t].length;
                        const pct = (count / total) * 100;
                        if (pct === 0) return null;
                        return React.createElement('div', {
                            key: t,
                            title: t + ': ' + count + ' team' + (count === 1 ? '' : 's'),
                            style: {
                                width: pct + '%',
                                background: TIER_COLORS[t],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.64rem', color: '#0A0A0A', fontWeight: 700,
                            }
                        }, count > 0 ? String(count) : '');
                    }).filter(Boolean)
                ),
                React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '0.62rem' } },
                    ...TIER_ORDER.map(t => React.createElement('span', {
                        key: t,
                        style: { display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--silver)' }
                    },
                        React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: TIER_COLORS[t] } }),
                        t.charAt(0) + t.slice(1).toLowerCase()
                    ))
                )
            );
        }

        // ── lg / tall / xxl: 4 stacked tier rows with team names ─
        const topN = size === 'tall' || size === 'xxl' ? 8 : 3;
        return React.createElement('div', { style: base },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                React.createElement('span', { style: { fontSize: '0.95rem' } }, '🏆'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em' } }, 'Competitive Tiers'),
                React.createElement('button', {
                    onClick: jumpToLeague,
                    title: 'Open League view',
                    style: { marginLeft: 'auto', padding: '3px 8px', fontSize: '0.62rem', background: 'rgba(212,175,55,0.08)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em' }
                }, 'DETAIL')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1, minHeight: 0 } },
                ...TIER_ORDER.map(t => {
                    const teams = tiers[t];
                    const col = TIER_COLORS[t];
                    return React.createElement('div', {
                        key: t,
                        style: {
                            padding: '8px 10px', borderRadius: '6px',
                            background: 'rgba(255,255,255,0.02)',
                            borderLeft: '3px solid ' + col,
                        }
                    },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' } },
                            React.createElement('span', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', fontWeight: 700, color: col, letterSpacing: '0.05em' } }, t),
                            React.createElement('span', { style: { fontSize: '0.6rem', color: 'var(--silver)', opacity: 0.55 } }, teams.length + ' team' + (teams.length === 1 ? '' : 's'))
                        ),
                        teams.length === 0
                            ? React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.45 } }, '—')
                            : React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '3px' } },
                                ...teams.slice(0, topN).map(team => React.createElement('span', {
                                    key: team.rosterId,
                                    style: {
                                        padding: '2px 6px', borderRadius: '3px',
                                        fontSize: '0.66rem',
                                        background: team.ownerId === sleeperUserId ? col + '33' : 'rgba(255,255,255,0.04)',
                                        color: team.ownerId === sleeperUserId ? col : 'var(--silver)',
                                        fontWeight: team.ownerId === sleeperUserId ? 700 : 500,
                                        border: team.ownerId === sleeperUserId ? '1px solid ' + col + '66' : '1px solid transparent'
                                    }
                                }, team.ownerName + (team.ownerId === sleeperUserId ? ' ★' : '') + ' · ' + (team.healthScore || 0))),
                                teams.length > topN ? React.createElement('span', { style: { fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.5, padding: '2px 4px' } }, '+' + (teams.length - topN)) : null
                            )
                    );
                })
            )
        );
    }

    window.CompetitiveTiersWidget = CompetitiveTiersWidget;
})();
