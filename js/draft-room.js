// ══════════════════════════════════════════════════════════════════
// draft-room.js — DraftTab component (Command, Big Board, Rankings)
// ══════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    // END FREE AGENCY TAB
    // ══════════════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════════════
    // DRAFT TAB — migrated from draft-warroom.html
    // ══════════════════════════════════════════════════════════════════════════
    function DraftTab({ playersData, statsData, myRoster, currentLeague, sleeperUserId, setReconPanelOpen, sendReconMessage, timeRecomputeTs, viewMode }) {
        const leagueSeason = parseInt(currentLeague.season || new Date().getFullYear());
        const draftRounds = currentLeague.settings?.draft_rounds || 5;
        const tradedPicks = window.S?.tradedPicks || [];
        const [draftSort, setDraftSort] = useState({ key: 'dhq', dir: -1 });
        const [draftView, setDraftView] = useState('command'); // 'command' | 'board' | 'rankings'
        const [boardData, setBoardData] = useState(() => { try { const s = localStorage.getItem('wr_bigboard_' + (currentLeague.id||'')); return s ? JSON.parse(s) : null; } catch(e) { return null; } });
        const [draftedPids, setDraftedPids] = useState(new Set());
        const [boardNotes, setBoardNotes] = useState({});
        const [boardTags, setBoardTags] = useState({}); // pid -> 'target'|'avoid'|'sleeper'|'must'
        const [boardMode, setBoardMode] = useState('dhq'); // 'dhq' | 'my'
        const [myBoardOrder, setMyBoardOrder] = useState([]); // custom ordered pid array
        const [boardPosFilter, setBoardPosFilter] = useState(''); // '' | 'QB' | 'RB' | 'WR' | 'TE' | 'DL' | 'LB' | 'DB'
        const [boardSort, setBoardSort] = useState({ key: 'dhq', dir: -1 }); // sortable columns
        const [expandedDraftPid, setExpandedDraftPid] = useState(null);
        const [dragPid, setDragPid] = useState(null); // currently dragging pid
        const [editingRank, setEditingRank] = useState(null); // pid being rank-edited
        const [rankInput, setRankInput] = useState('');

        function normPos(pos) {
            if (!pos) return null;
            if (['DB','CB','S','SS','FS'].includes(pos)) return 'DB';
            if (['DL','DE','DT','NT','IDL','EDGE'].includes(pos)) return 'DL';
            if (['LB','OLB','ILB','MLB'].includes(pos)) return 'LB';
            return pos;
        }

        // Build my picks
        const myPicks = useMemo(() => {
            const picks = [];
            for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) {
                for (let rd = 1; rd <= draftRounds; rd++) {
                    const tradedAway = tradedPicks.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster?.roster_id && p.owner_id !== myRoster?.roster_id);
                    if (!tradedAway) picks.push({ year: yr, round: rd, own: true });
                    const acquired = tradedPicks.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster?.roster_id && p.roster_id !== myRoster?.roster_id);
                    acquired.forEach(a => picks.push({ year: yr, round: rd, own: false, from: a.roster_id }));
                }
            }
            return picks;
        }, [tradedPicks, myRoster]);

        // Find rookies — fixed filter to handle missing years_exp
        const rookies = useMemo(() => {
            return Object.entries(playersData)
                .filter(([pid, p]) => {
                    const exp = p.years_exp;
                    const isRookie = exp === 0;
                    if (!isRookie) return false;
                    // Must have a real name (not Duplicate, Invalid, DUP, or null placeholder)
                    const name = p.full_name || '';
                    if (!name || /Duplicate|Invalid|DUP/i.test(name)) return false;
                    // Must have a football position (filters out coaches, GMs, etc.)
                    if (!p.position || ['HC','OC','DC','GM'].includes(p.position)) return false;
                    // Must be active status (filters out stale entries from old years)
                    if (p.status === 'Inactive') return false;
                    // Must have DHQ value OR be on an NFL team
                    const hasValue = (window.App?.LI?.playerScores?.[pid] || 0) > 0;
                    // Only include IDP rookies if the league has IDP slots
                    const isIDP = ['DL','DE','DT','NT','IDL','EDGE','LB','OLB','ILB','MLB','DB','CB','S','SS','FS'].includes(p.position);
                    const rp = currentLeague?.roster_positions || [];
                    const leagueHasIDP = rp.some(s => ['DL','DE','DT','LB','DB','CB','S','IDP_FLEX'].includes(s));
                    if (isIDP && !leagueHasIDP) return false;
                    return hasValue || p.team;
                })
                .map(([pid, p]) => ({ pid, p, dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                .sort((a, b) => b.dhq - a.dhq);
        }, [playersData, timeRecomputeTs]);

        const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};

        function draftSortIndicator(key) { return draftSort.key === key ? (draftSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''; }
        function handleDraftSort(key) { setDraftSort(prev => prev.key === key ? { ...prev, dir: prev.dir * -1 } : { key, dir: -1 }); }

        const sortedRookies = useMemo(() => {
            let filtered = rookies.slice();
            if (boardPosFilter) filtered = filtered.filter(r => normPos(r.p.position) === boardPosFilter);
            return filtered.sort((a, b) => {
                const dir = draftSort.dir;
                const k = draftSort.key;
                if (k === 'name') {
                    const na = (a.p.full_name || ((a.p.first_name || '') + ' ' + (a.p.last_name || '')).trim()).toLowerCase();
                    const nb = (b.p.full_name || ((b.p.first_name || '') + ' ' + (b.p.last_name || '')).trim()).toLowerCase();
                    return dir * na.localeCompare(nb);
                }
                if (k === 'pos') return dir * ((normPos(a.p.position) || '').localeCompare(normPos(b.p.position) || ''));
                if (k === 'age') return dir * ((a.p.age || 0) - (b.p.age || 0));
                if (k === 'dhq') return dir * (a.dhq - b.dhq);
                if (k === 'college') return dir * ((a.p.college || a.p.metadata?.college || '').localeCompare(b.p.college || b.p.metadata?.college || ''));
                return 0;
            }).slice(0, 50);
        }, [rookies, draftSort, boardPosFilter]);

        const draftGridCols = '24px 28px 1fr 36px 32px 54px 60px';
        const draftHeaderStyle = { fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none' };

        // Team assessment for fit scoring
        const assess = useMemo(() => typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null, [myRoster, timeRecomputeTs]);

        // Compute fit scores for rookies based on roster needs
        const computeFitScore = useCallback((rookie) => {
            if (!assess || !assess.needs || !assess.needs.length) return { score: 50, label: 'N/A' };
            const pos = normPos(rookie.p.position);
            const needEntry = assess.needs.find(n => n.pos === pos);
            if (!needEntry) return { score: 30, label: 'Low' };
            const urgencyBonus = needEntry.urgency === 'deficit' ? 40 : 20;
            const needIdx = assess.needs.findIndex(n => n.pos === pos);
            const priorityBonus = Math.max(0, 20 - needIdx * 5);
            const raw = Math.min(99, 30 + urgencyBonus + priorityBonus);
            const label = raw >= 80 ? 'Elite' : raw >= 60 ? 'Strong' : raw >= 40 ? 'Moderate' : 'Low';
            return { score: raw, label };
        }, [assess]);

        // Determine active view: global viewMode overrides to 'command' when set
        const activeView = viewMode === 'command' ? 'command' : draftView;

        // Auto-save board data to localStorage on changes
        useEffect(() => {
            try {
                const key = 'wr_bigboard_' + (currentLeague.id || '');
                const data = { tags: boardTags, notes: boardNotes, drafted: Array.from(draftedPids), myOrder: myBoardOrder };
                localStorage.setItem(key, JSON.stringify(data));
            } catch(e) {}
        }, [boardTags, boardNotes, draftedPids, myBoardOrder, currentLeague.id]);

        // Restore board data from localStorage on mount
        useEffect(() => {
            if (boardData) {
                if (boardData.tags) setBoardTags(boardData.tags);
                if (boardData.notes) setBoardNotes(boardData.notes);
                if (boardData.drafted) setDraftedPids(new Set(boardData.drafted));
                if (boardData.myOrder) setMyBoardOrder(boardData.myOrder);
            }
        }, []);

        // Helper: get player display name
        const pName = (p) => p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown';

        // Next pick info
        const nextPick = myPicks.find(pk => pk.year === leagueSeason);

        // Top prospects with fit
        const topProspects = useMemo(() => {
            return rookies.slice(0, 20).map(r => ({ ...r, fit: computeFitScore(r) }));
        }, [rookies, computeFitScore]);

        // Best recommendations for next pick
        const recommendations = useMemo(() => {
            const targetPos = (strategyRec?.type === 'target' && strategyRec?.label) ? strategyRec.label.replace('Target ', '') : null;
            return topProspects
                .filter(r => !draftedPids.has(r.pid))
                .sort((a, b) => {
                    const aComposite = a.dhq * 0.6 + a.fit.score * 80 + (targetPos && a.pos === targetPos ? 2000 : 0);
                    const bComposite = b.dhq * 0.6 + b.fit.score * 80 + (targetPos && b.pos === targetPos ? 2000 : 0);
                    return bComposite - aComposite;
                })
                .slice(0, 3);
        }, [topProspects, draftedPids, strategyRec]);

        // Strategy recommendation
        const strategyRec = useMemo(() => {
            if (!assess || !assess.needs || !assess.needs.length) return { type: 'bpa', label: 'Go BPA', reason: 'No clear positional needs detected.' };
            const critical = assess.needs.filter(n => n.urgency === 'deficit');
            if (critical.length > 0) {
                return { type: 'target', label: 'Target ' + critical[0].pos, reason: critical[0].pos + ' is a critical need (' + critical.length + ' deficit position' + (critical.length > 1 ? 's' : '') + ').' };
            }
            return { type: 'bpa', label: 'Go BPA', reason: 'Needs are thin but not critical. Take the best player available.' };
        }, [assess]);

        // Fit color helper
        const fitColor = (score) => score >= 80 ? '#2ECC71' : score >= 60 ? '#D4AF37' : score >= 40 ? '#3498DB' : 'var(--silver)';

        // Tag button helper
        const tagDefs = { target: { icon: '\u2605', color: '#2ECC71', label: 'Target' }, avoid: { icon: '\u2717', color: '#E74C3C', label: 'Avoid' }, sleeper: { icon: '\u26A1', color: '#3498DB', label: 'Sleeper' }, must: { icon: '\u2B50', color: '#D4AF37', label: 'Must' } };

        // Sub-nav button style
        const navBtn = (view) => ({
            padding: '6px 16px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase',
            letterSpacing: '0.06em', cursor: 'pointer', border: 'none', borderRadius: '4px',
            background: activeView === view ? 'rgba(212,175,55,0.2)' : 'transparent',
            color: activeView === view ? 'var(--gold)' : 'var(--silver)',
            borderBottom: activeView === view ? '2px solid var(--gold)' : '2px solid transparent',
            transition: 'all 0.15s'
        });

        return (
            <div style={{ padding: '16px' }}>
                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.6rem', color: 'var(--gold)', marginBottom: '12px' }}>DRAFT ROOM</div>

                {/* Sub-view navigation */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                    <button style={navBtn('command')} onClick={() => setDraftView('command')}>Command</button>
                    <button style={navBtn('board')} onClick={() => setDraftView('board')}>Big Board</button>
                    <button style={navBtn('rankings')} onClick={() => setDraftView('rankings')}>Rankings</button>
                </div>

                {/* ═══════════════════ VIEW 1: COMMAND ═══════════════════ */}
                {activeView === 'command' && (
                    <div>
                        {/* ON THE CLOCK card */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2ECC71', animation: 'pulse 2s infinite' }} />
                                <span style={{ fontFamily: 'Oswald', fontSize: '0.9rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>On The Clock</span>
                            </div>
                            {nextPick ? (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
                                        <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '2rem', color: 'var(--gold)' }}>R{nextPick.round}</span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{nextPick.year} {nextPick.own ? '' : '(acquired)'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontFamily: 'Oswald' }}>Top Recommendations</div>
                                    {recommendations.map((r, i) => {
                                        const pos = normPos(r.p.position) || r.p.position;
                                        const composite = Math.round(r.dhq * 0.6 + r.fit.score * 80);
                                        const confidence = Math.min(99, Math.round((composite / (rookies[0]?.dhq * 0.6 + 99 * 80 || 1)) * 100));
                                        const needMatch = assess?.needs?.find(n => n.pos === pos);
                                        const reason = needMatch ? (needMatch.urgency === 'deficit' ? 'Fills critical ' + pos + ' need' : 'Addresses ' + pos + ' depth') : 'Best player available at ' + pos;
                                        return (
                                            <div key={r.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(r.pid); }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', marginBottom: '4px', borderRadius: '6px', background: i === 0 ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)', border: i === 0 ? '1px solid rgba(212,175,55,0.2)' : '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.1s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)'}>
                                                <span style={{ fontFamily: 'Oswald', fontSize: '1.1rem', color: 'var(--gold)', width: '20px' }}>{i + 1}</span>
                                                <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + r.pid + '.jpg'} alt="" onError={e => e.target.style.display='none'} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--white)' }}>{pName(r.p)}</div>
                                                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>{reason}</div>
                                                </div>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)', padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>{pos}</span>
                                                <div style={{ textAlign: 'right', minWidth: '48px' }}>
                                                    <div style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.82rem', color: fitColor(r.fit.score) }}>{confidence}%</div>
                                                    <div style={{ fontSize: '0.6rem', color: 'var(--silver)' }}>conf</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>No picks available for {leagueSeason}</div>
                            )}
                        </div>

                        {/* Draft Strategy card */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Draft Strategy</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.3rem', color: strategyRec.type === 'target' ? '#F0A500' : '#2ECC71' }}>{strategyRec.label}</span>
                                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: strategyRec.type === 'target' ? 'rgba(240,165,0,0.15)' : 'rgba(46,204,113,0.15)', color: strategyRec.type === 'target' ? '#F0A500' : '#2ECC71', fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                                    {strategyRec.type === 'target' ? 'Position Target' : 'Best Player Available'}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.6 }}>{strategyRec.reason}</div>
                            {assess?.needs?.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                                    {assess.needs.slice(0, 5).map(n => (
                                        <span key={n.pos} style={{ padding: '2px 8px', fontSize: '0.68rem', borderRadius: '10px', fontFamily: 'Oswald', background: n.urgency === 'deficit' ? 'rgba(231,76,60,0.15)' : 'rgba(240,165,0,0.12)', color: n.urgency === 'deficit' ? '#E74C3C' : '#F0A500', border: '1px solid ' + (n.urgency === 'deficit' ? 'rgba(231,76,60,0.3)' : 'rgba(240,165,0,0.25)') }}>
                                            {n.pos} {n.urgency === 'deficit' ? 'CRITICAL' : 'THIN'}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Tier 1 Prospects */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '14px 16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Tier 1 Prospects</div>
                            {topProspects.slice(0, 5).map((r, idx) => {
                                const pos = normPos(r.p.position) || r.p.position;
                                const dhqCol = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : 'var(--silver)';
                                return (
                                    <div key={r.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(r.pid); }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', transition: 'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <span style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--silver)', width: '18px' }}>{idx + 1}</span>
                                        <img className={(() => { const pk = {QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]}; const [pL,pH] = pk[pos]||[24,29]; const a = r.p.age||21; return a < pL ? 'wr-ring wr-ring-pre' : a <= pH ? 'wr-ring wr-ring-prime' : 'wr-ring wr-ring-post'; })()} src={'https://sleepercdn.com/content/nfl/players/thumb/' + r.pid + '.jpg'} alt="" onError={e => e.target.style.display='none'} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--white)' }}>{pName(r.p)}</span>
                                        </div>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                        <span style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.76rem', color: dhqCol, minWidth: '42px', textAlign: 'right' }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: fitColor(r.fit.score), padding: '1px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', minWidth: '48px', textAlign: 'center' }}>
                                            Fit: {r.fit.score}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ═══════════════════ VIEW 2: BIG BOARD ═══════════════════ */}
                {activeView === 'board' && (() => {
                    // Initialize My Board order if empty
                    const initMyBoard = () => { if (myBoardOrder.length === 0) setMyBoardOrder(rookies.map(r => r.pid)); };

                    // DHQ board: always sorted by DHQ from engine (never affected by My Board)
                    let dhqBoardPlayers = [...rookies];
                    if (boardPosFilter) dhqBoardPlayers = dhqBoardPlayers.filter(r => normPos(r.p.position) === boardPosFilter);
                    if (boardSort.key) {
                        dhqBoardPlayers.sort((a, b) => {
                            let va, vb;
                            const k = boardSort.key;
                            if (k === 'dhq') { va = a.dhq; vb = b.dhq; }
                            else if (k === 'name') { va = (a.p.full_name || '').toLowerCase(); vb = (b.p.full_name || '').toLowerCase(); }
                            else if (k === 'pos') { va = normPos(a.p.position) || ''; vb = normPos(b.p.position) || ''; }
                            else if (k === 'age') { va = a.p.age || (a.p.birth_date ? Math.floor((Date.now() - new Date(a.p.birth_date).getTime()) / 31557600000) : 99); vb = b.p.age || (b.p.birth_date ? Math.floor((Date.now() - new Date(b.p.birth_date).getTime()) / 31557600000) : 99); }
                            else if (k === 'fit') { va = computeFitScore(a).score; vb = computeFitScore(b).score; }
                            else if (k === 'school') { va = (a.p.college || '').toLowerCase(); vb = (b.p.college || '').toLowerCase(); }
                            else { va = 0; vb = 0; }
                            if (typeof va === 'string') return va < vb ? -boardSort.dir : va > vb ? boardSort.dir : 0;
                            return ((va || 0) - (vb || 0)) * boardSort.dir;
                        });
                    }

                    // Drag handlers
                    const handleDragStart = (pid) => setDragPid(pid);
                    const handleDragOver = (e) => e.preventDefault();
                    const handleDrop = (targetPid) => {
                        if (!dragPid || dragPid === targetPid) return;
                        setMyBoardOrder(prev => {
                            const order = prev.length ? [...prev] : rookies.map(r => r.pid);
                            const fromIdx = order.indexOf(dragPid);
                            const toIdx = order.indexOf(targetPid);
                            if (fromIdx === -1 || toIdx === -1) return order;
                            order.splice(fromIdx, 1);
                            order.splice(toIdx, 0, dragPid);
                            return order;
                        });
                        setDragPid(null);
                        if (boardMode !== 'my') setBoardMode('my');
                    };
                    const handleRankSubmit = (pid) => {
                        const newRank = parseInt(rankInput);
                        if (!newRank || newRank < 1) { setEditingRank(null); return; }
                        setMyBoardOrder(prev => {
                            const order = prev.length ? [...prev] : rookies.map(r => r.pid);
                            const fromIdx = order.indexOf(pid);
                            if (fromIdx === -1) return order;
                            order.splice(fromIdx, 1);
                            order.splice(Math.min(newRank - 1, order.length), 0, pid);
                            return order;
                        });
                        setEditingRank(null);
                        setRankInput('');
                        if (boardMode !== 'my') setBoardMode('my');
                    };

                    // Build My Board players list
                    initMyBoard();
                    const myOrder = myBoardOrder.length ? myBoardOrder : rookies.map(r => r.pid);
                    let myBoardPlayers = myOrder.map(pid => rookies.find(r => r.pid === pid)).filter(Boolean);
                    const inOrder = new Set(myOrder);
                    rookies.forEach(r => { if (!inOrder.has(r.pid)) myBoardPlayers.push(r); });
                    if (boardPosFilter) myBoardPlayers = myBoardPlayers.filter(r => normPos(r.p.position) === boardPosFilter);

                    // Compact board renderer (used for both sides)
                    const renderCompactBoard = (players, isDhq) => (
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', overflow: 'hidden', maxHeight: '600px', overflowY: 'auto' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', height: '32px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
                                <div style={{ width: '24px', flexShrink: 0, textAlign: 'center' }}>#</div>
                                <div style={{ flex: 1, padding: '0 4px', minWidth: 0 }}>Player</div>
                                <div style={{ width: '30px', flexShrink: 0, textAlign: 'center' }}>Pos</div>
                                <div style={{ width: '28px', flexShrink: 0, textAlign: 'center' }}>Age</div>
                                <div style={{ width: '46px', flexShrink: 0, textAlign: 'right' }}>DHQ</div>
                                <div style={{ width: '60px', flexShrink: 0, padding: '0 4px', overflow: 'hidden' }}>School</div>
                                <div style={{ width: '20px', flexShrink: 0 }}></div>
                                {!isDhq && <div style={{ width: '28px', flexShrink: 0 }}></div>}
                            </div>
                            {players.map((r, idx) => {
                                const pos = normPos(r.p.position) || r.p.position;
                                const dhqC = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                                const isDrafted = draftedPids.has(r.pid);
                                const tag = boardTags[r.pid];
                                const isExp = expandedDraftPid === r.pid;
                                const age = r.p.age || (r.p.birth_date ? Math.floor((Date.now() - new Date(r.p.birth_date).getTime()) / 31557600000) : null);
                                const college = r.p.college || r.p.metadata?.college || '';
                                return (
                                    <React.Fragment key={r.pid}>
                                    <div
                                        draggable={!isDhq}
                                        onDragStart={!isDhq ? () => handleDragStart(r.pid) : undefined}
                                        onDragOver={!isDhq ? handleDragOver : undefined}
                                        onDrop={!isDhq ? () => handleDrop(r.pid) : undefined}
                                        onClick={() => setExpandedDraftPid(prev => prev === r.pid ? null : r.pid)}
                                        style={{ display: 'flex', alignItems: 'center', height: '34px', opacity: isDrafted ? 0.3 : 1, borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', background: isExp ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent', transition: 'background 0.1s', position: 'relative' }}
                                        onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
                                        onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = isExp ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'; }}>
                                        <div style={{ width: '24px', flexShrink: 0, textAlign: 'center', fontFamily: 'Oswald', fontSize: '0.7rem', color: idx < 3 ? 'var(--gold)' : 'var(--silver)' }}>{idx + 1}</div>
                                        <div className={(() => { const pk = {QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]}; const [pL,pH] = pk[pos]||[24,29]; return age < pL ? 'wr-ring wr-ring-pre' : age <= pH ? 'wr-ring wr-ring-prime' : 'wr-ring wr-ring-post'; })()} style={{ width: '20px', height: '20px', flexShrink: 0, marginRight: '4px' }}>
                                            <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + r.pid + '.jpg'} alt="" onError={e => e.target.style.display='none'} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }} />
                                        </div>
                                        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.74rem', color: 'var(--white)', textDecoration: isDrafted ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pName(r.p)}</div>
                                        </div>
                                        <div style={{ width: '30px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)', padding: '1px 4px', background: (posColors[pos] || '#666') + '22', borderRadius: '3px' }}>{pos}</span>
                                        </div>
                                        <div style={{ width: '28px', flexShrink: 0, textAlign: 'center', fontSize: '0.7rem', color: 'var(--silver)' }}>{age || '\u2014'}</div>
                                        <div style={{ width: '46px', flexShrink: 0, textAlign: 'right', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.7rem', color: dhqC }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</div>
                                        <div style={{ width: '60px', flexShrink: 0, padding: '0 4px', overflow: 'hidden' }}>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{college || '\u2014'}</div>
                                        </div>
                                        <div style={{ width: '20px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                            {tag ? <span style={{ fontSize: '0.7rem', color: tagDefs[tag].color }} title={tagDefs[tag].label}>{tagDefs[tag].icon}</span> : null}
                                        </div>
                                        {!isDhq && (
                                            <div style={{ width: '28px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                                <button onClick={e => { e.stopPropagation(); setDraftedPids(prev => { const n = new Set(prev); if (n.has(r.pid)) n.delete(r.pid); else n.add(r.pid); return n; }); }}
                                                    style={{ fontSize: '0.56rem', padding: '1px 4px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', cursor: 'pointer', background: isDrafted ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.04)', color: isDrafted ? '#E74C3C' : 'var(--silver)', fontFamily: 'Oswald' }}>
                                                    {isDrafted ? '\u21A9' : 'X'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    </React.Fragment>
                                );
                            })}
                            {players.length === 0 && <div style={{ padding: '12px', textAlign: 'center', color: 'var(--silver)', opacity: 0.5, fontSize: '0.76rem' }}>No players match filter</div>}
                        </div>
                    );

                    return (
                    <div>
                        {/* Position filters */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button onClick={() => setBoardPosFilter('')} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (!boardPosFilter ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'), background: !boardPosFilter ? 'rgba(212,175,55,0.12)' : 'transparent', color: !boardPosFilter ? 'var(--gold)' : 'var(--silver)' }}>Master</button>
                            {['QB','RB','WR','TE','DL','LB','DB'].map(pos => (
                                <button key={pos} onClick={() => setBoardPosFilter(boardPosFilter === pos ? '' : pos)} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (boardPosFilter === pos ? (posColors[pos] || '#666') + '55' : 'rgba(255,255,255,0.08)'), background: boardPosFilter === pos ? (posColors[pos] || '#666') + '18' : 'transparent', color: boardPosFilter === pos ? posColors[pos] : 'var(--silver)' }}>{pos}</button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.4 }}>Click row to expand {'\u00B7'} Drag to reorder My Board</span>
                        </div>

                        {/* Expanded player card — full width ABOVE boards */}
                        {expandedDraftPid && (() => {
                            const r = rookies.find(rk => rk.pid === expandedDraftPid);
                            if (!r) return null;
                            const pos = normPos(r.p.position) || r.p.position;
                            const dhqColVal = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                            const fit = computeFitScore(r);
                            const note = boardNotes[r.pid] || '';
                            const tag = boardTags[r.pid];
                            const age = r.p.age || (r.p.birth_date ? Math.floor((Date.now() - new Date(r.p.birth_date).getTime()) / 31557600000) : r.p.years_exp === 0 ? 21 : '\u2014');
                            const college = r.p.college || r.p.metadata?.college || '';
                            return (
                                <div style={{ border: '2px solid rgba(212,175,55,0.25)', borderRadius: '10px', background: 'linear-gradient(135deg, rgba(212,175,55,0.04), rgba(0,0,0,0.3))', padding: '16px 20px', marginBottom: '14px', animation: 'wrFadeIn 0.2s ease' }}>
                                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                                    <div style={{ flexShrink: 0, position: 'relative' }}>
                                      <img className={(() => { const pk = {QB:[23,39],RB:[21,31],WR:[21,33],TE:[21,34],DL:[26,33],LB:[26,32],DB:[21,34]}; const [pL,pH] = pk[pos]||[24,29]; return typeof age === 'number' && age < pL ? 'wr-ring wr-ring-pre' : typeof age === 'number' && age <= pH ? 'wr-ring wr-ring-prime' : 'wr-ring wr-ring-post'; })()} src={'https://sleepercdn.com/content/nfl/players/'+r.pid+'.jpg'} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                                      <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                                      <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[pos]||'#666')+'25', color: posColors[pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{pos}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || pName(r.p)}</div>
                                      <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                                        {pos} {'\u00B7'} {r.p.team || 'TBD'} {'\u00B7'} Age {age} {'\u00B7'} {college || 'Unknown'}
                                        {r.p.height ? ' \u00B7 ' + Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : ''}
                                        {r.p.weight ? ' \u00B7 ' + r.p.weight + 'lbs' : ''}
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Oswald', padding: '2px 10px', borderRadius: '10px', background: dhqColVal + '20', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() + ' DHQ' : 'No DHQ'}</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: fitColor(fit.score) + '15', color: fitColor(fit.score) }}>{fit.label} Fit</span>
                                        {tag && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: tagDefs[tag].color + '20', color: tagDefs[tag].color }}>{tagDefs[tag].icon} {tagDefs[tag].label}</span>}
                                      </div>
                                      {/* Quick tag buttons */}
                                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                                        {Object.entries(tagDefs).map(([tKey, tDef]) => (
                                          <button key={tKey} onClick={(e) => { e.stopPropagation(); setBoardTags(prev => ({ ...prev, [r.pid]: prev[r.pid] === tKey ? undefined : tKey })); }} style={{ padding: '3px 10px', fontSize: '0.68rem', fontFamily: 'Oswald', fontWeight: 600, borderRadius: '12px', cursor: 'pointer', border: '1px solid ' + (tag === tKey ? tDef.color : 'rgba(255,255,255,0.12)'), background: tag === tKey ? tDef.color + '25' : 'rgba(255,255,255,0.03)', color: tag === tKey ? tDef.color : 'var(--silver)', transition: 'all 0.15s' }}>{tDef.icon} {tDef.label}</button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                                    {[
                                      { label: 'DHQ', val: r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014', col: dhqColVal, gauge: true },
                                      { label: 'FIT', val: fit.label, col: fitColor(fit.score) },
                                      { label: 'AGE', val: age, col: typeof age === 'number' && age <= 22 ? '#2ECC71' : 'var(--silver)' },
                                      { label: 'EXP', val: (r.p.years_exp || 0) + 'yr', col: 'var(--silver)' },
                                      { label: 'TEAM', val: r.p.team || 'TBD', col: r.p.team ? '#2ECC71' : 'var(--silver)' },
                                      { label: 'DEPTH', val: r.p.depth_chart_order != null ? '#' + (r.p.depth_chart_order + 1) : '\u2014', col: r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--silver)' },
                                    ].map((s, i) => {
                                      const dhqFilled = s.gauge ? Math.round(Math.min(10, r.dhq / 1000)) : 0;
                                      const dhqGaugeCol = r.dhq >= 7000 ? 'filled-green' : r.dhq >= 4000 ? 'filled' : 'filled-red';
                                      return (
                                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: s.col, letterSpacing: '-0.02em' }}>{s.val}</div>
                                        {s.gauge && <div className="wr-gauge" style={{ marginTop: '3px' }}>{Array.from({length: 10}, (_, gi) => <div key={gi} className={'wr-gauge-seg' + (gi < dhqFilled ? ' ' + dhqGaugeCol : '')}></div>)}</div>}
                                        <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                                      </div>
                                    ); })}
                                  </div>

                                  <InlineCareerStats pid={r.pid} pos={pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                                    <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scouting Notes</div>
                                    <textarea value={note} onChange={e => setBoardNotes(prev => ({...prev, [r.pid]: e.target.value}))} placeholder={'Add your scouting notes on ' + pName(r.p) + '...'} style={{ width: '100%', minHeight: '70px', padding: '8px 10px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--silver)', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, outline: 'none' }} />
                                  </div>

                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <a href={'https://www.sports-reference.com/cfb/search/search.fcgi?search=' + encodeURIComponent(pName(r.p))} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(52,152,219,0.12)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83C\uDFC8'} COLLEGE STATS</a>
                                    <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\u25B6'} HIGHLIGHTS</a>
                                    <button onClick={() => { setReconPanelOpen(true); sendReconMessage('Give me a full scouting report on ' + pName(r.p) + ' (' + pos + ', ' + college + '). Include strengths, weaknesses, NFL comparison, and where I should draft them.'); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>ASK ALEX</button>
                                    <button onClick={() => setExpandedDraftPid(null)} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                                  </div>
                                </div>
                            );
                        })()}

                        {/* Side-by-side boards */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                            <div>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>DHQ Board <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.5, textTransform: 'none' }}>engine rankings</span></div>
                                {renderCompactBoard(dhqBoardPlayers, true)}
                            </div>
                            <div>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>My Board <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.5, textTransform: 'none' }}>your rankings</span></div>
                                {renderCompactBoard(myBoardPlayers, false)}
                            </div>
                        </div>

                        {/* Expanded card moved above boards — old location */}

                        {/* OLD BOARD — REPLACED BY SIDE-BY-SIDE ABOVE */}
                        {false && <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', height: '36px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', alignItems: 'center' }}>
                                <div style={{ width: '260px', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 10px', gap: '4px', borderRight: '2px solid rgba(212,175,55,0.15)' }}>
                                    <span style={{ width: '30px', textAlign: 'center' }}>#</span>
                                    <span style={{ flex: 1 }} onClick={() => boardMode === 'dhq' && setBoardSort(prev => prev.key === 'name' ? {...prev, dir: prev.dir * -1} : {key: 'name', dir: 1})} style={{ flex: 1, cursor: boardMode === 'dhq' ? 'pointer' : 'default' }}>Player{boardSort.key === 'name' && boardMode === 'dhq' ? (boardSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}</span>
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                                    {[{k:'pos',l:'Pos',w:'48px'},{k:'age',l:'Age',w:'42px'},{k:'dhq',l:'DHQ',w:'64px'},{k:'fit',l:'Fit',w:'70px'},{k:'school',l:'School',w:'1fr'}].map(col => (
                                        <div key={col.k} onClick={() => boardMode === 'dhq' && setBoardSort(prev => prev.key === col.k ? {...prev, dir: prev.dir * -1} : {key: col.k, dir: -1})}
                                            style={{ width: col.w === '1fr' ? undefined : col.w, flex: col.w === '1fr' ? 1 : undefined, minWidth: col.w === '1fr' ? '60px' : col.w, flexShrink: 0, textAlign: 'center', cursor: boardMode === 'dhq' ? 'pointer' : 'default', userSelect: 'none', padding: '0 4px' }}>
                                            {col.l}{boardSort.key === col.k && boardMode === 'dhq' ? (boardSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}
                                        </div>
                                    ))}
                                    <div style={{ width: '100px', flexShrink: 0, textAlign: 'center' }}>Tags</div>
                                    <div style={{ width: '62px', flexShrink: 0 }}></div>
                                </div>
                            </div>
                            {boardPlayers.map((r, idx) => {
                                const pos = normPos(r.p.position) || r.p.position;
                                const dhqColVal = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                                const fit = computeFitScore(r);
                                const isDrafted = draftedPids.has(r.pid);
                                const tag = boardTags[r.pid];
                                const note = boardNotes[r.pid] || '';
                                const age = r.p.age || (r.p.birth_date ? Math.floor((Date.now() - new Date(r.p.birth_date).getTime()) / 31557600000) : r.p.years_exp === 0 ? 21 : '\u2014');
                                const college = r.p.college || r.p.metadata?.college || '';
                                const isEditing = editingRank === r.pid;
                                const isExp = expandedDraftPid === r.pid;
                                const contract = window.NFL_CONTRACTS?.[r.pid];
                                return (
                                    <React.Fragment key={r.pid}>
                                    <div
                                        draggable={boardMode === 'my'}
                                        onDragStart={() => handleDragStart(r.pid)}
                                        onDragOver={handleDragOver}
                                        onDrop={() => handleDrop(r.pid)}
                                        onClick={() => setExpandedDraftPid(prev => prev === r.pid ? null : r.pid)}
                                        style={{ display: 'flex', opacity: isDrafted ? 0.35 : dragPid === r.pid ? 0.5 : 1, borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', background: isExp ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent', transition: 'background 0.1s' }}
                                        onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
                                        onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = isExp ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent'; }}>
                                        {/* Frozen left: rank + photo + name */}
                                        <div style={{ width: '260px', flexShrink: 0, height: '42px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px', borderRight: '2px solid rgba(212,175,55,0.15)' }}>
                                            {isEditing ? (
                                                <input autoFocus type="number" min="1" value={rankInput} onChange={e => setRankInput(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleRankSubmit(r.pid); if (e.key === 'Escape') setEditingRank(null); }}
                                                    onBlur={() => handleRankSubmit(r.pid)}
                                                    onClick={e => e.stopPropagation()}
                                                    style={{ width: '28px', padding: '1px 2px', fontSize: '0.72rem', background: 'rgba(212,175,55,0.15)', border: '1px solid var(--gold)', borderRadius: '3px', color: 'var(--gold)', textAlign: 'center', outline: 'none', flexShrink: 0 }} />
                                            ) : (
                                                <span onClick={e => { e.stopPropagation(); setEditingRank(r.pid); setRankInput(String(idx + 1)); }}
                                                    style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: idx < 3 ? 'var(--gold)' : 'var(--silver)', cursor: 'pointer', textAlign: 'center', width: '24px', flexShrink: 0 }} title="Click to change rank">{idx + 1}</span>
                                            )}
                                            <div style={{ width: '26px', height: '26px', flexShrink: 0 }}>
                                                <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + r.pid + '.jpg'} alt="" onError={e => e.target.style.display='none'} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ overflow: 'hidden', flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--white)', textDecoration: isDrafted ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pName(r.p)}</div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p.team || 'TBD'}{college ? ' \u00B7 ' + college : ''}{note ? ' \u00B7 ' + note : ''}</div>
                                            </div>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.4 }}>{isExp ? '\u25B2' : '\u25BC'}</span>
                                        </div>
                                        {/* Data columns */}
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', height: '42px' }}>
                                            <div style={{ width: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)', padding: '2px 8px', background: (posColors[pos] || '#666') + '22', borderRadius: '4px' }}>{pos}</span>
                                            </div>
                                            <div style={{ width: '42px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', color: 'var(--silver)' }}>{age}</div>
                                            <div style={{ width: '64px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.78rem', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</div>
                                            <div style={{ width: '70px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span title={fit.score + '/99'} style={{ fontSize: '0.68rem', fontWeight: 700, color: fitColor(fit.score), padding: '1px 8px', background: fitColor(fit.score) + '15', borderRadius: '8px' }}>{fit.label}</span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '60px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6, overflow: 'hidden', padding: '0 4px' }}>
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{college || '\u2014'}</span>
                                            </div>
                                            <div style={{ width: '100px', flexShrink: 0, display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
                                                {Object.entries(tagDefs).map(([tKey, tDef]) => (
                                                    <button key={tKey} onClick={e => { e.stopPropagation(); setBoardTags(prev => ({ ...prev, [r.pid]: prev[r.pid] === tKey ? undefined : tKey })); }}
                                                        title={tDef.label}
                                                        style={{ width: '18px', height: '18px', fontSize: '0.6rem', border: 'none', borderRadius: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            background: tag === tKey ? tDef.color + '33' : 'rgba(255,255,255,0.04)', color: tag === tKey ? tDef.color : 'rgba(255,255,255,0.2)' }}>
                                                        {tDef.icon}
                                                    </button>
                                                ))}
                                                <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener"
                                                    title="Watch highlights" onClick={e => e.stopPropagation()}
                                                    style={{ width: '18px', height: '18px', fontSize: '0.6rem', border: 'none', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(231,76,60,0.08)', color: '#E74C3C', textDecoration: 'none' }}>
                                                    &#9654;
                                                </a>
                                            </div>
                                            <div style={{ width: '62px', flexShrink: 0, display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'center' }}>
                                                <button onClick={e => { e.stopPropagation(); setDraftedPids(prev => { const n = new Set(prev); if (n.has(r.pid)) n.delete(r.pid); else n.add(r.pid); return n; }); }}
                                                    style={{ fontSize: '0.6rem', padding: '2px 5px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', cursor: 'pointer', background: isDrafted ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.04)', color: isDrafted ? '#E74C3C' : 'var(--silver)', fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                                                    {isDrafted ? 'Undo' : 'Off'}
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); const n = prompt('Note for ' + pName(r.p) + ':', note); if (n !== null) setBoardNotes(prev => ({...prev, [r.pid]: n})); }}
                                                    title="Add note" style={{ fontSize: '0.6rem', padding: '2px 5px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer', background: note ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)', color: note ? 'var(--gold)' : 'var(--silver)', fontFamily: 'Oswald' }}>
                                                    {note ? '\u270E' : '+'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inline expand card */}
                                    {isExp && (
                                        <div style={{ borderBottom: '2px solid rgba(212,175,55,0.25)', background: 'linear-gradient(135deg, rgba(212,175,55,0.04), rgba(0,0,0,0.3))', padding: '16px 20px', animation: 'wrFadeIn 0.2s ease' }}>
                                          {/* Header */}
                                          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                                            <div style={{ flexShrink: 0, position: 'relative' }}>
                                              <img src={'https://sleepercdn.com/content/nfl/players/'+r.pid+'.jpg'} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                                              <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                                              <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[pos]||'#666')+'25', color: posColors[pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{pos}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || pName(r.p)}</div>
                                              <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                                                {pos} {'\u00B7'} {r.p.team || 'TBD'} {'\u00B7'} Age {age} {'\u00B7'} {college || 'Unknown'}
                                                {r.p.height ? ' \u00B7 ' + Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : ''}
                                                {r.p.weight ? ' \u00B7 ' + r.p.weight + 'lbs' : ''}
                                              </div>
                                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Oswald', padding: '2px 10px', borderRadius: '10px', background: dhqColVal + '20', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() + ' DHQ' : 'No DHQ'}</span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: fitColor(fit.score) + '15', color: fitColor(fit.score) }}>{fit.label} Fit</span>
                                                {r.p.draft_round && <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', color: 'var(--silver)' }}>NFL Rd {r.p.draft_round}{r.p.draft_pick ? '.' + r.p.draft_pick : ''}</span>}
                                                {tag && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: tagDefs[tag].color + '20', color: tagDefs[tag].color }}>{tagDefs[tag].icon} {tagDefs[tag].label}</span>}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Stat boxes */}
                                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                                            {[
                                              { label: 'DHQ', val: r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014', col: dhqColVal },
                                              { label: 'FIT', val: fit.label, col: fitColor(fit.score) },
                                              { label: 'AGE', val: age, col: typeof age === 'number' && age <= 22 ? '#2ECC71' : 'var(--silver)' },
                                              { label: 'EXP', val: (r.p.years_exp || 0) + 'yr', col: 'var(--silver)' },
                                              { label: 'TEAM', val: r.p.team || 'TBD', col: r.p.team ? '#2ECC71' : 'var(--silver)' },
                                              { label: 'DEPTH', val: r.p.depth_chart_order != null ? '#' + (r.p.depth_chart_order + 1) : '\u2014', col: r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--silver)' },
                                            ].map((s, i) => (
                                              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: s.col, letterSpacing: '-0.02em' }}>{s.val}</div>
                                                <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Physical Profile */}
                                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                                            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Physical Profile</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.78rem' }}>
                                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Ht </span><span style={{ color: 'var(--white)' }}>{r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : '\u2014'}</span></div>
                                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Wt </span><span style={{ color: 'var(--white)' }}>{r.p.weight ? r.p.weight+'lbs' : '\u2014'}</span></div>
                                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>College </span><span style={{ color: 'var(--white)' }}>{college || '\u2014'}</span></div>
                                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Exp </span><span style={{ color: 'var(--white)' }}>{r.p.years_exp || 0}yr</span></div>
                                              {r.p.depth_chart_order != null && <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Depth </span><span style={{ color: r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--white)' }}>#{r.p.depth_chart_order + 1} {r.p.depth_chart_position || ''}</span></div>}
                                            </div>
                                          </div>

                                          {/* College / Career Stats */}
                                          <InlineCareerStats pid={r.pid} pos={pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                                          {/* Scouting Notes */}
                                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                                            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scouting Notes</div>
                                            <textarea
                                              value={note}
                                              onChange={e => setBoardNotes(prev => ({...prev, [r.pid]: e.target.value}))}
                                              onClick={e => e.stopPropagation()}
                                              placeholder={'Add your scouting notes on ' + pName(r.p) + '...'}
                                              style={{ width: '100%', minHeight: '70px', padding: '8px 10px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--silver)', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, outline: 'none' }}
                                            />
                                          </div>

                                          {/* Action buttons */}
                                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <a href={'https://www.sports-reference.com/cfb/search/search.fcgi?search=' + encodeURIComponent(pName(r.p))} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(52,152,219,0.12)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83C\uDFC8'} COLLEGE STATS</a>
                                            <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\u25B6'} HIGHLIGHTS</a>
                                            <button onClick={e => { e.stopPropagation(); setReconPanelOpen(true); sendReconMessage('SEARCH FOR CURRENT INFO. Full dynasty scouting report on ' + pName(r.p) + ' (' + pos + ', ' + (college || 'Unknown') + ', ' + (r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'" ' : '') + (r.p.weight ? r.p.weight+'lbs' : '') + '). Format as:\n\nPROFILE: Physical build assessment, athletic traits, measurables analysis\n\nCOLLEGE PRODUCTION: Key stats from last 2 seasons, snap count, efficiency metrics\n\nPOSITION GRADES (1-10): ' + (pos==='RB'?'Vision/Patience, Power/Balance, Agility/Accel, Passing Game, Competitiveness':(pos==='WR'?'Route Running, Separation, Hands/Catch, YAC Ability, Contested Catch':(pos==='QB'?'Arm Strength, Accuracy, Pocket Presence, Mobility, Decision Making':(pos==='TE'?'Blocking, Route Running, Hands, YAC, Versatility':'Tackling, Pass Rush, Coverage, Football IQ, Athleticism')))) + '\n\nNFL COMPARISON: One specific NFL player comp with reasoning\n\nDYNASTY TAKEAWAY: Buy/sell/hold recommendation, ideal draft range, ceiling vs floor, fit for our roster (DHQ: ' + (r.dhq>0?r.dhq:'unranked') + '). Be specific and opinionated.'); }}
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>{'\uD83D\uDD0D'} SCOUT REPORT</button>
                                            <button onClick={e => { e.stopPropagation(); setExpandedDraftPid(null); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                                          </div>
                                        </div>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                            {boardPlayers.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--silver)', opacity: 0.5 }}>No players match this filter</div>}
                        </div>}
                    </div>
                    );
                })()}

                {/* ═══════════════════ VIEW 3: RANKINGS ═══════════════════ */}
                {activeView === 'rankings' && (
                    <div>
                        {/* Draft Class Preview */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Draft Class Preview</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.6 }}>
                                Based on PFF and consensus rankings, the strongest position groups in the upcoming draft class are typically available via the AI advisor. Click the ReconAI panel and ask about specific positions or prospects.
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => { if (typeof setReconPanelOpen === 'function') { setReconPanelOpen(true); sendReconMessage('What are the strongest position groups in the upcoming rookie draft class?'); } }}
                                    style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '4px', color: 'var(--gold)', cursor: 'pointer' }}>
                                    Ask Alex about draft class
                                </button>
                            </div>
                        </div>

                        {/* My Picks grouped by year */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Your Picks</div>
                            {[leagueSeason, leagueSeason + 1, leagueSeason + 2].map(yr => {
                                const yearPicks = myPicks.filter(pk => pk.year === yr);
                                if (!yearPicks.length) return null;
                                return (
                                    <div key={yr} style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{yr}</div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {yearPicks.map((pk, i) => (
                                                <div key={i} style={{ padding: '4px 8px', borderRadius: '4px', background: pk.own ? 'rgba(212,175,55,0.08)' : 'rgba(124,107,248,0.1)', border: '1px solid ' + (pk.own ? 'rgba(212,175,55,0.25)' : 'rgba(124,107,248,0.25)'), fontSize: '0.76rem' }}>
                                                    <span style={{ fontWeight: 700, color: pk.own ? 'var(--gold)' : '#a78bfa' }}>R{pk.round}</span>
                                                    {!pk.own && <span style={{ fontSize: '0.78rem', color: 'var(--silver)', marginLeft: '4px' }}>(acq)</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Position filter */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                            <button onClick={() => setBoardPosFilter('')} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (!boardPosFilter ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'), background: !boardPosFilter ? 'rgba(212,175,55,0.12)' : 'transparent', color: !boardPosFilter ? 'var(--gold)' : 'var(--silver)' }}>All</button>
                            {['QB','RB','WR','TE'].map(pos => (
                                <button key={pos} onClick={() => setBoardPosFilter(boardPosFilter === pos ? '' : pos)} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (boardPosFilter === pos ? (posColors[pos] || '#666') + '55' : 'rgba(255,255,255,0.08)'), background: boardPosFilter === pos ? (posColors[pos] || '#666') + '18' : 'transparent', color: boardPosFilter === pos ? posColors[pos] : 'var(--silver)' }}>{pos}</button>
                            ))}
                        </div>

                        {/* Sortable Rookie Board */}
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Header row - sortable */}
                            <div style={{ display: 'grid', gridTemplateColumns: draftGridCols, gap: '4px', padding: '6px 10px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)' }}>
                                <span style={{ ...draftHeaderStyle, cursor: 'default' }}>#</span>
                                <span style={draftHeaderStyle}></span>
                                <span style={draftHeaderStyle} onClick={() => handleDraftSort('name')}>Rookie{draftSortIndicator('name')}</span>
                                <span style={draftHeaderStyle} onClick={() => handleDraftSort('pos')}>Pos{draftSortIndicator('pos')}</span>
                                <span style={draftHeaderStyle} onClick={() => handleDraftSort('age')}>Age{draftSortIndicator('age')}</span>
                                <span style={draftHeaderStyle} onClick={() => handleDraftSort('dhq')}>DHQ{draftSortIndicator('dhq')}</span>
                                <span style={draftHeaderStyle} onClick={() => handleDraftSort('college')}>College{draftSortIndicator('college')}</span>
                            </div>
                            {/* Body */}
                            <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                {sortedRookies.map(({ pid, p, dhq }, idx) => {
                                    const pos = normPos(p.position) || p.position;
                                    const dhqCol = dhq >= 7000 ? '#2ECC71' : dhq >= 4000 ? '#3498DB' : dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                                    return (
                                        <div key={pid}
                                            onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(pid); }}
                                            style={{ display: 'grid', gridTemplateColumns: draftGridCols, gap: '4px', padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.72rem', alignItems: 'center', transition: 'background 0.1s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <span style={{ fontFamily: 'Oswald', fontSize: '0.74rem', color: 'var(--silver)' }}>{idx + 1}</span>
                                            <div style={{ width: '22px', height: '22px', flexShrink: 0 }}>
                                                <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + pid + '.jpg'} alt="" onError={e => e.target.style.display='none'} style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ fontWeight: 600, color: 'var(--white)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown'}</div>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                            <span style={{ color: 'var(--silver)' }}>{p.age || '\u2014'}</span>
                                            <span style={{ fontWeight: 700, fontFamily: 'Oswald', color: dhqCol }}>{dhq > 0 ? dhq.toLocaleString() : '\u2014'}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.college || p.metadata?.college || '\u2014'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
