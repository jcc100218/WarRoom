// ══════════════════════════════════════════════════════════════════
// league-detail.js — LeagueDetail: Dashboard, My Team, League Map, Analytics
// This is the main app shell after selecting a league.
// ══════════════════════════════════════════════════════════════════
    const WR_KEYS  = window.App.WR_KEYS;
    const WrStorage = window.App.WrStorage;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function markdownToHtml(str) {
        return escapeHtml(str).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }
    // ══════════════════════════════════════════════════════════════════════════
    // END DRAFT TAB
    // ══════════════════════════════════════════════════════════════════════════

    // League Detail Component
    function LeagueDetail({ league, onBack, sleeperUserId, onOpenSettings }) {
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [playersData, setPlayersData] = useState({});
        const [myRoster, setMyRoster] = useState(null);
        const [standings, setStandings] = useState([]);
        const [viewingOwnerId, setViewingOwnerId] = useState(sleeperUserId);
        const [statsData, setStatsData] = useState({});
        const [projectionsData, setProjectionsData] = useState({});
        const [stats2025Data, setStats2025Data] = useState({});
        const [currentLeague, setCurrentLeague] = useState(league);
        const [activeYear, setActiveYear] = useState(league.season);
        const [trending, setTrending] = useState({ adds: [], drops: [] });
        const [activeTab, setActiveTab] = useState('analytics');
        const [tradeSubTab, setTradeSubTab] = useState(null); // when set, TradeCalcTab opens this sub-tab
        const [selectedPlayerPid, setSelectedPlayerPid] = useState(null);

        // ── TIME CONTEXT — the temporal lens of the entire app ──
        // Single source of truth. All modules read timeYear and derived helpers.
        const currentSeason = parseInt(league.season) || new Date().getFullYear();
        const [timeYear, setTimeYear] = useState(() => {
            const saved = WrStorage.get(WR_KEYS.TIME_YEAR);
            return saved !== null ? parseInt(saved) : currentSeason;
        });
        const [timeLoading, setTimeLoading] = useState(false);
        const [timeRecomputeTs, setTimeRecomputeTs] = useState(Date.now());
        const [basePlayersData, setBasePlayersData] = useState(null);

        // ── SeasonContext state — reactive data shared with tab components ──
        const [seasonCtxData, setSeasonCtxData] = useState({
            season: league.season || '',
            playerStats: {},
            tradedPicks: [],
            rosters: [],
            myRosterId: null,
            lastUpdated: 0,
        });

        // ── VIEW MODE — Analyst is now the only mode (Brief tab replaces Flash Brief) ──
        const [viewMode, setViewMode] = useState('analyst');
        const isCommand = false;
        const isAnalyst = true;

        // Open full player modal instead of mini card
        // selectPlayer is exposed via SeasonContext AND kept on window for legacy CDN consumers
        const selectPlayer = useCallback((pid) => {
            if (typeof window.openFWPlayerModal === 'function') {
                window.openFWPlayerModal(pid, playersData, statsData, currentLeague?.scoring_settings || {});
            } else {
                setSelectedPlayerPid(pid);
            }
        }, [playersData, statsData, currentLeague]);
        window._wrSelectPlayer = selectPlayer;

        // Derived selectors — modules use these, never compute their own
        const isCurrentYear = timeYear === currentSeason;
        const isFutureYear = timeYear > currentSeason;
        const isHistoricalYear = timeYear < currentSeason;
        const timeMode = isFutureYear ? 'future' : isHistoricalYear ? 'historical' : 'current';
        const timeModeLabel = isFutureYear ? 'Projection View' : isHistoricalYear ? 'Historical View' : 'Current Season';
        const timeModeColor = isFutureYear ? '#3498DB' : isHistoricalYear ? '#F0A500' : '#2ECC71';
        const timeDelta = timeYear - currentSeason; // positive = future, negative = past
        // Build available years from the league's actual previous_league_id chain
        const [leagueStartYear, setLeagueStartYear] = useState(currentSeason);
        useEffect(() => {
            let cancelled = false;
            async function walkChain() {
                let lid = currentLeague?.id;
                let earliest = currentSeason;
                for (let y = currentSeason - 1; y >= 2018 && lid; y--) {
                    try {
                        const info = await fetchLeagueInfo(lid);
                        if (!info?.previous_league_id) break;
                        lid = info.previous_league_id;
                        earliest = y;
                    } catch { break; }
                }
                if (!cancelled) setLeagueStartYear(earliest);
            }
            walkChain();
            return () => { cancelled = true; };
        }, [currentLeague?.id]);
        const timeYears = [];
        for (let y = leagueStartYear; y <= currentSeason + 2; y++) timeYears.push(y);

        // Persist time year
        useEffect(() => { WrStorage.set(WR_KEYS.TIME_YEAR, String(timeYear)); }, [timeYear]);

        // Validate shared dependencies from ReconAI CDN
        useEffect(() => {
            const deps = {
                'dynastyValue': typeof window.dynastyValue === 'function',
                'assessTeamFromGlobal': typeof window.assessTeamFromGlobal === 'function',
                'calcOptimalPPG': typeof window.App?.calcOptimalPPG === 'function',
                'getPlayerAction': typeof window.getPlayerAction === 'function',
                'peakWindows': !!window.App?.peakWindows,
                'normPos': typeof window.App?.normPos === 'function',
            };
            const missing = Object.entries(deps).filter(([, ok]) => !ok).map(([name]) => name);
            if (missing.length) {
                console.warn('[War Room] Missing shared dependencies:', missing.join(', '), '— some features may not work. Try refreshing.');
            }
        }, []);

        // Save base player data on first load (before any age projection)
        useEffect(() => {
            if (Object.keys(playersData).length > 100 && !basePlayersData) {
                setBasePlayersData(playersData);
            }
        }, [playersData]);

        // ── PROJECTION ENGINE: canonical implementation lives in js/utils/player-value.js ──
        const projectPlayerValue = window.App.PlayerValue.projectPlayerValue;

        // ── LEGEND PANEL — explains War Room tools without revealing sauce ──
        function LegendPanel() {
            const [open, setOpen] = React.useState(false);
            const [expanded, setExpanded] = React.useState(false);
            const quickItems = [
                { term: 'DHQ Value', def: 'Dynasty value score (0-10,000). Production + age + situation + market.' },
                { term: 'Health Score', def: 'Team grade (0-100). 90+ Elite, 80+ Contender, 70+ Crossroads.' },
                { term: 'Elite Player', def: 'Top 5 at their position across all league rosters.' },
                { term: 'Compete Window', def: 'Years until your weakest position group ages out.' },
                { term: 'Player Tags', def: 'Tag players as Trade Block, Cut, Untouchable, or Watch. Syncs between apps.' },
                { term: 'Flash Brief', def: 'Quick-action dashboard. Analyst mode shows deep data.' },
            ];
            const fullItems = [
                { cat: 'Valuations', items: [
                    { term: 'DHQ Value', def: 'Dynasty valuation score on a 0-10,000 scale. Combines on-field production, age trajectory, roster situation, positional scarcity, and market consensus. Updated when you refresh data.' },
                    { term: 'Elite Player', def: 'A player ranked top 5 at their position across all rosters in your league. Championship rosters typically have 2-4 elite assets.' },
                    { term: 'Player Tags', def: 'Tag any player as Trade Block, Cut, Untouchable, or Watch List. Tags sync between War Room and ReconAI so your decisions carry across both apps.' },
                    { term: 'Trend', def: 'Year-over-year production change as a percentage. A player who went from 15 PPG to 18 PPG has a +20% trend. During the season, trend directly influences DHQ values (up to \u00B18%).' },
                ]},
                { cat: 'Team Assessment', items: [
                    { term: 'Health Score', def: 'Your team\u2019s competitive readiness on a 0-100 scale. 60% is based on your optimal starting lineup strength, 40% on positional depth and coverage. 90+ = Elite tier, 80+ = Contender, 70+ = Crossroads.' },
                    { term: 'Contender Rank', def: 'How you stack up for winning THIS season. Based on your best possible starting lineup PPG compared to every other team in the league.' },
                    { term: 'Dynasty Rank', def: 'Your long-term foundation strength. Based on total DHQ value across your entire roster \u2014 starters, bench, taxi, and picks.' },
                    { term: 'Compete Window', def: 'How many more years your roster can realistically compete before age-related decline forces a rebuild. Based on the age curves of your weakest position group.' },
                ]},
                { cat: 'Trading', items: [
                    { term: 'Owner DNA', def: 'A behavioral profile derived from each owner\u2019s trade history. Types include Fleecer (always wins trades), Stalwart (fair deals only), Dominator (wants to feel like the winner), Acceptor (open to deals), and Desperate (panic trades). Used to predict acceptance likelihood.' },
                    { term: 'Trade Impact', def: 'Before you send a trade, see exactly how it changes your health score, elite count, and competitive tier. Simulates the roster swap and recalculates everything.' },
                    { term: 'Acceptance Likelihood', def: 'Predicted chance the other owner accepts your offer, based on value difference, their DNA type, positional needs, and psychological factors like endowment bias.' },
                ]},
                { cat: 'Flash Brief & Analytics', items: [
                    { term: 'Flash Brief', def: 'Quick-action command dashboard. Shows team diagnosis, prioritized action plan, trade currency, and position investment vs championship winners. Analyst mode reveals deep historical analytics.' },
                    { term: 'Fit Score', def: 'How well a draft prospect fills your specific roster needs. A team thin at RB will see RB prospects scored higher. Based on positional depth analysis.' },
                    { term: 'FAAB Strategy', def: 'Free Agent Acquisition Budget recommendations. War Room analyzes which other teams need the same players and how much budget they have left, then suggests a bid amount to win without overpaying.' },
                ]},
            ];
            return React.createElement('div', { style: { marginBottom: '8px' } },
                React.createElement('button', {
                    onClick: () => setOpen(!open),
                    style: { width: '100%', padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--gold)', fontSize: '0.78rem', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.03em', textAlign: 'left' },
                    onMouseEnter: e => { e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; },
                    onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; }
                }, open ? '\u25BC' : '\u25B6', ' Legend'),
                open && React.createElement('div', { style: { padding: '8px 12px', maxHeight: '300px', overflowY: 'auto' } },
                    React.createElement('button', {
                        onClick: () => setExpanded(true),
                        style: { width: '100%', marginBottom: '10px', padding: '6px', fontSize: '0.72rem', fontFamily: 'Oswald', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px', color: 'var(--gold)', cursor: 'pointer' }
                    }, 'FULL GUIDE \u2192'),
                    ...quickItems.map(item => React.createElement('div', { key: item.term, style: { marginBottom: '8px' } },
                        React.createElement('div', { style: { fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald' } }, item.term),
                        React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', lineHeight: 1.4, marginTop: '1px' } }, item.def)
                    ))
                ),
                // Expanded modal overlay
                expanded && React.createElement('div', {
                    onClick: () => setExpanded(false),
                    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }
                },
                    React.createElement('div', {
                        onClick: e => e.stopPropagation(),
                        style: { background: '#0a0b0d', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto', padding: '24px 28px' }
                    },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
                            React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--gold)', letterSpacing: '0.06em' } }, 'WAR ROOM GUIDE'),
                            React.createElement('button', { onClick: () => setExpanded(false), style: { background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: '1.2rem' } }, '\u2715')
                        ),
                        React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--silver)', lineHeight: 1.4, marginBottom: '20px' } }, 'Fantasy Wars analyzes your dynasty league to give you an edge in every decision \u2014 trades, drafts, waivers, and roster construction. Here\u2019s what every tool and metric means.'),
                        ...fullItems.map(section => React.createElement('div', { key: section.cat, style: { marginBottom: '20px' } },
                            React.createElement('div', { style: { fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.06em', borderBottom: '1px solid rgba(212,175,55,0.2)', paddingBottom: '4px', marginBottom: '10px' } }, section.cat),
                            ...section.items.map(item => React.createElement('div', { key: item.term, style: { marginBottom: '12px' } },
                                React.createElement('div', { style: { fontSize: '0.84rem', fontWeight: 700, color: 'var(--white)' } }, item.term),
                                React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.4, marginTop: '2px' } }, item.def)
                            ))
                        ))
                    )
                )
            );
        }

        // ── REACTIVE: when timeYear changes, refetch + recompute everything ──
        useEffect(() => {
            if (!basePlayersData || !Object.keys(basePlayersData).length) return;
            let cancelled = false;
            setTimeLoading(true);

            (async () => {
                try {
                    // 1. Fetch stats for selected year (historical has real data, future returns empty)
                    const newStats = await fetchSeasonStats(String(timeYear)).catch(() => ({}));
                    if (cancelled) return;

                    // 2. Update stats state
                    setStatsData(newStats);

                    // 3. Compute projected player data with age progression + DHQ projection
                    const delta = timeYear - currentSeason;
                    const baseLI = window.App?.LI;

                    // CRITICAL: always read from backup (original scores), never from potentially-projected current scores
                    if (baseLI && !baseLI._baseScoresBackup && baseLI.playerScores) {
                        baseLI._baseScoresBackup = { ...baseLI.playerScores };
                    }
                    const originalScores = baseLI?._baseScoresBackup || baseLI?.playerScores || {};

                    if (delta !== 0) {
                        // A. Build projected players with age advancement + projected DHQ as field
                        const projScores = {};
                        const projected = {};
                        Object.entries(basePlayersData).forEach(([pid, p]) => {
                            const baseAge = p.age || 0;
                            const projAge = baseAge ? baseAge + delta : 0;
                            const baseDhq = originalScores[pid] || 0;
                            const projDhq = projectPlayerValue(pid, baseDhq, baseAge, p.position || '', delta);
                            projScores[pid] = projDhq;
                            projected[pid] = {
                                ...p,
                                age: projAge || p.age,
                                _projected: true,
                                _baseDhq: baseDhq,
                                _projDhq: projDhq,
                                _delta: delta
                            };
                        });

                        // B. Update playersData state (triggers all child re-renders)
                        setPlayersData(projected);

                        // C. Write projected scores to LI.playerScores — THE source all modules read
                        if (baseLI) {
                            baseLI.playerScores = projScores;
                            baseLI._projectedYear = timeYear;

                            // Debug: log projections
                            if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
                                const samples = Object.entries(projScores).filter(([,v]) => v > 2000).sort((a,b) => b[1] - a[1]).slice(0, 5);
                                console.log('[TimeContext] Projected DHQ (delta=' + delta + '):');
                                samples.forEach(([pid, projDhq]) => {
                                    const bp = basePlayersData[pid];
                                    const bd = originalScores[pid] || 0;
                                    console.log('  ' + (bp?.full_name || pid) + ': age ' + (bp?.age||'?') + '\u2192' + ((bp?.age||0)+delta) + ', DHQ ' + bd + '\u2192' + projDhq + ' (' + (projDhq >= bd ? '+' : '') + (projDhq - bd) + ')');
                                });
                            }
                        }
                    } else {
                        // Restore base data — original ages and original DHQ scores
                        setPlayersData(basePlayersData);
                        if (baseLI && baseLI._baseScoresBackup) {
                            baseLI.playerScores = { ...baseLI._baseScoresBackup };
                            delete baseLI._projectedYear;
                        }
                    }

                    // D. Also override the dynastyValue() function's source for this render cycle
                    // dynastyValue reads from LI.playerScores which we just updated above.
                    // But assessTeamFromGlobal may cache. Force re-eval by updating window.S.
                    if (window.S) {
                        window.S._timeContextTs = Date.now();
                    }

                    // 4. Update window.S (write-through cache for ReconAI bridge)
                    if (window.S) {
                        window.S.season = String(timeYear);
                        window.S.playerStats = {};
                        Object.entries(newStats).forEach(([pid, s]) => {
                            window.S.playerStats[pid] = {};
                            const pts = typeof calcRawPts === 'function' ? calcRawPts(s) : (s.pts_half_ppr || 0);
                            const gp = s.gp || 0;
                            window.S.playerStats[pid].prevTotal = pts ? Math.round(pts * 10) / 10 : 0;
                            window.S.playerStats[pid].prevAvg = gp > 0 ? Math.round(pts / gp * 10) / 10 : 0;
                            window.S.playerStats[pid].prevRawStats = s;
                        });
                        // Mirror to SeasonContext
                        setSeasonCtxData(prev => ({
                            ...prev,
                            season: String(timeYear),
                            playerStats: window.S.playerStats,
                            lastUpdated: Date.now(),
                        }));
                    }

                    // 5. Force analytics recompute
                    setAnalyticsData(null);

                    // 6. Force ranked teams recompute by bumping timestamp
                    setTimeRecomputeTs(Date.now());

                } catch(e) { console.warn('Time context data load error:', e); }
                if (!cancelled) setTimeLoading(false);
            })();

            return () => { cancelled = true; };
        }, [timeYear, basePlayersData]);

        // handleTimeYearChange is now just a setter — the effect does the work
        function handleTimeYearChange(year) {
            if (year === timeYear) return;
            setTimeYear(year);
            setActiveYear(String(year));
        }
        const [analyticsData, setAnalyticsData] = useState(null);
        const [analyticsTab, setAnalyticsTab] = useState('roster');
        const [rosterFilter, setRosterFilter] = useState('All');
        const [rosterSort, setRosterSort] = useState({ key: 'dhq', dir: 1 });
        const [visibleCols, setVisibleCols] = useState(() =>
            WrStorage.get(WR_KEYS.ROSTER_COLS) || ['pos','age','dhq','ppg','trend','action']
        );
        const [showColPicker, setShowColPicker] = useState(false);
        const [colPreset, setColPreset] = useState('dynasty');
        const [expandedPid, setExpandedPid] = useState(null);
        const [showAvatarPicker, setShowAvatarPicker] = useState(false);
        const [avatarKey, setAvatarKey] = useState(0); // force re-render when avatar changes
        const [welcomeMode, setWelcomeMode] = useState(false); // centered modal for first-time welcome
        const [showCornerToast, setShowCornerToast] = useState(false); // "I'll be down here" toast
        const [heroStory, setHeroStory] = useState('');
        const [aiStories, setAiStories] = useState([]);
        const [transactions, setTransactions] = useState([]);
        const [rankedTeams, setRankedTeams] = useState([]);
        const [dhqStatus, setDhqStatus] = useState({ loading: false, step: '', progress: 0 });
        const [loadStage, setLoadStage] = useState('');
        const [editingKpi, setEditingKpi] = useState(null); // index being edited, null = not editing
        const [leagueSelectedTeam, setLeagueSelectedTeam] = useState(null);
        const [leagueSort, setLeagueSort] = useState('wins');
        const [leagueViewMode, setLeagueViewMode] = useState('roster');
        const [myTeamView, setMyTeamView] = useState('roster');
        const [compareTeamId, setCompareTeamId] = useState(null);
        const [leagueSubView, setLeagueSubView] = useState('teams'); // sub-tabs below the overview
        const [lpSort, setLpSort] = useState({ key: 'dhq', dir: 1 });
        const [lpFilter, setLpFilter] = useState('');

        // Default 5 KPIs — customizable per owner, saved in localStorage
        const KPI_OPTIONS = {
            'contender-rank': { label: 'Contender Rank', icon: '', category: 'League', tip: 'Win-now rank based on optimal starting lineup PPG vs league. How competitive are you THIS season?' },
            'dynasty-rank':   { label: 'Dynasty Rank', icon: '', category: 'League', tip: 'Long-term rank based on total roster DHQ value. How strong is your dynasty foundation?' },
            'starter-gap':    { label: 'Starter Gap', icon: '', category: 'Roster', tip: 'Difference between your optimal weekly PPG and league target (median x1.05)' },
            'portfolio':      { label: 'Portfolio DHQ', icon: '', category: 'Roster', tip: 'Sum of all DHQ values on your roster' },
            'health-score':   { label: 'Health Score', icon: '', category: 'Roster', tip: 'Blended score: 60% scoring power (contender) + 40% position coverage (dynasty depth). 90+=Elite, 80+=Contender, 70+=Crossroads' },
            'avg-age':        { label: 'Avg Age', icon: '', category: 'Roster', tip: 'DHQ-weighted average age. Lower = longer dynasty window' },
            'top5-conc':      { label: 'Top 5 Concentration', icon: '', category: 'Roster', tip: '% of DHQ held by top 5 players. High = fragile roster' },
            'hit-rate':       { label: 'Trade Win Rate', icon: '', category: 'Trades', tip: 'Percentage of trades where you gained value (won or fair)' },
            'faab-efficiency':{ label: 'FAAB Remaining', icon: '', category: 'Waivers', tip: 'Remaining FAAB budget available for waiver claims' },
            'net-trade':      { label: 'Net DHQ/Trade', icon: '', category: 'Trades', tip: 'Average DHQ gained or lost per trade' },
            'trade-velocity': { label: 'Trade Velocity', icon: '', category: 'Trades', tip: 'Number of trades completed' },
            'window':         { label: 'Compete Window', icon: '', category: 'Projection', tip: 'Estimated years your roster can compete based on age decay' },
            'aging-cliff':    { label: 'Aging Cliff %', icon: '', category: 'Projection', tip: '% of DHQ held by players past peak within 2 years' },
            'partner-wr':     { label: 'Partner Win Rate', icon: '', category: 'Trades', tip: '% of trades where you gained >15% more DHQ' },
            'elite-count':    { label: 'Elite Players', icon: '', category: 'Roster', tip: 'Players who rank top 5 at their position league-wide. These are your cornerstone assets.' },
            'bench-quality':  { label: 'Bench Quality', icon: '', category: 'Roster', tip: 'Average DHQ of non-starter roster players' },
            'playoff-record':   { label: 'Playoff Win-Loss', icon: '', category: 'History', tip: 'Career playoff wins and losses' },
            'playoff-winpct':   { label: 'Playoff Win %', icon: '', category: 'History', tip: 'Win percentage in playoff matchups' },
            'champ-appearances':{ label: 'Championship Appearances', icon: '', category: 'History', tip: 'Times reached the championship round' },
            'dynasty-score':    { label: 'Dynasty Score', icon: '', category: 'History', tip: 'Championships (40%) + Playoffs (30%) + Regular Season (30%)' },
            'draft-roi':        { label: 'Draft ROI', icon: '', category: 'Draft', tip: 'Current DHQ of drafted players vs capital spent' },
            'roster-turnover':  { label: 'Roster Turnover', icon: '', category: 'Roster', tip: 'Trades completed this cycle' },
            'pick-capital':     { label: 'Pick Capital', icon: '', category: 'Roster', tip: 'Total value of your draft picks across next 3 seasons. Includes traded picks.' },
            'trade-leverage':   { label: 'Trade Leverage', icon: '', category: 'Trades', tip: 'How many league teams need positions where you have surplus. Higher = more trade partners available.' },
        };
        const DEFAULT_KPIS = ['contender-rank', 'dynasty-rank', 'health-score', 'window'];
        const [selectedKpis, setSelectedKpis] = useState(() =>
            WrStorage.get(WR_KEYS.KPI_SELECTION(currentLeague?.id || '')) || DEFAULT_KPIS
        );
        useEffect(() => {
            WrStorage.set(WR_KEYS.KPI_SELECTION(currentLeague?.id || ''), selectedKpis);
        }, [selectedKpis]);

        useEffect(() => {
            WrStorage.set(WR_KEYS.ROSTER_COLS, visibleCols);
        }, [visibleCols]);

        function computeKpiValue(kpiKey) {
            const LI = window.App?.LI || {};
            const scores = LI.playerScores || {};
            const myPlayers = myRoster?.players || [];
            const profile = LI.ownerProfiles?.[myRoster?.roster_id];
            switch(kpiKey) {
                case 'contender-rank': {
                    // PPG-based rank — how competitive are you right now?
                    const league2 = currentLeague;
                    const rp = league2?.roster_positions || [];
                    const ppgRanks = (league2.rosters || []).map(r => {
                        const ppg = typeof window.App?.calcOptimalPPG === 'function'
                            ? window.App.calcOptimalPPG(r.players || [], playersData, window.S?.playerStats || {}, rp)
                            : 0;
                        return { rid: r.roster_id, ppg };
                    }).sort((a, b) => b.ppg - a.ppg);
                    // Offseason fallback: if all PPGs are 0, estimate from DHQ values
                    if (ppgRanks.every(r => r.ppg === 0)) {
                        ppgRanks.forEach(r => {
                            const roster = (currentLeague.rosters || []).find(ros => ros.roster_id === r.rid);
                            const totalDHQ = (roster?.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0);
                            r.ppg = Math.round(totalDHQ / 550); // Same fallback as health score
                        });
                        ppgRanks.sort((a, b) => b.ppg - a.ppg);
                    }
                    const myPPG = ppgRanks.find(r => r.rid === myRoster?.roster_id)?.ppg || 0;
                    const cRank = ppgRanks.findIndex(r => r.rid === myRoster?.roster_id) + 1;
                    const allPPGs = ppgRanks.map(r => r.ppg).sort((a, b) => a - b);
                    return { value: '#' + (cRank || '?') + '/' + standings.length, sub: myPPG > 0 ? 'Win-now rank by ' + myPPG.toFixed(1) + ' PPG' : 'Win-now rank by starter PPG', color: cRank <= 3 ? '#2ECC71' : cRank <= 6 ? 'var(--gold)' : '#E74C3C', sparkData: allPPGs };
                }
                case 'dynasty-rank': {
                    // Total DHQ rank — long-term dynasty strength (players + pick capital)
                    const dVals = (currentLeague.rosters || []).map(r => {
                        const playerDHQ = (r.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0);
                        // Add pick capital value
                        let pickDHQ = 0;
                        if (typeof getIndustryPickValue === 'function') {
                            const totalTeams = (currentLeague.rosters || []).length || 16;
                            const draftRounds = currentLeague.settings?.draft_rounds || 5;
                            const leagueSeason = parseInt(currentLeague.season) || new Date().getFullYear();
                            for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) {
                                for (let rd = 1; rd <= draftRounds; rd++) {
                                    const tradedAway = (window.S?.tradedPicks || []).find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === r.roster_id && p.owner_id !== r.roster_id);
                                    if (!tradedAway) pickDHQ += getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams);
                                    const acquired = (window.S?.tradedPicks || []).filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === r.roster_id && p.roster_id !== r.roster_id);
                                    acquired.forEach(() => { pickDHQ += getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams); });
                                }
                            }
                        }
                        return { rid: r.roster_id, total: playerDHQ + pickDHQ };
                    }).sort((a, b) => b.total - a.total);
                    const myDTotal = dVals.find(r => r.rid === myRoster?.roster_id)?.total || 0;
                    const dRank = dVals.findIndex(r => r.rid === myRoster?.roster_id) + 1;
                    const allDVals = dVals.map(r => r.total).sort((a, b) => a - b);
                    return { value: '#' + (dRank || '?') + '/' + standings.length, sub: myDTotal > 0 ? Math.round(myDTotal / 1000) + 'K total assets' : 'Dynasty rank', color: dRank <= 3 ? '#2ECC71' : dRank <= 6 ? 'var(--gold)' : '#E74C3C', sparkData: allDVals };
                }
                case 'portfolio': {
                    const total = myPlayers.reduce((s, pid) => s + (scores[pid] || 0), 0);
                    // Spark: all team totals for league comparison
                    const allTotals = (currentLeague.rosters || []).map(r => (r.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0)).sort((a,b) => a-b);
                    return { value: total.toLocaleString(), sub: 'Total DHQ', color: 'var(--gold)', sparkData: allTotals };
                }
                case 'health-score': {
                    const ranked = rankedTeams.find(t => t.userId === sleeperUserId);
                    const hs = ranked?.healthScore || 0;
                    const allHS = rankedTeams.map(t => t.healthScore || 0).sort((a,b) => a-b);
                    return { value: hs || '\u2014', sub: 'Score', color: hs >= 90 ? '#D4AF37' : hs >= 80 ? '#2ECC71' : hs >= 70 ? 'var(--gold)' : '#E74C3C', sparkData: allHS };
                }
                case 'starter-gap': {
                    const analytics = analyticsData || (typeof runLeagueAnalytics === 'function' ? runLeagueAnalytics() : null);
                    const gap = analytics?.roster?.gaps?.find(g => g.severity === 'high') || analytics?.roster?.gaps?.[0];
                    if (gap) {
                        const area = gap.area || 'Unknown';
                        const delta = typeof gap.delta === 'number' ? (gap.delta > 0 ? '+' : '') + gap.delta.toFixed(gap.delta < 1 ? 2 : 0) : gap.delta;
                        return { value: delta, sub: area + ' (' + gap.severity + ')', color: gap.severity === 'high' ? '#E74C3C' : '#F0A500' };
                    }
                    return { value: '\u2714', sub: 'No major gaps', color: '#2ECC71' };
                }
                case 'avg-age': {
                    if (!myPlayers.length) return { value: '\u2014', sub: 'Avg age', color: 'var(--silver)' };
                    const avg = myPlayers.reduce((s, pid) => s + (playersData[pid]?.age || 26), 0) / myPlayers.length;
                    return { value: avg.toFixed(1), sub: 'Avg age', color: avg <= 25 ? '#2ECC71' : avg <= 27 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'top5-conc': {
                    const vals = myPlayers.map(pid => scores[pid] || 0).sort((a,b) => b - a);
                    const total = vals.reduce((s,v) => s + v, 0);
                    const top5 = vals.slice(0, 5).reduce((s,v) => s + v, 0);
                    const pct = total > 0 ? Math.round(top5 / total * 100) : 0;
                    return { value: pct + '%', sub: 'In top 5 players', color: pct >= 65 ? '#E74C3C' : pct >= 50 ? 'var(--gold)' : '#2ECC71' };
                }
                case 'hit-rate': {
                    if (!profile || !profile.trades) return { value: '\u2014', sub: 'Trade win rate', color: 'var(--silver)' };
                    const total = (profile.tradesWon || 0) + (profile.tradesLost || 0) + (profile.tradesFair || 0);
                    const rate = total > 0 ? Math.round(((profile.tradesWon || 0) + (profile.tradesFair || 0)) / total * 100) : 0;
                    return { value: rate + '%', sub: 'Win/fair rate', color: rate >= 60 ? '#2ECC71' : rate >= 40 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'faab-efficiency': {
                    const budget = myRoster?.settings?.waiver_budget || 0;
                    const spent = myRoster?.settings?.waiver_budget_used || 0;
                    if (!budget) return { value: '\u2014', sub: 'No FAAB', color: 'var(--silver)' };
                    const remaining = budget - spent;
                    return { value: '$' + remaining, sub: '$' + budget + ' budget', color: remaining > budget * 0.5 ? '#2ECC71' : remaining > budget * 0.25 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'net-trade': {
                    if (!profile) return { value: '\u2014', sub: 'Net DHQ/trade', color: 'var(--silver)' };
                    const avg = profile.avgValueDiff || 0;
                    return { value: (avg >= 0 ? '+' : '') + Math.round(avg), sub: 'Avg per trade', color: avg >= 100 ? '#2ECC71' : avg >= 0 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'trade-velocity': {
                    if (!profile) return { value: '\u2014', sub: 'Trades', color: 'var(--silver)' };
                    return { value: profile.trades || 0, sub: 'Total trades', color: (profile.trades || 0) >= 4 ? '#2ECC71' : (profile.trades || 0) >= 2 ? 'var(--gold)' : 'var(--silver)' };
                }
                case 'window': {
                    if (!myPlayers.length) return { value: '\u2014', sub: 'Window', color: 'var(--silver)' };
                    const rp = currentLeague?.roster_positions || [];
                    const peaks = window.App.peakWindows;
                    const posWindows = {};
                    const windowStarters = myRoster?.starters || [];
                    windowStarters.forEach(pid => {
                        if (!pid || pid === '0') return;
                        const p = playersData[pid];
                        if (!p) return;
                        const pos = p.position;
                        const nPos = pos === 'DE' || pos === 'DT' ? 'DL' : pos === 'CB' || pos === 'S' ? 'DB' : pos === 'OLB' || pos === 'ILB' ? 'LB' : pos;
                        const [, pHi] = peaks[nPos] || [24, 29];
                        const yrsLeft = Math.max(0, pHi - (p.age || 25));
                        if (!posWindows[nPos]) posWindows[nPos] = [];
                        posWindows[nPos].push(yrsLeft);
                    });
                    let minWindow = 99;
                    Object.entries(posWindows).forEach(([pos, yrs]) => {
                        if (yrs.length > 0) {
                            const avg = yrs.reduce((s, y) => s + y, 0) / yrs.length;
                            if (avg < minWindow) minWindow = avg;
                        }
                    });
                    const windowYrs = minWindow === 99 ? 0 : Math.round(minWindow);
                    return { value: windowYrs > 0 ? windowYrs + 'yr' : 'Closed', sub: 'Weakest position group', color: windowYrs >= 5 ? '#2ECC71' : windowYrs >= 2 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'aging-cliff': {
                    const total = myPlayers.reduce((s, pid) => s + (scores[pid] || 0), 0);
                    const pastPeak = myPlayers.reduce((s, pid) => {
                        const p = playersData[pid]; if (!p) return s;
                        const pos = p.position; const age = p.age || 26;
                        const pw = window.App.peakWindows;
                        const peaks = Object.fromEntries(Object.entries(pw).map(([k,[,hi]]) => [k,hi]));
                        return age > (peaks[pos] || 29) ? s + (scores[pid] || 0) : s;
                    }, 0);
                    const pct = total > 0 ? Math.round(pastPeak / total * 100) : 0;
                    return { value: pct + '%', sub: 'Past peak DHQ', color: pct <= 20 ? '#2ECC71' : pct <= 35 ? '#F0A500' : '#E74C3C' };
                }
                case 'partner-wr': {
                    if (!profile || !profile.tradesWon) return { value: '\u2014', sub: 'Partner W/R', color: 'var(--silver)' };
                    const total = (profile.tradesWon || 0) + (profile.tradesLost || 0);
                    return { value: (profile.tradesWon || 0) + '-' + (profile.tradesLost || 0), sub: 'Trade W-L', color: (profile.tradesWon || 0) > (profile.tradesLost || 0) ? '#2ECC71' : '#E74C3C' };
                }
                case 'elite-count': {
                    // Elite = top 5 at their position league-wide
                    const posRanks = {};
                    (currentLeague.rosters || []).forEach(r => (r.players || []).forEach(pid => {
                        const pos = playersData[pid]?.position;
                        const nPos2 = pos === 'DE' || pos === 'DT' ? 'DL' : pos === 'CB' || pos === 'S' ? 'DB' : pos === 'OLB' || pos === 'ILB' ? 'LB' : pos;
                        if (!posRanks[nPos2]) posRanks[nPos2] = [];
                        posRanks[nPos2].push({ pid: String(pid), dhq: scores[pid] || 0 });
                    }));
                    Object.values(posRanks).forEach(arr => arr.sort((a, b) => b.dhq - a.dhq));
                    const myPidSet = new Set(myPlayers.map(String));
                    let elites = 0;
                    Object.values(posRanks).forEach(arr => {
                        arr.slice(0, 5).forEach(p => { if (myPidSet.has(p.pid)) elites++; });
                    });
                    return { value: elites + ' elite' + (elites !== 1 ? 's' : ''), sub: 'Top 5 at position', color: elites >= 3 ? '#2ECC71' : elites >= 1 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'bench-quality': {
                    const starters = new Set(myRoster?.starters || []);
                    const benchVals = myPlayers.filter(pid => !starters.has(pid)).map(pid => scores[pid] || 0);
                    const avg = benchVals.length ? Math.round(benchVals.reduce((s,v) => s + v, 0) / benchVals.length) : 0;
                    return { value: avg.toLocaleString(), sub: 'Avg bench DHQ', color: avg >= 2500 ? '#2ECC71' : avg >= 1500 ? 'var(--gold)' : 'var(--silver)' };
                }
                case 'playoff-record': {
                    const brackets = window.App?.LI?.bracketData || {};
                    let pw = 0, pl = 0;
                    const numPlayoffTeams = currentLeague?.settings?.playoff_teams || 6;
                    Object.values(brackets).forEach(({ winners }) => {
                        if (!winners?.length) return;
                        // Find true playoff matchups: exclude consolation games
                        // In Sleeper brackets, first-round matchups have t1/t2 as seed numbers.
                        // Only count matchups that feed into the championship (highest round).
                        const maxRound = Math.max(...winners.map(m => m.r || 0));
                        // Determine real playoff matchup IDs: start from championship and trace back
                        const realMatchIds = new Set();
                        // Championship game
                        const champGame = winners.find(m => m.r === maxRound);
                        if (champGame) {
                            realMatchIds.add(champGame.m);
                            // Trace feeder matchups backwards through rounds
                            const queue = [champGame];
                            while (queue.length) {
                                const g = queue.shift();
                                // t1_from and t2_from reference the matchup IDs that feed into this game
                                // In Sleeper: t1_from.w means "winner of matchup t1_from", etc.
                                const feeders = winners.filter(fm => {
                                    // A matchup feeds this one if its winner/loser advances here
                                    return fm.m === g.t1_from?.w || fm.m === g.t1_from?.l || fm.m === g.t2_from?.w || fm.m === g.t2_from?.l
                                        || fm.m === g.t1 || fm.m === g.t2;
                                });
                                feeders.forEach(f => { if (!realMatchIds.has(f.m)) { realMatchIds.add(f.m); queue.push(f); } });
                            }
                        }
                        // If tracing didn't work (simple bracket), fall back: only count top rounds
                        // For N playoff teams, there are ceil(log2(N)) real rounds
                        const realRounds = Math.ceil(Math.log2(numPlayoffTeams));
                        const minPlayoffRound = maxRound - realRounds + 1;
                        winners.forEach(m => {
                            const isReal = realMatchIds.size > 1 ? realMatchIds.has(m.m) : (m.r >= minPlayoffRound);
                            if (!isReal) return;
                            if (m.w === myRoster?.roster_id) pw++;
                            if (m.l === myRoster?.roster_id) pl++;
                        });
                    });
                    return { value: pw + '-' + pl, sub: 'Playoff W-L', color: pw > pl ? '#2ECC71' : pw < pl ? '#E74C3C' : 'var(--silver)' };
                }
                case 'playoff-winpct': {
                    const brackets2 = window.App?.LI?.bracketData || {};
                    let pw2 = 0, pl2 = 0;
                    const numPlayoffTeams2 = currentLeague?.settings?.playoff_teams || 6;
                    Object.values(brackets2).forEach(({ winners }) => {
                        if (!winners?.length) return;
                        const maxRound = Math.max(...winners.map(m => m.r || 0));
                        const realRounds = Math.ceil(Math.log2(numPlayoffTeams2));
                        const minPlayoffRound = maxRound - realRounds + 1;
                        const realMatchIds = new Set();
                        const champGame = winners.find(m => m.r === maxRound);
                        if (champGame) {
                            realMatchIds.add(champGame.m);
                            const queue = [champGame];
                            while (queue.length) {
                                const g = queue.shift();
                                const feeders = winners.filter(fm => fm.m === g.t1_from?.w || fm.m === g.t1_from?.l || fm.m === g.t2_from?.w || fm.m === g.t2_from?.l || fm.m === g.t1 || fm.m === g.t2);
                                feeders.forEach(f => { if (!realMatchIds.has(f.m)) { realMatchIds.add(f.m); queue.push(f); } });
                            }
                        }
                        winners.forEach(m => {
                            const isReal = realMatchIds.size > 1 ? realMatchIds.has(m.m) : (m.r >= minPlayoffRound);
                            if (!isReal) return;
                            if (m.w === myRoster?.roster_id) pw2++;
                            if (m.l === myRoster?.roster_id) pl2++;
                        });
                    });
                    const total = pw2 + pl2;
                    const pct = total > 0 ? Math.round(pw2 / total * 100) : 0;
                    return { value: pct + '%', sub: 'Win rate (' + total + ' games)', color: pct >= 60 ? '#2ECC71' : pct >= 40 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'champ-appearances': {
                    const champs2 = window.App?.LI?.championships || {};
                    const apps = Object.values(champs2).filter(c => c.champion === myRoster?.roster_id || c.runnerUp === myRoster?.roster_id).length;
                    return { value: apps, sub: 'Finals appearances', color: apps > 0 ? '#D4AF37' : 'var(--silver)' };
                }
                case 'dynasty-score': {
                    const champs3 = window.App?.LI?.championships || {};
                    const brackets3 = window.App?.LI?.bracketData || {};
                    let titles = 0, runners = 0, playoffApps = 0;
                    Object.values(champs3).forEach(c => {
                        if (c.champion === myRoster?.roster_id) titles++;
                        if (c.runnerUp === myRoster?.roster_id) runners++;
                        if (c.champion === myRoster?.roster_id || c.runnerUp === myRoster?.roster_id || (c.semiFinals||[]).includes(myRoster?.roster_id)) playoffApps++;
                    });
                    const score = titles * 3 + runners + playoffApps;
                    return { value: score, sub: titles + ' titles, ' + runners + ' runner-ups', color: score >= 5 ? '#D4AF37' : score >= 2 ? '#2ECC71' : 'var(--silver)' };
                }
                case 'draft-roi': {
                    const profile3 = window.App?.LI?.ownerProfiles?.[myRoster?.roster_id];
                    const draftPicks = (window.App?.LI?.draftOutcomes || []).filter(d => d.roster_id === myRoster?.roster_id);
                    const hits = draftPicks.filter(d => d.isStarter).length;
                    const total = draftPicks.length;
                    const rate = total > 0 ? Math.round(hits / total * 100) : 0;
                    return { value: rate + '%', sub: hits + '/' + total + ' became starters', color: rate >= 50 ? '#2ECC71' : rate >= 30 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'roster-turnover': {
                    const profile4 = window.App?.LI?.ownerProfiles?.[myRoster?.roster_id];
                    const trades = profile4?.trades || 0;
                    return { value: trades, sub: 'Trades this cycle', color: trades >= 5 ? '#2ECC71' : trades >= 2 ? 'var(--gold)' : 'var(--silver)' };
                }
                case 'pick-capital': {
                    let totalPickValue = 0;
                    let pickCount = 0;
                    const totalTeams = (currentLeague.rosters || []).length || 16;
                    const draftRounds = currentLeague.settings?.draft_rounds || 5;
                    const leagueSeason = parseInt(currentLeague.season) || new Date().getFullYear();
                    const tp = window.S?.tradedPicks || [];
                    for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) {
                        for (let rd = 1; rd <= draftRounds; rd++) {
                            const tradedAway = tp.find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster?.roster_id && p.owner_id !== myRoster?.roster_id);
                            if (!tradedAway) {
                                totalPickValue += typeof getIndustryPickValue === 'function' ? getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams) : 0;
                                pickCount++;
                            }
                            const acquired = tp.filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster?.roster_id && p.roster_id !== myRoster?.roster_id);
                            acquired.forEach(() => {
                                totalPickValue += typeof getIndustryPickValue === 'function' ? getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams) : 0;
                                pickCount++;
                            });
                        }
                    }
                    return { value: totalPickValue > 0 ? Math.round(totalPickValue / 1000) + 'K' : '\u2014', sub: pickCount + ' picks over 3 years', color: totalPickValue >= 20000 ? '#2ECC71' : totalPickValue >= 10000 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'trade-leverage': {
                    const assess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
                    const myStrengths = assess?.strengths || [];
                    let leverageCount = 0;
                    (currentLeague.rosters || []).forEach(r => {
                        if (r.roster_id === myRoster?.roster_id) return;
                        const theirAssess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(r.roster_id) : null;
                        const theirNeeds = (theirAssess?.needs || []).map(n => n.pos);
                        if (myStrengths.some(s => theirNeeds.includes(s))) leverageCount++;
                    });
                    return { value: leverageCount, sub: leverageCount + ' teams need your surplus', color: leverageCount >= 6 ? '#2ECC71' : leverageCount >= 3 ? 'var(--gold)' : '#E74C3C' };
                }
                default: return { value: '\u2014', sub: '', color: 'var(--silver)' };
            }
        }
        const [reconPanelOpen, setReconPanelOpen] = useState(false);
        const [showNotifications, setShowNotifications] = useState(false);
        // showAlerts removed — alerts now live on Brief tab
        const [briefDraftInfo, setBriefDraftInfo] = useState(null);
        const [sidebarOpen, setSidebarOpen] = useState(false);
        const [gmStrategyOpen, setGmStrategyOpen] = useState(false);
        const GM_STRATEGY_DEFAULT = { mode: 'balanced', riskTolerance: 'moderate', positionalNeeds: {}, untouchable: [], targets: [], notes: '' };
        const [gmStrategy, setGmStrategy] = useState(() =>
            WrStorage.get(WR_KEYS.GM_STRATEGY(currentLeague?.league_id)) || GM_STRATEGY_DEFAULT
        );
        useEffect(() => {
            if (currentLeague?.league_id) {
                WrStorage.set(WR_KEYS.GM_STRATEGY(currentLeague.league_id), gmStrategy);
                // Expose to window for AI context
                window._wrGmStrategy = gmStrategy;
            }
        }, [gmStrategy, currentLeague?.league_id]);

        // Fetch draft info for Brief tab
        useEffect(() => {
            if (!currentLeague?.id && !currentLeague?.league_id) return;
            fetch('https://api.sleeper.app/v1/league/' + (currentLeague.league_id || currentLeague.id) + '/drafts')
                .then(r => r.ok ? r.json() : [])
                .then(drafts => {
                    const upcoming = drafts.find(d => d.status === 'pre_draft') || drafts[0];
                    if (upcoming) setBriefDraftInfo(upcoming);
                })
                .catch(err => window.wrLog('flashBrief.draftFetch', err));
        }, [currentLeague]);

        // Auto-generate notifications from league data
        const notifications = useMemo(() => {
            const notes = [];
            const txns = window.S?.transactions || [];
            const myPids = new Set(myRoster?.players || []);

            // Players on my roster that are trending down
            txns.filter(t => t.type === 'free_agent' || t.type === 'waiver').forEach(t => {
                const drops = Object.keys(t.drops || {});
                drops.forEach(pid => {
                    if (myPids.has(pid)) {
                        notes.push({ type: 'warn', text: (playersData[pid]?.full_name || pid) + ' was dropped by another team', time: t.created });
                    }
                });
                const adds = Object.keys(t.adds || {});
                adds.forEach(pid => {
                    const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                    if (dhq > 3000 && !myPids.has(pid)) {
                        notes.push({ type: 'info', text: (playersData[pid]?.full_name || pid) + ' (' + dhq.toLocaleString() + ' DHQ) was picked up', time: t.created });
                    }
                });
            });

            // Trades involving my position needs
            txns.filter(t => t.type === 'trade').slice(0, 5).forEach(t => {
                const rids = t.roster_ids || [];
                if (rids.includes(myRoster?.roster_id)) {
                    notes.push({ type: 'trade', text: 'You completed a trade', time: t.created });
                }
            });

            return notes.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 10);
        }, [playersData, myRoster]);
        // GM Onboarding wizard state
        const gmIsUnconfigured = gmStrategy.mode === 'balanced' && !(gmStrategy.untouchable?.length) && !gmStrategy.notes && !(gmStrategy.targets?.length);
        const [gmOnboardStep, setGmOnboardStep] = useState(0); // 0=not started, 1-4=steps, 5=done
        const [reconMessages, setReconMessages] = useState(() => {
            const saved = WrStorage.get(WR_KEYS.CHAT(currentLeague?.league_id));
            return (Array.isArray(saved) && saved.length > 1) ? saved
                : [{ role: 'assistant', content: 'Ask me anything about your league, team, or players.' }];
        });
        const [reconInput, setReconInput] = useState('');

        useEffect(() => {
            if (activeTab === 'analytics' && !analyticsData && window.App?.LI_LOADED) {
                const data = typeof runLeagueAnalytics === 'function' ? runLeagueAnalytics() : null;
                setAnalyticsData(data);
            }
        }, [activeTab, analyticsData, timeRecomputeTs]);

        // Auto-populate home page content when data is ready
        useEffect(() => {
            if (rankedTeams.length > 0 && !heroStory) {
                setHeroStory(computeDataDrivenHero());
            }
            if (rankedTeams.length > 0 && aiStories.length === 0) {
                generateAiStories();
            }
        }, [rankedTeams, transactions]);

        // Keyboard shortcut: Cmd/Ctrl+K to toggle ReconAI panel
        useEffect(() => {
          const handler = e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
              e.preventDefault();
              setReconPanelOpen(prev => !prev);
            }
          };
          window.addEventListener('keydown', handler);
          return () => window.removeEventListener('keydown', handler);
        }, []);

        // First-time welcome — auto-open chat with Alex's intro
        useEffect(() => {
          if (!myRoster?.players?.length || !currentLeague?.league_id) return;
          const welcomeKey = WR_KEYS.WELCOMED(currentLeague.league_id);
          if (WrStorage.get(welcomeKey)) return;
          WrStorage.set(welcomeKey, '1');
          // Small delay so the app finishes rendering first
          const t = setTimeout(() => {
            setWelcomeMode(true);
            setReconPanelOpen(true);
            setReconMessages([{
              role: 'assistant',
              content: 'Hey! I\'m **Alex Ingram** — your AI General Manager. I\'ll be sitting in the war room with you, analyzing your roster, scouting trade targets, and helping you build a dynasty.\n\nA few things to get us started:\n\n' +
                '\u2022 **Ask me anything** — trades, waivers, draft strategy, player analysis\n' +
                '\u2022 **Customize my look** below, or in the GM Strategy panel on your roster tab\n' +
                '\u2022 **Set your strategy** so I know if we\'re going all-in or rebuilding\n\n' +
                'Let\'s get to work. What\'s on your mind? \u2014 Alex',
              onboardChoices: [
                { label: 'Set my strategy', value: 'strategy' },
                { label: 'What should I do?', value: 'advice' },
                { label: 'Pick Alex\'s look', value: 'avatar' }
              ]
            }]);
            setGmOnboardStep(0); // reset so strategy onboarding can trigger next
          }, 1500);
          return () => clearTimeout(t);
        }, [myRoster?.players?.length, currentLeague?.league_id]);

        // Handle welcome choices — exit welcome mode, show corner toast
        function handleWelcomeChoice(value) {
          setWelcomeMode(false);
          if (value === 'strategy') {
            setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined })),
              { role: 'user', content: 'Set my strategy' }
            ]);
            startGmOnboarding();
          } else if (value === 'advice') {
            setReconMessages(prev => prev.map(m => ({ ...m, onboardChoices: undefined })));
            sendReconMessage('What are the top 3 moves I should make right now?');
          } else if (value === 'avatar') {
            setReconMessages(prev => prev.map(m => ({ ...m, onboardChoices: undefined })));
            setShowAvatarPicker(true);
          }
          // Show "I'll be down here" toast after transition
          if (value !== 'strategy' && value !== 'advice') {
            setReconPanelOpen(false);
            setTimeout(() => {
              setShowCornerToast(true);
              setTimeout(() => setShowCornerToast(false), 4000);
            }, 300);
          }
        }

        // Auto-trigger GM onboarding when panel opens with unconfigured strategy
        useEffect(() => {
          if (reconPanelOpen && gmIsUnconfigured && gmOnboardStep === 0 && myRoster?.players?.length) {
            // Don't auto-trigger if welcome just showed
            const welcomeKey = 'wr_welcomed_' + currentLeague?.league_id;
            if (reconMessages.length <= 1 || reconMessages[0]?.content?.includes('Alex Ingram')) return;
            startGmOnboarding();
          }
        }, [reconPanelOpen]);

        // Persist chat messages to localStorage (cap at 20 messages)
        useEffect(() => {
          if (!currentLeague?.league_id || reconMessages.length <= 1) return;
          // Don't persist if last message is loading indicator
          const last = reconMessages[reconMessages.length - 1];
          if (last?.content === '...') return;
          const toSave = reconMessages.slice(-20).map(m => ({ role: m.role, content: m.content }));
          WrStorage.set(WR_KEYS.CHAT(currentLeague.league_id), toSave);
        }, [reconMessages, currentLeague?.league_id]);

        // Compute power rankings when DHQ engine finishes or standings change
        useEffect(() => {
            if (!standings.length) return;
            function computeRankings() {
                // Use assessAllTeamsFromGlobal (batch) for consistency with League Map view
                const allAssess = (typeof window.assessAllTeamsFromGlobal === 'function' ? window.assessAllTeamsFromGlobal() : []);
                const assessMap = {};
                allAssess.forEach(a => { if (a?.rosterId) assessMap[a.rosterId] = a; });
                const ranked = standings.map(t => {
                    const r = currentLeague.rosters.find(r => r.owner_id === t.userId);
                    const totalDHQ = r?.players?.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0) || 0;
                    let healthScore = 0;
                    let tierColor = 'var(--silver)';
                    const assessment = r ? assessMap[r.roster_id] : null;
                    if (assessment) {
                        healthScore = assessment.healthScore || 0;
                        const tier = (assessment.tier || '').toUpperCase();
                        tierColor = tier === 'ELITE' ? '#D4AF37' : tier === 'CONTENDER' ? '#2ECC71' : tier === 'CROSSROADS' ? '#F0A500' : tier === 'REBUILDING' ? '#E74C3C' : 'var(--silver)';
                    }
                    return { ...t, totalDHQ, healthScore, tierColor };
                }).sort((a,b) => {
                    if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
                    return b.totalDHQ - a.totalDHQ;
                });
                setRankedTeams(ranked);
            }
            // Always compute immediately (shows DHQ-based values if LI loaded, zeros if not)
            computeRankings();
            // If LI hasn't loaded yet, poll until it does and recompute with real health scores
            if (!window.App?.LI_LOADED) {
                const interval = setInterval(() => {
                    if (window.App?.LI_LOADED) { computeRankings(); clearInterval(interval); }
                }, 1500);
                // Safety: also recompute after a short delay in case LI loaded between render and effect
                const timeout = setTimeout(() => { if (window.App?.LI_LOADED) computeRankings(); }, 500);
                return () => { clearInterval(interval); clearTimeout(timeout); };
            }
        }, [standings, currentLeague, timeRecomputeTs, statsData]);

        useEffect(() => {
            loadLeagueDetails();
        }, [currentLeague]);

        async function loadLeagueDetails() {
            try {
                if (!currentLeague.rosters || !currentLeague.users) {
                    throw new Error('League missing roster or user data');
                }

                const myRosterData = currentLeague.rosters.find(r => r.owner_id === sleeperUserId);
                setMyRoster(myRosterData);

                // Compute standings immediately (no fetch needed)
                const standingsData = currentLeague.rosters.map(roster => {
                    const user = currentLeague.users.find(u => u.user_id === roster.owner_id);
                    return {
                        rosterId: roster.roster_id,
                        userId: roster.owner_id,
                        displayName: user?.display_name || user?.username || 'Unknown',
                        avatar: user?.avatar,
                        wins: roster.settings?.wins || 0,
                        losses: roster.settings?.losses || 0,
                        ties: roster.settings?.ties || 0,
                        pointsFor: roster.settings?.fpts || 0,
                        division: roster.settings?.division || 0
                    };
                }).sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    if (a.losses !== b.losses) return a.losses - b.losses;
                    return b.pointsFor - a.pointsFor;
                });
                setStandings(standingsData);

                // Show dashboard immediately with what we have
                setLoading(false);
                setLoadStage('Loading player data...');

                // Fire ALL data fetches in parallel
                const currentWeek = currentLeague.settings?.leg || 1;
                const [stats, projections, prevStats, players, tradedPicks, matchupsData] = await Promise.all([
                    fetchSeasonStats(currentLeague.season).catch(() => ({})),
                    fetchSeasonProjections(currentLeague.season).catch(() => ({})),
                    fetchSeasonStats(STATS_YEAR).catch(() => ({})),
                    fetchAllPlayers().catch(() => ({})),
                    fetchJSON(`${SLEEPER_BASE_URL}/league/${currentLeague.id}/traded_picks`).catch(() => []),
                    fetchJSON(`${SLEEPER_BASE_URL}/league/${currentLeague.id}/matchups/${currentWeek}`).catch(() => []),
                ]);

                setStatsData(stats);
                setProjectionsData(projections);
                setStats2025Data(prevStats);
                setPlayersData(players);
                setLoadStage('Computing values...');

                // Bridge to DHQ engine immediately
                if (window.App) {
                    if (!window.S) window.S = {};
                    window.S.players = players || {};
                    window.S.playerStats = {};
                    window.S.rosters = currentLeague.rosters || [];
                    window.S.leagueUsers = currentLeague.users || [];
                    window.S.leagues = [{ league_id: currentLeague.id, name: currentLeague.name, scoring_settings: currentLeague.scoring_settings, roster_positions: currentLeague.roster_positions, settings: currentLeague.settings }];
                    window.S.currentLeagueId = currentLeague.id;
                    window.S.season = activeYear;
                    window.S.nflState = { season: activeYear };
                    window.S.tradedPicks = tradedPicks || [];
                    window.S.matchups = matchupsData || [];
                    window.S.myRosterId = myRosterData?.roster_id;
                    window.S.myUserId = sleeperUserId;
                    // Bridge user object so dhqBuildRosterContext can identify the owner
                    window.S.user = { user_id: sleeperUserId, display_name: sleeperUsername, username: sleeperUsername };

                    // Bridge helper functions for dhq-ai.js context builders
                    const _p = players || {};
                    window.myR = () => (window.S.rosters || []).find(r => r.roster_id === window.S.myRosterId);
                    window.pName = pid => _p[pid]?.full_name || pid;
                    window.pPos = pid => _p[pid]?.position || '';
                    window.pAge = pid => _p[pid]?.age || 0;
                    window.pM = pos => { if (['DE','DT'].includes(pos)) return 'DL'; if (['CB','S','FS','SS'].includes(pos)) return 'DB'; if (['OLB','ILB','MLB'].includes(pos)) return 'LB'; return pos; };
                    window.dynastyValue = pid => window.App?.LI?.playerScores?.[pid] || 0;
                    window.getFAAB = () => {
                        const league = window.S.leagues?.[0];
                        const my = window.myR();
                        const isFAAB = (league?.settings?.waiver_type === 2) || (league?.settings?.waiver_budget > 0);
                        const budget = isFAAB ? (league?.settings?.waiver_budget || 0) : 0;
                        const spent = my?.settings?.waiver_budget_used || 0;
                        const minBid = isFAAB ? (league?.settings?.waiver_budget_min ?? 0) : 0;
                        return { budget, spent, remaining: Math.max(0, budget - spent), isFAAB, minBid };
                    };
                    window.loadMentality = () => {
                        const gm = window._wrGmStrategy || {};
                        const modeMap = { contend: 'winnow', rebuild: 'rebuild', balanced: 'balanced' };
                        return { mentality: modeMap[gm.mode] || 'balanced', neverDrop: (gm.untouchable || []).map(pid => _p[pid]?.full_name || pid).join(', '), notes: gm.notes || '' };
                    };
                    window.App.myR = window.myR;
                    window.App.pName = window.pName;
                    window.App.pPos = window.pPos;
                    window.App.pAge = window.pAge;
                    window.App.pM = window.pM;
                    window.App.dynastyValue = window.dynastyValue;
                    window.App.getFAAB = window.getFAAB;
                    window.App.loadMentality = window.loadMentality;

                    // Load AI keys from localStorage so callClaude can use them
                    const savedProvider = localStorage.getItem('dynastyhq_provider') || 'gemini';
                    const savedKey = localStorage.getItem('dynastyhq_' + savedProvider + '_key') || localStorage.getItem('dynastyhq_gemini_key') || localStorage.getItem('dynastyhq_anthropic_key') || '';
                    if (savedKey) { window.S.aiProvider = savedProvider; window.S.apiKey = savedKey; }

                    // Bridge stats data — use prevStats (2025) as base, overlay current season
                    Object.entries(prevStats).forEach(([pid, s]) => {
                        if (!window.S.playerStats[pid]) window.S.playerStats[pid] = {};
                        const pts = calcRawPts(s);
                        const gp = s.gp || 0;
                        window.S.playerStats[pid].prevTotal = pts ? Math.round(pts * 10) / 10 : 0;
                        window.S.playerStats[pid].prevAvg = gp > 0 ? Math.round(pts / gp * 10) / 10 : 0;
                        window.S.playerStats[pid].prevRawStats = s;
                    });
                    // Overlay current season stats if available
                    Object.entries(stats).forEach(([pid, s]) => {
                        if (!window.S.playerStats[pid]) window.S.playerStats[pid] = {};
                        const pts = calcRawPts(s);
                        const gp = s.gp || 0;
                        if (gp > 0) {
                            window.S.playerStats[pid].seasonTotal = pts ? Math.round(pts * 10) / 10 : 0;
                            window.S.playerStats[pid].seasonAvg = Math.round(pts / gp * 10) / 10;
                        }
                    });

                    // Mirror to SeasonContext so tab components can use React state
                    setSeasonCtxData({
                        season: activeYear,
                        playerStats: window.S.playerStats,
                        tradedPicks: tradedPicks || [],
                        rosters: currentLeague.rosters || [],
                        myRosterId: myRosterData?.roster_id || null,
                        lastUpdated: Date.now(),
                    });
                }

                setLoadStage('Building league intelligence...');

                // Fire DHQ engine + transactions + trending ALL in parallel
                await Promise.all([
                    // DHQ engine
                    (async () => {
                        if (typeof window.App?.loadLeagueIntel === 'function' && !window.App.LI_LOADED) {
                            setDhqStatus({ loading: true, step: 'Analyzing league history...', progress: 20 });
                            try {
                                await window.App.loadLeagueIntel();
                                console.log('[War Room] DHQ engine loaded:', Object.keys(window.App.LI?.playerScores || {}).length, 'players valued');
                                setDhqStatus({ loading: false, step: 'Complete!', progress: 100 });
                                setStatsData(prev => ({...prev})); // force re-render
                                setTimeRecomputeTs(Date.now()); // refresh KPIs and rankings
                            } catch(e) {
                                console.warn('[War Room] DHQ engine error:', e);
                                setDhqStatus({ loading: false, step: 'Error: ' + e.message, progress: 0 });
                            }
                        }
                    })(),
                    // Transactions (last 3 weeks)
                    (async () => {
                        try {
                            const nflState = await fetchJSON(`${SLEEPER_BASE_URL}/state/nfl`).catch(() => ({}));
                            if (nflState && window.S) window.S.nflState = nflState;
                            const currentWeek = nflState?.display_week || nflState?.week || 1;
                            const isOffseason = !nflState?.season_type || nflState.season_type === 'off' || currentWeek <= 1;
                            const weekFetches = [];
                            if (isOffseason) {
                                // During offseason, fetch weeks 0-18 to capture all offseason trades
                                for (let w = 0; w <= 18; w++) {
                                    weekFetches.push(fetchJSON(`${SLEEPER_BASE_URL}/league/${currentLeague.id}/transactions/${w}`).catch(() => []));
                                }
                            } else {
                                for (let w = Math.max(0, currentWeek - 3); w <= Math.min(18, currentWeek); w++) {
                                    weekFetches.push(fetchJSON(`${SLEEPER_BASE_URL}/league/${currentLeague.id}/transactions/${w}`).catch(() => []));
                                }
                            }
                            const weekResults = await Promise.all(weekFetches);
                            let allTxns = weekResults.flat().filter(t => t && t.type && t.status !== 'failed').sort((a,b) => (b.created || 0) - (a.created || 0));
                            // Also merge DHQ historical trades if available and current fetch is sparse
                            if (allTxns.filter(t => t.type === 'trade').length === 0 && window.App?.LI?.tradeHistory?.length > 0) {
                                const histTrades = window.App.LI.tradeHistory.map(t => ({ ...t, type: 'trade', status: 'complete', created: t.ts || 0, _fromDHQ: true }));
                                allTxns = [...allTxns, ...histTrades].sort((a,b) => (b.created || 0) - (a.created || 0));
                            }
                            setTransactions(allTxns.slice(0, 50));
                        } catch(e) { console.warn('Transaction fetch error:', e); }
                    })(),
                    // Trending
                    (async () => {
                        if (window.Sleeper?.fetchTrending) {
                            try {
                                const [adds, drops] = await Promise.all([
                                    window.Sleeper.fetchTrending('add', 24, 15),
                                    window.Sleeper.fetchTrending('drop', 24, 15)
                                ]);
                                setTrending({ adds: adds || [], drops: drops || [] });
                            } catch(e) { window.wrLog('trending.fetch', e); }
                        }
                    })(),
                ]);

                setLoadStage('');

                // Load player tags (syncs with ReconAI)
                if (window.OD?.loadPlayerTags) {
                    window.OD.loadPlayerTags(currentLeague.id || currentLeague.league_id).then(tags => {
                        window._playerTags = tags || {};
                        setTimeRecomputeTs(Date.now()); // force re-render to show tags
                    }).catch(err => window.wrLog('tags.load', err));
                }

            } catch (err) {
                console.error('Failed to load league details:', err);
                setError(err.message || 'Failed to load league details');
                setLoading(false);
                setLoadStage('');
            }
        }

        async function switchYear(year) {
            if (year === activeYear) return;
            setLoading(true);
            setError(null);
            setActiveYear(year);
            setTimeYear(parseInt(year));
            try {
                const targetYear = parseInt(year);
                const currentYear = parseInt(activeYear);
                let targetLeagueId = null;

                if (targetYear < currentYear) {
                    // Going backward: walk previous_league_id chain
                    let leagueId = currentLeague.id;
                    for (let y = currentYear; y > targetYear && leagueId; y--) {
                        const leagueInfo = await fetchLeagueInfo(leagueId);
                        leagueId = leagueInfo?.previous_league_id || null;
                    }
                    targetLeagueId = leagueId;
                } else {
                    // Going forward: get user leagues for target year, then check which one chains back to current league
                    const userLeagues = await fetchUserLeagues(sleeperUserId, year);
                    for (const lg of userLeagues) {
                        // Walk this league's previous_league_id chain to see if it connects to our current league
                        let checkId = lg.previous_league_id;
                        let steps = targetYear - currentYear;
                        while (steps > 1 && checkId) {
                            const info = await fetchLeagueInfo(checkId);
                            checkId = info?.previous_league_id || null;
                            steps--;
                        }
                        if (checkId === currentLeague.id) {
                            targetLeagueId = lg.league_id;
                            break;
                        }
                    }
                    // Fallback: match by name if chain doesn't connect
                    if (!targetLeagueId) {
                        const nameMatch = userLeagues.find(l => l.name === currentLeague.name);
                        targetLeagueId = nameMatch ? nameMatch.league_id : (userLeagues[0] ? userLeagues[0].league_id : null);
                    }
                }

                if (!targetLeagueId) {
                    setError('No leagues found for ' + year);
                    setLoading(false);
                    return;
                }

                const [leagueInfo, rosters, users] = await Promise.all([
                    fetchLeagueInfo(targetLeagueId),
                    fetchLeagueRosters(targetLeagueId),
                    fetchLeagueUsers(targetLeagueId)
                ]);
                setViewingOwnerId(sleeperUserId);
                setCurrentLeague({
                    id: targetLeagueId,
                    name: leagueInfo.name,
                    season: year,
                    scoring_settings: leagueInfo.scoring_settings || {},
                    roster_positions: leagueInfo.roster_positions || [],
                    settings: leagueInfo.settings || {},
                    rosters,
                    users
                });
            } catch (err) {
                console.error('Failed to switch year:', err);
                setError('Failed to load ' + year + ' data');
                setLoading(false);
            }
        }

        function getPlayerName(playerId) {
            const player = playersData[playerId];
            if (!player) return `Player ${playerId}`;
            return player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || `Player ${playerId}`;
        }

        function getPlayerPosition(playerId) {
            const player = playersData[playerId];
            return player?.position || '??';
        }

        function getPlayerTeam(playerId) {
            const player = playersData[playerId];
            return player?.team || '';
        }

        // Compute fantasy pts using the league's actual scoring_settings weights,
        // applied to raw stat fields — works for both offensive and IDP players.
        // Mirrors the Team Comps page's fantasyPointsFromScoring() approach:
        // always use scoring_settings when available so IDP defensive stats aren't
        // silently zeroed out by Sleeper's pre-calculated pts_half_ppr = 0.
        function calcRawPts(s) {
            return window.App.calcRawPts(s, currentLeague?.scoring_settings);
        }

        function getPlayerStats(playerId) {
            const player = playersData[playerId];
            // Always show STATS_YEAR totals; fall back to current-season data for historical year views
            const s = stats2025Data[playerId] || statsData[playerId];
            const p = projectionsData[playerId];

            // Years of experience
            const yrs = player?.years_exp != null ? player.years_exp : '-';

            // Fantasy points — uses league scoring_settings for IDP players
            const rawPts = calcRawPts(s);
            const pts = rawPts !== null ? Number(rawPts).toFixed(1) : '-';

            // Games played
            const gp = s?.gp != null ? s.gp : '-';

            // Average points per game
            let avg = '-';
            if (rawPts !== null && s?.gp && s.gp > 0) {
                avg = (rawPts / s.gp).toFixed(1);
            }

            // Projected points — use Sleeper projections when available, otherwise 2025 season totals
            const rawProj = p ? (p.pts_half_ppr ?? p.pts_ppr ?? p.pts_std ?? null) : null;
            const rawPts2025 = calcRawPts(stats2025Data[playerId]);
            const proj = rawProj !== null ? Number(rawProj).toFixed(1) : (rawPts2025 !== null ? Number(rawPts2025).toFixed(1) : '-');

            return { yrs, pts, gp, avg, proj };
        }

        function getPositionColor(pos) {
            const colors = { QB: '#FF6B6B', RB: '#4ECDC4', WR: '#45B7D1', TE: '#F7DC6F', K: '#BB8FCE', DEF: '#85929E' };
            return colors[pos] || 'var(--silver)';
        }

        // Dashboard helpers
        function timeAgo(ts) {
            if (!ts) return '';
            // Sleeper API returns seconds; convert to ms. Guard against already-ms values.
            const tsMs = ts > 1e12 ? ts : ts * 1000;
            const diff = Date.now() - tsMs;
            if (diff < 0) return 'just now';
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return mins + 'm ago';
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return hrs + 'h ago';
            const days = Math.floor(hrs / 24);
            if (days < 30) return days + 'd ago';
            return Math.floor(days / 30) + 'mo ago';
        }

        function getOwnerName(rosterId) {
            const roster = currentLeague.rosters?.find(r => r.roster_id === rosterId);
            const user = currentLeague.users?.find(u => u.user_id === roster?.owner_id);
            return user?.display_name || user?.username || 'Unknown';
        }

        function computeDataDrivenHero() {
            const parts = [];
            if (rankedTeams.length) {
                const top = rankedTeams[0];
                const myRank = rankedTeams.findIndex(t => t.userId === sleeperUserId) + 1;
                parts.push(top.displayName + ' leads the power rankings with a ' + top.healthScore + ' health score and ' + top.wins + '-' + top.losses + ' record.');
                if (myRank && myRank !== 1) {
                    const me = rankedTeams[myRank - 1];
                    parts.push('You sit at #' + myRank + ' (' + me.wins + '-' + me.losses + ') with ' + (me.totalDHQ||0).toLocaleString() + ' total DHQ.');
                } else if (myRank === 1) {
                    parts.push('You hold the top spot in the league.');
                }
            }
            const recentTrade = transactions.find(t => t.type === 'trade');
            if (recentTrade) {
                const addPids = Object.keys(recentTrade.adds || {});
                const names = addPids.slice(0, 2).map(pid => getPlayerName(pid)).filter(Boolean).join(' and ');
                if (names) parts.push('Latest trade: ' + names + ' changed hands between ' + getOwnerName(recentTrade.roster_ids?.[0]) + ' and ' + getOwnerName(recentTrade.roster_ids?.[1]) + '.');
            }
            return parts.join(' ') || 'Welcome to your War Room. League intelligence is loading.';
        }

        async function generateHeroStory() {
            // Try AI first, fall back to data-driven
            if (typeof dhqAI === 'function' || typeof window.dhqAI === 'function' || typeof window.callClaude === 'function') {
                setHeroStory('Generating...');
                try {
                    const ctx = typeof dhqContext === 'function' ? dhqContext(true) : '';
                    const prompt = "Write a 3-4 sentence sports journalist narrative about the current state of this dynasty league. Focus on the biggest storyline this week — trades, injuries, power shifts, or playoff implications. Write in the style of The Athletic — dramatic, informed, specific. Use owner names and player names when possible.";
                    const aiFn = typeof dhqAI === 'function' ? dhqAI : window.dhqAI;
                    const reply = await aiFn('home-chat', prompt, ctx);
                    if (reply) { setHeroStory(reply); return; }
                } catch(e) { console.warn('Hero story AI failed, using data-driven:', e); }
            }
            setHeroStory(computeDataDrivenHero());
        }

        async function generateAiStories() {
            setAiStories([{ icon: '\u23F3', category: 'Generating...', headline: 'Analyzing league data...', body: '' }]);
            try {
                const stories = [];
                const trades = transactions.filter(t => t.type === 'trade');
                if (trades.length > 0) {
                    const bigTrade = trades[0];
                    const addPids = Object.keys(bigTrade.adds || {});
                    const addNames = addPids.slice(0, 3).map(pid => getPlayerName(pid)).join(', ');
                    const totalVal = addPids.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                    stories.push({
                        icon: '\uD83E\uDD1D', category: 'Trade of the Week',
                        headline: addNames ? addNames + ' change hands in blockbuster deal' : 'Latest trade shakes up league landscape',
                        body: getOwnerName(bigTrade.roster_ids?.[0]) + ' and ' + getOwnerName(bigTrade.roster_ids?.[1]) + ' swapped ' + addPids.length + ' player' + (addPids.length !== 1 ? 's' : '') + '. Combined DHQ value: ' + totalVal.toLocaleString() + '.'
                    });
                } else {
                    stories.push({ icon: '\uD83E\uDD1D', category: 'Trade Watch', headline: 'Trade market remains quiet', body: 'No trades completed recently. The league is in a holding pattern.' });
                }
                if (rankedTeams.length > 0) {
                    const top = rankedTeams[0];
                    const bottom = rankedTeams[rankedTeams.length - 1];
                    stories.push({
                        icon: '\uD83D\uDCCA', category: 'Power Shift',
                        headline: top.displayName + ' holds the top spot in power rankings',
                        body: 'Health score of ' + top.healthScore + ' and ' + top.totalDHQ.toLocaleString() + ' total DHQ. ' + top.displayName + ' leads at ' + top.wins + '-' + top.losses + '. ' + bottom.displayName + ' trails at #' + rankedTeams.length + '.'
                    });
                }
                if (myRoster?.players?.length) {
                    const agingPlayers = myRoster.players
                        .map(pid => ({ pid, player: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                        .filter(p => p.player && p.player.age >= 29 && p.dhq > 1000)
                        .sort((a,b) => b.dhq - a.dhq)
                        .slice(0, 3);
                    if (agingPlayers.length > 0) {
                        const names = agingPlayers.map(p => (p.player.full_name || getPlayerName(p.pid)) + ' (' + p.player.age + ')').join(', ');
                        stories.push({ icon: '\u23F0', category: 'Aging Watch', headline: 'Your veterans with declining windows', body: names + ' \u2014 high-value assets past peak age. Consider selling high before value erodes.' });
                    } else {
                        stories.push({ icon: '\uD83C\uDF31', category: 'Youth Movement', headline: 'Your roster skews young', body: 'No significant aging concerns. Your dynasty foundation is built for the long haul.' });
                    }
                }
                if (typeof dhqAI === 'function' && window.App?.LI_LOADED) {
                    try {
                        const ctx = dhqContext(true);
                        const reply = await dhqAI('home-chat', 'Write one punchy 2-sentence sports headline and body about the most interesting dynasty angle in this league right now. Focus on a specific team or player. Format exactly: HEADLINE: [headline]\\nBODY: [body]', ctx);
                        if (reply) {
                            const headlineMatch = reply.match(/HEADLINE:\s*(.+)/i);
                            const bodyMatch = reply.match(/BODY:\s*(.+)/is);
                            if (headlineMatch) {
                                stories.push({ icon: '\uD83E\uDD16', category: 'AI Insight', headline: headlineMatch[1].trim(), body: bodyMatch ? bodyMatch[1].trim() : reply });
                            }
                        }
                    } catch(e) { window.wrLog('aiStory.generate', e); }
                }
                setAiStories(stories.slice(0, 3));
            } catch(e) {
                console.warn('AI stories error:', e);
                setAiStories([{ icon: '\u26A0\uFE0F', category: 'Error', headline: 'Could not generate stories', body: 'Please try again later.' }]);
            }
        }

        // GM Onboarding wizard — conversational strategy setup
        function startGmOnboarding() {
          if (gmOnboardStep > 0) return;
          setGmOnboardStep(1);
          setReconMessages([{
            role: 'assistant',
            content: 'Welcome to the War Room. I\'m Alex — your AI General Manager. Before we get started, let me learn how you want to run this team.\n\n**First things first — are we competing for a title this year, or building for the future?**',
            onboardChoices: [
              { label: 'Win Now', value: 'contend' },
              { label: 'Balanced', value: 'balanced' },
              { label: 'Rebuilding', value: 'rebuild' }
            ]
          }]);
        }

        function handleOnboardChoice(value) {
          const step = gmOnboardStep;
          if (step === 1) {
            const modeLabels = { contend: 'Win Now', balanced: 'Balanced', rebuild: 'Rebuilding' };
            setGmStrategy(prev => ({ ...prev, mode: value }));
            setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined })),
              { role: 'user', content: modeLabels[value] },
              { role: 'assistant', content: value === 'contend'
                ? 'Aggressive. I like it. We\'re going all-in.\n\n**How do you want to play it — conservative and calculated, or willing to swing big?**'
                : value === 'rebuild'
                ? 'Smart. Let\'s stack assets and build a dynasty.\n\n**How aggressive should we be with trades — swing for the fences, or play it safe?**'
                : 'Flexible. We\'ll compete while keeping an eye on the future.\n\n**How aggressive should we be with trades?**',
                onboardChoices: [
                  { label: 'Conservative', value: 'conservative' },
                  { label: 'Moderate', value: 'moderate' },
                  { label: 'Aggressive', value: 'aggressive' }
                ]
              }
            ]);
            setGmOnboardStep(2);
          } else if (step === 2) {
            setGmStrategy(prev => ({ ...prev, riskTolerance: value }));
            const topPlayers = (myRoster?.players || [])
              .sort((a, b) => (window.App?.LI?.playerScores?.[b] || 0) - (window.App?.LI?.playerScores?.[a] || 0))
              .slice(0, 6);
            setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined })),
              { role: 'user', content: value.charAt(0).toUpperCase() + value.slice(1) },
              { role: 'assistant', content: 'Got it.\n\n**Anyone on your roster you\'d never trade? Your untouchables.** Tap to select — or skip if everyone has a price.',
                onboardChoices: topPlayers.map(pid => ({
                  label: (playersData[pid]?.full_name || pid),
                  value: pid,
                  multi: true
                })),
                onboardMulti: true,
                onboardSkip: true
              }
            ]);
            setGmOnboardStep(3);
          } else if (step === 3) {
            // value is array of pids or 'skip'
            if (value !== 'skip' && Array.isArray(value) && value.length) {
              setGmStrategy(prev => ({ ...prev, untouchable: value }));
              const names = value.map(pid => playersData[pid]?.full_name || pid).join(', ');
              setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined, onboardMulti: undefined, onboardSkip: undefined })),
                { role: 'user', content: 'Untouchable: ' + names }
              ]);
            } else {
              setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined, onboardMulti: undefined, onboardSkip: undefined })),
                { role: 'user', content: 'Everyone has a price' }
              ]);
            }
            setReconMessages(prev => [...prev,
              { role: 'assistant', content: '**Last question — any positions you\'re actively targeting in trades?** Tap all that apply, or skip.',
                onboardChoices: ['QB','RB','WR','TE','DL','LB','DB','Picks'].map(t => ({ label: t, value: t, multi: true })),
                onboardMulti: true,
                onboardSkip: true
              }
            ]);
            setGmOnboardStep(4);
          } else if (step === 4) {
            if (value !== 'skip' && Array.isArray(value) && value.length) {
              setGmStrategy(prev => ({ ...prev, targets: value }));
              setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined, onboardMulti: undefined, onboardSkip: undefined })),
                { role: 'user', content: 'Targeting: ' + value.join(', ') }
              ]);
            } else {
              setReconMessages(prev => [...prev.map(m => ({ ...m, onboardChoices: undefined, onboardMulti: undefined, onboardSkip: undefined })),
                { role: 'user', content: 'No specific targets' }
              ]);
            }
            setGmOnboardStep(5);
            // Generate strategy assessment
            setReconMessages(prev => [...prev, { role: 'assistant', content: '...' }]);
            (async () => {
              try {
                const ctx = typeof dhqContext === 'function' ? dhqContext(false) : '';
                const reply = typeof dhqAI === 'function'
                  ? await dhqAI('strategy-analysis', 'Give me a 3-sentence personalized strategic assessment of my team based on my GM strategy settings. Be direct and specific.', ctx)
                  : 'Strategy saved. Ask me anything about your team.';
                setReconMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: reply };
                  return updated;
                });
              } catch (e) {
                setReconMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content: 'Strategy locked in. Let\'s get to work — ask me anything. — Alex' };
                  return updated;
                });
              }
            })();
          }
        }

        // Multi-select state for onboarding
        const [onboardSelections, setOnboardSelections] = useState([]);

        // ReconAI: send message
        async function sendReconMessage(text) {
          if (!text?.trim()) return;
          // Free tier: 1 AI call per day
          if (!canUseAI()) {
            setReconMessages(prev => [...prev, { role: 'user', content: text.trim() }, { role: 'assistant', content: 'You\'ve used your free AI query for today. Upgrade to ReconAI ($4.99/mo) or War Room ($9.99/mo) for unlimited AI access.' }]);
            return;
          }
          trackAIUse();
          setReconInput('');
          const userMsg = { role: 'user', content: text.trim() };
          setReconMessages(prev => [...prev, userMsg, { role: 'assistant', content: '...' }]);
          try {
            let context = '';
            if (typeof dhqContext === 'function') context = dhqContext(true);
            const messages = [...reconMessages.slice(-4), userMsg].map((m, i, arr) => {
              if (m.role === 'user' && i === arr.length - 1) {
                return { role: 'user', content: context + '\n\n' + m.content };
              }
              if (m.role === 'assistant' && m.content.length > 400) {
                return { role: 'assistant', content: m.content.substring(0, 400) + '...' };
              }
              return m;
            });
            // Route requests to optimal prompt type
            const isScoutRequest = /^Scout\s/i.test(text.trim());
            const isRookieScout = /SEARCH FOR CURRENT INFO.*scouting report|Full dynasty scouting report/i.test(text.trim());
            const aiType = isRookieScout ? 'rookie-scout' : isScoutRequest ? 'trade-scout' : 'home-chat';
            const reply = typeof dhqAI === 'function'
              ? await dhqAI(aiType, null, null, { messages })
              : typeof callClaude === 'function'
                ? await callClaude(messages)
                : 'AI not available. Add an API key in Settings.';
            setReconMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: reply };
              return updated;
            });
          } catch(e) {
            console.warn('[Alex Ingram] AI error:', e.message);
            setReconMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: 'Error: ' + e.message };
              return updated;
            });
          }
        }

        // ReconAI: contextual chips
        function getReconChips() {
          const base = [
            { label: 'What should I do?', prompt: 'What are the top 3 moves I should make right now?' },
          ];
          // Contextual starter prompt based on current tab
          const starters = {
            analytics: { label: 'What are my biggest weaknesses?', prompt: 'Analyze my team and tell me what my biggest weaknesses are — positional gaps, age concerns, and depth issues.' },
            myteam: { label: 'Who should I trade?', prompt: 'Looking at my roster, which players should I be actively trying to trade and what kind of return should I target?' },
            trades: { label: 'Best trade partner right now?', prompt: 'Which owner in my league is the best trade partner for me right now? Consider roster needs, tendencies, and mutual fit.' },
            fa: { label: 'Best waiver pickup this week?', prompt: 'Who is the best waiver wire pickup I should target this week based on my roster needs and available players?' },
            draft: { label: 'Best pick at my spot?', prompt: 'Given my draft position and roster needs, who is the best player I should target with my next pick?' },
          };
          const starter = starters[activeTab];
          const chips = starter ? [starter, ...base] : [...base];

          if (activeTab === 'brief') return [...chips,
            { label: 'Top 3 moves', prompt: 'What are the top 3 moves I should make right now?' },
            { label: 'League pulse', prompt: 'Give me a quick pulse check on my league — who is rising, falling, and what moves are being made.' },
          ];
          if (activeTab === 'dashboard') return [...chips,
            { label: 'League recap', prompt: 'Summarize the key storylines in my league right now.' },
            { label: 'Power rankings', prompt: 'Give me your power rankings for this league with one-line analysis per team.' },
          ];
          if (activeTab === 'myteam') return [...chips,
            { label: 'Roster grade', prompt: 'Grade my roster position by position and identify the biggest weakness.' },
            { label: 'Who to sell?', prompt: 'Which players on my roster should I sell high on right now?' },
          ];
          if (activeTab === 'league') return [...chips,
            { label: 'League overview', prompt: 'Give me a quick overview of every team in the league — strengths, weaknesses, and dynasty outlook.' },
            { label: 'Trade partners', prompt: 'Which teams in the league are the best trade partners for me right now and why?' },
          ];
          if (activeTab === 'analytics') return [...chips,
            { label: 'Explain my gaps', prompt: 'Based on the winner analysis, what are my biggest gaps and how do I close them?' },
            { label: 'Draft strategy', prompt: 'Based on historical draft success in this league, what should my draft strategy be?' },
          ];
          if (activeTab === 'trades') return [...chips,
            { label: 'Best trade targets', prompt: 'Who are my best trade targets right now based on roster needs and trade partner compatibility?' },
            { label: 'Sell high candidates', prompt: 'Which players on my roster should I sell high on in a trade?' },
          ];
          if (activeTab === 'fa') return [...chips,
            { label: 'Best pickup?', prompt: 'Who is the best available free agent I should target right now?' },
            { label: 'FAAB advice', prompt: 'How should I spend my remaining FAAB budget?' },
          ];
          if (activeTab === 'draft') return [...chips,
            { label: 'Who at my pick?', prompt: 'Who should I target with my draft picks this year?' },
            { label: 'Draft strategy', prompt: 'What should my draft strategy be based on my roster needs?' },
          ];
          return chips;
        }

        if (error) {
            return (
                <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ color: '#E74C3C', fontSize: '1.5rem', marginBottom: '1rem' }}>Error Loading League</div>
                    <div style={{ color: 'var(--silver)', marginBottom: '2rem' }}>{error}</div>
                    <button onClick={onBack} style={{ padding: '0.75rem 1.5rem', background: 'var(--gold)', border: 'none', borderRadius: '8px', color: 'var(--black)', fontFamily: 'Oswald, sans-serif', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }}>← Back to Dashboard</button>
                </div>
            );
        }

        if (loading) {
            return (
                <div className="app-container" style={{ paddingBottom: '60px' }}>
                    {/* Skeleton left nav */}
                    <div style={{ position:'fixed', left:0, top:0, bottom:0, width:'160px', background:'var(--black)', borderRight:'1px solid rgba(212,175,55,0.2)', padding:'16px 0', zIndex:100 }}>
                        <div style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.3rem', color:'var(--gold)', padding:'0 16px', marginBottom:'20px' }}>WAR ROOM</div>
                        {['Home','My Team','League','Analytics','Trades','Free Agency','Draft'].map((label,i) => (
                            <div key={i} style={{ padding:'10px 16px', fontSize:'0.82rem', fontFamily:'Oswald,sans-serif', color: i===0?'var(--gold)':'rgba(255,255,255,0.3)', borderLeft: i===0?'3px solid var(--gold)':'3px solid transparent', background: i===0?'rgba(212,175,55,0.12)':'transparent' }}>{label}</div>
                        ))}
                    </div>
                    {/* Skeleton main content */}
                    <div style={{ marginLeft:'160px', padding:'24px 32px' }}>
                        <div style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.1rem', color:'var(--gold)', marginBottom:'16px' }}>{currentLeague.name}</div>
                        {/* KPI skeleton row */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'12px', marginBottom:'24px' }}>
                            <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
                        </div>
                        {/* Hero skeleton */}
                        <div className="skel-card" style={{ height:'120px', marginBottom:'20px' }}>
                            <div className="skel skel-line" style={{ width:'70%' }} />
                            <div className="skel skel-line" style={{ width:'90%' }} />
                            <div className="skel skel-line" style={{ width:'50%' }} />
                        </div>
                        {/* Two-column skeleton */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
                            <div className="skel-card"><div className="skel skel-line" style={{width:'40%',marginBottom:'12px'}} /><SkeletonRows count={5} /></div>
                            <div className="skel-card"><div className="skel skel-line" style={{width:'40%',marginBottom:'12px'}} /><SkeletonRows count={5} /></div>
                        </div>
                    </div>
                </div>
            );
        }

        // Currently viewed roster
        const viewingRoster = currentLeague.rosters.find(r => r.owner_id === viewingOwnerId) || myRoster;
        const viewingOwner = standings.find(t => t.userId === viewingOwnerId);
        const isViewingMyTeam = viewingOwnerId === sleeperUserId;

        // Stat column style shared by header and rows
        const statColStyle = { width: '42px', textAlign: 'center', fontSize: '0.76rem', flexShrink: 0 };

        // Column header row for stat columns — merged into section labels
        const statLabels = ['DHQ', 'YRS', 'PTS', 'GP', 'AVG', 'PROJ'];

        function SectionLabel({ label, color, borderColor, borderWidth }) {
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    paddingBottom: '0.4rem',
                    borderBottom: `${borderWidth || '1px'} solid ${borderColor || color}`,
                    gap: '0.5rem'
                }}>
                    <span style={{ width: '36px', flexShrink: 0 }}></span>
                    <span style={{ flex: 1, color: color, fontSize: '0.85rem', fontWeight: '700', letterSpacing: '0.08em' }}>{label}</span>
                    {statLabels.map(l => (
                        <span key={l} style={{ ...statColStyle, color: 'var(--gold)', fontWeight: '700', letterSpacing: '0.05em', opacity: 0.8 }}>{l}</span>
                    ))}
                </div>
            );
        }

        // PlayerRow with gold position box, clickable name, 5 stat columns
        function PlayerRow({ playerId, section }) {
            const pos = getPlayerPosition(playerId);
            const stats = getPlayerStats(playerId);
            const team = getPlayerTeam(playerId);
            const borderColor = section === 'starter' ? 'var(--gold)' : section === 'ir' ? '#E74C3C' : section === 'taxi' ? '#3498DB' : 'transparent';
            const bgColor = section === 'starter' ? 'rgba(212, 175, 55, 0.05)' : section === 'ir' ? 'rgba(231, 76, 60, 0.05)' : section === 'taxi' ? 'rgba(52, 152, 219, 0.05)' : 'rgba(255, 255, 255, 0.02)';
            return (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.45rem 0.6rem',
                    marginBottom: '0.3rem',
                    background: bgColor,
                    borderLeft: borderColor !== 'transparent' ? `3px solid ${borderColor}` : 'none',
                    borderRadius: '4px',
                    gap: '0.5rem'
                }}>
                    {/* Gold position box */}
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        flexShrink: 0,
                        fontSize: '0.76rem',
                        fontWeight: '700',
                        color: getPositionColor(pos),
                        border: '1.5px solid var(--gold)',
                        borderRadius: '3px',
                        padding: '2px 0',
                        background: 'rgba(212, 175, 55, 0.08)',
                        letterSpacing: '0.02em'
                    }}>
                        {pos}
                    </span>
                    {/* Player name + team — opens shared player card */}
                    <a
                        href="#"
                        onClick={e => { e.preventDefault(); if (window._wrSelectPlayer) window._wrSelectPlayer(playerId); }}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--white)',
                            fontSize: '0.92rem',
                            overflow: 'hidden',
                            textDecoration: 'none',
                            transition: 'color 0.2s',
                            minWidth: 0,
                            cursor: 'pointer'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--gold)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--white)'}
                    >
                        <div style={{ width: '28px', height: '28px', flexShrink: 0 }}>
                        <img
                            src={`https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`}
                            alt=""
                            onError={e => { e.target.style.display = 'none'; }}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                        </div>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {getPlayerName(playerId)} <span style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.65 }}>{team}</span>
                        </span>
                    </a>
                    {/* DHQ dynasty value */}
                    {(() => {
                      const dhq = window.App?.LI?.playerScores?.[playerId] || 0;
                      if (!dhq) return <span style={{ ...statColStyle, color: 'var(--silver)', opacity: 0.6, fontSize: '0.76rem' }}>—</span>;
                      const col = dhq >= 7000 ? '#2ECC71' : dhq >= 4000 ? '#D4AF37' : dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.4)';
                      return <span style={{ ...statColStyle, color: col, fontWeight: '700', fontFamily: 'Oswald, sans-serif', fontSize: '0.72rem', minWidth: '42px' }}>{dhq.toLocaleString()}</span>;
                    })()}
                    {/* Stat columns: YRS PTS GP AVG PROJ */}
                    <span style={{ ...statColStyle, color: 'var(--silver)', opacity: 0.7 }}>{stats.yrs}</span>
                    <span style={{ ...statColStyle, color: 'var(--gold)', fontWeight: '700' }}>{stats.pts}</span>
                    <span style={{ ...statColStyle, color: 'var(--silver)', opacity: 0.7 }}>{stats.gp}</span>
                    <span style={{ ...statColStyle, color: 'var(--silver)', opacity: 0.7 }}>{stats.avg}</span>
                    <span style={{ ...statColStyle, color: '#4ECDC4', fontWeight: '600' }}>{stats.proj}</span>
                </div>
            );
        }

        // Reusable roster section renderer
        function RosterSection({ roster }) {
            if (!roster) return <div style={{ textAlign: 'center', color: 'var(--silver)', padding: '2rem' }}>No roster found</div>;
            const starters = roster.starters || [];
            const reserve = roster.reserve || [];
            const taxi = roster.taxi || [];
            const bench = (roster.players || []).filter(p => !starters.includes(p) && !reserve.includes(p) && !taxi.includes(p));

            return (
                <>
                    {starters.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <SectionLabel label="STARTERS" color="var(--gold)" borderColor="var(--gold)" borderWidth="2px" />
                            {starters.map((id, i) => <PlayerRow key={i} playerId={id} section="starter" />)}
                        </div>
                    )}
                    {bench.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <SectionLabel label="BENCH" color="var(--silver)" borderColor="rgba(255,255,255,0.15)" />
                            {bench.map((id, i) => <PlayerRow key={i} playerId={id} section="bench" />)}
                        </div>
                    )}
                    {reserve.length > 0 && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <SectionLabel label="INJURED RESERVE" color="#E74C3C" borderColor="rgba(231,76,60,0.3)" />
                            {reserve.map((id, i) => <PlayerRow key={i} playerId={id} section="ir" />)}
                        </div>
                    )}
                    {taxi.length > 0 && (
                        <div>
                            <SectionLabel label="TAXI SQUAD" color="#3498DB" borderColor="rgba(52,152,219,0.3)" />
                            {taxi.map((id, i) => <PlayerRow key={i} playerId={id} section="taxi" />)}
                        </div>
                    )}
                </>
            );
        }

        // --- My Team Tab helpers ---
        function getAcquisitionInfo(pid, rosterId) {
            // Check recent transactions (waiver claims, FA adds)
            const txns = transactions || [];
            for (const t of txns) {
                if ((t.type === 'waiver' || t.type === 'free_agent') && t.adds && t.adds[pid] != null) {
                    const cost = t.settings?.waiver_bid || 0;
                    const date = t.created ? new Date(t.created * 1000).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '\u2014';
                    return { method: t.type === 'waiver' ? 'Waiver' : 'FA', date, cost: cost > 0 ? '$' + cost : '', season: '', week: 0 };
                }
            }
            // Check trades — search both LI trade history and raw transactions
            const trades = window.App?.LI?.tradeHistory || [];
            for (const t of trades) {
                if (!t.sides) continue;
                const side = t.sides[rosterId];
                if (side && side.players && side.players.includes(pid)) {
                    const season = t.season || '';
                    const week = t.week || '';
                    return { method: 'Traded', date: season + ' W' + week, cost: '', season, week };
                }
            }
            // Fallback: check raw transaction data for trades
            for (const t of txns) {
                if (t.type === 'trade' && t.adds && t.adds[pid] === rosterId) {
                    const date = t.created ? new Date(t.created * 1000).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '\u2014';
                    return { method: 'Traded', date, cost: '', season: '', week: 0 };
                }
            }
            // Check draft outcomes
            const drafts = window.App?.LI?.draftOutcomes || [];
            const draftPick = drafts.find(d => d.pid === pid && d.roster_id === rosterId);
            if (draftPick) {
                return { method: 'Drafted', date: draftPick.season + ' R' + draftPick.round, cost: '', season: draftPick.season, week: 0 };
            }
            // Default: original/unknown
            return { method: 'Original', date: '\u2014', cost: '', season: '', week: 0 };
        }

        const _seasonCtxValue = { ...seasonCtxData, selectPlayer };

        return (
          <window.App.SeasonContext.Provider value={_seasonCtxValue}>
            <div className="app-container" style={{ paddingBottom: '60px' }}>
                {/* DHQ Loading Bubble */}
                {dhqStatus.loading && (
                    <div style={{
                        position: 'fixed', bottom: '24px', left: '80px', zIndex: 300,
                        background: 'var(--black)', border: '2px solid rgba(212,175,55,0.4)',
                        borderRadius: '16px', padding: '16px 20px', minWidth: '280px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                        animation: 'fadeSlideUp 0.3s ease'
                    }}>
                        <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes dhqSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{
                                width: '20px', height: '20px', border: '2px solid rgba(212,175,55,0.3)',
                                borderTopColor: 'var(--gold)', borderRadius: '50%',
                                animation: 'dhqSpin 0.8s linear infinite'
                            }}></div>
                            <div>
                                <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.04em' }}>BUILDING LEAGUE INTELLIGENCE</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>{dhqStatus.step}</div>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                            <div style={{
                                width: dhqStatus.progress + '%', height: '100%',
                                background: 'linear-gradient(90deg, var(--gold), #F0A500)',
                                borderRadius: '4px', transition: 'width 0.5s ease'
                            }}></div>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginTop: '6px', opacity: 0.6 }}>
                            {dhqStatus.progress < 50 ? 'Analyzing league history, stats, drafts, and transactions. First load takes ~15 seconds, then it\'s cached.' :
                             dhqStatus.progress < 80 ? 'Scoring every player in your league\'s scoring system...' :
                             'Almost done — blending market data and computing trade values.'}
                        </div>
                    </div>
                )}

                {/* Mobile hamburger toggle */}
                <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
                    display: 'none', position: 'fixed', top: '10px', left: '10px', zIndex: 201,
                    background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px',
                    padding: '6px 10px', cursor: 'pointer', color: 'var(--gold)', fontSize: '1.2rem', lineHeight: 1
                }} className="wr-hamburger">{sidebarOpen ? '\u2715' : '\u2630'}</button>
                <style>{`@media(max-width:767px){.wr-hamburger{display:block !important}.wr-sidebar{transform:translateX(-100%)}.wr-sidebar.open{transform:translateX(0)}.wr-main-content{margin-left:0 !important}}`}</style>

                {/* Mobile overlay */}
                {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }} className="wr-sidebar-overlay" />}
                <style>{`@media(max-width:767px){.wr-sidebar-overlay{display:block !important}}`}</style>

                {/* Left Navigation */}
                <div className={'wr-sidebar' + (sidebarOpen ? ' open' : '')} style={{
                    position: 'fixed', left: 0, top: 0, bottom: 0, width: '160px',
                    background: 'var(--black)', borderRight: '1px solid rgba(212,175,55,0.2)',
                    display: 'flex', flexDirection: 'column',
                    padding: '16px 0', zIndex: 100, transition: 'transform 0.2s ease'
                }}>
                    {/* Logo — click to go home */}
                    <div onClick={onBack} style={{ padding: '0 16px', marginBottom: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} title="Back to Fantasy Wars home">
                      <img src="icon-192.png" alt="Fantasy Wars" style={{ width: '28px', height: '28px', borderRadius: '6px' }} onError={e => { e.target.style.display = 'none'; }} />
                      <div>
                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.06em', lineHeight: 1.1 }}>FANTASY WARS</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--silver)', opacity: 0.5, fontFamily: 'Oswald', letterSpacing: '0.04em' }}>WAR ROOM</div>
                      </div>
                      {(() => {
                        const champs = window.App?.LI?.championships || {};
                        const cnt = Object.values(champs).filter(c => c.champion === myRoster?.roster_id).length;
                        if (cnt > 0) return <span style={{ fontSize: '0.7rem', color: 'var(--gold)' }} title={cnt + 'x Champion'}>{'\uD83C\uDFC6'}</span>;
                        return null;
                      })()}
                    </div>

                    {/* Notification bell */}
                    <div style={{ padding:'0 16px', marginBottom:'12px', position:'relative' }}>
                        <button onClick={() => setShowNotifications(!showNotifications)} style={{ background:'none', border:'1px solid rgba(212,175,55,0.2)', borderRadius:'6px', padding:'6px 12px', cursor:'pointer', color:'var(--silver)', fontSize:'0.7rem', fontFamily:'Oswald,sans-serif', width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:'6px' }}>
                            Alerts <span style={{ background: notifications.length > 0 ? 'var(--loss-red)' : 'rgba(255,255,255,0.1)', color: notifications.length > 0 ? 'var(--white)' : 'var(--silver)', fontSize:'0.78rem', fontWeight:700, padding:'1px 5px', borderRadius:'8px', marginLeft:'auto' }}>{notifications.length}</span>
                        </button>
                        {showNotifications && (
                            <div style={{ position:'absolute', left:'16px', right:'16px', top:'36px', background:'var(--black)', border:'1px solid rgba(212,175,55,0.3)', borderRadius:'8px', zIndex:200, maxHeight:'300px', overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,0.6)' }}>
                                {notifications.length === 0 ? (
                                    <div style={{ padding:'12px', fontSize:'0.76rem', color:'var(--silver)', opacity:0.5, textAlign:'center' }}>No alerts right now</div>
                                ) : notifications.map((n, i) => (
                                    <div key={i} style={{ padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:'0.76rem', color:'var(--silver)', display:'flex', alignItems:'center', gap:'6px' }}>
                                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', flexShrink:0, background: n.type==='warn'?'var(--loss-red)':n.type==='trade'?'var(--gold)':'#5DADE2' }} />
                                        {n.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Nav items — grouped */}
                    {[
                        { label: 'Brief', tab: 'brief' },
                        { section: 'STRATEGY' },
                        { label: 'Dashboard', tab: 'analytics' },
                        { label: 'My Roster', tab: 'myteam' },
                        { section: 'MARKET' },
                        { label: 'Trade Center', tab: 'trades' },
                        { label: 'Free Agency', tab: 'fa' },
                        { label: 'Draft', tab: 'draft' },
                        { section: 'LEAGUE' },
                        { label: 'League Map', tab: 'league' },
                        { section: 'SYSTEM' },
                        { label: 'Settings', action: () => onOpenSettings && onOpenSettings() },
                    ].map((item, i) => {
                        if (item.section) {
                            return (
                                <div key={i} style={{ padding: i === 0 ? '4px 16px 4px' : '12px 16px 4px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '0.62rem', color: 'rgba(212,175,55,0.5)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{item.section}</span>
                                </div>
                            );
                        }
                        const isActive = item.tab && activeTab === item.tab;
                        return (
                        <button key={i} onClick={() => { setSidebarOpen(false); item.tab ? setActiveTab(item.tab) : item.action ? item.action() : window.location.href = item.url; }}
                            style={{
                                width: '100%', padding: '9px 16px 9px 20px', border: 'none',
                                background: isActive ? 'rgba(212,175,55,0.12)' : 'transparent',
                                borderLeft: isActive ? '3px solid var(--gold)' : '3px solid transparent',
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                transition: 'all 0.15s',
                                color: isActive ? 'var(--gold)' : 'var(--silver)',
                                fontSize: '0.78rem', fontFamily: 'Oswald, sans-serif',
                                fontWeight: isActive ? 700 : 400,
                                letterSpacing: '0.03em', textAlign: 'left'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                        >
                            {item.label}
                        </button>
                        );
                    })}

                    {/* Spacer */}
                    <div style={{ flex: 1 }}></div>

                    {/* Sync Status */}
                    <div style={{ fontSize: '0.76rem', color: window.App?.LI_LOADED ? '#2ECC71' : 'var(--silver)', textAlign: 'center', fontFamily: 'Oswald', opacity: 0.7, marginBottom: '4px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: window.App?.LI_LOADED ? '#2ECC71' : 'var(--silver)', margin: '0 auto 2px' }}></div>
                        {window.App?.LI_LOADED ? 'Synced' : 'Loading'}
                    </div>

                    {/* Legend / Guide */}
                    {React.createElement(LegendPanel)}

                    {/* Refresh Button */}
                    <button onClick={async () => {
                        try {
                            localStorage.removeItem('dhq_leagueintel_v9');
                            localStorage.removeItem('dhq_leagueintel_v10');
                            Object.keys(localStorage).filter(k => k.startsWith('dhq_hist_')).forEach(k => localStorage.removeItem(k));
                            try { sessionStorage.removeItem('fw_players_cache'); } catch(e) { window.wrLog('refresh.sessionClear', e); }
                            window._wrPlayersCache = null;
                            if (window.App) { window.App.LI = {}; window.App.LI_LOADED = false; window._liLoading = false; }
                        } catch(e) { window.wrLog('refresh.cleanup', e); }
                        await loadLeagueDetails();
                    }} style={{
                        width: '100%', padding: '10px 16px', border: 'none',
                        background: 'transparent', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', transition: 'all 0.15s', color: 'var(--gold)',
                        fontSize: '0.78rem', fontFamily: 'Oswald, sans-serif',
                        letterSpacing: '0.03em', textAlign: 'left', marginBottom: '8px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    title="Reload DHQ values, league history, and AI data"
                    >
                        Refresh Data
                    </button>
                </div>

                {/* Main content shifted right */}
                <div className="wr-main-content" style={{ marginLeft: '160px' }}>
                {/* Header */}
                <header className="header" style={{ position: 'relative', marginBottom: '0', paddingBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <div className="header-title">{currentLeague.name}</div>
                        <button onClick={onBack} style={{ padding: '4px 12px', fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(212,175,55,0.10)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>SWITCH</button>
                    </div>
                    <div style={{ textAlign: 'center', color: 'var(--gold)', fontSize: '1.1rem', fontFamily: 'Oswald, sans-serif', marginTop: '0.25rem' }}>
                        {timeYear} SEASON
                    </div>
                </header>

                {/* Year / Stats Toggle Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.45rem 1rem',
                    background: 'var(--black)',
                    borderBottom: '2px solid rgba(212, 175, 55, 0.15)',
                    flexWrap: 'wrap'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        background: 'var(--off-black)',
                        borderRadius: '6px',
                        padding: '0.15rem',
                        border: '1px solid rgba(212, 175, 55, 0.2)'
                    }}>
                        {['2023', '2024', '2025', '2026'].map(year => (
                            <div
                                key={year}
                                style={{
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: '4px',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    fontFamily: 'Oswald, sans-serif',
                                    color: String(year) === String(timeYear) ? 'var(--black)' : 'var(--silver)',
                                    background: String(year) === String(timeYear) ? 'var(--gold)' : 'transparent',
                                    cursor: String(year) === String(timeYear) ? 'default' : 'pointer',
                                    opacity: String(year) === String(timeYear) ? 1 : 0.4,
                                    transition: 'all 0.2s'
                                }}
                                onClick={() => switchYear(year)}
                            >
                                {year}
                            </div>
                        ))}
                    </div>
                    <div style={{ color: 'rgba(212,175,55,0.3)', fontSize: '0.8rem' }}>|</div>
                    <div style={{ color: 'var(--silver)', fontSize: '0.78rem', fontFamily: 'Oswald, sans-serif', opacity: 0.7 }}>
                        Half PPR · {standings.length} Teams
                    </div>
                </div>

                {/* Load stage progress indicator */}
                {loadStage && (
                    <div style={{
                        padding: '6px 16px', background: 'rgba(212,175,55,0.06)',
                        borderBottom: '1px solid rgba(212,175,55,0.1)',
                        fontSize: '0.78rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <div style={{ width: '12px', height: '12px', border: '2px solid rgba(212,175,55,0.3)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'dhqSpin 0.8s linear infinite' }}></div>
                        {loadStage}
                    </div>
                )}

                {/* ── GLOBAL TIME CONTEXT BAR ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 24px',
                    background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(212,175,55,0.12)',
                    position: 'sticky', top: 0, zIndex: 50
                }}>
                    {/* Year pills */}
                    <div style={{ display: 'flex', gap: '3px' }}>
                        {timeYears.map(yr =>
                            <button key={yr} onClick={() => handleTimeYearChange(yr)} style={{
                                padding: '4px 10px', fontSize: '0.76rem', fontFamily: 'Oswald',
                                fontWeight: timeYear === yr ? 700 : 400,
                                background: timeYear === yr ? 'var(--gold)' : 'rgba(255,255,255,0.03)',
                                color: timeYear === yr ? 'var(--black)' : 'var(--silver)',
                                border: timeYear === yr ? '1px solid var(--gold)' : '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s'
                            }}>{yr}</button>
                        )}
                    </div>
                    {/* League context */}
                    <span style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.5 }}>
                        {currentLeague.name ? currentLeague.name.substring(0, 20) : ''} {'\u00B7'} {currentLeague.rosters?.length || '?'} Teams
                    </span>
                    <div style={{ marginLeft: 'auto' }}></div>
                    {/* Time mode badge */}
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 700, color: timeModeColor,
                        background: timeModeColor + '15', border: '1px solid ' + timeModeColor + '30',
                        padding: '2px 10px', borderRadius: '12px',
                        fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.06em'
                    }}>{timeModeLabel}</span>
                    {/* Loading indicator */}
                    {timeLoading && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '10px', height: '10px', border: '2px solid rgba(212,175,55,0.3)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'dhqSpin 0.8s linear infinite' }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>Recomputing...</span>
                    </div>}
                </div>

                {/* Time mode banner — visible when not viewing current season */}
                {!isCurrentYear && <div style={{
                    padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '8px',
                    background: timeModeColor + '10', borderBottom: '1px solid ' + timeModeColor + '30'
                }}>
                    <span style={{ fontSize: '0.82rem', color: timeModeColor, fontWeight: 700, fontFamily: 'Oswald' }}>
                        {isFutureYear ? 'FUTURE PROJECTION' : 'HISTORICAL VIEW'}: {timeYear}
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6 }}>
                        {isFutureYear ? 'Player ages projected +' + timeDelta + 'yr. Values and stats are estimates.' : 'Showing ' + timeYear + ' season stats. Roster composition reflects current state.'}
                    </span>
                    <button onClick={() => handleTimeYearChange(currentSeason)} style={{ marginLeft: 'auto', fontSize: '0.74rem', padding: '3px 10px', background: 'transparent', border: '1px solid ' + timeModeColor, color: timeModeColor, borderRadius: '4px', cursor: 'pointer', fontFamily: 'Oswald' }}>Back to {currentSeason}</button>
                </div>}

                {/* Debug panel (dev only) */}
                {DEV_DEBUG && <div style={{ padding: '4px 24px', background: 'rgba(255,0,0,0.04)', borderBottom: '1px solid rgba(255,0,0,0.1)', fontSize: '0.7rem', fontFamily: 'monospace', color: '#F0A500' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '2px' }}>
                        <span>year={timeYear}</span>
                        <span>mode={timeMode}</span>
                        <span>tab={activeTab}</span>
                        <span>delta={timeDelta}</span>
                        <span>recompute={new Date(timeRecomputeTs).toLocaleTimeString()}</span>
                        <span>stats={Object.keys(statsData).length}</span>
                        <span>projected={window.App?.LI?._projectedYear || 'none'}</span>
                    </div>
                    {isFutureYear && window.App?.LI?.playerScores && (() => {
                        const scores = window.App.LI.playerScores;
                        const backup = window.App.LI._baseScoresBackup || {};
                        const samples = Object.entries(scores).filter(([,v]) => v > 2000).sort((a,b) => b[1] - a[1]).slice(0, 4);
                        return <div style={{ display: 'flex', gap: '12px', fontSize: '0.65rem', color: '#3498DB' }}>
                            {samples.map(([pid, projDhq]) => {
                                const baseDhq = backup[pid] || projDhq;
                                const p = playersData[pid];
                                const diff = projDhq - baseDhq;
                                return <span key={pid}>{p?.full_name?.split(' ').pop() || pid}: {baseDhq}→{projDhq} ({diff >= 0 ? '+' : ''}{diff})</span>;
                            })}
                        </div>;
                    })()}
                </div>}

                {/* Dashboard: KPI cards + power rankings preview */}
                {activeTab === 'dashboard' && <DashboardPanel
                    selectedKpis={selectedKpis}
                    setSelectedKpis={setSelectedKpis}
                    editingKpi={editingKpi}
                    setEditingKpi={setEditingKpi}
                    computeKpiValue={computeKpiValue}
                    KPI_OPTIONS={KPI_OPTIONS}
                    rankedTeams={rankedTeams}
                    sleeperUserId={sleeperUserId}
                    setActiveTab={setActiveTab}
                />}

                {/* ── BRIEF TAB ── */}
                {activeTab === 'brief' && <FlashBriefPanel
                    myRoster={myRoster}
                    rankedTeams={rankedTeams}
                    sleeperUserId={sleeperUserId}
                    currentLeague={currentLeague}
                    activeYear={activeYear}
                    setActiveTab={setActiveTab}
                    briefDraftInfo={briefDraftInfo}
                    playersData={playersData}
                    statsData={statsData}
                    setReconPanelOpen={setReconPanelOpen}
                    sendReconMessage={sendReconMessage}
                />}

                            {/* 8. Draft Countdown */}
                            {briefDraftInfo?.start_time && briefDraftInfo.status === 'pre_draft' && (() => {
                                const diff = briefDraftInfo.start_time - Date.now();
                                if (diff <= 0) return null;
                                const days = Math.floor(diff / 86400000);
                                const hours = Math.floor((diff % 86400000) / 3600000);
                                return <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', marginBottom: '12px' }}>
                                    <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)' }}>{days}D {hours}H</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>until draft · {new Date(briefDraftInfo.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </div>;
                            })()}

                            {/* 9. Draft Class Preview */}
                            <div style={{ padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', marginBottom: '12px' }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>Draft class intel available via the AI advisor.</div>
                                <button onClick={() => { if (typeof setReconPanelOpen === 'function') setReconPanelOpen(true); if (typeof sendReconMessage === 'function') sendReconMessage('What are the strongest position groups in the upcoming rookie draft class?'); }} style={{ marginTop: '6px', padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '4px', color: 'var(--gold)', cursor: 'pointer' }}>Ask Alex about draft class</button>
                            </div>

                            {/* 10. Your Power Rank */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px' }}>
                                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--gold)' }}>#{myRank}</span>
                                <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)' }}>Power Ranking</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{tier} · {myRank} of {rankedTeams.length}</div>
                                </div>
                                <button onClick={() => setActiveTab('league')} style={{ marginLeft: 'auto', fontSize: '0.68rem', fontFamily: 'Oswald', color: 'var(--gold)', background: 'none', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>View All</button>
                            </div>
                        </div>
                    );
                })()}

                {/* Tab Content Routing */}
                {activeTab === 'trades' ? (
                    <TradeCalcTab
                        playersData={playersData}
                        statsData={statsData}
                        myRoster={myRoster}
                        standings={standings}
                        currentLeague={currentLeague}
                        sleeperUserId={sleeperUserId}
                        timeRecomputeTs={timeRecomputeTs}
                        viewMode={viewMode}
                        initialSubTab={tradeSubTab}
                        onSubTabConsumed={() => setTradeSubTab(null)}
                    />
                ) : activeTab === 'myteam' ? <MyTeamTab
                    myRoster={myRoster}
                    currentLeague={currentLeague}
                    playersData={playersData}
                    statsData={statsData}
                    stats2025Data={stats2025Data}
                    standings={standings}
                    sleeperUserId={sleeperUserId}
                    rosterFilter={rosterFilter}
                    setRosterFilter={setRosterFilter}
                    rosterSort={rosterSort}
                    setRosterSort={setRosterSort}
                    visibleCols={visibleCols}
                    setVisibleCols={setVisibleCols}
                    expandedPid={expandedPid}
                    setExpandedPid={setExpandedPid}
                    showColPicker={showColPicker}
                    setShowColPicker={setShowColPicker}
                    colPreset={colPreset}
                    setColPreset={setColPreset}
                    myTeamView={myTeamView}
                    setMyTeamView={setMyTeamView}
                    compareTeamId={compareTeamId}
                    setCompareTeamId={setCompareTeamId}
                    gmStrategy={gmStrategy}
                    setGmStrategy={setGmStrategy}
                    gmStrategyOpen={gmStrategyOpen}
                    setGmStrategyOpen={setGmStrategyOpen}
                    setAlexAvatar={setAlexAvatar}
                    setAvatarKey={setAvatarKey}
                    setActiveTab={setActiveTab}
                    setReconPanelOpen={setReconPanelOpen}
                    sendReconMessage={sendReconMessage}
                    isCommand={isCommand}
                    timeRecomputeTs={timeRecomputeTs}
                    setTimeRecomputeTs={setTimeRecomputeTs}
                /> : activeTab === 'league' ? <LeagueMapTab
                    leagueSelectedTeam={leagueSelectedTeam}
                    setLeagueSelectedTeam={setLeagueSelectedTeam}
                    leagueSort={leagueSort}
                    setLeagueSort={setLeagueSort}
                    leagueSubView={leagueSubView}
                    setLeagueSubView={setLeagueSubView}
                    leagueViewMode={leagueViewMode}
                    setLeagueViewMode={setLeagueViewMode}
                    lpSort={lpSort}
                    setLpSort={setLpSort}
                    lpFilter={lpFilter}
                    setLpFilter={setLpFilter}
                    standings={standings}
                    currentLeague={currentLeague}
                    playersData={playersData}
                    statsData={statsData}
                    sleeperUserId={sleeperUserId}
                    myRoster={myRoster}
                    activeYear={activeYear}
                    timeRecomputeTs={timeRecomputeTs}
                    setTimeRecomputeTs={setTimeRecomputeTs}
                    getAcquisitionInfo={getAcquisitionInfo}
                /> : activeTab === 'analytics' ? <AnalyticsPanel
                    analyticsData={analyticsData}
                    analyticsTab={analyticsTab}
                    setAnalyticsTab={setAnalyticsTab}
                    myRoster={myRoster}
                    currentLeague={currentLeague}
                    standings={standings}
                    playersData={playersData}
                    statsData={statsData}
                    stats2025Data={stats2025Data}
                    sleeperUserId={sleeperUserId}
                    timeRecomputeTs={timeRecomputeTs}
                    setTimeRecomputeTs={setTimeRecomputeTs}
                    activeYear={activeYear}
                    setActiveTab={setActiveTab}
                    viewingOwnerId={viewingOwnerId}
                    setViewingOwnerId={setViewingOwnerId}
                    timeDelta={timeDelta}
                    timeYear={timeYear}
                    setTradeSubTab={setTradeSubTab}
                    getOwnerName={getOwnerName}
                />                ) : activeTab === 'fa' ? (
                    React.createElement(FreeAgencyTab, {
                        playersData: playersData,
                        statsData: statsData,
                        prevStatsData: stats2025Data,
                        myRoster: myRoster,
                        currentLeague: currentLeague,
                        sleeperUserId: sleeperUserId,
                        timeRecomputeTs: timeRecomputeTs,
                        viewMode: viewMode
                    })
                ) : activeTab === 'draft' ? (
                    React.createElement(DraftTab, {
                        playersData: playersData,
                        statsData: statsData,
                        myRoster: myRoster,
                        currentLeague: currentLeague,
                        sleeperUserId: sleeperUserId,
                        setReconPanelOpen: setReconPanelOpen,
                        sendReconMessage: sendReconMessage,
                        timeRecomputeTs: timeRecomputeTs,
                        viewMode: viewMode
                    })
                ) : (
                <React.Fragment>
                {/* THE ATHLETIC-STYLE DASHBOARD */}
                <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }} className="wr-fade-in">

                    {/* 1. HERO STORY */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(212,175,55,0.12), rgba(0,0,0,0.8))',
                      border: '2px solid rgba(212,175,55,0.3)',
                      borderRadius: '16px',
                      padding: '28px 32px',
                      marginBottom: '12px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ fontSize: '0.76rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>THIS WEEK IN {currentLeague.name?.toUpperCase()}</div>
                      <div style={{ fontFamily: 'Crimson Text, serif', fontSize: '1.15rem', color: 'var(--white)', lineHeight: 1.4 }}>
                        {heroStory || computeDataDrivenHero()}
                      </div>
                      <button onClick={generateHeroStory} style={{ marginTop: '8px', padding: '4px 12px', background: 'var(--gold)', color: 'var(--black)', border: '1px solid var(--gold)', borderRadius: '6px', fontFamily: 'Oswald, sans-serif', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Rewrite with AI
                      </button>
                    </div>

                    {/* 2. TWO-COLUMN: TRANSACTION TICKER + POWER RANKINGS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }} className="wr-fade-in-delay">

                      {/* LEFT: Transaction Ticker */}
                      <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '20px', maxHeight: '460px', overflow: 'auto' }}>
                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.2rem', color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.06em' }}>TRANSACTION TICKER</div>
                        {transactions.length === 0 ? (
                          <SkeletonRows count={6} />
                        ) : transactions.map((txn, ti) => (
                          <div key={ti} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65, minWidth: '40px' }}>{timeAgo(txn.created)}</span>
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px',
                                background: txn.type === 'trade' ? 'rgba(124,107,248,0.2)' : txn.type === 'waiver' ? 'rgba(52,211,153,0.2)' : txn.type === 'free_agent' ? 'rgba(59,130,246,0.2)' : 'rgba(248,113,113,0.2)',
                                color: txn.type === 'trade' ? '#a78bfa' : txn.type === 'waiver' ? '#34d399' : txn.type === 'free_agent' ? '#60a5fa' : '#f87171'
                              }}>{(txn.type === 'free_agent' ? 'FA' : txn.type || '').toUpperCase()}</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{getOwnerName(txn.roster_ids?.[0])}</span>
                              {txn.type === 'trade' && txn.roster_ids?.[1] && (
                                <span style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.65 }}>{'\u2194'} {getOwnerName(txn.roster_ids[1])}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--white)', paddingLeft: '48px' }}>
                              {Object.keys(txn.adds || {}).map(pid => (
                                <span key={'a'+pid} style={{ color: '#2ECC71', cursor: 'pointer', marginRight: '6px' }}
                                  onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(pid); }}>
                                  +{getPlayerName(pid)}
                                </span>
                              ))}
                              {Object.keys(txn.drops || {}).map(pid => (
                                <span key={'d'+pid} style={{ color: '#E74C3C', marginLeft: '4px', marginRight: '6px' }}>
                                  -{getPlayerName(pid)}
                                </span>
                              ))}
                              {txn.settings?.waiver_bid > 0 && <span style={{ color: '#F0A500', marginLeft: '4px' }}>${txn.settings.waiver_bid}</span>}
                              {txn.type === 'trade' && txn.draft_picks?.length > 0 && (
                                <span style={{ color: '#a78bfa', fontSize: '0.78rem', marginLeft: '6px' }}>
                                  +{txn.draft_picks.length} pick{txn.draft_picks.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* RIGHT: Power Rankings */}
                      <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px', maxHeight: '420px', overflow: 'auto' }}>
                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.2rem', color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.06em' }}>POWER RANKINGS</div>
                        {rankedTeams.length === 0 ? (
                          <div style={{ color: 'var(--silver)', fontSize: '0.78rem', opacity: 0.6, padding: '16px 0', textAlign: 'center' }}>Loading rankings...</div>
                        ) : rankedTeams.map((team, i) => (
                          <div key={team.rosterId} style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 6px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: team.rosterId === myRoster?.roster_id ? 'rgba(212,175,55,0.08)' : 'transparent'
                          }}>
                            <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.3rem', color: i === 0 ? '#D4AF37' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--silver)', minWidth: '24px', textAlign: 'center' }}>{i + 1}</span>
                            {team.avatar ? (
                              <img src={'https://sleepercdn.com/avatars/thumbs/' + team.avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--charcoal)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.76rem', color: 'var(--silver)' }}>{team.displayName.charAt(0)}</div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {team.displayName}
                                {(() => {
                                  const champs = window.App?.LI?.championships || {};
                                  const cnt = Object.values(champs).filter(c => {
                                    const r = currentLeague.rosters?.find(ros => ros.owner_id === team.userId);
                                    return c.champion === r?.roster_id;
                                  }).length;
                                  if (cnt > 0) return <span style={{ fontSize: '0.76rem', color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>{cnt > 1 ? cnt + 'x' : ''}{'\uD83C\uDFC6'}</span>;
                                  return null;
                                })()}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{team.wins}-{team.losses} {'\u00B7'} {team.totalDHQ?.toLocaleString()} DHQ</div>
                            </div>
                            {team.rosterId !== myRoster?.roster_id && (
                              <button onClick={() => {
                                setReconPanelOpen(true);
                                sendReconMessage('Scout ' + team.displayName + ' — give me a full scouting report. Their roster strengths/weaknesses, trading tendencies, how to negotiate with them, and 2-3 specific trade proposals I could send them.');
                              }} title={'Scout ' + team.displayName} style={{
                                padding: '3px 8px', fontSize: '0.66rem', fontFamily: 'Oswald',
                                background: 'rgba(212,175,55,0.08)', color: 'var(--gold)',
                                border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px',
                                cursor: 'pointer', flexShrink: 0, letterSpacing: '0.03em'
                              }}>SCOUT</button>
                            )}
                            <div style={{ width: '60px' }}>
                              <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                <div style={{ width: (team.healthScore || 0) + '%', height: '100%', background: team.tierColor || 'var(--gold)', borderRadius: '2px' }}></div>
                              </div>
                              <div style={{ fontSize: '0.7rem', color: team.tierColor || 'var(--silver)', textAlign: 'right', marginTop: '2px' }}>{team.healthScore || '\u2014'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. AI STORIES (3 cards) */}
                    <div style={{ marginBottom: '16px' }}>
                      {aiStories.length === 0 ? (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px' }}>
                          {[0,1,2].map(i => <div key={i} className="skel-card" style={{height:'120px'}}><div className="skel skel-line" style={{width:'30%'}} /><div className="skel skel-line" style={{width:'80%'}} /><div className="skel skel-line" style={{width:'60%'}} /></div>)}
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                          {aiStories.map((story, i) => (
                            <div key={i} style={{
                              background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)',
                              borderRadius: '12px', padding: '16px'
                            }}>
                              <div style={{ fontSize: '1.2rem', marginBottom: '6px' }}>{story.icon}</div>
                              <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{story.category}</div>
                              <div style={{ fontFamily: 'Crimson Text, serif', fontSize: '0.92rem', color: 'var(--white)', lineHeight: 1.5, marginBottom: '8px' }}>{story.headline}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.5 }}>{story.body}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 4. LEAGUE STANDINGS TABLE */}
                    <div style={{ background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px' }}>
                      <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.2rem', color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.06em' }}>LEAGUE STANDINGS</div>
                      {(() => {
                        // Group by division if divisions exist
                        const divisions = {};
                        standings.forEach(t => {
                          const div = t.division || 0;
                          if (!divisions[div]) divisions[div] = [];
                          divisions[div].push(t);
                        });
                        const divKeys = Object.keys(divisions).sort((a,b) => a - b);
                        const hasDivisions = divKeys.length > 1;

                        return (
                          <div>
                            {divKeys.map(divKey => (
                              <div key={divKey} style={{ marginBottom: hasDivisions ? '16px' : '0' }}>
                                {hasDivisions && (
                                  <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(212,175,55,0.2)' }}>
                                    Division {divKey}
                                  </div>
                                )}
                                {/* Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 48px 48px 56px 56px', gap: '4px', padding: '4px 8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
                                  <span>#</span><span>Team</span><span style={{textAlign:'right'}}>W-L</span><span style={{textAlign:'right'}}>PF</span><span style={{textAlign:'right'}}>DHQ</span><span style={{textAlign:'right'}}>Rank</span>
                                </div>
                                {/* Rows */}
                                {divisions[divKey].sort((a,b) => {
                                  if (b.wins !== a.wins) return b.wins - a.wins;
                                  if (a.losses !== b.losses) return a.losses - b.losses;
                                  return b.pointsFor - a.pointsFor;
                                }).map((team, idx) => {
                                  const isMe = team.userId === sleeperUserId;
                                  const roster = currentLeague.rosters?.find(r => r.owner_id === team.userId);
                                  const totalDHQ = roster?.players?.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0) || 0;
                                  const pf = team.pointsFor || 0;
                                  // Find overall rank
                                  const overallRank = standings.slice().sort((a,b) => b.wins !== a.wins ? b.wins - a.wins : b.pointsFor - a.pointsFor).findIndex(t => t.userId === team.userId) + 1;
                                  return (
                                    <div key={team.rosterId} style={{
                                      display: 'grid', gridTemplateColumns: '20px 1fr 48px 48px 56px 56px', gap: '4px',
                                      padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                      background: isMe ? 'rgba(212,175,55,0.08)' : 'transparent',
                                      fontSize: '0.75rem', alignItems: 'center'
                                    }}>
                                      <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '0.9rem', color: idx === 0 ? '#D4AF37' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'var(--silver)' }}>{idx + 1}</span>
                                      <div style={{ overflow: 'hidden' }}>
                                        <div style={{ fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {team.displayName}{isMe && <span style={{ fontSize: '0.78rem', color: 'var(--gold)', marginLeft: '4px' }}>YOU</span>}
                                        </div>
                                      </div>
                                      <span style={{ textAlign: 'right', fontFamily: 'Oswald, sans-serif', fontWeight: 600, color: 'var(--white)' }}>{team.wins}-{team.losses}</span>
                                      <span style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--silver)' }}>{pf > 0 ? pf.toFixed(0) : '—'}</span>
                                      <span style={{ textAlign: 'right', fontSize: '0.78rem', fontFamily: 'Oswald, sans-serif', color: totalDHQ >= 80000 ? '#2ECC71' : totalDHQ >= 50000 ? 'var(--gold)' : 'var(--silver)' }}>{totalDHQ > 0 ? (totalDHQ / 1000).toFixed(0) + 'k' : '—'}</span>
                                      <span style={{ textAlign: 'right', fontSize: '0.78rem', color: overallRank <= 3 ? '#2ECC71' : overallRank <= 6 ? 'var(--gold)' : 'var(--silver)' }}>#{overallRank}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                </div>{/* end Athletic dashboard */}
                </React.Fragment>
                )}
                </div>{/* end marginLeft wrapper */}

            {selectedPlayerPid && typeof window.openFWPlayerModal !== 'function' && <PlayerInlineCard
                pid={selectedPlayerPid}
                playersData={playersData}
                statsData={statsData}
                onClose={() => setSelectedPlayerPid(null)}
                onFullProfile={() => {
                  try {
                    if (typeof window.openFWPlayerModal === 'function') {
                      const sc = currentLeague?.scoring_settings || {};
                      window.openFWPlayerModal(selectedPlayerPid, playersData, statsData, sc);
                    } else {
                      console.warn('[War Room] openFWPlayerModal not loaded');
                    }
                  } catch(e) { console.error('[War Room] Player modal error:', e); }
                }}
            />}

            {/* Alex Ingram Chat — centered welcome or bottom-right */}
            {reconPanelOpen && <div style={welcomeMode ? {
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '480px', maxHeight: '600px',
              background: '#0a0b0d', border: '2px solid rgba(212,175,55,0.4)',
              borderRadius: '20px', zIndex: 300,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,175,55,0.15), 0 0 120px rgba(212,175,55,0.06)',
              animation: 'wrFadeIn 0.3s ease'
            } : {
              position: 'fixed', bottom: '80px', right: '24px',
              width: '380px', maxHeight: '520px',
              background: '#0a0b0d', border: '2px solid rgba(212,175,55,0.3)',
              borderRadius: '16px', zIndex: 200,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,55,0.1)',
              animation: 'wrFadeIn 0.2s ease'
            }}>
            {/* Welcome backdrop */}
            {welcomeMode && <div onClick={() => { setWelcomeMode(false); setReconPanelOpen(false); setTimeout(() => { setShowCornerToast(true); setTimeout(() => setShowCornerToast(false), 4000); }, 300); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: -1 }} />}
              {/* Header */}
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid rgba(212,175,55,0.2)',
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(212,175,55,0.06)', borderRadius: '14px 14px 0 0'
              }}>
                <div key={avatarKey} onClick={e => { e.stopPropagation(); setShowAvatarPicker(p => !p); }} style={{ cursor: 'pointer' }} title="Change Alex's avatar">
                  <AlexAvatar size={30} />
                </div>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '0.88rem', color: 'var(--gold)', letterSpacing: '0.04em', lineHeight: 1 }}>Alex Ingram</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.5 }}>AI General Manager</div>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#7d8291' }}>Cmd+K</span>
                <span style={{ flex: 1 }}></span>
                {reconMessages.length > 1 && (
                  <button onClick={() => {
                    setReconMessages([{ role: 'assistant', content: 'Fresh start. What\'s on your mind? — Alex' }]);
                    setGmOnboardStep(5);
                    WrStorage.remove(WR_KEYS.CHAT(currentLeague?.league_id));
                  }} title="Clear chat history" style={{
                    background: 'none', border: 'none', color: '#7d8291', cursor: 'pointer',
                    fontSize: '0.62rem', padding: '2px 4px', fontFamily: 'Oswald', letterSpacing: '0.04em'
                  }}>CLEAR</button>
                )}
                <button onClick={() => setReconPanelOpen(false)} style={{
                  background: 'none', border: 'none', color: '#7d8291', cursor: 'pointer',
                  fontSize: '1rem', padding: '2px'
                }}>&#10005;</button>
              </div>

              {/* Avatar picker (toggled) */}
              {showAvatarPicker && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(212,175,55,0.04)' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '6px', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose Alex's look</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ALEX_AVATARS.map(av => (
                      <button key={av.id} onClick={() => { setAlexAvatar(av.id); setShowAvatarPicker(false); setAvatarKey(k => k+1); }} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                        padding: '6px', background: getAlexAvatar() === av.id ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (getAlexAvatar() === av.id ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                        borderRadius: '8px', cursor: 'pointer', minWidth: '56px'
                      }}>
                        {av.src ? (
                          <img src={av.src} alt={av.label} style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'linear-gradient(135deg, #D4AF37, #B8941E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#0A0A0A', fontFamily: 'Bebas Neue' }}>AI</div>
                        )}
                        <span style={{ fontSize: '0.58rem', color: 'var(--silver)', textAlign: 'center' }}>{av.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Context chips */}
              <div style={{ padding: '6px 12px', display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {getReconChips().map((chip, i) => (
                  <button key={i} onClick={() => sendReconMessage(chip.prompt)}
                    style={{
                      padding: '3px 8px', fontSize: '0.72rem', borderRadius: '14px',
                      border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.06)',
                      color: 'var(--gold)', cursor: 'pointer', fontFamily: 'inherit'
                    }}>
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div style={{
                flex: 1, overflow: 'auto', padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: '6px',
                maxHeight: '320px'
              }}>
                {reconMessages.map((msg, i) => (
                  msg.role === 'user' ? (
                    <div key={i} style={{
                      alignSelf: 'flex-end', maxWidth: '85%', padding: '8px 12px', borderRadius: '12px',
                      fontSize: '0.78rem', lineHeight: 1.4,
                      background: 'rgba(124,107,248,0.12)', border: '1px solid rgba(124,107,248,0.18)',
                      color: '#f0f0f3'
                    }} dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }} />
                  ) : (
                    <div key={i} style={{
                      alignSelf: 'flex-start', maxWidth: '90%', padding: '8px 10px',
                      background: 'rgba(212,175,55,0.04)', borderLeft: '3px solid rgba(212,175,55,0.4)',
                      borderRadius: '0 10px 10px 0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <AlexAvatar size={20} />
                        <span style={{ fontFamily: 'Bebas Neue', fontSize: '0.72rem', color: 'var(--gold)', letterSpacing: '0.03em' }}>Alex Ingram</span>
                      </div>
                      {(() => {
                        const tradeMatch = msg.content.match(/<!--\s*TRADE_CARD:([\s\S]*?)-->/);
                        const textContent = msg.content.replace(/<!--\s*TRADE_CARD:[\s\S]*?-->/, '').trim();
                        let tradeCard = null;
                        if (tradeMatch) {
                          try { tradeCard = JSON.parse(tradeMatch[1].trim()); } catch {}
                        }
                        return (
                          <React.Fragment>
                            <div style={{ fontSize: '0.78rem', lineHeight: 1.4, color: '#f0f0f3' }}
                              dangerouslySetInnerHTML={{ __html: markdownToHtml(textContent) }} />
                            {tradeCard && (
                              <div style={{ marginTop: '10px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '10px', fontSize: '0.76rem' }}>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                                  Proposed Trade{tradeCard.target ? ' → ' + tradeCard.target : ''}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'start' }}>
                                  <div>
                                    <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '4px', fontFamily: 'Oswald', textTransform: 'uppercase' }}>You Give</div>
                                    {(tradeCard.yourSide || []).map((a, j) => (
                                      <div key={j} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ color: '#f0f0f3' }}>{a.name}</span>
                                        <span style={{ color: 'var(--silver)', fontSize: '0.68rem', marginLeft: '4px' }}>{a.dhq?.toLocaleString()} DHQ</span>
                                      </div>
                                    ))}
                                    <div style={{ marginTop: '4px', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem' }}>
                                      Total: {(tradeCard.yourSide || []).reduce((s, a) => s + (a.dhq || 0), 0).toLocaleString()}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.2rem', color: 'var(--gold)', paddingTop: '16px' }}>{'\u21C4'}</div>
                                  <div>
                                    <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '4px', fontFamily: 'Oswald', textTransform: 'uppercase' }}>You Get</div>
                                    {(tradeCard.theirSide || []).map((a, j) => (
                                      <div key={j} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ color: '#f0f0f3' }}>{a.name}</span>
                                        <span style={{ color: 'var(--silver)', fontSize: '0.68rem', marginLeft: '4px' }}>{a.dhq?.toLocaleString()} DHQ</span>
                                      </div>
                                    ))}
                                    <div style={{ marginTop: '4px', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem' }}>
                                      Total: {(tradeCard.theirSide || []).reduce((s, a) => s + (a.dhq || 0), 0).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                                {/* Fairness bar */}
                                {(() => {
                                  const yours = (tradeCard.yourSide || []).reduce((s, a) => s + (a.dhq || 0), 0);
                                  const theirs = (tradeCard.theirSide || []).reduce((s, a) => s + (a.dhq || 0), 0);
                                  const diff = theirs - yours;
                                  const pct = yours > 0 ? Math.round((diff / yours) * 100) : 0;
                                  const color = pct >= 5 ? '#2ECC71' : pct >= -5 ? 'var(--gold)' : '#E74C3C';
                                  const label = pct >= 5 ? 'You win by ' + pct + '%' : pct >= -5 ? 'Fair trade' : 'You lose by ' + Math.abs(pct) + '%';
                                  return (
                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{ width: Math.min(100, 50 + pct) + '%', height: '100%', background: color, borderRadius: '2px' }} />
                                      </div>
                                      <span style={{ fontSize: '0.68rem', color, fontFamily: 'Oswald' }}>{label}</span>
                                    </div>
                                  );
                                })()}
                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                  {tradeCard.sleeperDM && (
                                    <button onClick={() => { navigator.clipboard.writeText(tradeCard.sleeperDM); }} style={{
                                      padding: '5px 12px', fontSize: '0.7rem', fontFamily: 'Oswald',
                                      background: 'linear-gradient(135deg, #7c6bf8, #9b8afb)', color: '#fff',
                                      border: 'none', borderRadius: '14px', cursor: 'pointer'
                                    }}>Copy DM</button>
                                  )}
                                  <button onClick={() => {
                                    const saved = WrStorage.get(WR_KEYS.SAVED_TRADES(currentLeague?.league_id)) || [];
                                    saved.push({ ...tradeCard, savedAt: Date.now() });
                                    WrStorage.set(WR_KEYS.SAVED_TRADES(currentLeague?.league_id), saved.slice(-20));
                                  }} style={{
                                    padding: '5px 12px', fontSize: '0.7rem', fontFamily: 'Oswald',
                                    background: 'rgba(212,175,55,0.08)', color: 'var(--gold)',
                                    border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', cursor: 'pointer'
                                  }}>Save</button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })()}
                      {/* Onboarding choice buttons */}
                      {msg.onboardChoices && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                          {msg.onboardChoices.map(c => {
                            const isSelected = msg.onboardMulti && onboardSelections.includes(c.value);
                            return (
                              <button key={c.value} onClick={() => {
                                if (msg.onboardMulti) {
                                  setOnboardSelections(prev => prev.includes(c.value) ? prev.filter(v => v !== c.value) : [...prev, c.value]);
                                } else if (gmOnboardStep === 0 && ['strategy','advice','avatar'].includes(c.value)) {
                                  handleWelcomeChoice(c.value);
                                } else {
                                  handleOnboardChoice(c.value);
                                }
                              }} style={{
                                padding: '6px 14px', fontSize: '0.76rem', fontFamily: 'Oswald',
                                background: isSelected ? 'var(--gold)' : 'rgba(212,175,55,0.08)',
                                color: isSelected ? 'var(--black)' : 'var(--gold)',
                                border: '1px solid rgba(212,175,55,0.3)',
                                borderRadius: '16px', cursor: 'pointer', transition: 'all 0.15s'
                              }}>{c.label}{isSelected ? ' \u2713' : ''}</button>
                            );
                          })}
                          {msg.onboardMulti && (
                            <React.Fragment>
                              {onboardSelections.length > 0 && (
                                <button onClick={() => { handleOnboardChoice(onboardSelections); setOnboardSelections([]); }} style={{
                                  padding: '6px 14px', fontSize: '0.76rem', fontFamily: 'Oswald',
                                  background: 'linear-gradient(135deg, #2ECC71, #27AE60)', color: '#fff',
                                  border: 'none', borderRadius: '16px', cursor: 'pointer'
                                }}>Confirm ({onboardSelections.length})</button>
                              )}
                              {msg.onboardSkip && (
                                <button onClick={() => { handleOnboardChoice('skip'); setOnboardSelections([]); }} style={{
                                  padding: '6px 14px', fontSize: '0.76rem', fontFamily: 'Oswald',
                                  background: 'rgba(255,255,255,0.04)', color: 'var(--silver)',
                                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', cursor: 'pointer'
                                }}>Skip</button>
                              )}
                            </React.Fragment>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ))}
              </div>

              {/* Input */}
              <div style={{
                padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', gap: '8px', background: '#111318', borderRadius: '0 0 14px 14px'
              }}>
                <input
                  value={reconInput}
                  onChange={e => setReconInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendReconMessage(reconInput); }}
                  placeholder="Ask anything..."
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: '#f0f0f3', fontSize: '0.82rem', fontFamily: 'inherit'
                  }}
                />
                <button onClick={() => sendReconMessage(reconInput)} style={{
                  background: 'linear-gradient(135deg, #7c6bf8, #9b8afb)',
                  border: 'none', borderRadius: '8px', width: '32px', height: '32px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="2.5">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>}

            {/* "I'll be down here" toast */}
            {showCornerToast && (
              <div style={{
                position: 'fixed', bottom: '82px', right: '24px',
                background: '#0a0b0d', border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: '12px', padding: '10px 16px', zIndex: 202,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                animation: 'wrFadeIn 0.3s ease', maxWidth: '220px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlexAvatar size={22} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.4 }}>I'll be down here if you need me {'\uD83D\uDC47'}</span>
                </div>
              </div>
            )}

            {/* Alex Ingram Bubble Button — bottom right corner */}
            <button onClick={() => { setReconPanelOpen(!reconPanelOpen); setWelcomeMode(false); }} style={{
              position: 'fixed', bottom: '24px', right: '24px',
              width: '52px', height: '52px', borderRadius: '14px',
              background: reconPanelOpen ? 'rgba(212,175,55,0.15)' : 'transparent',
              border: '2px solid rgba(212,175,55,0.4)',
              cursor: 'pointer', zIndex: 201,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(212,175,55,0.3)',
              transition: 'all 0.2s', overflow: 'hidden', padding: 0
            }}>
              {reconPanelOpen
                ? <span style={{ color: 'var(--gold)', fontSize: '1.2rem' }}>&#10005;</span>
                : <AlexAvatar size={48} />
              }
            </button>

            </div>
          </window.App.SeasonContext.Provider>
        );
    }
