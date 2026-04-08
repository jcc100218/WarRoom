// ══════════════════════════════════════════════════════════════════
// js/tabs/trophy-room.js — Trophy Room: League History & Accolades
// Two views: League-wide (default) and Personal (tap any team).
// Data from analytics-engine.js buildOwnerHistory() + LI.championships.
// ══════════════════════════════════════════════════════════════════

function TrophyRoomTab({ currentLeague, playersData, myRoster, sleeperUserId }) {
    const { useState, useMemo } = React;
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [view, setView] = useState('league'); // 'league' | 'personal'

    const ownerHistory = useMemo(() => {
        if (typeof buildOwnerHistory !== 'function') return {};
        try { return buildOwnerHistory(); } catch (e) { return {}; }
    }, [currentLeague?.id]);

    const championships = useMemo(() => window.App?.LI?.championships || {}, [currentLeague?.id]);
    const owners = useMemo(() => Object.values(ownerHistory).sort((a, b) => b.championships - a.championships || b.playoffAppearances - a.playoffAppearances || b.wins - a.wins), [ownerHistory]);

    // ── Styles ──
    const cardStyle = { background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px', marginBottom: '12px' };
    const headerStyle = { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '10px' };
    const goldBadge = { fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: 'rgba(212,175,55,0.15)', color: 'var(--gold)' };

    // ── Trophy icon by finish ──
    function finishIcon(finish) {
        if (finish === 'Champion') return '\uD83C\uDFC6';
        if (finish === 'Runner-Up') return '\uD83E\uDD48';
        if (finish === 'Semi-Finals') return '\uD83E\uDD49';
        if (finish === 'Playoffs') return '\uD83C\uDFC8';
        return '\u2014';
    }

    // ══════════════════════════════════════════════════════════════
    // LEAGUE-WIDE VIEW
    // ══════════════════════════════════════════════════════════════
    function renderLeagueView() {
        const seasons = Object.keys(championships).sort();

        return React.createElement('div', null,
            // Championship Timeline
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'CHAMPIONSHIP TIMELINE'),
                seasons.length === 0
                    ? React.createElement('div', { style: { color: 'var(--silver)', fontSize: '0.8rem' } }, 'No championship data yet. Play a full season to see your league history.')
                    : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                        seasons.map(season => {
                            const c = championships[season];
                            const champOwner = ownerHistory[c.champion];
                            const runnerOwner = ownerHistory[c.runnerUp];
                            return React.createElement('div', { key: season, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'rgba(212,175,55,0.06)', borderRadius: '8px', cursor: 'pointer' }, onClick: () => { setSelectedOwner(c.champion); setView('personal'); } },
                                React.createElement('span', { style: { fontSize: '1.2rem' } }, '\uD83C\uDFC6'),
                                React.createElement('div', { style: { flex: 1 } },
                                    React.createElement('div', { style: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)' } }, season + ' Champion'),
                                    React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--white)' } }, champOwner?.ownerName || 'Unknown'),
                                ),
                                runnerOwner && React.createElement('div', { style: { textAlign: 'right' } },
                                    React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--silver)' } }, 'Runner-Up'),
                                    React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, runnerOwner.ownerName),
                                ),
                            );
                        })
                    ),
            ),

            // All-Time Leaders
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'ALL-TIME LEADERS'),
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
                    _leaderCard('Most Titles', owners, o => o.championships, o => o.champSeasons.join(', ')),
                    _leaderCard('Best Record', owners, o => o.wins, o => o.record),
                    _leaderCard('Playoff Wins', owners, o => o.playoffWins, o => o.playoffRecord),
                    _leaderCard('Draft Hit Rate', owners.filter(o => o.draftTotal >= 3), o => o.draftHitRate, o => o.draftHitRate + '%'),
                    _leaderCard('Trade Wins', owners, o => o.tradesWon, o => o.tradesWon + '/' + o.totalTrades),
                    _leaderCard('Portfolio DHQ', owners, o => o.totalDHQ, o => Math.round(o.totalDHQ / 1000) + 'k'),
                ),
            ),

            // All Teams
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'ALL TEAMS'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                    owners.map(o => {
                        const isMe = o.rosterId === myRoster?.roster_id;
                        const avatarUrl = o.avatar ? 'https://sleepercdn.com/avatars/thumbs/' + o.avatar : null;
                        return React.createElement('div', { key: o.rosterId, onClick: () => { setSelectedOwner(o.rosterId); setView('personal'); }, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', background: isMe ? 'rgba(212,175,55,0.08)' : 'transparent', border: isMe ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent', transition: 'background 0.1s' } },
                            avatarUrl
                                ? React.createElement('img', { src: avatarUrl, style: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }, onError: e => e.target.style.display = 'none' })
                                : React.createElement('div', { style: { width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--silver)' } }, (o.ownerName || '?')[0]),
                            React.createElement('div', { style: { flex: 1 } },
                                React.createElement('div', { style: { fontSize: '0.82rem', fontWeight: 600, color: isMe ? 'var(--gold)' : 'var(--white)' } }, o.ownerName, isMe && React.createElement('span', { style: { fontSize: '0.65rem', color: 'var(--gold)', marginLeft: '6px' } }, 'YOU')),
                                React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, o.record, ' \u00B7 ', o.tenure, ' season', o.tenure !== 1 ? 's' : ''),
                            ),
                            o.championships > 0 && React.createElement('div', { style: { display: 'flex', gap: '2px' } }, Array.from({ length: o.championships }, (_, i) => React.createElement('span', { key: i, style: { fontSize: '0.9rem' } }, '\uD83C\uDFC6'))),
                            React.createElement('svg', { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'var(--silver)', strokeWidth: 2 }, React.createElement('polyline', { points: '9 18 15 12 9 6' })),
                        );
                    })
                ),
            ),
        );
    }

    function _leaderCard(title, list, valueFn, displayFn) {
        const sorted = [...list].sort((a, b) => valueFn(b) - valueFn(a));
        const leader = sorted[0];
        if (!leader || valueFn(leader) <= 0) return React.createElement('div', { key: title, style: { padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' } },
            React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.04em' } }, title),
            React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginTop: '4px' } }, '\u2014'),
        );
        return React.createElement('div', { key: title, style: { padding: '8px', background: 'rgba(212,175,55,0.06)', borderRadius: '8px', cursor: 'pointer' }, onClick: () => { setSelectedOwner(leader.rosterId); setView('personal'); } },
            React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.04em' } }, title),
            React.createElement('div', { style: { fontSize: '1rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'JetBrains Mono, monospace' } }, displayFn(leader)),
            React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginTop: '2px' } }, leader.ownerName),
        );
    }

    // ══════════════════════════════════════════════════════════════
    // PERSONAL VIEW
    // ══════════════════════════════════════════════════════════════
    function renderPersonalView() {
        const o = ownerHistory[selectedOwner];
        if (!o) return React.createElement('div', { style: { color: 'var(--silver)', padding: '20px', textAlign: 'center' } }, 'Team not found');

        const avatarUrl = o.avatar ? 'https://sleepercdn.com/avatars/thumbs/' + o.avatar : null;

        return React.createElement('div', null,
            // Back button
            React.createElement('button', { onClick: () => setView('league'), style: { background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.78rem', cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit', fontWeight: 600 } }, '\u2190 All Teams'),

            // Owner header
            React.createElement('div', { style: { ...cardStyle, display: 'flex', alignItems: 'center', gap: '12px' } },
                avatarUrl && React.createElement('img', { src: avatarUrl, style: { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }, onError: e => e.target.style.display = 'none' }),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' } }, o.ownerName),
                    React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)' } }, o.record, ' \u00B7 ', o.tenure, ' seasons \u00B7 ', o.pointsFor.toLocaleString(), ' PF'),
                ),
                o.championships > 0 && React.createElement('div', { style: { textAlign: 'center' } },
                    React.createElement('div', { style: { display: 'flex', gap: '2px' } }, Array.from({ length: o.championships }, (_, i) => React.createElement('span', { key: i, style: { fontSize: '1.3rem' } }, '\uD83C\uDFC6'))),
                    React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--gold)', marginTop: '2px' } }, o.championships + 'x Champ'),
                ),
            ),

            // Stats grid
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' } },
                _statBox('Playoffs', o.playoffAppearances, o.playoffRecord),
                _statBox('Draft Hit%', o.draftHitRate + '%', o.draftHits + '/' + o.draftTotal),
                _statBox('Trades', o.totalTrades, 'Won ' + o.tradesWon),
                _statBox('Runner-Up', o.runnerUps, o.runnerUpSeasons.join(', ')),
                _statBox('#1 Picks', o.numberOnePicks.length, o.numberOnePicks.map(p => p.season).join(', ')),
                _statBox('Portfolio', Math.round(o.totalDHQ / 1000) + 'k', 'DHQ Value'),
            ),

            // Season Timeline
            o.seasonHistory.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'SEASON TIMELINE'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                    o.seasonHistory.map(s => React.createElement('div', { key: s.season, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: s.finish === 'Champion' ? 'rgba(212,175,55,0.1)' : 'transparent' } },
                        React.createElement('span', { style: { fontSize: '0.85rem', minWidth: '20px' } }, finishIcon(s.finish)),
                        React.createElement('span', { style: { fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)', minWidth: '40px' } }, s.season),
                        React.createElement('span', { style: { fontSize: '0.75rem', color: s.finish === 'Champion' ? 'var(--gold)' : 'var(--silver)', flex: 1 } }, s.finish),
                        s.hadFirstPick && React.createElement('span', { style: goldBadge }, '1.01'),
                    )),
                ),
            ),

            // Best Draft Pick
            o.bestPick && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'BEST DRAFT PICK'),
                React.createElement('div', { style: { fontSize: '0.85rem', color: 'var(--white)' } }, o.bestPick.name, ' (', o.bestPick.pos, ', R', o.bestPick.round, ' \u2014 ', o.bestPick.season, ')'),
            ),

            // Rivalries
            o.rivalries.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'RIVALRIES'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                    o.rivalries.map((r, i) => {
                        const opp = ownerHistory[r.opponent];
                        return React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' } },
                            React.createElement('span', { style: { color: 'var(--white)', fontWeight: 600, flex: 1 } }, opp?.ownerName || 'Team'),
                            React.createElement('span', { style: { color: r.wins > r.losses ? '#2ECC71' : r.wins < r.losses ? '#E74C3C' : 'var(--silver)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' } }, r.wins, '-', r.losses),
                        );
                    }),
                ),
            ),
        );
    }

    function _statBox(label, value, sub) {
        return React.createElement('div', { style: { padding: '10px', background: 'rgba(212,175,55,0.06)', borderRadius: '8px', textAlign: 'center' } },
            React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'JetBrains Mono, monospace' } }, value || '\u2014'),
            React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--gold)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' } }, label),
            sub && React.createElement('div', { style: { fontSize: '0.6rem', color: 'var(--silver)', marginTop: '2px' } }, sub),
        );
    }

    // ══════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════════════════════════════
    return React.createElement('div', { style: { padding: '0' } },
        // View toggle
        React.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px' } },
            React.createElement('button', { onClick: () => setView('league'), style: { padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '6px', border: '1px solid ' + (view === 'league' ? 'var(--gold)' : 'rgba(255,255,255,0.1)'), background: view === 'league' ? 'var(--gold)' : 'transparent', color: view === 'league' ? 'var(--black)' : 'var(--silver)', cursor: 'pointer', fontFamily: 'inherit' } }, 'League History'),
            React.createElement('button', { onClick: () => { setView('personal'); if (!selectedOwner) setSelectedOwner(myRoster?.roster_id); }, style: { padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '6px', border: '1px solid ' + (view === 'personal' ? 'var(--gold)' : 'rgba(255,255,255,0.1)'), background: view === 'personal' ? 'var(--gold)' : 'transparent', color: view === 'personal' ? 'var(--black)' : 'var(--silver)', cursor: 'pointer', fontFamily: 'inherit' } }, 'My Trophy Case'),
        ),

        view === 'league' ? renderLeagueView() : renderPersonalView(),
    );
}
