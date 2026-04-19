// ══════════════════════════════════════════════════════════════════
// js/widgets/player-tags.js — Tag-driven Home widgets (SI-3)
//
// Surfaces players the user has tagged in My Roster into the Dashboard.
// Current tag taxonomy (from my-team.js): trade / cut / untouchable / watch.
//   - TradeBlockWidget     → players tagged 'trade'
//   - CutCandidatesWidget  → players tagged 'cut'
//   - WaiverTargetsWidget  → players tagged 'watch' (reused as "on my radar")
//
// All three share a common renderer. Each exposes the standard widget
// contract (sm/md/lg/tall sizes, click-to-tab) per dashboard.js registry.
//
// Depends on:  window._playerTags (populated from league_memory in league-detail.js),
//              window.App.LI.playerScores (DHQ),
//              window.WR.openPlayerCard (SI-2)
//
// Exposes:     window.TradeBlockWidget, window.CutCandidatesWidget,
//              window.WaiverTargetsWidget
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    function playerName(p) {
        if (!p) return '—';
        return p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || '—';
    }

    // Pull tagged pids from window._playerTags (map of pid → tag)
    function pidsByTag(tag) {
        const tags = window._playerTags || {};
        return Object.keys(tags).filter(pid => tags[pid] === tag);
    }

    // Enrich pids with display data, sort by DHQ desc
    function enrich(pids, playersData) {
        const scores = (window.App && window.App.LI && window.App.LI.playerScores) || {};
        return pids
            .map(pid => {
                const p = (playersData || {})[pid];
                return {
                    pid,
                    name: playerName(p),
                    pos: p?.position || '?',
                    team: p?.team || 'FA',
                    age: p?.age || null,
                    dhq: scores[pid] || 0,
                };
            })
            .sort((a, b) => b.dhq - a.dhq);
    }

    // Shared row renderer — click opens unified player card
    function PlayerRow({ r, tone, onClick }) {
        const posColors = (window.App && window.App.POS_COLORS) || {};
        const posCol = posColors[r.pos] || '#7d8291';
        return React.createElement('div', {
            onClick,
            title: 'Open player card',
            style: {
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', borderRadius: '6px',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
            }
        },
            React.createElement('span', {
                style: {
                    fontSize: '0.62rem', fontWeight: 700, color: posCol,
                    minWidth: '24px', textAlign: 'center',
                    padding: '2px 4px', borderRadius: '3px',
                    background: 'rgba(212,175,55,0.06)'
                }
            }, r.pos),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontSize: '0.82rem', color: '#f0f0f3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.name),
                React.createElement('div', { style: { fontSize: '0.66rem', color: '#7d8291' } },
                    [r.team, r.age ? 'Age ' + r.age : null].filter(Boolean).join(' · '))
            ),
            React.createElement('div', { style: { fontSize: '0.76rem', fontFamily: 'JetBrains Mono, monospace', color: tone } },
                r.dhq ? r.dhq.toLocaleString() : '—')
        );
    }

    // ── Generic tag widget ────────────────────────────────────────
    function TagWidget({ size, title, icon, tag, emptyText, tone, clickTarget, playersData, setActiveTab }) {
        const pids = React.useMemo(() => pidsByTag(tag), [window._playerTags, tag]);
        const rows = React.useMemo(() => enrich(pids, playersData), [pids, playersData]);

        const base = {
            background: 'var(--off-black)',
            border: '1px solid rgba(212,175,55,0.12)',
            borderRadius: '10px', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            height: '100%', minHeight: 0,
        };

        function openRoster() { if (setActiveTab) setActiveTab(clickTarget || 'myteam'); }
        function openCard(pid) {
            if (window.WR && typeof window.WR.openPlayerCard === 'function') window.WR.openPlayerCard(pid);
            else if (typeof window.openPlayerModal === 'function') window.openPlayerModal(pid);
        }

        const header = React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { fontSize: '0.95rem' } }, icon),
            React.createElement('div', { style: { flex: 1 } },
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em' } }, title),
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.65 } }, rows.length + ' player' + (rows.length === 1 ? '' : 's'))
            ),
            React.createElement('button', {
                onClick: openRoster,
                title: 'Tag players in My Roster',
                style: {
                    padding: '3px 8px', fontSize: '0.62rem',
                    background: 'rgba(212,175,55,0.08)', color: 'var(--gold)',
                    border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px',
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em'
                }
            }, 'TAG')
        );

        // sm: just count + label; clicks to roster
        if (size === 'sm') {
            return React.createElement('div', { style: { ...base, cursor: 'pointer' }, onClick: openRoster },
                React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.7, letterSpacing: '0.06em', textTransform: 'uppercase' } },
                    React.createElement('span', { style: { marginRight: '4px' } }, icon), title),
                React.createElement('div', { style: { fontSize: '1.5rem', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, color: tone } }, rows.length)
            );
        }

        // md / lg / tall: header + scrollable list
        const maxRows = size === 'md' ? 3 : size === 'tall' ? 10 : size === 'xxl' ? 15 : 5;
        const shown = rows.slice(0, maxRows);

        return React.createElement('div', { style: base },
            header,
            shown.length === 0
                ? React.createElement('div', {
                    style: {
                        fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.55,
                        padding: '10px 4px', textAlign: 'center'
                    }
                }, emptyText || 'No players tagged yet.')
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1, minHeight: 0 } },
                    shown.map(r => React.createElement(PlayerRow, { key: r.pid, r, tone, onClick: () => openCard(r.pid) })),
                    rows.length > shown.length
                        ? React.createElement('div', {
                            onClick: openRoster,
                            style: {
                                fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6,
                                textAlign: 'center', padding: '4px', cursor: 'pointer'
                            }
                        }, '+ ' + (rows.length - shown.length) + ' more')
                        : null
                )
        );
    }

    // ── Three concrete widgets ────────────────────────────────────
    function TradeBlockWidget(props) {
        return React.createElement(TagWidget, {
            ...props,
            title: 'Trade Block',
            icon: '🏷️',
            tag: 'trade',
            tone: '#F0A500',
            emptyText: 'Tag players on your roster to shop them here.',
            clickTarget: 'myteam',
        });
    }

    function CutCandidatesWidget(props) {
        return React.createElement(TagWidget, {
            ...props,
            title: 'Cut Candidates',
            icon: '✂️',
            tag: 'cut',
            tone: '#E74C3C',
            emptyText: 'Flag dead weight on your roster to review here.',
            clickTarget: 'myteam',
        });
    }

    function WaiverTargetsWidget(props) {
        return React.createElement(TagWidget, {
            ...props,
            title: 'Waiver Targets',
            icon: '🎯',
            tag: 'watch',
            tone: '#3498DB',
            emptyText: 'Tag "Watch" on any player to track them here.',
            clickTarget: 'waiver',
        });
    }

    window.TradeBlockWidget = TradeBlockWidget;
    window.CutCandidatesWidget = CutCandidatesWidget;
    window.WaiverTargetsWidget = WaiverTargetsWidget;
})();
