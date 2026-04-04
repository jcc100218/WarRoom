// ══════════════════════════════════════════════════════════════════
// free-agency.js — FreeAgencyTab component
// ══════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    // END TRADE CALCULATOR TAB
    // ══════════════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════════════
    // FREE AGENCY TAB — migrated from free-agency.html
    // ══════════════════════════════════════════════════════════════════════════
    function FreeAgencyTab({ playersData, statsData, prevStatsData, myRoster, currentLeague, sleeperUserId, timeRecomputeTs, viewMode }) {
        const [faTargets, setFaTargets] = useState([]);
        const [faFilter, setFaFilter] = useState('');
        const [faBudget, setFaBudget] = useState({ total: 0, spent: 0 });
        const [faSort, setFaSort] = useState({ key: 'dhq', dir: -1 });
        const [faSelectedPid, setFaSelectedPid] = useState(null);

        function normPos(pos) {
            if (!pos) return null;
            if (['DB','CB','S','SS','FS'].includes(pos)) return 'DB';
            if (['DL','DE','DT','NT','IDL','EDGE'].includes(pos)) return 'DL';
            if (['LB','OLB','ILB','MLB'].includes(pos)) return 'LB';
            return pos;
        }

        function calcRawPts(s) {
            if (!s) return 0;
            const scoring = currentLeague?.scoring_settings;
            if (scoring) {
                let total = 0;
                for (const [field, weight] of Object.entries(scoring)) {
                    if (typeof weight !== 'number') continue;
                    if (s[field] != null) total += Number(s[field]) * weight;
                }
                return total;
            }
            return Number(s.pts_half_ppr ?? s.pts_ppr ?? s.pts_std ?? 0);
        }

        // Load FA targets from Supabase/localStorage
        useEffect(() => {
            if (window.OD?.loadTargets) {
                window.OD.loadTargets(currentLeague.league_id || currentLeague.id).then(data => {
                    if (data) { setFaTargets(data.targets || []); setFaBudget({ total: data.startingBudget || 200, spent: 0 }); }
                }).catch(() => {});
            }
        }, []);

        // Find available (unrostered) players
        const rostered = useMemo(() => {
            const set = new Set();
            (currentLeague.rosters || []).forEach(r => (r.players || []).concat(r.taxi || [], r.reserve || []).forEach(pid => set.add(String(pid))));
            return set;
        }, [currentLeague]);

        const availablePlayers = useMemo(() => {
            return Object.entries(playersData)
                .filter(([pid, p]) => !rostered.has(pid) && p.team && p.status !== 'Inactive' && p.status !== 'Retired' && p.active !== false)
                .map(([pid, p]) => ({ pid, p, dhq: window.App?.LI?.playerScores?.[pid] || 0, pos: normPos(p.position) || p.position }))
                .sort((a, b) => b.dhq - a.dhq)
                .slice(0, 300);
        }, [playersData, rostered, timeRecomputeTs]);

        const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};

        function faSortIndicator(key) { return faSort.key === key ? (faSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''; }
        function handleFaSort(key) { setFaSort(prev => prev.key === key ? { ...prev, dir: prev.dir * -1 } : { key, dir: -1 }); }

        // Sort filtered results
        const sortedPlayers = useMemo(() => {
            const filtered = availablePlayers.filter(x => !faFilter || (normPos(x.p.position) === faFilter || x.p.position === faFilter));
            return filtered.sort((a, b) => {
                const dir = faSort.dir;
                const k = faSort.key;
                if (k === 'name') {
                    const na = (a.p.full_name || ((a.p.first_name || '') + ' ' + (a.p.last_name || '')).trim()).toLowerCase();
                    const nb = (b.p.full_name || ((b.p.first_name || '') + ' ' + (b.p.last_name || '')).trim()).toLowerCase();
                    return dir * na.localeCompare(nb);
                }
                if (k === 'pos') return dir * ((normPos(a.p.position) || '').localeCompare(normPos(b.p.position) || ''));
                if (k === 'age') return dir * ((a.p.age || 0) - (b.p.age || 0));
                if (k === 'dhq') return dir * (a.dhq - b.dhq);
                if (k === 'ppg') {
                    const sa = statsData[a.pid] || {}; const sb = statsData[b.pid] || {};
                    const pa = sa.gp > 0 ? calcRawPts(sa) / sa.gp : 0;
                    const pb = sb.gp > 0 ? calcRawPts(sb) / sb.gp : 0;
                    return dir * (pa - pb);
                }
                if (k === 'team') return dir * ((a.p.team || '').localeCompare(b.p.team || ''));
                if (k === 'trend') {
                    const ta = window.App?.LI?.playerTrends?.[a.pid] || 0;
                    const tb = window.App?.LI?.playerTrends?.[b.pid] || 0;
                    return dir * (ta - tb);
                }
                if (k === 'peak') {
                    const pa2 = window.App?.LI?.playerPeaks?.[a.pid] || 0;
                    const pb2 = window.App?.LI?.playerPeaks?.[b.pid] || 0;
                    return dir * (pa2 - pb2);
                }
                if (k === 'exp') return dir * ((a.p.years_exp || 0) - (b.p.years_exp || 0));
                if (k === 'injury') return dir * ((a.p.injury_status || '').localeCompare(b.p.injury_status || ''));
                return 0;
            }).slice(0, 50);
        }, [availablePlayers, faFilter, faSort, statsData]);

        const faGridCols = '28px 1fr 36px 32px 54px 42px 42px 42px 36px 42px';
        const faHeaderStyle = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none' };

        // Compute roster needs for recommendations
        const assess = useMemo(() => typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null, [myRoster]);
        const peaks = window.App?.peakWindows || {QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]};
        const budget = currentLeague?.settings?.waiver_budget || myRoster?.settings?.waiver_budget || 0;
        const spent = myRoster?.settings?.waiver_budget_used || 0;
        const remaining = Math.max(0, budget - spent);
        const hasFAAB = budget > 0;
        const faabMinBid = currentLeague?.settings?.waiver_budget_min ?? 0;

        // Smart FAAB recommendation
        function faabSuggest(dhq, pos) {
            if (!hasFAAB || dhq <= 0) return null;
            const floor = faabMinBid || 1;
            const base = Math.round(dhq / 250);
            const cap = Math.round(remaining * 0.15);
            const sug = Math.max(floor, Math.min(cap, base));
            const lo = Math.max(floor, Math.round(sug * 0.7));
            const hi = Math.min(remaining, Math.round(sug * 1.4));
            // Competition: count teams with deficit at this position
            let competitors = 0;
            if (assess && currentLeague.rosters) {
                const reqCount = (currentLeague.roster_positions || []).filter(s => normPos(s) === pos || s === 'FLEX' || s === 'SUPER_FLEX').length;
                currentLeague.rosters.forEach(r => {
                    if (r.roster_id === myRoster?.roster_id) return;
                    const cnt = (r.players || []).filter(pid => normPos(playersData[pid]?.position) === pos).length;
                    if (cnt < reqCount) competitors++;
                });
            }
            const conf = competitors <= 1 ? 'Low competition' : competitors <= 3 ? 'Moderate' : 'High demand';
            const confCol = competitors <= 1 ? '#2ECC71' : competitors <= 3 ? '#F0A500' : '#E74C3C';
            return { sug, lo, hi, conf, confCol, competitors };
        }

        // Top recommendations at weak positions
        const recommendations = useMemo(() => {
            if (!assess?.needs?.length) return [];
            const needPositions = assess.needs.slice(0, 3).map(n => n.pos);
            return availablePlayers
                .filter(x => needPositions.includes(x.pos) && x.dhq > 500)
                .slice(0, 8)
                .map(x => {
                    const st = statsData[x.pid] || {};
                    const ppg = st.gp > 0 ? +(calcRawPts(st) / st.gp).toFixed(1) : 0;
                    const need = assess.needs.find(n => n.pos === x.pos);
                    const [, pHi] = peaks[x.pos] || [24, 29];
                    const peakYrs = Math.max(0, pHi - (x.p.age || 25));
                    const faab = faabSuggest(x.dhq, x.pos);
                    return { ...x, ppg, need, peakYrs, faab };
                });
        }, [availablePlayers, assess, statsData]);

        // Selected player detail
        const selPlayer = faSelectedPid ? playersData[faSelectedPid] : null;
        const selStats = faSelectedPid ? statsData[faSelectedPid] || {} : {};
        const selPrevStats = faSelectedPid ? (prevStatsData || {})[faSelectedPid] || {} : {};
        const selDhq = faSelectedPid ? (window.App?.LI?.playerScores?.[faSelectedPid] || 0) : 0;
        const selMeta = faSelectedPid ? (window.App?.LI?.playerMeta?.[faSelectedPid] || {}) : {};
        const selPpg = selStats.gp > 0 ? +(calcRawPts(selStats) / selStats.gp).toFixed(1) : (selPrevStats.gp > 0 ? +(calcRawPts(selPrevStats) / selPrevStats.gp).toFixed(1) : 0);
        const selPos = selPlayer ? normPos(selPlayer.position) : '';
        const selPeaks = peaks[selPos] || [24,29];
        const selPeakYrs = selPlayer ? Math.max(0, selPeaks[1] - (selPlayer.age || 25)) : 0;
        const selFaab = faSelectedPid ? faabSuggest(selDhq, selPos) : null;
        const selInitials = selPlayer ? ((selPlayer.first_name||'?')[0] + (selPlayer.last_name||'?')[0]).toUpperCase() : '';

        // ── COMMAND VIEW: FAAB decision engine ──
        if (viewMode === 'command') {
            if (!canAccess('fa-decision-engine')) {
                return React.createElement(UpgradeGate, {
                    feature: 'fa-decision-engine',
                    title: 'UNLOCK WAIVER INTELLIGENCE',
                    description: 'Get FAAB bid recommendations with confidence levels, tiered targets ranked by roster impact, and market pressure analysis. Know exactly who to bid on and how much.',
                    targetTier: 'warroom'
                });
            }
            // Categorize recommendations into tiers
            const mustAdd = recommendations.filter(r => r.need?.urgency === 'deficit' && r.dhq >= 800).slice(0, 3);
            const strongBuys = recommendations.filter(r => r.need && !mustAdd.find(m => m.pid === r.pid) && r.dhq >= 500).slice(0, 4);
            const valuePlays = availablePlayers.filter(x => x.dhq >= 400 && x.dhq < 2000 && (x.p.age || 30) <= 25).slice(0, 4).map(x => {
                const st2 = statsData[x.pid] || {};
                const ppg2 = st2.gp > 0 ? +(calcRawPts(st2) / st2.gp).toFixed(1) : 0;
                const fb = faabSuggest(x.dhq, x.pos);
                return { ...x, ppg: ppg2, faab: fb };
            });

            // Market pressure
            const needCount = assess?.needs?.length || 0;
            const competitorCount = recommendations.reduce((s, r) => s + (r.faab?.competitors || 0), 0);
            const pressure = competitorCount > needCount * 3 ? 'HIGH' : competitorCount > needCount ? 'MODERATE' : 'LOW';
            const pressureCol = pressure === 'HIGH' ? '#E74C3C' : pressure === 'MODERATE' ? '#F0A500' : '#2ECC71';

            // Recommended total spend
            const recSpend = recommendations.slice(0, 3).reduce((s, r) => s + (r.faab?.sug || 0), 0);

            let _mustAddIdx = 0;
            const renderFaCard = (r, tier, tierCol) => {
                const isMustFirst = tier === 'must' && _mustAddIdx++ === 0;
                return (
                <div key={r.pid} className={isMustFirst ? 'wr-pulse-gold' : undefined} onClick={() => { if (typeof window.openFWPlayerModal === 'function') { window.openFWPlayerModal(r.pid, playersData, statsData, currentLeague?.scoring_settings); } else { setFaSelectedPid(r.pid); } }} style={{ background: faSelectedPid === r.pid ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (faSelectedPid === r.pid ? 'var(--gold)' : 'rgba(212,175,55,0.15)'), borderLeft: '3px solid ' + tierCol, borderRadius: '8px', padding: '12px', cursor: 'pointer', transition: 'background 0.12s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)' }}>{r.p?.full_name || 'Unknown'}</span>
                        <span style={{ fontSize: '0.74rem', color: posColors[r.pos] || 'var(--silver)', fontWeight: 700 }}>{r.pos}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'Oswald', fontSize: '0.88rem', fontWeight: 700, color: 'var(--gold)' }}>{r.dhq?.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                        {r.ppg > 0 && <span style={{ color: 'var(--silver)' }}>{r.ppg} PPG</span>}
                        <span style={{ color: '#2ECC71' }}>{r.peakYrs}yr peak</span>
                        {r.need && <span style={{ color: '#E74C3C', fontWeight: 700 }}>fills {r.need.pos} {r.need.urgency}</span>}
                        {r.faab && <span style={{ fontWeight: 700, color: 'var(--gold)', background: 'rgba(212,175,55,0.1)', padding: '1px 6px', borderRadius: '3px' }}>{'$' + r.faab.lo + '-' + r.faab.hi}</span>}
                        {r.faab && <span style={{ color: r.faab.confCol, fontSize: '0.72rem' }}>{r.faab.conf}</span>}
                    </div>
                </div>
            ); };

            return (
                <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }} className="wr-fade-in">
                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.8rem', color: 'var(--gold)', marginBottom: '16px' }}>WAIVER DECISIONS</div>

                    {/* Decision summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: hasFAAB ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                        {hasFAAB && <div className="wr-glass" style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: remaining > budget * 0.5 ? '#2ECC71' : remaining > budget * 0.25 ? '#F0A500' : '#E74C3C' }}>{'$' + remaining}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>FAAB remaining</div>
                            {recSpend > 0 && <div style={{ fontSize: '0.74rem', color: 'var(--gold)', marginTop: '4px' }}>Recommended spend: ${recSpend}</div>}
                        </div>}
                        <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--white)' }}>{assess?.needs?.slice(0, 3).map(n => n.pos).join(', ') || 'None'}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>Priority positions</div>
                        </div>
                        <div style={{ background: 'var(--black)', border: '2px solid ' + pressureCol + '40', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: pressureCol }}>{pressure}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>Market pressure</div>
                        </div>
                    </div>

                    {/* Tiered targets */}
                    <div style={{ display: 'grid', gridTemplateColumns: faSelectedPid ? '1fr 380px' : '1fr', gap: '20px' }}>
                        <div>
                            {mustAdd.length > 0 && <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#E74C3C', letterSpacing: '0.06em', marginBottom: '8px' }}>MUST ADD</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {mustAdd.map(r => renderFaCard(r, 'must', '#E74C3C'))}
                                </div>
                            </div>}

                            {strongBuys.length > 0 && <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#2ECC71', letterSpacing: '0.06em', marginBottom: '8px' }}>STRONG BUYS</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {strongBuys.map(r => renderFaCard(r, 'strong', '#2ECC71'))}
                                </div>
                            </div>}

                            {valuePlays.length > 0 && <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#3498DB', letterSpacing: '0.06em', marginBottom: '8px' }}>VALUE PLAYS</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {valuePlays.map(r => renderFaCard(r, 'value', '#3498DB'))}
                                </div>
                            </div>}

                            {recommendations.length === 0 && <div style={{ color: 'var(--silver)', textAlign: 'center', padding: '2rem', opacity: 0.5 }}>No targets available. Your roster may be well-covered.</div>}

                            <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.4 }}>Switch to Analyst view for full free agent list and filters</div>
                        </div>

                        {/* Inline player detail */}
                        {faSelectedPid && selPlayer && <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '20px', alignSelf: 'start', position: 'sticky', top: '80px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(212,175,55,0.1)', border: '2px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <img src={'https://sleepercdn.com/content/nfl/players/' + faSelectedPid + '.jpg'} style={{ width: '56px', height: '56px', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; e.target.insertAdjacentHTML('afterend','<span style="font-size:18px;font-weight:700;color:var(--gold)">' + selInitials + '</span>'); }} />
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)' }}>{selPlayer.full_name}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{selPos} {'\u00B7'} {selPlayer.team || 'FA'} {'\u00B7'} Age {selPlayer.age || '?'}</div>
                                </div>
                                <button onClick={() => setFaSelectedPid(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--silver)', width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', fontSize: '12px' }}>&times;</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '14px' }}>
                                {[{ val: selDhq > 0 ? selDhq.toLocaleString() : '\u2014', label: 'DHQ', col: selDhq >= 4000 ? '#2ECC71' : 'var(--gold)' },
                                  { val: selPpg || '\u2014', label: 'PPG', col: selPpg >= 10 ? '#2ECC71' : 'var(--silver)' },
                                  { val: selPeakYrs + 'yr', label: 'PEAK', col: selPeakYrs >= 4 ? '#2ECC71' : selPeakYrs >= 1 ? 'var(--gold)' : '#E74C3C' }
                                ].map((s, i) => <div key={i} style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', color: s.col }}>{s.val}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>{s.label}</div>
                                </div>)}
                            </div>
                            {selFaab && <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '4px' }}>BID RECOMMENDATION</div>
                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--gold)' }}>{'$' + selFaab.lo + ' \u2013 $' + selFaab.hi}</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--silver)', marginTop: '2px' }}>Suggested: <strong style={{ color: 'var(--white)' }}>{'$' + selFaab.sug}</strong></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: selFaab.confCol }} />
                                    <span style={{ fontSize: '0.74rem', color: selFaab.confCol }}>{selFaab.conf} ({selFaab.competitors} team{selFaab.competitors !== 1 ? 's' : ''} competing)</span>
                                </div>
                            </div>}
                            {assess && (() => {
                                const need2 = assess.needs?.find(n => n.pos === selPos);
                                return <div style={{ fontSize: '0.82rem', color: 'var(--silver)', lineHeight: 1.6, marginBottom: '12px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                                    {need2 ? <span><strong style={{ color: '#2ECC71' }}>Fills {selPos} {need2.urgency}.</strong> </span> : <span style={{ opacity: 0.5 }}>Depth add at {selPos}. </span>}
                                    {selPeakYrs >= 4 ? 'Long dynasty window.' : selPeakYrs >= 1 ? 'In production window.' : 'Past peak — short-term only.'}
                                </div>;
                            })()}
                            <button onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(faSelectedPid); }} style={{ width: '100%', padding: '8px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.9rem', cursor: 'pointer' }}>FULL PLAYER CARD</button>
                        </div>}
                    </div>

                    {/* ── RECOMMENDED MOVES — drop-for-add pairs ── */}
                    {(() => {
                        const drops = (myRoster?.players || [])
                            .filter(pid => !(myRoster.starters || []).includes(pid))
                            .map(pid => ({ pid, p: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0, pos: normPos(playersData[pid]?.position) }))
                            .filter(d => d.p && d.dhq < 2000)
                            .sort((a, b) => a.dhq - b.dhq).slice(0, 5);
                        const pairs = [];
                        drops.forEach(drop => {
                            const upgrade = availablePlayers.find(a => a.pos === drop.pos && a.dhq > drop.dhq + 500 && !pairs.some(p => p.add.pid === a.pid));
                            if (upgrade) {
                                const addFaab = faabSuggest(upgrade.dhq, upgrade.pos);
                                pairs.push({ drop, add: upgrade, faab: addFaab, gain: upgrade.dhq - drop.dhq });
                            }
                        });
                        if (!pairs.length) return null;
                        return React.createElement('div', { style: { marginTop: '20px' } },
                            React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#2ECC71', letterSpacing: '0.06em', marginBottom: '4px' } }, 'RECOMMENDED MOVES'),
                            React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'Drop + add pairs that upgrade your roster'),
                            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                                ...pairs.slice(0, 4).map((pair, i) =>
                                    React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(46,204,113,0.04)', border: '1px solid rgba(46,204,113,0.15)', borderRadius: '8px' } },
                                        React.createElement('div', { style: { flex: 1 } },
                                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' } },
                                                React.createElement('span', { style: { fontSize: '0.78rem', color: '#E74C3C', fontWeight: 700 } }, '\u2212 ' + (pair.drop.p.full_name || 'Unknown')),
                                                React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, pair.drop.pos + ' \u00B7 ' + pair.drop.dhq.toLocaleString() + ' DHQ')
                                            ),
                                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                                                React.createElement('span', { style: { fontSize: '0.78rem', color: '#2ECC71', fontWeight: 700 } }, '+ ' + (pair.add.p.full_name || 'Unknown')),
                                                React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, pair.add.pos + ' \u00B7 ' + pair.add.dhq.toLocaleString() + ' DHQ')
                                            )
                                        ),
                                        React.createElement('div', { style: { textAlign: 'right', flexShrink: 0 } },
                                            React.createElement('div', { style: { fontSize: '0.88rem', fontWeight: 800, fontFamily: 'Oswald', color: '#2ECC71' } }, '+' + pair.gain.toLocaleString()),
                                            pair.faab && React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--gold)' } }, '$' + pair.faab.lo + '-' + pair.faab.hi)
                                        )
                                    )
                                )
                            )
                        );
                    })()}

                    {/* ── DROP CANDIDATES — lowest-value rostered players ── */}
                    {myRoster?.players?.length > 0 && (() => {
                        const dropCandidates = (myRoster.players || [])
                            .map(pid => {
                                const p = playersData[pid];
                                if (!p) return null;
                                const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                                const pos = normPos(p.position) || p.position;
                                const meta = window.App?.LI?.playerMeta?.[pid];
                                const peakYrs = meta?.peakYrsLeft || 0;
                                const isStarter = (myRoster.starters || []).includes(pid);
                                if (isStarter) return null;
                                return { pid, p, dhq, pos, peakYrs, name: p.full_name || 'Unknown', age: p.age || 0 };
                            })
                            .filter(Boolean)
                            .sort((a, b) => a.dhq - b.dhq)
                            .slice(0, 5);
                        if (!dropCandidates.length) return null;
                        return React.createElement('div', { style: { marginTop: '20px' } },
                            React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#E74C3C', letterSpacing: '0.06em', marginBottom: '8px' } }, 'DROP CANDIDATES'),
                            React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'Lowest-value bench players — cut to make room for upgrades'),
                            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                                ...dropCandidates.map(d =>
                                    React.createElement('div', { key: d.pid, onClick: () => { if (window._wrSelectPlayer) window._wrSelectPlayer(d.pid); }, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'rgba(231,76,60,0.04)', border: '1px solid rgba(231,76,60,0.15)', borderRadius: '8px', cursor: 'pointer' } },
                                        React.createElement('img', { src: 'https://sleepercdn.com/content/nfl/players/' + d.pid + '.jpg', style: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }, onError: e => { e.target.style.display = 'none'; } }),
                                        React.createElement('div', { style: { flex: 1 } },
                                            React.createElement('div', { style: { fontSize: '0.84rem', fontWeight: 600, color: 'var(--white)' } }, d.name),
                                            React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, d.pos + ' \u00B7 ' + (d.p.team || 'FA') + ' \u00B7 Age ' + (d.age || '?'))
                                        ),
                                        React.createElement('div', { style: { textAlign: 'right' } },
                                            React.createElement('div', { style: { fontSize: '0.88rem', fontWeight: 800, fontFamily: 'Oswald', color: d.dhq > 0 ? 'var(--silver)' : '#E74C3C' } }, d.dhq > 0 ? d.dhq.toLocaleString() : 'No value'),
                                            React.createElement('div', { style: { fontSize: '0.68rem', color: d.peakYrs <= 0 ? '#E74C3C' : 'var(--silver)' } }, d.peakYrs > 0 ? d.peakYrs + 'yr peak' : 'Past peak')
                                        )
                                    )
                                )
                            )
                        );
                    })()}

                    {/* ── LEAGUE FAAB TRACKER ── */}
                    {hasFAAB && React.createElement('div', { style: { marginTop: '20px' } },
                        React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '4px' } }, 'LEAGUE FAAB TRACKER'),
                        React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'See who can outbid you \u2014 and who\u2019s tapped out'),
                        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' } },
                            ...(currentLeague.rosters || []).map(r => {
                                const user = (currentLeague.users || []).find(u => u.user_id === r.owner_id);
                                const name = user?.display_name || user?.username || ('Team ' + r.roster_id);
                                const rBudget = currentLeague?.settings?.waiver_budget || 0;
                                const rSpent = r.settings?.waiver_budget_used || 0;
                                const rRemaining = Math.max(0, rBudget - rSpent);
                                const pct = rBudget > 0 ? Math.round(rRemaining / rBudget * 100) : 0;
                                const col = pct > 50 ? '#2ECC71' : pct > 25 ? '#F0A500' : '#E74C3C';
                                const isMe = r.roster_id === myRoster?.roster_id;
                                return React.createElement('div', { key: r.roster_id, style: { background: isMe ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isMe ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: '8px', padding: '8px 10px' } },
                                    React.createElement('div', { style: { fontSize: '0.76rem', fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' } }, name + (isMe ? ' (you)' : '')),
                                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                                        React.createElement('div', { style: { flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' } },
                                            React.createElement('div', { style: { height: '100%', width: pct + '%', background: col, borderRadius: '3px' } })
                                        ),
                                        React.createElement('span', { style: { fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Oswald', color: col, minWidth: '32px', textAlign: 'right' } }, '$' + rRemaining)
                                    )
                                );
                            }).sort((a, b) => {
                                const aMe = a.key === myRoster?.roster_id;
                                return aMe ? -1 : 0;
                            })
                        )
                    )}

                    {/* ── ROSTER CHURN ALERTS ── */}
                    {(() => {
                        const recentDrops = [];
                        const transactions = window.S?.transactions || {};
                        const curWeek = window.S?.currentWeek || 1;
                        for (let w = curWeek; w >= Math.max(1, curWeek - 2); w--) {
                            (transactions['w' + w] || []).forEach(t => {
                                if (t.type !== 'free_agent' && t.type !== 'waiver') return;
                                Object.keys(t.drops || {}).forEach(pid => {
                                    const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                                    if (dhq >= 1500) {
                                        const dropper = (currentLeague.users || []).find(u => {
                                            const r = (currentLeague.rosters || []).find(r2 => t.roster_ids?.includes(r2.roster_id) && r2.owner_id === u.user_id);
                                            return !!r;
                                        });
                                        recentDrops.push({ pid, dhq, name: playersData[pid]?.full_name || 'Unknown', pos: normPos(playersData[pid]?.position), week: w, droppedBy: dropper?.display_name || 'Unknown' });
                                    }
                                });
                            });
                        }
                        if (!recentDrops.length) return null;
                        return React.createElement('div', { style: { marginTop: '20px' } },
                            React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: '#F0A500', letterSpacing: '0.06em', marginBottom: '4px' } }, 'ROSTER CHURN ALERTS'),
                            React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'Startable players dropped in the last 2 weeks'),
                            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                                ...recentDrops.slice(0, 6).map(d =>
                                    React.createElement('div', { key: d.pid, onClick: () => { if (window._wrSelectPlayer) window._wrSelectPlayer(d.pid); }, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'rgba(240,165,0,0.04)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: '8px', cursor: 'pointer' } },
                                        React.createElement('div', { style: { flex: 1 } },
                                            React.createElement('div', { style: { fontSize: '0.84rem', fontWeight: 600, color: 'var(--white)' } }, d.name),
                                            React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, d.pos + ' \u00B7 DHQ ' + d.dhq.toLocaleString() + ' \u00B7 Dropped by ' + d.droppedBy + ' \u00B7 Week ' + d.week)
                                        ),
                                        React.createElement('span', { style: { fontSize: '0.78rem', fontWeight: 700, color: '#F0A500' } }, 'GRAB')
                                    )
                                )
                            )
                        );
                    })()}

                    {/* ── BIDDING STRATEGY ── */}
                    {hasFAAB && recommendations.length > 0 && React.createElement('div', { style: { marginTop: '20px' } },
                        React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '4px' } }, 'BIDDING STRATEGY'),
                        React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'Competitor-aware bid recommendations for your top targets'),
                        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                            ...recommendations.slice(0, 4).map(r => {
                                if (!r.faab) return null;
                                let topCompetitor = null;
                                (currentLeague.rosters || []).forEach(ros => {
                                    if (ros.roster_id === myRoster?.roster_id) return;
                                    const cnt = (ros.players || []).filter(pid => normPos(playersData[pid]?.position) === r.pos).length;
                                    const reqCount = (currentLeague.roster_positions || []).filter(s => normPos(s) === r.pos || s === 'FLEX').length;
                                    if (cnt < reqCount) {
                                        const rBudget2 = currentLeague?.settings?.waiver_budget || 0;
                                        const rSpent2 = ros.settings?.waiver_budget_used || 0;
                                        const rRem = Math.max(0, rBudget2 - rSpent2);
                                        const user2 = (currentLeague.users || []).find(u => u.user_id === ros.owner_id);
                                        if (!topCompetitor || rRem > topCompetitor.remaining) {
                                            topCompetitor = { name: user2?.display_name || 'Unknown', remaining: rRem, rosterId: ros.roster_id };
                                        }
                                    }
                                });
                                const strategyBid = topCompetitor && topCompetitor.remaining > r.faab.sug ? Math.min(remaining, Math.round(topCompetitor.remaining * 0.6)) : r.faab.sug;
                                const strategy = topCompetitor
                                    ? (topCompetitor.remaining > r.faab.hi ? topCompetitor.name + ' has $' + topCompetitor.remaining + ' and needs ' + r.pos + '. Bid $' + strategyBid + ' to beat them.' : 'Low threat \u2014 bid $' + r.faab.sug + ' (standard)')
                                    : 'No competition \u2014 bid minimum $' + r.faab.lo;
                                return React.createElement('div', { key: r.pid, style: { padding: '10px 14px', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px' } },
                                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' } },
                                        React.createElement('span', { style: { fontSize: '0.84rem', fontWeight: 700, color: 'var(--white)' } }, r.p.full_name || 'Unknown'),
                                        React.createElement('span', { style: { fontSize: '0.88rem', fontWeight: 800, fontFamily: 'Oswald', color: 'var(--gold)' } }, '$' + strategyBid)
                                    ),
                                    React.createElement('div', { style: { fontSize: '0.74rem', color: 'var(--silver)', lineHeight: 1.5 } }, strategy)
                                );
                            }).filter(Boolean)
                        )
                    )}

                    <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.4, marginTop: '16px' }}>Switch to Analyst view for full free agent list and filters</div>
                </div>
            );
        }

        // ── ANALYST VIEW: full market terminal ──
        return (
            <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }} className="wr-fade-in">
                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.8rem', color: 'var(--gold)', marginBottom: '4px', letterSpacing: '0.05em' }}>FREE AGENCY</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '20px' }}>Full market analysis and player evaluation</div>

                {/* ── TOP: FAAB + Position Needs Grid ── */}
                <div style={{ display: 'grid', gridTemplateColumns: hasFAAB ? '200px 1fr' : '1fr', gap: '16px', marginBottom: '24px' }}>
                    {/* FAAB gauge */}
                    {hasFAAB && <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                        {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: Math.round(remaining / Math.max(1, budget) * 100), size: 80, label: 'FAAB' })}
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: remaining > budget * 0.5 ? '#2ECC71' : remaining > budget * 0.25 ? '#F0A500' : '#E74C3C', marginTop: '8px' }}>{'$' + remaining}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>of ${budget} remaining</div>
                    </div>}

                    {/* Position Needs — Enhanced Grid with Rostered Players */}
                    {assess && <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.08em', marginBottom: '10px' }}>ROSTER NEEDS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                            {Object.entries(assess.posAssessment || {}).sort((a,b) => {
                                const ord = {deficit:0, thin:1, ok:2, surplus:3};
                                return (ord[a[1].status]||2) - (ord[b[1].status]||2);
                            }).map(([pos, data]) => {
                                const status = data.status || 'ok';
                                const gradeCol = status === 'surplus' ? '#2ECC71' : status === 'ok' ? 'var(--silver)' : status === 'thin' ? '#F0A500' : '#E74C3C';
                                const grade = status === 'surplus' ? 'A' : status === 'ok' ? 'B' : status === 'thin' ? 'C' : 'D';
                                const myRosterPids = myRoster?.players || [];
                                const playersAtPos = myRosterPids
                                    .filter(pid => normPos(playersData[pid]?.position) === pos)
                                    .map(pid => {
                                        const p = playersData[pid];
                                        const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                                        const [, pHi] = peaks[pos] || [24, 29];
                                        const peakYrs = Math.max(0, pHi - (p?.age || 25));
                                        const abbr = (p?.first_name?.[0] || '?') + '. ' + (p?.last_name || 'Unknown');
                                        return { pid, abbr, dhq, peakYrs };
                                    })
                                    .sort((a, b) => b.dhq - a.dhq);
                                const dhqColor = (v) => v >= 7000 ? '#2ECC71' : v >= 4000 ? '#3498DB' : v >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                                const peakColor = (y) => y >= 4 ? '#2ECC71' : y >= 1 ? 'var(--gold)' : '#E74C3C';
                                return <div key={pos} style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '10px', marginBottom: '0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontFamily: 'Oswald', fontSize: '0.82rem', fontWeight: 700, color: gradeCol }}>{pos}</span>
                                        <span style={{ fontSize: '0.72rem', color: gradeCol, fontWeight: 700 }}>{grade} · {data.nflStarters}/{data.minQuality || data.startingReq}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        {playersAtPos.slice(0, 4).map(pl =>
                                            <div key={pl.pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                                <span style={{ color: 'var(--white)', fontWeight: 500 }}>{pl.abbr}</span>
                                                <span style={{ display: 'flex', gap: '8px' }}>
                                                    <span style={{ color: dhqColor(pl.dhq), fontFamily: 'Oswald', fontWeight: 700 }}>{pl.dhq > 0 ? pl.dhq.toLocaleString() : '\u2014'}</span>
                                                    <span style={{ color: peakColor(pl.peakYrs) }}>{pl.peakYrs}yr</span>
                                                </span>
                                            </div>
                                        )}
                                        {playersAtPos.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.4 }}>No players</div>}
                                    </div>
                                </div>;
                            })}
                        </div>
                    </div>}
                </div>

                {/* ── WAIVER PRIORITY BOARD — full ranked pickup list ── */}
                {React.createElement('div', { style: { marginBottom: '20px' } },
                    React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '4px' } }, 'WAIVER PRIORITY BOARD'),
                    React.createElement('div', { style: { fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' } }, 'All available players ranked by pickup priority'),
                    React.createElement('div', { style: { background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden', maxHeight: '400px', overflowY: 'auto' } },
                        ...availablePlayers.slice(0, 25).map((x, i) => {
                            const st = statsData[x.pid] || {};
                            const ppg = st.gp > 0 ? +(calcRawPts(st) / st.gp).toFixed(1) : 0;
                            const [, pHi2] = peaks[x.pos] || [24, 29];
                            const peakYrs2 = Math.max(0, pHi2 - (x.p.age || 25));
                            const myNeed = assess?.needs?.find(n => n.pos === x.pos);
                            const faab2 = faabSuggest(x.dhq, x.pos);
                            const dhqCol2 = x.dhq >= 7000 ? '#2ECC71' : x.dhq >= 4000 ? '#3498DB' : x.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                            return React.createElement('div', { key: x.pid, onClick: () => { if (window._wrSelectPlayer) window._wrSelectPlayer(x.pid); }, style: { display: 'grid', gridTemplateColumns: '24px 1fr 40px 42px 50px 60px', gap: '6px', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.76rem', alignItems: 'center', background: myNeed ? 'rgba(46,204,113,0.03)' : 'transparent' },
                                onMouseEnter: e => { e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; },
                                onMouseLeave: e => { e.currentTarget.style.background = myNeed ? 'rgba(46,204,113,0.03)' : 'transparent'; }
                            },
                                React.createElement('span', { style: { fontFamily: 'Oswald', color: i < 3 ? 'var(--gold)' : 'var(--silver)' } }, i + 1),
                                React.createElement('div', { style: { overflow: 'hidden' } },
                                    React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, x.p.full_name || 'Unknown'),
                                    React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)' } }, x.pos + ' \u00B7 ' + (x.p.team || 'FA') + (myNeed ? ' \u00B7 fills ' + myNeed.urgency : ''))
                                ),
                                React.createElement('span', { style: { fontWeight: 700, color: posColors[x.pos] || 'var(--silver)' } }, x.pos),
                                React.createElement('span', { style: { color: 'var(--silver)' } }, ppg > 0 ? ppg : '\u2014'),
                                React.createElement('span', { style: { fontWeight: 700, fontFamily: 'Oswald', color: dhqCol2 } }, x.dhq > 0 ? x.dhq.toLocaleString() : '\u2014'),
                                faab2 ? React.createElement('span', { style: { fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem' } }, '$' + faab2.lo + '-' + faab2.hi) : React.createElement('span', null, '\u2014')
                            );
                        })
                    )
                )}

                {/* ── POSITION FILTER + FULL LIST ── */}
                <React.Fragment><div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginRight: '8px' }}>ALL FREE AGENTS</span>
                    {['', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'].map(pos =>
                        <button key={pos} onClick={() => setFaFilter(pos)} style={{ padding: '5px 12px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase', background: faFilter === pos ? 'var(--gold)' : 'rgba(255,255,255,0.04)', color: faFilter === pos ? 'var(--black)' : 'var(--silver)', border: '1px solid ' + (faFilter === pos ? 'var(--gold)' : 'rgba(255,255,255,0.08)'), borderRadius: '4px', cursor: 'pointer' }}>{pos || 'All'}</button>
                    )}
                </div>

                <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 40px 34px 58px 44px 50px 44px', gap: '4px', padding: '8px 12px', background: 'rgba(212,175,55,0.06)', borderBottom: '2px solid rgba(212,175,55,0.2)' }}>
                        <span style={faHeaderStyle}></span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('name')}>Player{faSortIndicator('name')}</span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('pos')}>Pos{faSortIndicator('pos')}</span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('age')}>Age{faSortIndicator('age')}</span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('dhq')}>DHQ{faSortIndicator('dhq')}</span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('ppg')}>PPG{faSortIndicator('ppg')}</span>
                        <span style={faHeaderStyle}>FAAB</span>
                        <span style={faHeaderStyle} onClick={() => handleFaSort('exp')}>Peak{faSortIndicator('exp')}</span>
                    </div>
                    {/* Body */}
                    <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                        {sortedPlayers.map(({ pid, p, dhq }) => {
                            const pos = normPos(p.position) || p.position;
                            const st = statsData[pid] || {};
                            const prevSt = (prevStatsData || {})[pid] || {};
                            const ppg = st.gp > 0 ? +(calcRawPts(st) / st.gp).toFixed(1) : (prevSt.gp > 0 ? +(calcRawPts(prevSt) / prevSt.gp).toFixed(1) : 0);
                            const dhqCol = dhq >= 7000 ? '#2ECC71' : dhq >= 4000 ? '#3498DB' : dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.25)';
                            const faab = faabSuggest(dhq, pos);
                            const meta = window.App?.LI?.playerMeta?.[pid];
                            const [, pHi] = peaks[pos] || [24, 29];
                            const peakYrs = Math.max(0, pHi - (p.age || 25));
                            const peakLabel = peakYrs >= 4 ? 'Rising' : peakYrs >= 1 ? 'Prime' : 'Post';
                            const peakCol = peakYrs >= 4 ? '#2ECC71' : peakYrs >= 1 ? 'var(--gold)' : '#E74C3C';
                            return <div key={pid} onClick={() => setFaSelectedPid(pid)} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 40px 34px 58px 44px 50px 44px', background: faSelectedPid===pid?'rgba(212,175,55,0.08)':'transparent', gap: '4px', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', alignItems: 'center', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <div className={'wr-ring wr-ring-' + pos} style={{ width: '26px', height: '26px', borderRadius: '50%', overflow: 'hidden', background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <img src={'https://sleepercdn.com/content/nfl/players/' + pid + '.jpg'} alt="" style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} onError={e => { e.target.style.display='none'; e.target.insertAdjacentHTML('afterend','<span style="font-size:10px;font-weight:700;color:var(--gold)">' + ((p.first_name||'?')[0] + (p.last_name||'?')[0]).toUpperCase() + '</span>'); }} />
                                </div>
                                <div style={{ overflow: 'hidden' }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.full_name || 'Unknown'}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6 }}>{p.team || 'FA'}{p.injury_status ? ' · ' : ''}{p.injury_status ? <span style={{ color: '#E74C3C' }}>{p.injury_status}</span> : ''}</div>
                                </div>
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{p.age || '\u2014'}</span>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'Oswald', color: dhqCol }}>{dhq > 0 ? dhq.toLocaleString() : '\u2014'}</span>
                                <span style={{ fontSize: '0.78rem', color: ppg >= 10 ? '#2ECC71' : ppg >= 5 ? 'var(--silver)' : 'rgba(255,255,255,0.3)' }}>{ppg > 0 ? ppg : '\u2014'}</span>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--gold)' }}>{faab ? '$' + faab.lo + '-' + faab.hi : '\u2014'}</span>
                                <span style={{ fontSize: '0.74rem', color: peakCol, fontWeight: 600 }}>{peakLabel}</span>
                            </div>;
                        })}
                    </div>
                </div></React.Fragment>

                {/* ── RIGHT: PLAYER DETAIL PANEL ── */}
                {faSelectedPid && selPlayer && <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '380px', background: 'linear-gradient(135deg, var(--off-black), var(--charcoal))', borderLeft: '2px solid var(--gold)', zIndex: 200, overflowY: 'auto', padding: '20px', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}>
                    {/* Close */}
                    <button onClick={() => setFaSelectedPid(null)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(212,175,55,0.3)', color: 'var(--silver)', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>

                    {/* Photo + Name */}
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(212,175,55,0.1)', border: '2px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <img src={'https://sleepercdn.com/content/nfl/players/' + faSelectedPid + '.jpg'} style={{ width: '64px', height: '64px', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; e.target.insertAdjacentHTML('afterend','<span style="font-size:20px;font-weight:700;color:var(--gold)">' + selInitials + '</span>'); }} />
                        </div>
                        <div>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--white)', letterSpacing: '0.02em' }}>{selPlayer.full_name || 'Unknown'}</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--silver)' }}>{selPos} · {selPlayer.team || 'FA'} · Age {selPlayer.age || '?'} · {selPlayer.years_exp ?? 0}yr exp{selPlayer.college ? ' · ' + selPlayer.college : ''}</div>
                        </div>
                    </div>

                    {/* Key Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {[
                            { val: selDhq > 0 ? selDhq.toLocaleString() : '\u2014', label: 'DHQ VALUE', col: selDhq >= 7000 ? '#2ECC71' : selDhq >= 4000 ? '#3498DB' : selDhq >= 2000 ? 'var(--silver)' : 'var(--silver)' },
                            { val: selPpg || '\u2014', label: 'PPG', col: selPpg >= 10 ? '#2ECC71' : selPpg >= 5 ? 'var(--silver)' : 'var(--silver)' },
                            { val: selPeakYrs + 'yr', label: 'PEAK LEFT', col: selPeakYrs >= 4 ? '#2ECC71' : selPeakYrs >= 1 ? 'var(--gold)' : '#E74C3C' },
                        ].map((s, i) => <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: s.col }}>{s.val}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                        </div>)}
                    </div>

                    {/* FAAB Recommendation */}
                    {selFaab && <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                        <div style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>FAAB Recommendation</div>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: 'var(--gold)' }}>{'$' + selFaab.lo + ' \u2013 $' + selFaab.hi}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '4px' }}>Suggested: <strong style={{ color: 'var(--white)' }}>{'$' + selFaab.sug}</strong> of ${remaining} remaining</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selFaab.confCol }} />
                            <span style={{ fontSize: '0.78rem', color: selFaab.confCol, fontWeight: 600 }}>{selFaab.conf}</span>
                            <span style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6 }}>{selFaab.competitors} other team{selFaab.competitors !== 1 ? 's' : ''} need {selPos}</span>
                        </div>
                    </div>}

                    {/* Roster Fit */}
                    {assess && (() => {
                        const need = assess.needs?.find(n => n.pos === selPos);
                        const strength = assess.strengths?.includes(selPos);
                        return <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>ROSTER FIT</div>
                            {need && <div style={{ fontSize: '0.82rem', color: '#2ECC71', fontWeight: 600, marginBottom: '4px' }}>Fills {selPos} {need.urgency}</div>}
                            {strength && <div style={{ fontSize: '0.82rem', color: 'var(--silver)', opacity: 0.7, marginBottom: '4px' }}>You already have {selPos} surplus — stash only</div>}
                            {!need && !strength && <div style={{ fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '4px' }}>Depth add at {selPos}</div>}
                            <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6 }}>
                                {selPeakYrs >= 4 ? 'Long dynasty window — buy low candidate' : selPeakYrs >= 1 ? 'In production window — immediate contributor' : 'Past peak — short-term rental only'}
                            </div>
                        </div>;
                    })()}

                    {/* Season Stats */}
                    {selStats.gp > 0 && <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>SEASON STATS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {[
                                ['Games', selStats.gp],
                                ['Total Pts', selStats.pts_half_ppr ? Math.round(selStats.pts_half_ppr) : Math.round(calcRawPts(selStats))],
                                ['PPG', selPpg],
                                selStats.pass_yd ? ['Pass Yds', Math.round(selStats.pass_yd).toLocaleString()] : selStats.rush_yd ? ['Rush Yds', Math.round(selStats.rush_yd).toLocaleString()] : selStats.rec ? ['Receptions', selStats.rec] : null,
                                selStats.pass_td ? ['Pass TD', selStats.pass_td] : selStats.rush_td ? ['Rush TD', selStats.rush_td] : selStats.rec_td ? ['Rec TD', selStats.rec_td] : null,
                                selStats.rec_yd ? ['Rec Yds', Math.round(selStats.rec_yd).toLocaleString()] : null,
                            ].filter(Boolean).map(([label, val], i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6 }}>{label}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--white)', fontWeight: 600 }}>{val}</span>
                            </div>)}
                        </div>
                    </div>}

                    {/* Physical */}
                    {(selPlayer.height || selPlayer.weight) && <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '16px' }}>
                        {selPlayer.height ? Math.floor(selPlayer.height/12) + "'" + (selPlayer.height%12) + '"' : ''}{selPlayer.weight ? ' · ' + selPlayer.weight + 'lbs' : ''}
                    </div>}

                    {/* Action */}
                    <button onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(faSelectedPid); }} style={{ width: '100%', padding: '10px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontFamily: 'Bebas Neue', fontSize: '1rem', letterSpacing: '0.06em', cursor: 'pointer' }}>FULL PLAYER CARD</button>
                </div>}
            </div>
        );
    }
