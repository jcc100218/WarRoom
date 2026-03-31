// ══════════════════════════════════════════════════════════════════
// league-detail.js — LeagueDetail: Dashboard, My Team, League Map, Analytics
// This is the main app shell after selecting a league.
// ══════════════════════════════════════════════════════════════════
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
            try { const saved = localStorage.getItem('wr_time_year'); return saved ? parseInt(saved) : currentSeason; } catch(e) { return currentSeason; }
        });
        const [timeLoading, setTimeLoading] = useState(false);
        const [timeRecomputeTs, setTimeRecomputeTs] = useState(Date.now());
        const [basePlayersData, setBasePlayersData] = useState(null);

        // ── VIEW MODE — Command (decisions) vs Analyst (deep data) ──
        const [viewMode, setViewMode] = useState(() => {
            try { return localStorage.getItem('wr_view_mode') || 'command'; } catch(e) { return 'command'; }
        });
        const isCommand = viewMode === 'command';
        const isAnalyst = viewMode === 'analyst';
        useEffect(() => { try { localStorage.setItem('wr_view_mode', viewMode); } catch(e) {} }, [viewMode]);

        window._wrSelectPlayer = setSelectedPlayerPid;

        // Derived selectors — modules use these, never compute their own
        const isCurrentYear = timeYear === currentSeason;
        const isFutureYear = timeYear > currentSeason;
        const isHistoricalYear = timeYear < currentSeason;
        const timeMode = isFutureYear ? 'future' : isHistoricalYear ? 'historical' : 'current';
        const timeModeLabel = isFutureYear ? 'Projection View' : isHistoricalYear ? 'Historical View' : 'Current Season';
        const timeModeColor = isFutureYear ? '#3498DB' : isHistoricalYear ? '#F0A500' : '#2ECC71';
        const timeDelta = timeYear - currentSeason; // positive = future, negative = past
        const timeYears = [];
        for (let y = Math.max(2020, currentSeason - 5); y <= currentSeason + 2; y++) timeYears.push(y);

        // Persist time year
        useEffect(() => { try { localStorage.setItem('wr_time_year', String(timeYear)); } catch(e) {} }, [timeYear]);

        // Save base player data on first load (before any age projection)
        useEffect(() => {
            if (Object.keys(playersData).length > 100 && !basePlayersData) {
                setBasePlayersData(playersData);
            }
        }, [playersData]);

        // ── PROJECTION ENGINE: derive future player values from aging curves ──
        function projectPlayerValue(pid, baseDhq, baseAge, pos, delta) {
            if (!baseDhq || baseDhq <= 0 || delta === 0) return baseDhq;
            const peakWindows = window.App?.peakWindows || {QB:[24,34],RB:[22,27],WR:[22,30],TE:[23,30],DL:[23,29],LB:[23,28],DB:[23,29]};
            const decayRates = window.App?.decayRates || {QB:0.08,RB:0.30,WR:0.18,TE:0.15,DL:0.18,LB:0.18,DB:0.17};
            // Position ceilings — no player can project above these
            const posCeilings = {QB:9800,RB:9200,WR:9400,TE:8500,DL:7000,LB:6500,DB:6500};
            const nPos = pos === 'DE' || pos === 'DT' ? 'DL' : pos === 'CB' || pos === 'S' ? 'DB' : pos === 'OLB' || pos === 'ILB' ? 'LB' : pos;
            const [pLo, pHi] = peakWindows[nPos] || [24, 29];
            const decay = decayRates[nPos] || 0.15;
            const ceiling = posCeilings[nPos] || 9000;
            let val = baseDhq;

            if (!baseAge || baseAge <= 0) return baseDhq;

            // ── Trend factor: amplifies or dampens projection ──
            // Trend = YoY PPG % change. A +30% trending player projects higher.
            // Trend influence fades per projected year (stronger year 1, weaker year 3+)
            // Offseason: trend persists longer (no new data to update it)
            const meta = window.App?.LI?.playerMeta?.[pid];
            const trend = meta?.trend || 0;
            const nflState = window.S?.nflState?.season_type;
            const isOffseason = !nflState || nflState === 'off' || nflState === 'pre';
            // Trend half-life: offseason=3yr, in-season=1.5yr (fresh data replaces trend faster)
            const trendHalfLife = isOffseason ? 3 : 1.5;

            const isProven = baseDhq >= 4000;
            const isElite = baseDhq >= 7000;
            const peakMid = Math.floor((pLo + pHi) / 2);

            if (delta > 0) {
                for (let yr = 1; yr <= delta; yr++) {
                    const ageAtYr = baseAge + yr;
                    // Trend influence decays exponentially per projected year
                    const trendWeight = Math.exp(-0.693 * yr / trendHalfLife); // ln(2)/halfLife
                    const trendBoost = (trend / 100) * trendWeight * 0.5; // 50% of trend pct, decaying

                    if (ageAtYr <= pLo) {
                        // Pre-peak: aggressive growth. Young + trending up = dynasty gold.
                        const baseGrowth = isElite ? 0.18 : isProven ? 0.14 : 0.08;
                        const growth = Math.max(0.02, baseGrowth + trendBoost);
                        val *= 1 + growth;
                    } else if (ageAtYr <= peakMid) {
                        // Early peak: still growing but slower
                        const baseGrowth = isElite ? 0.08 : isProven ? 0.05 : 0.02;
                        val *= 1 + Math.max(-0.05, baseGrowth + trendBoost * 0.7);
                    } else if (ageAtYr <= pHi) {
                        // Late peak: plateau or start declining
                        const baseDelta = isElite ? 0.0 : isProven ? -(decay * 0.15) : -(decay * 0.3);
                        val *= 1 + baseDelta + trendBoost * 0.5;
                    } else {
                        // Past peak: accelerating decay — this is where value craters
                        const yearsPast = ageAtYr - pHi;
                        const accel = 1 + yearsPast * 0.25; // steeper acceleration
                        const negTrend = Math.min(0, trendBoost * 0.3); // only negative trend makes it worse
                        val *= Math.max(0.3, 1 - decay * accel + negTrend);
                    }
                    val = Math.min(val, ceiling); // cap at position ceiling
                }
            } else {
                // Historical projections (looking back)
                for (let yr = 1; yr <= Math.abs(delta); yr++) {
                    const ageAtYr = (baseAge || 25) - yr;
                    if (ageAtYr < pLo - 2) {
                        val *= (1 - 0.18);
                    } else if (ageAtYr <= pHi) {
                        val *= (1 + decay * 0.12);
                    } else {
                        val *= (1 + decay * 0.6);
                    }
                }
            }
            return Math.max(0, Math.round(val));
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

                    // 4. Update window.S
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
        const [visibleCols, setVisibleCols] = useState(() => {
            try {
                const saved = localStorage.getItem('wr_roster_cols');
                return saved ? JSON.parse(saved) : ['pos','age','dhq','peak','trend','action','yrsExp','posRankLg','starterSzn','acquired','acquiredDate'];
            } catch(e) { return ['pos','age','dhq','peak','trend','action','yrsExp','posRankLg','starterSzn','acquired','acquiredDate']; }
        });
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
        const [leagueSubView, setLeagueSubView] = useState('teams');
        const [lpSort, setLpSort] = useState({ key: 'dhq', dir: 1 });
        const [lpFilter, setLpFilter] = useState('');

        // Default 5 KPIs — customizable per owner, saved in localStorage
        const KPI_OPTIONS = {
            'starter-gap':    { label: 'Starter Gap', icon: '', category: 'Roster', tip: 'Difference between your optimal weekly PPG and league target (median x1.05)' },
            'portfolio':      { label: 'Portfolio DHQ', icon: '', category: 'Roster', tip: 'Sum of all DHQ values on your roster' },
            'value-rank':     { label: 'Value Rank', icon: '', category: 'League', tip: 'Where your total roster DHQ ranks in the league' },
            'health-score':   { label: 'Health Score', icon: '', category: 'Roster', tip: '60% Scoring Power + 40% Position Coverage. 90+=Elite, 75+=Contender' },
            'avg-age':        { label: 'Avg Age', icon: '', category: 'Roster', tip: 'DHQ-weighted average age. Lower = longer dynasty window' },
            'top5-conc':      { label: 'Top 5 Concentration', icon: '', category: 'Roster', tip: '% of DHQ held by top 5 players. High = fragile roster' },
            'hit-rate':       { label: 'Draft Hit Rate', icon: '', category: 'Draft', tip: '% of drafted players who became fantasy starters' },
            'faab-efficiency':{ label: 'FAAB Efficiency', icon: '', category: 'Waivers', tip: 'DHQ value gained per FAAB dollar spent' },
            'net-trade':      { label: 'Net DHQ/Trade', icon: '', category: 'Trades', tip: 'Average DHQ gained or lost per trade' },
            'trade-velocity': { label: 'Trade Velocity', icon: '', category: 'Trades', tip: 'Number of trades completed' },
            'window':         { label: 'Compete Window', icon: '', category: 'Projection', tip: 'Estimated years your roster can compete based on age decay' },
            'aging-cliff':    { label: 'Aging Cliff %', icon: '', category: 'Projection', tip: '% of DHQ held by players past peak within 2 years' },
            'partner-wr':     { label: 'Partner Win Rate', icon: '', category: 'Trades', tip: '% of trades where you gained >15% more DHQ' },
            'elite-count':    { label: 'Elite Players', icon: '', category: 'Roster', tip: 'Players with DHQ 7000+ (league-winning assets)' },
            'bench-quality':  { label: 'Bench Quality', icon: '', category: 'Roster', tip: 'Average DHQ of non-starter roster players' },
            'championships':    { label: 'Championships Won', icon: '', category: 'History', tip: 'Total league championships from bracket data' },
            'playoff-record':   { label: 'Playoff Win-Loss', icon: '', category: 'History', tip: 'Career playoff wins and losses' },
            'playoff-winpct':   { label: 'Playoff Win %', icon: '', category: 'History', tip: 'Win percentage in playoff matchups' },
            'champ-appearances':{ label: 'Championship Appearances', icon: '', category: 'History', tip: 'Times reached the championship round' },
            'dynasty-score':    { label: 'Dynasty Score', icon: '', category: 'History', tip: 'Championships (40%) + Playoffs (30%) + Regular Season (30%)' },
            'draft-roi':        { label: 'Draft ROI', icon: '', category: 'Draft', tip: 'Current DHQ of drafted players vs capital spent' },
            'roster-turnover':  { label: 'Roster Turnover', icon: '', category: 'Roster', tip: 'Trades completed this cycle' },
        };
        const DEFAULT_KPIS = ['starter-gap', 'hit-rate', 'faab-efficiency', 'net-trade', 'window'];
        const [selectedKpis, setSelectedKpis] = useState(() => {
            try {
                const saved = localStorage.getItem('wr_kpi_selection_' + (currentLeague?.id || ''));
                return saved ? JSON.parse(saved) : DEFAULT_KPIS;
            } catch(e) { return DEFAULT_KPIS; }
        });
        useEffect(() => {
            try { localStorage.setItem('wr_kpi_selection_' + (currentLeague?.id || ''), JSON.stringify(selectedKpis)); } catch(e) {}
        }, [selectedKpis]);

        useEffect(() => {
            try { localStorage.setItem('wr_roster_cols', JSON.stringify(visibleCols)); } catch(e) {}
        }, [visibleCols]);

        function computeKpiValue(kpiKey) {
            const LI = window.App?.LI || {};
            const scores = LI.playerScores || {};
            const myPlayers = myRoster?.players || [];
            const profile = LI.ownerProfiles?.[myRoster?.roster_id];
            switch(kpiKey) {
                case 'portfolio': {
                    const total = myPlayers.reduce((s, pid) => s + (scores[pid] || 0), 0);
                    // Spark: all team totals for league comparison
                    const allTotals = (currentLeague.rosters || []).map(r => (r.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0)).sort((a,b) => a-b);
                    return { value: total.toLocaleString(), sub: 'Total DHQ', color: 'var(--gold)', sparkData: allTotals };
                }
                case 'value-rank': {
                    const vals = (currentLeague.rosters || []).map(r => (r.players || []).reduce((s, pid) => s + (scores[pid] || 0), 0)).sort((a,b) => b - a);
                    const myTotal = myPlayers.reduce((s, pid) => s + (scores[pid] || 0), 0);
                    const rank = vals.findIndex(v => v <= myTotal) + 1;
                    return { value: '#' + (rank || '?') + '/' + standings.length, sub: 'League rank', color: rank <= 3 ? '#2ECC71' : rank <= 6 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'health-score': {
                    const ranked = rankedTeams.find(t => t.userId === sleeperUserId);
                    const hs = ranked?.healthScore || 0;
                    const allHS = rankedTeams.map(t => t.healthScore || 0).sort((a,b) => a-b);
                    return { value: hs || '\u2014', sub: 'Score', color: hs >= 80 ? '#2ECC71' : hs >= 60 ? 'var(--gold)' : '#E74C3C', sparkData: allHS };
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
                    return { value: pct + '%', sub: 'In top 5 players', color: pct >= 65 ? '#2ECC71' : pct >= 50 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'hit-rate': {
                    if (!profile || !profile.trades) return { value: '\u2014', sub: 'Draft hit rate', color: 'var(--silver)' };
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
                    const avgAge = myPlayers.reduce((s, pid) => s + (playersData[pid]?.age || 26), 0) / myPlayers.length;
                    const yrs = Math.max(0, Math.round(29 - avgAge));
                    return { value: yrs > 0 ? yrs + 'yr' : 'Now', sub: 'Compete window', color: yrs >= 3 ? '#2ECC71' : yrs >= 1 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'aging-cliff': {
                    const total = myPlayers.reduce((s, pid) => s + (scores[pid] || 0), 0);
                    const pastPeak = myPlayers.reduce((s, pid) => {
                        const p = playersData[pid]; if (!p) return s;
                        const pos = p.position; const age = p.age || 26;
                        const peaks = {QB:33,RB:26,WR:29,TE:30,DL:29,LB:28,DB:29};
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
                    const elites = myPlayers.filter(pid => (scores[pid] || 0) >= 7000).length;
                    return { value: elites + ' elite' + (elites !== 1 ? 's' : ''), sub: 'Players above 7000 DHQ', color: elites >= 3 ? '#2ECC71' : elites >= 1 ? 'var(--gold)' : '#E74C3C' };
                }
                case 'bench-quality': {
                    const starters = new Set(myRoster?.starters || []);
                    const benchVals = myPlayers.filter(pid => !starters.has(pid)).map(pid => scores[pid] || 0).filter(v => v > 0);
                    const avg = benchVals.length ? Math.round(benchVals.reduce((s,v) => s + v, 0) / benchVals.length) : 0;
                    return { value: avg.toLocaleString(), sub: 'Avg bench DHQ', color: avg >= 2500 ? '#2ECC71' : avg >= 1500 ? 'var(--gold)' : 'var(--silver)' };
                }
                case 'championships': {
                    const champs = window.App?.LI?.championships || {};
                    const count = Object.values(champs).filter(c => c.champion === myRoster?.roster_id).length;
                    return { value: count, sub: count === 1 ? 'title' : 'titles', color: count > 0 ? '#D4AF37' : 'var(--silver)' };
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
                default: return { value: '\u2014', sub: '', color: 'var(--silver)' };
            }
        }
        const [reconPanelOpen, setReconPanelOpen] = useState(false);
        const [showNotifications, setShowNotifications] = useState(false);
        const [sidebarOpen, setSidebarOpen] = useState(false);
        const [gmStrategyOpen, setGmStrategyOpen] = useState(false);
        const [gmStrategy, setGmStrategy] = useState(() => {
            try {
                const saved = localStorage.getItem('wr_gm_strategy_' + currentLeague?.league_id);
                return saved ? JSON.parse(saved) : { mode: 'balanced', riskTolerance: 'moderate', positionalNeeds: {}, untouchable: [], targets: [], notes: '' };
            } catch { return { mode: 'balanced', riskTolerance: 'moderate', positionalNeeds: {}, untouchable: [], targets: [], notes: '' }; }
        });
        useEffect(() => {
            if (currentLeague?.league_id) {
                try { localStorage.setItem('wr_gm_strategy_' + currentLeague.league_id, JSON.stringify(gmStrategy)); } catch {}
                // Expose to window for AI context
                window._wrGmStrategy = gmStrategy;
            }
        }, [gmStrategy, currentLeague?.league_id]);

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
          try {
            const saved = localStorage.getItem('wr_chat_' + currentLeague?.league_id);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 1) return parsed;
            }
          } catch {}
          return [{ role: 'assistant', content: 'Ask me anything about your league, team, or players.' }];
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
          const welcomeKey = 'wr_welcomed_v2_' + currentLeague.league_id;
          if (localStorage.getItem(welcomeKey)) return;
          localStorage.setItem(welcomeKey, '1');
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
          try {
            const toSave = reconMessages.slice(-20).map(m => ({ role: m.role, content: m.content }));
            localStorage.setItem('wr_chat_' + currentLeague.league_id, JSON.stringify(toSave));
          } catch {}
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

                    // Bridge stats data
                    Object.entries(stats).forEach(([pid, s]) => {
                        if (!window.S.playerStats[pid]) window.S.playerStats[pid] = {};
                        const pts = calcRawPts(s);
                        const gp = s.gp || 0;
                        window.S.playerStats[pid].prevTotal = pts ? Math.round(pts * 10) / 10 : 0;
                        window.S.playerStats[pid].prevAvg = gp > 0 ? Math.round(pts / gp * 10) / 10 : 0;
                        window.S.playerStats[pid].prevRawStats = s;
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
                            } catch(e) {}
                        }
                    })(),
                ]);

                setLoadStage('');

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
            if (!s) return null;
            const scoring = currentLeague?.scoring_settings;
            if (scoring) {
                let total = 0;
                for (const [field, weight] of Object.entries(scoring)) {
                    if (typeof weight !== 'number') continue;
                    if (s[field] != null) total += Number(s[field]) * weight;
                }
                return total;
            }
            // Fallback: Sleeper's pre-calculated totals (offensive players only)
            const pre = s.pts_half_ppr ?? s.pts_ppr ?? s.pts_std ?? null;
            return pre !== null ? Number(pre) : null;
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
                    } catch(e) {}
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
            // Route scout requests through trade-scout prompt for richer output
            const isScoutRequest = /^Scout\s/i.test(text.trim());
            const aiType = isScoutRequest ? 'trade-scout' : 'home-chat';
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
            // Check trades
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
            // Check draft outcomes
            const drafts = window.App?.LI?.draftOutcomes || [];
            const draftPick = drafts.find(d => d.pid === pid && d.roster_id === rosterId);
            if (draftPick) {
                return { method: 'Drafted', date: draftPick.season + ' R' + draftPick.round, cost: '', season: draftPick.season, week: 0 };
            }
            // Default: original/unknown
            return { method: 'Original', date: '\u2014', cost: '', season: '', week: 0 };
        }

        function renderLeagueTab() {
          const selectedTeam = leagueSelectedTeam;
          const setSelectedTeam = setLeagueSelectedTeam;

          const normPos = (pos) => {
            if (!pos) return null;
            const p = pos.toUpperCase();
            if (['DE','DT','NT','IDL','EDGE'].includes(p)) return 'DL';
            if (['ILB','OLB','MLB'].includes(p)) return 'LB';
            if (['CB','SS','FS','S'].includes(p)) return 'DB';
            return p;
          };

          if (selectedTeam) {
            return renderTeamRoster(selectedTeam);
          }

          const sortedStandings = [...standings].sort((a, b) => {
            if (leagueSort === 'dhq') {
              const rA = currentLeague.rosters.find(r => r.owner_id === a.userId);
              const rB = currentLeague.rosters.find(r => r.owner_id === b.userId);
              const dhqA = (rA?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
              const dhqB = (rB?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
              return dhqB - dhqA;
            }
            if (leagueSort === 'champs') {
              const champs = window.App?.LI?.championships || {};
              const rA = currentLeague.rosters.find(r => r.owner_id === a.userId);
              const rB = currentLeague.rosters.find(r => r.owner_id === b.userId);
              const aChamps = Object.values(champs).filter(c => c.champion === rA?.roster_id).length;
              const bChamps = Object.values(champs).filter(c => c.champion === rB?.roster_id).length;
              return bChamps - aChamps;
            }
            if (leagueSort === 'health') {
              const rA = currentLeague.rosters.find(r => r.owner_id === a.userId);
              const rB = currentLeague.rosters.find(r => r.owner_id === b.userId);
              const hsA = (typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(rA?.roster_id) : null)?.healthScore || 0;
              const hsB = (typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(rB?.roster_id) : null)?.healthScore || 0;
              return hsB - hsA;
            }
            // default: wins
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.losses - a.losses;
          });
          const sortBtnStyle = (active) => ({
            padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Oswald, sans-serif', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.15s',
            border: '1px solid ' + (active ? 'var(--gold)' : 'rgba(212,175,55,0.3)'),
            background: active ? 'var(--gold)' : 'transparent',
            color: active ? 'var(--black)' : 'var(--gold)',
          });

          return (
            <div style={{ padding: '16px' }}>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--gold)', marginBottom: '2px' }}>LEAGUE MAP</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' }}>Every team, asset, and competitive position in your league</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button onClick={() => setLeagueSubView('command')} style={sortBtnStyle(leagueSubView === 'command')}>Command</button>
                <button onClick={() => setLeagueSubView('teams')} style={sortBtnStyle(leagueSubView === 'teams')}>Teams</button>
                <button onClick={() => setLeagueSubView('players')} style={sortBtnStyle(leagueSubView === 'players')}>All Players</button>
                <button onClick={() => setLeagueSubView('picks')} style={sortBtnStyle(leagueSubView === 'picks')}>Draft Picks</button>
              </div>
              {leagueSubView === 'command' && (() => {
                // Assess all teams
                const allAssessments = (typeof window.assessAllTeamsFromGlobal === 'function' ? window.assessAllTeamsFromGlobal() : [])
                  .filter(a => a && a.rosterId);
                if (!allAssessments.length) return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--silver)' }}>Loading league intelligence...</div>;

                // Group by tier
                const tiers = { ELITE: [], CONTENDER: [], CROSSROADS: [], REBUILDING: [] };
                allAssessments.forEach(a => { if (tiers[a.tier]) tiers[a.tier].push(a); });

                // Sort by health within each tier
                Object.values(tiers).forEach(arr => arr.sort((a, b) => b.healthScore - a.healthScore));

                // Health rankings (all teams sorted)
                const ranked = [...allAssessments].sort((a, b) => b.healthScore - a.healthScore);

                // Find top trade targets league-wide (highest DHQ players on rebuilding teams)
                const tradeTargets = [];
                allAssessments.filter(a => a.window === 'REBUILDING' || a.window === 'TRANSITIONING').forEach(a => {
                  const roster = currentLeague.rosters.find(r => r.roster_id === a.rosterId);
                  (roster?.players || []).forEach(pid => {
                    const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                    if (dhq >= 5000) tradeTargets.push({ pid, dhq, owner: a.ownerName, tier: a.tier });
                  });
                });
                tradeTargets.sort((a, b) => b.dhq - a.dhq);

                // Power balance — top 3 teams for radar
                const top3 = ranked.slice(0, 3);
                const tierColors = { ELITE: '#D4AF37', CONTENDER: '#2ECC71', CROSSROADS: '#F0A500', REBUILDING: '#E74C3C' };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Tier Overview */}
                    <div>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '10px' }}>COMPETITIVE TIERS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                        {Object.entries(tiers).map(([tierName, teams]) => (
                          <div key={tierName} style={{ background: 'var(--black)', border: '2px solid ' + (tierColors[tierName] || '#666') + '44', borderRadius: '10px', padding: '14px', borderLeft: '4px solid ' + (tierColors[tierName] || '#666') }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: tierColors[tierName], marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              {tierName}
                              <span style={{ fontSize: '0.74rem', fontFamily: 'Oswald', color: 'var(--silver)', fontWeight: 400 }}>{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
                            </div>
                            {teams.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.5 }}>None</div> : teams.map(t => (
                              <div key={t.rosterId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: t.ownerId === sleeperUserId ? 700 : 400 }}>{t.ownerName}{t.ownerId === sleeperUserId ? ' (You)' : ''}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{t.wins}-{t.losses}</span>
                                  {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: t.healthScore, size: 28, thickness: 3 })}
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tierColors[tierName] }}>{t.healthScore}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Health Rankings */}
                    <div>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '10px' }}>HEALTH RANKINGS</div>
                      <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                        {ranked.map((t, i) => {
                          const isMe = t.ownerId === sleeperUserId;
                          return (
                            <div key={t.rosterId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: isMe ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                              <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)', width: '28px', textAlign: 'center' }}>{i + 1}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.84rem', fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--gold)' : 'var(--white)' }}>{t.ownerName}{isMe ? ' (You)' : ''}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.7 }}>
                                  {t.wins}-{t.losses} {'\u00B7'} {t.tier} {'\u00B7'} {t.needs?.length ? 'Needs: ' + t.needs.join(', ') : 'No major needs'}
                                </div>
                              </div>
                              <div style={{ width: '120px', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexShrink: 0 }}>
                                <div style={{ width: t.healthScore + '%', height: '100%', borderRadius: '4px', background: t.healthScore >= 85 ? '#D4AF37' : t.healthScore >= 70 ? '#2ECC71' : t.healthScore >= 55 ? '#F0A500' : '#E74C3C' }}></div>
                              </div>
                              <span style={{ fontSize: '0.84rem', fontWeight: 700, fontFamily: 'Oswald', color: tierColors[t.tier], width: '30px', textAlign: 'right' }}>{t.healthScore}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Trade Targets (players on rebuilding/transitioning teams) */}
                    {tradeTargets.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '10px' }}>TOP TRADE TARGETS</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '8px' }}>High-value players on rebuilding or transitioning teams</div>
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                          {tradeTargets.slice(0, 10).map((t, i) => {
                            const p = playersData[t.pid];
                            if (!p) return null;
                            const meta = window.App?.LI?.playerMeta?.[t.pid];
                            return (
                              <div key={t.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(t.pid); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                                  <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + t.pid + '.jpg'} style={{ width: '28px', height: '28px', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--white)' }}>{p.full_name || (p.first_name + ' ' + p.last_name)}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.7 }}>{p.position} {'\u00B7'} {p.team || 'FA'} {'\u00B7'} Owned by {t.owner} ({t.tier})</div>
                                </div>
                                <span style={{ fontWeight: 700, fontFamily: 'Oswald', fontSize: '0.84rem', color: t.dhq >= 7000 ? '#2ECC71' : '#3498DB' }}>{t.dhq.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Power Balance Radar — Top 3 Teams */}
                    {top3.length >= 2 && typeof RadarChart !== 'undefined' && (
                      <div>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '10px' }}>POWER BALANCE — TOP 3</div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 250px', display: 'flex', justifyContent: 'center' }}>
                            {React.createElement(RadarChart, {
                              values: (() => {
                                const best = top3[0];
                                const roster = currentLeague.rosters.find(r => r.roster_id === best.rosterId);
                                const totalDHQ = (roster?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                                const elites = (roster?.players || []).filter(pid => (window.App?.LI?.playerScores?.[pid] || 0) >= 7000).length;
                                const ages = (roster?.players || []).map(pid => playersData[pid]?.age).filter(a => a && a > 18);
                                const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 28;
                                return {
                                  Health: best.healthScore,
                                  'DHQ Value': Math.min(100, totalDHQ / 800),
                                  Youth: Math.min(100, Math.max(0, (32 - avgAge) * 12)),
                                  Elites: Math.min(100, elites * 20),
                                  Depth: Math.min(100, (roster?.players?.length || 0) * 4),
                                };
                              })(),
                              size: 220,
                            })}
                          </div>
                          <div style={{ flex: '1 1 200px' }}>
                            {top3.map((t, i) => (
                              <div key={t.rosterId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', color: i === 0 ? '#D4AF37' : i === 1 ? '#C0C0C0' : '#CD7F32', width: '20px' }}>{i + 1}</span>
                                <div>
                                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: t.ownerId === sleeperUserId ? 'var(--gold)' : 'var(--white)' }}>{t.ownerName}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{t.tier} {'\u00B7'} Health: {t.healthScore} {'\u00B7'} {t.strengths?.length ? 'Strong: ' + t.strengths.join(', ') : ''}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {leagueSubView === 'teams' && (<div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button onClick={() => setLeagueSort('wins')} style={sortBtnStyle(leagueSort === 'wins')}>Wins</button>
                <button onClick={() => setLeagueSort('dhq')} style={sortBtnStyle(leagueSort === 'dhq')}>DHQ Value</button>
                <button onClick={() => setLeagueSort('health')} style={sortBtnStyle(leagueSort === 'health')}>Health Score</button>
                <button onClick={() => setLeagueSort('champs')} style={sortBtnStyle(leagueSort === 'champs')}>Championships</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {sortedStandings.map(team => {
                  const roster = currentLeague.rosters.find(r => r.owner_id === team.userId);
                  const totalDHQ = (roster?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                  const isMe = team.userId === sleeperUserId;
                  const user = currentLeague.users?.find(u => u.user_id === team.userId);
                  return (
                    <div key={team.rosterId} onClick={() => setSelectedTeam({ ...team, roster })}
                      style={{
                        background: 'var(--black)', border: '2px solid ' + (isMe ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                        borderRadius: '10px', padding: '14px', cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = isMe ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        {user?.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + user.avatar} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />}
                        <div>
                          <div style={{ fontWeight: 700, color: isMe ? 'var(--gold)' : 'var(--white)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {team.displayName}{isMe ? ' (You)' : ''}
                            {(() => {
                              const champs = window.App?.LI?.championships || {};
                              const champCount = Object.values(champs).filter(c => c.champion === roster?.roster_id).length;
                              if (champCount > 0) return <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 700 }}>{champCount > 1 ? champCount + 'x ' : ''}Champion</span>;
                              return null;
                            })()}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--silver)', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {roster?.settings?.wins ?? team.wins}-{roster?.settings?.losses ?? team.losses}{(roster?.settings?.ties > 0) ? '-' + roster.settings.ties : ''}{roster?.settings?.fpts ? ' (' + roster.settings.fpts + ' PF)' : ''} {'\u00B7'} {totalDHQ > 0 ? (totalDHQ/1000).toFixed(0) + 'k DHQ' : '\u2014'}
                            {(() => {
                              const hist = window.App?.LI?.leagueUsersHistory || {};
                              let yrs = 0;
                              Object.values(hist).forEach(users => { (users || []).forEach(u => { if (u.user_id === team.userId) yrs++; }); });
                              if (yrs <= 1) return <span style={{ fontSize: '0.76rem', color: '#F0A500', fontWeight: 700, marginLeft: '4px' }}>NEW</span>;
                              if (yrs >= 4) return <span style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginLeft: '4px' }}>{yrs}yr</span>;
                              return null;
                            })()}
                          </div>
                          {(() => {
                            const oh = typeof buildOwnerHistory === 'function' ? buildOwnerHistory() : {};
                            const h = oh[roster?.roster_id];
                            if (!h || (!h.playoffWins && !h.playoffLosses && !h.totalTrades)) return null;
                            return (
                              <div style={{ fontSize: '0.76rem', color: 'var(--silver)', display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', opacity: 0.7 }}>
                                {(h.playoffWins > 0 || h.playoffLosses > 0) && <span>Playoffs {h.playoffRecord}</span>}
                                {(h.playoffWins > 0 || h.playoffLosses > 0) && h.totalTrades > 0 && <span>{'\u00B7'}</span>}
                                {h.totalTrades > 0 && <span>{h.totalTrades} trades</span>}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      {(() => {
                        const rPlayers = roster?.players || [];
                        const scored = rPlayers.map(pid => ({ pid, dhq: window.App?.LI?.playerScores?.[pid] || 0, meta: window.App?.LI?.playerMeta?.[pid] }));
                        const eliteThr = 7000;
                        const eliteCount = scored.filter(x => x.dhq >= eliteThr).length;
                        const ages = scored.map(x => x.meta?.age).filter(a2 => a2 && a2 > 18 && a2 < 45);
                        const avgAge = ages.length > 0 ? (ages.reduce((s,a2) => s + a2, 0) / ages.length).toFixed(1) : '\u2014';
                        // Positional needs: positions where team is below league avg investment
                        const posNeeds = [];
                        const LIx = window.App?.LI;
                        if (LIx?.playerMeta) {
                          const posDhq = {};
                          scored.forEach(x => { const pos2 = x.meta?.pos || 'UNK'; posDhq[pos2] = (posDhq[pos2] || 0) + x.dhq; });
                          const teamTotal = scored.reduce((s,x) => s + x.dhq, 0) || 1;
                          ['QB','RB','WR','TE'].forEach(pos2 => {
                            const pct = (posDhq[pos2] || 0) / teamTotal;
                            if (pct < 0.10) posNeeds.push(pos2);
                          });
                        }
                        // Status tag from assessment
                        const teamAssess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(roster?.roster_id) : null;
                        const tier2 = (teamAssess?.tier || '').toUpperCase();
                        const tierCol2 = tier2 === 'ELITE' ? '#D4AF37' : tier2 === 'CONTENDER' ? '#2ECC71' : tier2 === 'CROSSROADS' ? '#F0A500' : tier2 === 'REBUILDING' ? '#E74C3C' : 'var(--silver)';
                        const hs2 = teamAssess?.healthScore || 0;

                        return (
                          <div style={{ fontSize: '0.74rem', color: 'var(--silver)', lineHeight: 1.6 }}>
                            {/* Status tag + health */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                              {tier2 && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tierCol2, background: tierCol2 + '15', padding: '1px 8px', borderRadius: '4px', textTransform: 'uppercase', fontFamily: 'Oswald' }}>{tier2}</span>}
                              {hs2 > 0 && <span style={{ fontSize: '0.72rem', color: hs2 >= 75 ? '#2ECC71' : hs2 >= 55 ? '#F0A500' : '#E74C3C', fontWeight: 600 }}>{hs2} health</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', opacity: 0.7 }}>
                              <span>{rPlayers.length} players</span>
                              <span>{'\u00B7'} Avg {avgAge}yr</span>
                              <span>{'\u00B7'} {eliteCount} elite</span>
                            </div>
                            {posNeeds.length > 0 && <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                              {posNeeds.map(pos2 => <span key={pos2} style={{ fontSize: '0.68rem', color: '#E74C3C', background: 'rgba(231,76,60,0.1)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>Need {pos2}</span>)}
                            </div>}
                            {scored.sort((a2,b2) => b2.dhq - a2.dhq).slice(0, 3).map(x => (
                              <div key={x.pid} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{playersData[x.pid]?.full_name || '?'}</span>
                                <span style={{ color: x.dhq >= eliteThr ? '#2ECC71' : x.dhq >= 4000 ? '#3498DB' : 'var(--silver)', fontFamily: 'Oswald' }}>{x.dhq > 0 ? x.dhq.toLocaleString() : '\u2014'}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              </div>)}
              {leagueSubView === 'players' && (() => {
                const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};
                const allPlayers = [];
                (currentLeague.rosters || []).forEach(r => {
                    const user = currentLeague.users?.find(u => u.user_id === r.owner_id);
                    const teamName = user?.display_name || user?.username || 'Team';
                    (r.players || []).forEach(pid => {
                        const p = playersData[pid]; if (!p) return;
                        const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                        const pos = normPos(p.position) || p.position;
                        const st = statsData[pid] || {};
                        const ppg = st.gp > 0 ? +(calcRawPts(st) / st.gp).toFixed(1) : 0;
                        allPlayers.push({ pid, p, pos, dhq, ppg, age: p.age || null, teamName, rosterId: r.roster_id, isMe: r.roster_id === myRoster?.roster_id });
                    });
                });
                let filtered = allPlayers;
                if (lpFilter) filtered = filtered.filter(x => x.pos === lpFilter);
                filtered.sort((a, b) => {
                    const { key, dir } = lpSort;
                    if (key === 'dhq') return (b.dhq - a.dhq) * dir;
                    if (key === 'age') return ((a.age||99) - (b.age||99)) * dir;
                    if (key === 'ppg') return (b.ppg - a.ppg) * dir;
                    if (key === 'name') return (a.p.full_name||'').localeCompare(b.p.full_name||'') * dir;
                    if (key === 'team') return a.teamName.localeCompare(b.teamName) * dir;
                    return 0;
                });
                return (
                    <div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {['','QB','RB','WR','TE','DL','LB','DB','K'].map(pos => (
                                <button key={pos} onClick={() => setLpFilter(pos)} style={{
                                    padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', textTransform: 'uppercase',
                                    background: lpFilter === pos ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                                    color: lpFilter === pos ? 'var(--black)' : 'var(--silver)',
                                    border: '1px solid ' + (lpFilter === pos ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                                    borderRadius: '3px', cursor: 'pointer'
                                }}>{pos || 'All'}</button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--silver)', alignSelf: 'center' }}>{filtered.length} players</span>
                        </div>
                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '24px 28px 1fr 36px 32px 54px 42px 100px', gap: '4px', padding: '6px 10px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                                <span>#</span><span></span>
                                <span style={{ cursor: 'pointer' }} onClick={() => setLpSort(prev => prev.key === 'name' ? {...prev, dir: prev.dir*-1} : {key:'name',dir:1})}>Player{lpSort.key==='name'?(lpSort.dir===-1?' \u25BC':' \u25B2'):''}</span>
                                <span>Pos</span>
                                <span style={{ cursor: 'pointer' }} onClick={() => setLpSort(prev => prev.key === 'age' ? {...prev, dir: prev.dir*-1} : {key:'age',dir:1})}>Age{lpSort.key==='age'?(lpSort.dir===-1?' \u25BC':' \u25B2'):''}</span>
                                <span style={{ cursor: 'pointer' }} onClick={() => setLpSort(prev => prev.key === 'dhq' ? {...prev, dir: prev.dir*-1} : {key:'dhq',dir:-1})}>DHQ{lpSort.key==='dhq'?(lpSort.dir===-1?' \u25BC':' \u25B2'):''}</span>
                                <span style={{ cursor: 'pointer' }} onClick={() => setLpSort(prev => prev.key === 'ppg' ? {...prev, dir: prev.dir*-1} : {key:'ppg',dir:-1})}>PPG{lpSort.key==='ppg'?(lpSort.dir===-1?' \u25BC':' \u25B2'):''}</span>
                                <span style={{ cursor: 'pointer' }} onClick={() => setLpSort(prev => prev.key === 'team' ? {...prev, dir: prev.dir*-1} : {key:'team',dir:1})}>Owner{lpSort.key==='team'?(lpSort.dir===-1?' \u25BC':' \u25B2'):''}</span>
                            </div>
                            <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                                {filtered.slice(0, 100).map((x, idx) => (
                                    <div key={x.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(x.pid); }}
                                        style={{ display: 'grid', gridTemplateColumns: '24px 28px 1fr 36px 32px 54px 42px 100px', gap: '4px', padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.72rem', alignItems: 'center', background: x.isMe ? 'rgba(212,175,55,0.04)' : 'transparent', transition: 'background 0.1s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                                        onMouseLeave={e => e.currentTarget.style.background = x.isMe ? 'rgba(212,175,55,0.04)' : 'transparent'}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--silver)', fontFamily: 'Oswald' }}>{idx+1}</span>
                                        <div style={{ width: '22px', height: '22px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+x.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'22px',height:'22px',borderRadius:'50%',objectFit:'cover' }} /></div>
                                        <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 600, color: x.isMe ? 'var(--gold)' : 'var(--white)' }}>{x.p.full_name || (x.p.first_name+' '+x.p.last_name).trim()}</div>
                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: posColors[x.pos] || 'var(--silver)' }}>{x.pos}</span>
                                        <span style={{ color: 'var(--silver)' }}>{x.age || '\u2014'}</span>
                                        <span style={{ fontWeight: 700, fontFamily: 'Oswald', color: x.dhq >= 7000 ? '#2ECC71' : x.dhq >= 4000 ? '#3498DB' : x.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)' }}>{x.dhq > 0 ? x.dhq.toLocaleString() : '\u2014'}</span>
                                        <span style={{ color: 'var(--silver)' }}>{x.ppg || '\u2014'}</span>
                                        <span style={{ fontSize: '0.74rem', color: x.isMe ? 'var(--gold)' : 'var(--silver)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.teamName}{x.isMe ? ' (You)' : ''}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
              })()}
              {leagueSubView === 'picks' && (() => {
    const tradedPicks = window.S?.tradedPicks || [];
    const leagueSeason = parseInt(currentLeague.season || activeYear);
    const draftRounds = currentLeague.settings?.draft_rounds || 5;
    const years = [leagueSeason, leagueSeason + 1, leagueSeason + 2];

    const getOwner = (rid) => {
        const roster = (currentLeague.rosters || []).find(r => r.roster_id === rid);
        const user = (currentLeague.users || []).find(u => u.user_id === roster?.owner_id);
        return user?.display_name || user?.username || 'Team ' + rid;
    };

    return (
        <div>
            {years.map(yr => (
                <div key={yr} style={{ marginBottom: '16px' }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.2rem', color: 'var(--gold)', marginBottom: '8px' }}>{yr} DRAFT PICKS</div>
                    <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 60px', gap: '4px', padding: '6px 10px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                            <span>Pick</span><span>Current Owner</span><span>Original Owner</span><span>Status</span>
                        </div>
                        <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                            {Array.from({ length: draftRounds }, (_, rd) => rd + 1).flatMap(rd => {
                                // For each round, build one row per roster
                                return (currentLeague.rosters || []).map(r => {
                                    const originalRid = r.roster_id;
                                    // Check if this pick was traded
                                    const trade = tradedPicks.find(tp =>
                                        String(tp.season) === String(yr) &&
                                        tp.round === rd &&
                                        tp.roster_id === originalRid
                                    );
                                    const currentOwnerRid = trade ? trade.owner_id : originalRid;
                                    const traded = trade && trade.owner_id !== originalRid;
                                    const isMyPick = currentOwnerRid === myRoster?.roster_id;
                                    const isMyOriginal = originalRid === myRoster?.roster_id;

                                    return (
                                        <div key={yr+'-'+rd+'-'+originalRid} style={{
                                            display: 'grid', gridTemplateColumns: '60px 1fr 1fr 60px', gap: '4px',
                                            padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            fontSize: '0.72rem', alignItems: 'center',
                                            background: isMyPick ? 'rgba(212,175,55,0.04)' : 'transparent'
                                        }}>
                                            <span style={{ fontFamily: 'Oswald', fontWeight: 700, color: rd === 1 ? 'var(--gold)' : 'var(--silver)' }}>R{rd}</span>
                                            <span style={{ color: isMyPick ? 'var(--gold)' : 'var(--white)', fontWeight: isMyPick ? 700 : 400 }}>
                                                {getOwner(currentOwnerRid)}{isMyPick ? ' (You)' : ''}
                                            </span>
                                            <span style={{ color: 'var(--silver)', opacity: traded ? 1 : 0.4 }}>
                                                {getOwner(originalRid)}{isMyOriginal ? ' (You)' : ''}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: traded ? '#F0A500' : '#2ECC71' }}>
                                                {traded ? 'Traded' : 'Own'}
                                            </span>
                                        </div>
                                    );
                                });
                            })}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
})()}
            </div>
          );

          function renderTeamRoster(team) {
            const roster = team.roster;
            if (!roster) return null;
            const players = (roster.players || []).map(pid => {
              const p = playersData[pid];
              if (!p) return null;
              const pos = normPos(p.position) || p.position;
              const dhq = window.App?.LI?.playerScores?.[pid] || 0;
              const acq = getAcquisitionInfo(pid, roster.roster_id);
              const st = statsData[pid] || {};
              const ppg = st.gp > 0 ? +(calcRawPts(st) / st.gp).toFixed(1) : 0;
              const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};
              const isStarter = (roster.starters || []).includes(pid);
              return { pid, p, pos, dhq, acq, ppg, isStarter, posCol: posColors[pos] || 'var(--silver)' };
            }).filter(Boolean).sort((a,b) => b.dhq - a.dhq);

            return (
              <div style={{ padding: '16px' }}>
                <button onClick={() => { setSelectedTeam(null); setLeagueViewMode('roster'); }} style={{ background: 'none', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '4px', padding: '4px 12px', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.78rem', marginBottom: '12px' }}>Back to League</button>
                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--gold)', marginBottom: '4px' }}>{team.displayName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '12px' }}>
                  {roster?.settings?.wins ?? team.wins}-{roster?.settings?.losses ?? team.losses}{(roster?.settings?.ties > 0) ? '-' + roster.settings.ties : ''} Regular Season
                  {roster?.settings?.fpts ? ' (' + roster.settings.fpts + ' PF)' : ''}
                  {' \u00B7 '}{players.reduce((s,r) => s + r.dhq, 0).toLocaleString()} Total DHQ {'\u00B7'} {players.length} players
                </div>

                {/* Roster / History toggle */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    <button onClick={() => setLeagueViewMode('roster')} style={{
                        padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase',
                        background: leagueViewMode === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                        color: leagueViewMode === 'roster' ? 'var(--black)' : 'var(--silver)',
                        border: '1px solid ' + (leagueViewMode === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                        borderRadius: '4px', cursor: 'pointer'
                    }}>Roster</button>
                    <button onClick={() => setLeagueViewMode('history')} style={{
                        padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase',
                        background: leagueViewMode === 'history' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                        color: leagueViewMode === 'history' ? 'var(--black)' : 'var(--silver)',
                        border: '1px solid ' + (leagueViewMode === 'history' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                        borderRadius: '4px', cursor: 'pointer'
                    }}>History</button>
                </div>

                {leagueViewMode === 'history' && (() => {
                    const ownerHist = typeof buildOwnerHistory === 'function' ? buildOwnerHistory() : {};
                    const h = ownerHist[team.roster?.roster_id];
                    if (!h) return <div style={{ color: 'var(--silver)', padding: '16px' }}>History not available — DHQ engine loading</div>;

                    // Franchise narrative
                    const narrativeParts = [];
                    if (h.championships > 0) narrativeParts.push(h.championships + 'x champion (' + h.champSeasons.join(', ') + ').');
                    else narrativeParts.push('No championships yet.');
                    if (h.playoffWins > h.playoffLosses) narrativeParts.push('Strong playoff performer (' + h.playoffRecord + ').');
                    else if (h.playoffAppearances > 0) narrativeParts.push('Playoff presence but struggles to close (' + h.playoffRecord + ').');
                    else narrativeParts.push('Has not reached playoffs.');
                    if (h.draftHitRate >= 50) narrativeParts.push('Excellent drafter (' + h.draftHitRate + '% hit rate).');
                    else if (h.draftHitRate >= 30) narrativeParts.push('Average drafter (' + h.draftHitRate + '%).');
                    else if (h.draftTotal > 0) narrativeParts.push('Poor draft results (' + h.draftHitRate + '% hit rate).');
                    if (h.avgValueDiff > 100) narrativeParts.push('Wins trades consistently (+' + h.avgValueDiff + ' avg DHQ).');
                    else if (h.avgValueDiff < -100) narrativeParts.push('Loses value in trades (' + h.avgValueDiff + ' avg DHQ).');

                    // Best/worst assets
                    const rosterScored = (roster?.players || []).map(pid => ({ pid, dhq: window.App?.LI?.playerScores?.[pid] || 0 })).sort((a,b) => b.dhq - a.dhq);
                    const bestAsset = rosterScored[0];

                    // Rivalries
                    const rivalries = typeof detectRivalries === 'function' ? detectRivalries(team.roster?.roster_id) : [];

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Franchise narrative */}
                            <GMMessage>
                                {narrativeParts.join(' ')}
                                {bestAsset && bestAsset.dhq > 0 ? ` Crown jewel: ${playersData[bestAsset.pid]?.full_name || '?'} (${bestAsset.dhq.toLocaleString()} DHQ).` : ''}
                            </GMMessage>

                            {/* Header stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                {[
                                    { label: 'Championships', value: h.championships, sub: h.champSeasons.join(', ') || 'None', color: h.championships > 0 ? '#D4AF37' : 'var(--silver)' },
                                    { label: 'Playoff Record', value: h.playoffRecord, sub: h.playoffAppearances + ' appearances', color: h.playoffWins > h.playoffLosses ? '#2ECC71' : 'var(--silver)' },
                                    { label: 'Draft Hit Rate', value: h.draftHitRate + '%', sub: h.draftHits + '/' + h.draftTotal + ' starters', color: h.draftHitRate >= 50 ? '#2ECC71' : h.draftHitRate >= 30 ? '#F0A500' : '#E74C3C' },
                                    { label: 'Trade Record', value: h.tradesWon + '-' + h.tradesLost + '-' + h.tradesFair, sub: (h.avgValueDiff >= 0 ? '+' : '') + h.avgValueDiff + ' avg DHQ', color: h.avgValueDiff >= 0 ? '#2ECC71' : '#E74C3C' },
                                ].map((stat, i) => (
                                    <div key={i} style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{stat.label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: stat.color, fontFamily: 'Bebas Neue' }}>{stat.value}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', marginTop: '2px' }}>{stat.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Season by season */}
                            <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '12px 16px' }}>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Season History</div>
                                {h.seasonHistory.map(s => (
                                    <div key={s.season} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem' }}>
                                        <span style={{ fontFamily: 'Bebas Neue', fontSize: '0.95rem', color: 'var(--gold)', minWidth: '40px' }}>{s.season}</span>
                                        <span style={{
                                            fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                                            background: s.finish === 'Champion' ? 'rgba(212,175,55,0.15)' : s.finish === 'Runner-Up' ? 'rgba(192,192,192,0.15)' : s.finish === 'Semi-Finals' ? 'rgba(205,127,50,0.15)' : s.finish === 'Playoffs' ? 'rgba(46,204,113,0.1)' : 'rgba(255,255,255,0.04)',
                                            color: s.finish === 'Champion' ? '#D4AF37' : s.finish === 'Runner-Up' ? '#C0C0C0' : s.finish === 'Semi-Finals' ? '#CD7F32' : s.finish === 'Playoffs' ? '#2ECC71' : 'var(--silver)'
                                        }}>{s.finish}</span>
                                        {s.hadFirstPick && <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600 }}>#1 Overall Pick</span>}
                                    </div>
                                ))}
                            </div>

                            {/* #1 Overall Picks */}
                            {h.numberOnePicks.length > 0 && (
                                <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '12px 16px' }}>
                                    <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>#1 Overall Picks</div>
                                    {h.numberOnePicks.map((pk, i) => (
                                        <div key={i} style={{ fontSize: '0.75rem', color: 'var(--white)', padding: '4px 0' }}>
                                            <span style={{ color: 'var(--gold)', fontFamily: 'Bebas Neue', fontSize: '0.85rem' }}>{pk.season}</span> — {pk.player} <span style={{ color: 'var(--silver)', fontSize: '0.74rem' }}>({pk.pos})</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Best + Worst Picks */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {h.bestPick && (
                                    <div style={{ background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.15)', borderRadius: '8px', padding: '10px 14px' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#2ECC71', fontFamily: 'Oswald', textTransform: 'uppercase', marginBottom: '4px' }}>Best Draft Pick</div>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>{h.bestPick.name}</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{h.bestPick.season} Round {h.bestPick.round} ({h.bestPick.pos})</div>
                                    </div>
                                )}
                                {h.bustPicks.length > 0 && (
                                    <div style={{ background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.15)', borderRadius: '8px', padding: '10px 14px' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#E74C3C', fontFamily: 'Oswald', textTransform: 'uppercase', marginBottom: '4px' }}>Draft Busts (R1-R2)</div>
                                        {h.bustPicks.map((bp, i) => (
                                            <div key={i} style={{ fontSize: '0.72rem', color: 'var(--silver)', padding: '2px 0' }}>{bp.name} — {bp.season} R{bp.round}</div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Rivalries */}
                            {h.rivalries.length > 0 && (
                                <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', padding: '12px 16px' }}>
                                    <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Playoff Rivalries</div>
                                    {h.rivalries.map((r, i) => {
                                        const rivalUser = S.leagueUsers?.find(u => {
                                            const rivalRoster = S.rosters.find(ros => ros.roster_id === r.rosterId);
                                            return rivalRoster && u.user_id === rivalRoster.owner_id;
                                        });
                                        return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '0.75rem' }}>
                                                <span style={{ fontWeight: 600, color: 'var(--white)' }}>{rivalUser?.display_name || 'Team ' + r.rosterId}</span>
                                                <span style={{ color: r.wins > r.losses ? '#2ECC71' : r.wins < r.losses ? '#E74C3C' : 'var(--silver)', fontWeight: 700 }}>{r.wins}-{r.losses}</span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>({r.seasons.join(', ')})</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {leagueViewMode === 'roster' && (
                <div>
                {/* TODO: integrate shared ROSTER_COLUMNS + renderCell system */}
                <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '3px 28px 1fr 36px 32px 54px 42px 60px 52px', gap: '4px', padding: '6px 10px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                    <span></span><span></span><span>Player</span><span>Pos</span><span>Age</span><span>DHQ</span><span>PPG</span><span>Acquired</span><span>Date</span>
                  </div>
                  <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                    {players.map(r => (
                      <div key={r.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(r.pid); }}
                        style={{ display: 'grid', gridTemplateColumns: '3px 28px 1fr 36px 32px 54px 42px 60px 52px', gap: '4px', padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.72rem', alignItems: 'center', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ background: r.isStarter ? 'var(--gold)' : 'transparent', width: '3px', height: '100%' }}></div>
                        <div style={{ width: '22px', height: '22px', flexShrink: 0 }}><img src={`https://sleepercdn.com/content/nfl/players/thumb/${r.pid}.jpg`} alt="" onError={e=>e.target.style.display='none'} style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} /></div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p.full_name || (r.p.first_name + ' ' + r.p.last_name).trim()}</div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.65 }}>{r.p.team || 'FA'}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: r.posCol }}>{r.pos}</span>
                        <span style={{ color: 'var(--silver)' }}>{r.p.age || '\u2014'}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'Oswald', color: r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)' }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span>
                        <span style={{ color: 'var(--silver)' }}>{r.ppg || '\u2014'}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: r.acq.method === 'Drafted' ? '#a78bfa' : r.acq.method === 'Traded' ? '#F0A500' : r.acq.method === 'Waiver' ? '#2ECC71' : r.acq.method === 'FA' ? '#1ABC9C' : 'var(--silver)' }}>{r.acq.method}{r.acq.cost ? ' ' + r.acq.cost : ''}</span>
                        <span style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.65 }}>{r.acq.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
                )}
              </div>
            );
          }
        }

        function filteredAndSortedRows(rows) {
          const offPos = new Set(['QB','RB','WR','TE','K']);
          const idpPos = new Set(['DL','LB','DB']);
          let filtered = rows;
          if (rosterFilter === 'Starters') filtered = rows.filter(r => r.isStarter);
          else if (rosterFilter === 'Bench') filtered = rows.filter(r => !r.isStarter && !r.isIR && !r.isTaxi);
          else if (rosterFilter === 'Taxi') filtered = rows.filter(r => r.isTaxi);
          else if (rosterFilter === 'IR') filtered = rows.filter(r => r.isIR);
          else if (rosterFilter === 'Offense') filtered = rows.filter(r => offPos.has(r.pos));
          else if (rosterFilter === 'IDP') filtered = rows.filter(r => idpPos.has(r.pos));

          const posOrder = {QB:0,RB:1,WR:2,TE:3,K:4,DL:5,LB:6,DB:7};
          return [...filtered].sort((a, b) => {
            const {key, dir} = rosterSort;
            if (key === 'dhq') return (b.dhq - a.dhq) * dir;
            if (key === 'age') return ((a.age||99) - (b.age||99)) * dir;
            if (key === 'ppg') return ((b.curPPG||0) - (a.curPPG||0)) * dir;
            if (key === 'prev') return ((b.prevPPG||0) - (a.prevPPG||0)) * dir;
            if (key === 'trend') return ((b.trend||0) - (a.trend||0)) * dir;
            if (key === 'gp') return ((b.curGP||0) - (a.curGP||0)) * dir;
            if (key === 'durability') return ((b.curGP||0) - (a.curGP||0)) * dir;
            if (key === 'name') { const na = getPlayerName(a.pid).toLowerCase(), nb = getPlayerName(b.pid).toLowerCase(); return (na < nb ? -1 : na > nb ? 1 : 0) * dir; }
            if (key === 'pos') return ((posOrder[a.pos]||99) - (posOrder[b.pos]||99)) * dir;
            if (key === 'peak') return ((b.peakYrsLeft||0) - (a.peakYrsLeft||0)) * dir;
            if (key === 'action') { const ord = {BUY:3,HOLD:2,SELL:1}; return ((ord[b.rec]||0) - (ord[a.rec]||0)) * dir; }
            if (key === 'yrsExp') return ((b.p.years_exp||0) - (a.p.years_exp||0)) * dir;
            if (key === 'college') { const ca = (a.p.college||'').toLowerCase(), cb = (b.p.college||'').toLowerCase(); return (ca < cb ? -1 : ca > cb ? 1 : 0) * dir; }
            if (key === 'nflDraft') return (((a.p.draft_round || (a.p.draft_pick ? Math.ceil(a.p.draft_pick/32) : 99)) - (b.p.draft_round || (b.p.draft_pick ? Math.ceil(b.p.draft_pick/32) : 99))) * dir);
            if (key === 'posRankLg') return (a.dhq - b.dhq) * dir; // proxy: higher dhq = better rank
            if (key === 'posRankNfl') return ((a.meta?.fcRank||999) - (b.meta?.fcRank||999)) * dir;
            if (key === 'starterSzn') return ((b.meta?.starterSeasons||0) - (a.meta?.starterSeasons||0)) * dir;
            if (key === 'height') return ((b.p.height||0) - (a.p.height||0)) * dir;
            if (key === 'weight') return ((b.p.weight||0) - (a.p.weight||0)) * dir;
            if (key === 'depthChart') return ((a.p.depth_chart_order||99) - (b.p.depth_chart_order||99)) * dir;
            if (key === 'slot') { const ord = {starter:0,taxi:1,bench:2,ir:3}; return ((ord[a.section]||9) - (ord[b.section]||9)) * dir; }
            if (key === 'acquired') { const aa = getAcquisitionInfo(a.pid, myRoster?.roster_id), ab = getAcquisitionInfo(b.pid, myRoster?.roster_id); return (aa.method < ab.method ? -1 : aa.method > ab.method ? 1 : 0) * dir; }
            if (key === 'acquiredDate') { const aa = getAcquisitionInfo(a.pid, myRoster?.roster_id), ab = getAcquisitionInfo(b.pid, myRoster?.roster_id); return (aa.date < ab.date ? -1 : aa.date > ab.date ? 1 : 0) * dir; }
            return 0;
          });
        }

        function renderMyTeamTab() {
          if (!myRoster) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--silver)' }}>No roster found</div>;

          const ROSTER_COLUMNS = {
            pos:        { label: 'Position', shortLabel: 'Pos', width: '40px', group: 'core' },
            age:        { label: 'Age', shortLabel: 'Age', width: '38px', group: 'dynasty' },
            dhq:        { label: 'DHQ Dynasty Value', shortLabel: 'DHQ', width: '64px', group: 'dynasty' },
            ppg:        { label: 'Points Per Game', shortLabel: 'PPG', width: '48px', group: 'stats' },
            prev:       { label: 'Previous Season PPG', shortLabel: 'Prev', width: '48px', group: 'stats' },
            trend:      { label: 'Year-over-Year Trend %', shortLabel: 'Trend', width: '50px', group: 'dynasty' },
            peak:       { label: 'Peak Window Phase', shortLabel: 'Peak', width: '50px', group: 'dynasty' },
            action:     { label: 'Trade Recommendation', shortLabel: 'Action', width: '56px', group: 'dynasty' },
            gp:         { label: 'Games Played', shortLabel: 'GP', width: '36px', group: 'stats' },
            durability: { label: 'Durability — games played out of 17 (green=15+, amber=10-14, red=<10)', shortLabel: 'Dur', width: '40px', group: 'stats' },
            yrsExp:     { label: 'Years of Experience', shortLabel: 'Exp', width: '38px', group: 'dynasty' },
            college:    { label: 'College', shortLabel: 'College', width: '90px', group: 'scout' },
            nflDraft:   { label: 'NFL Draft Round', shortLabel: 'Draft', width: '48px', group: 'scout' },
            posRankLg:  { label: 'League Position Rank', shortLabel: 'Lg Rank', width: '54px', group: 'dynasty' },
            posRankNfl: { label: 'NFL Position Rank', shortLabel: 'NFL Rank', width: '56px', group: 'dynasty' },
            starterSzn: { label: 'Starter Seasons', shortLabel: 'Str Szn', width: '48px', group: 'dynasty' },
            height:     { label: 'Height', shortLabel: 'Ht', width: '42px', group: 'scout' },
            weight:     { label: 'Weight (lbs)', shortLabel: 'Wt', width: '42px', group: 'scout' },
            depthChart: { label: 'Depth Chart Position', shortLabel: 'Depth', width: '48px', group: 'scout' },
            slot:       { label: 'Roster Slot', shortLabel: 'Slot', width: '40px', group: 'core' },
            acquired:   { label: 'Acquisition Method', shortLabel: 'Acquired', width: '66px', group: 'core' },
            acquiredDate: { label: 'Date Acquired', shortLabel: 'Date', width: '58px', group: 'core' },
          };

          const COLUMN_PRESETS = {
            dynasty: ['pos','age','dhq','peak','trend','action','acquired'],
            stats:   ['pos','age','dhq','ppg','prev','trend','gp','durability'],
            scout:   ['pos','age','college','slot','height','weight','depthChart','yrsExp'],
            full:    Object.keys(ROSTER_COLUMNS),
          };

          const allPlayers = myRoster.players || [];
          const starters = new Set(myRoster.starters || []);
          const reserve = new Set(myRoster.reserve || []);
          const taxi = new Set(myRoster.taxi || []);

          const normPos = (pos) => {
            if (!pos) return null;
            const p = pos.toUpperCase();
            if (['DE','DT','NT'].includes(p)) return 'DL';
            if (['ILB','OLB','MLB'].includes(p)) return 'LB';
            if (['CB','SS','FS','S'].includes(p)) return 'DB';
            return p;
          };

          // Build enriched player rows
          const rows = allPlayers.map(pid => {
            const p = playersData[pid];
            if (!p) return null;
            const pos = normPos(p.position) || p.position || '?';
            const dhq = window.App?.LI?.playerScores?.[pid] || 0;
            const meta = window.App?.LI?.playerMeta?.[pid];
            const st = statsData[pid] || {};
            const prev = stats2025Data?.[pid] || {};

            const curPts = calcRawPts(st) || 0;
            const curGP = st.gp || 0;
            const curPPG = curGP > 0 ? +(curPts / curGP).toFixed(1) : 0;

            const prevPts = calcRawPts(prev) || 0;
            const prevGP = prev.gp || 0;
            const prevPPG = prevGP > 0 ? +(prevPts / prevGP).toFixed(1) : 0;

            // Effective PPG: use current season if available, else fallback to previous season
            const effectivePPG = curPPG > 0 ? curPPG : prevPPG;
            const effectiveGP = curGP > 0 ? curGP : prevGP;

            const trend = meta?.trend || (prevPPG && curPPG ? Math.round((curPPG - prevPPG) / prevPPG * 100) : 0);

            const age = p.age || (p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000) : null);
            const isStarter = starters.has(pid);
            const isIR = reserve.has(pid);
            const isTaxi = taxi.has(pid);
            const section = isStarter ? 'starter' : isIR ? 'ir' : isTaxi ? 'taxi' : 'bench';

            const peaks = {QB:[27,33],RB:[22,26],WR:[24,29],TE:[25,30],DL:[24,29],LB:[23,28],DB:[24,29]};
            const [pLo, pHi] = peaks[pos] || [24,29];
            const peakRangeHi = Math.max(pHi + 4, age ? age + 1 : pHi + 4);
            const peakPct = age ? Math.max(0, Math.min(100, ((age - (pLo-4)) / (peakRangeHi - (pLo-4))) * 100)) : 50;
            const peakPhase = !age ? '\u2014' : age < pLo ? 'PRE' : age <= pHi ? 'PRIME' : 'POST';
            const peakYrsLeft = age ? Math.max(0, pHi - age) : 0;

            const rec = peakYrsLeft <= 0 && trend <= -10 ? 'SELL NOW' : peakYrsLeft <= 0 ? 'SELL' : peakYrsLeft <= 2 && trend >= 15 ? 'SELL HIGH' : peakYrsLeft <= 2 ? 'SELL' : dhq >= 7000 && peakYrsLeft >= 3 ? 'HOLD CORE' : peakYrsLeft >= 4 && dhq < 4000 ? 'BUY LOW' : dhq >= 5000 ? 'HOLD' : 'BUY';

            return { pid, p, pos, dhq, age, curPPG, prevPPG, effectivePPG, effectiveGP, prevGP, trend, isStarter, isIR, isTaxi, section, peakPhase, peakPct, peakYrsLeft, rec, curGP, meta, injury: p.injury_status };
          }).filter(Boolean);

          // Position-level PPG percentiles for color coding
          const posPPGs = {};
          rows.forEach(r => {
            if (!posPPGs[r.pos]) posPPGs[r.pos] = [];
            if (r.curPPG > 0) posPPGs[r.pos].push(r.curPPG);
          });
          const posP75 = {}, posP25 = {};
          Object.entries(posPPGs).forEach(([pos, vals]) => {
            vals.sort((a,b) => a-b);
            posP75[pos] = vals[Math.floor(vals.length * 0.75)] || 10;
            posP25[pos] = vals[Math.floor(vals.length * 0.25)] || 5;
          });

          // Cell background helpers (FM-style colored cells)
          const dhqBg = v => v >= 7000 ? 'rgba(46,204,113,0.15)' : v >= 4000 ? 'rgba(52,152,219,0.12)' : v >= 2000 ? 'rgba(255,255,255,0.04)' : 'transparent';
          const dhqCol = v => v >= 7000 ? '#2ECC71' : v >= 4000 ? '#3498DB' : v >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.25)';
          const ageBg = a => !a ? 'transparent' : a <= 24 ? 'rgba(46,204,113,0.12)' : a <= 28 ? 'transparent' : a <= 31 ? 'rgba(240,165,0,0.1)' : 'rgba(231,76,60,0.1)';
          const ageCol = a => !a ? 'var(--silver)' : a <= 24 ? '#2ECC71' : a <= 28 ? 'var(--white)' : a <= 31 ? '#F0A500' : '#E74C3C';
          const ppgBg = (v, pos) => v >= (posP75[pos]||10) ? 'rgba(46,204,113,0.12)' : v <= (posP25[pos]||3) ? 'rgba(231,76,60,0.08)' : 'transparent';
          const trendBg = t => t >= 15 ? 'rgba(46,204,113,0.12)' : t <= -15 ? 'rgba(231,76,60,0.1)' : 'transparent';
          const statusCol = s => s === 'starter' ? 'var(--gold)' : s === 'ir' ? '#E74C3C' : s === 'taxi' ? '#3498DB' : 'transparent';
          const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};

          const filtered = filteredAndSortedRows(rows);

          // renderCell — renders each data cell with FM-style coloring
          function renderCell(colKey, r) {
            const col = ROSTER_COLUMNS[colKey];
            const base = { width: col.width, minWidth: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.84rem', padding: '0 5px' };

            switch(colKey) {
              case 'pos': return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: (posColors[r.pos]||'#666')+'22', color: posColors[r.pos]||'var(--silver)' }}>{r.pos}</span></div>;
              case 'age': return <div key={colKey} style={{...base, background: ageBg(r.age)}}><span style={{ color: ageCol(r.age), fontWeight: 600 }}>{r.age||'\u2014'}</span></div>;
              case 'dhq': return <div key={colKey} style={{...base, background: dhqBg(r.dhq)}}><span style={{ color: dhqCol(r.dhq), fontWeight: 700, fontFamily: 'Oswald', fontSize: '0.82rem' }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span></div>;
              case 'ppg': return <div key={colKey} style={{...base, background: ppgBg(r.effectivePPG, r.pos)}}><span style={{ color: r.effectivePPG >= (posP75[r.pos]||10) ? '#2ECC71' : 'var(--silver)' }}>{r.effectivePPG > 0 ? r.effectivePPG : '\u2014'}{r.curPPG === 0 && r.prevPPG > 0 ? '*' : ''}</span></div>;
              case 'prev': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', opacity: 0.6 }}>{r.prevPPG > 0 ? r.prevPPG : '\u2014'}</span></div>;
              case 'trend': return <div key={colKey} style={{...base, background: trendBg(r.trend)}}><span style={{ color: r.trend>=15?'#2ECC71':r.trend<=-15?'#E74C3C':'var(--silver)', fontWeight: 600, fontSize: '0.74rem' }}>{r.trend>0?'+'+r.trend+'%':r.trend<0?r.trend+'%':'\u2014'}</span></div>;
              case 'peak': return <div key={colKey} style={{...base, flexDirection: 'column', gap: '1px'}}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: r.peakPhase==='PRIME'?'#2ECC71':r.peakPhase==='PRE'?'#3498DB':'#E74C3C' }}>{r.peakPhase}</span>
                <div style={{ width: '30px', height: '3px', borderRadius: '1px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ position:'absolute',left:0,top:0,height:'100%',width:'30%',background:'rgba(52,152,219,0.4)' }}></div>
                  <div style={{ position:'absolute',left:'30%',top:0,height:'100%',width:'40%',background:'rgba(46,204,113,0.4)' }}></div>
                  <div style={{ position:'absolute',left:'70%',top:0,height:'100%',width:'30%',background:'rgba(231,76,60,0.3)' }}></div>
                  <div style={{ position:'absolute',left:r.peakPct+'%',top:'-1px',width:'2px',height:'5px',background:'var(--white)',borderRadius:'1px' }}></div>
                </div>
              </div>;
              case 'action': {
                const ann = getPlayerAnnotation(r.pid);
                return <div key={colKey} style={{...base, flexDirection:'column', gap:'2px', alignItems:'center'}} title={ann?.text || ''}>
                  <span style={{ fontSize:'0.74rem',fontWeight:700,padding:'3px 8px',borderRadius:'4px',background:r.rec==='BUY'?'rgba(46,204,113,0.18)':r.rec==='HOLD'?'rgba(212,175,55,0.15)':'rgba(231,76,60,0.15)',color:r.rec==='BUY'?'#2ECC71':r.rec==='HOLD'?'var(--gold)':'#E74C3C',border:'1px solid '+(r.rec==='BUY'?'rgba(46,204,113,0.3)':r.rec==='HOLD'?'rgba(212,175,55,0.3)':'rgba(231,76,60,0.3)') }}>{r.rec}</span>
                </div>;
              }
              case 'gp': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.74rem' }}>{r.effectiveGP > 0 ? r.effectiveGP : '\u2014'}{r.curGP === 0 && r.prevGP > 0 ? '*' : ''}</span></div>;
              case 'durability': { const gpForDur = r.effectiveGP || 0; return <div key={colKey} style={{...base}}><div style={{ width:'24px',height:'4px',borderRadius:'2px',background:'rgba(255,255,255,0.06)',overflow:'hidden' }}><div style={{ width:Math.min(100,(gpForDur/17)*100)+'%',height:'100%',background:gpForDur>=15?'#2ECC71':gpForDur>=10?'#F0A500':'#E74C3C',borderRadius:'2px' }}></div></div></div>; }
              case 'yrsExp': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)' }}>{r.p.years_exp ?? '\u2014'}</span></div>;
              case 'college': return <div key={colKey} style={{...base, justifyContent: 'flex-start'}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.p.college || '\u2014'}</span></div>;
              case 'nflDraft': { const dr = r.p.draft_round; const dp = r.p.draft_pick; const dy = r.p.draft_year; const dRound = dr || (dp ? Math.ceil(dp / 32) : null); const draftLabel = dRound ? (dy ? "'" + String(dy).slice(2) + ' ' : '') + 'Rd ' + dRound + (dp ? '.' + ((dp - 1) % 32 + 1) : '') : (r.p.undrafted === true || (r.p.years_exp > 0 && !dp && !dr) ? 'UDFA' : '\u2014'); return <div key={colKey} style={{...base}}><span style={{ color: dRound ? 'var(--silver)' : 'rgba(255,255,255,0.3)', fontSize: '0.74rem' }}>{draftLabel}</span></div>; }
              case 'posRankLg': {
                const allAtPos = (currentLeague.rosters||[]).flatMap(ros => (ros.players||[]).filter(pid => {
                  const pp = playersData[pid];
                  return pp && (normPos(pp.position) === r.pos);
                })).map(pid => ({pid, dhq: window.App?.LI?.playerScores?.[pid] || 0})).sort((a,b) => b.dhq - a.dhq);
                const rank = allAtPos.findIndex(x => x.pid === r.pid) + 1;
                return <div key={colKey} style={{...base}}><span style={{ color: rank<=3?'#2ECC71':rank<=8?'var(--gold)':'var(--silver)', fontWeight: rank<=3?700:400 }}>{rank > 0 ? '#'+rank : '\u2014'}</span></div>;
              }
              case 'posRankNfl': {
                const meta = r.meta;
                return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)' }}>{meta?.fcRank ? '#'+meta.fcRank : '\u2014'}</span></div>;
              }
              case 'starterSzn': return <div key={colKey} style={{...base}}><span style={{ color: (r.meta?.starterSeasons||0)>=3?'#2ECC71':(r.meta?.starterSeasons||0)>=1?'var(--gold)':'var(--silver)', fontWeight: 600 }}>{r.meta?.starterSeasons ?? '\u2014'}</span></div>;
              case 'height': {
                const h = r.p.height;
                return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem' }}>{h ? Math.floor(h/12)+"'"+h%12+'"' : '\u2014'}</span></div>;
              }
              case 'weight': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem' }}>{r.p.weight || '\u2014'}</span></div>;
              case 'depthChart': return <div key={colKey} style={{...base}}><span style={{ color: r.p.depth_chart_order ? 'var(--silver)' : 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{r.p.depth_chart_order ? '#'+r.p.depth_chart_order : (r.section === 'ir' ? 'IR' : (!r.p.team || r.p.team === 'FA') ? 'FA' : 'N/A')}</span></div>;
              case 'slot': return <div key={colKey} style={{...base}}><span style={{ fontSize:'0.76rem',color:'var(--silver)',opacity:0.65,textTransform:'uppercase' }}>{r.section==='starter'?'STR':r.section==='ir'?'IR':r.section==='taxi'?'TAX':'BN'}</span></div>;
              case 'acquired': {
                const acq = getAcquisitionInfo(r.pid, myRoster?.roster_id);
                const col = acq.method === 'Drafted' ? '#a78bfa' : acq.method === 'Traded' ? '#F0A500' : acq.method === 'Waiver' ? '#2ECC71' : acq.method === 'FA' ? '#1ABC9C' : 'var(--silver)';
                return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', fontWeight: 600, color: col }}>{acq.method}{acq.cost ? ' ' + acq.cost : ''}</span></div>;
              }
              case 'acquiredDate': {
                const acq = getAcquisitionInfo(r.pid, myRoster?.roster_id);
                return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.6 }}>{acq.date}</span></div>;
              }
              default: return <div key={colKey} style={{...base}}>{'\u2014'}</div>;
            }
          }

          return (
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '12px' }}>
                <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.6rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>MY TEAM</span>
                {(() => {
                  const champs = window.App?.LI?.championships || {};
                  const myChampCount = Object.values(champs).filter(c => c.champion === myRoster?.roster_id).length;
                  if (myChampCount > 0) return <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>{myChampCount > 1 ? myChampCount + 'x ' : ''}Champion</span>;
                  return null;
                })()}
                <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{allPlayers.length} players</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>Total DHQ: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{rows.reduce((s,r) => s+r.dhq, 0).toLocaleString()}</span></span>
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button onClick={() => setMyTeamView('roster')} style={{
                  padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase',
                  background: myTeamView === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                  color: myTeamView === 'roster' ? 'var(--black)' : 'var(--silver)',
                  border: '1px solid ' + (myTeamView === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                  borderRadius: '6px', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em'
                }}>Roster</button>
                <button onClick={() => setMyTeamView('compare')} style={{
                  padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Oswald', textTransform: 'uppercase',
                  background: myTeamView === 'compare' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                  color: myTeamView === 'compare' ? 'var(--black)' : 'var(--silver)',
                  border: '1px solid ' + (myTeamView === 'compare' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                  borderRadius: '6px', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em'
                }}>Compare</button>
              </div>

              {myTeamView === 'compare' && (
                <div>
                  <select value={compareTeamId || ''} onChange={e => setCompareTeamId(parseInt(e.target.value) || null)} style={{
                    padding: '6px 12px', fontSize: '0.72rem', fontFamily: 'Oswald',
                    background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.3)',
                    borderRadius: '6px', color: 'var(--white)', marginBottom: '16px', width: '100%', maxWidth: '300px'
                  }}>
                    <option value="">Select team to compare...</option>
                    {standings.filter(t => t.userId !== sleeperUserId).map(t => (
                      <option key={t.rosterId} value={t.rosterId}>{t.displayName} ({t.wins}-{t.losses})</option>
                    ))}
                  </select>
                  {compareTeamId && (() => {
                    const theirRoster = currentLeague.rosters.find(r => r.roster_id === compareTeamId);
                    if (!theirRoster) return null;
                    const theirUser = currentLeague.users?.find(u => u.user_id === theirRoster.owner_id);
                    const myPlayers = (myRoster.players || []);
                    const theirPlayers = (theirRoster.players || []);
                    const myTotal = myPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                    const theirTotal = theirPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                    // Head-to-head from matchups (current season)
                    const myWins = myRoster.settings?.wins || 0;
                    const myLosses = myRoster.settings?.losses || 0;
                    const theirWins = theirRoster.settings?.wins || 0;
                    const theirLosses = theirRoster.settings?.losses || 0;

                    // Championships
                    const champs = window.App?.LI?.championships || {};
                    const myChamps = Object.values(champs).filter(c => c.champion === myRoster.roster_id).length;
                    const theirChamps = Object.values(champs).filter(c => c.champion === compareTeamId).length;

                    // Playoff records
                    const brackets = window.App?.LI?.bracketData || {};
                    let myPW = 0, myPL = 0, theirPW = 0, theirPL = 0;
                    Object.values(brackets).forEach(({ winners }) => {
                        (winners || []).forEach(m => {
                            if (m.w === myRoster.roster_id) myPW++;
                            if (m.l === myRoster.roster_id) myPL++;
                            if (m.w === compareTeamId) theirPW++;
                            if (m.l === compareTeamId) theirPL++;
                        });
                    });

                    // Head-to-head in playoffs
                    let h2hWins = 0, h2hLosses = 0;
                    Object.values(brackets).forEach(({ winners }) => {
                        (winners || []).forEach(m => {
                            if ((m.t1 === myRoster.roster_id && m.t2 === compareTeamId) || (m.t2 === myRoster.roster_id && m.t1 === compareTeamId)) {
                                if (m.w === myRoster.roster_id) h2hWins++;
                                else if (m.w === compareTeamId) h2hLosses++;
                            }
                        });
                    });

                    return (
                      <div>
                        {/* Matchup header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', marginBottom: '16px', alignItems: 'start' }}>
                          {/* You */}
                          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '6px' }}>You</div>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', marginBottom: '4px' }}>{myWins}-{myLosses}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.6 }}>
                              {myTotal.toLocaleString()} DHQ<br/>
                              Playoffs: {myPW}-{myPL}<br/>
                              {myChamps > 0 ? myChamps + 'x Champion' : 'No titles'}
                            </div>
                          </div>
                          {/* VS + H2H */}
                          <div style={{ textAlign: 'center', paddingTop: '10px' }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '6px' }}>VS</div>
                            {(h2hWins > 0 || h2hLosses > 0) ? (
                              <div style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>
                                <div style={{ fontWeight: 700, color: h2hWins > h2hLosses ? '#2ECC71' : h2hWins < h2hLosses ? '#E74C3C' : 'var(--silver)' }}>H2H: {h2hWins}-{h2hLosses}</div>
                                <div style={{ opacity: 0.65, marginTop: '2px' }}>in playoffs</div>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>No playoff H2H</div>
                            )}
                          </div>
                          {/* Them */}
                          <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: 'var(--silver)', textTransform: 'uppercase', marginBottom: '6px' }}>{theirUser?.display_name || 'Opponent'}</div>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', marginBottom: '4px' }}>{theirWins}-{theirLosses}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.6 }}>
                              {theirTotal.toLocaleString()} DHQ<br/>
                              Playoffs: {theirPW}-{theirPL}<br/>
                              {theirChamps > 0 ? theirChamps + 'x Champion' : 'No titles'}
                            </div>
                          </div>
                        </div>
                        {/* Full roster comparison by position */}
                        <div style={{ marginTop: '16px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Full Roster by Position</div>
                            {['QB','RB','WR','TE','K','DL','LB','DB'].map(pos => {
                                const myAtPos = myPlayers.filter(pid => normPos(playersData[pid]?.position) === pos)
                                    .map(pid => ({ pid, p: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                                    .sort((a,b) => b.dhq - a.dhq);
                                const theirAtPos = theirPlayers.filter(pid => normPos(playersData[pid]?.position) === pos)
                                    .map(pid => ({ pid, p: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                                    .sort((a,b) => b.dhq - a.dhq);
                                if (!myAtPos.length && !theirAtPos.length) return null;
                                const maxLen = Math.max(myAtPos.length, theirAtPos.length);

                                const myPosDHQ = myAtPos.reduce((s, x) => s + x.dhq, 0);
                                const theirPosDHQ = theirAtPos.reduce((s, x) => s + x.dhq, 0);
                                const posDiff = myPosDHQ - theirPosDHQ;
                                return (
                                    <div key={pos} style={{ marginBottom: '12px', background: 'var(--black)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                                        <div style={{ padding: '6px 10px', background: (posColors[pos] || '#666') + '15', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontFamily: 'Oswald', fontSize: '0.72rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem' }}>
                                                <span style={{ color: myPosDHQ >= theirPosDHQ ? '#2ECC71' : 'var(--silver)' }}>You: {myPosDHQ.toLocaleString()}</span>
                                                <span style={{ color: theirPosDHQ >= myPosDHQ ? '#2ECC71' : 'var(--silver)' }}>Them: {theirPosDHQ.toLocaleString()}</span>
                                                <span style={{ fontWeight: 700, color: posDiff > 0 ? '#2ECC71' : posDiff < 0 ? '#E74C3C' : 'var(--silver)' }}>{posDiff > 0 ? '+' : ''}{posDiff.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        {Array.from({ length: maxLen }).map((_, i) => {
                                            const my = myAtPos[i];
                                            const their = theirAtPos[i];
                                            return (
                                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    {/* My player */}
                                                    <div style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', borderRight: '1px solid rgba(255,255,255,0.04)', background: my && their && my.dhq > their.dhq ? 'rgba(46,204,113,0.04)' : 'transparent', cursor: my ? 'pointer' : 'default' }}
                                                        onClick={() => { if (my && window._wrSelectPlayer) window._wrSelectPlayer(my.pid); }}>
                                                        {my ? (<>
                                                            <div style={{ width: '18px', height: '18px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+my.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'18px',height:'18px',borderRadius:'50%',objectFit:'cover' }} /></div>
                                                            <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'var(--white)', cursor: 'pointer' }}>{my.p?.full_name || '?'}</span>
                                                            <span style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.76rem', color: my.dhq >= 7000 ? '#2ECC71' : my.dhq >= 4000 ? '#3498DB' : 'var(--silver)' }}>{my.dhq > 0 ? my.dhq.toLocaleString() : '\u2014'}</span>
                                                        </>) : <span style={{ color: 'var(--silver)', opacity: 0.3, fontSize: '0.72rem' }}>{'\u2014'}</span>}
                                                    </div>
                                                    {/* Their player */}
                                                    <div style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', background: their && my && their.dhq > my.dhq ? 'rgba(46,204,113,0.04)' : 'transparent', cursor: their ? 'pointer' : 'default' }}
                                                        onClick={() => { if (their && window._wrSelectPlayer) window._wrSelectPlayer(their.pid); }}>
                                                        {their ? (<>
                                                            <div style={{ width: '18px', height: '18px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+their.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'18px',height:'18px',borderRadius:'50%',objectFit:'cover' }} /></div>
                                                            <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'var(--white)', cursor: 'pointer' }}>{their.p?.full_name || '?'}</span>
                                                            <span style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: '0.76rem', color: their.dhq >= 7000 ? '#2ECC71' : their.dhq >= 4000 ? '#3498DB' : 'var(--silver)' }}>{their.dhq > 0 ? their.dhq.toLocaleString() : '\u2014'}</span>
                                                        </>) : <span style={{ color: 'var(--silver)', opacity: 0.3, fontSize: '0.72rem' }}>{'\u2014'}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── ROSTER STRATEGY SUMMARY (Command-aware) ── */}
              {isCommand && (() => {
                const assess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
                const tier = (assess?.tier || '').toUpperCase();
                const needs = assess?.needs?.slice(0, 3) || [];
                const strengths = assess?.strengths || [];
                const totalDhq = rows.reduce((s, r) => s + r.dhq, 0);
                const elites = rows.filter(r => r.dhq >= 7000).length;

                // Categorize players
                const sellNow = rows.filter(r => r.peakYrsLeft <= 0 && r.dhq >= 2000 && r.trend <= -10).sort((a,b) => b.dhq - a.dhq).slice(0, 3);
                const sellHigh = rows.filter(r => r.peakYrsLeft <= 2 && r.dhq >= 3000 && r.trend >= 0 && !sellNow.find(s => s.pid === r.pid)).sort((a,b) => b.dhq - a.dhq).slice(0, 3);
                const core = rows.filter(r => r.dhq >= 5000 && r.peakYrsLeft >= 3).sort((a,b) => b.dhq - a.dhq).slice(0, 5);
                const holdMonitor = rows.filter(r => r.dhq >= 1500 && !sellNow.find(s => s.pid === r.pid) && !sellHigh.find(s => s.pid === r.pid) && !core.find(s => s.pid === r.pid)).sort((a,b) => b.dhq - a.dhq).slice(0, 5);

                // Strategy diagnosis
                const stratParts = [];
                stratParts.push(tier === 'ELITE' ? 'Championship-caliber roster.' : tier === 'CONTENDER' ? 'Legitimate contender.' : tier === 'CROSSROADS' ? 'At a crossroads \u2014 decide: push or rebuild.' : 'Rebuilding phase.');
                if (needs.length) stratParts.push('Weakest at ' + needs.map(n => n.pos).join(', ') + '.');
                if (elites < 2) stratParts.push('Need more elite assets (7000+ DHQ).');
                if (sellNow.length) stratParts.push('Move ' + sellNow.map(s => s.p.last_name || s.p.full_name?.split(' ').pop()).join(', ') + ' before further decline.');

                // Top 3 moves
                const moves = [];
                if (sellNow.length) moves.push({ type: 'SELL', label: 'Sell ' + (sellNow[0].p.full_name || 'veteran'), detail: sellNow[0].dhq.toLocaleString() + ' DHQ, ' + sellNow[0].peakYrsLeft + 'yr past peak, trend ' + sellNow[0].trend + '%', col: '#E74C3C' });
                if (needs.length) {
                  const bestBuy = needs[0];
                  moves.push({ type: 'BUY', label: 'Acquire ' + bestBuy.pos + ' starter', detail: bestBuy.urgency + ' \u2014 biggest positional gap', col: '#2ECC71' });
                }
                if (sellHigh.length) moves.push({ type: 'UPGRADE', label: 'Sell high on ' + (sellHigh[0].p.full_name || 'asset'), detail: sellHigh[0].dhq.toLocaleString() + ' DHQ, ' + sellHigh[0].peakYrsLeft + 'yr window left', col: '#F0A500' });

                const renderGroup = (title, color, players) => {
                  if (!players.length) return null;
                  return <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Oswald', marginBottom: '4px' }}>{title}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {players.map(r => <span key={r.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(r.pid); }} style={{ fontSize: '0.76rem', padding: '3px 10px', background: color + '15', border: '1px solid ' + color + '30', borderRadius: '6px', color: 'var(--silver)', cursor: 'pointer' }}>{r.p.full_name || r.pid} <span style={{ color: color, fontWeight: 700 }}>{r.dhq.toLocaleString()}</span></span>)}
                    </div>
                  </div>;
                };

                return <div style={{ marginBottom: '16px' }} className="wr-fade-in">
                  {/* Strategy diagnosis */}
                  <div style={{ marginBottom: '14px' }}>
                    <GMMessage>{stratParts.join(' ')}</GMMessage>
                    {/* Top 3 Moves */}
                    {moves.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {moves.map((m, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: m.col + '08', border: '1px solid ' + m.col + '25', borderRadius: '6px' }}>
                        <span style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: m.col, minWidth: '60px' }}>{m.type}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600 }}>{m.label}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6 }}>{m.detail}</div>
                        </div>
                      </div>)}
                    </div>}
                  </div>
                  {/* Player groups */}
                  <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
                    {renderGroup('Sell Now', '#E74C3C', sellNow)}
                    {renderGroup('Sell High', '#F0A500', sellHigh)}
                    {renderGroup('Core Assets', '#2ECC71', core)}
                    {renderGroup('Hold / Monitor', 'var(--silver)', holdMonitor)}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <button onClick={() => setActiveTab('trades')} style={{ padding: '8px 18px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.9rem', cursor: 'pointer' }}>FIND TRADES</button>
                    <button onClick={() => setActiveTab('fa')} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.9rem', cursor: 'pointer' }}>FREE AGENTS</button>
                  </div>
                </div>;
              })()}

              {/* ── GM STRATEGY PANEL ── */}
              <div style={{ marginBottom: '14px' }}>
                <button onClick={() => setGmStrategyOpen(!gmStrategyOpen)} style={{
                  width: '100%', padding: '10px 14px', background: gmStrategyOpen ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (gmStrategyOpen ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'),
                  borderRadius: gmStrategyOpen ? '10px 10px 0 0' : '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s'
                }}>
                  <AlexAvatar size={28} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '0.9rem', color: 'var(--gold)', letterSpacing: '0.04em' }}>GM STRATEGY</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6 }}>
                      {gmStrategy.mode === 'contend' ? 'Win Now' : gmStrategy.mode === 'rebuild' ? 'Rebuilding' : 'Balanced'} · {gmStrategy.riskTolerance} risk
                      {gmStrategy.untouchable?.length > 0 ? ' · ' + gmStrategy.untouchable.length + ' untouchable' : ''}
                    </div>
                  </div>
                  <span style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>{gmStrategyOpen ? '\u25B2' : '\u25BC'}</span>
                </button>
                {gmStrategyOpen && (
                  <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.2)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px' }}>
                    {/* Mode */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Team Mode</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[{id:'contend',label:'Win Now',desc:'Maximize this season'},{id:'balanced',label:'Balanced',desc:'Compete + build'},{id:'rebuild',label:'Rebuild',desc:'Accumulate youth & picks'}].map(m => (
                          <button key={m.id} onClick={() => setGmStrategy(prev => ({...prev, mode: m.id}))} style={{
                            flex: 1, padding: '10px 8px', background: gmStrategy.mode === m.id ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                            color: gmStrategy.mode === m.id ? 'var(--black)' : 'var(--silver)',
                            border: '1px solid ' + (gmStrategy.mode === m.id ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                            borderRadius: '8px', cursor: 'pointer', textAlign: 'center'
                          }}>
                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '0.9rem', letterSpacing: '0.03em' }}>{m.label}</div>
                            <div style={{ fontSize: '0.66rem', opacity: 0.6, marginTop: '2px' }}>{m.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Risk Tolerance */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Risk Tolerance</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {['conservative','moderate','aggressive'].map(r => (
                          <button key={r} onClick={() => setGmStrategy(prev => ({...prev, riskTolerance: r}))} style={{
                            flex: 1, padding: '8px', fontFamily: 'Oswald', fontSize: '0.78rem', textTransform: 'capitalize',
                            background: gmStrategy.riskTolerance === r ? (r==='aggressive'?'#E74C3C':r==='conservative'?'#3498DB':'var(--gold)') : 'rgba(255,255,255,0.04)',
                            color: gmStrategy.riskTolerance === r ? (r==='aggressive'||r==='conservative'?'#fff':'var(--black)') : 'var(--silver)',
                            border: '1px solid ' + (gmStrategy.riskTolerance === r ? 'transparent' : 'rgba(255,255,255,0.08)'),
                            borderRadius: '6px', cursor: 'pointer'
                          }}>{r}</button>
                        ))}
                      </div>
                    </div>
                    {/* Positional Priorities */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Positional Priorities <span style={{ fontSize: '0.66rem', color: 'var(--silver)', opacity: 0.5, textTransform: 'none' }}>— click to increase priority</span></div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                        {['QB','RB','WR','TE','DL','LB','DB','K'].map(pos => {
                          const val = gmStrategy.positionalNeeds?.[pos] || 5;
                          const posColors = {QB:'#E74C3C',RB:'#2ECC71',WR:'#3498DB',TE:'#F0A500',K:'#9B59B6',DL:'#E67E22',LB:'#1ABC9C',DB:'#E91E63'};
                          return (
                            <button key={pos} onClick={() => setGmStrategy(prev => ({...prev, positionalNeeds: {...prev.positionalNeeds, [pos]: val >= 10 ? 1 : val + 1}}))} style={{
                              padding: '8px 4px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + (posColors[pos] || '#666') + (val >= 7 ? '55' : '22'),
                              borderRadius: '6px', cursor: 'pointer', textAlign: 'center'
                            }}>
                              <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</div>
                              <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', marginTop: '3px' }}>
                                {Array.from({length: 10}).map((_, i) => (
                                  <div key={i} style={{ width: '4px', height: '8px', borderRadius: '1px', background: i < val ? (posColors[pos] || '#666') : 'rgba(255,255,255,0.08)' }} />
                                ))}
                              </div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.5, marginTop: '2px' }}>{val >= 8 ? 'Critical' : val >= 5 ? 'Moderate' : 'Low'}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* Untouchable Players */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Untouchable Players</div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        {(gmStrategy.untouchable || []).map(pid => {
                          const p = playersData[pid];
                          return (
                            <span key={pid} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '14px', fontSize: '0.74rem', color: 'var(--gold)' }}>
                              {p?.full_name || pid}
                              <span onClick={() => setGmStrategy(prev => ({...prev, untouchable: prev.untouchable.filter(id => id !== pid)}))} style={{ cursor: 'pointer', color: '#E74C3C', fontWeight: 700 }}>&times;</span>
                            </span>
                          );
                        })}
                        {(gmStrategy.untouchable || []).length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.4 }}>No untouchable players set</span>}
                      </div>
                      <select onChange={e => { const pid = e.target.value; if (pid && !(gmStrategy.untouchable || []).includes(pid)) setGmStrategy(prev => ({...prev, untouchable: [...(prev.untouchable || []), pid]})); e.target.value = ''; }} style={{
                        width: '100%', padding: '6px 10px', fontSize: '0.76rem', fontFamily: 'Oswald',
                        background: 'var(--charcoal)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'var(--white)'
                      }}>
                        <option value="">+ Add untouchable player...</option>
                        {(myRoster?.players || []).filter(pid => !(gmStrategy.untouchable || []).includes(pid)).sort((a,b) => (window.App?.LI?.playerScores?.[b] || 0) - (window.App?.LI?.playerScores?.[a] || 0)).map(pid => {
                          const p = playersData[pid];
                          return <option key={pid} value={pid}>{p?.full_name || pid} ({(window.App?.LI?.playerScores?.[pid] || 0).toLocaleString()} DHQ)</option>;
                        })}
                      </select>
                    </div>
                    {/* Trade Targets (positions) */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Target Positions in Trades</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {['QB','RB','WR','TE','DL','LB','DB','Picks'].map(t => {
                          const active = (gmStrategy.targets || []).includes(t);
                          return <button key={t} onClick={() => setGmStrategy(prev => ({...prev, targets: active ? (prev.targets || []).filter(x => x !== t) : [...(prev.targets || []), t]}))} style={{
                            padding: '5px 12px', fontSize: '0.74rem', fontFamily: 'Oswald',
                            background: active ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)',
                            color: active ? '#2ECC71' : 'var(--silver)',
                            border: '1px solid ' + (active ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.08)'),
                            borderRadius: '14px', cursor: 'pointer'
                          }}>{t}{active ? ' \u2713' : ''}</button>;
                        })}
                      </div>
                    </div>
                    {/* Strategy Notes */}
                    <div>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Strategy Notes</div>
                      <textarea value={gmStrategy.notes || ''} onChange={e => setGmStrategy(prev => ({...prev, notes: e.target.value}))} placeholder="Add your personal strategy notes... (e.g., 'Looking to move RB depth for a WR1 before the trade deadline')" style={{
                        width: '100%', minHeight: '60px', padding: '8px 10px', fontSize: '0.78rem',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px', color: 'var(--silver)', fontFamily: 'Oswald', resize: 'vertical', lineHeight: 1.5
                      }} />
                    </div>
                    {/* Alex Ingram Avatar Picker */}
                    <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontFamily: 'Oswald', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Customize Alex Ingram</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {ALEX_AVATARS.map(av => (
                          <button key={av.id} onClick={() => { setAlexAvatar(av.id); setAvatarKey(k => k+1); }} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                            padding: '8px', background: getAlexAvatar() === av.id ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                            border: '2px solid ' + (getAlexAvatar() === av.id ? 'var(--gold)' : 'rgba(255,255,255,0.06)'),
                            borderRadius: '10px', cursor: 'pointer', minWidth: '68px', transition: 'all 0.15s'
                          }}>
                            {av.src ? (
                              <img src={av.src} alt={av.label} style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4AF37, #B8941E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 800, color: '#0A0A0A', fontFamily: 'Bebas Neue' }}>AI</div>
                            )}
                            <span style={{ fontSize: '0.62rem', color: getAlexAvatar() === av.id ? 'var(--gold)' : 'var(--silver)', textAlign: 'center', lineHeight: 1.2 }}>{av.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {myTeamView === 'roster' && (<div>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {['All','Starters','Bench','Taxi','IR','Offense','IDP'].map(f => (
                  <button key={f} onClick={() => setRosterFilter(f)} style={{
                    padding: '4px 10px', fontSize: '0.72rem', fontWeight: rosterFilter === f ? 700 : 400,
                    fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.03em',
                    background: rosterFilter === f ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                    color: rosterFilter === f ? 'var(--black)' : 'var(--silver)',
                    border: '1px solid ' + (rosterFilter === f ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                    borderRadius: '3px', cursor: 'pointer'
                  }}>{f}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65 }}>{filtered.length} shown</span>
              </div>

              {/* Preset buttons + column picker */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.65, fontFamily: 'Oswald' }}>VIEW:</span>
                {Object.entries(COLUMN_PRESETS).map(([key, cols]) => (
                  <button key={key} onClick={() => { setVisibleCols(cols); setColPreset(key); }}
                    style={{
                      padding: '3px 10px', fontSize: '0.7rem', fontWeight: colPreset === key ? 700 : 400,
                      fontFamily: 'Oswald', textTransform: 'uppercase',
                      background: colPreset === key ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                      color: colPreset === key ? 'var(--black)' : 'var(--silver)',
                      border: '1px solid ' + (colPreset === key ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                      borderRadius: '3px', cursor: 'pointer', letterSpacing: '0.03em'
                    }}>{key}</button>
                ))}
                <button onClick={() => setShowColPicker(!showColPicker)} style={{
                  marginLeft: 'auto', padding: '3px 10px', fontSize: '0.7rem',
                  fontFamily: 'Oswald', background: showColPicker ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                  color: showColPicker ? 'var(--gold)' : 'var(--silver)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer'
                }}>COLUMNS</button>
              </div>

              {/* Column picker dropdown */}
              {showColPicker && (
                <div style={{
                  background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '8px',
                  padding: '10px', marginBottom: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px'
                }}>
                  {Object.entries(ROSTER_COLUMNS).map(([key, col]) => {
                    const active = visibleCols.includes(key);
                    return (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem',
                        background: active ? 'rgba(212,175,55,0.1)' : 'transparent',
                        color: active ? 'var(--gold)' : 'var(--silver)'
                      }}>
                        <input type="checkbox" checked={active} onChange={() => {
                          if (active) setVisibleCols(prev => prev.filter(c => c !== key));
                          else setVisibleCols(prev => [...prev, key]);
                          setColPreset('custom');
                        }} style={{ accentColor: 'var(--gold)' }} />
                        {col.label}
                        <span style={{ fontSize: '0.76rem', opacity: 0.6, marginLeft: 'auto' }}>{col.group}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Frozen left + scrollable right table */}
              {/* Roster table with inline expand cards */}
              <div style={{ border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden', background: 'var(--black)' }}>
                {/* Header row */}
                <div style={{ display: 'flex', height: '36px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)' }}>
                  <div style={{ width: '220px', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none', borderRight: '2px solid rgba(212,175,55,0.15)' }}
                    onClick={() => setRosterSort(prev => prev.key === 'name' ? {...prev, dir: prev.dir*-1} : {key: 'name', dir: 1})}>
                    Player{rosterSort.key === 'name' ? (rosterSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}
                  </div>
                  <div style={{ flex: 1, display: 'flex', overflowX: 'auto' }}>
                    {visibleCols.map(colKey => {
                      const col = ROSTER_COLUMNS[colKey];
                      if (!col) return null;
                      return (
                        <div key={colKey} onClick={() => setRosterSort(prev => prev.key === colKey ? {...prev, dir: prev.dir*-1} : {key: colKey, dir: -1})}
                          style={{ width: col.width, minWidth: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Oswald', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none' }}>
                          {col.shortLabel || col.label}{rosterSort.key === colKey ? (rosterSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Player rows + inline expand */}
                {filtered.map((r, idx) => {
                  const isExpanded = expandedPid === r.pid;
                  const contract = window.NFL_CONTRACTS?.[r.pid];
                  const peaks = {QB:[27,33],RB:[22,26],WR:[24,29],TE:[25,30],DL:[24,29],LB:[23,28],DB:[24,29]};
                  const [pLo, pHi] = peaks[r.pos] || [24,29];

                  return (
                    <React.Fragment key={r.pid}>
                      {/* Normal row */}
                      <div style={{ display: 'flex', borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isExpanded ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background 0.1s' }}
                        onClick={() => setExpandedPid(prev => prev === r.pid ? null : r.pid)}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'; }}>
                        {/* Frozen player info */}
                        <div style={{ width: '220px', flexShrink: 0, height: '42px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 6px', borderRight: '2px solid rgba(212,175,55,0.15)', borderLeft: '3px solid ' + statusCol(r.section) }}>
                          <div style={{ width: '26px', height: '26px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+r.pid+'.jpg'} alt="" onError={e=>e.target.style.display='none'} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} /></div>
                          <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPlayerName(r.pid)}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65 }}>{r.p.team || 'FA'}{r.injury ? ' \u00B7 '+r.injury : ''}</div>
                          </div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.4 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                        </div>
                        {/* Data columns */}
                        <div style={{ flex: 1, display: 'flex', height: '42px', overflowX: 'auto' }}>
                          {visibleCols.map(colKey => ROSTER_COLUMNS[colKey] ? renderCell(colKey, r) : null)}
                        </div>
                      </div>

                      {/* Inline expand card — Madden/FM style */}
                      {isExpanded && (
                        <div style={{ borderBottom: '2px solid rgba(212,175,55,0.25)', background: 'linear-gradient(135deg, rgba(212,175,55,0.04), rgba(0,0,0,0.3))', padding: '16px 20px', animation: 'wrFadeIn 0.2s ease' }}>
                          {/* Top: Photo + Identity + Quick Stats */}
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                            <div style={{ flexShrink: 0, position: 'relative' }}>
                              <img src={'https://sleepercdn.com/content/nfl/players/'+r.pid+'.jpg'} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                              <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                              <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[r.pos]||'#666')+'25', color: posColors[r.pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{r.pos}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || getPlayerName(r.pid)}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                                {r.pos} {'\u00B7'} {r.p.team || 'FA'} {'\u00B7'} Age {r.age || '?'} {'\u00B7'} {r.p.years_exp||0}yr exp
                                {r.p.college ? ' \u00B7 '+r.p.college : ''}
                              </div>
                              {r.injury && <div style={{ fontSize: '0.74rem', color: '#E74C3C', fontWeight: 600, marginTop: '3px' }}>{r.injury}</div>}
                              {/* Verdict badge */}
                              <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Oswald', padding: '2px 10px', borderRadius: '10px', background: r.rec.includes('SELL') ? 'rgba(231,76,60,0.15)' : r.rec.includes('BUY') ? 'rgba(46,204,113,0.15)' : 'rgba(212,175,55,0.12)', color: r.rec.includes('SELL') ? '#E74C3C' : r.rec.includes('BUY') ? '#2ECC71' : 'var(--gold)', letterSpacing: '0.04em' }}>{r.rec}</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: '10px', background: dhqBg(r.dhq), color: dhqCol(r.dhq) }}>
                                  {r.dhq >= 7000 ? 'Elite' : r.dhq >= 4000 ? 'Starter' : r.dhq >= 2000 ? 'Depth' : 'Stash'} {'\u00B7'} {r.dhq.toLocaleString()} DHQ
                                </span>
                                {r.peakYrsLeft > 0 && <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '10px', background: r.peakPhase === 'PRE' ? 'rgba(46,204,113,0.1)' : 'rgba(212,175,55,0.08)', color: r.peakPhase === 'PRE' ? '#2ECC71' : 'var(--gold)' }}>{r.peakYrsLeft}yr peak left</span>}
                              </div>
                            </div>
                          </div>

                          {/* Stat boxes grid — Madden style */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                            {[
                              { label: 'DHQ', val: r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014', col: dhqCol(r.dhq) },
                              { label: 'PPG', val: r.effectivePPG || '\u2014', col: r.effectivePPG >= (posP75[r.pos]||10) ? '#2ECC71' : '#f0f0f3' },
                              { label: 'PREV PPG', val: r.prevPPG || '\u2014', col: 'var(--silver)' },
                              { label: 'GP', val: r.effectiveGP || '\u2014', col: r.effectiveGP >= 14 ? '#2ECC71' : r.effectiveGP >= 10 ? 'var(--silver)' : '#E74C3C' },
                              { label: 'TREND', val: r.trend ? (r.trend > 0 ? '+' : '') + r.trend + '%' : '\u2014', col: r.trend >= 15 ? '#2ECC71' : r.trend <= -15 ? '#E74C3C' : 'var(--silver)' },
                              { label: 'PEAK', val: r.peakPhase, col: r.peakPhase === 'PRE' ? '#2ECC71' : r.peakPhase === 'PRIME' ? 'var(--gold)' : '#E74C3C' },
                            ].map((s, i) => (
                              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                                <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: s.col, letterSpacing: '-0.02em' }}>{s.val}</div>
                                <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Physical + Draft Profile */}
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Profile</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.78rem' }}>
                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Ht </span><span style={{ color: 'var(--white)' }}>{r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : '\u2014'}</span></div>
                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Wt </span><span style={{ color: 'var(--white)' }}>{r.p.weight ? r.p.weight+'lbs' : '\u2014'}</span></div>
                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Slot </span><span style={{ color: 'var(--white)' }}>{r.section === 'starter' ? 'Starter' : r.section === 'ir' ? 'IR' : r.section === 'taxi' ? 'Taxi' : 'Bench'}</span></div>
                              <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Exp </span><span style={{ color: 'var(--white)' }}>{r.p.years_exp || 0}yr</span></div>
                              {r.p.college && <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>College </span><span style={{ color: 'var(--white)' }}>{r.p.college}</span></div>}
                              {r.p.depth_chart_order != null && <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Depth </span><span style={{ color: r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--white)' }}>#{r.p.depth_chart_order + 1} {r.p.depth_chart_position || ''}</span></div>}
                            </div>
                          </div>

                          {/* Dynasty Profile bar */}
                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Dynasty Profile</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>
                              {r.peakPhase === 'PRE' && r.dhq >= 4000 ? 'Rising asset with ' + r.peakYrsLeft + ' peak years ahead. Buy window closing \u2014 value only goes up from here.' :
                               r.peakPhase === 'PRIME' && r.dhq >= 7000 ? 'Elite producer in prime. Cornerstone dynasty asset \u2014 hold unless offered a king\'s ransom.' :
                               r.peakPhase === 'PRIME' && r.dhq >= 4000 ? 'Solid starter in peak window. ' + r.peakYrsLeft + ' productive years left. Hold or sell high if trending down.' :
                               r.peakPhase === 'POST' ? 'Past peak \u2014 dynasty value declining. ' + (r.dhq >= 3000 ? 'Still producing but sell before the cliff.' : 'Move for any return.') :
                               r.dhq < 2000 ? 'Depth piece. Low dynasty value \u2014 roster clogger unless a breakout is imminent.' :
                               'Moderate dynasty asset. Watch trajectory.'}
                              {r.trend >= 20 ? ' Trending up ' + r.trend + '% \u2014 stock rising.' : r.trend <= -20 ? ' Production down ' + Math.abs(r.trend) + '% \u2014 red flag.' : ''}
                            </div>
                          </div>

                          {/* Career Stats Table */}
                          <InlineCareerStats pid={r.pid} pos={r.pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                          {/* Action buttons */}
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={e => { e.stopPropagation(); setReconPanelOpen(true); sendReconMessage('What trades can I make involving ' + (r.p.full_name || getPlayerName(r.pid)) + '? Consider their DHQ value (' + r.dhq + '), age (' + r.age + '), and peak window (' + r.peakPhase + ').'); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>TRADE</button>
                            <button onClick={e => { e.stopPropagation(); setExpandedPid(null); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Oswald', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Position summary bar (FM-style) */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                {Object.entries(posColors).map(([pos, col]) => {
                  const posRows = rows.filter(r => r.pos === pos);
                  if (!posRows.length) return null;
                  const total = posRows.reduce((s,r) => s + r.dhq, 0);
                  const stCount = posRows.filter(r => r.isStarter).length;
                  return (
                    <div key={pos} style={{ background: col + '11', border: '1px solid ' + col + '33', borderRadius: '6px', padding: '6px 10px', minWidth: '70px' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: col }}>{pos}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'Oswald' }}>{posRows.length}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>{stCount} start {'\u00B7'} {(total/1000).toFixed(0)}k</div>
                    </div>
                  );
                })}
              </div>
              </div>)}
            </div>
          );
        }

        // Build divisions
        const divisions = {};
        const hasDivisions = standings.some(t => t.division > 0);
        if (hasDivisions) {
            standings.forEach(team => {
                const div = team.division || 0;
                if (!divisions[div]) divisions[div] = [];
                divisions[div].push(team);
            });
        } else {
            divisions[0] = [...standings];
        }
        const divisionKeys = Object.keys(divisions).sort((a, b) => Number(a) - Number(b));

        // KPI card styles
        const kpiCardStyle = {
            background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '12px', padding: '16px 18px', textAlign: 'center'
        };
        const kpiLabelStyle = {
            fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif',
            letterSpacing: '0.08em', marginBottom: '6px', fontWeight: '700'
        };
        const kpiValueStyle = {
            fontSize: '1.6rem', fontWeight: '700', color: 'var(--white)',
            fontFamily: 'Bebas Neue, cursive', lineHeight: 1, letterSpacing: '0.03em'
        };
        const kpiSubStyle = {
            fontSize: '0.72rem', color: 'var(--silver)', marginTop: '4px',
            fontFamily: 'Oswald, sans-serif', opacity: 0.7
        };

        return (
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
                            {dhqStatus.progress < 50 ? 'Analyzing 5 years of stats, drafts, and transactions. First time takes ~15 seconds, then it\'s cached.' :
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
                    {/* Logo */}
                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.06em', padding: '0 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      WAR ROOM
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

                    {/* Refresh Button */}
                    <button onClick={async () => {
                        try {
                            localStorage.removeItem('dhq_leagueintel_v9');
                            localStorage.removeItem('dhq_leagueintel_v10');
                            Object.keys(localStorage).filter(k => k.startsWith('dhq_hist_')).forEach(k => localStorage.removeItem(k));
                            try { sessionStorage.removeItem('fw_players_cache'); } catch(e) {}
                            window._wrPlayersCache = null;
                            if (window.App) { window.App.LI = {}; window.App.LI_LOADED = false; window._liLoading = false; }
                        } catch(e) {}
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
                        <div className="header-title" style={{ margin: 0 }}>{currentLeague.name}</div>
                        <button onClick={onBack} title="Switch league" style={{ background: 'none', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '3px 10px', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.72rem', fontWeight: 600, opacity: 0.7, letterSpacing: '0.04em' }}>⇄ SWITCH</button>
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
                    {/* View mode toggle */}
                    <div style={{ display: 'flex', marginLeft: 'auto', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', overflow: 'hidden' }}>
                        {['command', 'analyst'].map(m =>
                            <button key={m} onClick={() => setViewMode(m)} title={m === 'command' ? 'Decisions and priorities' : 'Full data and analysis'} style={{
                                padding: '4px 14px', fontSize: '0.74rem', fontFamily: 'Oswald',
                                textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer',
                                background: viewMode === m ? 'var(--gold)' : 'transparent',
                                color: viewMode === m ? 'var(--black)' : 'var(--silver)',
                                border: 'none', fontWeight: viewMode === m ? 700 : 400,
                                transition: 'all 0.15s'
                            }}>{m}</button>
                        )}
                    </div>
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

                {/* KPI Cards — 5 customizable slots (dashboard only) */}
                {activeTab === 'dashboard' && <React.Fragment><div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px',
                    padding: '16px 24px', background: 'var(--black)',
                    borderBottom: '1px solid rgba(212,175,55,0.15)'
                }}>
                    {selectedKpis.map((kpiKey, idx) => {
                        const opt = KPI_OPTIONS[kpiKey] || { label: kpiKey, icon: '?', category: '' };
                        const val = computeKpiValue(kpiKey);
                        const isEditing = editingKpi === idx;
                        return (
                            <div key={kpiKey + idx} style={{
                                ...kpiCardStyle, position: 'relative', cursor: 'default',
                                border: isEditing ? '1px solid var(--gold)' : kpiCardStyle.border
                            }}>
                                {/* Edit button */}
                                <button onClick={e => { e.stopPropagation(); setEditingKpi(isEditing ? null : idx); }}
                                    style={{
                                        position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px',
                                        border: 'none', borderRadius: '50%', cursor: 'pointer',
                                        background: isEditing ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                                        color: isEditing ? 'var(--black)' : 'var(--silver)',
                                        fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s', opacity: 0.6
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                    title="Change this KPI"
                                >{isEditing ? '\u2715' : '\u270E'}</button>

                                {/* KPI content */}
                                <div style={{ ...kpiLabelStyle, fontSize: '0.72rem' }}>{opt.icon} {opt.category.toUpperCase()}{opt.tip ? React.createElement(Tip, null, opt.tip) : null}</div>
                                <div style={{ ...kpiValueStyle, color: val.color, fontSize: '1.6rem' }}>{val.value}</div>
                                <div style={kpiSubStyle}>{val.sub}</div>
                                {/* Sparkline visualization */}
                                {typeof Sparkline !== 'undefined' && val.sparkData && React.createElement(Sparkline, { data: val.sparkData, width: 90, height: 24, color: val.color || '#D4AF37' })}
                                {/* Contextual annotation */}
                                {(() => { const ann = getKpiAnnotation(kpiKey, val.value); return ann ? React.createElement('div', { style:{fontSize:'0.7rem',color:'var(--gold)',marginTop:'6px',fontFamily:'Oswald',fontWeight:600,letterSpacing:'0.02em',borderTop:'1px solid rgba(212,175,55,0.15)',paddingTop:'6px'} }, ann) : null; })()}

                                {/* Dropdown picker */}
                                {isEditing && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: '-4px', right: '-4px', marginTop: '4px',
                                        background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.4)',
                                        borderRadius: '8px', zIndex: 50, maxHeight: '220px', overflowY: 'auto',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                                    }}>
                                        {Object.entries(KPI_OPTIONS)
                                            .filter(([k]) => !selectedKpis.includes(k) || k === kpiKey)
                                            .map(([k, o]) => {
                                                const isActive = k === kpiKey;
                                                return (
                                                    <div key={k} onClick={() => {
                                                        const updated = [...selectedKpis];
                                                        updated[idx] = k;
                                                        setSelectedKpis(updated);
                                                        setEditingKpi(null);
                                                    }} style={{
                                                        padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem',
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        background: isActive ? 'rgba(212,175,55,0.15)' : 'transparent',
                                                        color: isActive ? 'var(--gold)' : 'var(--white)',
                                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <span style={{ fontSize: '0.8rem' }}>{o.icon}</span>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{o.label}</div>
                                                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6 }}>{o.category}</div>
                                                        </div>
                                                        {isActive && <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: '0.7rem' }}>{'\u2713'}</span>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Close dropdown on outside click */}
                {editingKpi !== null && (
                    <div onClick={() => setEditingKpi(null)} style={{
                        position: 'fixed', inset: 0, zIndex: 40, background: 'transparent'
                    }}></div>
                )}
                </React.Fragment>}

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
                ) : activeTab === 'myteam' ? renderMyTeamTab() : activeTab === 'league' ? renderLeagueTab() : activeTab === 'analytics' ? (() => {
                    const aCardStyle = { background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '16px', marginBottom: '16px' };
                    const aHeaderStyle = { fontFamily: 'Bebas Neue, cursive', color: 'var(--gold)', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: '12px', borderBottom: '1px solid rgba(212,175,55,0.2)', paddingBottom: '8px' };
                    const aValStyle = { fontFamily: 'Oswald, sans-serif', fontSize: '0.95rem' };
                    const goodColor = '#2ECC71';
                    const warnColor = '#F0A500';
                    const badColor = '#E74C3C';
                    const sevIcon = (sev) => sev === 'high' || sev === 'critical' ? '\uD83D\uDD34' : sev === 'medium' ? '\u26A0\uFE0F' : '\u2705';
                    const sevColor = (sev) => sev === 'high' || sev === 'critical' ? badColor : sev === 'medium' ? warnColor : goodColor;
                    const pctFmt = (v) => Math.round((v || 0) * 100) + '%';
                    const numFmt = (v) => v != null ? (typeof v === 'number' ? v.toLocaleString() : v) : '\u2014';
                    // ── COMMAND VIEW: decision briefing ──
                    if (isCommand) {
                        const d = analyticsData;
                        const scores = window.App?.LI?.playerScores || {};
                        const myPids = myRoster?.players || [];
                        const totalDhq = myPids.reduce((s, pid) => s + (scores[pid] || 0), 0);
                        const elites = myPids.filter(pid => (scores[pid] || 0) >= 7000).length;
                        const myAssess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
                        const hs = myAssess?.healthScore || 0;
                        const tier = (myAssess?.tier || 'UNKNOWN').toUpperCase();
                        const gaps = (d?.gaps || d?.roster?.gaps || []).slice(0, 5);
                        const strengths = myAssess?.strengths || [];
                        const needs = myAssess?.needs || [];
                        const projWin = d?.window;
                        const myRank = rankedTeams.findIndex(t => t.userId === sleeperUserId) + 1;

                        // Position investment comparison
                        const w = d?.roster?.winnerProfile;
                        const m = d?.roster?.myProfile;
                        const posInsights = [];
                        if (w?.posInvestment && m?.posInvestment) {
                            Object.keys(w.posInvestment).forEach(pos => {
                                if (pos === 'UNK') return;
                                const wPct = (w.posInvestment[pos] || 0) * 100;
                                const mPct = (m.posInvestment[pos] || 0) * 100;
                                const diff = mPct - wPct;
                                if (Math.abs(diff) > 5) posInsights.push({ pos, diff, label: diff > 0 ? 'Overweight' : 'Underweight', col: diff > 0 ? '#3498DB' : warnColor });
                            });
                            posInsights.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
                        }

                        // Team diagnosis
                        const diagParts = [];
                        diagParts.push(tier === 'ELITE' ? 'Championship-caliber roster.' : tier === 'CONTENDER' ? 'Legitimate contender.' : tier === 'CROSSROADS' ? 'At a crossroads.' : 'Rebuilding phase.');
                        if (needs.length) diagParts.push('Biggest weakness: ' + needs[0].pos + ' (' + needs[0].urgency + ').');
                        if (tier === 'ELITE' || tier === 'CONTENDER') diagParts.push('Strategy: make surgical upgrades, protect core assets.');
                        else if (tier === 'CROSSROADS') diagParts.push('Strategy: address top gap or commit to a rebuild path.');
                        else diagParts.push('Strategy: accumulate young assets and draft capital. Sell aging veterans.');

                        // Build prioritized actions
                        const priorities = [];
                        needs.slice(0, 2).forEach((n, i) => {
                            priorities.push({ rank: i + 1, label: n.pos + ' ' + n.urgency, action: n.urgency === 'deficit' ? 'Find ' + n.pos + ' via trade or waivers' : 'Add ' + n.pos + ' depth', cta: n.urgency === 'deficit' ? 'fa' : 'trades', col: n.urgency === 'deficit' ? badColor : warnColor });
                        });
                        if (elites < 2) priorities.push({ rank: priorities.length + 1, label: 'Elite deficit (' + elites + ' players 7000+ DHQ)', action: 'Target elite-tier acquisitions', cta: 'trades', col: badColor });
                        if (projWin && projWin.years <= 1) priorities.push({ rank: priorities.length + 1, label: 'Window closing (' + (projWin.years || 0) + 'yr)', action: 'Sell aging assets or go all-in', cta: 'trades', col: warnColor });

                        return (
                            <div style={{ padding: '24px 32px', maxWidth: '1000px', margin: '0 auto' }} className="wr-fade-in">
                                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.8rem', color: 'var(--gold)', letterSpacing: '0.05em', marginBottom: '20px' }}>LEAGUE COMMAND</div>

                                {/* Team Diagnosis */}
                                <div style={{ ...aCardStyle, borderLeft: '4px solid var(--gold)', padding: '20px 24px', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '2.8rem', color: myRank <= 3 ? goodColor : myRank <= 6 ? warnColor : badColor, lineHeight: 1 }}>#{myRank || '?'}</div>
                                        <div>
                                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.03em' }}>{tier}</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{totalDhq.toLocaleString()} DHQ {'\u00B7'} {hs} health {'\u00B7'} {elites} elite{elites !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                    <GMMessage compact>{diagParts.join(' ')}</GMMessage>
                                </div>

                                {/* Gate: Action Plan requires warroom tier */}
                                {!canAccess('command-view') && <div style={{ background:'linear-gradient(135deg, var(--off-black), var(--charcoal))', border:'2px solid rgba(212,175,55,0.3)', borderRadius:'12px', padding:'24px', textAlign:'center', marginBottom:'20px' }}>
                                    <div style={{ fontFamily:'Bebas Neue', fontSize:'1.3rem', color:'var(--gold)', marginBottom:'8px' }}>UNLOCK FULL ACTION PLAN</div>
                                    <div style={{ fontSize:'0.85rem', color:'var(--silver)', lineHeight:1.6, marginBottom:'14px' }}>See prioritized moves, trade currency analysis, position investment insights, and power ranking narratives.</div>
                                    <button onClick={() => { window.location.href = 'landing.html'; }} style={{ padding:'10px 24px', background:'var(--gold)', color:'var(--black)', border:'none', borderRadius:'8px', fontFamily:'Bebas Neue', fontSize:'1rem', cursor:'pointer' }}>Unlock War Room — $9.99/mo</button>
                                </div>}

                                {/* Prioritized Actions */}
                                {canAccess('command-view') && priorities.length > 0 && <div style={{ ...aCardStyle, borderLeft: '4px solid ' + badColor, marginBottom: '20px' }}>
                                    <div style={aHeaderStyle}>ACTION PLAN</div>
                                    {priorities.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: i < priorities.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                                            <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: p.col, minWidth: '28px' }}>#{p.rank}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.88rem', color: 'var(--white)', fontWeight: 600 }}>{p.label}</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.7 }}>{p.action}</div>
                                            </div>
                                            <button onClick={() => setActiveTab(p.cta)} style={{ padding: '6px 14px', background: p.col + '20', border: '1px solid ' + p.col + '50', color: p.col, borderRadius: '6px', fontFamily: 'Oswald', fontSize: '0.76rem', cursor: 'pointer', textTransform: 'uppercase', fontWeight: 700 }}>Fix This</button>
                                        </div>
                                    ))}
                                </div>}

                                {/* KPI Cards - sorted by weakness */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                                    {[
                                        { val: totalDhq.toLocaleString(), label: 'TOTAL DHQ', col: 'var(--gold)', ok: true },
                                        { val: hs || '\u2014', label: 'HEALTH', col: hs >= 80 ? goodColor : hs >= 60 ? warnColor : badColor, ok: hs >= 70 },
                                        { val: elites, label: 'ELITE PLAYERS', col: elites >= 3 ? goodColor : elites >= 1 ? warnColor : badColor, ok: elites >= 2 },
                                        { val: projWin?.years > 0 ? projWin.years + 'yr' : 'Now', label: 'WINDOW', col: projWin?.years >= 3 ? goodColor : projWin?.years >= 1 ? warnColor : badColor, ok: projWin?.years >= 2 },
                                    ].sort((a, b) => (a.ok ? 1 : 0) - (b.ok ? 1 : 0)).map((kpi, i) => (
                                        <div key={i} style={{ background: 'var(--black)', border: '2px solid ' + (kpi.ok ? 'rgba(212,175,55,0.2)' : kpi.col + '50'), borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.8rem', color: kpi.col }}>{kpi.val}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', fontFamily: 'Oswald', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Two-column: Trade Currency + Position Insights */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                                    {/* Trade currency */}
                                    {strengths.length > 0 ? <div style={{ ...aCardStyle, borderLeft: '4px solid ' + goodColor, marginBottom: 0 }}>
                                        <div style={aHeaderStyle}>TRADE CURRENCY</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--silver)', lineHeight: 1.6, marginBottom: '10px' }}>
                                            Surplus at <strong style={{ color: goodColor }}>{strengths.join(', ')}</strong>. Use to fill {needs.length ? needs.slice(0, 2).map(n => n.pos).join('/') : 'gaps'}.
                                        </div>
                                        <button onClick={() => setActiveTab('trades')} style={{ padding: '8px 18px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.9rem', cursor: 'pointer' }}>FIND TRADES</button>
                                    </div> : <div style={{ ...aCardStyle, marginBottom: 0 }}><div style={aHeaderStyle}>TRADE CURRENCY</div><div style={{ fontSize: '0.82rem', color: 'var(--silver)', opacity: 0.5 }}>No surplus positions to leverage.</div></div>}

                                    {/* Position investment */}
                                    <div style={{ ...aCardStyle, marginBottom: 0 }}>
                                        <div style={aHeaderStyle}>POSITION INVESTMENT vs WINNERS</div>
                                        {posInsights.length > 0 ? posInsights.slice(0, 4).map((p, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                                                <span style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: 'var(--silver)', minWidth: '30px' }}>{p.pos}</span>
                                                <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: Math.min(100, Math.abs(p.diff) * 3) + '%', height: '100%', background: p.col, borderRadius: '3px', marginLeft: p.diff > 0 ? 0 : 'auto' }} />
                                                </div>
                                                <span style={{ fontSize: '0.76rem', color: p.col, fontWeight: 700, minWidth: '80px', textAlign: 'right' }}>{p.label} {Math.abs(Math.round(p.diff))}%</span>
                                            </div>
                                        )) : <div style={{ fontSize: '0.82rem', color: 'var(--silver)', opacity: 0.5 }}>Analytics loading...</div>}
                                    </div>
                                </div>

                                {/* Power ranking summary */}
                                {myRank > 0 && <div style={{ ...aCardStyle, marginBottom: '20px' }}>
                                    <div style={aHeaderStyle}>POWER RANKING</div>
                                    <div style={{ fontSize: '0.88rem', color: 'var(--silver)', lineHeight: 1.7 }}>
                                        You rank <strong style={{ color: myRank <= 3 ? goodColor : myRank <= 6 ? warnColor : badColor }}>#{myRank} of {rankedTeams.length}</strong>
                                        {' '}due to {hs >= 75 ? 'strong roster health (' + hs + ')' : hs >= 55 ? 'moderate health (' + hs + ')' : 'low health (' + hs + ')'}
                                        {elites >= 3 ? ' and elite asset depth.' : elites >= 1 ? ' with ' + elites + ' elite asset' + (elites > 1 ? 's' : '') + '.' : ' and no elite-tier assets.'}
                                        {myRank > 6 ? ' Focus on rebuilding your core.' : myRank > 3 ? ' You\'re in the mix \u2014 one trade could push you into the top tier.' : ' You\'re a league leader.'}
                                    </div>
                                </div>}

                                <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.4 }}>Switch to Analyst view for full charts, tables, and breakdowns</div>
                            </div>
                        );
                    }

                    // ── ANALYST VIEW: full analytics terminal ──
                    const subTabs = [
                        { key: 'roster', label: 'Roster' },
                        { key: 'draft', label: 'Draft' },
                        { key: 'waivers', label: 'Waivers' },
                        { key: 'trades', label: 'Trades' },
                        { key: 'projections', label: 'Projections' },
                        { key: 'playoffs', label: 'Playoffs' },
                        { key: 'timeline', label: 'Timeline' },
                    ];
                    const subTabBtnStyle = (active) => ({
                        padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Bebas Neue, cursive', fontSize: '1rem', letterSpacing: '0.06em', transition: 'all 0.2s',
                        border: active ? '2px solid var(--gold)' : '2px solid rgba(212,175,55,0.3)',
                        background: active ? 'var(--gold)' : 'transparent',
                        color: active ? 'var(--black)' : 'var(--gold)',
                    });
                    const tableRowStyle = (i) => ({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', ...(i === 0 ? { fontWeight: 700, color: 'var(--gold)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' } : { color: 'var(--silver)' }) });
                    const d = analyticsData;

                    return (
                    <div style={{ padding: '16px' }}>
                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.8rem', color: 'var(--gold)', letterSpacing: '0.05em', marginBottom: '4px' }}>LEAGUE ANALYTICS</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '16px' }}>Winners = playoff bracket champions, runner-ups, and semi-finalists when available. Falls back to top 3 by record in the current season.</div>

                        {/* Sub-tab navigation */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            {subTabs.map(t => (
                                <div key={t.key} style={subTabBtnStyle(analyticsTab === t.key)} onClick={() => setAnalyticsTab(t.key)}>{t.label}</div>
                            ))}
                        </div>

                        {!d ? (
                            <div style={{ ...aCardStyle, color: 'var(--silver)', textAlign: 'center', padding: '40px' }}>
                                {window.App?.LI_LOADED ? 'Computing analytics...' : 'League Intelligence is still loading. Please wait...'}
                            </div>
                        ) : (
                        <React.Fragment>

                        {/* ═══ ROSTER CONSTRUCTION ═══ */}
                        {analyticsTab === 'roster' && (() => {
                            const r = d.roster;
                            if (!r) return <div style={{ color: 'var(--silver)' }}>No roster data available.</div>;
                            const w = r.winnerProfile;
                            const l = r.leagueProfile;
                            const m = r.myProfile;
                            // Fixed elite threshold: 7000+ DHQ = league-winning asset
                            const eliteThreshold = 7000;
                            const playerScores = window.App?.LI?.playerScores || {};
                            const SS = window.S || window.App?.S;
                            const allRosters = SS?.rosters || [];
                            const winnerIds = new Set(d.winners || []);
                            function countElite(rosterList) {
                                if (!rosterList.length) return 0;
                                let total = 0;
                                rosterList.forEach(ros => { total += (ros.players || []).filter(pid => (playerScores[pid] || 0) >= eliteThreshold).length; });
                                return +(total / rosterList.length).toFixed(1);
                            }
                            const wElite = countElite(allRosters.filter(ros => winnerIds.has(ros.roster_id)));
                            const lElite = countElite(allRosters);
                            const myRid = SS?.myRosterId;
                            const mElite = countElite(allRosters.filter(ros => ros.roster_id === myRid));

                            // Health score
                            let healthScore = 0;
                            try {
                                if (window.assessTeamFromGlobal) {
                                    const assessment = window.assessTeamFromGlobal(myRid);
                                    if (assessment) healthScore = assessment.healthScore || 0;
                                }
                            } catch(e) {}
                            // Winner avg health
                            let winnerHealthTotal = 0, winnerHealthCount = 0;
                            try {
                                winnerIds.forEach(wid => {
                                    if (window.assessTeamFromGlobal) {
                                        const wa = window.assessTeamFromGlobal(wid);
                                        if (wa) { winnerHealthTotal += wa.healthScore || 0; winnerHealthCount++; }
                                    }
                                });
                            } catch(e) {}
                            const winnerHealthAvg = winnerHealthCount > 0 ? Math.round(winnerHealthTotal / winnerHealthCount) : 0;
                            const healthDelta = healthScore - winnerHealthAvg;

                            // Compete window
                            const compWindow = d.window || {};
                            const compYears = compWindow.years || 0;
                            // Avg compete window across league
                            let lgWindowTotal = 0, lgWindowCount = 0;
                            try {
                                allRosters.forEach(ros => {
                                    const pw = typeof projectCompetitiveWindow === 'function' ? null : null; // skip if expensive
                                });
                            } catch(e) {}

                            // KPI sparkline data: build from projection years
                            const projData = (d.projection || []).map(p => p.projectedDHQ);
                            const healthData = (d.projection || []).map(p => p.projectedHealth || healthScore);

                            // ── KPI Card style ──
                            const kpiCardStyle = {
                                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                                border: '1px solid rgba(212,175,55,0.25)',
                                borderRadius: '14px',
                                padding: '20px 18px 14px',
                                flex: '1 1 0',
                                minWidth: '140px',
                                position: 'relative',
                                overflow: 'hidden',
                            };
                            const kpiNumberStyle = {
                                fontFamily: 'Bebas Neue, cursive',
                                fontSize: '2.4rem',
                                lineHeight: 1,
                                color: 'var(--white)',
                                marginBottom: '2px',
                            };
                            const kpiLabelStyle = {
                                fontFamily: 'Oswald, sans-serif',
                                fontSize: '0.7rem',
                                color: 'var(--silver)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                opacity: 0.7,
                            };
                            const kpiDeltaStyle = (positive) => ({
                                fontFamily: 'Oswald, sans-serif',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: positive ? goodColor : badColor,
                                marginTop: '4px',
                            });

                            // ── Position data for BarChart ──
                            const allPos = [...new Set([...Object.keys(w.posInvestment || {}), ...Object.keys(m.posInvestment || {})])].filter(p => p !== 'UNK').sort();
                            const posBarItems = allPos.map(pos => ({
                                label: pos,
                                value: Math.round((m.posInvestment[pos] || 0) * 100),
                                color: '#4ECDC4',
                            }));
                            const posBarWinnerItems = allPos.map(pos => ({
                                label: pos,
                                value: Math.round((w.posInvestment[pos] || 0) * 100),
                                color: CHART_COLORS?.gold || '#D4AF37',
                            }));

                            // ── Radar data ──
                            const radarValues = {};
                            allPos.forEach(pos => {
                                const wPct = (w.posInvestment[pos] || 0) * 100;
                                const mPct = (m.posInvestment[pos] || 0) * 100;
                                radarValues[pos] = Math.min(100, Math.round(mPct / Math.max(wPct, 1) * 70));
                            });

                            // ── Rankings: all teams sorted by health ──
                            const teamRankings = [];
                            allRosters.forEach(ros => {
                                let hs = 0, tier = '';
                                try {
                                    if (window.assessTeamFromGlobal) {
                                        const a = window.assessTeamFromGlobal(ros.roster_id);
                                        if (a) { hs = a.healthScore || 0; tier = a.tier || ''; }
                                    }
                                } catch(e) {}
                                const totalDhq = (ros.players || []).reduce((s, pid) => s + (playerScores[pid] || 0), 0);
                                const s = ros.settings || {};
                                const rUser = currentLeague.users?.find(u => u.user_id === ros.owner_id);
                                teamRankings.push({
                                    rosterId: ros.roster_id,
                                    name: getOwnerName(ros.roster_id),
                                    teamName: rUser?.metadata?.team_name || '',
                                    avatar: rUser?.avatar || null,
                                    wins: s.wins || 0,
                                    losses: s.losses || 0,
                                    healthScore: hs,
                                    totalDhq,
                                    tier,
                                    isMe: ros.roster_id === myRid,
                                });
                            });
                            teamRankings.sort((a, b) => b.healthScore - a.healthScore);

                            // ── Insight cards ──
                            const insights = [];
                            const projMyAgeInsight = m.avgAge + (timeDelta || 0);
                            const ageDiff = projMyAgeInsight - w.avgAge;
                            if (Math.abs(ageDiff) > 0.3) {
                                insights.push({
                                    color: ageDiff > 0 ? badColor : goodColor,
                                    title: ageDiff > 0 ? 'Roster Running Older' : 'Youth Advantage',
                                    text: 'Your roster is ' + Math.abs(ageDiff).toFixed(1) + ' years ' + (ageDiff > 0 ? 'older' : 'younger') + ' than champion average (' + w.avgAge.toFixed(1) + ' yrs).' + (timeDelta ? ' (projected for ' + timeYear + ')' : ''),
                                });
                            }
                            const eliteDiff = mElite - wElite;
                            if (eliteDiff < -0.3) {
                                insights.push({
                                    color: badColor,
                                    title: 'Elite Player Deficit',
                                    text: 'You need ' + Math.abs(eliteDiff).toFixed(1) + ' more elite players (DHQ ' + Math.round(eliteThreshold).toLocaleString() + '+) to match winners.',
                                });
                            }
                            if (m.avgBenchQuality < w.avgBenchQuality * 0.75) {
                                insights.push({
                                    color: warnColor,
                                    title: 'Bench Depth Concern',
                                    text: 'Bench quality (' + numFmt(m.avgBenchQuality) + ') is significantly below winner benchmark (' + numFmt(w.avgBenchQuality) + ').',
                                });
                            }
                            if (m.avgTotalDHQ < w.avgTotalDHQ * 0.85) {
                                insights.push({
                                    color: badColor,
                                    title: 'Total Value Gap',
                                    text: 'Your total DHQ (' + numFmt(m.avgTotalDHQ) + ') trails winner average (' + numFmt(w.avgTotalDHQ) + ') by ' + Math.round((1 - m.avgTotalDHQ / w.avgTotalDHQ) * 100) + '%.',
                                });
                            }
                            if (compYears >= 3) {
                                insights.push({
                                    color: goodColor,
                                    title: 'Strong Compete Window',
                                    text: compYears + ' years remaining in your competitive window. Maximize with targeted upgrades.',
                                });
                            }

                            const gapsList = d.gaps || r.gaps || [];

                            // ── Roster Diagnosis Summary ──
                            const projMyAge = m.avgAge + (timeDelta || 0);
                            const projWAge = w.avgAge; // champion profile is historical, no projection needed
                            const ageDiffDiag = projMyAge - projWAge;
                            const eliteDiffDiag = mElite - wElite;
                            const dhqGap = m.avgTotalDHQ - w.avgTotalDHQ;
                            const benchGap = m.avgBenchQuality - w.avgBenchQuality;
                            const rosterStrategy = ageDiffDiag > 1.5 && dhqGap < 0 ? 'sell aging veterans and acquire young elites'
                                : eliteDiffDiag < -1 ? 'buy young elite players to close the talent gap'
                                : dhqGap >= 0 && ageDiffDiag <= 0.5 ? 'hold course — your roster matches the winner template'
                                : 'target strategic upgrades at your weakest positions';

                            return (
                            <React.Fragment>
                                {/* ── ROSTER DIAGNOSIS — Alex Ingram Slack-style ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Roster Diagnosis">
                                        {'Your roster' + (timeDelta ? ' (projected ' + timeYear + ')' : '') + ' is ' + Math.abs(ageDiffDiag).toFixed(1) + ' years ' + (ageDiffDiag > 0 ? 'older' : 'younger') + ' than champions (avg ' + w.avgAge.toFixed(1) + ' yrs). You have ' + (eliteDiffDiag >= 0 ? eliteDiffDiag.toFixed(1) + ' more' : Math.abs(eliteDiffDiag).toFixed(1) + ' fewer') + ' elite assets than winners. Total DHQ is ' + (dhqGap >= 0 ? '+' : '') + Math.round(dhqGap).toLocaleString() + ' vs champion avg. Bench quality: ' + numFmt(m.avgBenchQuality) + ' vs winner ' + numFmt(w.avgBenchQuality) + '. Strategy: ' + rosterStrategy + '.'}
                                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                                            React.createElement('button', { onClick: () => setActiveTab('trades'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Find Trade Targets'),
                                            React.createElement('button', { onClick: () => setActiveTab('fa'), style: { padding: '6px 14px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'View Free Agents')
                                        )}
                                    </GMMessage>
                                </div>

                                {/* ── TOP KPI CARDS ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                                    {/* Total DHQ */}
                                    <div style={kpiCardStyle}>
                                        <div style={kpiLabelStyle}>Total DHQ <span title="Dynasty Health Quotient — the total dynasty value of all players on your roster, measured by scoring, age, position scarcity, and production." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={kpiNumberStyle}>{(m.avgTotalDHQ || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                                        <div style={kpiDeltaStyle(m.avgTotalDHQ >= w.avgTotalDHQ)}>
                                            {m.avgTotalDHQ >= w.avgTotalDHQ ? '\u25B2' : '\u25BC'} {Math.abs(Math.round((m.avgTotalDHQ - l.avgTotalDHQ) / Math.max(l.avgTotalDHQ, 1) * 100))}% vs lg avg
                                        </div>
                                        <div style={{ marginTop: '8px' }}>
                                            {typeof Sparkline !== 'undefined' && projData.length >= 2 && React.createElement(Sparkline, { data: projData, width: 120, height: 28, color: m.avgTotalDHQ >= w.avgTotalDHQ ? goodColor : badColor })}
                                        </div>
                                    </div>
                                    {/* Health Score */}
                                    <div style={kpiCardStyle}>
                                        <div style={kpiLabelStyle}>Health Score <span title="0-100 composite score measuring roster balance, depth, age profile, and elite talent. Higher = more championship-ready." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={kpiNumberStyle}>{healthScore}</div>
                                            <div style={{ marginTop: '4px' }}>
                                                {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: healthScore, size: 48, thickness: 5 })}
                                            </div>
                                        </div>
                                        <div style={kpiDeltaStyle(healthDelta >= 0)}>
                                            {healthDelta >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(healthDelta)} vs winners
                                        </div>
                                    </div>
                                    {/* Elite Count */}
                                    <div style={kpiCardStyle}>
                                        <div style={kpiLabelStyle}>Elite Players <span title="Number of players on your roster with 7,000+ DHQ — league-winning caliber assets that anchor championship teams." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={kpiNumberStyle}>{mElite}</div>
                                        <div style={kpiDeltaStyle(mElite >= wElite)}>
                                            {mElite >= wElite ? '= ' : '\u25BC '}{mElite >= wElite ? 'above' : Math.abs(mElite - wElite).toFixed(1) + ' below'} winners ({wElite})
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.5, marginTop: '4px' }}>Threshold: {Math.round(eliteThreshold).toLocaleString()}+ DHQ</div>
                                    </div>
                                    {/* Compete Window */}
                                    <div style={kpiCardStyle}>
                                        <div style={kpiLabelStyle}>Compete Window <span title="Estimated years your roster can remain championship-competitive based on age curves, peak windows, and current DHQ trajectory." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={kpiNumberStyle}>{compYears}<span style={{ fontSize: '1rem', color: 'var(--silver)', marginLeft: '4px' }}>yr</span></div>
                                        <div style={kpiDeltaStyle(compYears >= 3)}>
                                            {compYears >= 3 ? '\u25B2 Strong' : compYears >= 1 ? '\u25AC Narrowing' : '\u25BC Rebuild mode'}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6, marginTop: '4px' }}>{compWindow.label || ''}</div>
                                    </div>
                                </div>

                                {/* ── TWO-COLUMN CHART GRID ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                    {/* Left: Position Investment BarChart */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>POSITION INVESTMENT</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Position investment shows what % of your total roster DHQ is allocated to each position. For example, "QB: 18%" means 18% of your total dynasty value is in QBs.</div>
                                        <div style={{ marginBottom: '12px' }}>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarWinnerItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.72rem' }}>
                                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners %</span>
                                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} Your %</span>
                                        </div>
                                    </div>

                                    {/* Right: Gap Analysis Visual Cards */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>GAP ANALYSIS</div>
                                        {gapsList.length === 0 && <div style={{ color: goodColor, fontSize: '0.9rem', padding: '12px 0' }}>Your roster matches the winner template closely.</div>}
                                        {gapsList.slice(0, 6).map((g, i) => {
                                            const sev = g.priority || g.severity || 'low';
                                            const sevBg = sev === 'high' || sev === 'critical' ? 'rgba(231,76,60,0.08)' : sev === 'medium' ? 'rgba(240,165,0,0.08)' : 'rgba(46,204,113,0.06)';
                                            return (
                                            <div key={i} style={{
                                                padding: '10px 14px', marginBottom: '8px',
                                                background: sevBg,
                                                borderLeft: '3px solid ' + sevColor(sev),
                                                borderRadius: '0 8px 8px 0',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ color: sevColor(sev), fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase' }}>
                                                        {g.action || g.area}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.65rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px',
                                                        borderRadius: '10px', background: sevColor(sev), color: 'var(--black)', fontWeight: 700,
                                                    }}>
                                                        {(sev).toUpperCase()}
                                                    </span>
                                                </div>
                                                <div style={{ color: 'var(--silver)', fontSize: '0.78rem', marginTop: '4px' }}>
                                                    {g.detail || (g.yours != null && g.winners != null
                                                        ? 'You: ' + (g.unit === '%' ? pctFmt(g.yours) : (typeof g.yours === 'number' ? Math.round(g.yours).toLocaleString() : g.yours) + (g.unit ? ' ' + g.unit : ' DHQ')) + ' → Winners: ' + (g.unit === '%' ? pctFmt(g.winners) : (typeof g.winners === 'number' ? Math.round(g.winners).toLocaleString() : g.winners) + (g.unit ? ' ' + g.unit : ' DHQ'))
                                                        : (g.unit === '%' ? pctFmt(g.yours) + ' (winners: ' + pctFmt(g.winners) + ')' : numFmt(g.yours) + ' ' + g.unit + ' (winners: ' + numFmt(g.winners) + ')'))}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── RADAR CHART: Position Balance ── */}
                                {Object.keys(radarValues).length >= 3 && (
                                <div style={{ ...aCardStyle, display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
                                    <div>
                                        <div style={aHeaderStyle}>POSITION BALANCE vs WINNERS</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '8px', lineHeight: 1.5 }}>100 = you invest 43% more than champions at that position. 70 = matched to champion allocation. Below 70 = underweight vs champions.</div>
                                    </div>
                                    <div style={{ margin: '0 auto' }}>
                                        {typeof RadarChart !== 'undefined' && React.createElement(RadarChart, { values: radarValues, size: 200, color: '#4ECDC4' })}
                                    </div>
                                </div>
                                )}

                                {/* ── PERFORMANCE RANKINGS TABLE ── */}
                                <div style={{ ...aCardStyle, marginBottom: '20px' }}>
                                    <div style={aHeaderStyle}>LEAGUE POWER RANKINGS</div>
                                    {/* Header row */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 0.7fr 80px 0.9fr 0.7fr', gap: '8px', padding: '8px 0', borderBottom: '2px solid rgba(212,175,55,0.2)', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Oswald, sans-serif' }}>
                                        <div>#</div><div>Team</div><div>Record</div><div>Health</div><div>Total DHQ</div><div>Tier</div>
                                    </div>
                                    {teamRankings.map((team, i) => {
                                        const tierUpper = (team.tier || '').toUpperCase();
                                        const tierBg = tierUpper === 'ELITE' ? '#D4AF37' : tierUpper === 'CONTENDER' ? goodColor : tierUpper === 'CROSSROADS' ? warnColor : tierUpper === 'REBUILDING' ? badColor : 'var(--silver)';
                                        return (
                                        <div key={team.rosterId} style={{
                                            display: 'grid', gridTemplateColumns: '36px 1.4fr 0.7fr 80px 0.9fr 0.7fr', gap: '8px', padding: '8px 0',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            background: team.isMe ? 'rgba(212,175,55,0.06)' : 'transparent',
                                            borderLeft: team.isMe ? '3px solid var(--gold)' : '3px solid transparent',
                                            paddingLeft: '4px',
                                        }}>
                                            <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.1rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)' }}>{i + 1}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {team.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + team.avatar} style={{ width:'24px', height:'24px', borderRadius:'50%', flexShrink:0 }} onError={e => e.target.style.display='none'} />}
                                                <div>
                                                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: team.isMe ? 'var(--gold)' : 'var(--white)', fontWeight: team.isMe ? 700 : 400 }}>
                                                        {team.name}{team.isMe ? ' (You)' : ''}
                                                    </div>
                                                    {team.teamName && <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.5 }}>{team.teamName}</div>}
                                                </div>
                                            </div>
                                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', color: 'var(--silver)' }}>{team.wins}-{team.losses}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: team.healthScore, size: 32, thickness: 3 })}
                                            </div>
                                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: 'var(--silver)' }}>
                                                {team.totalDhq.toLocaleString()}
                                                {/* Mini bar indicator */}
                                                <div style={{ height: '3px', marginTop: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: Math.min(100, Math.round(team.totalDhq / Math.max(teamRankings[0]?.totalDhq || 1, 1) * 100)) + '%', background: 'var(--gold)', opacity: 0.5, borderRadius: '2px' }} />
                                                </div>
                                            </div>
                                            <div>
                                                <span style={{
                                                    fontSize: '0.65rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px', borderRadius: '10px',
                                                    background: tierBg + '22', color: tierBg, border: '1px solid ' + tierBg + '44', fontWeight: 600,
                                                    whiteSpace: 'nowrap',
                                                }}>{team.tier || '\u2014'}</span>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>

                                {/* ── INSIGHT CARDS ── */}
                                {insights.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                                    {insights.map((ins, i) => (
                                        <div key={i} style={{
                                            background: 'rgba(26,26,26,0.8)', borderRadius: '10px', padding: '14px 16px',
                                            borderLeft: '4px solid ' + ins.color,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: ins.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                {ins.title}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>{ins.text}</div>
                                        </div>
                                    ))}
                                </div>
                                )}
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ DRAFT INTELLIGENCE ═══ */}
                        {analyticsTab === 'draft' && (() => {
                            const dr = d.draft;
                            if (!dr) return <div style={{ color: 'var(--silver)' }}>No draft data available.</div>;
                            const rounds = Object.keys(dr.winnerDraftProfile || {}).map(Number).sort((a, b) => a - b);
                            const S = window.S || window.App?.S;
                            const myRid = S?.myRosterId;
                            const draftOutcomes = (window.App?.LI || {}).draftOutcomes || [];
                            const myDraftProfile = {};
                            rounds.forEach(rd => {
                                const myPicks = draftOutcomes.filter(dp => dp.round === rd && dp.roster_id === myRid);
                                if (!myPicks.length) return;
                                const posCounts = {};
                                myPicks.forEach(dp => { const pos = dp.pos || 'UNK'; posCounts[pos] = (posCounts[pos] || 0) + 1; });
                                myDraftProfile[rd] = {};
                                Object.entries(posCounts).forEach(([pos, cnt]) => { myDraftProfile[rd][pos] = +(cnt / myPicks.length).toFixed(2); });
                            });
                            let totalHitDiff = 0;
                            let hitRounds = 0;
                            let winnerHitAvg = 0, leagueHitAvg = 0;
                            rounds.forEach(rd => {
                                const hr = dr.winnerHitRate[rd];
                                if (!hr) return;
                                totalHitDiff += (hr.winners - hr.league);
                                winnerHitAvg += hr.winners;
                                leagueHitAvg += hr.league;
                                hitRounds++;
                            });
                            const avgHitAdv = hitRounds > 0 ? totalHitDiff / hitRounds : 0;
                            winnerHitAvg = hitRounds > 0 ? winnerHitAvg / hitRounds : 0;
                            leagueHitAvg = hitRounds > 0 ? leagueHitAvg / hitRounds : 0;
                            const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'];
                            const gradeIdx = Math.min(grades.length - 1, Math.max(0, Math.round(4 - avgHitAdv * 20)));
                            const totalMyPicks = draftOutcomes.filter(dp => dp.roster_id === myRid).length;
                            // Compute top draft position for winners
                            const winnerTopPos = {};
                            rounds.forEach(rd => {
                                Object.entries(dr.winnerDraftProfile[rd] || {}).forEach(([pos, pct]) => {
                                    winnerTopPos[pos] = (winnerTopPos[pos] || 0) + pct;
                                });
                            });
                            const topDraftTarget = Object.entries(winnerTopPos).sort((a,b) => b[1] - a[1])[0];

                            // KPI card style
                            const dKpiCardStyle = {
                                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                                border: '1px solid rgba(212,175,55,0.25)',
                                borderRadius: '14px',
                                padding: '20px 18px 14px',
                                flex: '1 1 0',
                                minWidth: '140px',
                            };
                            const dKpiNum = { fontFamily: 'Bebas Neue, cursive', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
                            const dKpiLabel = { fontFamily: 'Oswald, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

                            // Build bar chart items for hit rate by round
                            const hitRateBarItems = rounds.filter(rd => dr.winnerHitRate[rd]).map(rd => ({
                                label: 'R' + rd,
                                value: Math.round((dr.winnerHitRate[rd].winners || 0) * 100),
                                color: goodColor,
                            }));
                            const hitRateLeagueItems = rounds.filter(rd => dr.winnerHitRate[rd]).map(rd => ({
                                label: 'R' + rd,
                                value: Math.round((dr.winnerHitRate[rd].league || 0) * 100),
                                color: 'rgba(192,192,192,0.6)',
                            }));

                            // ── Draft Strategy Summary ──
                            const myHitRates = {};
                            rounds.forEach(rd => {
                                const myPicks = draftOutcomes.filter(dp => dp.round === rd && dp.roster_id === myRid);
                                if (!myPicks.length) return;
                                const hits = myPicks.filter(dp => dp.isHit).length;
                                myHitRates[rd] = myPicks.length > 0 ? hits / myPicks.length : 0;
                            });
                            const myR1Hit = myHitRates[1] || 0;
                            const winnerR1Hit = (dr.winnerHitRate[1] || {}).winners || 0;
                            const topDraftPos = topDraftTarget ? topDraftTarget[0] : 'RB/WR';
                            const draftGradeLetter = grades[gradeIdx];

                            return (
                            <React.Fragment>
                                {/* ── DRAFT STRATEGY SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Draft Intelligence">
                                        {!dr.winnerHitRate || Object.keys(dr.winnerHitRate).length === 0
                                            ? 'Your upcoming draft picks and league draft intelligence. Target exciting prospects that fit your roster needs.'
                                            : totalMyPicks === 0
                                            ? 'No draft picks recorded for your team yet. Winners hit ' + Math.round(winnerR1Hit * 100) + '% on R1 picks in this league \u2014 prioritize ' + topDraftPos + ' in early rounds based on the winner template.'
                                            : 'Your draft grade: ' + draftGradeLetter + ' \u2014 ' + (gradeIdx <= 2 ? 'elite drafter, a real advantage' : gradeIdx <= 5 ? 'average, not a competitive edge' : 'below average, costing you roster value') + '. Winners hit ' + Math.round(winnerR1Hit * 100) + '% in R1 vs your ' + Math.round(myR1Hit * 100) + '%. Recommendation: prioritize ' + topDraftPos + ' in R1-R2 based on the winner template. ' + (totalMyPicks < 10 ? 'You have limited draft history \u2014 accumulate picks to build through the draft.' : 'Focus on hit rate over volume.')}
                                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                                            React.createElement('button', { onClick: () => setActiveTab('draft'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Draft Board')
                                        )}
                                    </GMMessage>
                                </div>

                                {/* ── TOP KPI CARDS ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                                    <div style={dKpiCardStyle}>
                                        <div style={dKpiLabel}>Draft Grade <span title="Letter grade comparing your draft hit rate to the league average. A+ = elite drafter, C = average, D = below average and costing roster value." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={{ ...dKpiNum, fontSize: '2.8rem', color: gradeIdx <= 2 ? goodColor : gradeIdx <= 5 ? warnColor : badColor }}>{grades[gradeIdx]}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Based on hit rate advantage</div>
                                    </div>
                                    <div style={dKpiCardStyle}>
                                        <div style={dKpiLabel}>Winner Hit Rate <span title="% of draft picks by championship teams that became starter-quality players. Higher = better draft scouting by winners." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={dKpiNum}>{pctFmt(winnerHitAvg)}</div>
                                        <div style={{ fontSize: '0.72rem', color: goodColor, fontFamily: 'Oswald, sans-serif' }}>
                                            +{Math.round(avgHitAdv * 100)}% vs league ({pctFmt(leagueHitAvg)})
                                        </div>
                                    </div>
                                    <div style={dKpiCardStyle}>
                                        <div style={dKpiLabel}>Your Draft Picks <span title="Total number of draft picks your team has made across all recorded drafts in this league." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={dKpiNum}>{totalMyPicks || '\u2014'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Across {rounds.length} rounds</div>
                                    </div>
                                    <div style={dKpiCardStyle}>
                                        <div style={dKpiLabel}>Champions Draft <span title="The position that championship-winning teams draft most frequently across all rounds." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={dKpiNum}>{topDraftTarget ? topDraftTarget[0] : '\u2014'}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7 }}>Most picked position by championship teams</div>
                                    </div>
                                </div>

                                {/* ── TWO-COLUMN: Hit Rates + Draft Formula ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                    {/* Hit Rates as BarChart */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>HIT RATES BY ROUND</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Hit rate = % of picks at each round that became starter-quality players (top of their position group). Higher hit rate = better draft scouting.</div>
                                        <div style={{ marginBottom: '10px' }}>
                                            <div style={{ fontSize: '0.7rem', color: goodColor, fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: hitRateBarItems, width: 340, height: 18, gap: 4 })}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>League Avg</div>
                                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: hitRateLeagueItems, width: 340, height: 18, gap: 4 })}
                                        </div>
                                    </div>

                                    {/* Draft Formula */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>WINNING DRAFT FORMULA</div>
                                        {rounds.map(rd => {
                                            const wProf = dr.winnerDraftProfile[rd] || {};
                                            const myProf = myDraftProfile[rd] || {};
                                            const sorted = Object.entries(wProf).sort((a, b) => b[1] - a[1]);
                                            return (
                                            <div key={rd} style={{ marginBottom: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1rem', color: 'var(--gold)', minWidth: '65px' }}>Round {rd}</span>
                                                    <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {sorted.map(([pos, pct]) => (
                                                            <span key={pos} style={{
                                                                fontSize: '0.72rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px',
                                                                borderRadius: '10px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)',
                                                                border: '1px solid rgba(212,175,55,0.25)',
                                                            }}>{pos} {pctFmt(pct)}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {Object.keys(myProf).length > 0 && (
                                                    <div style={{ marginLeft: '65px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                        {Object.entries(myProf).sort((a, b) => b[1] - a[1]).map(([pos, pct]) => (
                                                            <span key={pos} style={{
                                                                fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '1px 6px',
                                                                borderRadius: '8px', background: 'rgba(78,205,196,0.1)', color: '#4ECDC4',
                                                                border: '1px solid rgba(78,205,196,0.2)',
                                                            }}>{pos} {pctFmt(pct)}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            );
                                        })}
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.7rem' }}>
                                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners</span>
                                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ WAIVER INTELLIGENCE ═══ */}
                        {analyticsTab === 'waivers' && (() => {
                            const wv = d.waivers;
                            if (!wv) return <div style={{ color: 'var(--silver)' }}>No waiver data available.</div>;
                            const positions = [...new Set([...Object.keys(wv.winnerFaabProfile || {}), ...Object.keys(wv.leagueFaabProfile || {})])].filter(p => p !== 'UNK').sort();
                            // Get user's FAAB data (approximation from ownerProfiles)
                            const S = window.S || window.App?.S;
                            const LI = window.App?.LI || {};
                            const myRid = S?.myRosterId;
                            const myOwnerProf = (LI.ownerProfiles || {})[myRid] || {};
                            const myTiming = myOwnerProf.weekTiming || {};
                            const myTimingTotal = (myTiming.early || 0) + (myTiming.mid || 0) + (myTiming.late || 0) || 1;
                            const myTimingPcts = {
                                early: ((myTiming.early || 0) / myTimingTotal).toFixed(2),
                                mid: ((myTiming.mid || 0) / myTimingTotal).toFixed(2),
                                late: ((myTiming.late || 0) / myTimingTotal).toFixed(2),
                            };

                            // ── Waiver Strategy Summary ──
                            const winnerFaab = wv.winnerFaabProfile || {};
                            const leagueFaab = wv.leagueFaabProfile || {};
                            const underSpendPos = positions.filter(pos => {
                                const wAvg = (winnerFaab[pos] || {}).avg || 0;
                                const lAvg = (leagueFaab[pos] || {}).avg || 0;
                                return wAvg > lAvg * 1.2;
                            });
                            const topUnderSpend = underSpendPos.length > 0 ? underSpendPos.join(', ') : 'all positions';
                            const winnerEarlyPct = Math.round((wv.winnerTiming?.early || 0) * 100);
                            const myEarlyPct = Math.round((parseFloat(myTimingPcts.early) || 0) * 100);

                            return (
                            <React.Fragment>
                                {/* ── WAIVER STRATEGY SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Waiver Intelligence">
                                        {winnerEarlyPct === 0 && myEarlyPct === 0
                                            ? 'No significant FAAB activity yet this season. Monitor early-season pickups closely \u2014 winners typically front-load spending on high-upside ' + (underSpendPos[0] || 'RB/WR') + ' to build early advantages.'
                                            : (winnerEarlyPct >= 20 ? 'Winners spend aggressively on ' + topUnderSpend + ' early in the season. ' : 'Winners invest in ' + topUnderSpend + ' early in the season. ') + 'They spend ' + winnerEarlyPct + '% of FAAB budget spent in weeks 1-6 vs your ' + myEarlyPct + '% of FAAB budget spent in weeks 1-6. ' + (myEarlyPct < winnerEarlyPct - 10 ? 'You are under-spending early \u2014 front-load your FAAB to capture impact players before your competition.' : 'Your spending timing aligns well with winners.') + ' Focus waiver claims on high-upside ' + (underSpendPos[0] || 'RB/WR') + ' to maximize roster value.'}
                                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                                            React.createElement('button', { onClick: () => setActiveTab('fa'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'View Waiver Targets')
                                        )}
                                    </GMMessage>
                                </div>

                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>WINNER FAAB PROFILE</div>
                                    <div style={{ ...tableRowStyle(0) }}>
                                        <div>Position</div><div>Winner Avg</div><div>League Avg</div><div>W vs L</div>
                                    </div>
                                    {positions.map((pos, i) => {
                                        const wAvg = (wv.winnerFaabProfile[pos] || {}).avg || 0;
                                        const lAvg = (wv.leagueFaabProfile[pos] || {}).avg || 0;
                                        const diff = lAvg > 0 ? ((wAvg - lAvg) / lAvg * 100).toFixed(0) : (wAvg > 0 ? '+\u221E' : '\u2014');
                                        return (
                                        <div key={pos} style={{ ...tableRowStyle(1), ...aValStyle }}>
                                            <div style={{ color: 'var(--silver)' }}>{pos}</div>
                                            <div style={{ color: 'var(--gold)' }}>${wAvg.toFixed(0)}</div>
                                            <div>${lAvg.toFixed(0)}</div>
                                            <div style={{ color: wAvg > lAvg ? goodColor : wAvg < lAvg ? badColor : 'var(--silver)' }}>{typeof diff === 'string' ? diff : (diff > 0 ? '+' + diff + '%' : diff + '%')}</div>
                                        </div>
                                        );
                                    })}
                                </div>

                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>SPENDING TIMING</div>
                                    {[
                                        { label: 'Winners', data: wv.winnerTiming, color: 'var(--gold)' },
                                        { label: 'League', data: wv.leagueTiming, color: 'var(--silver)' },
                                        { label: 'You', data: myTimingPcts, color: '#4ECDC4' },
                                    ].map(({ label, data, color }) => (
                                        <div key={label} style={{ marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.85rem', color }}>
                                                <span style={{ fontWeight: 700 }}>{label}</span>
                                                <span>{pctFmt(data.early)} early / {pctFmt(data.mid)} mid / {pctFmt(data.late)} late</span>
                                            </div>
                                            <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: pctFmt(data.early), background: goodColor, opacity: 0.7 }} />
                                                <div style={{ width: pctFmt(data.mid), background: warnColor, opacity: 0.7 }} />
                                                <div style={{ width: pctFmt(data.late), background: badColor, opacity: 0.7 }} />
                                            </div>
                                        </div>
                                    ))}
                                    {wv.winnerTiming.early > (parseFloat(myTimingPcts.early) || 0) + 0.15 && (
                                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(240,165,0,0.1)', borderRadius: '8px', borderLeft: '3px solid ' + warnColor }}>
                                            <span style={{ color: warnColor, fontWeight: 700, fontSize: '0.85rem' }}>{'\u26A0\uFE0F'} Winners front-load spending {'\u2014'} you spread too evenly</span>
                                        </div>
                                    )}
                                </div>

                                {wv.faabEfficiency && (
                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>FAAB EFFICIENCY (DHQ per $)</div>
                                    <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '16px' }}>
                                        {[{ label: 'Winners', val: wv.faabEfficiency.winners, color: 'var(--gold)' }, { label: 'League', val: wv.faabEfficiency.league, color: 'var(--silver)' }].map(({ label, val, color }) => (
                                            <div key={label} style={{ textAlign: 'center' }}>
                                                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '2rem', color }}>{val}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {wv.faabEffByPos && Object.keys(wv.faabEffByPos).length > 0 && (
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', borderTop: '1px solid rgba(212,175,55,0.15)', paddingTop: '12px' }}>By Position</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Oswald, sans-serif' }}>
                                            <div>Position</div><div>Avg Bid</div><div>DHQ Return</div><div>DHQ per $</div>
                                        </div>
                                        {Object.entries(wv.faabEffByPos).sort((a,b) => (b[1].dhqPerDollar || 0) - (a[1].dhqPerDollar || 0)).map(([pos, data]) => (
                                            <div key={pos} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem' }}>
                                                <div style={{ color: 'var(--silver)' }}>{pos}</div>
                                                <div style={{ color: 'var(--white)' }}>${(data.avgBid || 0).toFixed(0)}</div>
                                                <div style={{ color: 'var(--white)' }}>{(data.dhqReturn || 0).toLocaleString()}</div>
                                                <div style={{ color: (data.dhqPerDollar || 0) >= (wv.faabEfficiency?.winners || 0) ? goodColor : warnColor, fontWeight: 700 }}>{(data.dhqPerDollar || 0).toFixed(1)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    )}
                                </div>
                                )}
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ TRADE INTELLIGENCE ═══ */}
                        {analyticsTab === 'trades' && (() => {
                            const tr = d.trades;
                            if (!tr) return <div style={{ color: 'var(--silver)' }}>No trade data available.</div>;
                            const wp = tr.winnerTradeProfile;
                            const lp = tr.leagueTradeProfile;
                            const mp = tr.myTradeProfile;
                            const topPosBought = (prof) => {
                                const entries = Object.entries(prof.positionsBought || {}).sort((a, b) => b[1] - a[1]);
                                return entries.slice(0, 3).map(([p]) => p).join(', ') || '\u2014';
                            };
                            const alerts = [];
                            if (mp.avgTradesPerSeason < lp.avgTradesPerSeason) alerts.push({ sev: 'medium', title: 'Low Trade Volume', msg: 'You trade below league average (' + mp.avgTradesPerSeason + ' vs ' + lp.avgTradesPerSeason + ' per season). Winners average ' + wp.avgTradesPerSeason + '.' });
                            if (mp.avgValueGained < 0) alerts.push({ sev: 'high', title: 'Losing Value', msg: 'You\'re losing ' + Math.abs(mp.avgValueGained) + ' DHQ per trade on average. Winners gain +' + wp.avgValueGained + '.' });
                            if (wp.partnerPreference && wp.partnerPreference !== mp.partnerPreference) alerts.push({ sev: 'low', title: 'Trade Partner Strategy', msg: 'Winners target ' + wp.partnerPreference + ' teams. You trade with ' + mp.partnerPreference + ' teams.' });
                            if (mp.avgValueGained >= 0) alerts.push({ sev: 'low', title: 'Positive Value', msg: 'You gain +' + mp.avgValueGained + ' DHQ per trade. Keep extracting surplus in deals.' });

                            // Build position bought bar chart items
                            const allBoughtPos = [...new Set([...Object.keys(wp.positionsBought || {}), ...Object.keys(mp.positionsBought || {})])].filter(p => p !== 'UNK').sort();
                            const boughtBarWinner = allBoughtPos.map(pos => ({ label: pos, value: (wp.positionsBought || {})[pos] || 0, color: CHART_COLORS?.gold || '#D4AF37' }));
                            const boughtBarYou = allBoughtPos.map(pos => ({ label: pos, value: (mp.positionsBought || {})[pos] || 0, color: '#4ECDC4' }));

                            // KPI card style
                            const tKpiCardStyle = {
                                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                                border: '1px solid rgba(212,175,55,0.25)',
                                borderRadius: '14px',
                                padding: '20px 18px 14px',
                                flex: '1 1 0',
                                minWidth: '140px',
                            };
                            const tKpiNum = { fontFamily: 'Bebas Neue, cursive', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
                            const tKpiLabel = { fontFamily: 'Oswald, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

                            const valueDeltaColor = mp.avgValueGained >= 0 ? goodColor : badColor;

                            // ── Trade Strategy Summary ──
                            const tradeVolDiff = mp.avgTradesPerSeason - wp.avgTradesPerSeason;
                            const hasTraded = mp.avgTradesPerSeason > 0;
                            const tradeEfficiency = !hasTraded ? '' : mp.avgValueGained >= 0 ? 'trading efficiently' : 'over-paying in trades';
                            const tradeActivity = !hasTraded ? '' : tradeVolDiff < -1 ? 'under-trading' : tradeVolDiff > 1 ? 'over-trading' : 'trading at the right frequency';

                            const tradeSummaryText = !hasTraded
                                ? 'You haven\u2019t made any trades yet. Active trading is a key trait of winning teams \u2014 winners average ' + wp.avgTradesPerSeason + ' trades/season and gain +' + wp.avgValueGained + ' DHQ per trade. Consider using the trade finder to identify value opportunities.'
                                : 'You average ' + mp.avgTradesPerSeason + ' trades/season vs winners\u2019 ' + wp.avgTradesPerSeason + '. You ' + (mp.avgValueGained >= 0 ? 'gain +' : 'lose ') + Math.abs(mp.avgValueGained) + ' DHQ per trade (winners: +' + wp.avgValueGained + '). You are ' + tradeActivity + ' and ' + tradeEfficiency + '. ' + (mp.avgValueGained < 0 ? 'Focus on extracting value \u2014 target aging stars from contenders or sell depreciating assets.' : 'Keep leveraging your trade edge to consolidate elite talent.');

                            return (
                            <React.Fragment>
                                {/* ── TRADE STRATEGY SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Trade Intelligence">
                                        {tradeSummaryText}
                                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                                            React.createElement('button', { onClick: () => { setTradeSubTab('finder'); setActiveTab('trades'); }, style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Trade Finder')
                                        )}
                                    </GMMessage>
                                </div>

                                {/* ── TOP KPI CARDS ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                                    <div style={tKpiCardStyle}>
                                        <div style={tKpiLabel}>Your Trades/Season <span title="Average number of trades you make per season. Includes player-for-player swaps, pick trades, and multi-asset deals." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={tKpiNum}>{mp.avgTradesPerSeason}</div>
                                        <div style={{ fontSize: '0.72rem', color: mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? goodColor : warnColor, fontFamily: 'Oswald, sans-serif' }}>
                                            {mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? '\u25B2' : '\u25BC'} League avg: {lp.avgTradesPerSeason}
                                        </div>
                                    </div>
                                    <div style={tKpiCardStyle}>
                                        <div style={tKpiLabel}>Avg DHQ Gained <span title="Average net DHQ value gained or lost per trade. Positive = you extract value. Negative = you overpay in trades." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={{ ...tKpiNum, color: valueDeltaColor }}>{(mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif' }}>
                                            Winners: +{wp.avgValueGained}
                                        </div>
                                    </div>
                                    <div style={tKpiCardStyle}>
                                        <div style={tKpiLabel}>Winner Volume <span title="Average number of trades per season made by championship-winning teams in this league." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={tKpiNum}>{wp.avgTradesPerSeason}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>trades per season</div>
                                    </div>
                                    <div style={tKpiCardStyle}>
                                        <div style={tKpiLabel}>Top Positions Bought <span title="The positions that championship teams acquire most frequently via trade — shows what winners prioritize in deals." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                                        <div style={{ ...tKpiNum, fontSize: '1.6rem' }}>{topPosBought(wp)}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7 }}>Positions champions acquire most via trade</div>
                                    </div>
                                </div>

                                {/* ── TWO-COLUMN: Position Bought + Trade Profile Table ── */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                    {/* Positions Bought BarChart */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>POSITIONS ACQUIRED VIA TRADE</div>
                                        {allBoughtPos.length > 0 ? (
                                        <React.Fragment>
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarWinner, width: 340, height: 18, gap: 4 })}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarYou, width: 340, height: 18, gap: 4 })}
                                            </div>
                                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.7rem' }}>
                                                <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners</span>
                                                <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                                            </div>
                                        </React.Fragment>
                                        ) : <div style={{ color: 'var(--silver)', fontSize: '0.85rem', opacity: 0.6 }}>No position data available</div>}
                                    </div>

                                    {/* Trade Comparison Table */}
                                    <div style={aCardStyle}>
                                        <div style={aHeaderStyle}>TRADE COMPARISON</div>
                                        {/* Header */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid rgba(212,175,55,0.2)', fontFamily: 'Oswald, sans-serif' }}>
                                            <div>Metric</div><div>Winners</div><div>League</div><div>You</div>
                                        </div>
                                        {[
                                            ['Trades/Season', wp.avgTradesPerSeason, lp.avgTradesPerSeason, mp.avgTradesPerSeason],
                                            ['Avg DHQ Gained', (wp.avgValueGained >= 0 ? '+' : '') + wp.avgValueGained, (lp.avgValueGained >= 0 ? '+' : '') + lp.avgValueGained, (mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained],
                                            ['Top Bought', topPosBought(wp), topPosBought(lp), topPosBought(mp)],
                                            ['Partner Pref.', wp.partnerPreference || '\u2014', lp.partnerPreference || '\u2014', mp.partnerPreference || '\u2014'],
                                        ].map(([label, wVal, lVal, mVal], i) => (
                                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem' }}>
                                                <div style={{ color: 'var(--silver)' }}>{label}</div>
                                                <div style={{ color: 'var(--gold)' }}>{wVal}</div>
                                                <div style={{ color: 'var(--silver)', opacity: 0.7 }}>{lVal}</div>
                                                <div style={{ color: 'var(--white)' }}>{mVal}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ── YOUR LAST 5 TRADES ── */}
                                {tr.myLast5 && tr.myLast5.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Your Recent Trade Performance">
                                        {tr.myLast5.map((trade, i) => {
                                            const netDhq = trade.netDhq || 0;
                                            const result = netDhq > 200 ? 'Won' : netDhq < -200 ? 'Lost' : 'Fair';
                                            const resultColor = result === 'Won' ? goodColor : result === 'Lost' ? badColor : warnColor;
                                            return (
                                                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif' }}>S{trade.season || '?'} W{trade.week || '?'}</span>
                                                        <span style={{ fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px', borderRadius: '10px', background: resultColor + '22', color: resultColor, border: '1px solid ' + resultColor + '44', fontWeight: 700 }}>{result}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif' }}>
                                                        {(trade.gave || []).join(', ') || 'Unknown'} <span style={{ color: 'var(--gold)', margin: '0 4px' }}>{'\u2192'}</span> {(trade.got || []).join(', ') || 'Unknown'}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', fontFamily: 'Oswald, sans-serif', color: netDhq >= 0 ? goodColor : badColor, fontWeight: 700 }}>
                                                        {netDhq >= 0 ? '+' : ''}{netDhq.toLocaleString()} DHQ
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </GMMessage>
                                </div>
                                )}

                                {/* ── INSIGHT CARDS ROW ── */}
                                {alerts.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                                    {alerts.map((a, i) => (
                                        <div key={i} style={{
                                            background: 'rgba(26,26,26,0.8)', borderRadius: '10px', padding: '14px 16px',
                                            borderLeft: '4px solid ' + sevColor(a.sev),
                                            border: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: sevColor(a.sev), marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                {a.title}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>{a.msg}</div>
                                        </div>
                                    ))}
                                </div>
                                )}
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ PROJECTIONS ═══ */}
                        {analyticsTab === 'projections' && (() => {
                            const proj = d.projection;
                            const win = d.window;
                            if (!proj || !proj.length) return <div style={{ color: 'var(--silver)' }}>No projection data available.</div>;
                            const maxDHQ = Math.max(...proj.map(p => p.projectedDHQ), 1);
                            const tierColor = (tier) => tier === 'Contender' ? goodColor : tier === 'Playoff Team' ? warnColor : badColor;

                            // Aging cliff analysis
                            const S = window.S || window.App?.S;
                            const LI = window.App?.LI || {};
                            const playerScores = LI.playerScores || {};
                            const playerMeta = LI.playerMeta || {};
                            const peakWindows = window.App?.peakWindows || { QB: [24, 34], RB: [22, 27], WR: [22, 30], TE: [23, 30] };
                            const myRid = S?.myRosterId;
                            const myRosterObj = (S?.rosters || []).find(r => r.roster_id === myRid);
                            const myPlayers = myRosterObj?.players || [];
                            let totalDHQ = 0;
                            let atRiskDHQ = 0;
                            const atRiskPlayers = [];
                            myPlayers.forEach(pid => {
                                const dhq = playerScores[pid] || 0;
                                const meta = playerMeta[pid] || {};
                                totalDHQ += dhq;
                                if (!meta.age || !meta.pos) return;
                                const peakEnd = (peakWindows[meta.pos] || [23, 29])[1];
                                if (meta.age + 2 > peakEnd && dhq >= 2000) {
                                    atRiskDHQ += dhq;
                                    atRiskPlayers.push({ name: playersData[pid]?.full_name || S?.players?.[pid]?.full_name || meta.name || ('Player ' + pid), age: meta.age, dhq });
                                }
                            });
                            const atRiskPct = totalDHQ > 0 ? Math.round(atRiskDHQ / totalDHQ * 100) : 0;
                            atRiskPlayers.sort((a, b) => b.dhq - a.dhq);

                            // ── Future Outlook Summary ──
                            const projTrend = proj.length >= 2 ? proj[proj.length - 1].projectedDHQ - proj[0].projectedDHQ : 0;
                            const currentTier = proj[0]?.tier || 'Unknown';
                            const windowYears = win?.years || 0;
                            const outlook = projTrend > 500 ? 'building momentum' : projTrend < -500 ? 'in decline' : currentTier === 'Contender' ? 'peaking now' : 'stable but not gaining ground';
                            const projStrategy = windowYears >= 3 ? 'maximize now — push all-in for a championship'
                                : windowYears >= 1 ? 'begin transition — sell aging assets while competitive'
                                : 'commit to rebuild — trade veterans for young talent and picks';

                            return (
                            <React.Fragment>
                                {/* ── FUTURE OUTLOOK SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Future Outlook">
                                        {'Your roster is ' + outlook + '. Competitive window: ' + (windowYears > 0 ? windowYears + ' year' + (windowYears > 1 ? 's' : '') : 'closed') + '. ' + atRiskPct + '% of your DHQ is past peak in 2 years' + (atRiskPlayers.length > 0 ? ' (' + atRiskPlayers.slice(0, 3).map(p => p.name).join(', ') + ')' : '') + '. Strategy: ' + projStrategy + '.'}
                                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                                            React.createElement('button', { onClick: () => setActiveTab('trades'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Find Trade Candidates')
                                        )}
                                    </GMMessage>
                                </div>

                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>YOUR 5-YEAR OUTLOOK</div>
                                    {proj.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            <span style={{ color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', minWidth: '40px', fontSize: '0.9rem' }}>{p.year}</span>
                                            <div style={{ flex: 1, position: 'relative', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: (p.projectedDHQ / maxDHQ * 100) + '%', background: tierColor(p.tier), borderRadius: '6px', opacity: 0.6, transition: 'width 0.5s ease' }} />
                                                <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', fontFamily: 'Oswald, sans-serif', color: 'var(--white)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                    {p.projectedDHQ.toLocaleString()} DHQ
                                                </div>
                                            </div>
                                            <span style={{ color: tierColor(p.tier), fontFamily: 'Oswald, sans-serif', fontSize: '0.8rem', minWidth: '90px', textAlign: 'right' }}>
                                                {p.tier} {p.tier === 'Rebuilding' || p.tier === 'Deep Rebuild' ? '\uD83D\uDD34' : p.tier === 'Playoff Team' ? '\u26A0\uFE0F' : ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {win && (
                                <div style={{ ...aCardStyle, textAlign: 'center', padding: '24px' }}>
                                    <div style={{ fontFamily: 'Bebas Neue, cursive', color: 'var(--silver)', fontSize: '1rem', marginBottom: '4px' }}>COMPETITIVE WINDOW</div>
                                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.5rem', color: win.years >= 3 ? goodColor : win.years >= 1 ? warnColor : badColor }}>{win.label}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--silver)', marginTop: '4px' }}>{win.years > 0 ? win.years + ' year' + (win.years > 1 ? 's' : '') + ' remaining' : 'Consider rebuilding'}</div>
                                </div>
                                )}

                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>AGING CLIFF ALERT</div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Players within 2 years of their position's peak-end age with 2000+ DHQ value. These are your highest-risk assets for dynasty value decline.</div>
                                    <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '2rem', color: atRiskPct > 30 ? badColor : atRiskPct > 15 ? warnColor : goodColor }}>{atRiskPct}%</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>Your DHQ past peak by {(parseInt(S?.season) || 2026) + 2}</div>
                                        </div>
                                        <div style={{ textAlign: 'center' }}>
                                            {(() => {
                                                // Compute league-wide avg at-risk %
                                                let lgTotal = 0, lgAtRisk = 0;
                                                (S?.rosters || []).forEach(r => {
                                                    (r.players || []).forEach(pid => {
                                                        const d = playerScores[pid] || 0;
                                                        const m = playerMeta[pid] || {};
                                                        lgTotal += d;
                                                        if (m.age && m.pos) {
                                                            const pe = (peakWindows[m.pos] || [23,29])[1];
                                                            if (m.age + 2 > pe && d >= 2000) lgAtRisk += d;
                                                        }
                                                    });
                                                });
                                                const lgPct = lgTotal > 0 ? Math.round(lgAtRisk / lgTotal * 100) : 0;
                                                return <>
                                                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '2rem', color: 'var(--gold)' }}>{lgPct}%</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>League avg</div>
                                                </>;
                                            })()}
                                        </div>
                                    </div>
                                    {atRiskPlayers.length > 0 && (
                                        <div>
                                            <div style={{ color: 'var(--silver)', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 700 }}>Players at risk:</div>
                                            {atRiskPlayers.slice(0, 5).map((p, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif' }}>
                                                    <span style={{ color: 'var(--silver)' }}>{p.name} ({p.age})</span>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ color: badColor }}>{p.dhq.toLocaleString()} DHQ</span>
                                                        <span style={{ padding: '2px 8px', background: 'rgba(231,76,60,0.15)', color: badColor, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>TRADE NOW</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actionable recommendations */}
                                {((d.gaps || []).length > 0 || atRiskPlayers.length > 0) && (
                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>TO EXTEND YOUR WINDOW</div>
                                    {atRiskPlayers.length > 0 && (
                                        <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.08)', borderLeft: '3px solid ' + badColor, borderRadius: '0 8px 8px 0' }}>
                                            <div style={{ color: badColor, fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', marginBottom: '4px' }}>Priority: Trade aging assets while value remains</div>
                                            {atRiskPlayers.slice(0, 2).map((p, i) => (
                                                <div key={i} style={{ color: 'var(--silver)', fontSize: '0.82rem', marginTop: '4px' }}>
                                                    {'Trade ' + p.name + ' (age ' + p.age + ', ' + p.dhq.toLocaleString() + ' DHQ) — sell window closing soon'}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {(d.gaps || []).slice(0, 5).map((g, i) => (
                                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                            <span style={{ color: sevColor(g.priority), fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{i + 1}.</span>
                                            <div>
                                                <span style={{ fontSize: '1rem', marginRight: '6px' }}>{sevIcon(g.priority)}</span>
                                                <span style={{ color: sevColor(g.priority), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif' }}>{g.action}</span>
                                                <div style={{ color: 'var(--silver)', fontSize: '0.8rem', marginTop: '2px' }}>{g.detail}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                )}
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ PLAYOFF HISTORY ═══ */}
                        {analyticsTab === 'playoffs' && (() => {
                            const championships = window.App?.LI?.championships || {};
                            const seasons = Object.entries(championships).sort(([a],[b]) => b.localeCompare(a));
                            if (!seasons.length) return <div style={{ ...aCardStyle, color: 'var(--silver)', textAlign: 'center', padding: '40px' }}>No championship history available yet.</div>;

                            // ── Playoff Profile Summary ──
                            const myRidP = myRoster?.roster_id;
                            let myChampionships = 0, myRunnerUps = 0;
                            seasons.forEach(([season, data]) => {
                                if (data.champion === myRidP) myChampionships++;
                                if (data.runnerUp === myRidP) myRunnerUps++;
                            });
                            const myPlayoffAppearances = myChampionships + myRunnerUps;
                            const playoffDiag = myChampionships > 0
                                ? 'You have ' + myChampionships + ' championship' + (myChampionships > 1 ? 's' : '') + ' in ' + seasons.length + ' seasons.'
                                : myRunnerUps > 0
                                ? 'You have reached ' + myRunnerUps + ' final' + (myRunnerUps > 1 ? 's' : '') + ' but no championships in ' + seasons.length + ' seasons.'
                                : 'You haven\'t reached the finals recently.';
                            const playoffInsight = myRunnerUps > myChampionships && myRunnerUps > 0
                                ? ' You struggle to close out championship matchups — consider roster upgrades at key playoff positions.'
                                : myPlayoffAppearances === 0
                                ? ' Focus on building a contender before worrying about playoff optimization.'
                                : ' Your playoff track record is solid. Maintain your competitive edge.';

                            return (
                            <React.Fragment>
                                {/* ── PLAYOFF PROFILE SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="Playoff Profile">
                                        {playoffDiag + playoffInsight}
                                    </GMMessage>
                                </div>

                                <div style={aCardStyle}>
                                    <div style={aHeaderStyle}>PLAYOFF HISTORY</div>
                                    {seasons.map(([season, data]) => {
                                        const champName = getOwnerName(data.champion);
                                        const runnerName = getOwnerName(data.runnerUp);
                                        const isMyChamp = data.champion === myRoster?.roster_id;
                                        const isMyRunner = data.runnerUp === myRoster?.roster_id;
                                        const champRoster = currentLeague.rosters?.find(r => r.roster_id === data.champion);
                                        const champUser = currentLeague.users?.find(u => u.user_id === champRoster?.owner_id);
                                        const runnerRoster = currentLeague.rosters?.find(r => r.roster_id === data.runnerUp);
                                        const runnerUser = currentLeague.users?.find(u => u.user_id === runnerRoster?.owner_id);
                                        return (
                                            <div key={season} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', minWidth: '40px' }}>{season}</span>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: isMyChamp ? 'var(--gold)' : 'var(--white)', fontWeight: isMyChamp ? 700 : 400 }}>
                                                        {champUser?.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + champUser.avatar} style={{ width:'20px', height:'20px', borderRadius:'50%' }} onError={e => e.target.style.display='none'} />}
                                                        Champion: {champName}{champUser?.metadata?.team_name ? ' (' + champUser.metadata.team_name + ')' : ''}{isMyChamp ? ' (You!)' : ''}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--silver)' }}>
                                                        {runnerUser?.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + runnerUser.avatar} style={{ width:'20px', height:'20px', borderRadius:'50%' }} onError={e => e.target.style.display='none'} />}
                                                        Runner-up: {runnerName}{isMyRunner ? ' (You)' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* ── FULL BRACKET DISPLAY ── */}
                                {(() => {
                                    const bracketData = window.App?.LI?.bracketData;
                                    if (!bracketData || !Object.keys(bracketData).length) return null;
                                    const bracketSeasons = Object.entries(bracketData).sort(([a],[b]) => b.localeCompare(a));
                                    return (
                                        <div style={aCardStyle}>
                                            <div style={aHeaderStyle}>PLAYOFF BRACKETS</div>
                                            {bracketSeasons.map(([season, sData]) => {
                                                const brackets = [
                                                    { key: 'winners', label: 'Winners Bracket', data: sData.winners || sData.w || [] },
                                                    { key: 'losers', label: 'Losers Bracket', data: sData.losers || sData.l || [] },
                                                ];
                                                return (
                                                    <div key={season} style={{ marginBottom: '20px' }}>
                                                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '8px' }}>{season} Playoffs</div>
                                                        {brackets.map(b => {
                                                            if (!b.data || !b.data.length) return null;
                                                            return (
                                                                <div key={b.key} style={{ marginBottom: '12px' }}>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{b.label}</div>
                                                                    {b.data.map((matchup, mi) => {
                                                                        const t1 = matchup.t1 || matchup.team1;
                                                                        const t2 = matchup.t2 || matchup.team2;
                                                                        const w = matchup.w || matchup.winner;
                                                                        const roundLabel = matchup.round === 1 ? 'Championship' : matchup.round === 2 ? 'Semi-finals' : 'Quarter-finals';
                                                                        const isMyGame = t1 === myRidP || t2 === myRidP;
                                                                        return (
                                                                            <div key={mi} style={{
                                                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginBottom: '4px',
                                                                                background: isMyGame ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                                                                                borderLeft: isMyGame ? '3px solid var(--gold)' : '3px solid transparent',
                                                                                borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'Oswald, sans-serif',
                                                                            }}>
                                                                                <span style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, minWidth: '80px' }}>{roundLabel}</span>
                                                                                <span style={{ color: w === t1 ? 'var(--gold)' : 'var(--silver)', fontWeight: w === t1 ? 700 : 400 }}>{getOwnerName(t1)}</span>
                                                                                <span style={{ color: 'var(--silver)', opacity: 0.4, fontSize: '0.7rem' }}>vs</span>
                                                                                <span style={{ color: w === t2 ? 'var(--gold)' : 'var(--silver)', fontWeight: w === t2 ? 700 : 400 }}>{getOwnerName(t2)}</span>
                                                                                {w && <span style={{ color: 'var(--gold)', fontSize: '0.7rem', marginLeft: 'auto' }}>{'\u2192'} {getOwnerName(w)}</span>}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* Rivalry Detection */}
                                {(() => {
                                    const detectRivalries = window.App?.detectRivalries;
                                    if (!detectRivalries || !myRoster) return null;
                                    const rivals = detectRivalries(myRoster.roster_id);
                                    if (!rivals || !rivals.length) return null;
                                    return (
                                        <div style={aCardStyle}>
                                            <div style={aHeaderStyle}>YOUR PLAYOFF RIVALRIES</div>
                                            {rivals.map((r, i) => {
                                                const rivalName = getOwnerName(r.rosterId);
                                                return (
                                                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600, flex: 1 }}>{rivalName}</span>
                                                            <span style={{ fontSize: '0.78rem', color: r.wins > r.losses ? goodColor : r.wins < r.losses ? badColor : warnColor, fontWeight: 700, fontFamily: 'Oswald' }}>{r.wins}-{r.losses}</span>
                                                            <span style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{r.total} meetings</span>
                                                        </div>
                                                        {r.meetings && r.meetings.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                                {r.meetings.map((mtg, mi) => (
                                                                    <span key={mi} style={{ fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '1px 6px', borderRadius: '8px', background: mtg.won ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', color: mtg.won ? goodColor : badColor, border: '1px solid ' + (mtg.won ? goodColor : badColor) + '33' }}>
                                                                        Met in {mtg.bracket || 'Winners'} R{mtg.round || '?'} ({mtg.season || '?'})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {(!r.meetings || !r.meetings.length) && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.65, marginTop: '2px' }}>{r.seasons.join(', ')}</div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </React.Fragment>
                            );
                        })()}

                        {/* ═══ TIMELINE ═══ */}
                        {analyticsTab === 'timeline' && (() => {
                            const championships = window.App?.LI?.championships || {};
                            const tradeHistory = window.App?.LI?.tradeHistory || [];
                            const getOwner = rid => { const numRid = typeof rid === 'string' ? parseInt(rid) : rid; const r = (currentLeague.rosters||[]).find(x => x.roster_id === numRid || String(x.roster_id) === String(rid)); const u = (currentLeague.users||[]).find(x => x.user_id === r?.owner_id); return u?.display_name || u?.username || 'Team '+rid; };
                            const events = [];

                            Object.entries(championships).forEach(([season, data]) => {
                                if (data.champion) events.push({ year: season, type: 'champ', title: getOwner(data.champion) + ' wins the championship', color: 'var(--gold)', ts: parseInt(season)*100+99 });
                                if (data.runnerUp) events.push({ year: season, type: 'finals', title: getOwner(data.runnerUp) + ' finishes runner-up', color: 'var(--silver)', ts: parseInt(season)*100+98 });
                            });

                            tradeHistory.forEach(trade => {
                                const rids = trade.roster_ids || [];
                                const names = rids.map(r => getOwner(r)).join(' and ');
                                const pids = Object.keys(trade.sides || {}).flatMap(rid => (trade.sides[rid]?.players || []));
                                const playerNames = pids.slice(0, 3).map(pid => playersData[pid]?.full_name || pid).join(', ');
                                const totalVal = pids.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                                if (totalVal < 5000) return; // Only show impactful trades (5000+ DHQ moved)
                                events.push({
                                    year: trade.season || '?', type: 'trade',
                                    title: names + ' swap assets' + (playerNames ? ': ' + playerNames : ''),
                                    sub: totalVal > 0 ? totalVal.toLocaleString() + ' DHQ moved' : '',
                                    color: '#F0A500', ts: parseInt(trade.season||0)*100 + (trade.week||50)
                                });
                            });

                            // Personal highlights per year
                            const myRidTLx = myRoster?.roster_id;
                            const playerScoresTL = window.App?.LI?.playerScores || {};
                            const draftOutcomesTL = (window.App?.LI || {}).draftOutcomes || [];
                            const allYears = [...new Set([...Object.keys(championships), ...events.map(e => String(e.year))])].sort((a,b) => b - a);
                            allYears.forEach(yr => {
                                // Your team's finish
                                const cData = championships[yr];
                                if (cData) {
                                    if (cData.champion === myRidTLx) events.push({ year: yr, type: 'personal', title: 'You won the championship!', color: 'var(--gold)', ts: parseInt(yr)*100+97 });
                                    else if (cData.runnerUp === myRidTLx) events.push({ year: yr, type: 'personal', title: 'You finished as runner-up', color: 'var(--silver)', ts: parseInt(yr)*100+96 });
                                    else if ((cData.semiFinalists || []).includes(myRidTLx)) events.push({ year: yr, type: 'personal', title: 'You reached the semi-finals', color: '#4ECDC4', ts: parseInt(yr)*100+95 });
                                }
                                // Your best draft pick that year
                                const myDraftPicks = draftOutcomesTL.filter(dp => dp.roster_id === myRidTLx && String(dp.season || dp.year) === String(yr));
                                if (myDraftPicks.length > 0) {
                                    const bestPick = myDraftPicks.reduce((best, dp) => (playerScoresTL[dp.player_id] || 0) > (playerScoresTL[best.player_id] || 0) ? dp : best, myDraftPicks[0]);
                                    const bestDhq = playerScoresTL[bestPick.player_id] || 0;
                                    if (bestDhq > 2000) {
                                        const pName = playersData[bestPick.player_id]?.full_name || bestPick.player_id;
                                        events.push({ year: yr, type: 'personal', title: 'Best draft pick: ' + pName + ' (R' + (bestPick.round || '?') + ', ' + bestDhq.toLocaleString() + ' DHQ)', color: '#4ECDC4', ts: parseInt(yr)*100+94 });
                                    }
                                }
                            });

                            events.sort((a, b) => b.ts - a.ts);
                            const years = [...new Set(events.map(e => e.year))].sort((a, b) => b - a);

                            if (!events.length) return <div style={{ color:'var(--silver)', textAlign:'center', padding:'40px' }}>No timeline events. DHQ engine needs to load trade history and championship data.</div>;

                            // ── League Narrative Summary ──
                            const champCounts = {};
                            Object.values(championships).forEach(data => {
                                if (data.champion) champCounts[data.champion] = (champCounts[data.champion] || 0) + 1;
                            });
                            const champEntries = Object.entries(champCounts).sort((a, b) => b[1] - a[1]);
                            const dominantTeam = champEntries.length > 0 ? getOwner(champEntries[0][0]) : 'N/A';
                            const dominantTitles = champEntries.length > 0 ? champEntries[0][1] : 0;
                            const repeatWinners = champEntries.filter(([, cnt]) => cnt > 1).map(([rid]) => getOwner(rid));
                            const myRidTL = myRoster?.roster_id;
                            const myChampsTL = champCounts[myRidTL] || 0;
                            // Trajectory from projection data
                            const projTL = d.projection || [];
                            const tlTrend = projTL.length >= 2 ? projTL[projTL.length - 1].projectedDHQ - projTL[0].projectedDHQ : 0;
                            const myTrajectory = tlTrend > 500 ? 'rising' : tlTrend < -500 ? 'declining' : 'stable';
                            // Next champion candidates: teams with highest health scores
                            const allRostersTL = (window.S || window.App?.S)?.rosters || [];
                            const teamHealthList = [];
                            allRostersTL.forEach(ros => {
                                try {
                                    if (window.assessTeamFromGlobal) {
                                        const a = window.assessTeamFromGlobal(ros.roster_id);
                                        if (a) teamHealthList.push({ rid: ros.roster_id, name: getOwner(ros.roster_id), health: a.healthScore || 0 });
                                    }
                                } catch(e) {}
                            });
                            teamHealthList.sort((a, b) => b.health - a.health);
                            const nextChampCandidates = teamHealthList.slice(0, 3).map(t => t.name).join(', ') || 'insufficient data';

                            return (
                                <React.Fragment>
                                {/* ── LEAGUE NARRATIVE SUMMARY ── */}
                                <div style={{ marginBottom: '16px' }}>
                                    <GMMessage title="League Narrative">
                                        {'League dominated by ' + dominantTeam + ' with ' + dominantTitles + ' title' + (dominantTitles > 1 ? 's' : '') + '.' + (repeatWinners.length > 0 ? ' Repeat winners: ' + repeatWinners.join(', ') + '.' : ' No repeat champions yet \u2014 wide-open league.') + ' Your trajectory: ' + myTrajectory + (myChampsTL > 0 ? ' (' + myChampsTL + ' title' + (myChampsTL > 1 ? 's' : '') + ')' : '') + '. Next likely champion candidates: ' + nextChampCandidates + '.'}
                                    </GMMessage>
                                </div>

                                <div style={{ background:'var(--black)', border:'2px solid rgba(212,175,55,0.3)', borderRadius:'12px', padding:'24px' }}>
                                    <div style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.3rem', color:'var(--gold)', letterSpacing:'0.08em', marginBottom:'20px' }}>LEAGUE TIMELINE</div>
                                    {years.map(year => {
                                        const yearEvents = events.filter(e => e.year === year);
                                        return (
                                            <div key={year} style={{ marginBottom:'24px' }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                                    <div style={{ width:'14px', height:'14px', background:'var(--gold)', borderRadius:'50%', border:'3px solid var(--black)', flexShrink:0 }} />
                                                    <span style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.2rem', color:'var(--gold)' }}>{year}</span>
                                                </div>
                                                <div style={{ paddingLeft:'20px', borderLeft:'2px solid rgba(212,175,55,0.2)', marginLeft:'6px' }}>
                                                    {yearEvents.map((ev, i) => (
                                                        <div key={i} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(212,175,55,0.12)', borderLeft:'3px solid '+ev.color, borderRadius:'6px', padding:'10px 14px', marginBottom:'8px', position:'relative' }}>
                                                            <div style={{ position:'absolute', left:'-14px', top:'12px', width:'8px', height:'8px', background:ev.color, borderRadius:'50%', border:'2px solid var(--black)' }} />
                                                            <div style={{ fontSize:'0.78rem', color:ev.color, textTransform:'uppercase', fontFamily:'Oswald,sans-serif', letterSpacing:'0.06em', marginBottom:'3px' }}>{ev.type === 'champ' ? 'Championship' : ev.type === 'finals' ? 'Runner-Up' : ev.type === 'personal' ? 'Your Highlight' : 'Trade'}</div>
                                                            <div style={{ fontSize:'0.78rem', color:'var(--white)', fontWeight:600 }}>{ev.title}</div>
                                                            {ev.sub && <div style={{ fontSize:'0.74rem', color:'var(--silver)', opacity:0.6, marginTop:'2px' }}>{ev.sub}</div>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </React.Fragment>
                            );
                        })()}

                        </React.Fragment>
                        )}
                    </div>
                    );
                })() : activeTab === 'matchup' ? (
                    <div style={{ padding:'16px', maxWidth:'1200px', margin:'0 auto' }}>
                        <div className="wr-section-hdr" style={{ fontSize:'1.4rem', marginBottom:'16px' }}>WEEKLY MATCHUP</div>
                        {(() => {
                            // Find current week matchup
                            const week = currentLeague.settings?.leg || 1;
                            const myRid = myRoster?.roster_id;
                            if (!myRid) return <div style={{color:'var(--silver)',textAlign:'center',padding:'2rem'}}>No roster found.</div>;

                            // Try to get matchups from window.S
                            const matchups = window.S?.matchups || [];
                            const myMatch = matchups.find(m => m.roster_id === myRid);
                            const oppMatch = myMatch ? matchups.find(m => m.matchup_id === myMatch.matchup_id && m.roster_id !== myRid) : null;

                            if (!myMatch || !oppMatch) {
                                return <div style={{color:'var(--silver)',textAlign:'center',padding:'2rem'}}>
                                    <div style={{marginBottom:'8px'}}>No matchup data for Week {week}.</div>
                                    <div style={{fontSize:'0.75rem',opacity:0.65}}>Matchup data is available during the regular season.</div>
                                </div>;
                            }

                            const myStarters = myMatch.starters || [];
                            const oppStarters = oppMatch.starters || [];
                            const oppRoster = currentLeague.rosters?.find(r => r.roster_id === oppMatch.roster_id);
                            const oppOwner = standings.find(t => {
                                const r = currentLeague.rosters?.find(r2 => r2.roster_id === oppMatch.roster_id);
                                return r && t.userId === r.owner_id;
                            });
                            const oppName = oppOwner?.displayName || 'Opponent';

                            const rosterPositions = currentLeague.roster_positions?.filter(p => p !== 'BN') || [];
                            const myPts = myMatch.points || 0;
                            const oppPts = oppMatch.points || 0;

                            const getP = pid => playersData[pid] || {};
                            const getDHQ = pid => window.App?.LI?.playerScores?.[pid] || 0;
                            const getPPG = pid => { const s = statsData[pid]; return s?.pts_half_ppr && s?.gp ? +(s.pts_half_ppr / s.gp).toFixed(1) : 0; };

                            let myProjTotal = 0, oppProjTotal = 0;
                            const rows = rosterPositions.map((slot, i) => {
                                const myPid = myStarters[i] || null;
                                const oppPid = oppStarters[i] || null;
                                const myPPG = myPid ? getPPG(myPid) : 0;
                                const oppPPG = oppPid ? getPPG(oppPid) : 0;
                                myProjTotal += myPPG;
                                oppProjTotal += oppPPG;
                                const adv = myPPG - oppPPG;
                                return { slot, myPid, oppPid, myPPG, oppPPG, adv };
                            });

                            const myWinning = myPts > oppPts;
                            const projWinning = myProjTotal > oppProjTotal;

                            return <div>
                                {/* Score header */}
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',background:'var(--black)',border:'2px solid rgba(212,175,55,0.3)',borderRadius:'12px',marginBottom:'16px'}}>
                                    <div style={{textAlign:'center',flex:1}}>
                                        <div style={{fontFamily:'Oswald,sans-serif',fontSize:'0.8rem',color:'var(--silver)',marginBottom:'4px'}}>YOU</div>
                                        <div style={{fontFamily:'Bebas Neue,cursive',fontSize:'2.5rem',color:myWinning?'var(--win-green)':'var(--white)',lineHeight:1}}>{myPts.toFixed(1)}</div>
                                        <div style={{fontSize:'0.76rem',color:'var(--silver)',opacity:0.65,marginTop:'4px'}}>Proj: {myProjTotal.toFixed(1)}</div>
                                    </div>
                                    <div style={{textAlign:'center',padding:'0 24px'}}>
                                        <div style={{fontFamily:'Bebas Neue,cursive',fontSize:'1rem',color:'var(--gold)'}}>WEEK {week}</div>
                                        <div style={{fontSize:'0.76rem',color:'var(--silver)',opacity:0.65}}>vs</div>
                                    </div>
                                    <div style={{textAlign:'center',flex:1}}>
                                        <div style={{fontFamily:'Oswald,sans-serif',fontSize:'0.8rem',color:'var(--silver)',marginBottom:'4px'}}>{oppName.toUpperCase()}</div>
                                        <div style={{fontFamily:'Bebas Neue,cursive',fontSize:'2.5rem',color:!myWinning?'var(--win-green)':'var(--white)',lineHeight:1}}>{oppPts.toFixed(1)}</div>
                                        <div style={{fontSize:'0.76rem',color:'var(--silver)',opacity:0.65,marginTop:'4px'}}>Proj: {oppProjTotal.toFixed(1)}</div>
                                    </div>
                                </div>

                                {/* Position-by-position breakdown */}
                                <div style={{background:'var(--black)',border:'1px solid rgba(212,175,55,0.2)',borderRadius:'12px',overflow:'hidden'}}>
                                    <div style={{display:'grid',gridTemplateColumns:'60px 1fr 50px 20px 50px 1fr 80px',gap:'0',padding:'8px 12px',background:'rgba(212,175,55,0.06)',fontSize:'0.72rem',fontFamily:'Oswald,sans-serif',color:'var(--gold)',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                                        <span>Slot</span><span>Your Player</span><span style={{textAlign:'right'}}>PPG</span><span></span><span>PPG</span><span>Their Player</span><span style={{textAlign:'right'}}>Edge</span>
                                    </div>
                                    {rows.map((r, i) => {
                                        const myP = r.myPid ? getP(r.myPid) : null;
                                        const oppP = r.oppPid ? getP(r.oppPid) : null;
                                        const advCol = r.adv > 2 ? 'var(--win-green)' : r.adv < -2 ? 'var(--loss-red)' : 'var(--silver)';
                                        const mAnn = getMatchupAnnotation(r.myPPG, r.oppPPG, r.slot);
                                        return <div key={i} style={{display:'grid',gridTemplateColumns:'60px 1fr 50px 20px 50px 1fr 80px',gap:'0',padding:'8px 12px',borderTop:'1px solid rgba(255,255,255,0.04)',alignItems:'center'}}>
                                            <span style={{fontSize:'0.76rem',color:'var(--gold)',fontWeight:700,fontFamily:'Oswald,sans-serif'}}>{r.slot}</span>
                                            <div style={{fontSize:'0.72rem',fontWeight:600,color:'var(--white)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{myP?.full_name || (r.myPid ? 'Empty' : '-')}{myP?.team ? <span style={{color:'var(--silver)',fontSize:'0.72rem',marginLeft:'4px'}}>{myP.team}</span> : ''}</div>
                                            <span style={{textAlign:'right',fontSize:'0.72rem',fontWeight:700,color:r.myPPG>r.oppPPG?'var(--win-green)':'var(--white)',fontFamily:'Oswald,sans-serif'}}>{r.myPPG||'-'}</span>
                                            <span style={{textAlign:'center',fontSize:'0.72rem',color:advCol,fontWeight:700}}>{r.adv>0?'+':''}{r.adv!==0?r.adv.toFixed(0):'-'}</span>
                                            <span style={{fontSize:'0.72rem',fontWeight:700,color:r.oppPPG>r.myPPG?'var(--win-green)':'var(--white)',fontFamily:'Oswald,sans-serif'}}>{r.oppPPG||'-'}</span>
                                            <div style={{fontSize:'0.72rem',fontWeight:600,color:'var(--white)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{oppP?.full_name || (r.oppPid ? 'Empty' : '-')}{oppP?.team ? <span style={{color:'var(--silver)',fontSize:'0.72rem',marginLeft:'4px'}}>{oppP.team}</span> : ''}</div>
                                            <span style={{fontSize:'0.76rem',fontWeight:600,color:mAnn.color,textAlign:'right',fontFamily:'Oswald,sans-serif'}}>{mAnn.text}</span>
                                        </div>;
                                    })}
                                    {/* Totals row */}
                                    <div style={{display:'grid',gridTemplateColumns:'60px 1fr 50px 20px 50px 1fr 80px',gap:'0',padding:'10px 12px',borderTop:'2px solid rgba(212,175,55,0.3)',background:'rgba(212,175,55,0.04)'}}>
                                        <span style={{fontSize:'0.7rem',color:'var(--gold)',fontWeight:700,fontFamily:'Oswald,sans-serif'}}>TOTAL</span>
                                        <span></span>
                                        <span style={{textAlign:'right',fontSize:'0.8rem',fontWeight:800,color:projWinning?'var(--win-green)':'var(--white)',fontFamily:'Bebas Neue,cursive'}}>{myProjTotal.toFixed(1)}</span>
                                        <span style={{textAlign:'center',fontSize:'0.76rem',color:projWinning?'var(--win-green)':'var(--loss-red)',fontWeight:700}}>{(myProjTotal-oppProjTotal)>0?'+':''}{(myProjTotal-oppProjTotal).toFixed(1)}</span>
                                        <span style={{fontSize:'0.8rem',fontWeight:800,color:!projWinning?'var(--win-green)':'var(--white)',fontFamily:'Bebas Neue,cursive'}}>{oppProjTotal.toFixed(1)}</span>
                                        <span></span>
                                        <span style={{textAlign:'right',fontSize:'0.72rem',fontWeight:700,color:projWinning?'var(--win-green)':'var(--loss-red)',fontFamily:'Oswald,sans-serif'}}>{projWinning?'Projected W':'Projected L'}</span>
                                    </div>
                                </div>
                            </div>;
                        })()}
                    </div>
                ) : activeTab === 'fa' ? (
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
                      marginBottom: '20px',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ fontSize: '0.76rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>THIS WEEK IN {currentLeague.name?.toUpperCase()}</div>
                      <div style={{ fontFamily: 'Crimson Text, serif', fontSize: '1.15rem', color: 'var(--white)', lineHeight: 1.6 }}>
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

            {selectedPlayerPid && <PlayerInlineCard
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
                    try { localStorage.removeItem('wr_chat_' + currentLeague?.league_id); } catch {}
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
                      fontSize: '0.78rem', lineHeight: 1.6,
                      background: 'rgba(124,107,248,0.12)', border: '1px solid rgba(124,107,248,0.18)',
                      color: '#f0f0f3'
                    }} dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') }} />
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
                            <div style={{ fontSize: '0.78rem', lineHeight: 1.6, color: '#f0f0f3' }}
                              dangerouslySetInnerHTML={{ __html: textContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') }} />
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
                                    try {
                                      const saved = JSON.parse(localStorage.getItem('wr_saved_trades_' + currentLeague?.league_id) || '[]');
                                      saved.push({ ...tradeCard, savedAt: Date.now() });
                                      localStorage.setItem('wr_saved_trades_' + currentLeague?.league_id, JSON.stringify(saved.slice(-20)));
                                    } catch {}
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
        );
    }
