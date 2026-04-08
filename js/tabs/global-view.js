// ══════════════════════════════════════════════════════════════════
// js/tabs/global-view.js — Pro Tier: Empire Dashboard
// "Europa Universalis for Dynasty" — you are the kingdom, leagues are provinces.
// Aggregates roster, trades, waivers, health, projections across ALL leagues.
// Tabs: Overview | All Players | All Picks | Exposure
// Requires Pro tier ($12.99/mo) or higher.
// ══════════════════════════════════════════════════════════════════

function EmpireDashboard({ allLeagues, playersData, sleeperUserId, onEnterLeague, onBack }) {
    const { useState, useMemo } = React;
    const normPos = window.App?.normPos || (p => p);
    const scores = window.App?.LI?.playerScores || {};
    const meta = window.App?.LI?.playerMeta || {};
    const posColors = window.App?.POS_COLORS || {};

    const [empireTab, setEmpireTab] = useState('overview');
    const [playerSort, setPlayerSort] = useState({ key: 'dhq', dir: -1 });
    const [playerPosFilter, setPlayerPosFilter] = useState('');
    const [expandedProvince, setExpandedProvince] = useState(null);

    const alexAvatar = (() => {
        const key = localStorage.getItem('wr_alex_avatar') || 'brain';
        const map = { brain:'\u{1F9E0}', target:'\u{1F3AF}', chart:'\u{1F4CA}', football:'\u{1F3C8}', bolt:'\u26A1', fire:'\u{1F525}', medal:'\u{1F396}\uFE0F', trophy:'\u{1F3C6}' };
        return map[key] || '\u{1F9E0}';
    })();
    const userName = window.S?.user?.display_name || window.S?.user?.username || 'Commander';

    // ══════════════════════════════════════════════════════════════
    // PROVINCE DATA — one enriched object per league
    // ══════════════════════════════════════════════════════════════
    const provinces = useMemo(() => {
        if (!allLeagues?.length) return [];
        return allLeagues.map(league => {
            const rosters = league.rosters || [];
            const myRoster = rosters.find(r => r.owner_id === sleeperUserId || r.owner_id === league.myUserId);
            if (!myRoster) return null;

            const players = myRoster.players || [];
            const totalDHQ = players.reduce((s, pid) => s + (scores[pid] || 0), 0);
            const wins = myRoster.settings?.wins || 0;
            const losses = myRoster.settings?.losses || 0;
            const budget = league.settings?.waiver_budget || 0;
            const spent = myRoster.settings?.waiver_budget_used || 0;
            const faab = Math.max(0, budget - spent);

            // Health + tier
            let healthScore = 0, tier = 'UNKNOWN', needs = [], strengths = [];
            if (typeof window.assessTeamFromGlobal === 'function') {
                const assess = window.assessTeamFromGlobal(myRoster.roster_id);
                if (assess) {
                    healthScore = assess.healthScore || 0;
                    tier = assess.tier || 'UNKNOWN';
                    needs = (assess.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
                    strengths = (assess.strengths || []).slice(0, 3);
                }
            }

            // Power rank
            const ranked = [...rosters].sort((a, b) => {
                const da = (a.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0);
                const db = (b.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0);
                return db - da;
            });
            const powerRank = ranked.findIndex(r => r.roster_id === myRoster.roster_id) + 1;

            // Trade history
            const ownerProfile = window.App?.LI?.ownerProfiles?.[myRoster.roster_id] || {};

            // Top 5 players by DHQ
            const topPlayers = players
                .map(pid => ({ pid, name: playersData?.[pid]?.full_name || '?', pos: normPos(playersData?.[pid]?.position) || '?', dhq: scores[pid] || 0, team: playersData?.[pid]?.team || 'FA' }))
                .sort((a, b) => b.dhq - a.dhq)
                .slice(0, 5);

            // Standings position
            const standingsRank = [...rosters].sort((a, b) => {
                const wa = a.settings?.wins || 0, wb = b.settings?.wins || 0;
                if (wb !== wa) return wb - wa;
                return (b.settings?.fpts || 0) - (a.settings?.fpts || 0);
            }).findIndex(r => r.roster_id === myRoster.roster_id) + 1;

            const tierColor = tier === 'ELITE' ? '#2ECC71' : tier === 'CONTENDER' ? '#3498DB' : tier === 'CROSSROADS' ? '#F0A500' : '#E74C3C';
            const window_ = tier === 'ELITE' || tier === 'CONTENDER' ? 'Competing' : tier === 'CROSSROADS' ? 'Crossroads' : 'Rebuilding';

            return {
                id: league.id || league.league_id, name: league.name || 'League', teams: rosters.length,
                platform: league.platform || 'sleeper', isDynasty: league.settings?.type === 2,
                roster: myRoster, players, totalDHQ, wins, losses,
                healthScore, tier, tierColor, needs, strengths,
                powerRank, standingsRank,
                faab, faabTotal: budget,
                tradeWon: ownerProfile.tradesWon || 0, tradeLost: ownerProfile.tradesLost || 0, tradeFair: ownerProfile.tradesFair || 0,
                window: window_, topPlayers, league,
            };
        }).filter(Boolean);
    }, [allLeagues, sleeperUserId]);

    // ══════════════════════════════════════════════════════════════
    // EMPIRE AGGREGATES — cross-league data
    // ══════════════════════════════════════════════════════════════
    const empire = useMemo(() => {
        const totalDHQ = provinces.reduce((s, p) => s + p.totalDHQ, 0);
        const avgHealth = provinces.length > 0 ? Math.round(provinces.reduce((s, p) => s + p.healthScore, 0) / provinces.length) : 0;

        // All players across all leagues (for the All Players tab)
        const allPlayersMap = {};
        provinces.forEach(prov => {
            prov.players.forEach(pid => {
                if (!allPlayersMap[pid]) allPlayersMap[pid] = { pid, leagues: [], dhq: scores[pid] || 0 };
                allPlayersMap[pid].leagues.push({ name: prov.name, id: prov.id });
            });
        });
        const allPlayersList = Object.values(allPlayersMap)
            .map(p => ({
                ...p,
                name: playersData?.[p.pid]?.full_name || '?',
                pos: normPos(playersData?.[p.pid]?.position) || '?',
                team: playersData?.[p.pid]?.team || 'FA',
                age: playersData?.[p.pid]?.age || null,
                count: p.leagues.length,
            }))
            .filter(p => p.name !== '?');

        // Exposure (multi-league only)
        const exposure = allPlayersList
            .filter(p => p.count > 1)
            .sort((a, b) => b.count - a.count || b.dhq - a.dhq);

        // All draft picks across all leagues (using per-league tradedPicks)
        const allPicks = [];
        provinces.forEach(prov => {
            const league = prov.league;
            const draftRounds = league.settings?.draft_rounds || 4;
            const season = String(league.season || new Date().getFullYear());
            const tradedPicks = league.tradedPicks || window.S?.tradedPicks || [];
            for (let yr = parseInt(season); yr <= parseInt(season) + 2; yr++) {
                for (let rd = 1; rd <= draftRounds; rd++) {
                    const tradedAway = tradedPicks.find(tp => parseInt(tp.season) === yr && tp.round === rd && tp.roster_id === prov.roster.roster_id && tp.owner_id !== prov.roster.roster_id);
                    if (!tradedAway) {
                        allPicks.push({ league: prov.name, leagueId: prov.id, year: yr, round: rd, own: true });
                    }
                    const acquired = tradedPicks.filter(tp => parseInt(tp.season) === yr && tp.round === rd && tp.owner_id === prov.roster.roster_id && tp.roster_id !== prov.roster.roster_id);
                    acquired.forEach(() => {
                        allPicks.push({ league: prov.name, leagueId: prov.id, year: yr, round: rd, own: false });
                    });
                }
            }
        });

        // Alerts
        const alerts = [];
        provinces.forEach(prov => {
            if (prov.needs.length >= 2) alerts.push({ league: prov.name, leagueId: prov.id, text: 'Positional gaps: ' + prov.needs.join(', '), urgency: 'red', icon: '\u{1F534}' });
            else if (prov.needs.length > 0) alerts.push({ league: prov.name, leagueId: prov.id, text: 'Thin at ' + prov.needs[0], urgency: 'yellow', icon: '\u{1F7E1}' });
            if (prov.faabTotal > 0 && prov.faab < prov.faabTotal * 0.25) alerts.push({ league: prov.name, leagueId: prov.id, text: 'FAAB low ($' + prov.faab + '/$' + prov.faabTotal + ')', urgency: 'yellow', icon: '\u{1F7E1}' });
            if (prov.healthScore < 50) alerts.push({ league: prov.name, leagueId: prov.id, text: 'Health critical (' + prov.healthScore + ')', urgency: 'red', icon: '\u{1F534}' });
        });
        alerts.sort((a, b) => { const o = { red: 0, yellow: 1, green: 2 }; return (o[a.urgency] || 9) - (o[b.urgency] || 9); });

        return { totalDHQ, avgHealth, allPlayersList, exposure, allPicks, alerts };
    }, [provinces]);

    // ══════════════════════════════════════════════════════════════
    // STYLE TOKENS
    // ══════════════════════════════════════════════════════════════
    const G = '#D4AF37', W = '#f0f0f3', S = 'rgba(255,255,255,0.5)', BK = '#0a0a0a';
    const font = "'DM Sans', Inter, sans-serif";
    const raj = 'Rajdhani, sans-serif';
    const mono = 'JetBrains Mono, monospace';

    const statBox = (label, value, sub, color) => (
        <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '10px', padding: '14px 16px', textAlign: 'center', flex: 1, minWidth: '100px' }}>
            <div style={{ fontFamily: mono, fontSize: '1.6rem', fontWeight: 700, color: color || W, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.62rem', color: G, marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</div>
            {sub && <div style={{ fontSize: '0.58rem', color: S, marginTop: '2px' }}>{sub}</div>}
        </div>
    );
    const tabBtn = (key, label) => (
        <button key={key} onClick={() => setEmpireTab(key)} style={{
            padding: '8px 18px', fontSize: '0.78rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', fontFamily: font, letterSpacing: '0.03em', transition: 'all 0.15s',
            border: empireTab === key ? '1.5px solid ' + G : '1px solid rgba(255,255,255,0.1)',
            background: empireTab === key ? 'rgba(212,175,55,0.15)' : 'transparent',
            color: empireTab === key ? G : S,
        }}>{label}</button>
    );

    if (!provinces.length) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: S, fontFamily: font }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>{'\u{1F30D}'}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: W, marginBottom: '8px' }}>No Provinces Yet</div>
                <div style={{ fontSize: '0.85rem', maxWidth: '360px', margin: '0 auto', lineHeight: 1.6 }}>Connect your leagues to build your dynasty empire.</div>
                <button onClick={onBack} style={{ marginTop: '24px', padding: '12px 32px', background: G, color: BK, border: 'none', borderRadius: '10px', fontFamily: raj, fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>Connect Leagues</button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: BK, fontFamily: font }}>
            {/* ═══ HEADER ═══ */}
            <div style={{ padding: '14px 32px', borderBottom: '2px solid rgba(212,175,55,0.25)', display: 'flex', alignItems: 'center', gap: '16px', background: 'linear-gradient(135deg, rgba(212,175,55,0.08), transparent)', position: 'sticky', top: 0, zIndex: 50 }}>
                <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer', color: S, fontSize: '0.78rem', fontFamily: font, padding: '5px 12px' }}>{'\u2190'} Hub</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    {typeof window.ProTierIcon === 'function' ? <div style={{ width: 28, height: 28 }}>{React.createElement(window.ProTierIcon, { size: 28 })}</div> : null}
                    <div>
                        <div style={{ fontFamily: raj, fontSize: '1.1rem', color: G, letterSpacing: '0.08em', lineHeight: 1 }}>WAR ROOM PRO</div>
                        <div style={{ fontSize: '0.58rem', color: S, letterSpacing: '0.06em' }}>EMPIRE DASHBOARD</div>
                    </div>
                </div>
                {/* Tab navigation */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    {tabBtn('overview', 'Overview')}
                    {tabBtn('players', 'All Players')}
                    {tabBtn('picks', 'All Picks')}
                    {tabBtn('exposure', 'Exposure')}
                </div>
                <div style={{ fontSize: '0.78rem', color: S }}>{alexAvatar} {userName}</div>
            </div>

            <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' }}>

            {/* ══════════════════ TAB: OVERVIEW ══════════════════ */}
            {empireTab === 'overview' && (<>
                {/* KPI row */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    {statBox('Provinces', provinces.length, 'leagues')}
                    {statBox('Portfolio', Math.round(empire.totalDHQ / 1000) + 'k', 'total DHQ', empire.totalDHQ > 100000 ? '#2ECC71' : W)}
                    {statBox('Health', empire.avgHealth, 'avg score', empire.avgHealth >= 70 ? '#2ECC71' : empire.avgHealth >= 50 ? G : '#E74C3C')}
                    {statBox('Players', empire.allPlayersList.length, 'across leagues')}
                    {statBox('Picks', empire.allPicks.length, 'total capital')}
                    {statBox('Exposure', empire.exposure.length, 'multi-league')}
                </div>

                {/* Province cards */}
                <div style={{ fontFamily: raj, fontSize: '0.7rem', color: G, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>YOUR PROVINCES</div>
                <div style={{ display: 'grid', gridTemplateColumns: provinces.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(440px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {provinces.map(prov => {
                        const isExp = expandedProvince === prov.id;
                        return (
                        <div key={prov.id} style={{ background: BK, border: '2px solid rgba(212,175,55,0.3)', borderRadius: '14px', borderLeft: '4px solid ' + prov.tierColor, overflow: 'hidden', transition: 'box-shadow 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(212,175,55,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                            {/* Header */}
                            <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid rgba(212,175,55,0.1)', cursor: 'pointer' }}
                                onClick={() => setExpandedProvince(isExp ? null : prov.id)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <div style={{ fontFamily: raj, fontSize: '1.05rem', fontWeight: 700, color: W, flex: 1 }}>{prov.name}</div>
                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', color: S }}>{prov.platform.toUpperCase()}</span>
                                    {prov.isDynasty && <span style={{ fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: 'rgba(212,175,55,0.1)', color: G }}>DYNASTY</span>}
                                    <span style={{ fontSize: '0.58rem', color: S }}>{prov.teams}T</span>
                                    <span style={{ fontSize: '0.6rem', color: S, opacity: 0.5 }}>{isExp ? '\u25B2' : '\u25BC'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: prov.tierColor, padding: '1px 7px', borderRadius: '4px', border: '1px solid ' + prov.tierColor + '40', background: prov.tierColor + '15' }}>{prov.tier}</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: W, fontFamily: mono }}>{prov.wins}-{prov.losses}</span>
                                    <span style={{ fontSize: '0.68rem', color: prov.healthScore >= 70 ? '#2ECC71' : prov.healthScore >= 50 ? G : '#E74C3C', fontWeight: 700 }}>HP:{prov.healthScore}</span>
                                    <span style={{ fontSize: '0.68rem', color: S }}>#{prov.standingsRank}/{prov.teams}</span>
                                    <span style={{ fontSize: '0.68rem', fontFamily: mono, color: G, marginLeft: 'auto' }}>{Math.round(prov.totalDHQ / 1000)}k DHQ</span>
                                </div>
                            </div>

                            {/* Top 5 Players — always visible */}
                            <div style={{ padding: '8px 18px' }}>
                                <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px', fontWeight: 700 }}>CORE ASSETS</div>
                                {prov.topPlayers.map((p, i) => (
                                    <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '0.72rem', cursor: 'pointer' }}
                                        onClick={e => { e.stopPropagation(); if (typeof window.openPlayerModal === 'function') window.openPlayerModal(p.pid); }}>
                                        <span style={{ width: '14px', color: i < 3 ? G : S, fontSize: '0.6rem', fontWeight: 700 }}>{i + 1}</span>
                                        <span style={{ color: W, fontWeight: 500, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</span>
                                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: posColors[p.pos] || S }}>{p.pos}</span>
                                        <span style={{ fontFamily: mono, fontSize: '0.68rem', color: p.dhq >= 7000 ? '#2ECC71' : p.dhq >= 4000 ? '#3498DB' : S, fontWeight: 600, minWidth: '36px', textAlign: 'right' }}>{p.dhq > 0 ? (p.dhq/1000).toFixed(1) + 'k' : '\u2014'}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Expanded section — data grid + Alex + enter */}
                            {isExp && (<>
                                <div style={{ padding: '8px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.72rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>Strengths</div>
                                        <div style={{ color: '#2ECC71', fontSize: '0.7rem' }}>{prov.strengths.length ? prov.strengths.join(', ') : 'None identified'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>Weaknesses</div>
                                        <div style={{ color: '#E74C3C', fontSize: '0.7rem' }}>{prov.needs.length ? prov.needs.join(', ') : 'None'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>Window</div>
                                        <div style={{ color: prov.window === 'Competing' ? '#2ECC71' : prov.window === 'Crossroads' ? G : '#E74C3C', fontWeight: 600 }}>{prov.window}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>Trades</div>
                                        <div><span style={{ color: '#2ECC71' }}>{prov.tradeWon}W</span> <span style={{ color: '#E74C3C' }}>{prov.tradeLost}L</span> <span style={{ color: S }}>{prov.tradeFair}F</span></div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>FAAB</div>
                                        <div style={{ color: prov.faab < prov.faabTotal * 0.25 ? '#E74C3C' : S }}>{prov.faabTotal > 0 ? '$' + prov.faab + '/$' + prov.faabTotal : 'N/A'}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.58rem', color: G, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px', fontWeight: 700 }}>Projected</div>
                                        <div style={{ color: prov.standingsRank <= 3 ? '#2ECC71' : S }}>#{prov.standingsRank} of {prov.teams}</div>
                                    </div>
                                </div>
                                {/* Alex insight */}
                                <div style={{ padding: '6px 18px 10px' }}>
                                    <div style={{ background: 'rgba(212,175,55,0.04)', borderLeft: '3px solid rgba(212,175,55,0.4)', borderRadius: '0 6px 6px 0', padding: '7px 12px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '0.65rem' }}>{alexAvatar}</span>
                                        <div style={{ fontSize: '0.7rem', color: S, lineHeight: 1.5 }}>
                                            {prov.tier === 'ELITE' ? 'Dominant position. Protect assets and target championships.'
                                                : prov.tier === 'CONTENDER' ? 'In the mix. One upgrade at ' + (prov.needs[0] || 'depth') + ' could push you over.'
                                                : prov.tier === 'CROSSROADS' ? 'Decision time. Commit to competing or pivot to accumulation.'
                                                : 'Rebuild mode. Acquire young talent and draft capital.'}
                                        </div>
                                    </div>
                                </div>
                            </>)}
                            {/* Enter button */}
                            <div style={{ padding: '0 18px 14px' }}>
                                <button onClick={() => onEnterLeague(prov.league)}
                                    style={{ width: '100%', padding: '9px', background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.03))', border: '1.5px solid rgba(212,175,55,0.25)', borderRadius: '8px', color: G, fontFamily: raj, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.18)'; e.currentTarget.style.borderColor = G; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.03))'; e.currentTarget.style.borderColor = 'rgba(212,175,55,0.25)'; }}>
                                    Enter War Room {'\u2192'}
                                </button>
                            </div>
                        </div>
                    );})}
                </div>

                {/* Alerts */}
                {empire.alerts.length > 0 && (
                    <div style={{ background: BK, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px' }}>
                        <div style={{ fontFamily: raj, fontSize: '0.7rem', color: G, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>EMPIRE ALERTS</div>
                        {empire.alerts.slice(0, 10).map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem' }}>
                                <span style={{ flexShrink: 0 }}>{a.icon}</span>
                                <span style={{ fontWeight: 700, color: G }}>{a.league}</span>
                                <span style={{ color: S }}>{a.text}</span>
                            </div>
                        ))}
                    </div>
                )}
            </>)}

            {/* ══════════════════ TAB: ALL PLAYERS ══════════════════ */}
            {empireTab === 'players' && (() => {
                let filtered = empire.allPlayersList.slice();
                if (playerPosFilter) filtered = filtered.filter(p => p.pos === playerPosFilter);
                const k = playerSort.key, d = playerSort.dir;
                filtered.sort((a, b) => {
                    if (k === 'name') return d * (a.name || '').localeCompare(b.name || '');
                    if (k === 'pos') return d * (a.pos || '').localeCompare(b.pos || '');
                    if (k === 'dhq') return d * ((a.dhq || 0) - (b.dhq || 0));
                    if (k === 'age') return d * ((a.age || 99) - (b.age || 99));
                    if (k === 'count') return d * (a.count - b.count);
                    return 0;
                });
                const toggleSort = (key) => setPlayerSort(prev => prev.key === key ? { ...prev, dir: prev.dir * -1 } : { key, dir: key === 'name' ? 1 : -1 });
                const arrow = (key) => playerSort.key === key ? (playerSort.dir === -1 ? ' \u25BC' : ' \u25B2') : '';
                const hdr = { cursor: 'pointer', userSelect: 'none', fontSize: '0.65rem', fontWeight: 700, color: G, textTransform: 'uppercase', letterSpacing: '0.04em' };

                return (<>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                        <div style={{ fontFamily: raj, fontSize: '1rem', fontWeight: 700, color: W }}>All Players · {filtered.length}</div>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button onClick={() => setPlayerPosFilter('')} style={{ padding: '3px 10px', fontSize: '0.68rem', borderRadius: '12px', border: !playerPosFilter ? '1px solid ' + G : '1px solid rgba(255,255,255,0.1)', background: !playerPosFilter ? 'rgba(212,175,55,0.12)' : 'transparent', color: !playerPosFilter ? G : S, cursor: 'pointer', fontFamily: font }}>All</button>
                            {['QB','RB','WR','TE','DL','LB','DB'].map(p => (
                                <button key={p} onClick={() => setPlayerPosFilter(playerPosFilter === p ? '' : p)} style={{ padding: '3px 10px', fontSize: '0.68rem', borderRadius: '12px', border: playerPosFilter === p ? '1px solid ' + (posColors[p] || '#666') : '1px solid rgba(255,255,255,0.1)', background: playerPosFilter === p ? (posColors[p] || '#666') + '18' : 'transparent', color: playerPosFilter === p ? posColors[p] : S, cursor: 'pointer', fontFamily: font }}>{p}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{ background: BK, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 60px 50px 1fr', gap: '4px', padding: '8px 14px', borderBottom: '2px solid rgba(212,175,55,0.15)', background: 'rgba(212,175,55,0.06)' }}>
                            <div style={hdr} onClick={() => toggleSort('name')}>Player{arrow('name')}</div>
                            <div style={{...hdr, textAlign: 'center'}} onClick={() => toggleSort('pos')}>Pos{arrow('pos')}</div>
                            <div style={{...hdr, textAlign: 'center'}} onClick={() => toggleSort('age')}>Age{arrow('age')}</div>
                            <div style={{...hdr, textAlign: 'right'}} onClick={() => toggleSort('dhq')}>DHQ{arrow('dhq')}</div>
                            <div style={{...hdr, textAlign: 'center'}} onClick={() => toggleSort('count')}>Lg{arrow('count')}</div>
                            <div style={{...hdr}}>Leagues</div>
                        </div>
                        <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        {filtered.slice(0, 200).map((p, i) => (
                            <div key={p.pid} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 60px 50px 1fr', gap: '4px', padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.75rem', cursor: 'pointer', background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
                                onClick={() => { if (typeof window.openPlayerModal === 'function') window.openPlayerModal(p.pid); }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + p.pid + '.jpg'} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                                    <span style={{ color: W, fontWeight: 500 }}>{p.name}</span>
                                </div>
                                <div style={{ textAlign: 'center' }}><span style={{ fontSize: '0.6rem', fontWeight: 700, color: posColors[p.pos] || S, padding: '1px 4px', background: (posColors[p.pos] || '#666') + '22', borderRadius: '3px' }}>{p.pos}</span></div>
                                <div style={{ textAlign: 'center', color: S }}>{p.age || '\u2014'}</div>
                                <div style={{ textAlign: 'right', fontFamily: mono, fontWeight: 600, color: p.dhq >= 7000 ? '#2ECC71' : p.dhq >= 4000 ? '#3498DB' : S }}>{p.dhq > 0 ? (p.dhq/1000).toFixed(1) + 'k' : '\u2014'}</div>
                                <div style={{ textAlign: 'center', fontWeight: 700, color: p.count > 1 ? G : S }}>{p.count}x</div>
                                <div style={{ fontSize: '0.65rem', color: S, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.leagues.map(l => l.name).join(' \u00B7 ')}</div>
                            </div>
                        ))}
                        </div>
                    </div>
                </>);
            })()}

            {/* ══════════════════ TAB: ALL PICKS ══════════════════ */}
            {empireTab === 'picks' && (() => {
                const years = [...new Set(empire.allPicks.map(p => p.year))].sort();
                return (<>
                    <div style={{ fontFamily: raj, fontSize: '1rem', fontWeight: 700, color: W, marginBottom: '14px' }}>Draft Capital · {empire.allPicks.length} picks across {provinces.length} leagues</div>
                    {years.map(yr => {
                        const yearPicks = empire.allPicks.filter(p => p.year === yr);
                        const byLeague = {};
                        yearPicks.forEach(p => { if (!byLeague[p.league]) byLeague[p.league] = []; byLeague[p.league].push(p); });
                        return (
                            <div key={yr} style={{ background: BK, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '14px 18px', marginBottom: '12px' }}>
                                <div style={{ fontFamily: raj, fontSize: '0.85rem', fontWeight: 700, color: G, letterSpacing: '0.06em', marginBottom: '10px' }}>{yr} · {yearPicks.length} picks</div>
                                {Object.entries(byLeague).map(([league, picks]) => (
                                    <div key={league} style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.7rem', color: W, fontWeight: 600, marginBottom: '4px' }}>{league}</div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {picks.sort((a, b) => a.round - b.round).map((pk, i) => (
                                                <span key={i} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, background: pk.own ? 'rgba(212,175,55,0.08)' : 'rgba(124,107,248,0.1)', border: '1px solid ' + (pk.own ? 'rgba(212,175,55,0.25)' : 'rgba(124,107,248,0.25)'), color: pk.own ? G : '#9b8afb' }}>
                                                    R{pk.round}{!pk.own && <span style={{ fontSize: '0.6rem', marginLeft: '3px', opacity: 0.7 }}>(acq)</span>}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </>);
            })()}

            {/* ══════════════════ TAB: EXPOSURE ══════════════════ */}
            {empireTab === 'exposure' && (<>
                <div style={{ fontFamily: raj, fontSize: '1rem', fontWeight: 700, color: W, marginBottom: '14px' }}>Player Exposure · {empire.exposure.length} multi-league holdings</div>
                {empire.exposure.length > 0 && (
                    <div style={{ background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.15)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '0.78rem', color: '#E74C3C', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{'\u26A0'}</span>
                        <span>Concentration risk: {empire.exposure.reduce((s, p) => s + p.dhq, 0) > empire.totalDHQ * 0.3 ? 'HIGH' : 'MODERATE'} — {Math.round(empire.exposure.reduce((s, p) => s + p.dhq, 0) / Math.max(1, empire.totalDHQ) * 100)}% of portfolio in multi-league players</span>
                    </div>
                )}
                <div style={{ background: BK, border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                    {empire.exposure.length === 0
                        ? <div style={{ padding: '40px', textAlign: 'center', color: S, fontSize: '0.85rem' }}>No players owned across multiple leagues.</div>
                        : empire.exposure.map((p, i) => (
                            <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
                                onClick={() => { if (typeof window.openPlayerModal === 'function') window.openPlayerModal(p.pid); }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'}>
                                <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + p.pid + '.jpg'} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: W }}>{p.name}</div>
                                    <div style={{ fontSize: '0.68rem', color: S }}>{p.leagues.map(l => l.name).join(' \u00B7 ')}</div>
                                </div>
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: posColors[p.pos] || S, padding: '2px 6px', background: (posColors[p.pos] || '#666') + '22', borderRadius: '3px' }}>{p.pos}</span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: p.count >= 3 ? '#E74C3C' : G, padding: '2px 10px', background: p.count >= 3 ? 'rgba(231,76,60,0.12)' : 'rgba(212,175,55,0.12)', borderRadius: '12px' }}>{p.count}x</span>
                                <span style={{ fontFamily: mono, fontSize: '0.78rem', fontWeight: 600, color: p.dhq >= 7000 ? '#2ECC71' : S, minWidth: '48px', textAlign: 'right' }}>{Math.round(p.dhq / 1000)}k</span>
                            </div>
                        ))
                    }
                </div>
            </>)}

            </div>
        </div>
    );
}

window.EmpireDashboard = EmpireDashboard;
