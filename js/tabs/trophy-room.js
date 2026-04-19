// ══════════════════════════════════════════════════════════════════
// js/tabs/trophy-room.js — Trophy Room: League History & Accolades
// Two views: League-wide (default) and Personal (tap any team).
// Data from analytics-engine.js buildOwnerHistory() + LI.championships.
// ══════════════════════════════════════════════════════════════════

function TrophyRoomTab({ currentLeague, playersData, myRoster, sleeperUserId }) {
    const { useState, useMemo, useEffect } = React;
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [view, setView] = useState('league'); // 'league' | 'personal' | 'chronicles' | 'import'
    const [importText, setImportText] = useState('');
    const [importStatus, setImportStatus] = useState(''); // '' | 'parsing' | 'done' | 'error'
    const [recapStatus, setRecapStatus] = useState(''); // '' | 'generating' | 'done'
    const [recapText, setRecapText] = useState('');

    // ── Export as image ──
    async function exportAsImage(elementId, filename) {
        const el = document.getElementById(elementId);
        if (!el || typeof window.html2canvas !== 'function') {
            // Fallback: copy text
            const text = el?.innerText || '';
            navigator.clipboard?.writeText(text);
            return;
        }
        try {
            const canvas = await window.html2canvas(el, { backgroundColor: '#0a0a0a', scale: 2, useCORS: true });
            canvas.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (filename || 'trophy-card') + '.png';
                a.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
        } catch (e) { console.warn('[TrophyRoom] Export error:', e); }
    }

    // Load chronicles from localStorage
    const CHRONICLES_KEY = 'wr_chronicles_' + (currentLeague?.id || '');
    const [chronicles, setChronicles] = useState(() => {
        try { return JSON.parse(localStorage.getItem(CHRONICLES_KEY) || 'null'); } catch { return null; }
    });

    // Phase 9: Hall of Fame entries — per-league, stored in WrStorage. Schema:
    // { id, scope: 'team'|'league', teamRosterId?, name, category, year, note }
    const HOF_KEY = 'wr_hof_' + (currentLeague?.id || '');
    const [hof, setHof] = useState(() => {
        try { return JSON.parse(localStorage.getItem(HOF_KEY) || '[]'); } catch { return []; }
    });
    const [hofDraft, setHofDraft] = useState({ scope: 'team', name: '', category: '', year: new Date().getFullYear(), note: '' });
    function saveHof(next) {
        setHof(next);
        try { localStorage.setItem(HOF_KEY, JSON.stringify(next)); } catch {}
    }
    function addHof(scope) {
        if (!hofDraft.name.trim()) return;
        const entry = {
            id: 'hof_' + Date.now(),
            scope, // 'team' or 'league'
            teamRosterId: scope === 'team' ? (selectedOwner || myRoster?.roster_id) : null,
            name: hofDraft.name.trim(),
            category: hofDraft.category.trim() || (scope === 'team' ? 'Franchise Legend' : 'All-Time'),
            year: Number(hofDraft.year) || new Date().getFullYear(),
            note: hofDraft.note.trim(),
            createdAt: Date.now(),
        };
        saveHof([...hof, entry]);
        setHofDraft({ scope, name: '', category: '', year: new Date().getFullYear(), note: '' });
    }
    function removeHof(id) { saveHof(hof.filter(h => h.id !== id)); }

    // Phase 9: Pull all-time earnings out of chronicles.standings (prizeMoney) — keyed by owner name.
    const earningsByOwner = useMemo(() => {
        const map = {};
        (chronicles?.standings || []).forEach(s => {
            const key = (s.owner || s.team || '').toLowerCase();
            if (!key) return;
            // Accept '$1,234' or numeric
            const raw = typeof s.prizeMoney === 'string' ? s.prizeMoney.replace(/[^\d.-]/g, '') : s.prizeMoney;
            const amount = Number(raw) || 0;
            if (amount > 0) map[key] = (map[key] || 0) + amount;
        });
        return map;
    }, [chronicles]);
    function earningsFor(ownerName) {
        const k = (ownerName || '').toLowerCase();
        return earningsByOwner[k] || 0;
    }

    // Phase 9 deferred: chronicles → CSV-first precedence helpers.
    // When a league imports Chronicles, those records overwrite scraped
    // buildOwnerHistory values where available (all-time record, custom awards,
    // championship counts from standings). Matching is done by case-insensitive
    // owner name or team name.
    function chroniclesRowFor(ownerName, teamName) {
        const list = chronicles?.standings || [];
        const q = (ownerName || '').toLowerCase();
        const t = (teamName || '').toLowerCase();
        return list.find(s =>
            (s.owner || '').toLowerCase() === q ||
            (s.team || '').toLowerCase() === q ||
            (t && (s.team || '').toLowerCase() === t)
        ) || null;
    }
    function chroniclesAwardsFor(ownerName, teamName) {
        const list = chronicles?.customAwards || [];
        const q = (ownerName || '').toLowerCase();
        const t = (teamName || '').toLowerCase();
        const won = [];
        list.forEach(a => {
            (a.winners || []).forEach(w => {
                const winner = (w.winner || '').toLowerCase();
                if (winner === q || (t && winner === t)) {
                    won.push({ name: a.name, year: w.year, stats: w.stats });
                }
            });
        });
        return won.sort((a, b) => (b.year || 0) - (a.year || 0));
    }

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
            React.createElement('div', { id: 'trophy-champ-card', style: cardStyle },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                    React.createElement('div', { style: { ...headerStyle, flex: 1, marginBottom: 0 } }, 'CHAMPIONSHIP TIMELINE'),
                    React.createElement('button', { onClick: () => exportAsImage('trophy-champ-card', (currentLeague?.name || 'league') + '-championships'), style: { background: 'none', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' } }, '\uD83D\uDCF7 Image'),
                    React.createElement('button', { onClick: () => {
                        const text = seasons.map(s => {
                            const c = championships[s];
                            const champ = ownerHistory[c.champion]?.ownerName || '?';
                            const runner = ownerHistory[c.runnerUp]?.ownerName || '';
                            return s + ': ' + champ + (runner ? ' def. ' + runner : '');
                        }).join('\n');
                        navigator.clipboard?.writeText(currentLeague?.name + ' Championships\n' + text).then(() => {
                            const btn = document.getElementById('share-champ-btn');
                            if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); }
                        });
                    }, id: 'share-champ-btn', style: { background: 'none', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: 'var(--gold)', fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' } }, 'Copy'),
                ),
                React.createElement('div', { style: { marginTop: '10px' } }),
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

            // Phase 9: Winner's Perch removed. League-wide HOF builder takes its place here.
            renderHofSection('league'),
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
        // Phase 9 deferred: if Chronicles (imported CSV) has an all-time row for this owner,
        // it overrides the scraped record — the user's historical data is canonical.
        const chronRow = chroniclesRowFor(o.ownerName, o.teamName);
        const wonAwards = chroniclesAwardsFor(o.ownerName, o.teamName);
        const displayRecord = chronRow
            ? (chronRow.wins + '-' + chronRow.losses + (chronRow.winPct ? ' (' + chronRow.winPct + ')' : ''))
            : o.record;
        const chronChamps = chronRow?.championships || 0;
        const displayChamps = Math.max(o.championships, chronChamps);

        return React.createElement('div', null,
            // Back button
            React.createElement('button', { onClick: () => setView('league'), style: { background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.78rem', cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit', fontWeight: 600 } }, '\u2190 All Teams'),

            // Owner header
            React.createElement('div', { style: { ...cardStyle, display: 'flex', alignItems: 'center', gap: '12px' } },
                avatarUrl && React.createElement('img', { src: avatarUrl, style: { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }, onError: e => e.target.style.display = 'none' }),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' } }, o.ownerName),
                    React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)' } }, displayRecord, ' \u00B7 ', o.tenure, ' seasons \u00B7 ', o.pointsFor.toLocaleString(), ' PF'),
                    chronRow && React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--gold)', opacity: 0.7, marginTop: '2px' } }, 'All-time record imported from Chronicles'),
                ),
                displayChamps > 0 && React.createElement('div', { style: { textAlign: 'center' } },
                    React.createElement('div', { style: { display: 'flex', gap: '2px' } }, Array.from({ length: displayChamps }, (_, i) => React.createElement('span', { key: i, style: { fontSize: '1.3rem' } }, '\uD83C\uDFC6'))),
                    React.createElement('div', { style: { fontSize: '0.65rem', color: 'var(--gold)', marginTop: '2px' } }, displayChamps + 'x Champ'),
                ),
            ),

            // Phase 9 deferred: all-time RS record card (chronicles)
            chronRow && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'ALL-TIME REGULAR SEASON'),
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
                    _statBox('Wins', chronRow.wins || 0, chronRow.winPct || ''),
                    _statBox('Losses', chronRow.losses || 0, ''),
                    _statBox('Playoffs', chronRow.playoffsMade || 0, (chronRow.playoffWins || 0) + '-' + (chronRow.playoffLosses || 0)),
                    _statBox('Titles', chronRow.championships || 0, (chronRow.runnerUps || 0) + ' RU'),
                ),
                chronRow.fromYear && React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.7, marginTop: '6px' } },
                    'Seasons: ', chronRow.fromYear, chronRow.toYear ? ' – ' + chronRow.toYear : '', chronRow.isDefunct ? ' · defunct' : ''
                ),
            ),

            // Phase 9 deferred: custom awards won — pulled from chronicles.customAwards
            wonAwards.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'CUSTOM AWARDS'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                    wonAwards.map((a, i) => React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'rgba(212,175,55,0.06)', borderRadius: '6px' } },
                        React.createElement('span', { style: { fontSize: '0.95rem' } }, '\uD83C\uDFC5'),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', { style: { fontSize: '0.8rem', fontWeight: 700, color: 'var(--white)' } }, a.name),
                            React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)' } }, a.year || '', a.stats ? ' · ' + a.stats : ''),
                        ),
                    ))
                )
            ),

            // Stats grid — Phase 9: added all-time earnings tile
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' } },
                _statBox('Playoffs', o.playoffAppearances, o.playoffRecord),
                _statBox('Draft Hit%', o.draftHitRate + '%', o.draftHits + '/' + o.draftTotal),
                _statBox('Trades', o.totalTrades, 'Won ' + o.tradesWon),
                _statBox('Runner-Up', o.runnerUps, o.runnerUpSeasons.join(', ')),
                _statBox('#1 Picks', o.numberOnePicks.length, o.numberOnePicks.map(p => p.season).join(', ')),
                _statBox('Portfolio', Math.round(o.totalDHQ / 1000) + 'k', 'DHQ Value'),
                (() => {
                    const earn = earningsFor(o.ownerName);
                    return _statBox('Earnings', earn > 0 ? '$' + earn.toLocaleString() : '\u2014', earn > 0 ? 'All-time' : 'Import via Chronicles');
                })(),
            ),

            // 3-column: Season Timeline | Best Pick | Rivalries
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' } },
                // Season Timeline (filter out current unfinished year)
                o.seasonHistory.length > 0 && React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: headerStyle }, 'SEASONS'),
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
                        o.seasonHistory.filter(s => {
                            const curYear = String(currentLeague?.season || new Date().getFullYear());
                            return s.season !== curYear || s.finish === 'Champion' || s.finish === 'Runner-Up';
                        }).map(s => React.createElement('div', { key: s.season, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', background: s.finish === 'Champion' ? 'rgba(212,175,55,0.1)' : 'transparent' } },
                            React.createElement('span', { style: { fontSize: '0.75rem', minWidth: '16px' } }, finishIcon(s.finish)),
                            React.createElement('span', { style: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--white)', minWidth: '32px' } }, s.season),
                            React.createElement('span', { style: { fontSize: '0.68rem', color: s.finish === 'Champion' ? 'var(--gold)' : 'var(--silver)', flex: 1 } }, s.finish),
                        )),
                    ),
                ),

                // Best Draft Pick — highest current DHQ from any drafted player
                (() => {
                    const draftOutcomes = window.App?.LI?.draftOutcomes || [];
                    const myDrafted = draftOutcomes.filter(d => d.roster_id === o.rosterId);
                    const withDHQ = myDrafted.map(d => ({ ...d, dhq: window.App?.LI?.playerScores?.[d.player_id] || 0 })).filter(d => d.dhq > 0);
                    const best = withDHQ.sort((a, b) => b.dhq - a.dhq)[0];
                    if (!best) return null;
                    return React.createElement('div', { style: cardStyle },
                        React.createElement('div', { style: headerStyle }, 'BEST DRAFT PICK'),
                        React.createElement('div', { style: { fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' } }, best.name),
                        React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginTop: '2px' } }, best.pos, ' \u00B7 R', best.round, ' \u00B7 ', best.season),
                        React.createElement('div', { style: { fontSize: '1rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' } }, best.dhq.toLocaleString(), ' DHQ'),
                    );
                })(),

                // Rivalries — fix: use r.rosterId not r.opponent
                o.rivalries.length > 0 && React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: headerStyle }, 'RIVALRIES'),
                    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                        o.rivalries.map((r, i) => {
                            const oppRid = r.rosterId || r.opponent;
                            const opp = ownerHistory[oppRid];
                            return React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' } },
                                React.createElement('span', { style: { color: 'var(--white)', fontWeight: 600, flex: 1 } }, opp?.ownerName || ('Team ' + oppRid)),
                                React.createElement('span', { style: { color: r.wins > r.losses ? '#2ECC71' : r.wins < r.losses ? '#E74C3C' : 'var(--silver)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' } }, r.wins, '-', r.losses),
                            );
                        }),
                    ),
                ),
            ),

            // Phase 9: Team Hall of Fame builder — per-team entries saved locally
            renderHofSection('team', o.rosterId, o.ownerName),
        );
    }

    // Phase 9: HOF builder — list existing entries, show a small add form, scope-filtered.
    function renderHofSection(scope, rosterIdFilter, ownerName) {
        const entries = hof.filter(h => h.scope === scope && (scope === 'league' || h.teamRosterId === rosterIdFilter));
        const scopeLabel = scope === 'team' ? (ownerName ? ownerName.toUpperCase() + ' HALL OF FAME' : 'TEAM HALL OF FAME') : 'LEAGUE HALL OF FAME';
        return React.createElement('div', { style: cardStyle },
            React.createElement('div', { style: { ...headerStyle, display: 'flex', alignItems: 'center', gap: '6px' } },
                React.createElement('span', { style: { flex: 1 } }, scopeLabel),
                React.createElement('span', { style: { fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'none', letterSpacing: 0 } }, entries.length + ' inductee' + (entries.length === 1 ? '' : 's'))
            ),
            entries.length === 0
                ? React.createElement('div', { style: { fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'No inductees yet. Add a legendary player, manager move, or season below.')
                : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' } },
                    entries.map(h => React.createElement('div', { key: h.id, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(212,175,55,0.05)', borderLeft: '3px solid var(--gold)', borderRadius: '0 6px 6px 0' } },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '\uD83C\uDFF5\uFE0F'),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', { style: { fontSize: '0.84rem', fontWeight: 700, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, h.name),
                            React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', marginTop: '2px' } }, h.category + ' · ' + h.year + (h.note ? ' · ' + h.note : ''))
                        ),
                        React.createElement('button', { onClick: () => removeHof(h.id), style: { background: 'none', border: '1px solid rgba(231,76,60,0.3)', color: '#E74C3C', borderRadius: '4px', padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' } }, 'Remove')
                    ))
                ),
            // Add form (scope-aware)
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.6fr auto', gap: '6px' } },
                React.createElement('input', { value: hofDraft.scope === scope ? hofDraft.name : '', onChange: e => setHofDraft({ ...hofDraft, scope, name: e.target.value }), placeholder: scope === 'team' ? 'Player or moment name' : 'Player, team, or moment', style: { padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--white)', fontSize: '0.76rem', fontFamily: 'inherit' } }),
                React.createElement('input', { value: hofDraft.scope === scope ? hofDraft.category : '', onChange: e => setHofDraft({ ...hofDraft, scope, category: e.target.value }), placeholder: 'Category (e.g., QB, Draft Steal)', style: { padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--white)', fontSize: '0.76rem', fontFamily: 'inherit' } }),
                React.createElement('input', { type: 'number', value: hofDraft.scope === scope ? hofDraft.year : '', onChange: e => setHofDraft({ ...hofDraft, scope, year: e.target.value }), placeholder: 'Year', style: { padding: '6px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--white)', fontSize: '0.76rem', fontFamily: 'inherit' } }),
                React.createElement('button', { onClick: () => addHof(scope), disabled: hofDraft.scope !== scope || !hofDraft.name.trim(), style: { padding: '6px 12px', background: (hofDraft.scope === scope && hofDraft.name.trim()) ? 'var(--gold)' : 'rgba(212,175,55,0.2)', color: (hofDraft.scope === scope && hofDraft.name.trim()) ? 'var(--black)' : 'var(--silver)', border: 'none', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: (hofDraft.scope === scope && hofDraft.name.trim()) ? 'pointer' : 'not-allowed', fontFamily: 'inherit' } }, 'Induct')
            )
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
    // CHRONICLES IMPORT (paste or file upload)
    // ══════════════════════════════════════════════════════════════
    async function handleFileUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportStatus('reading');
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            if (['csv', 'tsv', 'txt'].includes(ext)) {
                const text = await file.text();
                setImportText(text);
            } else if (['xlsx', 'xls'].includes(ext)) {
                // For Excel: read as text via basic CSV extraction
                const text = await file.text().catch(() => '');
                if (text) { setImportText(text); }
                else { setImportText('[Excel file: ' + file.name + ' — paste the data as text instead]'); }
            } else if (['pdf'].includes(ext)) {
                // PDFs can't be read client-side easily — ask user to paste
                setImportText('[PDF uploaded: ' + file.name + ']\nPDF text extraction is limited in-browser. For best results, copy the data from your PDF and paste it in the text box above.');
            } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                // Images: convert to base64 for AI vision analysis
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = reader.result;
                    setImportText('[Image: ' + file.name + ']\nImage uploaded. Alex will analyze the content.\n\n' + base64.substring(0, 200) + '...');
                };
                reader.readAsDataURL(file);
            } else {
                const text = await file.text();
                setImportText(text);
            }
            setImportStatus('');
        } catch (err) {
            console.warn('[Chronicles] File read error:', err);
            setImportStatus('error');
        }
    }

    async function parseChronicles() {
        if (!importText.trim()) return;
        setImportStatus('parsing');
        try {
            const prompt = `Parse this fantasy football league historical data into structured JSON. The data may include all-time standings, championship history, custom awards, all-time teams, and defunct/former teams.

Return ONLY valid JSON with this structure (include only sections that exist in the data):
{
  "leagueName": "string",
  "standings": [{"team":"string","owner":"string","fromYear":2020,"toYear":null,"isDefunct":false,"wins":0,"losses":0,"winPct":"0%","playoffsMade":0,"playoffWins":0,"playoffLosses":0,"championships":0,"runnerUps":0,"prizeMoney":"$0","awards":{}}],
  "championshipHistory": [{"year":2024,"winner":"string","winnerScore":0,"loser":"string","loserScore":0,"hsp":{"offense":{"name":"","points":0},"defense":{"name":"","points":0}}}],
  "customAwards": [{"name":"string","winners":[{"year":2024,"winner":"string","stats":"string"}]}],
  "allTimeTeam": [{"pos":"QB","name":"string","team":"string","points":0,"year":2024}]
}

Here is the data:
${importText.substring(0, 8000)}`;

            const reply = typeof window.callClaude === 'function'
                ? await window.callClaude([{ role: 'user', content: prompt }])
                : await window.OD.callAI({ type: 'general', context: prompt });
            const text = typeof reply === 'string' ? reply : reply?.text || reply?.response || '';
            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Could not parse response as JSON');
            const parsed = JSON.parse(jsonMatch[0]);
            setChronicles(parsed);
            localStorage.setItem(CHRONICLES_KEY, JSON.stringify(parsed));
            // Invalidate the PlayerCard's cached chronicles-awards index so a
            // freshly-imported chronicles file surfaces in player cards immediately.
            if (typeof window._wrChroniclesInvalidate === 'function') window._wrChroniclesInvalidate();
            setImportStatus('done');
            setTimeout(() => setView('chronicles'), 500);
        } catch (e) {
            console.warn('[Chronicles] Parse error:', e);
            setImportStatus('error');
        }
    }

    function renderImportView() {
        return React.createElement('div', null,
            React.createElement('button', { onClick: () => setView('league'), style: { background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.78rem', cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit', fontWeight: 600 } }, '\u2190 Back'),
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'IMPORT LEAGUE CHRONICLES'),
                React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.6, marginBottom: '12px' } },
                    'Upload a file or paste your league\'s historical data. Alex will parse the structure and map it into your Trophy Room.'),
                // File upload
                React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
                    React.createElement('label', { style: { flex: 1, padding: '10px', background: 'rgba(212,175,55,0.08)', border: '1px dashed rgba(212,175,55,0.3)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 600 } },
                        '\uD83D\uDCC1 Upload CSV, Excel, PDF, or Image',
                        React.createElement('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.gif,.webp', onChange: handleFileUpload, style: { display: 'none' } }),
                    ),
                ),
                importStatus === 'reading' && React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--gold)', marginBottom: '8px' } }, 'Reading file...'),
                React.createElement('textarea', {
                    value: importText, onChange: e => setImportText(e.target.value),
                    placeholder: 'Paste your spreadsheet data here...\n\nExample:\nTEAM  FROM  TO  W  L  CHMP  2ND\nSkjjcruz  2021  47  22  2  1\n...',
                    style: { width: '100%', minHeight: '200px', padding: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--white)', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace', resize: 'vertical', boxSizing: 'border-box' }
                }),
                React.createElement('button', {
                    onClick: parseChronicles, disabled: importStatus === 'parsing' || !importText.trim(),
                    style: { width: '100%', marginTop: '10px', padding: '10px', background: importStatus === 'parsing' ? 'var(--silver)' : 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: importStatus === 'parsing' ? 'wait' : 'pointer', fontFamily: 'inherit' }
                }, importStatus === 'parsing' ? 'Alex is parsing...' : importStatus === 'done' ? 'Imported!' : importStatus === 'error' ? 'Error \u2014 Try Again' : 'Import with Alex'),
            ),
        );
    }

    // ══════════════════════════════════════════════════════════════
    // CHRONICLES VIEW (imported data)
    // ══════════════════════════════════════════════════════════════
    function renderChroniclesView() {
        if (!chronicles) return React.createElement('div', { style: { color: 'var(--silver)', padding: '20px', textAlign: 'center', fontSize: '0.82rem' } },
            'No chronicles imported yet. Use the Import button to add your league\'s history.');

        return React.createElement('div', null,
            React.createElement('button', { onClick: () => setView('league'), style: { background: 'none', border: 'none', color: 'var(--gold)', fontSize: '0.78rem', cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit', fontWeight: 600 } }, '\u2190 Back'),

            // League name
            chronicles.leagueName && React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', marginBottom: '12px', textAlign: 'center', letterSpacing: '-0.02em' } }, chronicles.leagueName),

            // Championship History
            chronicles.championshipHistory?.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'CHAMPIONSHIP HISTORY'),
                chronicles.championshipHistory.map((c, i) =>
                    React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: i < chronicles.championshipHistory.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' } },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '\uD83C\uDFC6'),
                        React.createElement('span', { style: { fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', minWidth: '35px' } }, c.year),
                        React.createElement('div', { style: { flex: 1 } },
                            React.createElement('div', { style: { fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' } }, c.winner, c.winnerScore ? ' ' + c.winnerScore : ''),
                            c.loser && React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, 'vs ', c.loser, c.loserScore ? ' ' + c.loserScore : ''),
                        ),
                        c.hsp?.offense && React.createElement('div', { style: { textAlign: 'right', fontSize: '0.65rem', color: 'var(--silver)' } },
                            React.createElement('div', null, 'HSP: ', c.hsp.offense.name),
                            React.createElement('div', null, c.hsp.offense.points, ' pts'),
                        ),
                    )
                ),
            ),

            // All-Time Standings
            chronicles.standings?.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'ALL-TIME STANDINGS'),
                React.createElement('div', { style: { overflowX: 'auto' } },
                    React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' } },
                        React.createElement('thead', null,
                            React.createElement('tr', null,
                                ['Team', 'W', 'L', 'W%', 'Chmp', 'PO'].map(h =>
                                    React.createElement('th', { key: h, style: { padding: '4px 6px', textAlign: h === 'Team' ? 'left' : 'center', color: 'var(--gold)', fontWeight: 700, borderBottom: '1px solid rgba(212,175,55,0.2)' } }, h)
                                )
                            ),
                        ),
                        React.createElement('tbody', null,
                            chronicles.standings.map((s, i) =>
                                React.createElement('tr', { key: i, style: { opacity: s.isDefunct ? 0.4 : 1 } },
                                    React.createElement('td', { style: { padding: '4px 6px', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap' } }, s.team || s.owner, s.isDefunct && React.createElement('span', { style: { fontSize: '0.6rem', color: 'var(--silver)', marginLeft: '4px' } }, s.fromYear + '-' + (s.toYear || ''))),
                                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', color: 'var(--silver)' } }, s.wins),
                                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', color: 'var(--silver)' } }, s.losses),
                                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', color: 'var(--silver)' } }, s.winPct),
                                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', color: s.championships > 0 ? 'var(--gold)' : 'var(--silver)', fontWeight: s.championships > 0 ? 700 : 400 } }, s.championships || 0),
                                    React.createElement('td', { style: { padding: '4px 6px', textAlign: 'center', color: 'var(--silver)' } }, s.playoffsMade || 0),
                                )
                            ),
                        ),
                    ),
                ),
            ),

            // Custom Awards
            chronicles.customAwards?.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'AWARDS'),
                chronicles.customAwards.map((award, ai) =>
                    React.createElement('div', { key: ai, style: { marginBottom: ai < chronicles.customAwards.length - 1 ? '12px' : 0 } },
                        React.createElement('div', { style: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' } }, award.name),
                        (award.winners || []).map((w, wi) =>
                            React.createElement('div', { key: wi, style: { display: 'flex', gap: '8px', padding: '3px 0', fontSize: '0.72rem' } },
                                React.createElement('span', { style: { color: 'var(--silver)', minWidth: '35px' } }, w.year),
                                React.createElement('span', { style: { color: 'var(--white)', fontWeight: 600, flex: 1 } }, w.winner),
                                w.stats && React.createElement('span', { style: { color: 'var(--silver)', fontSize: '0.65rem' } }, w.stats),
                            )
                        ),
                    )
                ),
            ),

            // All-Time Team
            chronicles.allTimeTeam?.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: headerStyle }, 'ALL-TIME TEAM'),
                chronicles.allTimeTeam.map((p, i) =>
                    React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: i < chronicles.allTimeTeam.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontSize: '0.78rem' } },
                        React.createElement('span', { style: { fontWeight: 700, color: 'var(--gold)', minWidth: '28px' } }, p.pos),
                        React.createElement('span', { style: { fontWeight: 600, color: 'var(--white)', flex: 1 } }, p.name),
                        p.team && React.createElement('span', { style: { color: 'var(--silver)', fontSize: '0.68rem' } }, p.team),
                        p.year && React.createElement('span', { style: { color: 'var(--silver)', fontSize: '0.68rem' } }, p.year),
                        p.points && React.createElement('span', { style: { color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' } }, p.points),
                    )
                ),
            ),

            // Re-import button
            React.createElement('button', { onClick: () => setView('import'), style: { marginTop: '12px', width: '100%', padding: '8px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--silver)', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' } }, 'Re-import Chronicles'),
        );
    }

    // ══════════════════════════════════════════════════════════════
    // SEASON RECAP GENERATOR
    // ══════════════════════════════════════════════════════════════
    async function generateSeasonRecap() {
        setRecapStatus('generating');
        try {
            const season = currentLeague?.season || new Date().getFullYear();
            const champs = championships || {};
            const champData = champs[season] || {};
            const champOwner = ownerHistory[champData.champion];
            const runnerOwner = ownerHistory[champData.runnerUp];

            const topTeams = owners.slice(0, 5).map(o => o.ownerName + ' (' + o.record + ')').join(', ');
            const tradeCount = window.App?.LI?.tradeHistory?.length || 0;

            const prompt = `Write a dramatic, entertaining 300-word season recap for a fantasy football league's ${season} season. Write in the style of a sports journalist covering a championship. Use vivid language and narrative storytelling.

League: ${currentLeague?.name || 'Dynasty League'}
Champion: ${champOwner?.ownerName || 'Unknown'} (${champOwner?.record || '?'})
Runner-Up: ${runnerOwner?.ownerName || 'Unknown'} (${runnerOwner?.record || '?'})
Top teams: ${topTeams}
Total trades: ${tradeCount}
Teams: ${owners.length}

Make it feel like a real sports story. Give it a compelling headline. End with a look-ahead line about next season.`;

            const reply = typeof window.callClaude === 'function'
                ? await window.callClaude([{ role: 'user', content: prompt }])
                : await window.OD.callAI({ type: 'general', context: prompt });
            const text = typeof reply === 'string' ? reply : reply?.text || reply?.response || '';
            setRecapText(text);
            setRecapStatus('done');
        } catch (e) {
            console.warn('[Recap] Error:', e);
            setRecapStatus('');
        }
    }

    // ══════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════════════════════════════
    const tabBtn = (label, tabKey, clickOverride) => React.createElement('button', {
        onClick: clickOverride || (() => setView(tabKey)),
        style: { padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '6px', border: '1px solid ' + (view === tabKey ? 'var(--gold)' : 'rgba(255,255,255,0.1)'), background: view === tabKey ? 'var(--gold)' : 'transparent', color: view === tabKey ? 'var(--black)' : 'var(--silver)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }
    }, label);

    return React.createElement('div', { style: { padding: '0' } },
        // View toggle
        React.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', scrollbarWidth: 'none' } },
            tabBtn('League', 'league'),
            tabBtn('My Trophies', 'personal', () => { setView('personal'); if (!selectedOwner) setSelectedOwner(myRoster?.roster_id); }),
            chronicles && tabBtn('Chronicles', 'chronicles'),
            tabBtn('Import', 'import'),
        ),

        // Season Recap button (show on league view)
        view === 'league' && React.createElement('div', { style: { marginBottom: '12px' } },
            recapStatus === 'done' && recapText
                ? React.createElement('div', { style: { ...cardStyle, whiteSpace: 'pre-wrap' } },
                    React.createElement('div', { style: headerStyle }, 'SEASON RECAP'),
                    React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--silver)', lineHeight: 1.7 } }, recapText),
                )
                : React.createElement('button', {
                    onClick: generateSeasonRecap, disabled: recapStatus === 'generating',
                    style: { width: '100%', padding: '10px', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', color: 'var(--gold)', fontSize: '0.78rem', fontWeight: 600, cursor: recapStatus === 'generating' ? 'wait' : 'pointer', fontFamily: 'inherit' }
                }, recapStatus === 'generating' ? 'Alex is writing...' : 'Generate Season Recap'),
        ),

        view === 'league' ? renderLeagueView()
            : view === 'personal' ? renderPersonalView()
            : view === 'chronicles' ? renderChroniclesView()
            : view === 'import' ? renderImportView()
            : renderLeagueView(),
    );
}
