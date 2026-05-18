// ══════════════════════════════════════════════════════════════════
// draft-room.js — DraftTab component (Flash Brief, Big Board)
// ══════════════════════════════════════════════════════════════════
    const DRAFT_WR_KEYS  = window.App.WR_KEYS;
    const DraftStorage = window.App.WrStorage;
    // ══════════════════════════════════════════════════════════════════════════
    // END FREE AGENCY TAB
    // ══════════════════════════════════════════════════════════════════════════

    // ══════════════════════════════════════════════════════════════════════════
    // DRAFT TAB — migrated from draft-warroom.html
    // ══════════════════════════════════════════════════════════════════════════
    function DraftTab({ playersData, statsData, myRoster, currentLeague, sleeperUserId, setReconPanelOpen, sendReconMessage, timeRecomputeTs, viewMode }) {
        const leagueKey = currentLeague?.league_id || currentLeague?.id || '';
        const leagueSeason = parseInt(currentLeague.season || new Date().getFullYear());
        const draftRounds = currentLeague.settings?.draft_rounds || 5;
        const sameId = (a, b) => String(a ?? '') === String(b ?? '');
        const [draftSort, setDraftSort] = useState({ key: 'dhq', dir: -1 });
        const [draftView, setDraftView] = useState('command'); // 'command' | 'board' | 'mock' | 'live'
        const [draftInfo, setDraftInfo] = useState(null);
        const boardStorageKey = DRAFT_WR_KEYS.BIGBOARD_DRAFT
            ? DRAFT_WR_KEYS.BIGBOARD_DRAFT(leagueKey, 'rookie')
            : DRAFT_WR_KEYS.BIGBOARD(leagueKey);
        const [boardData, setBoardData] = useState(() => DraftStorage.get(boardStorageKey, DraftStorage.get(DRAFT_WR_KEYS.BIGBOARD(leagueKey), null)));
        const [draftedPids, setDraftedPids] = useState(new Set());
        const [boardNotes, setBoardNotes] = useState({});
        const [boardTags, setBoardTags] = useState({}); // pid -> 'target'|'avoid'|'sleeper'|'must'
        const [boardMode, setBoardMode] = useState('dhq'); // 'dhq' | 'ai' | 'my'
        const [myBoardOrder, setMyBoardOrder] = useState([]); // custom ordered pid array
        const [boardPosFilter, setBoardPosFilter] = useState(''); // '' | 'QB' | 'RB' | 'WR' | 'TE' | 'DL' | 'LB' | 'DB'
        const [boardTeamFilter, setBoardTeamFilter] = useState(''); // '' | NFL team abbr
        const [boardRoundFilter, setBoardRoundFilter] = useState(''); // '' | '1'..'7' | 'UDFA'
        const [boardSort, setBoardSort] = useState({ key: 'dhq', dir: -1 }); // sortable columns
        const [expandedDraftPid, setExpandedDraftPid] = useState(null);
        const [dragPid, setDragPid] = useState(null); // currently dragging pid
        const [editingRank, setEditingRank] = useState(null); // pid being rank-edited
        const [rankInput, setRankInput] = useState('');
        const [draftStrategyEditing, setDraftStrategyEditing] = useState(false);
        const draftStrategyKey = 'wr_draft_strategy_' + leagueKey;
        const [customDraftStrategy, setCustomDraftStrategy] = useState(() => {
            try { return localStorage.getItem(draftStrategyKey) || ''; } catch(e) { return ''; }
        });
        const [pickFocus, setPickFocus] = useState(() => window._wrDraftPickFocus || null);
        const [flashAnalystPresetId, setFlashAnalystPresetId] = useState('league-history');
        const [flashAnalystRoundLimit, setFlashAnalystRoundLimit] = useState('1');
        const [flashAnalystReports, setFlashAnalystReports] = useState([]);
        const [flashAnalystStatus, setFlashAnalystStatus] = useState('idle');
        const [flashAnalystError, setFlashAnalystError] = useState('');
        const [showFuturePickCapital, setShowFuturePickCapital] = useState(false);
        const [liveAutoStartToken, setLiveAutoStartToken] = useState(0);

        const tradedPicks = useMemo(() => {
            const leagueRows = Array.isArray(currentLeague?.tradedPicks) ? currentLeague.tradedPicks : [];
            const globalRows = Array.isArray(window.S?.tradedPicks) ? window.S.tradedPicks : [];
            const taggedGlobalRows = globalRows.filter(p => {
                const pickLeague = p?.league_id || p?.leagueId;
                return pickLeague && sameId(pickLeague, leagueKey);
            });
            const rosterIds = new Set((currentLeague?.rosters || []).map(r => String(r?.roster_id ?? '')).filter(Boolean));
            const activeSeasons = new Set([leagueSeason, leagueSeason + 1, leagueSeason + 2].map(String));
            const untaggedGlobalRows = globalRows.filter(p => {
                if (p?.league_id || p?.leagueId) return false;
                if (!activeSeasons.has(String(p?.season ?? ''))) return false;
                return rosterIds.has(String(p?.roster_id ?? '')) || rosterIds.has(String(p?.owner_id ?? ''));
            });
            const exactRows = [...leagueRows, ...taggedGlobalRows];
            const sourceRows = exactRows.length ? exactRows : untaggedGlobalRows;
            const seen = new Set();
            return sourceRows.filter(p => {
                const key = [p?.season, p?.round, p?.roster_id, p?.owner_id].map(v => String(v ?? '')).join(':');
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }, [currentLeague?.tradedPicks, currentLeague?.rosters, leagueKey, leagueSeason, timeRecomputeTs]);

        useEffect(() => {
            const openPickFocus = (event) => {
                const next = event?.detail || window._wrDraftPickFocus || null;
                if (!next) return;
                setPickFocus(next);
                setDraftView('command');
            };
            window.addEventListener('wr:open-draft-pick-context', openPickFocus);
            openPickFocus({ detail: window._wrDraftPickFocus });
            return () => window.removeEventListener('wr:open-draft-pick-context', openPickFocus);
        }, []);

        const normPos = window.App.normPos;
        const rosterState = window.App?.getRosterDataState?.({ roster: myRoster, currentLeague, rosters: currentLeague?.rosters }) || { isUsable: true };
        const [rookieMarket, setRookieMarket] = useState({ rows: {}, ladders: {}, scaleFactor: 1 });

        useEffect(() => {
            let cancelled = false;
            const scoring = currentLeague?.scoring_settings || {};
            const rosterPositions = currentLeague?.roster_positions || [];
            const isSF = rosterPositions.some(slot => ['SUPER_FLEX', 'QB_FLEX', 'OP'].includes(String(slot).toUpperCase()));
            const pprVal = scoring.rec != null && scoring.rec >= 0.9 ? 1 : scoring.rec != null && scoring.rec >= 0.4 ? 0.5 : 0;
            const totalTeams = currentLeague?.rosters?.length || window.S?.rosters?.length || 12;
            const url = `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${isSF ? 2 : 1}&numTeams=${totalTeams}&ppr=${pprVal}`;
            fetch(url)
                .then(r => r.ok ? r.json() : [])
                .then(data => {
                    if (cancelled || !Array.isArray(data) || !data.length) return;
                    const scores = window.App?.LI?.playerScores || {};
                    const matched = data
                        .filter(d => {
                            const sid = d.player?.sleeperId;
                            return sid && d.player?.position !== 'PICK' && d.value > 0 && scores[sid] > 0 && playersData?.[sid]?.years_exp !== 0;
                        })
                        .map(d => ({ sid: d.player.sleeperId, fcVal: d.value, dhqVal: scores[d.player.sleeperId] }))
                        .sort((a, b) => b.fcVal - a.fcVal);
                    let scaleFactor = 1;
                    if (matched.length >= 10) {
                        const ratios = matched.slice(0, 20).map(m => m.dhqVal / m.fcVal).sort((a, b) => a - b);
                        scaleFactor = ratios[Math.floor(ratios.length / 2)] || 1;
                    }
                    const rows = {};
                    data.forEach(d => {
                        const sid = d.player?.sleeperId;
                        if (!sid || d.player?.position === 'PICK' || !d.value) return;
                        rows[sid] = {
                            value: d.value,
                            scaled: Math.round(d.value * scaleFactor),
                            overallRank: d.overallRank || 999,
                            positionRank: d.positionRank || 999,
                        };
                    });
                    const meta = window.App?.LI?.playerMeta || {};
                    const ladders = {};
                    ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
                        ladders[pos] = Object.entries(scores)
                            .filter(([sid, score]) => {
                                if (!score || score <= 0) return false;
                                if (playersData?.[sid]?.years_exp === 0) return false;
                                const playerPos = normPos(meta[sid]?.pos || playersData?.[sid]?.position || '');
                                return playerPos === pos;
                            })
                            .sort((a, b) => b[1] - a[1])
                            .map(([, score]) => score);
                    });
                    window.App._rookieMarketRows = rows;
                    setRookieMarket({ rows, ladders, scaleFactor });
                })
                .catch(e => { if (window.wrLog) window.wrLog('draft.rookieMarket', e); });
            return () => { cancelled = true; };
        }, [currentLeague?.league_id, currentLeague?.id, currentLeague?.season, playersData, timeRecomputeTs]);

        const rookiePeerMultiplier = (pos, positionRank) => {
            if (pos === 'RB') {
                if (positionRank <= 5) return 1.08;
                if (positionRank <= 12) return 1.00;
                if (positionRank <= 24) return 0.94;
                return 0.86;
            }
            if (pos === 'WR') {
                if (positionRank <= 12) return 1.02;
                if (positionRank <= 24) return 0.96;
                if (positionRank <= 36) return 0.90;
                return 0.82;
            }
            if (pos === 'QB') {
                if (positionRank <= 12) return 0.96;
                if (positionRank <= 24) return 0.90;
                return 0.80;
            }
            if (pos === 'TE') {
                if (positionRank <= 6) return 0.96;
                if (positionRank <= 18) return 0.88;
                return 0.80;
            }
            return 0.90;
        };

        const calibratedRookieDHQ = (pid, player, engineDHQ) => {
            const row = rookieMarket.rows?.[pid];
            const pos = normPos(player?.position);
            if (!row || !['QB', 'RB', 'WR', 'TE'].includes(pos)) return engineDHQ || 0;
            const marketDHQ = row.scaled || row.value || 0;
            if (!marketDHQ) return engineDHQ || 0;
            const ladder = rookieMarket.ladders?.[pos] || [];
            const peerDHQ = ladder[Math.max(0, row.positionRank - 1)] || 0;
            const peerTarget = peerDHQ ? Math.round(peerDHQ * rookiePeerMultiplier(pos, row.positionRank)) : 0;
            const base = peerTarget || marketDHQ;
            const marketGuard = row.value ? Math.round(row.value * (pos === 'RB' ? 0.85 : pos === 'WR' ? 0.82 : 0.72)) : 0;
            const calibrated = Math.round(base * 0.80 + marketDHQ * 0.20);
            return Math.min(10000, Math.max(marketGuard, calibrated));
        };

        // Build my picks
        const myPicks = useMemo(() => {
            const picks = [];
            const myRid = myRoster?.roster_id;
            if (myRid == null) return picks;
            for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) {
                for (let rd = 1; rd <= draftRounds; rd++) {
                    const tradedAway = tradedPicks.find(p =>
                        parseInt(p.season, 10) === yr
                        && Number(p.round) === rd
                        && sameId(p.roster_id, myRid)
                        && !sameId(p.owner_id, myRid)
                    );
                    if (!tradedAway) picks.push({ year: yr, round: rd, own: true, originalRosterId: myRid });
                    const acquired = tradedPicks.filter(p =>
                        parseInt(p.season, 10) === yr
                        && Number(p.round) === rd
                        && sameId(p.owner_id, myRid)
                        && !sameId(p.roster_id, myRid)
                    );
                    acquired.forEach(a => picks.push({ year: yr, round: rd, own: false, from: a.roster_id, originalRosterId: a.roster_id }));
                }
            }
            return picks;
        }, [tradedPicks, myRoster?.roster_id, leagueSeason, draftRounds]);

        // Find rookies — Sleeper + CSV enrichment from The Beast
        const rookies = useMemo(() => {
            const rp = currentLeague?.roster_positions || [];
            const leagueHasIDP = rp.some(s => ['DL','DE','DT','LB','DB','CB','S','IDP_FLEX'].includes(s));

            // Step 1: Sleeper rookies
            const sleeperRookies = Object.entries(playersData)
                .filter(([pid, p]) => {
                    if (p.years_exp !== 0) return false;
                    const name = p.full_name || '';
                    if (!name || /Duplicate|Invalid|DUP/i.test(name)) return false;
                    if (!p.position || ['HC','OC','DC','GM'].includes(p.position)) return false;
                    if (p.status === 'Inactive') return false;
                    const hasValue = (window.App?.LI?.playerScores?.[pid] || 0) > 0;
                    const isIDP = ['DL','DE','DT','NT','IDL','EDGE','LB','OLB','ILB','MLB','DB','CB','S','SS','FS'].includes(p.position);
                    if (isIDP && !leagueHasIDP) return false;
                    // OL is never a fantasy scoring position — exclude offensive linemen
                    const isOL = ['OL','OT','OG','G','C','T','IOL'].includes(p.position);
                    if (isOL) return false;
                    return hasValue || p.team;
                })
                .map(([pid, p]) => {
                    const csv = typeof window.findProspect === 'function' ? window.findProspect((p.first_name || '') + ' ' + (p.last_name || '')) : null;
                    // The DHQ engine is the canonical value. Consensus rank and NFL
                    // capital are context on the card, not a second scoring pass.
                    const fcVal = window.App?.LI?.playerScores?.[pid] || 0;
                    let dhq;
                    if (fcVal > 0) {
                        dhq = calibratedRookieDHQ(pid, p, fcVal);
                    } else if (csv) {
                        // No engine/market score yet: fall back to the scouting model.
                        dhq = csv.dynastyValue || 0;
                    } else {
                        dhq = 0;
                    }
                    dhq = Math.min(10000, Math.max(0, dhq));
                    return { pid, p, dhq, csv };
                });

            // Step 2: CSV-only prospects (from enrichment but not in Sleeper)
            // Normalize names: lowercase, strip apostrophes/dots/suffixes so "De'Zhaun" === "Dezhaun".
            const normName = s => (s || '').toLowerCase().replace(/[''`.]/g, '').replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();
            const sleeperNames = new Set(sleeperRookies.map(r => normName(r.p.full_name)));
            // Also collect the CSV-prospect identities Sleeper rookies link to via
            // findProspect — handles nickname mismatches (e.g., Sleeper "KC Concepcion"
            // → CSV "Kevin Concepcion" — both should be one row, not two).
            const linkedCsvPids = new Set(sleeperRookies.map(r => r.csv?.pid).filter(Boolean));
            const csvOnly = [];
            if (typeof window.getProspects === 'function') {
                const allCsv = window.getProspects();
                if (allCsv && allCsv.length) {
                    allCsv.forEach(csv => {
                        if (sleeperNames.has(normName(csv.name))) return;
                        if (linkedCsvPids.has(csv.pid)) return;
                        const pos = normPos(csv.mappedPos || csv.pos) || csv.pos;
                        const isIDP = ['DL','LB','DB','EDGE'].includes(pos);
                        if (isIDP && !leagueHasIDP) return;
                        // OL is never a fantasy scoring position — exclude offensive linemen
                        if (['OL','OT','OG','G','C','T','IOL'].includes(pos)) return;
                        // Build synthetic player object
                        const nameParts = (csv.name || '').split(' ');
                        csvOnly.push({
                            pid: 'csv_' + (csv.name || '').toLowerCase().replace(/[^a-z]/g, '_'),
                            p: {
                                full_name: csv.name,
                                first_name: nameParts[0] || '',
                                last_name: nameParts.slice(1).join(' ') || '',
                                position: csv.pos || '?',
                                college: csv.college,
                                years_exp: 0,
                                age: csv.age ? parseFloat(csv.age) : null,
                                team: null,
                                height: csv.size ? parseInt(csv.size.replace("'", "").split('"')[0]) * 12 + parseInt((csv.size.match(/'(\d+)/)?.[1]) || 0) : null,
                                weight: csv.weight ? parseInt(csv.weight) : null,
                            },
                            dhq: csv.draftScore || 0,
                            csv,
                            isCSVOnly: true,
                        });
                    });
                }
            }

            return [...sleeperRookies, ...csvOnly].sort((a, b) => {
                // Sort by CSV rank first (if available), then DHQ
                const aRank = a.csv?.rank || 9999;
                const bRank = b.csv?.rank || 9999;
                if (aRank !== bRank) return aRank - bRank;
                return b.dhq - a.dhq;
            });
        }, [playersData, timeRecomputeTs, rookieMarket]);

        const posColors = window.App.POS_COLORS;

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

        // Team assessment for fit scoring
        const assess = useMemo(() => typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null, [myRoster, timeRecomputeTs]);

        // Compute fit scores for rookies based on roster needs
        const computeFitScore = useCallback((rookie) => {
            if (!rosterState.isUsable) return { score: 0, label: 'Sync' };
            if (!assess || !assess.needs || !assess.needs.length) return { score: 50, label: 'N/A' };
            const pos = normPos(rookie.p.position);
            const needEntry = assess.needs.find(n => n.pos === pos);
            if (!needEntry) return { score: 10, label: 'Low' };
            const urgencyBonus = needEntry.urgency === 'deficit' ? 40 : 20;
            const needIdx = assess.needs.findIndex(n => n.pos === pos);
            const priorityBonus = Math.max(0, 20 - needIdx * 5);
            const raw = Math.min(99, 10 + urgencyBonus + priorityBonus);
            const label = raw >= 80 ? 'Elite' : raw >= 60 ? 'Strong' : raw >= 40 ? 'Moderate' : 'Low';
            return { score: raw, label };
        }, [rosterState.isUsable, assess]);

        // Determine active view: global viewMode overrides to 'command' when set
        const activeView = viewMode === 'command' ? 'command' : draftView;

        // Restore board data from localStorage on mount
        useEffect(() => {
            if (boardData) {
                if (boardData.tags) setBoardTags(boardData.tags);
                if (boardData.notes) setBoardNotes(boardData.notes);
                if (boardData.drafted) setDraftedPids(new Set(boardData.drafted));
                if (boardData.myOrder) setMyBoardOrder(boardData.myOrder);
                if (['dhq', 'ai', 'my'].includes(boardData.activeLane || boardData.boardMode)) setBoardMode(boardData.activeLane || boardData.boardMode);
            }
        }, []);

        // Fetch draft countdown info from Sleeper
        useEffect(() => {
            if (!currentLeague?.id) return;
            fetch('https://api.sleeper.app/v1/league/' + (currentLeague.league_id || currentLeague.id) + '/drafts')
                .then(r => r.ok ? r.json() : [])
                .then(drafts => {
                    const upcoming = drafts.find(d => d.status === 'pre_draft') || drafts[0];
                    if (upcoming) setDraftInfo(upcoming);
                })
                .catch(err => window.wrLog('draft.draftFetch', err));
        }, [currentLeague]);

        // Helper: get player display name
        const pName = (p) => p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown';

        const leagueSize = currentLeague?.rosters?.length || currentLeague?.settings?.num_teams || window.S?.rosters?.length || 12;

        const boardPoolForContext = useMemo(() => rookies.map(r => {
            const pos = normPos(r.p?.position || r.csv?.mappedPos || r.csv?.pos || '');
            return {
                pid: r.pid,
                csvPid: r.csv?.pid || null,
                name: pName(r.p),
                pos,
                position: pos,
                dhq: Number(r.dhq || 0),
                val: Number(r.dhq || 0),
                age: r.p?.age || r.csv?.age || null,
                tier: r.csv?.tier || null,
                consensusRank: r.csv?.consensusRank || r.csv?.rank || null,
                rank: r.csv?.rank || null,
                nflTeam: r.csv?.nflTeam || r.p?.team || null,
                school: r.csv?.college || r.p?.college || r.p?.metadata?.college || null,
                photoUrl: 'https://sleepercdn.com/content/nfl/players/thumb/' + r.pid + '.jpg',
                csv: r.csv || null,
            };
        }), [rookies]);

        const boardContextForRoom = useMemo(() => {
            try {
                if (!window.DraftCC?.context?.buildBoardContext) return null;
                return window.DraftCC.context.buildBoardContext({
                    leagueId: leagueKey,
                    currentLeague,
                    pool: boardPoolForContext,
                    userAssessment: assess,
                    draftType: 'rookie',
                });
            } catch (e) {
                if (window.wrLog) window.wrLog('draftRoom.boardContext', e);
                return null;
            }
        }, [leagueKey, currentLeague, boardPoolForContext, assess]);

        const aiRecommendedOrder = useMemo(() => {
            const fromContext = boardContextForRoom?.lanes?.ai?.order || boardContextForRoom?.lanes?.AI?.order || [];
            if (fromContext.length) return fromContext;
            return rookies.slice()
                .sort((a, b) => {
                    const af = computeFitScore(a).score;
                    const bf = computeFitScore(b).score;
                    const aScore = Number(a.dhq || 0) + af * 18;
                    const bScore = Number(b.dhq || 0) + bf * 18;
                    if (bScore !== aScore) return bScore - aScore;
                    return (Number(b.dhq || 0) - Number(a.dhq || 0));
                })
                .map(r => r.pid);
        }, [boardContextForRoom, rookies, computeFitScore]);

        const applyAiOrderToUserBoard = useCallback((scope = 'master') => {
            if (!aiRecommendedOrder.length) return;
            if (scope === 'position' && boardPosFilter) {
                const positionSet = new Set(rookies.filter(r => normPos(r.p.position) === boardPosFilter).map(r => r.pid));
                setMyBoardOrder(prev => {
                    const base = prev.length ? prev.slice() : aiRecommendedOrder.slice();
                    const locked = base.filter(pid => !positionSet.has(pid));
                    const rankedPosition = aiRecommendedOrder.filter(pid => positionSet.has(pid));
                    const insertAt = Math.max(0, base.findIndex(pid => positionSet.has(pid)));
                    if (insertAt < 0) return rankedPosition.concat(locked);
                    const next = locked.slice();
                    next.splice(insertAt, 0, ...rankedPosition);
                    return next;
                });
            } else {
                setMyBoardOrder(aiRecommendedOrder.slice());
            }
            setBoardMode('my');
            setDraftView('board');
        }, [aiRecommendedOrder, boardPosFilter, rookies, normPos]);

        // Auto-save board data to localStorage on changes. The AI order is saved
        // so mocks, context, and the visible Big Board share one recommendation source.
        useEffect(() => {
            DraftStorage.set(boardStorageKey,
                {
                    tags: boardTags,
                    notes: boardNotes,
                    drafted: Array.from(draftedPids),
                    aiOrder: aiRecommendedOrder,
                    myOrder: myBoardOrder,
                    activeLane: boardMode,
                    lineage: {
                        source: 'wr_bigboard',
                        seededFrom: myBoardOrder.length ? null : 'ai',
                        aiGeneratedAt: new Date().toISOString(),
                        userLastEditedAt: new Date().toISOString(),
                    },
                    updatedAt: new Date().toISOString(),
                });
        }, [boardTags, boardNotes, draftedPids, aiRecommendedOrder, myBoardOrder, boardMode, boardStorageKey]);

        const draftProjectionMeta = useMemo(() => {
            const rosters = currentLeague?.rosters || window.S?.rosters || [];
            const users = currentLeague?.users || window.S?.leagueUsers || [];
            const myUid = window.S?.user?.user_id || sleeperUserId || '';
            const myRid = myRoster?.roster_id;
            const sleeperOrder = draftInfo?.draft_order || {};
            const slotToRoster = {};
            const hasRealDraftOrder = Object.keys(sleeperOrder).length > 0;

            if (hasRealDraftOrder) {
                Object.entries(sleeperOrder).forEach(([userId, slot]) => {
                    const roster = rosters.find(r => sameId(r.owner_id, userId));
                    const user = users.find(u => sameId(u.user_id, userId));
                    const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + slot;
                    slotToRoster[slot] = { rosterId: roster?.roster_id, ownerName: name, userId };
                });
            } else {
                const sorted = [...rosters].sort((a, b) => {
                    const aw = a.settings?.wins || 0;
                    const bw = b.settings?.wins || 0;
                    if (aw !== bw) return aw - bw;
                    const ap = (a.settings?.fpts || 0) + (a.settings?.fpts_decimal || 0) / 100;
                    const bp = (b.settings?.fpts || 0) + (b.settings?.fpts_decimal || 0) / 100;
                    return ap - bp;
                });
                sorted.forEach((r, i) => {
                    const user = users.find(u => sameId(u.user_id, r.owner_id));
                    const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + (i + 1);
                    slotToRoster[i + 1] = { rosterId: r.roster_id, ownerName: name, userId: r.owner_id };
                });
            }

            const totalTeams = draftInfo?.settings?.teams || currentLeague?.settings?.num_teams || Math.max(leagueSize, Object.keys(slotToRoster).length || 12);
            const mappedRosterIds = new Set(Object.values(slotToRoster).map(e => e.rosterId).filter(Boolean));
            const unmappedRosters = rosters.filter(r => !mappedRosterIds.has(r.roster_id));
            let ghostIdx = 0;
            for (let slot = 1; slot <= totalTeams; slot++) {
                if (slotToRoster[slot]) continue;
                const r = unmappedRosters[ghostIdx++] || {};
                const user = r.owner_id ? users.find(u => sameId(u.user_id, r.owner_id)) : null;
                const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + slot;
                slotToRoster[slot] = { rosterId: r.roster_id || null, ownerName: name, userId: r.owner_id || null };
            }

            let mySlot = null;
            Object.entries(slotToRoster).some(([slot, info]) => {
                if (sameId(info.userId, myUid) || sameId(info.rosterId, myRid)) {
                    mySlot = parseInt(slot, 10);
                    return true;
                }
                return false;
            });
            if (!mySlot && myRid != null) {
                mySlot = 1;
                slotToRoster[1] = { rosterId: myRid, ownerName: 'YOU', userId: myUid || null };
            }

            const rounds = draftInfo?.settings?.rounds || draftRounds || currentLeague?.settings?.draft_rounds || 5;
            const draftType = draftInfo?.type || 'snake';
            const pickOwnership = {};
            for (let rd = 1; rd <= rounds; rd++) {
                for (let slot = 1; slot <= totalTeams; slot++) {
                    const origInfo = slotToRoster[slot] || {};
                    const origRid = origInfo.rosterId;
                    const traded = tradedPicks.find(tp =>
                        Number(tp.round) === rd
                        && sameId(tp.roster_id, origRid)
                        && !sameId(tp.owner_id, origRid)
                        && sameId(tp.season, leagueSeason)
                    );
                    if (traded) {
                        const newOwner = rosters.find(r => sameId(r.roster_id, traded.owner_id));
                        const newUser = users.find(u => sameId(u.user_id, newOwner?.owner_id));
                        pickOwnership[rd + '-' + slot] = {
                            ownerName: newUser?.metadata?.team_name || newUser?.display_name || 'Team',
                            rosterId: traded.owner_id,
                            traded: true,
                            originalOwner: origInfo.ownerName,
                        };
                    } else {
                        pickOwnership[rd + '-' + slot] = {
                            ownerName: origInfo.ownerName || 'Team ' + slot,
                            rosterId: origRid,
                            traded: false,
                        };
                    }
                }
            }

            return {
                mySlot: mySlot || Math.min(6, totalTeams),
                slotToRoster,
                pickOwnership,
                numTeams: totalTeams,
                rounds,
                draftType,
            };
        }, [currentLeague, myRoster, sleeperUserId, draftInfo, draftRounds, leagueSize, tradedPicks, leagueSeason]);

        const draftStrategyProfile = useMemo(() => {
            try {
                if (window.DraftCC?.state?.loadDraftStrategyProfile) {
                    return window.DraftCC.state.loadDraftStrategyProfile(leagueKey, { variant: 'rookie' });
                }
            } catch (e) {
                if (window.wrLog) window.wrLog('draftRoom.strategyProfile', e);
            }
            return null;
        }, [leagueKey, timeRecomputeTs]);

        const draftProjectionState = useMemo(() => {
            const stateFns = window.DraftCC?.state || {};
            const pickOrder = stateFns.buildPickOrder
                ? stateFns.buildPickOrder(draftProjectionMeta.rounds, draftProjectionMeta.numTeams, draftProjectionMeta.draftType, draftProjectionMeta.slotToRoster, draftProjectionMeta.pickOwnership)
                : [];
            const base = stateFns.initialDraftState ? stateFns.initialDraftState({
                leagueId: leagueKey,
                season: leagueSeason,
                variant: 'rookie',
                mode: 'solo',
                rounds: draftProjectionMeta.rounds,
                leagueSize: draftProjectionMeta.numTeams,
                draftType: draftProjectionMeta.draftType,
                userRosterId: myRoster?.roster_id || null,
                userSlot: draftProjectionMeta.mySlot,
                draftTuning: draftStrategyProfile?.tuning || stateFns.DEFAULT_DRAFT_TUNING,
                strategyProfile: draftStrategyProfile,
            }) : {
                leagueId: leagueKey,
                season: leagueSeason,
                variant: 'rookie',
                mode: 'solo',
                rounds: draftProjectionMeta.rounds,
                leagueSize: draftProjectionMeta.numTeams,
                draftType: draftProjectionMeta.draftType,
                userRosterId: myRoster?.roster_id || null,
                userSlot: draftProjectionMeta.mySlot,
                draftTuning: draftStrategyProfile?.tuning || {},
                strategyProfile: draftStrategyProfile,
            };
            const next = {
                ...base,
                pool: boardPoolForContext,
                originalPool: boardPoolForContext,
                pickOrder,
                personas: {},
            };
            try {
                if (window.DraftCC?.context?.buildDraftContext) {
                    next.draftContext = window.DraftCC.context.buildDraftContext({
                        state: next,
                        leagueId: leagueKey,
                        currentLeague,
                        myRoster,
                        pool: boardPoolForContext,
                        pickOrder,
                    });
                }
            } catch (e) {
                if (window.wrLog) window.wrLog('draftRoom.projectionContext', e);
            }
            return next;
        }, [leagueKey, leagueSeason, currentLeague, myRoster, boardPoolForContext, draftProjectionMeta, draftStrategyProfile]);

        const flashRoundOptions = useMemo(() => {
            const maxRounds = Math.max(1, Math.min(100, Number(draftProjectionMeta.rounds || draftRounds || 1)));
            return Array.from({ length: maxRounds }, (_, idx) => String(idx + 1));
        }, [draftProjectionMeta.rounds, draftRounds]);

        const flashAnalystPresetOptions = useMemo(() => {
            const presets = window.DraftCC?.analystMock?.PRESETS || [];
            const realisticIds = ['league-history', 'my-board', 'trade-heavy'];
            const labels = {
                'league-history': 'League Reality',
                'my-board': 'My Board Lens',
                'trade-heavy': 'Trade Market',
            };
            return realisticIds
                .map(id => {
                    const preset = presets.find(p => p.id === id);
                    return preset ? { ...preset, label: labels[id] || preset.label } : null;
                })
                .filter(Boolean);
        }, []);

        const flashAnalystPreviewReports = useMemo(() => {
            const engine = window.DraftCC?.analystMock;
            if (!engine?.generateProjectedMock || !boardPoolForContext.length || !flashAnalystPresetOptions.length) return [];
            return flashAnalystPresetOptions.map(preset => {
                try {
                    return engine.generateProjectedMock({
                        state: draftProjectionState,
                        draftMeta: draftProjectionMeta,
                        playersData,
                        currentLeague,
                        myRoster,
                        presetId: preset.id,
                        roundLimit: 1,
                        pickOrder: draftProjectionState.pickOrder,
                    });
                } catch (e) {
                    if (window.wrLog) window.wrLog('draftRoom.flashAnalystPreview', e);
                    return null;
                }
            }).filter(Boolean);
        }, [boardPoolForContext.length, flashAnalystPresetOptions, draftProjectionState, draftProjectionMeta, playersData, currentLeague, myRoster]);

        const generateFlashAnalystMock = useCallback(() => {
            const engine = window.DraftCC?.analystMock;
            if (!engine?.generateProjectedMock || !boardPoolForContext.length) return;
            setFlashAnalystStatus('running');
            setFlashAnalystError('');
            try {
                const report = engine.generateProjectedMock({
                    state: draftProjectionState,
                    draftMeta: draftProjectionMeta,
                    playersData,
                    currentLeague,
                    myRoster,
                    presetId: flashAnalystPresetId,
                    roundLimit: flashAnalystRoundLimit,
                    pickOrder: draftProjectionState.pickOrder,
                });
                setFlashAnalystReports(prev => [report].concat(prev.filter(r => r.presetId !== report.presetId)).slice(0, 3));
                setFlashAnalystStatus('ready');
            } catch (e) {
                if (window.wrLog) window.wrLog('draftRoom.flashAnalystMock', e);
                setFlashAnalystError(e?.message || 'Projection failed.');
                setFlashAnalystStatus('error');
            }
        }, [boardPoolForContext.length, draftProjectionState, draftProjectionMeta, playersData, currentLeague, myRoster, flashAnalystPresetId, flashAnalystRoundLimit]);

        const activeFlashAnalystReport = flashAnalystReports.find(r => r.presetId === flashAnalystPresetId) || null;
        const activeFlashPreviewReport = flashAnalystPreviewReports.find(r => r.presetId === flashAnalystPresetId) || flashAnalystPreviewReports[0] || null;
        const activeFlashAlexBrief = useMemo(() => {
            const engine = window.DraftCC?.analystMock;
            if (!engine?.formatAlexSlackBrief || !activeFlashAnalystReport) return null;
            return engine.formatAlexSlackBrief(activeFlashAnalystReport, draftProjectionState, { maxLines: 'all' });
        }, [activeFlashAnalystReport, draftProjectionState]);

        const openDraftPlayer = useCallback((pid) => {
            if (!pid) return;
            if (window.WR?.openPlayerCard) window.WR.openPlayerCard(pid);
            else if (window._wrSelectPlayer) window._wrSelectPlayer(pid);
        }, []);

        const slotMap = useMemo(() => {
            const rosters = currentLeague?.rosters || window.S?.rosters || [];
            const sorted = [...rosters].sort((a, b) => {
                const aW = a.settings?.wins || 0;
                const bW = b.settings?.wins || 0;
                if (aW !== bW) return aW - bW;
                const aP = (a.settings?.fpts || 0) + (a.settings?.fpts_decimal || 0) / 100;
                const bP = (b.settings?.fpts || 0) + (b.settings?.fpts_decimal || 0) / 100;
                return aP - bP;
            });
            const m = {};
            sorted.forEach((r, i) => { m[String(r.roster_id)] = i + 1; });
            return m;
        }, [currentLeague?.rosters, timeRecomputeTs]);

        const slotFor = useCallback((pk) => {
            if (!pk) return null;
            const src = pk.own ? myRoster?.roster_id : pk.from;
            return src != null ? slotMap[String(src)] : null;
        }, [slotMap, myRoster?.roster_id]);

        const fmtPick = useCallback((pk) => {
            if (!pk) return '--';
            const slot = slotFor(pk);
            return pk.year + ' ' + pk.round + '.' + (slot ? String(slot).padStart(2, '0') : '??');
        }, [slotFor]);

        const pickYears = useMemo(() => [leagueSeason, leagueSeason + 1, leagueSeason + 2], [leagueSeason]);
        const fmtDhq = n => Number(n || 0).toLocaleString();
        const pickValueFor = useCallback((pk) => {
            const slot = slotFor(pk);
            if (!slot) return 0;
            try {
                const resolved = window.DraftCC?.state?.resolveDraftPickValue?.({
                    season: pk.year,
                    round: pk.round,
                    slot,
                    totalTeams: leagueSize,
                    leagueSize,
                    draftRounds,
                });
                return Number(resolved?.value || 0) || 0;
            } catch (_) {
                return 0;
            }
        }, [slotFor, leagueSize, draftRounds]);
        const pickCapitalRows = useMemo(() => {
            return pickYears.map(yr => {
                const picks = myPicks
                    .filter(pk => pk.year === yr)
                    .sort((a, b) => {
                        if (a.round !== b.round) return a.round - b.round;
                        return (slotFor(a) || 99) - (slotFor(b) || 99);
                    })
                    .map(pk => ({ ...pk, slot: slotFor(pk), value: pickValueFor(pk) }));
                return {
                    year: yr,
                    picks,
                    totalValue: picks.reduce((sum, pk) => sum + Number(pk.value || 0), 0),
                };
            });
        }, [pickYears, myPicks, slotFor, pickValueFor]);
        const currentCapitalRow = pickCapitalRows.find(row => row.year === leagueSeason) || { year: leagueSeason, picks: [], totalValue: 0 };
        const futureCapitalRows = pickCapitalRows.filter(row => row.year !== leagueSeason);
        const totalPickCapital = pickCapitalRows.reduce((sum, row) => sum + row.totalValue, 0);
        const futurePickCapital = futureCapitalRows.reduce((sum, row) => sum + row.totalValue, 0);

        // Next pick info
        const nextPick = useMemo(() => {
            return myPicks
                .filter(pk => pk.year === leagueSeason)
                .slice()
                .sort((a, b) => {
                    if (a.round !== b.round) return a.round - b.round;
                    return (slotFor(a) || 99) - (slotFor(b) || 99);
                })[0] || null;
        }, [myPicks, leagueSeason, slotFor]);

        const nextSlot = nextPick ? slotFor(nextPick) : null;
        const nextPickOverall = nextPick ? ((nextPick.round - 1) * leagueSize) + (nextSlot || Math.ceil(leagueSize / 2)) : null;
        const picksBeforeNext = nextPickOverall ? Math.max(0, nextPickOverall - 1) : 0;
        const highestCurrentPickRound = Math.max(1, ...myPicks.filter(pk => pk.year === leagueSeason).map(pk => Number(pk.round || 1)));
        const nextPickLabel = nextPick ? fmtPick(nextPick).replace(String(leagueSeason) + ' ', '') : 'next pick';

        const leagueDraftProfile = useMemo(() => {
            const scoring = currentLeague?.scoring_settings || {};
            const rosterSlots = currentLeague?.roster_positions || [];
            const starters = {};
            rosterSlots.forEach(slot => {
                const raw = String(slot || '').toUpperCase();
                if (raw === 'BN' || raw === 'IR' || raw === 'TAXI') return;
                const pos = raw === 'SUPER_FLEX' || raw === 'OP' || raw === 'QB_FLEX' ? 'QB'
                    : raw === 'FLEX' || raw === 'WRRB_FLEX' ? 'WR'
                    : raw === 'REC_FLEX' || raw === 'WRRBTE_FLEX' ? 'WR'
                    : normPos(raw) || raw;
                starters[pos] = (starters[pos] || 0) + 1;
            });
            const rec = Number(scoring.rec || 0);
            const tePremium = Number(scoring.bonus_rec_te || scoring.rec_te_bonus || 0);
            const passTd = Number(scoring.pass_td || 4);
            const idpKeys = ['solo_tkl', 'tackle_solo', 'tackle', 'sack', 'int', 'pass_defended', 'idp_tkl_solo'];
            const idpWeight = idpKeys.reduce((sum, key) => sum + Math.max(0, Number(scoring[key] || 0)), 0);
            const multiplierFor = (pos) => {
                const p = normPos(pos) || pos;
                let mult = 1 + Math.min(0.22, (starters[p] || 0) * 0.035);
                if (p === 'QB' && ((starters.QB || 0) >= 2 || rosterSlots.some(s => ['SUPER_FLEX', 'OP', 'QB_FLEX'].includes(String(s || '').toUpperCase())))) mult += 0.18;
                if (p === 'TE' && (tePremium > 0 || rec >= 1)) mult += tePremium > 0 ? 0.16 : 0.06;
                if (p === 'RB' && rec >= 1) mult += 0.05;
                if (p === 'WR' && rec >= 1) mult += 0.04;
                if (['DL', 'LB', 'DB'].includes(p) && idpWeight > 0) mult += Math.min(0.18, idpWeight / 55);
                return mult;
            };
            const formatBits = [];
            if ((starters.QB || 0) >= 2 || rosterSlots.some(s => ['SUPER_FLEX', 'OP', 'QB_FLEX'].includes(String(s || '').toUpperCase()))) formatBits.push('QB/SF');
            if (rec >= 1) formatBits.push('PPR');
            if (tePremium > 0) formatBits.push('TE premium');
            if (idpWeight > 0) formatBits.push('IDP');
            return { starters, multiplierFor, label: formatBits.length ? formatBits.join(' + ') : 'league format' };
        }, [currentLeague?.scoring_settings, currentLeague?.roster_positions, normPos]);

        const alexRosterNote = useCallback((pos, priorityScore, targetName, targetDhq) => {
            const p = normPos(pos) || pos || 'this position';
            const target = targetName || 'a clean tier fit';
            const dhqText = targetDhq ? ' (' + fmtDhq(targetDhq) + ' DHQ)' : '';
            const pickText = nextPickLabel || 'our next pick';
            if (priorityScore >= 300) {
                if (p === 'QB') return 'I see QB as a real lineup pressure point. If ' + target + dhqText + ' reaches ' + pickText + ', I would rather solve the weekly ceiling problem than chase a luxury tier.';
                if (p === 'TE') return 'I see TE as the cleanest way to change our roster shape. If ' + target + dhqText + ' survives to ' + pickText + ', I want to attack it before the cliff turns ugly.';
                if (['DL', 'LB', 'DB'].includes(p)) return 'I see ' + p + ' as an IDP pressure spot, not a vanity pick. If ' + target + dhqText + ' is there, it keeps us from paying future capital after the room realizes the tier is gone.';
                return 'I see ' + p + ' as a real roster pressure point. If ' + target + dhqText + ' reaches ' + pickText + ', I want to close that gap while the DHQ value still lines up.';
            }
            if (priorityScore >= 200) {
                if (p === 'RB') return 'I read RB as a depth and age-risk lane. I do not want to force it, but ' + target + dhqText + ' should be a tie-breaker if the board flattens.';
                if (p === 'WR') return 'I read WR as a depth squeeze more than an emergency. Keep ' + target + dhqText + ' active, but only jump if the tier holds real value at ' + pickText + '.';
                return 'I read ' + p + ' as an active lane, not a panic spot. ' + target + dhqText + ' matters if the board gives us the value, but I would still let DHQ settle the tie.';
            }
            return 'I would keep ' + p + ' on the watch list. ' + target + dhqText + ' is useful if the room lets value fall, but this should not pull us away from a better tier.';
        }, [normPos, nextPickLabel, fmtDhq]);

        const pressureProjectionReport = useMemo(() => {
            const engine = window.DraftCC?.analystMock;
            if (!engine?.generateProjectedMock || !boardPoolForContext.length) return null;
            try {
                const roundLimit = Math.max(1, Math.min(Number(draftProjectionMeta.rounds || draftRounds || 1), highestCurrentPickRound));
                return engine.generateProjectedMock({
                    state: draftProjectionState,
                    draftMeta: draftProjectionMeta,
                    playersData,
                    currentLeague,
                    myRoster,
                    presetId: 'league-history',
                    roundLimit,
                    pickOrder: draftProjectionState.pickOrder,
                });
            } catch (e) {
                if (window.wrLog) window.wrLog('draftRoom.pressureProjection', e);
                return null;
            }
        }, [boardPoolForContext.length, draftProjectionState, draftProjectionMeta, playersData, currentLeague, myRoster, highestCurrentPickRound, draftRounds]);
        const draftPredictionReport = activeFlashAnalystReport || pressureProjectionReport || activeFlashPreviewReport;

        // Top prospects with fit
        const topProspects = useMemo(() => {
            return rookies.slice(0, 160).map(r => ({ ...r, fit: computeFitScore(r) }));
        }, [rookies, computeFitScore]);

        // Strategy recommendation — must be declared before recommendations (which depends on it)
        const strategyRec = useMemo(() => {
            if (!rosterState.isUsable) return { type: 'sync', label: 'Sync roster', reason: 'Roster targeting is paused until player IDs finish loading.' };
            if (!assess || !assess.needs || !assess.needs.length) return { type: 'bpa', label: 'Go BPA', reason: 'No clear positional needs detected.' };
            const critical = assess.needs.filter(n => n.urgency === 'deficit');
            if (critical.length > 0) {
                return { type: 'target', label: 'Target ' + critical[0].pos, reason: critical[0].pos + ' is a critical need (' + critical.length + ' deficit position' + (critical.length > 1 ? 's' : '') + ').' };
            }
            return { type: 'bpa', label: 'Go BPA', reason: 'Needs are thin but not critical. Take the best player available.' };
        }, [rosterState.isUsable, assess]);

        // Best recommendations for next pick
        const recommendations = useMemo(() => {
            if (!rosterState.isUsable) return [];
            const targetPos = (strategyRec?.type === 'target' && strategyRec?.label) ? strategyRec.label.replace('Target ', '') : null;

            return topProspects
                .map((r, i) => ({ ...r, expectedRank: i + 1 }))
                .filter(r => !draftedPids.has(r.pid) && (!nextPickOverall || r.expectedRank > picksBeforeNext))
                .map(r => {
                    const pos = normPos(r.p.position) || r.p.position;
                    const hasCapital = Number(r.csv?.draftRound) > 0 || Number(r.csv?.draftPick) > 0;
                    const isUdfaOnly = !!r.csv?.isUDFA && !hasCapital;
                    const needEntry = assess?.needs?.find(n => n.pos === pos);
                    const nearPickBonus = nextPickOverall ? Math.max(0, 22 - Math.abs(r.expectedRank - nextPickOverall)) * 18 : 0;
                    const needBonus = needEntry?.urgency === 'deficit' ? 1700 : needEntry ? 850 : 0;
                    const targetBonus = targetPos && pos === targetPos ? 1200 : 0;
                    const score = r.dhq * 0.58 + r.fit.score * 55 + nearPickBonus + needBonus + targetBonus;
                    const availability = !nextPickOverall ? 72
                        : r.expectedRank <= nextPickOverall + 2 ? 54
                        : r.expectedRank <= nextPickOverall + leagueSize ? 73
                        : 88;
                    const draftCapital = r.csv?.draftRound
                        ? 'NFL R' + r.csv.draftRound + (r.csv.draftPick ? ' P' + r.csv.draftPick : '')
                        : (isUdfaOnly ? 'UDFA' : 'Capital TBD');
                    const reason = needEntry
                        ? (needEntry.urgency === 'deficit' ? 'Closes a critical ' + pos + ' room while staying near board value.' : 'Adds useful ' + pos + ' depth without reaching past the tier.')
                        : 'Best-player-available candidate with enough value to override lesser needs.';
                    const riskLabel = r.csv?.risk || (r.csv?.draftRound && r.csv.draftRound <= 2 ? 'Lower risk' : isUdfaOnly ? 'Long shot' : 'Market risk');
                    return { ...r, pos, needEntry, score, availability, draftCapital, reason, riskLabel };
                })
                .sort((a, b) => {
                    return b.score - a.score;
                })
                .slice(0, 8);
        }, [rosterState.isUsable, topProspects, draftedPids, strategyRec, nextPickOverall, picksBeforeNext, assess, leagueSize]);

        const likelyGoneBeforePick = useMemo(() => {
            if (!nextPickOverall) return [];
            const projected = (draftPredictionReport?.picks || [])
                .filter(p => Number(p.overall) < Number(nextPickOverall))
                .map(p => ({
                    pos: normPos(p.pos) || p.pos || 'UNK',
                    name: p.name,
                    source: 'analyst',
                }));
            if (projected.length) return projected;
            return topProspects
                .filter(r => !draftedPids.has(r.pid))
                .slice(0, Math.max(0, picksBeforeNext))
                .map(r => ({
                    pos: normPos(r.p.position) || r.p.position || 'UNK',
                    name: pName(r.p),
                    source: 'board',
                }));
        }, [draftPredictionReport, topProspects, draftedPids, nextPickOverall, picksBeforeNext]);

        const positionRunRows = useMemo(() => {
            const map = {};
            likelyGoneBeforePick.forEach(r => {
                const pos = r.pos || 'UNK';
                if (!map[pos]) map[pos] = { pos, count: 0, names: [] };
                map[pos].count += 1;
                if (map[pos].names.length < 2) map[pos].names.push(r.name);
            });
            return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6);
        }, [likelyGoneBeforePick]);

        const classDepthRows = useMemo(() => {
            const map = {};
            topProspects
                .slice()
                .sort((a, b) => {
                    const aPos = normPos(a.p.position) || a.p.position || 'UNK';
                    const bPos = normPos(b.p.position) || b.p.position || 'UNK';
                    const aScore = Number(a.dhq || 0) * leagueDraftProfile.multiplierFor(aPos) + Number(a.fit?.score || 0) * 28;
                    const bScore = Number(b.dhq || 0) * leagueDraftProfile.multiplierFor(bPos) + Number(b.fit?.score || 0) * 28;
                    return bScore - aScore;
                })
                .slice(0, 60)
                .forEach(r => {
                const pos = normPos(r.p.position) || r.p.position || 'UNK';
                if (!map[pos]) map[pos] = { pos, count: 0, top: pName(r.p), topPid: r.pid };
                map[pos].count += 1;
            });
            return Object.values(map).sort((a, b) => b.count - a.count || a.pos.localeCompare(b.pos)).map(row => {
                const starterCount = leagueDraftProfile.starters[row.pos] || 0;
                const formatLabel = leagueDraftProfile.label;
                let alexBlurb = 'I am reading this through ' + formatLabel + ', so the top-60 count is adjusted for lineup and scoring value. Track the next cliff, then let DHQ decide if the board stays flat.';
                if (row.count >= 14) {
                    alexBlurb = 'I see real depth here after adjusting for ' + formatLabel + '. We can stay patient, let the room spend early capital, then attack the value pocket before the tier dries up.';
                } else if (row.count <= 6) {
                    alexBlurb = 'I see a thinner group here' + (starterCount ? ' for a lineup that starts ' + starterCount + ' ' + row.pos : '') + '. If this matters to our build, the top name is fragile and should not be assumed to fall.';
                }
                return { ...row, alexBlurb };
            });
        }, [topProspects, normPos, leagueDraftProfile]);

        const needLabels = useMemo(() => {
            if (!rosterState.isUsable) return [];
            const urgencyScore = urgency => {
                const u = String(urgency || '').toLowerCase();
                if (u.includes('deficit') || u.includes('critical')) return 300;
                if (u.includes('thin') || u.includes('high')) return 200;
                return 100;
            };
            const available = topProspects.filter(r => !draftedPids.has(r.pid));
            return (assess?.needs || [])
                .map((raw, idx) => {
                    const item = typeof raw === 'string' ? { pos: raw, urgency: 'thin' } : raw;
                    const pos = normPos(item?.pos) || item?.pos;
                    const target = available.find(r => (normPos(r.p.position) || r.p.position) === pos);
                    const urgency = item?.urgency || item?.level || 'thin';
                    const score = urgencyScore(urgency) + Math.max(0, 40 - idx * 8) + (Number(item?.count || 0) ? Math.max(0, 18 - Number(item.count) * 3) : 0);
                    const targetName = target ? pName(target.p) : null;
                    const priorityScore = urgencyScore(urgency);
                    const alexBlurb = alexRosterNote(pos, priorityScore, targetName, target?.dhq || 0);
                    return {
                        ...item,
                        pos,
                        urgency,
                        score,
                        priorityLabel: priorityScore >= 300 ? 'Critical priority' : priorityScore >= 200 ? 'High priority' : 'Watch priority',
                        targetName,
                        targetPid: target?.pid || '',
                        targetDhq: target?.dhq || 0,
                        alexBlurb,
                    };
                })
                .filter(n => n.pos && !['K', 'P'].includes(n.pos))
                .sort((a, b) => b.score - a.score)
                .slice(0, 6);
        }, [rosterState.isUsable, assess, topProspects, draftedPids, alexRosterNote]);

        const userMockRows = useMemo(() => {
            const picks = (draftPredictionReport?.picks || []).filter(p =>
                sameId(p.rosterId, myRoster?.roster_id)
                || (!p.rosterId && Number(p.slot) === Number(draftProjectionMeta.mySlot))
            );
            return picks
                .filter(pick => !['K', 'P'].includes(normPos(pick.pos)) || Number(pick.round || 0) >= 6)
                .map(pick => {
                    const pos = normPos(pick.pos) || pick.pos;
                    const fallback = 'We should take ' + pick.name + ' here only if the room leaves us this exact value pocket. The reason is ' + pos + ' utility for our build, not simply that he is the next player on the board.';
                    const rawImpact = pick.alexCommentary?.roomImpact || pick.alexCommentary?.teamImpact || pick.note || fallback;
                    let impact = String(rawImpact || fallback).trim()
                        .replace(/^[^.]+ projects to take [^.]+\.?\s*/i, '')
                        .replace(/^(This roster|The roster)\s+/i, 'We ');
                    if (/^For your build,\s*this becomes/i.test(impact)) {
                        impact = impact.replace(/^For your build,\s*this becomes/i, 'We should use this as');
                    } else if (/^For your build,/i.test(impact)) {
                        impact = impact.replace(/^For your build,\s*/i, 'We should ');
                    } else if (/^For you,/i.test(impact)) {
                        impact = impact.replace(/^For you,\s*/i, 'We should account for how ');
                    }
                    return {
                        ...pick,
                        pos,
                        pickLabel: pick.round + '.' + String(pick.slot).padStart(2, '0'),
                        school: pick.school || pick.college || 'School TBD',
                        nflTeam: pick.nflTeam || pick.team || 'Team TBD',
                        photoUrl: pick.photoUrl || (pick.pid ? 'https://sleepercdn.com/content/nfl/players/thumb/' + pick.pid + '.jpg' : ''),
                        impact: /^we\b/i.test(impact) ? impact : 'We should ' + impact.charAt(0).toLowerCase() + impact.slice(1),
                        driverText: (pick.drivers || []).slice(0, 3).map(d => d.label).join(' - ') || 'projection',
                    };
                });
        }, [draftPredictionReport, myRoster?.roster_id, draftProjectionMeta.mySlot]);

        const compactPickLabel = useCallback((pk) => {
            if (!pk) return '--';
            return fmtPick(pk).replace(String(leagueSeason) + ' ', '');
        }, [fmtPick, leagueSeason]);

        const alexPickPlanText = useCallback((pick, pos, targetName, targetNeed, idx) => {
            const label = pick ? compactPickLabel(pick) : (idx ? 'later pick' : nextPickLabel);
            const needWord = targetNeed?.priorityLabel ? targetNeed.priorityLabel.toLowerCase() : 'board value';
            if (targetNeed) {
                return 'At ' + label + ', I want ' + targetName + ' because ' + pos + ' is already one of our real roster pressure points. This is not just taking the top name left; it is using the pick to fix a lineup problem while the value is still defendable.';
            }
            if (pos === 'QB') return 'At ' + label + ', I would only take ' + targetName + ' if the room leaves us a real QB value pocket. The point is insulation and weekly ceiling, not collecting another name.';
            if (pos === 'RB') return 'At ' + label + ', ' + targetName + ' makes sense if we need a younger value swing against the roster age curve. I would not force RB over a cleaner tier at another position.';
            if (['DL', 'LB', 'DB'].includes(pos)) return 'At ' + label + ', ' + targetName + ' is an IDP value bet. I would take it only if the room has not already drained the tier before our pick.';
            return 'At ' + label + ', I would use ' + targetName + ' as a ' + needWord + ' checkpoint. If the board is flat, this is the kind of pick that keeps our build flexible without sacrificing DHQ.';
        }, [compactPickLabel, nextPickLabel]);

        const alexCommand = useMemo(() => {
            const nextLabel = nextPick ? compactPickLabel(nextPick) : 'our next pick';
            const topNeed = needLabels[0];
            const topTarget = (topNeed && recommendations.find(r => (normPos(r.pos || r.p?.position) || r.pos) === topNeed.pos && !['K', 'P'].includes(normPos(r.pos || r.p?.position))))
                || recommendations.find(r => !['K', 'P'].includes(normPos(r.pos || r.p?.position)))
                || recommendations[0];
            const pressure = positionRunRows[0];
            const pickPath = currentCapitalRow.picks.slice(0, 4).map(compactPickLabel).join(', ') || nextLabel;
            if (topNeed && topTarget) {
                return 'I am reading our actual current-year path (' + pickPath + '). At ' + nextLabel + ', I want ' + topNeed.pos + ' value if ' + pName(topTarget.p) + ' holds, keep DHQ as the tie-breaker, and do not burn future capital unless the tier cliff hits.';
            }
            if (pressure) {
                return 'I am reading our actual current-year path (' + pickPath + ') and watching the ' + pressure.pos + ' run before ' + nextLabel + '. Use our board only if the DHQ edge is still clean.';
            }
            return 'I am keeping this draft value-led around our actual current-year path (' + pickPath + '): hold the board, keep future capital liquid, and only move when the next tier is clearly breaking.';
        }, [nextPick, compactPickLabel, needLabels, recommendations, positionRunRows, currentCapitalRow.picks, normPos]);

        const alexCommandChips = useMemo(() => {
            const nextLabel = nextPick ? compactPickLabel(nextPick) : 'not set';
            const pressure = positionRunRows[0];
            const topNeed = needLabels[0];
            const latePick = currentCapitalRow.picks.find(pk => Number(pk.round) >= 5) || currentCapitalRow.picks[currentCapitalRow.picks.length - 1];
            return [
                { label: 'Next pick', value: nextLabel },
                { label: 'Board risk', value: pressure ? pressure.pos + ' cliff in ' + pressure.count + ' picks' : (topNeed ? topNeed.pos + ' priority' : 'value-led board') },
                { label: 'Action', value: latePick ? 'shop ' + compactPickLabel(latePick) + ' if tier breaks' : 'hold future capital' },
            ];
        }, [nextPick, compactPickLabel, positionRunRows, needLabels, currentCapitalRow.picks]);

        const aiDraftPathRows = useMemo(() => {
            if (userMockRows.length) return userMockRows;
            const cleanTargets = recommendations.filter(r => {
                const pos = normPos(r.pos || r.p?.position);
                return !['K', 'P'].includes(pos);
            });
            return currentCapitalRow.picks.slice(0, 5).map((pk, idx) => {
                const target = cleanTargets[idx] || cleanTargets[0];
                if (!target) return null;
                const pos = normPos(target.pos || target.p?.position) || target.p?.position || 'POS';
                const targetName = pName(target.p);
                const targetNeed = needLabels.find(n => n.pos === pos);
                const impact = alexPickPlanText(pk, pos, targetName, targetNeed, idx);
                return {
                    pid: target.pid,
                    overall: ((Number(pk.round || 1) - 1) * leagueSize) + (slotFor(pk) || draftProjectionMeta.mySlot || idx + 1),
                    pickLabel: compactPickLabel(pk),
                    name: targetName,
                    pos,
                    school: target.csv?.college || target.p?.college || target.p?.metadata?.college || 'School TBD',
                    nflTeam: target.csv?.nflTeam || target.p?.team || 'Team TBD',
                    photoUrl: target.pid ? 'https://sleepercdn.com/content/nfl/players/thumb/' + target.pid + '.jpg' : '',
                    dhq: target.dhq || 0,
                    impact,
                    driverText: targetNeed ? 'roster pressure' : 'DHQ tier value',
                    source: 'recommendation',
                };
            }).filter(Boolean);
        }, [userMockRows, recommendations, currentCapitalRow.picks, normPos, needLabels, leagueSize, slotFor, draftProjectionMeta.mySlot, compactPickLabel, alexPickPlanText]);

        const requestFullDraftReport = useCallback(() => {
            if (typeof setReconPanelOpen !== 'function' || typeof sendReconMessage !== 'function') return;
            if (!rosterState.isUsable) { alert(rosterState.message); return; }
            setReconPanelOpen(true);
            const needs = needLabels.map(n => n.pos + (n.urgency === 'deficit' ? ' critical' : '')).join(', ') || 'balanced';
            const picks = myPicks.filter(p => p.year === leagueSeason).map(fmtPick).join(', ') || 'unknown';
            sendReconMessage(
                `SEARCH THE WEB for current ${leagueSeason} NFL draft prospect rankings. Generate a full dynasty rookie draft plan.\n\n` +
                `League size: ${leagueSize}\nMy needs: ${needs}\nMy picks: ${picks}\n\n` +
                `Cover: position tiers, best fits at my slots, players worth moving up for, trade-down pockets, and avoid zones. Use specific prospect names.`
            );
        }, [setReconPanelOpen, sendReconMessage, rosterState.isUsable, rosterState.message, needLabels, myPicks, leagueSeason, leagueSize, fmtPick]);

        const requestClassOverview = useCallback(() => {
            if (typeof setReconPanelOpen !== 'function' || typeof sendReconMessage !== 'function') return;
            setReconPanelOpen(true);
            sendReconMessage('Give me a concise ' + leagueSeason + ' rookie class overview by position, including class strengths, cliff points, and where my current picks should attack.');
        }, [setReconPanelOpen, sendReconMessage, leagueSeason]);

        // Fit color helper
        const fitColor = (score) => score >= 80 ? '#2ECC71' : score >= 60 ? '#D4AF37' : score >= 40 ? '#3498DB' : 'var(--silver)';

        // Tag button helper
        const tagDefs = { target: { icon: '\u2605', color: '#2ECC71', label: 'Target' }, avoid: { icon: '\u2717', color: '#E74C3C', label: 'Avoid' }, sleeper: { icon: '\u26A1', color: '#3498DB', label: 'Sleeper' }, must: { icon: '\u2B50', color: '#D4AF37', label: 'Must' } };

        const draftViewLabels = { command: 'Flash Brief', board: 'Big Board', mock: 'Mock Draft Center', live: 'Live Draft' };
        const draftViewContext = {
            command: 'Your picks, board value, and draft-room priorities.',
            board: 'Prospect board, tags, tiers, and saved scouting views.',
            mock: 'Scenario testing, roster impact, and draft capital outcomes.',
            live: 'Live Sleeper mirror with your board, roster build, and opponent intel.'
        };
        const launchLiveDraft = () => {
            setLiveAutoStartToken(Date.now());
            setDraftView('live');
        };
        const pickFocusLabel = pickFocus?.label || (pickFocus ? `${pickFocus.year || ''} R${pickFocus.round || '?'}` : '');
        const pickFocusSummary = pickFocus
            ? [
                pickFocus.currentOwnerName ? `Current owner: ${pickFocus.currentOwnerName}` : null,
                pickFocus.originalOwnerName ? `Original: ${pickFocus.originalOwnerName}` : null,
                pickFocus.status || null,
                pickFocus.value ? `${Number(pickFocus.value).toLocaleString()} DHQ` : null,
              ].filter(Boolean).join(' - ')
            : '';
        const clearPickFocus = () => {
            window._wrDraftPickFocus = null;
            setPickFocus(null);
        };

        const renderAnalystFlash = () => (
            <section className="draft-hq-action-card draft-analyst-flash">
                <div className="draft-hq-panel-head">
                    <span>Alex Analyst Mock</span>
                    <em>{activeFlashAnalystReport ? activeFlashAnalystReport.label + ' - ' + activeFlashAnalystReport.assumptions.rounds + ' round' + (Number(activeFlashAnalystReport.assumptions.rounds) === 1 ? '' : 's') : '1st round ready'}</em>
                </div>
                <div className="draft-alex-toolbar">
                    <div className="draft-alex-presets">
                        {flashAnalystPresetOptions.map(preset => (
                            <button key={preset.id} type="button" className={flashAnalystPresetId === preset.id ? 'is-active' : ''} onClick={() => setFlashAnalystPresetId(preset.id)}>
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <label className="draft-alex-rounds">
                        <span>Rounds</span>
                        <select value={flashAnalystRoundLimit} onChange={e => setFlashAnalystRoundLimit(e.target.value)}>
                            {flashRoundOptions.map(round => (
                                <option key={round} value={round} style={{ background: '#111' }}>{round} round{Number(round) === 1 ? '' : 's'}</option>
                            ))}
                            <option value="full" style={{ background: '#111' }}>Full draft</option>
                        </select>
                    </label>
                    <button type="button" className="draft-alex-generate" disabled={flashAnalystStatus === 'running' || !boardPoolForContext.length} onClick={generateFlashAnalystMock}>
                        {flashAnalystStatus === 'running' ? 'Generating' : activeFlashAnalystReport ? 'Refresh Insights' : 'Generate Insights'}
                    </button>
                </div>
                {activeFlashAlexBrief ? (
                    <div className="draft-alex-message">
                        <div className="draft-alex-avatar">A</div>
                        <div className="draft-alex-body">
                            <div className="draft-alex-meta">
                                <strong>{activeFlashAlexBrief.author}</strong>
                                <span>{activeFlashAlexBrief.headline}</span>
                            </div>
                            <p>{activeFlashAlexBrief.intro}</p>
                            <div className="draft-alex-user-path">
                                <strong>Your path</strong>
                                <span>{activeFlashAlexBrief.userPath}</span>
                            </div>
                            <div className="draft-alex-pick-list">
                                {activeFlashAlexBrief.pickLines.map(line => (
                                    <div key={line.overall} className={'draft-alex-pick-line' + (line.isUser ? ' is-user' : '')} role="button" tabIndex={0} title="Open player card" onClick={() => openDraftPlayer(line.pid)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDraftPlayer(line.pid); } }}>
                                        <span className="draft-alex-pick-no">{line.pickLabel}</span>
                                        <img className="draft-alex-player-photo" src={line.photoUrl} alt="" onError={e => e.currentTarget.style.visibility = 'hidden'} />
                                        <span className="draft-alex-pick-main">
                                            <strong>{line.player} <em>{line.pos}</em></strong>
                                            <small>{line.nflTeam} - {line.school}</small>
                                            <i>{line.commentary}</i>
                                        </span>
                                        <span className="draft-alex-pick-value">
                                            <strong>{line.dhq}</strong>
                                            <small>{line.value}</small>
                                            <em>{line.driver}</em>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="draft-alex-footer">
                                <span>{activeFlashAlexBrief.footer}</span>
                                <button type="button" onClick={() => setDraftView('mock')}>Open Mock Center</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="draft-alex-preview-board">
                        {activeFlashPreviewReport ? (
                            <div className="draft-alex-preview-picks">
                                {(activeFlashPreviewReport.picks || []).slice(0, draftProjectionMeta.numTeams || leagueSize).map(pick => (
                                    <button key={activeFlashPreviewReport.presetId + '-' + pick.overall} type="button" title="Open player card" onClick={e => { e.stopPropagation(); openDraftPlayer(pick.pid); }}>
                                        <span>{pick.round}.{String(pick.slot).padStart(2, '0')} · {pick.pos || 'POS'} · {pick.nflTeam || pick.team || 'NFL'}</span>
                                        <em>{pick.ownerName || ('Team ' + pick.slot)}</em>
                                        <b>{pick.name}</b>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="draft-alex-empty">
                                <strong>First-round mocks are loading.</strong>
                                <span>{flashAnalystError || 'Alex will publish league-reality, board-lens, and trade-market snapshots here.'}</span>
                            </div>
                        )}
                    </div>
                )}
            </section>
        );

        return (
            <div style={{ padding: 'var(--card-pad, 14px 16px)' }}>
                <div className={'wr-module-strip' + (activeView === 'live' || activeView === 'mock' ? ' is-compact' : '')}>
                    {(activeView !== 'live' && activeView !== 'mock') && (
                        <div className="wr-module-context">
                            <span>Draft</span>
                            <strong>{draftViewLabels[activeView] || 'Flash Brief'}</strong>
                            <em>{draftViewContext[activeView] || draftViewContext.command}</em>
                        </div>
                    )}
                    <div className="wr-module-actions">
                    <div className="wr-module-nav">
                    <button type="button" className={activeView === 'command' ? 'is-active' : ''} onClick={() => setDraftView('command')}>Flash Brief</button>
                    <button type="button" className={activeView === 'board' ? 'is-active' : ''} onClick={() => setDraftView('board')}>Big Board</button>
                    <button type="button" className={activeView === 'mock' ? 'is-active' : ''} onClick={() => setDraftView('mock')}>Mock Draft Center</button>
                    </div>
                    <button type="button" className={'wr-live-draft-action' + (activeView === 'live' ? ' is-active' : '')} onClick={launchLiveDraft}>Follow Live Draft</button>
                    </div>
                </div>

                {pickFocus && (
                    <div className="draft-pick-context-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.24)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                        <div style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--gold)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Pick Focus</span>
                            <strong style={{ display: 'block', color: 'var(--white)', fontSize: '0.9rem', fontFamily: 'Rajdhani, sans-serif' }}>{pickFocusLabel}</strong>
                            <em style={{ display: 'block', color: 'var(--silver)', fontSize: '0.74rem', fontStyle: 'normal' }}>{pickFocusSummary || 'Opened from the pick ledger.'}</em>
                        </div>
                        <button type="button" onClick={clearPickFocus} style={{ background: 'transparent', border: '1px solid rgba(212,175,55,0.32)', borderRadius: '4px', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.72rem', padding: '4px 10px', textTransform: 'uppercase' }}>Clear</button>
                    </div>
                )}

                {/* ═══════════════════ VIEW 1: FLASH BRIEF ═══════════════════ */}
                {activeView === 'command' && (
                    <div className="draft-hq-shell">
                        <section className="draft-gm-command">
                            <div className="draft-gm-avatar">A</div>
                            <div className="draft-gm-command-main">
                                <span>Alex Ingram · Draft room</span>
                                <strong>{alexCommand}</strong>
                            </div>
                            <div className="draft-gm-command-chips">
                                {alexCommandChips.map(chip => (
                                    <div key={chip.label}>
                                        <span>{chip.label}</span>
                                        <strong>{chip.value}</strong>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <div className="draft-hq-hero">
                            <section className="draft-hq-panel draft-hq-capital-targeting">
                                <div className="draft-hq-panel-head">
                                    <span>Draft Capital + Roster Targeting</span>
                                    <em>{myPicks.length} picks - {fmtDhq(totalPickCapital)} DHQ</em>
                                </div>
                                <div className="draft-pick-group">
                                    {[currentCapitalRow].map(row => {
                                        const yearPicks = row.picks;
                                        return (
                                            <div key={row.year}>
                                                <div className="draft-pick-year"><span>{row.year}</span><em>{yearPicks.length} picks - {fmtDhq(row.totalValue)} DHQ</em></div>
                                                {yearPicks.length ? (
                                                    <div className="draft-pick-chipline">
                                                        {yearPicks.map((pk, i) => {
                                                            const cls = (pk === nextPick ? 'is-next ' : '') + (!pk.own ? 'is-acquired' : '');
                                                            return <span key={row.year + '-' + pk.round + '-' + i} className={cls.trim()} title={(pk.own ? 'Your native pick' : ('Acquired from roster ' + pk.from)) + (pk.value ? ' - ' + fmtDhq(pk.value) + ' DHQ' : '')}>{fmtPick(pk)}{pk.value ? ' - ' + fmtDhq(pk.value) : ''}</span>;
                                                        })}
                                                    </div>
                                                ) : <div className="draft-empty">No picks in this year.</div>}
                                            </div>
                                        );
                                    })}
                                    <button type="button" className="draft-future-toggle" onClick={() => setShowFuturePickCapital(v => !v)}>
                                        <strong>{showFuturePickCapital ? 'v' : '>'}</strong>
                                        <span>{showFuturePickCapital ? 'Hide future picks' : 'Show future picks'}</span>
                                        <em>{futureCapitalRows.reduce((sum, row) => sum + row.picks.length, 0)} picks - {fmtDhq(futurePickCapital)} DHQ</em>
                                    </button>
                                    {showFuturePickCapital && futureCapitalRows.map(row => {
                                        const yearPicks = row.picks;
                                        return (
                                            <div key={row.year}>
                                                <div className="draft-pick-year"><span>{row.year}</span><em>{yearPicks.length} picks - {fmtDhq(row.totalValue)} DHQ</em></div>
                                                {yearPicks.length ? (
                                                    <div className="draft-pick-chipline">
                                                        {yearPicks.map((pk, i) => {
                                                            const cls = !pk.own ? 'is-acquired' : '';
                                                            return <span key={row.year + '-' + pk.round + '-' + i} className={cls} title={(pk.own ? 'Your native pick' : ('Acquired from roster ' + pk.from)) + (pk.value ? ' - ' + fmtDhq(pk.value) + ' DHQ' : '')}>{fmtPick(pk)}{pk.value ? ' - ' + fmtDhq(pk.value) : ''}</span>;
                                                        })}
                                                    </div>
                                                ) : <div className="draft-empty">No picks in this year.</div>}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="draft-hq-subhead">Roster Targeting</div>
                                <div className="draft-target-header">
                                    <span>Pos</span>
                                    <span>Urgency</span>
                                    <span>Best Target</span>
                                    <span>Alex Note</span>
                                </div>
                                <div className="draft-run-list">
                                    {needLabels.length ? needLabels.map(n => (
                                        <div key={n.pos} className="draft-run-note-row draft-target-row">
                                            <strong style={{ color: posColors[n.pos] || 'var(--gold)' }}>{n.pos}</strong>
                                            <span>{n.priorityLabel}</span>
                                            <em>
                                                {n.targetName ? (
                                                    <>
                                                        <button type="button" onClick={() => openDraftPlayer(n.targetPid)} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(212,175,55,0.35)' }}>{n.targetName}</button>
                                                        {n.targetDhq ? ' - ' + fmtDhq(n.targetDhq) + ' DHQ' : ''}
                                                        <button type="button" onClick={() => setBoardTags(prev => ({ ...prev, [n.targetPid]: 'target' }))} style={{ marginLeft: 6, border: '1px solid rgba(212,175,55,0.24)', background: 'rgba(212,175,55,0.08)', color: 'var(--gold)', borderRadius: 5, padding: '2px 5px', fontSize: '0.54rem', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Tag</button>
                                                    </>
                                                ) : (n.count ? n.count + ' players' : 'no clean target loaded')}
                                            </em>
                                            <p>{n.alexBlurb}</p>
                                        </div>
                                    )) : <div className="draft-empty">No urgent roster gaps detected. Bias to value and tiers.</div>}
                                </div>
                            </section>

                            <aside className="draft-hq-actions">
                                <div className="draft-hq-action-card">
                                    <strong>Scouting Report</strong>
                                    <p>Generate a slot-aware draft plan using your current picks, roster needs, and class shape.</p>
                                    <div className="draft-card-actions">
                                        <button type="button" disabled={!rosterState.isUsable} title={!rosterState.isUsable ? rosterState.message : 'Generate draft scouting report'} onClick={requestFullDraftReport}>{rosterState.isUsable ? 'Generate Report' : 'Sync Required'}</button>
                                        <button type="button" disabled={!aiRecommendedOrder.length} onClick={() => applyAiOrderToUserBoard('master')}>Apply to User Board</button>
                                        <button type="button" disabled={!aiRecommendedOrder.length || !boardPosFilter} onClick={() => applyAiOrderToUserBoard('position')}>Apply Position</button>
                                    </div>
                                </div>
                                <div className="draft-hq-action-card">
                                    <strong>Class Overview</strong>
                                    <p>Get the class cliff points and position strengths before you start moving picks.</p>
                                    <div className="draft-card-actions">
                                        <button type="button" onClick={requestClassOverview}>Class Read</button>
                                        <button type="button" onClick={() => { setBoardMode('my'); setDraftView('board'); }}>Tag Players</button>
                                    </div>
                                </div>
                                {renderAnalystFlash()}
                            </aside>
                        </div>

                        {!rosterState.isUsable && window.App?.renderRosterDataBlocker?.(rosterState, {
                            title: 'Draft roster targeting paused',
                            message: 'Pick inventory is still visible, but fit scores and need-based targets are hidden until roster IDs finish loading.',
                            detail: rosterState.detail,
                            actionLabel: 'Refresh Data',
                            style: { marginBottom: '14px', minHeight: '170px' },
                        })}

                        <div className="draft-hq-grid">
                            <section className="draft-hq-panel">
                                <div className="draft-hq-panel-head">
                                    <span>Alex's Recommended Draft</span>
                                    <em>{userMockRows.length ? userMockRows.length + ' projected picks' : 'waiting on projection'}</em>
                                </div>
                                <div className="draft-rec-list">
                                    {aiDraftPathRows.length ? aiDraftPathRows.map((pick, i) => (
                                        <div
                                            key={pick.overall + '-' + pick.pid}
                                            className={'draft-rec-card draft-user-mock-card' + (i === 0 ? ' is-primary' : '')}
                                            role="button"
                                            tabIndex={0}
                                            title="Open player card"
                                            onClick={() => openDraftPlayer(pick.pid)}
                                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDraftPlayer(pick.pid); } }}
                                        >
                                            <span className="draft-rec-rank">{pick.pickLabel}</span>
                                            <img className="draft-rec-photo" src={pick.photoUrl} alt="" onError={e => e.currentTarget.style.visibility = 'hidden'} />
                                            <span className="draft-rec-main">
                                                <strong>{pick.name} <small>{pick.pos}</small></strong>
                                                <em>{pick.nflTeam} - {pick.school} - {pick.driverText}</em>
                                            </span>
                                            <span className="draft-rec-score">
                                                <strong style={{ color: 'var(--gold)' }}>{fmtDhq(pick.dhq)}</strong>
                                                <span>DHQ</span>
                                            </span>
                                            <span className="draft-rec-reason">{pick.impact}</span>
                                            <span className="draft-rec-actions">
                                                <button type="button" onClick={e => { e.stopPropagation(); openDraftPlayer(pick.pid); }}>Scout</button>
                                                <button type="button" onClick={e => { e.stopPropagation(); setBoardTags(prev => ({ ...prev, [pick.pid]: 'target' })); }}>Tag Target</button>
                                                <button type="button" onClick={e => { e.stopPropagation(); setDraftView('mock'); }}>Mock It</button>
                                            </span>
                                        </div>
                                    )) : <div className="draft-empty">No clean AI path yet. Sync the draft board or roster data, then Alex will publish our pick plan here.</div>}
                                </div>
                            </section>

                            <section className="draft-hq-panel">
                                <div className="draft-hq-panel-head">
                                    <span>Board Pressure</span>
                                    <em>{nextPickOverall ? 'before ' + nextPickLabel : 'pre-draft'}</em>
                                </div>
                                <div className="draft-run-list">
                                    {positionRunRows.length ? positionRunRows.map(row => (
                                        <div key={row.pos}>
                                            <strong style={{ color: posColors[row.pos] || 'var(--gold)' }}>{row.pos}</strong>
                                            <span>{row.count} likely gone</span>
                                            <em>{row.names.join(', ')}</em>
                                        </div>
                                    )) : <div className="draft-empty">No pick-pressure read yet.</div>}
                                </div>

                                <div className="draft-hq-subhead">Class Depth</div>
                                <div className="draft-run-list">
                                    {classDepthRows.map(row => (
                                        <div key={row.pos} className="draft-run-note-row">
                                            <strong style={{ color: posColors[row.pos] || 'var(--gold)' }}>{row.pos}</strong>
                                            <span>{row.count} top-60 prospects</span>
                                            <em>
                                                <button type="button" onClick={() => openDraftPlayer(row.topPid)} style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(212,175,55,0.35)' }}>{row.top}</button>
                                                <button type="button" onClick={() => setBoardTags(prev => ({ ...prev, [row.topPid]: 'target' }))} style={{ marginLeft: 6, border: '1px solid rgba(212,175,55,0.24)', background: 'rgba(212,175,55,0.08)', color: 'var(--gold)', borderRadius: 5, padding: '2px 5px', fontSize: '0.54rem', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Tag</button>
                                            </em>
                                            <p>{row.alexBlurb}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {/* ═══════════════════ VIEW 2: BIG BOARD ═══════════════════ */}
                {activeView === 'board' && (() => {
                    // Helpers: parse size like "6'4" → inches, draft sort key (drafted first)
                    const parseSizeIn = s => { const m = String(s||'').match(/(\d+)'?\s*(\d+)?/); return m ? parseInt(m[1])*12 + (parseInt(m[2])||0) : 0; };
                    const hasDraftCapital = (cs = {}) => Number(cs.draftRound) > 0 || Number(cs.draftPick) > 0;
                    const isTrueUdfa = (cs = {}) => !!cs.isUDFA && !hasDraftCapital(cs);
                    const draftSortKey = r => {
                        const cs = r.csv || {};
                        if (hasDraftCapital(cs)) return (Number(cs.draftRound) || 99) * 1000 + (Number(cs.draftPick) || 999);
                        if (isTrueUdfa(cs)) return 9000;
                        return 9999;
                    };

                    // Apply filters: position, team, round
                    let dhqBoardPlayers = [...rookies];
                    if (boardPosFilter) dhqBoardPlayers = dhqBoardPlayers.filter(r => normPos(r.p.position) === boardPosFilter);
                    if (boardTeamFilter) dhqBoardPlayers = dhqBoardPlayers.filter(r => (r.csv?.nflTeam || r.p?.team || '') === boardTeamFilter);
                    if (boardRoundFilter) dhqBoardPlayers = dhqBoardPlayers.filter(r => {
                        const cs = r.csv || {};
                        if (boardRoundFilter === 'UDFA') return isTrueUdfa(cs);
                        return String(cs.draftRound) === boardRoundFilter;
                    });
                    if (boardSort.key) {
                        dhqBoardPlayers.sort((a, b) => {
                            let va, vb;
                            const k = boardSort.key;
                            if (k === 'dhq') { va = a.dhq; vb = b.dhq; }
                            else if (k === 'name') { va = (a.p.full_name || '').toLowerCase(); vb = (b.p.full_name || '').toLowerCase(); }
                            else if (k === 'pos') { va = normPos(a.p.position) || ''; vb = normPos(b.p.position) || ''; }
                            else if (k === 'age') { va = a.p.age || (a.p.birth_date ? Math.floor((Date.now() - new Date(a.p.birth_date).getTime()) / 31557600000) : 99); vb = b.p.age || (b.p.birth_date ? Math.floor((Date.now() - new Date(b.p.birth_date).getTime()) / 31557600000) : 99); }
                            else if (k === 'fit') { va = computeFitScore(a).score; vb = computeFitScore(b).score; }
                            else if (k === 'school') { va = (a.csv?.college || a.p.college || '').toLowerCase(); vb = (b.csv?.college || b.p.college || '').toLowerCase(); }
                            else if (k === 'team')   { va = (a.csv?.nflTeam || a.p?.team || '').toLowerCase(); vb = (b.csv?.nflTeam || b.p?.team || '').toLowerCase(); }
                            else if (k === 'draft')  { va = draftSortKey(a); vb = draftSortKey(b); }
                            else if (k === 'rank')   { va = a.csv?.consensusRank ?? a.csv?.rank ?? 9999; vb = b.csv?.consensusRank ?? b.csv?.rank ?? 9999; }
                            else if (k === 'tier')   { va = a.csv?.tier ?? 99; vb = b.csv?.tier ?? 99; }
                            else if (k === 'size')   { va = parseSizeIn(a.csv?.size) || (a.p?.height || 0); vb = parseSizeIn(b.csv?.size) || (b.p?.height || 0); }
                            else if (k === 'weight') { va = parseFloat(a.csv?.weight) || parseFloat(a.p?.weight) || 0; vb = parseFloat(b.csv?.weight) || parseFloat(b.p?.weight) || 0; }
                            else if (k === 'speed')  { va = parseFloat(a.csv?.speed) || 99; vb = parseFloat(b.csv?.speed) || 99; }
                            else { va = 0; vb = 0; }
                            if (typeof va === 'string') return va < vb ? -boardSort.dir : va > vb ? boardSort.dir : 0;
                            return ((va || 0) - (vb || 0)) * boardSort.dir;
                        });
                    }

                    const aiSeedOrder = aiRecommendedOrder.length ? aiRecommendedOrder : rookies.map(r => r.pid);

                    // Drag handlers
                    const handleDragStart = (pid) => setDragPid(pid);
                    const handleDragOver = (e) => e.preventDefault();
                    const handleDrop = (targetPid) => {
                        if (!dragPid || dragPid === targetPid) return;
                        setMyBoardOrder(prev => {
                            const order = prev.length ? [...prev] : aiSeedOrder.slice();
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
                            const order = prev.length ? [...prev] : aiSeedOrder.slice();
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
                    const handleBoardMove = (pid, delta) => {
                        setMyBoardOrder(prev => {
                            const order = prev.length ? [...prev] : aiSeedOrder.slice();
                            const fromIdx = order.indexOf(pid);
                            if (fromIdx === -1) return order;
                            const toIdx = Math.max(0, Math.min(order.length - 1, fromIdx + delta));
                            if (fromIdx === toIdx) return order;
                            const [moved] = order.splice(fromIdx, 1);
                            order.splice(toIdx, 0, moved);
                            return order;
                        });
                        if (boardMode !== 'my') setBoardMode('my');
                    };

                    const buildOrderedPlayers = (order) => {
                        const cleanOrder = Array.isArray(order) && order.length ? order : rookies.map(r => r.pid);
                        const ordered = cleanOrder.map(pid => rookies.find(r => r.pid === pid)).filter(Boolean);
                        const inOrder = new Set(cleanOrder);
                        rookies.forEach(r => { if (!inOrder.has(r.pid)) ordered.push(r); });
                        return ordered;
                    };
                    const applyActiveFilters = (players) => {
                        let out = players.slice();
                        if (boardPosFilter) out = out.filter(r => normPos(r.p.position) === boardPosFilter);
                        if (boardTeamFilter) out = out.filter(r => (r.csv?.nflTeam || r.p?.team || '') === boardTeamFilter);
                        if (boardRoundFilter) out = out.filter(r => {
                            const cs = r.csv || {};
                            if (boardRoundFilter === 'UDFA') return isTrueUdfa(cs);
                            return String(cs.draftRound) === boardRoundFilter;
                        });
                        return out;
                    };

                    // User Board starts from the AI recommendation, then becomes manual on first edit.
                    if (myBoardOrder.length === 0 && aiSeedOrder.length) setMyBoardOrder(aiSeedOrder);
                    const aiBoardPlayers = applyActiveFilters(buildOrderedPlayers(aiSeedOrder));
                    const myOrder = myBoardOrder.length ? myBoardOrder : aiSeedOrder;
                    const myBoardPlayers = applyActiveFilters(buildOrderedPlayers(myOrder));

                    // Compact board renderer (used for both sides)
                    const sortArrow = (key) => boardSort.key === key ? (boardSort.dir === -1 ? ' \u25BC' : ' \u25B2') : '';
                    const toggleSort = (key) => setBoardSort(prev => prev.key === key ? { ...prev, dir: prev.dir * -1 } : { key, dir: ['name','school','team','rank','tier','draft','speed','age'].includes(key) ? 1 : -1 });
                    const sortHdr = { cursor: 'pointer', userSelect: 'none' };
                    const renderCompactBoard = (players, isDhq) => {
                        const boardGridCols = '58px minmax(205px, 1.15fr) minmax(128px, 0.82fr) 88px 108px 64px 58px 82px 64px 58px minmax(156px, 0.95fr) 92px';
                        const boardHeaderCell = (label, key, extra = {}) => (
                            <div onClick={key ? () => toggleSort(key) : undefined} style={{ ...sortHdr, ...extra }}>
                                {label}{key ? sortArrow(key) : ''}
                            </div>
                        );
                        const chip = (label, color, bg) => (
                            <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 16, padding: '0 5px', borderRadius: 4, background: bg || 'rgba(255,255,255,0.045)', color: color || 'var(--silver)', fontSize: '0.54rem', fontFamily: 'var(--font-body)', fontWeight: 800, whiteSpace: 'nowrap' }}>{label}</span>
                        );
                        const snapshotCell = (value, color, extra = {}) => (
                            <div style={{ padding: '4px 7px', minWidth: 0, ...extra }}>
                                <strong style={{ display: 'block', color: color || 'var(--white)', fontFamily: 'var(--font-body)', fontSize: '0.72rem', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '-'}</strong>
                            </div>
                        );
                        const detailLabel = { display: 'block', color: 'var(--gold)', fontSize: '0.58rem', fontFamily: 'var(--font-body)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };
                        const detailBox = { border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', borderRadius: 8, padding: '9px 10px', minWidth: 0 };

                        return (
	                        <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', maxHeight: 'none', overflowX: 'auto', overflowY: 'visible' }}>
	                          <div style={{ minWidth: '100%' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: boardGridCols, minHeight: '34px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.66rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', alignItems: 'center', position: 'sticky', top: 0, zIndex: 1 }}>
                                <div style={{ textAlign: 'center' }}>#</div>
                                {boardHeaderCell('Player', 'name', { padding: '0 8px' })}
                                {boardHeaderCell('College', 'school', { padding: '0 8px' })}
                                {boardHeaderCell('DHQ', 'dhq', { padding: '0 8px' })}
                                {boardHeaderCell('Fit', 'fit', { padding: '0 8px' })}
                                {boardHeaderCell('Rank', 'rank', { padding: '0 8px' })}
                                {boardHeaderCell('Tier', 'tier', { padding: '0 8px' })}
                                {boardHeaderCell('Draft', 'draft', { padding: '0 8px' })}
                                {boardHeaderCell('Team', 'team', { padding: '0 8px' })}
                                {boardHeaderCell('Age', 'age', { padding: '0 8px' })}
                                {boardHeaderCell('Profile', 'size', { padding: '0 8px' })}
                                <div style={{ textAlign: 'center' }}>{isDhq ? 'Open' : 'Board'}</div>
                            </div>
                            {players.map((r, idx) => {
                                const pos = normPos(r.p.position) || r.p.position;
                                const dhqC = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                                const isDrafted = draftedPids.has(r.pid);
                                const tag = boardTags[r.pid];
                                const note = boardNotes[r.pid] || '';
                                const isExp = expandedDraftPid === r.pid;
                                const age = r.p.age || (r.csv?.age ? parseFloat(r.csv.age) : null) || (r.p.birth_date ? Math.floor((Date.now() - new Date(r.p.birth_date).getTime()) / 31557600000) : (r.p.years_exp === 0 ? 21 : null));
                                const college = r.csv?.college || r.p.college || r.p.metadata?.college || '';
                                const cs = r.csv || {};
                                const team = cs.nflTeam || r.p?.team || '';
                                const fitObj = computeFitScore(r);
                                const fitCol = fitObj.score >= 70 ? '#2ECC71' : fitObj.score >= 50 ? 'var(--gold)' : 'var(--silver)';
                                const sizeStr = cs.size || (r.p?.height ? Math.floor(r.p.height/12)+"'"+(r.p.height%12) : '');
                                const wtStr = cs.weight || r.p?.weight || '';
                                const speedStr = cs.speed || '';
                                const draftRound = Number(cs.draftRound) || 0;
                                const draftPick = Number(cs.draftPick) || 0;
                                const draftStr = draftRound
                                    ? 'R' + draftRound + (draftPick ? '.' + String(draftPick).padStart(2,'0') : '')
                                    : draftPick ? '#' + draftPick : isTrueUdfa(cs) ? 'UDFA' : '';
                                const draftCol = draftRound === 1 ? '#2ECC71' : draftRound && draftRound <= 3 ? 'var(--gold)' : isTrueUdfa(cs) ? 'var(--silver)' : 'rgba(255,255,255,0.42)';
                                const rankStr = (cs.consensusRank || cs.rank) ? '#' + Math.round(cs.consensusRank || cs.rank) : '-';
                                const tierStr = cs.tier || '-';
                                const compText = cs.nflComp || cs.comp || '';
                                const teamFitInsight = team ? (() => {
                                    const capitalTier = draftRound === 1
                                        ? 'a priority-plan rookie'
                                        : draftRound && draftRound <= 3
                                            ? 'an early-rotation bet'
                                            : draftRound
                                                ? 'a developmental swing'
                                                : isTrueUdfa(cs)
                                                    ? 'a camp-competition flyer'
                                                    : 'a landing-spot bet';
                                    if (pos === 'QB') return 'I read ' + team + ' as a runway question: he stacks up as ' + capitalTier + ', but his DHQ only climbs fast if the depth chart gives him real starts or a clear succession path.';
                                    if (pos === 'RB') return 'On ' + team + ', I am weighing touch path over raw traits. He stacks up as ' + capitalTier + '; the value jumps if pass-game work or goal-line access is actually available.';
                                    if (pos === 'WR') return 'On ' + team + ', I care about target path and role clarity. He stacks up as ' + capitalTier + '; I want to know whether he is beating veterans for snaps or waiting on an injury.';
                                    if (pos === 'TE') return 'On ' + team + ', I am checking patience versus payoff. He stacks up as ' + capitalTier + '; tight ends need route volume before the profile matters for our board.';
                                    if (['DL', 'LB', 'DB', 'ED'].includes(pos)) return 'On ' + team + ', I am mapping role to scoring. He stacks up as ' + capitalTier + '; full-time snaps and stat-friendly alignment matter more than the helmet.';
                                    if (pos === 'K') return 'On ' + team + ', I am treating this as a roster-stability read. He stacks up as ' + capitalTier + ', but I would not let kicker security outrank real roster value.';
                                    return 'On ' + team + ', I am treating this as a role-and-capital check. He stacks up as ' + capitalTier + '; the question is whether the team gives him enough usage to make the DHQ real.';
                                })() : '';
                                const summaryBits = String(cs.summary || '')
                                    .split(/(?<=[.!?])\s+/)
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                    .slice(0, 4);
                                const profileStr = [sizeStr, wtStr && wtStr + ' lb', speedStr && speedStr + ' 40'].filter(Boolean).join(' / ') || '-';
                                const photoSrc = r.isCSVOnly && cs.espnId ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${cs.espnId}.png&w=96&h=70` : `https://sleepercdn.com/content/nfl/players/thumb/${r.pid}.jpg`;
                                const openPlayerDetail = () => setExpandedDraftPid(prev => {
                                    const next = prev === r.pid ? null : r.pid;
                                    if (next) window.OD?.trackDraftPlayerExpanded?.(r.pid, {
                                        platform: 'warroom',
                                        module: 'draft',
                                        leagueId: window.S?.currentLeagueId || null,
                                        metadata: { boardMode, source: 'draft_board' },
                                    });
                                    return next;
                                });
                                return (
                                    <React.Fragment key={r.pid}>
                                    <div
                                        draggable={!isDhq}
                                        onDragStart={!isDhq ? () => handleDragStart(r.pid) : undefined}
                                        onDragOver={!isDhq ? handleDragOver : undefined}
                                        onDrop={!isDhq ? () => handleDrop(r.pid) : undefined}
                                        onClick={openPlayerDetail}
                                        style={{ display: 'grid', gridTemplateColumns: boardGridCols, alignItems: 'center', minHeight: '42px', opacity: isDrafted ? 0.35 : 1, borderBottom: isExp ? 'none' : '1px solid rgba(255,255,255,0.035)', cursor: 'pointer', background: isExp ? 'rgba(212,175,55,0.065)' : idx % 2 === 1 ? 'rgba(255,255,255,0.016)' : 'transparent', transition: 'background 0.1s', position: 'relative' }}
                                        onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
                                        onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.016)' : 'transparent'; }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontFamily: 'var(--font-body)', fontSize: '0.74rem', color: idx < 3 ? 'var(--gold)' : 'var(--silver)', fontWeight: 800 }}>
                                            <span>{idx + 1}</span>
                                            {!isDhq && (
                                                <span style={{ display: 'inline-grid', gap: 2 }}>
                                                    <button type="button" title="Move up" onClick={e => { e.stopPropagation(); handleBoardMove(r.pid, -1); }} style={{ width: 16, height: 14, lineHeight: 1, border: '1px solid rgba(212,175,55,0.25)', borderRadius: 3, background: 'rgba(212,175,55,0.08)', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.52rem', padding: 0 }}>▲</button>
                                                    <button type="button" title="Move down" onClick={e => { e.stopPropagation(); handleBoardMove(r.pid, 1); }} style={{ width: 16, height: 14, lineHeight: 1, border: '1px solid rgba(212,175,55,0.25)', borderRadius: 3, background: 'rgba(212,175,55,0.08)', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.52rem', padding: 0 }}>▼</button>
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, padding: '5px 7px' }}>
                                            <div style={{ width: 28, height: 28, flexShrink: 0 }}>
                                                <img src={photoSrc} alt="" onError={e => e.target.style.display='none'} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', objectPosition: 'top', border: '1px solid rgba(212,175,55,0.22)' }} />
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                    <strong style={{ color: 'var(--white)', fontSize: '0.76rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDrafted ? 'line-through' : 'none' }}>{pName(r.p)}</strong>
                                                    {chip(pos, posColors[pos] || 'var(--silver)', (posColors[pos] || '#666') + '22')}
                                                </div>
                                            </div>
                                        </div>
                                        {snapshotCell(college || 'School TBD', 'var(--silver)')}
                                        {snapshotCell(r.dhq > 0 ? r.dhq.toLocaleString() : '-', dhqC)}
                                        {snapshotCell(fitObj.label + ' ' + fitObj.score, fitCol)}
                                        {snapshotCell(rankStr)}
                                        {snapshotCell(tierStr)}
                                        {snapshotCell(draftStr || 'Capital TBD', draftCol)}
                                        {snapshotCell(team || 'TBD', team ? '#2ECC71' : 'var(--silver)')}
                                        {snapshotCell(age || '-')}
                                        {snapshotCell(profileStr, speedStr && parseFloat(speedStr) <= 4.45 ? '#2ECC71' : 'var(--white)')}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 6px' }}>
                                            <button type="button" onClick={e => { e.stopPropagation(); openPlayerDetail(); }}
                                                style={{ fontSize: '0.55rem', padding: '3px 6px', border: '1px solid rgba(212,175,55,0.22)', borderRadius: 5, cursor: 'pointer', background: isExp ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.035)', color: isExp ? 'var(--gold)' : 'var(--silver)', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
                                                {isExp ? 'Hide' : 'Open'}
                                            </button>
                                            {!isDhq && (
                                                <button type="button" onClick={e => { e.stopPropagation(); setDraftedPids(prev => { const n = new Set(prev); if (n.has(r.pid)) n.delete(r.pid); else n.add(r.pid); return n; }); }}
                                                    style={{ fontSize: '0.55rem', padding: '3px 6px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, cursor: 'pointer', background: isDrafted ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.035)', color: isDrafted ? '#E74C3C' : 'var(--silver)', fontFamily: 'var(--font-body)', fontWeight: 800 }}>
                                                    {isDrafted ? 'Undo' : 'Off'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {isExp && (
                                        <div style={{ borderBottom: '2px solid rgba(212,175,55,0.25)', background: 'rgba(0,0,0,0.28)', padding: '13px 14px 15px', animation: 'wrFadeIn 0.2s ease' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.72fr) minmax(420px, 1.28fr)', gap: 9, marginBottom: 10 }}>
                                                <div style={detailBox}>
                                                    <span style={detailLabel}>Card Snapshot</span>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 5 }}>
                                                        {[
                                                            ['DHQ', r.dhq > 0 ? r.dhq.toLocaleString() : '-'],
                                                            ['Fit', fitObj.label + ' ' + fitObj.score],
                                                            ['Rank', rankStr],
                                                            ['Tier', tierStr],
                                                            ['Draft', draftStr || 'Capital TBD'],
                                                            ['Team', team || 'TBD'],
                                                            ['Age', age || '-'],
                                                            ['Profile', [sizeStr, wtStr && wtStr + ' lb', speedStr && speedStr + ' 40'].filter(Boolean).join(' / ') || '-'],
                                                        ].map(([label, value]) => (
                                                            <div key={label} style={{ border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6, padding: '6px 7px', background: 'rgba(255,255,255,0.02)' }}>
                                                                <em style={{ display: 'block', color: 'var(--silver)', opacity: 0.58, fontStyle: 'normal', fontSize: '0.52rem', textTransform: 'uppercase' }}>{label}</em>
                                                                <strong style={{ display: 'block', color: label === 'DHQ' ? dhqC : 'var(--white)', fontSize: '0.68rem', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</strong>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div style={detailBox}>
                                                    <span style={detailLabel}>Scouting Report</span>
                                                    {summaryBits.length ? (
                                                        <div style={{ display: 'grid', gap: 6 }}>
                                                            {summaryBits.map((bit, bi) => (
                                                                <div key={bi} style={{ color: 'var(--silver)', fontSize: '0.72rem', lineHeight: 1.45, border: '1px solid rgba(255,255,255,0.055)', borderRadius: 6, padding: '7px 8px', background: 'rgba(255,255,255,0.018)' }}>{bit}</div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{ color: 'var(--silver)', fontSize: '0.74rem', lineHeight: 1.62 }}>No full scouting summary is loaded for this player yet.</div>
                                                    )}
                                                    {compText && <div style={{ color: 'var(--white)', opacity: 0.82, fontSize: '0.68rem', marginTop: 7 }}>Comp: {compText}</div>}
                                                    {teamFitInsight && (
                                                        <div style={{ border: '1px solid rgba(46,204,113,0.18)', background: 'rgba(46,204,113,0.045)', borderRadius: 6, padding: '7px 8px', marginTop: 7 }}>
                                                            <span style={{ display: 'block', color: '#2ECC71', fontSize: '0.56rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Alex NFL Fit</span>
                                                            <div style={{ color: 'var(--silver)', fontSize: '0.7rem', lineHeight: 1.42 }}>{teamFitInsight}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <InlineCareerStats pid={r.pid} pos={pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1fr) minmax(260px,0.9fr)', gap: 10, alignItems: 'start', marginTop: 10 }}>
                                                <div style={detailBox}>
                                                    <span style={detailLabel}>Front Office Notes</span>
                                                    <textarea value={note} onChange={e => setBoardNotes(prev => ({...prev, [r.pid]: e.target.value}))} onClick={e => e.stopPropagation()} placeholder={'Add your scouting notes on ' + pName(r.p) + '...'} style={{ width: '100%', minHeight: 82, padding: '8px 10px', fontSize: '0.76rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--silver)', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, outline: 'none' }} />
                                                </div>
                                                <div style={detailBox}>
                                                    <span style={detailLabel}>Research / Actions</span>
                                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
                                                        {Object.entries(tagDefs).map(([tKey, tDef]) => (
                                                            <button key={tKey} type="button" onClick={(e) => { e.stopPropagation(); const wasActive = boardTags[r.pid] === tKey; setBoardTags(prev => ({ ...prev, [r.pid]: prev[r.pid] === tKey ? undefined : tKey })); if (!wasActive) { window.wrLogAction?.('TAG', 'Tagged ' + pName(r.p) + ' on draft board', 'draft', { players: [{ name: pName(r.p) }], actionType: 'board-tag' }); } }} style={{ padding: '4px 9px', fontSize: '0.64rem', fontFamily: 'var(--font-body)', fontWeight: 800, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (tag === tKey ? tDef.color : 'rgba(255,255,255,0.12)'), background: tag === tKey ? tDef.color + '25' : 'rgba(255,255,255,0.03)', color: tag === tKey ? tDef.color : 'var(--silver)' }}>{tDef.label}</button>
                                                        ))}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                                        <a href={'https://www.sports-reference.com/cfb/search/search.fcgi?search=' + encodeURIComponent(pName(r.p))} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ padding: '7px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', background: 'rgba(52,152,219,0.12)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: 6, textDecoration: 'none', fontWeight: 800 }}>COLLEGE STATS</a>
                                                        <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ padding: '7px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 6, textDecoration: 'none', fontWeight: 800 }}>HIGHLIGHTS</a>
                                                        <a href={'https://www.fantasypros.com/nfl/players/' + encodeURIComponent(((r.p.first_name || '') + '-' + (r.p.last_name || '')).toLowerCase().replace(/[^a-z-]/g, '')) + '.php'} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ padding: '7px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', background: 'rgba(52,152,219,0.15)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: 6, textDecoration: 'none', fontWeight: 800 }}>NEWS</a>
                                                        <button type="button" onClick={e => {
                                                            e.stopPropagation();
                                                            const name = pName(r.p);
                                                            const sections = [];
                                                            if (cs.summary) sections.push(cs.summary);
                                                            if (cs.strengths) sections.push('Strengths: ' + cs.strengths);
                                                            if (cs.weaknesses) sections.push('Weaknesses: ' + cs.weaknesses);
                                                            if (cs.nflComp || cs.comp) sections.push('NFL Comp: ' + (cs.nflComp || cs.comp));
                                                            if (cs.notes) sections.push(cs.notes);
                                                            const fullText = sections.join('\n\n') || cs.summary || '';
                                                            window.dispatchEvent(new CustomEvent('wr:scouting-generate', { detail: { pid: r.pid, playerName: name, pos, college, summary: cs.summary || '', fullText } }));
                                                            if (typeof sendReconMessage === 'function') { setReconPanelOpen(true); sendReconMessage('Give me a full scouting report on ' + name + ' (' + pos + ', ' + college + '). Include strengths, weaknesses, NFL comparison, and where I should draft them.'); }
                                                        }} style={{ padding: '7px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: 6, cursor: 'pointer', fontWeight: 800 }}>ASK ALEX</button>
                                                        <button type="button" onClick={e => { e.stopPropagation(); setExpandedDraftPid(null); }} style={{ padding: '7px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', fontWeight: 800 }}>COLLAPSE</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                            {players.length === 0 && <div style={{ padding: '12px', textAlign: 'center', color: 'var(--silver)', opacity: 0.5, fontSize: '0.76rem' }}>No players match filter</div>}
                          </div>
                        </div>
                        );
                    };

                    // Build NFL team list from rookies that have a team set (drafted/UDFA-signed)
                    const teamSet = new Set();
                    rookies.forEach(r => { const t = r.csv?.nflTeam || r.p?.team; if (t) teamSet.add(t); });
                    const availableTeams = Array.from(teamSet).sort();
                    const boardModeOptions = [
                        { k: 'dhq', label: 'Default Board', sub: 'DHQ value rank', detail: 'Canonical value order from the DHQ engine.' },
                        { k: 'ai', label: 'AI Recommended', sub: 'GM strategy fit', detail: 'Re-ranked for your strategy, roster pressure, and league format.' },
                        { k: 'my', label: 'User Board', sub: 'editable front office board', detail: myBoardOrder.length ? 'Manual order with your notes, tags, and draft prep.' : 'Starts from AI Recommended, then becomes yours when edited.' },
                    ];
                    const activeBoardInfo = boardModeOptions.find(opt => opt.k === boardMode) || boardModeOptions[0];
                    const visibleBoardPlayers = boardMode === 'my' ? myBoardPlayers : boardMode === 'ai' ? aiBoardPlayers : dhqBoardPlayers;
                    const manualSignalCount = Object.keys(boardNotes || {}).length + Object.values(boardTags || {}).filter(Boolean).length;

                    return (
                    <div>
                        <section style={{ border: '1px solid rgba(212,175,55,0.18)', borderRadius: 10, background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(255,255,255,0.018))', padding: '14px 15px', marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-body)', fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Draft Big Board</div>
                                    <h3 style={{ margin: 0, color: 'var(--white)', fontFamily: 'Rajdhani, sans-serif', fontSize: '1.22rem', lineHeight: 1.05 }}>{activeBoardInfo.label}</h3>
                                    <p style={{ margin: '4px 0 0', color: 'var(--silver)', opacity: 0.72, fontSize: '0.76rem', lineHeight: 1.45 }}>{activeBoardInfo.detail}</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(74px,1fr))', gap: 6, minWidth: 250 }}>
                                    {[
                                        { label: 'Players', value: visibleBoardPlayers.length },
                                        { label: 'Notes/Tags', value: manualSignalCount },
                                        { label: 'AI Seed', value: aiBoardPlayers.length ? 'Ready' : 'Build' },
                                    ].map(item => (
                                        <div key={item.label} style={{ padding: '7px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.18)' }}>
                                            <span style={{ display: 'block', color: 'var(--silver)', opacity: 0.6, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                                            <strong style={{ display: 'block', color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', marginTop: 2 }}>{item.value}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
                                {boardModeOptions.map(opt => (
                                    <button key={opt.k} type="button" onClick={() => setBoardMode(opt.k)} style={{
                                        padding: '9px 11px',
                                        borderRadius: 8,
                                        border: '1px solid ' + (boardMode === opt.k ? 'rgba(212,175,55,0.52)' : 'rgba(255,255,255,0.08)'),
                                        background: boardMode === opt.k ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.025)',
                                        color: boardMode === opt.k ? 'var(--gold)' : 'var(--silver)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontFamily: 'var(--font-body)',
                                    }}>
                                        <strong style={{ display: 'block', color: boardMode === opt.k ? 'var(--gold)' : 'var(--white)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{opt.label}</strong>
                                        <span style={{ display: 'block', opacity: 0.66, fontSize: '0.62rem', marginTop: 2 }}>{opt.sub}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Position filters */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button onClick={() => setBoardPosFilter('')} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'var(--font-body)', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (!boardPosFilter ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'), background: !boardPosFilter ? 'rgba(212,175,55,0.12)' : 'transparent', color: !boardPosFilter ? 'var(--gold)' : 'var(--silver)' }}>Master</button>
                            {(typeof getLeaguePositions === 'function' ? getLeaguePositions() : ['QB','RB','WR','TE','DL','LB','DB']).map(pos => (
                                <button key={pos} onClick={() => setBoardPosFilter(boardPosFilter === pos ? '' : pos)} style={{ padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'var(--font-body)', borderRadius: '14px', cursor: 'pointer', border: '1px solid ' + (boardPosFilter === pos ? (posColors[pos] || '#666') + '55' : 'rgba(255,255,255,0.08)'), background: boardPosFilter === pos ? (posColors[pos] || '#666') + '18' : 'transparent', color: boardPosFilter === pos ? posColors[pos] : 'var(--silver)' }}>{pos}</button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.4 }}>Click row to expand {'\u00B7'} Use arrows or drag to reorder My Board</span>
                        </div>

                        {/* Team & Round filters */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team</span>
                                <select value={boardTeamFilter} onChange={e => setBoardTeamFilter(e.target.value)} style={{ padding: '3px 6px', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace', background: 'rgba(255,255,255,0.04)', color: boardTeamFilter ? 'var(--gold)' : 'var(--silver)', border: '1px solid ' + (boardTeamFilter ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'), borderRadius: '6px', cursor: 'pointer', outline: 'none' }}>
                                    <option value="">All teams</option>
                                    {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '2px' }}>Round</span>
                                {[
                                    { k: '', label: 'All' },
                                    { k: '1', label: 'R1' },
                                    { k: '2', label: 'R2' },
                                    { k: '3', label: 'R3' },
                                    { k: '4', label: 'R4' },
                                    { k: '5', label: 'R5' },
                                    { k: '6', label: 'R6' },
                                    { k: '7', label: 'R7' },
                                    { k: 'UDFA', label: 'UDFA' },
                                ].map(opt => (
                                    <button key={opt.k} onClick={() => setBoardRoundFilter(boardRoundFilter === opt.k ? '' : opt.k)} style={{ padding: '3px 8px', fontSize: '0.66rem', fontFamily: 'var(--font-body)', borderRadius: '10px', cursor: 'pointer', border: '1px solid ' + (boardRoundFilter === opt.k ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'), background: boardRoundFilter === opt.k ? 'rgba(212,175,55,0.14)' : 'transparent', color: boardRoundFilter === opt.k ? 'var(--gold)' : 'var(--silver)' }}>{opt.label}</button>
                                ))}
                            </div>
                            {(boardTeamFilter || boardRoundFilter) && (
                                <button onClick={() => { setBoardTeamFilter(''); setBoardRoundFilter(''); }} style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '0.64rem', fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', cursor: 'pointer' }}>Clear</button>
                            )}
                        </div>

                        {/* Expanded player detail now opens inline inside the board row. */}
                        {false && expandedDraftPid && (() => {
                            const r = rookies.find(rk => rk.pid === expandedDraftPid);
                            if (!r) return null;
                            const pos = normPos(r.p.position) || r.p.position;
                            const dhqColVal = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : r.dhq >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.3)';
                            const fit = computeFitScore(r);
                            const note = boardNotes[r.pid] || '';
                            const tag = boardTags[r.pid];
                            const csv = r.csv;
                            const age = r.p.age || (csv?.age ? parseFloat(csv.age) : null) || (r.p.birth_date ? Math.floor((Date.now() - new Date(r.p.birth_date).getTime()) / 31557600000) : r.p.years_exp === 0 ? 21 : '\u2014');
                            const college = csv?.college || r.p.college || r.p.metadata?.college || '';
                            const size = csv?.size || (r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : '');
                            const weight = csv?.weight || r.p.weight || '';
                            const speed = csv?.speed || '';
                            const photoSrc = r.isCSVOnly && csv?.espnId ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${csv.espnId}.png&w=96&h=70` : `https://sleepercdn.com/content/nfl/players/${r.pid}.jpg`;
                            return (
                                <div style={{ border: '2px solid rgba(212,175,55,0.25)', borderRadius: '10px', background: 'var(--black)', padding: '16px 20px', marginBottom: '14px', animation: 'wrFadeIn 0.2s ease' }}>
                                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                                    <div style={{ flexShrink: 0, position: 'relative' }}>
                                      <img src={photoSrc} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                                      <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                                      <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[pos]||'#666')+'25', color: posColors[pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{pos}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || pName(r.p)}{r.isCSVOnly && <span style={{ fontSize: '0.6rem', marginLeft: '8px', padding: '1px 6px', borderRadius: '3px', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', fontFamily: 'var(--font-body)', verticalAlign: 'middle' }}>PROSPECT</span>}</div>
                                      <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                                        {pos} {'\u00B7'} {csv?.nflTeam || r.p.team || 'TBD'} {'\u00B7'} Age {age} {'\u00B7'} {college || 'Unknown'}
                                        {size ? ' \u00B7 ' + size : ''}
                                        {weight ? ' \u00B7 ' + weight + 'lbs' : ''}
                                        {speed ? ' \u00B7 ' + speed + 's' : ''}
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-body)', padding: '2px 10px', borderRadius: '10px', background: dhqColVal + '20', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() + ' DHQ' : 'No DHQ'}</span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: fitColor(fit.score) + '15', color: fitColor(fit.score) }}>{fit.label} Fit</span>
                                        {tag && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 10px', borderRadius: '10px', background: tagDefs[tag].color + '20', color: tagDefs[tag].color }}>{tagDefs[tag].icon} {tagDefs[tag].label}</span>}
                                      </div>
                                      {/* Quick tag buttons */}
                                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                                        {Object.entries(tagDefs).map(([tKey, tDef]) => (
                                          <button key={tKey} onClick={(e) => { e.stopPropagation(); const wasActive = boardTags[r.pid] === tKey; setBoardTags(prev => ({ ...prev, [r.pid]: prev[r.pid] === tKey ? undefined : tKey })); if (!wasActive) { window.wrLogAction?.('\uD83C\uDFAF', 'Tagged ' + pName(r.p) + ' on draft board', 'draft', { players: [{ name: pName(r.p) }], actionType: 'board-tag' }); } }} style={{ padding: '3px 10px', fontSize: '0.68rem', fontFamily: 'var(--font-body)', fontWeight: 600, borderRadius: '12px', cursor: 'pointer', border: '1px solid ' + (tag === tKey ? tDef.color : 'rgba(255,255,255,0.12)'), background: tag === tKey ? tDef.color + '25' : 'rgba(255,255,255,0.03)', color: tag === tKey ? tDef.color : 'var(--silver)', transition: 'all 0.15s' }}>{tDef.icon} {tDef.label}</button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                                    {[
                                      { label: 'DHQ', val: r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014', col: dhqColVal, gauge: true },
                                      { label: 'FIT', val: fit.label, col: fitColor(fit.score) },
                                      csv?.rank ? { label: 'RANK', val: '#' + csv.rank, col: csv.rank <= 10 ? '#2ECC71' : csv.rank <= 32 ? '#D4AF37' : 'var(--silver)' } : null,
                                      csv?.tier ? { label: 'TIER', val: csv.tier, col: csv.tier === 'ELITE' ? '#2ECC71' : csv.tier === 'BLUE_CHIP' ? '#3498DB' : 'var(--gold)' } : null,
                                      { label: 'AGE', val: age, col: typeof age === 'number' && age <= 22 ? '#2ECC71' : 'var(--silver)' },
                                      size ? { label: 'SIZE', val: size, col: 'var(--silver)' } : null,
                                      weight ? { label: 'WT', val: weight + 'lbs', col: 'var(--silver)' } : null,
                                      speed ? { label: '40 YD', val: speed + 's', col: parseFloat(speed) <= 4.45 ? '#2ECC71' : 'var(--silver)' } : null,
                                      { label: 'TEAM', val: csv?.nflTeam || r.p.team || 'TBD', col: (csv?.nflTeam || r.p.team) ? '#2ECC71' : 'var(--silver)' },
                                      csv?.draftRound && csv?.draftPick
                                        ? { label: 'DRAFTED', val: 'R' + csv.draftRound + '.' + String(csv.draftPick).padStart(2,'0'), col: csv.draftRound === 1 ? '#2ECC71' : csv.draftRound <= 3 ? '#D4AF37' : 'var(--silver)' }
                                        : csv?.isUDFA
                                          ? { label: 'DRAFTED', val: 'UDFA', col: 'var(--silver)' }
                                          : null,
                                    ].filter(Boolean).map((s, i) => {
                                      const dhqFilled = s.gauge ? Math.round(Math.min(10, r.dhq / 1000)) : 0;
                                      const dhqGaugeCol = r.dhq >= 7000 ? 'filled-green' : r.dhq >= 4000 ? 'filled' : 'filled-red';
                                      return (
                                      <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 600, color: s.col, letterSpacing: 0 }}>{s.val}</div>
                                        {s.gauge && <div className="wr-gauge" style={{ marginTop: '3px' }}>{Array.from({length: 10}, (_, gi) => <div key={gi} className={'wr-gauge-seg' + (gi < dhqFilled ? ' ' + dhqGaugeCol : '')}></div>)}</div>}
                                        <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                                      </div>
                                    ); })}
                                  </div>

                                  <InlineCareerStats pid={r.pid} pos={pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                                  {csv?.summary && (
                                  <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scouting Report</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.7 }}>{csv.summary}</div>
                                  </div>
                                  )}

                                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scouting Notes</div>
                                    <textarea value={note} onChange={e => setBoardNotes(prev => ({...prev, [r.pid]: e.target.value}))} placeholder={'Add your scouting notes on ' + pName(r.p) + '...'} style={{ width: '100%', minHeight: '70px', padding: '8px 10px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--silver)', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5, outline: 'none' }} />
                                  </div>

                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <a href={'https://www.sports-reference.com/cfb/search/search.fcgi?search=' + encodeURIComponent(pName(r.p))} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(52,152,219,0.12)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83C\uDFC8'} COLLEGE STATS</a>
                                    <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\u25B6'} HIGHLIGHTS</a>
                                    <a href={'https://www.fantasypros.com/nfl/players/' + encodeURIComponent(((r.p.first_name || '') + '-' + (r.p.last_name || '')).toLowerCase().replace(/[^a-z-]/g, '')) + '.php'} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(52,152,219,0.15)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83D\uDCF0'} NEWS</a>
                                    {(r.p.years_exp === 0) && <a href={'https://www.nfl.com/prospects/' + encodeURIComponent(((r.p.first_name || '') + '-' + (r.p.last_name || '')).toLowerCase().replace(/\s+/g, '-')) + '/'} target="_blank" rel="noopener" style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(46,204,113,0.15)', color: '#2ECC71', border: '1px solid rgba(46,204,113,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83C\uDFC8'} NFL PROFILE</a>}
                                    <button onClick={() => {
                                        // Phase 7 deferred: emit scouting event so the CommandCenter's AlexStream
                                        // picks it up inline instead of hijacking the separate chat panel.
                                        const name = pName(r.p);
                                        const summary = r.csv?.summary || '';
                                        const csv = r.csv || {};
                                        // Compose a multi-section fullText from available CSV fields
                                        const sections = [];
                                        if (csv.summary) sections.push(csv.summary);
                                        if (csv.strengths) sections.push('Strengths: ' + csv.strengths);
                                        if (csv.weaknesses) sections.push('Weaknesses: ' + csv.weaknesses);
                                        if (csv.nflComp || csv.comp) sections.push('NFL Comp: ' + (csv.nflComp || csv.comp));
                                        if (csv.notes) sections.push(csv.notes);
                                        const fullText = sections.join('\n\n') || summary;
                                        window.dispatchEvent(new CustomEvent('wr:scouting-generate', { detail: { pid: r.pid, playerName: name, pos, college, summary, fullText } }));
                                        // Also fall back to chat when AlexStream isn't mounted (user is on Draft tab, not in mock draft)
                                        if (typeof sendReconMessage === 'function') { setReconPanelOpen(true); sendReconMessage('Give me a full scouting report on ' + name + ' (' + pos + ', ' + college + '). Include strengths, weaknesses, NFL comparison, and where I should draft them.'); }
                                    }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>ASK ALEX</button>
                                    <button onClick={() => setExpandedDraftPid(null)} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                                  </div>
                                </div>
                            );
                        })()}

                        <div style={{ marginBottom: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8, color: 'var(--silver)', opacity: 0.65, fontSize: '0.68rem' }}>
                                <span>{activeBoardInfo.label} - {visibleBoardPlayers.length} visible players</span>
                                <span>{boardMode === 'my' ? 'Drag rows to reorder - click a player for notes' : 'Switch to User Board to edit rank order'}</span>
                            </div>
                            {renderCompactBoard(visibleBoardPlayers, boardMode !== 'my')}
                        </div>

                        {/* Expanded card moved above boards — old location */}

                        {/* OLD BOARD — REPLACED BY SIDE-BY-SIDE ABOVE */}
                        {false && <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', height: '36px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-body)', textTransform: 'uppercase', alignItems: 'center' }}>
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
                                        onClick={() => setExpandedDraftPid(prev => {
                                            const next = prev === r.pid ? null : r.pid;
                                            if (next) window.OD?.trackDraftPlayerExpanded?.(r.pid, {
                                                platform: 'warroom',
                                                module: 'draft',
                                                leagueId: window.S?.currentLeagueId || null,
                                                metadata: { boardMode, source: 'my_board' },
                                            });
                                            return next;
                                        })}
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
                                                    style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: idx < 3 ? 'var(--gold)' : 'var(--silver)', cursor: 'pointer', textAlign: 'center', width: '24px', flexShrink: 0 }} title="Click to change rank">{idx + 1}</span>
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
                                            <div style={{ width: '64px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.78rem', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</div>
                                            <div style={{ width: '70px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span title={fit.score + '/99'} style={{ fontSize: '0.68rem', fontWeight: 700, color: fitColor(fit.score), padding: '1px 8px', background: fitColor(fit.score) + '15', borderRadius: '8px' }}>{fit.label}</span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: '60px', display: 'flex', alignItems: 'center', fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6, overflow: 'hidden', padding: '0 4px' }}>
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{college || '\u2014'}</span>
                                            </div>
                                            <div style={{ width: '100px', flexShrink: 0, display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
                                                {Object.entries(tagDefs).map(([tKey, tDef]) => (
                                                    <button key={tKey} onClick={e => { e.stopPropagation(); const wasActive = boardTags[r.pid] === tKey; setBoardTags(prev => ({ ...prev, [r.pid]: prev[r.pid] === tKey ? undefined : tKey })); if (!wasActive) { window.wrLogAction?.('\uD83C\uDFAF', 'Tagged ' + pName(r.p) + ' on draft board', 'draft', { players: [{ name: pName(r.p) }], actionType: 'board-tag' }); } }}
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
                                                    style={{ fontSize: '0.6rem', padding: '2px 5px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '3px', cursor: 'pointer', background: isDrafted ? 'rgba(231,76,60,0.15)' : 'rgba(255,255,255,0.04)', color: isDrafted ? '#E74C3C' : 'var(--silver)', fontFamily: 'var(--font-body)', textTransform: 'uppercase' }}>
                                                    {isDrafted ? 'Undo' : 'Off'}
                                                </button>
                                                <button onClick={e => { e.stopPropagation(); const n = prompt('Note for ' + pName(r.p) + ':', note); if (n !== null) setBoardNotes(prev => ({...prev, [r.pid]: n})); }}
                                                    title="Add note" style={{ fontSize: '0.6rem', padding: '2px 5px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer', background: note ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)', color: note ? 'var(--gold)' : 'var(--silver)', fontFamily: 'var(--font-body)' }}>
                                                    {note ? '\u270E' : '+'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inline expand card */}
                                    {isExp && (
                                        <div style={{ borderBottom: '2px solid rgba(212,175,55,0.25)', background: 'var(--black)', padding: '16px 20px', animation: 'wrFadeIn 0.2s ease' }}>
                                          {/* Header */}
                                          <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                                            <div style={{ flexShrink: 0, position: 'relative' }}>
                                              <img src={'https://sleepercdn.com/content/nfl/players/'+r.pid+'.jpg'} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                                              <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                                              <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[pos]||'#666')+'25', color: posColors[pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{pos}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || pName(r.p)}</div>
                                              <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                                                {pos} {'\u00B7'} {r.csv?.nflTeam || r.p.team || 'TBD'} {'\u00B7'} Age {age} {'\u00B7'} {college || 'Unknown'}
                                                {r.p.height ? ' \u00B7 ' + Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : ''}
                                                {r.p.weight ? ' \u00B7 ' + r.p.weight + 'lbs' : ''}
                                              </div>
                                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-body)', padding: '2px 10px', borderRadius: '10px', background: dhqColVal + '20', color: dhqColVal }}>{r.dhq > 0 ? r.dhq.toLocaleString() + ' DHQ' : 'No DHQ'}</span>
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
                                                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 600, color: s.col, letterSpacing: 0 }}>{s.val}</div>
                                                <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                                              </div>
                                            ))}
                                          </div>

                                          {/* Physical Profile */}
                                          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Physical Profile</div>
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
                                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Scouting Notes</div>
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
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(52,152,219,0.12)', color: '#3498DB', border: '1px solid rgba(52,152,219,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\uD83C\uDFC8'} COLLEGE STATS</a>
                                            <a href={'https://www.youtube.com/results?search_query=' + encodeURIComponent(pName(r.p) + ' highlights ' + leagueSeason)} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '6px', textDecoration: 'none', fontWeight: 600 }}>{'\u25B6'} HIGHLIGHTS</a>
                                            <button onClick={e => { e.stopPropagation(); setReconPanelOpen(true); sendReconMessage('SEARCH FOR CURRENT INFO. Full dynasty scouting report on ' + pName(r.p) + ' (' + pos + ', ' + (college || 'Unknown') + ', ' + (r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'" ' : '') + (r.p.weight ? r.p.weight+'lbs' : '') + '). Format as:\n\nPROFILE: Physical build assessment, athletic traits, measurables analysis\n\nCOLLEGE PRODUCTION: Key stats from last 2 seasons, snap count, efficiency metrics\n\nPOSITION GRADES (1-10): ' + (pos==='RB'?'Vision/Patience, Power/Balance, Agility/Accel, Passing Game, Competitiveness':(pos==='WR'?'Route Running, Separation, Hands/Catch, YAC Ability, Contested Catch':(pos==='QB'?'Arm Strength, Accuracy, Pocket Presence, Mobility, Decision Making':(pos==='TE'?'Blocking, Route Running, Hands, YAC, Versatility':'Tackling, Pass Rush, Coverage, Football IQ, Athleticism')))) + '\n\nNFL COMPARISON: One specific NFL player comp with reasoning\n\nDYNASTY TAKEAWAY: Buy/sell/hold recommendation, ideal draft range, ceiling vs floor, fit for our roster (DHQ: ' + (r.dhq>0?r.dhq:'unranked') + '). Be specific and opinionated.'); }}
                                              style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>{'\uD83D\uDD0D'} SCOUT REPORT</button>
                                            <button onClick={e => { e.stopPropagation(); setExpandedDraftPid(null); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                                          </div>
                                        </div>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                            {boardPlayers.length === 0 && <div style={{ padding: 'var(--card-pad, 14px 16px)', textAlign: 'center', color: 'var(--silver)', opacity: 0.5 }}>No players match this filter</div>}
                        </div>}
                    </div>
                    );
                })()}

                {/* ═══════════════════ VIEW 3: MOCK DRAFT CENTER ═══════════════════ */}
                {activeView === 'mock' && (() => {
                    const DraftCC = window.DraftCommandCenter;
                    if (typeof DraftCC === 'function') {
                        return (
                            <DraftCC
                                playersData={playersData}
                                myRoster={myRoster}
                                currentLeague={currentLeague}
                                draftRounds={draftRounds}
                            />
                        );
                    }
                    return (
                        <div style={{ padding: '20px', color: '#E74C3C', textAlign: 'center', fontSize: '0.9rem' }}>
                            Mock Draft Center failed to load. Check console for errors.
                        </div>
                    );
                })()}

                {/* ═══════════════════ VIEW 4: FOLLOW LIVE DRAFT ═══════════════════ */}
                {activeView === 'live' && (() => {
                    const DraftCC = window.DraftCommandCenter;
                    if (typeof DraftCC === 'function') {
                        return (
                            <DraftCC
                                playersData={playersData}
                                myRoster={myRoster}
                                currentLeague={currentLeague}
                                draftRounds={draftRounds}
                                forcedMode="live-sync"
                                autoStartLiveToken={liveAutoStartToken}
                            />
                        );
                    }
                    return (
                        <div style={{ padding: '20px', color: '#E74C3C', textAlign: 'center', fontSize: '0.9rem' }}>
                            Live Draft Follower failed to load. Check console for errors.
                        </div>
                    );
                })()}

            </div>
        );
    }
