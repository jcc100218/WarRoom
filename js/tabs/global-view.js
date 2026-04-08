// ══════════════════════════════════════════════════════════════════
// js/tabs/global-view.js — DYNASTY CONTROL TOWER
// Filter-driven cross-league intelligence. Everything recalculates.
// Every insight is clickable. Zoom: global → league → player.
// Bloomberg density · TradingView interactivity · Sleeper accessibility
// ══════════════════════════════════════════════════════════════════

function EmpireDashboard({ allLeagues, playersData, sleeperUserId, onEnterLeague, onBack }) {
    const { useState, useMemo, useCallback } = React;
    const normPos = window.App?.normPos || (p => p);
    const scores = window.App?.LI?.playerScores || {};
    const posColors = window.App?.POS_COLORS || {};
    const peaks = window.App?.peakWindows || {};

    // ══════════════════════════════════════════════════════════════
    // GLOBAL FILTER STATE — drives everything
    // ══════════════════════════════════════════════════════════════
    const [filters, setFilters] = useState({
        league: '',         // '' = all, or league id
        status: '',         // '' | 'contender' | 'rebuild' | 'fringe'
        position: '',       // '' | 'QB' | 'RB' | 'WR' | 'TE' | 'DL' | 'LB' | 'DB'
        ageBucket: '',      // '' | 'rookie' | 'prime' | 'aging'
        assetType: '',      // '' | 'players' | 'picks'
    });
    const [drillPlayer, setDrillPlayer] = useState(null); // pid for player drill-down
    const [drillLeague, setDrillLeague] = useState(null); // league id for league drill-down
    const setFilter = useCallback((key, val) => {
        setFilters(prev => ({ ...prev, [key]: prev[key] === val ? '' : val }));
        setDrillPlayer(null);
        setDrillLeague(null);
    }, []);

    const userName = window.S?.user?.display_name || window.S?.user?.username || 'Commander';
    const alexAvatar = (() => {
        const key = localStorage.getItem('wr_alex_avatar') || 'brain';
        const map = { brain:'\u{1F9E0}', target:'\u{1F3AF}', chart:'\u{1F4CA}', football:'\u{1F3C8}', bolt:'\u26A1', fire:'\u{1F525}' };
        return map[key] || '\u{1F9E0}';
    })();

    // ══════════════════════════════════════════════════════════════
    // DATA ENGINE — compute everything, then filter
    // ══════════════════════════════════════════════════════════════
    const engine = useMemo(() => {
        const provinces = [];
        const allAssets = [];    // every player across every league
        const allPicks = [];     // every draft pick
        const positionTotals = {};
        const ageBuckets = { rookie: 0, prime: 0, aging: 0 };

        (allLeagues || []).forEach(league => {
            const rosters = league.rosters || [];
            const myRoster = rosters.find(r => r.owner_id === sleeperUserId || r.owner_id === league.myUserId);
            if (!myRoster) return;

            const players = myRoster.players || [];
            const totalDHQ = players.reduce((s, pid) => s + (scores[pid] || 0), 0);
            const w = myRoster.settings?.wins || 0, l = myRoster.settings?.losses || 0;
            const budget = league.settings?.waiver_budget || 0;
            const spent = myRoster.settings?.waiver_budget_used || 0;

            // Assessment
            let healthScore = 0, tier = 'UNKNOWN', needs = [], strengths = [];
            if (typeof window.assessTeamFromGlobal === 'function') {
                const a = window.assessTeamFromGlobal(myRoster.roster_id);
                if (a) { healthScore = a.healthScore || 0; tier = a.tier || 'UNKNOWN'; needs = (a.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos); strengths = (a.strengths || []).slice(0, 3); }
            }
            const ownerProfile = window.App?.LI?.ownerProfiles?.[myRoster.roster_id] || {};
            const tierColor = tier === 'ELITE' ? '#2ECC71' : tier === 'CONTENDER' ? '#3498DB' : tier === 'CROSSROADS' ? '#F0A500' : '#E74C3C';
            const status = (tier === 'ELITE' || tier === 'CONTENDER') ? 'contender' : tier === 'CROSSROADS' ? 'fringe' : 'rebuild';

            // Power rank
            const ranked = [...rosters].sort((a, b) => (b.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0) - (a.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0));
            const powerRank = ranked.findIndex(r => r.roster_id === myRoster.roster_id) + 1;
            const standingsRank = [...rosters].sort((a, b) => (b.settings?.wins || 0) - (a.settings?.wins || 0) || (b.settings?.fpts || 0) - (a.settings?.fpts || 0)).findIndex(r => r.roster_id === myRoster.roster_id) + 1;

            const prov = {
                id: league.id || league.league_id, name: league.name || 'League', teams: rosters.length,
                platform: league.platform || 'sleeper', isDynasty: league.settings?.type === 2,
                roster: myRoster, players, totalDHQ, wins: w, losses: l,
                healthScore, tier, tierColor, status, needs, strengths,
                powerRank, standingsRank,
                faab: Math.max(0, budget - spent), faabTotal: budget,
                tradeWon: ownerProfile.tradesWon || 0, tradeLost: ownerProfile.tradesLost || 0, tradeFair: ownerProfile.tradesFair || 0,
                league,
            };
            provinces.push(prov);

            // Build player assets
            players.forEach(pid => {
                const p = playersData?.[pid];
                if (!p || !p.full_name) return;
                const pos = normPos(p.position) || '?';
                const age = p.age || null;
                const dhq = scores[pid] || 0;
                const peakRange = peaks[pos] || [24, 29];
                const bucket = !age ? 'prime' : age < peakRange[0] ? 'rookie' : age <= peakRange[1] ? 'prime' : 'aging';
                ageBuckets[bucket]++;
                if (!positionTotals[pos]) positionTotals[pos] = { count: 0, dhq: 0 };
                positionTotals[pos].count++;
                positionTotals[pos].dhq += dhq;

                allAssets.push({
                    pid, name: p.full_name, pos, team: p.team || 'FA', age, dhq, bucket,
                    leagueId: prov.id, leagueName: prov.name, leagueStatus: status,
                });
            });

            // Build picks
            const tradedPicks = league.tradedPicks || window.S?.tradedPicks || [];
            const draftRounds = league.settings?.draft_rounds || 4;
            const season = parseInt(league.season || new Date().getFullYear());
            for (let yr = season; yr <= season + 2; yr++) {
                for (let rd = 1; rd <= draftRounds; rd++) {
                    const away = tradedPicks.find(tp => parseInt(tp.season) === yr && tp.round === rd && tp.roster_id === myRoster.roster_id && tp.owner_id !== myRoster.roster_id);
                    if (!away) allPicks.push({ leagueId: prov.id, leagueName: prov.name, year: yr, round: rd, own: true });
                    tradedPicks.filter(tp => parseInt(tp.season) === yr && tp.round === rd && tp.owner_id === myRoster.roster_id && tp.roster_id !== myRoster.roster_id)
                        .forEach(() => allPicks.push({ leagueId: prov.id, leagueName: prov.name, year: yr, round: rd, own: false }));
                }
            }
        });

        // Exposure map
        const ownershipMap = {};
        allAssets.forEach(a => {
            if (!ownershipMap[a.pid]) ownershipMap[a.pid] = { ...a, leagues: [], count: 0, totalDHQ: 0 };
            ownershipMap[a.pid].leagues.push({ id: a.leagueId, name: a.leagueName });
            ownershipMap[a.pid].count++;
            ownershipMap[a.pid].totalDHQ += a.dhq;
        });
        const exposure = Object.values(ownershipMap).filter(p => p.count > 1).sort((a, b) => b.count - a.count || b.totalDHQ - a.totalDHQ);

        // Insights (AI-like observations)
        const insights = [];
        // Exposure risk
        exposure.filter(p => p.count >= 3).forEach(p => insights.push({ type: 'risk', text: `${p.name} owned in ${p.count} leagues — high concentration`, pid: p.pid, pos: p.pos }));
        // Position imbalance
        const totalAssetDHQ = allAssets.reduce((s, a) => s + a.dhq, 0);
        Object.entries(positionTotals).forEach(([pos, data]) => {
            const pct = totalAssetDHQ > 0 ? Math.round(data.dhq / totalAssetDHQ * 100) : 0;
            if (pct > 35 && ['RB', 'WR', 'QB'].includes(pos)) insights.push({ type: 'warning', text: `${pct}% of portfolio in ${pos} — overweight`, filter: { position: pos } });
        });
        // Age risk
        const totalAgePlayers = ageBuckets.rookie + ageBuckets.prime + ageBuckets.aging;
        if (totalAgePlayers > 0 && ageBuckets.aging / totalAgePlayers > 0.35) insights.push({ type: 'risk', text: `${Math.round(ageBuckets.aging / totalAgePlayers * 100)}% of assets are post-peak — aging portfolio`, filter: { ageBucket: 'aging' } });
        if (totalAgePlayers > 0 && ageBuckets.rookie / totalAgePlayers > 0.4) insights.push({ type: 'info', text: `${Math.round(ageBuckets.rookie / totalAgePlayers * 100)}% pre-peak — high rookie volatility`, filter: { ageBucket: 'rookie' } });
        // Strategy conflicts
        const contenders = provinces.filter(p => p.status === 'contender');
        const rebuilds = provinces.filter(p => p.status === 'rebuild');
        if (contenders.length > 0 && rebuilds.length > 0) insights.push({ type: 'warning', text: `Mixed strategies: ${contenders.length} contending, ${rebuilds.length} rebuilding — verify alignment` });

        return { provinces, allAssets, allPicks, exposure, positionTotals, ageBuckets, insights, totalDHQ: provinces.reduce((s, p) => s + p.totalDHQ, 0) };
    }, [allLeagues, sleeperUserId, playersData]);

    // ══════════════════════════════════════════════════════════════
    // FILTERED DATA — everything recalculates from filters
    // ══════════════════════════════════════════════════════════════
    const filtered = useMemo(() => {
        let provinces = engine.provinces.slice();
        let assets = engine.allAssets.slice();
        let picks = engine.allPicks.slice();

        // League filter
        if (filters.league) {
            provinces = provinces.filter(p => p.id === filters.league);
            assets = assets.filter(a => a.leagueId === filters.league);
            picks = picks.filter(p => p.leagueId === filters.league);
        }
        // Status filter
        if (filters.status) {
            provinces = provinces.filter(p => p.status === filters.status);
            const ids = new Set(provinces.map(p => p.id));
            assets = assets.filter(a => ids.has(a.leagueId));
            picks = picks.filter(p => ids.has(p.leagueId));
        }
        // Position filter
        if (filters.position) assets = assets.filter(a => a.pos === filters.position);
        // Age bucket filter
        if (filters.ageBucket) assets = assets.filter(a => a.bucket === filters.ageBucket);
        // Asset type filter
        if (filters.assetType === 'picks') assets = [];
        if (filters.assetType === 'players') picks = [];

        // Sort assets by DHQ desc
        assets.sort((a, b) => b.dhq - a.dhq);

        // Recalculate totals
        const totalDHQ = assets.reduce((s, a) => s + a.dhq, 0);
        const totalRecord = provinces.reduce((s, p) => ({ w: s.w + p.wins, l: s.l + p.losses }), { w: 0, l: 0 });
        const avgHealth = provinces.length > 0 ? Math.round(provinces.reduce((s, p) => s + p.healthScore, 0) / provinces.length) : 0;

        return { provinces, assets, picks, totalDHQ, totalRecord, avgHealth };
    }, [engine, filters]);

    // ══════════════════════════════════════════════════════════════
    // STYLE SYSTEM — Bloomberg × Sleeper
    // ══════════════════════════════════════════════════════════════
    const G = '#D4AF37', W = '#f0f0f3', S2 = 'rgba(255,255,255,0.45)', BK = '#0a0a0a', BK2 = '#0e0e0e';
    const mono = "'JetBrains Mono', 'SF Mono', Consolas, monospace";
    const sans = "'DM Sans', 'Inter', -apple-system, sans-serif";
    const raj = "'Rajdhani', sans-serif";

    const filterPill = (key, val, label, color) => {
        const active = filters[key] === val;
        return (
            <button key={val || 'all'} onClick={() => setFilter(key, val)} style={{
                padding: '4px 12px', fontSize: '0.68rem', fontWeight: active ? 700 : 500,
                borderRadius: '4px', cursor: 'pointer', fontFamily: sans, transition: 'all 0.1s',
                border: active ? '1px solid ' + (color || G) : '1px solid rgba(255,255,255,0.08)',
                background: active ? (color || G) + '18' : 'transparent',
                color: active ? (color || G) : S2, letterSpacing: '0.02em',
            }}>{label}</button>
        );
    };

    const kpiCell = (label, value, sub, color) => (
        <div style={{ padding: '10px 14px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontFamily: mono, fontSize: '1.2rem', fontWeight: 700, color: color || W, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
            <div style={{ fontSize: '0.55rem', color: G, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{label}</div>
            {sub && <div style={{ fontSize: '0.52rem', color: S2, marginTop: '1px' }}>{sub}</div>}
        </div>
    );

    // ══════════════════════════════════════════════════════════════
    // PLAYER DRILL-DOWN VIEW
    // ══════════════════════════════════════════════════════════════
    if (drillPlayer) {
        const p = playersData?.[drillPlayer];
        const pid = drillPlayer;
        const pos = normPos(p?.position) || '?';
        const dhq = scores[pid] || 0;
        const ownedIn = engine.allAssets.filter(a => a.pid === pid);
        return (
            <div style={{ minHeight: '100vh', background: BK, fontFamily: sans }}>
                <div style={{ padding: '12px 32px', borderBottom: '1px solid rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => setDrillPlayer(null)} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', color: S2, fontSize: '0.75rem', fontFamily: sans, padding: '4px 12px' }}>{'\u2190'} Back</button>
                    <span style={{ fontFamily: raj, fontSize: '1.1rem', color: G }}>PLAYER DRILL-DOWN</span>
                </div>
                <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 32px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
                        <img src={'https://sleepercdn.com/content/nfl/players/' + pid + '.jpg'} style={{ width: 64, height: 64, borderRadius: '10px', objectFit: 'cover', border: '2px solid rgba(212,175,55,0.3)' }} onError={e => e.target.style.display='none'} />
                        <div>
                            <div style={{ fontFamily: raj, fontSize: '1.5rem', color: W }}>{p?.full_name || '?'}</div>
                            <div style={{ fontSize: '0.82rem', color: S2 }}>{pos} · {p?.team || 'FA'} · Age {p?.age || '?'}</div>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                            <div style={{ fontFamily: mono, fontSize: '1.8rem', fontWeight: 700, color: dhq >= 7000 ? '#2ECC71' : dhq >= 4000 ? '#3498DB' : W }}>{dhq > 0 ? dhq.toLocaleString() : '\u2014'}</div>
                            <div style={{ fontSize: '0.6rem', color: G, textTransform: 'uppercase', letterSpacing: '0.08em' }}>DHQ</div>
                        </div>
                    </div>
                    <div style={{ fontFamily: raj, fontSize: '0.72rem', color: G, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>OWNED IN {ownedIn.length} LEAGUE{ownedIn.length !== 1 ? 'S' : ''}</div>
                    {ownedIn.map((a, i) => {
                        const prov = engine.provinces.find(p2 => p2.id === a.leagueId);
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: BK2, border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer' }}
                                onClick={() => prov && onEnterLeague(prov.league)}
                                onMouseEnter={e => e.currentTarget.style.borderColor = G}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(212,175,55,0.15)'}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: W }}>{a.leagueName}</div>
                                    <div style={{ fontSize: '0.7rem', color: S2 }}>{prov?.tier || '?'} · {prov?.wins || 0}-{prov?.losses || 0} · HP:{prov?.healthScore || 0}</div>
                                </div>
                                <div style={{ fontFamily: mono, fontSize: '0.82rem', color: dhq >= 7000 ? '#2ECC71' : S2 }}>{(dhq / 1000).toFixed(1)}k</div>
                                <span style={{ fontSize: '0.7rem', color: G }}>{'\u2192'}</span>
                            </div>
                        );
                    })}
                    <button onClick={() => { if (typeof window.openPlayerModal === 'function') window.openPlayerModal(pid); }} style={{ marginTop: '16px', padding: '10px 20px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: G, fontFamily: raj, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>Full Player Card</button>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════════════════════════════
    const activeFilters = Object.values(filters).filter(Boolean).length;

    return (
        <div style={{ minHeight: '100vh', background: BK, fontFamily: sans }}>

            {/* ═══ STICKY HEADER + FILTER BAR ═══ */}
            <div style={{ position: 'sticky', top: 0, zIndex: 50, background: BK, borderBottom: '1px solid rgba(212,175,55,0.2)' }}>
                {/* Top bar */}
                <div style={{ padding: '10px 28px', display: 'flex', alignItems: 'center', gap: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px', cursor: 'pointer', color: S2, fontSize: '0.72rem', fontFamily: sans, padding: '4px 10px' }}>{'\u2190'}</button>
                    {typeof window.ProTierIcon === 'function' ? <div style={{ width: 22, height: 22 }}>{React.createElement(window.ProTierIcon, { size: 22 })}</div> : null}
                    <span style={{ fontFamily: raj, fontSize: '0.9rem', color: G, letterSpacing: '0.1em' }}>DYNASTY CONTROL TOWER</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: '0.72rem', color: S2 }}>{alexAvatar} {userName}</span>
                </div>

                {/* KPI strip */}
                <div style={{ display: 'flex', padding: '0 28px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(212,175,55,0.02)' }}>
                    {kpiCell('Leagues', filtered.provinces.length, activeFilters > 0 ? 'of ' + engine.provinces.length : '')}
                    {kpiCell('Record', filtered.totalRecord.w + '-' + filtered.totalRecord.l)}
                    {kpiCell('Portfolio', Math.round(filtered.totalDHQ / 1000) + 'k', 'DHQ', filtered.totalDHQ > 100000 ? '#2ECC71' : W)}
                    {kpiCell('Health', filtered.avgHealth, 'avg', filtered.avgHealth >= 70 ? '#2ECC71' : filtered.avgHealth >= 50 ? G : '#E74C3C')}
                    {kpiCell('Contend', filtered.provinces.filter(p => p.status === 'contender').length)}
                    {kpiCell('Rebuild', filtered.provinces.filter(p => p.status === 'rebuild').length)}
                    {kpiCell('Exposure', engine.exposure.length, 'multi-lg')}
                    {kpiCell('Players', filtered.assets.length)}
                    {kpiCell('Picks', filtered.picks.length, 'capital')}
                </div>

                {/* GLOBAL FILTER BAR */}
                <div style={{ padding: '8px 28px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(0,0,0,0.3)' }}>
                    <span style={{ fontSize: '0.58rem', color: G, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: '4px' }}>FILTER</span>

                    {/* League */}
                    {filterPill('league', '', 'All Leagues')}
                    {engine.provinces.map(p => filterPill('league', p.id, p.name.substring(0, 16)))}

                    <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                    {/* Status */}
                    {filterPill('status', 'contender', 'Contender', '#2ECC71')}
                    {filterPill('status', 'fringe', 'Fringe', '#F0A500')}
                    {filterPill('status', 'rebuild', 'Rebuild', '#E74C3C')}

                    <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                    {/* Position */}
                    {['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB'].map(p => filterPill('position', p, p, posColors[p]))}

                    <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                    {/* Age */}
                    {filterPill('ageBucket', 'rookie', 'Pre-Peak', '#3498DB')}
                    {filterPill('ageBucket', 'prime', 'Prime', '#2ECC71')}
                    {filterPill('ageBucket', 'aging', 'Post-Peak', '#E74C3C')}

                    <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                    {/* Asset type */}
                    {filterPill('assetType', 'players', 'Players')}
                    {filterPill('assetType', 'picks', 'Picks')}

                    {activeFilters > 0 && (
                        <button onClick={() => { setFilters({ league: '', status: '', position: '', ageBucket: '', assetType: '' }); setDrillPlayer(null); setDrillLeague(null); }}
                            style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '0.62rem', borderRadius: '4px', border: '1px solid rgba(231,76,60,0.3)', background: 'rgba(231,76,60,0.08)', color: '#E74C3C', cursor: 'pointer', fontFamily: sans, fontWeight: 600 }}>
                            Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
                        </button>
                    )}
                </div>
            </div>

            {/* ═══ BODY — recalculates from filters ═══ */}
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px 28px' }}>

                {/* INSIGHTS — clickable, filter-driven */}
                {engine.insights.length > 0 && !activeFilters && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {engine.insights.slice(0, 5).map((ins, i) => (
                            <div key={i} onClick={() => {
                                if (ins.pid) setDrillPlayer(ins.pid);
                                else if (ins.filter) setFilters(prev => ({ ...prev, ...ins.filter }));
                            }} style={{
                                padding: '8px 14px', borderRadius: '6px', fontSize: '0.72rem', cursor: ins.pid || ins.filter ? 'pointer' : 'default',
                                background: ins.type === 'risk' ? 'rgba(231,76,60,0.06)' : ins.type === 'warning' ? 'rgba(240,165,0,0.06)' : 'rgba(52,152,219,0.06)',
                                border: '1px solid ' + (ins.type === 'risk' ? 'rgba(231,76,60,0.2)' : ins.type === 'warning' ? 'rgba(240,165,0,0.2)' : 'rgba(52,152,219,0.2)'),
                                color: ins.type === 'risk' ? '#E74C3C' : ins.type === 'warning' ? '#F0A500' : '#3498DB',
                                transition: 'all 0.12s',
                            }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                                {ins.type === 'risk' ? '\u26A0 ' : ins.type === 'warning' ? '\u{1F7E1} ' : '\u{1F535} '}{ins.text}
                            </div>
                        ))}
                    </div>
                )}

                {/* PROVINCES — compact when filtered */}
                {(!filters.assetType || filters.assetType !== 'picks') && filtered.provinces.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.58rem', color: G, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            {filters.league ? 'PROVINCE' : 'PROVINCES'} · {filtered.provinces.length}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: filtered.provinces.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: '8px' }}>
                            {filtered.provinces.map(prov => (
                                <div key={prov.id} style={{ background: BK2, border: '1px solid rgba(255,255,255,0.06)', borderLeft: '3px solid ' + prov.tierColor, borderRadius: '6px', padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s' }}
                                    onClick={() => onEnterLeague(prov.league)}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = G; e.currentTarget.style.background = 'rgba(212,175,55,0.03)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = BK2; }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ fontFamily: raj, fontSize: '0.9rem', fontWeight: 700, color: W, flex: 1 }}>{prov.name}</span>
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: prov.tierColor, padding: '1px 6px', borderRadius: '3px', border: '1px solid ' + prov.tierColor + '40', background: prov.tierColor + '12' }}>{prov.tier}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: S2 }}>
                                        <span style={{ fontFamily: mono, fontWeight: 600 }}>{prov.wins}-{prov.losses}</span>
                                        <span>HP:<span style={{ color: prov.healthScore >= 70 ? '#2ECC71' : prov.healthScore >= 50 ? G : '#E74C3C', fontWeight: 600 }}>{prov.healthScore}</span></span>
                                        <span style={{ fontFamily: mono }}>{Math.round(prov.totalDHQ / 1000)}k</span>
                                        <span>#{prov.powerRank}/{prov.teams}</span>
                                        {prov.needs.length > 0 && <span style={{ color: '#E74C3C' }}>Need: {prov.needs.join(', ')}</span>}
                                        <span style={{ marginLeft: 'auto', color: G }}>{'\u2192'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ASSETS TABLE — the main data sheet */}
                {(!filters.assetType || filters.assetType !== 'picks') && filtered.assets.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.58rem', color: G, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            ASSETS · {filtered.assets.length}
                        </div>
                        <div style={{ background: BK2, border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 36px 56px 36px 1fr', gap: '4px', padding: '6px 14px', borderBottom: '1px solid rgba(212,175,55,0.1)', background: 'rgba(212,175,55,0.03)', fontSize: '0.55rem', fontWeight: 700, color: G, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                <div>Player</div><div style={{ textAlign: 'center' }}>Pos</div><div style={{ textAlign: 'center' }}>Age</div><div style={{ textAlign: 'right' }}>DHQ</div><div style={{ textAlign: 'center' }}>Lg</div><div>League</div>
                            </div>
                            {/* Rows */}
                            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                                {filtered.assets.slice(0, 150).map((a, i) => (
                                    <div key={a.pid + '-' + a.leagueId + '-' + i} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 36px 56px 36px 1fr', gap: '4px', padding: '5px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.72rem', cursor: 'pointer', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                                        onClick={() => setDrillPlayer(a.pid)}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.04)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                            <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + a.pid + '.jpg'} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
                                            <span style={{ color: W, fontWeight: 500, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.name}</span>
                                        </div>
                                        <div style={{ textAlign: 'center' }}><span style={{ fontSize: '0.58rem', fontWeight: 700, color: posColors[a.pos] || S2, padding: '1px 4px', background: (posColors[a.pos] || '#666') + '18', borderRadius: '2px' }}>{a.pos}</span></div>
                                        <div style={{ textAlign: 'center', color: S2, fontSize: '0.68rem' }}>{a.age || '\u2014'}</div>
                                        <div style={{ textAlign: 'right', fontFamily: mono, fontWeight: 600, fontSize: '0.68rem', color: a.dhq >= 7000 ? '#2ECC71' : a.dhq >= 4000 ? '#3498DB' : a.dhq >= 2000 ? W : S2 }}>{a.dhq > 0 ? (a.dhq / 1000).toFixed(1) + 'k' : '\u2014'}</div>
                                        <div style={{ textAlign: 'center', fontSize: '0.62rem', color: S2 }}>{engine.allAssets.filter(x => x.pid === a.pid).length > 1 ? engine.allAssets.filter(x => x.pid === a.pid).length + 'x' : ''}</div>
                                        <div style={{ fontSize: '0.62rem', color: S2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.leagueName}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* PICKS — when showing picks or all */}
                {(!filters.assetType || filters.assetType !== 'players') && filtered.picks.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.58rem', color: G, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
                            DRAFT CAPITAL · {filtered.picks.length} picks
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[...new Set(filtered.picks.map(p => p.year))].sort().map(yr => {
                                const yearPicks = filtered.picks.filter(p => p.year === yr);
                                return (
                                    <div key={yr} style={{ background: BK2, border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '10px 14px', flex: 1, minWidth: '200px' }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: G, marginBottom: '6px' }}>{yr} · {yearPicks.length} picks</div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {yearPicks.sort((a, b) => a.round - b.round).map((pk, i) => (
                                                <span key={i} style={{ padding: '3px 8px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600, fontFamily: mono, background: pk.own ? 'rgba(212,175,55,0.08)' : 'rgba(124,107,248,0.08)', border: '1px solid ' + (pk.own ? 'rgba(212,175,55,0.2)' : 'rgba(124,107,248,0.2)'), color: pk.own ? G : '#9b8afb' }}>
                                                    R{pk.round}
                                                </span>
                                            ))}
                                        </div>
                                        {!filters.league && <div style={{ fontSize: '0.55rem', color: S2, marginTop: '4px' }}>{[...new Set(yearPicks.map(p => p.leagueName))].join(' · ')}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

window.EmpireDashboard = EmpireDashboard;
