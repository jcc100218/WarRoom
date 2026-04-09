// ══════════════════════════════════════════════════════════════════
// js/mock-draft.js — War Room Mock Draft Simulator v2
// Full pick-by-pick dynasty mock draft with AI opponents
// React component rendered inside DraftTab (draft-room.js)
// ══════════════════════════════════════════════════════════════════

function MockDraftPanel({ playersData, myRoster, currentLeague, draftRounds: leagueRounds }) {

    // ─────────────────────────────────────────────────────────────
    // GLOBALS & DERIVED CONSTANTS
    // ─────────────────────────────────────────────────────────────
    const LI             = window.App?.LI || {};
    const S              = window.S || {};
    const rosters        = S.rosters || [];
    const myRid          = S.myRosterId;
    const assessFn       = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
    const ownerProfiles  = LI.ownerProfiles || {};
    const scores         = LI.playerScores || {};
    const playerMeta     = LI.playerMeta || {};
    const hitRates       = LI.hitRateByRound || {};
    const POS_COLORS     = window.App?.POS_COLORS || {
        QB:'#E74C3C', RB:'#2ECC71', WR:'#3498DB', TE:'#F0A500',
        K:'#9B59B6', DL:'#E67E22', LB:'#1ABC9C', DB:'#E91E63',
    };

    // Detect user's draft position from real league standings
    const detectedTeams = rosters.length >= 4 ? rosters.length : 12;
    const detectedPos = (() => {
        if (!myRid || !rosters.length) return 6;
        const sorted = [...rosters].sort((a, b) => (a.settings?.wins || 0) - (b.settings?.wins || 0));
        const idx = sorted.findIndex(r => String(r.roster_id) === String(myRid));
        return idx >= 0 ? idx + 1 : Math.ceil(sorted.length / 2);
    })();

    // ─────────────────────────────────────────────────────────────
    // STATE — all hooks at top level (Rules of Hooks)
    // ─────────────────────────────────────────────────────────────
    const [mode, setMode] = useState('setup'); // 'setup' | 'live' | 'results'

    const [config, setConfig] = useState({
        numRounds:   leagueRounds || 5,
        draftType:   'rookie',          // 'rookie' | 'startup'
        myDraftPos:  detectedPos,       // 1-indexed
        numTeams:    detectedTeams,
        snakeDraft:  true,
        clockSpeed:  'none',            // 'none' | 'instant' | '30s' | '60s'
    });

    const [draftState, setDraftState]         = useState(null);
    const [aiThinking, setAiThinking]         = useState(false);
    const [posFilter, setPosFilter]           = useState('ALL');
    const [searchQuery, setSearchQuery]       = useState('');
    const [timeLeft, setTimeLeft]             = useState(null);
    const [autoPickPending, setAutoPickPending] = useState(false);
    const [resultView, setResultView]         = useState('summary');
    const [saveMsg, setSaveMsg]               = useState('');
    const timerRef = useRef(null);

    const [savedDrafts, setSavedDrafts] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('wr_mock_drafts_' + (currentLeague?.id || '')) || '[]');
        } catch { return []; }
    });

    // ─────────────────────────────────────────────────────────────
    // PLAYER OBJECT BUILDER
    // ─────────────────────────────────────────────────────────────
    const buildPlayerObj = (pid, meta, pData) => {
        const p   = pData || playersData?.[pid] || S.players?.[pid] || {};
        const m   = meta  || playerMeta[pid]    || {};
        const rawPos = m.pos || p.position || '?';
        const pos = window.App?.normPos?.(rawPos) || rawPos.toUpperCase();
        const dhq = scores[pid] || 0;
        const age = p.age || m.age || 22;
        const name = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || pid;
        return {
            pid, name, pos,
            team:    p.team    || '',
            college: p.college || p.metadata?.college || '',
            age,
            val: dhq > 0 ? dhq : Math.max(300, 5000 - (age - 20) * 350),
            ppg: m.ppg || 0,
        };
    };

    // ─────────────────────────────────────────────────────────────
    // PROSPECT POOLS
    // ─────────────────────────────────────────────────────────────
    const rookiePool = useMemo(() => {
        // Primary: FC_ROOKIE tagged players from LeagueIntel
        let pool = Object.entries(playerMeta)
            .filter(([pid, m]) => m.source === 'FC_ROOKIE' && (scores[pid] || 0) > 0)
            .map(([pid, m]) => buildPlayerObj(pid, m));

        // Fallback: all unrostered rookies (years_exp === 0)
        if (pool.length < 8) {
            const allPlayers = (playersData && Object.keys(playersData).length > 100) ? playersData : (S.players || {});
            const rostered   = new Set();
            rosters.forEach(r => (r.players || []).forEach(pid => rostered.add(String(pid))));
            const existingPids = new Set(pool.map(p => p.pid));
            Object.entries(allPlayers).forEach(([pid, p]) => {
                if (existingPids.has(pid) || rostered.has(String(pid))) return;
                if (p.years_exp !== 0) return;
                const pos = window.App?.normPos?.(p.position) || (p.position || '').toUpperCase();
                if (!pos || pos === 'DEF' || pos === 'UNK') return;
                if (p.status === 'Inactive') return;
                pool.push(buildPlayerObj(pid, null, p));
            });
        }

        // Second fallback: young unrostered players
        if (pool.length < 8) {
            const allPlayers = (playersData && Object.keys(playersData).length > 100) ? playersData : (S.players || {});
            const rostered   = new Set();
            rosters.forEach(r => (r.players || []).forEach(pid => rostered.add(String(pid))));
            const existingPids = new Set(pool.map(p => p.pid));
            Object.entries(allPlayers).forEach(([pid, p]) => {
                if (existingPids.has(pid) || rostered.has(String(pid))) return;
                const age = p.age || 25;
                const dhq = scores[pid] || 0;
                if (age > 25 && dhq <= 0) return;
                const pos = window.App?.normPos?.(p.position) || (p.position || '').toUpperCase();
                if (!pos || pos === 'DEF' || pos === 'UNK') return;
                pool.push(buildPlayerObj(pid, null, p));
            });
        }

        return pool.sort((a, b) => b.val - a.val).slice(0, 200);
    }, [playerMeta, scores, playersData, rosters.length]);

    const startupPool = useMemo(() => {
        const allPlayers = (playersData && Object.keys(playersData).length > 100) ? playersData : (S.players || {});
        const rostered   = new Set();
        rosters.forEach(r => (r.players || []).forEach(pid => rostered.add(String(pid))));
        const pool = [];
        Object.entries(allPlayers).forEach(([pid, p]) => {
            if (rostered.has(String(pid))) return;
            const pos = window.App?.normPos?.(p.position) || (p.position || '').toUpperCase();
            if (!pos || pos === 'DEF' || pos === 'UNK') return;
            if (p.status === 'Inactive' || p.status === 'Retired') return;
            const dhq = scores[pid] || 0;
            const age = p.age || 25;
            if (dhq <= 0 && age > 32) return;
            pool.push(buildPlayerObj(pid, null, p));
        });
        return pool.sort((a, b) => b.val - a.val).slice(0, 600);
    }, [scores, playersData, rosters.length]);

    const prospectPool = config.draftType === 'startup' ? startupPool : rookiePool;

    // ─────────────────────────────────────────────────────────────
    // BUILD DRAFT ORDER
    // ─────────────────────────────────────────────────────────────
    const buildPickOrder = (cfg) => {
        const { numTeams, myDraftPos, snakeDraft, numRounds } = cfg;

        // Sort AI rosters by wins (worst first = best pick slot)
        const aiRosters = [...rosters]
            .filter(r => String(r.roster_id) !== String(myRid))
            .sort((a, b) => (a.settings?.wins || 0) - (b.settings?.wins || 0));

        // Pad with synthetic teams if needed
        while (aiRosters.length < numTeams - 1) {
            aiRosters.push({ roster_id: 20000 + aiRosters.length, settings: {} });
        }

        // Build team slots: user goes at myDraftPos, AI fills the rest
        const slots = [];
        let aiIdx = 0;
        for (let i = 0; i < numTeams; i++) {
            const draftSlot = i + 1;
            if (draftSlot === myDraftPos) {
                slots.push({ rosterId: myRid || -1, name: 'YOU', isUser: true, draftSlot });
            } else {
                const r   = aiRosters[aiIdx] || { roster_id: 30000 + aiIdx };
                const rid = r.roster_id;
                aiIdx++;
                const user = (S.leagueUsers || []).find(u =>
                    String(u.user_id) === String(rid) || u.user_id === rid
                );
                const teamName = user?.display_name || user?.metadata?.team_name || `Team ${draftSlot}`;
                slots.push({ rosterId: rid, name: teamName, isUser: false, draftSlot });
            }
        }

        // Generate picks
        const picks = [];
        for (let rd = 1; rd <= numRounds; rd++) {
            const rdSlots = (snakeDraft && rd % 2 === 0) ? [...slots].reverse() : [...slots];
            rdSlots.forEach((team, i) => {
                picks.push({
                    round: rd,
                    pick: i + 1,
                    overall: picks.length + 1,
                    rosterId: team.rosterId,
                    teamName: team.name,
                    isUser: team.isUser,
                    draftSlot: team.draftSlot,
                });
            });
        }

        return { picks, teams: slots };
    };

    // ─────────────────────────────────────────────────────────────
    // AI PICK LOGIC
    // ─────────────────────────────────────────────────────────────
    const aiPick = (rosterId, available, cfg) => {
        if (!available.length) return null;
        const assess    = assessFn ? assessFn(rosterId) : null;
        const profile   = ownerProfiles[rosterId] || {};
        const needs     = (assess?.needs || []).slice(0, 4).map(n => typeof n === 'string' ? n : n.pos);
        const targetPos = profile?.targetPos || '';
        const tier      = (assess?.tier || '').toUpperCase();
        const isRebuild = tier === 'REBUILDING';
        const isContend = tier === 'CONTENDER' || tier === 'WIN_NOW';

        const scored = available.map(p => {
            let score = p.val;

            // Need-based multipliers
            const needIdx = needs.indexOf(p.pos);
            if      (needIdx === 0) score *= 2.0;
            else if (needIdx === 1) score *= 1.6;
            else if (needIdx >= 2)  score *= 1.2;

            // Historical owner preference
            if (targetPos && p.pos === targetPos) score *= 1.25;

            // Personality: rebuilders target youth, contenders target production
            if (isRebuild && p.age <= 22) score *= 1.25;
            if (isRebuild && p.age >= 28) score *= 0.65;
            if (isContend && p.val >= 5000) score *= 1.15;
            if (isContend && p.age <= 20)  score *= 0.85;

            // Randomness: ±12% so each mock feels different
            score *= (0.88 + Math.random() * 0.24);

            return { ...p, _score: score };
        });

        scored.sort((a, b) => b._score - a._score);
        return scored[0];
    };

    // ─────────────────────────────────────────────────────────────
    // START DRAFT
    // ─────────────────────────────────────────────────────────────
    const startDraft = () => {
        if (prospectPool.length < 5) {
            alert('Not enough prospect data to run a mock draft. League Intelligence may still be loading — wait a few seconds and try again.');
            return;
        }
        const { picks, teams } = buildPickOrder(config);
        const initialState = {
            pool: [...prospectPool],
            picks: [],
            pickOrder: picks,
            teams,
            currentIdx: 0,
            config: { ...config },
        };
        setDraftState(initialState);
        setPosFilter('ALL');
        setSearchQuery('');
        setResultView('summary');
        setSaveMsg('');
        setMode('live');
        setAiThinking(false);

        // Auto-advance AI picks if user is not picking first
        if (picks[0] && !picks[0].isUser) {
            setTimeout(() => advanceAI(initialState), 400);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // AI ADVANCE (recursive, pick-by-pick with animation delay)
    // ─────────────────────────────────────────────────────────────
    const advanceAI = (state) => {
        const current = state.pickOrder[state.currentIdx];

        // Guard: nothing to advance
        if (!current || current.isUser || state.currentIdx >= state.pickOrder.length) {
            setDraftState(state);
            setAiThinking(false);
            if (state.currentIdx >= state.pickOrder.length) setMode('results');
            return;
        }

        // Show this slot as "thinking"
        setAiThinking(true);
        setDraftState(state); // Updates grid to pulse current cell

        const delay = state.config?.clockSpeed === 'instant' ? 40 : 650;

        setTimeout(() => {
            const pick = aiPick(current.rosterId, state.pool, state.config);
            if (!pick) {
                setAiThinking(false);
                setDraftState(state);
                return;
            }

            // Remove from pool
            const pIdx    = state.pool.findIndex(p => p.pid === pick.pid);
            const newPool = [...state.pool];
            if (pIdx >= 0) newPool.splice(pIdx, 1);

            const newPicks = [...state.picks, {
                ...current,
                pid: pick.pid, playerName: pick.name, pos: pick.pos,
                val: pick.val, age: pick.age, isUser: false,
            }];

            const nextIdx  = state.currentIdx + 1;
            const newState = { ...state, pool: newPool, picks: newPicks, currentIdx: nextIdx };

            if (nextIdx >= state.pickOrder.length) {
                setDraftState(newState);
                setAiThinking(false);
                setMode('results');
                return;
            }

            const nextSlot = state.pickOrder[nextIdx];
            if (nextSlot.isUser) {
                // User's turn — stop advancing
                setDraftState(newState);
                setAiThinking(false);
            } else {
                // Continue with next AI pick
                advanceAI(newState);
            }
        }, delay);
    };

    // ─────────────────────────────────────────────────────────────
    // USER MAKES A PICK
    // ─────────────────────────────────────────────────────────────
    const makeUserPick = (pid) => {
        if (!draftState || aiThinking) return;
        const { pool, picks, pickOrder, currentIdx } = draftState;
        const current = pickOrder[currentIdx];
        if (!current || !current.isUser) return;

        const pIdx = pool.findIndex(p => p.pid === pid);
        if (pIdx < 0) return;
        const player = pool[pIdx];

        const newPool  = [...pool]; newPool.splice(pIdx, 1);
        const newPicks = [...picks, {
            ...current,
            pid: player.pid, playerName: player.name, pos: player.pos,
            val: player.val, age: player.age, isUser: true,
        }];

        const nextIdx = currentIdx + 1;

        // Clear timer
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setTimeLeft(null);
        setAutoPickPending(false);

        if (nextIdx >= pickOrder.length) {
            setDraftState({ ...draftState, pool: newPool, picks: newPicks, currentIdx: nextIdx });
            setMode('results');
            return;
        }

        const newState = { ...draftState, pool: newPool, picks: newPicks, currentIdx: nextIdx };
        const next = pickOrder[nextIdx];
        if (!next.isUser) {
            setTimeout(() => advanceAI(newState), 200);
        } else {
            setDraftState(newState);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // TIMER — countdown for user picks
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (mode !== 'live' || !draftState || aiThinking) return;
        if (config.clockSpeed === 'none' || config.clockSpeed === 'instant') return;
        const current = draftState.pickOrder?.[draftState.currentIdx];
        if (!current?.isUser) return;

        const seconds = config.clockSpeed === '30s' ? 30 : 60;
        setTimeLeft(seconds);

        const id = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(id);
                    setAutoPickPending(true);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
        timerRef.current = id;

        return () => { clearInterval(id); timerRef.current = null; };
    }, [mode, draftState?.currentIdx, aiThinking]);

    // Auto-pick when timer expires (uses fresh state, not stale closure)
    useEffect(() => {
        if (!autoPickPending || !draftState?.pool?.length) return;
        setAutoPickPending(false);
        const best = draftState.pool[0];
        if (best) makeUserPick(best.pid);
    }, [autoPickPending]);  

    // ─────────────────────────────────────────────────────────────
    // DRAFT GRADE
    // ─────────────────────────────────────────────────────────────
    const gradeMyPicks = (picks) => {
        const mine = picks.filter(p => p.isUser);
        if (!mine.length) return { grade: '?', gradeColor: 'var(--silver)', picks: [], totalDHQ: 0, avgEV: 0, valueCount: 0, fairCount: 0, reachCount: 0 };

        const totalDHQ = mine.reduce((s, p) => s + (p.val || 0), 0);
        const avgEV    = Math.round(totalDHQ / mine.length);

        // Rank player in the overall pool by DHQ
        const poolByVal = [...prospectPool].sort((a, b) => b.val - a.val);

        const graded = mine.map(p => {
            const rank = poolByVal.findIndex(pr => pr.pid === p.pid) + 1 || p.overall;
            const diff = rank - p.overall; // positive = took below expectations = value
            const verdict = diff >= 0 ? 'Value' : diff >= -4 ? 'Fair' : 'Reach';
            return { ...p, verdict, poolRank: rank };
        });

        const valueCount = graded.filter(p => p.verdict === 'Value').length;
        const fairCount  = graded.filter(p => p.verdict === 'Fair').length;
        const reachCount = graded.filter(p => p.verdict === 'Reach').length;

        const score = (valueCount * 3 + fairCount * 1 - reachCount * 2) / mine.length;
        let grade, gradeColor;
        if      (score >= 2.5) { grade = 'A+'; gradeColor = '#2ECC71'; }
        else if (score >= 2.0) { grade = 'A';  gradeColor = '#2ECC71'; }
        else if (score >= 1.5) { grade = 'B+'; gradeColor = 'var(--gold)'; }
        else if (score >= 1.0) { grade = 'B';  gradeColor = 'var(--gold)'; }
        else if (score >= 0.5) { grade = 'C+'; gradeColor = '#F0A500'; }
        else if (score >= 0)   { grade = 'C';  gradeColor = '#F0A500'; }
        else                   { grade = 'D';  gradeColor = '#E74C3C'; }

        return { grade, gradeColor, picks: graded, totalDHQ, avgEV, valueCount, fairCount, reachCount };
    };

    // ─────────────────────────────────────────────────────────────
    // SAVE DRAFT
    // ─────────────────────────────────────────────────────────────
    const saveDraft = () => {
        if (!draftState) return;
        const g = gradeMyPicks(draftState.picks);
        const saved = {
            ts:        Date.now(),
            picks:     draftState.picks,
            pickOrder: draftState.pickOrder,
            league:    currentLeague?.name || '',
            config:    draftState.config,
            grade:     g.grade,
            totalDHQ:  g.totalDHQ,
        };
        const all = [saved, ...savedDrafts].slice(0, 5);
        localStorage.setItem('wr_mock_drafts_' + (currentLeague?.id || ''), JSON.stringify(all));
        setSavedDrafts(all);
    };

    // ─────────────────────────────────────────────────────────────
    // SHARED STYLES
    // ─────────────────────────────────────────────────────────────
    const card  = { background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' };
    const lbl   = { fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' };
    const mono  = { fontFamily: 'JetBrains Mono, monospace' };
    const posTag = (pos) => ({
        fontSize: '0.62rem', fontWeight: 700, padding: '2px 5px', borderRadius: '3px',
        color: POS_COLORS[pos] || 'var(--silver)',
        background: (POS_COLORS[pos] || '#666') + '22',
        flexShrink: 0,
    });

    // ══════════════════════════════════════════════════════════════
    //  SETUP SCREEN
    // ══════════════════════════════════════════════════════════════
    if (mode === 'setup') {
        const maxRounds = config.draftType === 'startup' ? 30 : 5;
        const roundsVal = Math.min(config.numRounds, maxRounds);

        return (
            <div>
                <style>{`
                    .wr-md-btn { transition: all 0.12s; }
                    .wr-md-btn:hover { filter: brightness(1.15); }
                    .wr-range { accent-color: var(--gold); width: 100%; }
                `}</style>

                <div style={card}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '2px' }}>
                        MOCK DRAFT SIMULATOR
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '22px' }}>
                        Draft against AI opponents with War Room intelligence — see who you can get
                    </div>

                    {/* Draft Type */}
                    <div style={{ marginBottom: '18px' }}>
                        <div style={lbl}>DRAFT TYPE</div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {[['rookie', 'Rookie Draft', 'Incoming class only'], ['startup', 'Startup Draft', 'All available players']].map(([type, label, sub]) => (
                                <div key={type} className="wr-md-btn" onClick={() => setConfig(c => ({ ...c, draftType: type, numRounds: Math.min(c.numRounds, type === 'startup' ? 30 : 5) }))}
                                    style={{ flex: 1, padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', background: config.draftType === type ? 'rgba(212,175,55,0.12)' : 'var(--charcoal)', border: `1px solid ${config.draftType === type ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}` }}>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: config.draftType === type ? 'var(--gold)' : 'var(--white)', marginBottom: '3px' }}>{label}</div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--silver)' }}>{sub}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rounds slider */}
                    <div style={{ marginBottom: '18px' }}>
                        <div style={{ ...lbl, marginBottom: '4px' }}>
                            ROUNDS &nbsp;<span style={{ color: 'var(--white)', fontSize: '0.88rem' }}>{roundsVal}</span>
                        </div>
                        <input type="range" className="wr-range" min={1} max={maxRounds} value={roundsVal}
                            onChange={e => setConfig(c => ({ ...c, numRounds: parseInt(e.target.value) }))} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                            <span>1</span><span>{maxRounds}</span>
                        </div>
                    </div>

                    {/* League size + Draft position */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                        <div>
                            <div style={lbl}>LEAGUE SIZE</div>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {[8, 10, 12, 14, 16].map(n => (
                                    <button key={n} className="wr-md-btn" onClick={() => setConfig(c => ({ ...c, numTeams: n, myDraftPos: Math.min(c.myDraftPos, n) }))}
                                        style={{ padding: '6px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', borderRadius: '6px', background: config.numTeams === n ? 'var(--gold)' : 'var(--charcoal)', color: config.numTeams === n ? 'var(--black)' : 'var(--silver)', border: `1px solid ${config.numTeams === n ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}` }}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div style={lbl}>MY DRAFT POSITION</div>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {Array.from({ length: config.numTeams }, (_, i) => i + 1).map(pos => (
                                    <button key={pos} className="wr-md-btn" onClick={() => setConfig(c => ({ ...c, myDraftPos: pos }))}
                                        style={{ padding: '6px 10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', borderRadius: '6px', background: config.myDraftPos === pos ? 'var(--gold)' : 'var(--charcoal)', color: config.myDraftPos === pos ? 'var(--black)' : 'var(--silver)', border: `1px solid ${config.myDraftPos === pos ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}` }}>
                                        {pos}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Draft order + Clock */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                        <div>
                            <div style={lbl}>DRAFT ORDER</div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {[['snake', 'Snake'], ['linear', 'Linear']].map(([type, label]) => (
                                    <button key={type} className="wr-md-btn" onClick={() => setConfig(c => ({ ...c, snakeDraft: type === 'snake' }))}
                                        style={{ flex: 1, padding: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', borderRadius: '6px', background: (config.snakeDraft ? 'snake' : 'linear') === type ? 'var(--gold)' : 'var(--charcoal)', color: (config.snakeDraft ? 'snake' : 'linear') === type ? 'var(--black)' : 'var(--silver)', border: 'none' }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div style={lbl}>CLOCK SPEED</div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {[['none', 'Off'], ['instant', 'Fast'], ['30s', '30s'], ['60s', '60s']].map(([speed, label]) => (
                                    <button key={speed} className="wr-md-btn" onClick={() => setConfig(c => ({ ...c, clockSpeed: speed }))}
                                        style={{ flex: 1, padding: '7px 4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', borderRadius: '6px', background: config.clockSpeed === speed ? 'var(--gold)' : 'var(--charcoal)', color: config.clockSpeed === speed ? 'var(--black)' : 'var(--silver)', border: 'none' }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button onClick={startDraft} style={{ width: '100%', padding: '15px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '1.15rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}>
                        START DRAFT
                    </button>

                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '10px' }}>
                        {config.numTeams} teams · {roundsVal} rounds · {prospectPool.length} {config.draftType === 'startup' ? 'players' : 'prospects'} · {config.snakeDraft ? 'Snake' : 'Linear'}
                    </div>
                </div>

                {/* Saved drafts */}
                {savedDrafts.length > 0 && (
                    <div style={card}>
                        <div style={lbl}>SAVED DRAFTS</div>
                        {savedDrafts.map((d, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}
                                onClick={() => { setDraftState({ ...d, pool: [], currentIdx: d.picks?.length || 0 }); setMode('results'); }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--silver)', minWidth: '80px' }}>{new Date(d.ts).toLocaleDateString()}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--white)', flex: 1 }}>{d.picks?.length || 0} picks · {d.league || ''}</span>
                                {d.grade && <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--gold)', ...mono }}>{d.grade}</span>}
                                <span style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>View →</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    //  LIVE DRAFT SCREEN
    // ══════════════════════════════════════════════════════════════
    if (mode === 'live' && draftState) {
        const { pool, picks, pickOrder, teams, currentIdx } = draftState;
        const current   = currentIdx < pickOrder.length ? pickOrder[currentIdx] : null;
        const isMyTurn  = current?.isUser && !aiThinking;
        const totalPicks = pickOrder.length;

        // Fixed visual column order (sorted by draftSlot 1..N)
        const sortedTeams = [...teams].sort((a, b) => a.draftSlot - b.draftSlot);

        // Map: round → rosterId → pickedPlayer
        const pickedByTeam = {};
        picks.forEach(p => {
            if (!pickedByTeam[p.round]) pickedByTeam[p.round] = {};
            pickedByTeam[p.round][p.rosterId] = p;
        });

        // Filtered available players for user's pick
        const filteredPool = isMyTurn ? pool.filter(p => {
            if (posFilter !== 'ALL' && p.pos !== posFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return p.name.toLowerCase().includes(q) ||
                       p.team.toLowerCase().includes(q) ||
                       p.college.toLowerCase().includes(q);
            }
            return true;
        }) : pool;

        // User's roster needs
        const assess = assessFn ? assessFn(myRid) : null;
        const needs  = (assess?.needs || []).slice(0, 4).map(n => typeof n === 'string' ? n : n.pos);
        const posCount = {};
        pool.slice(0, 40).forEach(p => { posCount[p.pos] = (posCount[p.pos] || 0) + 1; });
        const scarce = needs.filter(n => (posCount[n] || 0) <= 3);

        // Unique positions in pool for filter tabs
        const availPos = ['ALL', ...Array.from(new Set(pool.map(p => p.pos))).sort()];

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <style>{`
                    @keyframes wr-pulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
                        50%       { box-shadow: 0 0 0 4px rgba(212,175,55,0.1); }
                    }
                    @keyframes wr-glow {
                        0%, 100% { opacity: 1; }
                        50%       { opacity: 0.6; }
                    }
                    .wr-md-cell-pick:hover { background: rgba(212,175,55,0.1) !important; cursor: pointer; }
                    .wr-md-player-row { transition: background 0.1s; }
                    .wr-md-player-row:hover { background: rgba(212,175,55,0.07) !important; cursor: pointer; }
                `}</style>

                {/* ── Top bar ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(212,175,55,0.15)', background: 'rgba(10,10,10,0.98)', flexShrink: 0 }}>
                    <button className="wr-md-btn" onClick={() => { setMode('setup'); setAiThinking(false); if (timerRef.current) clearInterval(timerRef.current); }}
                        style={{ background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '5px 12px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                        ✕ EXIT
                    </button>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem', fontWeight: 700, color: aiThinking ? 'var(--silver)' : isMyTurn ? 'var(--gold)' : 'var(--white)', flex: 1, letterSpacing: '0.04em' }}>
                        {aiThinking
                            ? `${current?.teamName || 'AI'} IS PICKING...`
                            : isMyTurn
                            ? `⏱ YOU ARE ON THE CLOCK — R${current?.round}.${current?.pick}`
                            : current ? `Round ${current.round}, Pick ${current.pick} · ${current.teamName}` : 'DRAFT COMPLETE'}
                    </div>
                    {timeLeft !== null && (
                        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: timeLeft <= 10 ? '#E74C3C' : 'var(--gold)', ...mono, animation: timeLeft <= 10 ? 'wr-glow 0.8s infinite' : 'none', minWidth: '42px', textAlign: 'right' }}>
                            {timeLeft}s
                        </div>
                    )}
                    <div style={{ fontSize: '0.68rem', color: 'var(--silver)', ...mono, flexShrink: 0 }}>
                        {currentIdx + 1}/{totalPicks}
                    </div>
                </div>

                {/* ── Progress bar ── */}
                <div style={{ height: '3px', background: 'rgba(212,175,55,0.08)', flexShrink: 0 }}>
                    <div style={{ height: '100%', width: `${Math.round(Math.min(currentIdx, totalPicks) / totalPicks * 100)}%`, background: 'var(--gold)', transition: 'width 0.4s ease' }} />
                </div>

                {/* ── ON THE CLOCK banner ── */}
                {isMyTurn && (
                    <div style={{ background: 'rgba(212,175,55,0.08)', borderBottom: '1px solid rgba(212,175,55,0.25)', padding: '8px 16px', textAlign: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.12em' }}>
                            ⭐ ON THE CLOCK
                        </span>
                        {current && <span style={{ fontSize: '0.72rem', color: 'var(--silver)', marginLeft: '12px' }}>Round {current.round} · Pick {current.pick} · Overall #{current.overall}</span>}
                    </div>
                )}

                {/* ── Scrollable body ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

                    {/* DRAFT BOARD GRID */}
                    <div style={{ ...card, padding: '10px 8px', marginBottom: '12px' }}>
                        <div style={{ ...lbl, paddingLeft: '6px' }}>DRAFT BOARD</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '38px', fontSize: '0.58rem', color: 'var(--silver)', padding: '4px 6px', textAlign: 'left', fontFamily: 'Rajdhani', fontWeight: 600 }}>RD</th>
                                        {sortedTeams.map(t => (
                                            <th key={t.rosterId} style={{ minWidth: '72px', maxWidth: '110px', fontSize: '0.58rem', padding: '4px 4px 6px', textAlign: 'center', fontFamily: 'Rajdhani', fontWeight: t.isUser ? 800 : 500, color: t.isUser ? 'var(--gold)' : 'rgba(255,255,255,0.45)', borderBottom: `2px solid ${t.isUser ? 'var(--gold)' : 'rgba(255,255,255,0.06)'}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>
                                                {t.isUser ? '★ YOU' : (t.name.length > 9 ? t.name.slice(0, 9) + '…' : t.name)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: draftState.config.numRounds }, (_, ri) => ri + 1).map(round => (
                                        <tr key={round}>
                                            <td style={{ fontSize: '0.65rem', color: 'var(--gold)', padding: '3px 6px', fontFamily: 'Rajdhani', fontWeight: 700, opacity: 0.8 }}>R{round}</td>
                                            {sortedTeams.map(t => {
                                                const drafted = pickedByTeam[round]?.[t.rosterId];
                                                const isCurrent = !drafted && current?.round === round && current?.rosterId === t.rosterId;
                                                const thisPick = pickOrder.find(p => p.round === round && p.rosterId === t.rosterId);

                                                return (
                                                    <td key={t.rosterId} style={{ padding: '2px 2px', background: t.isUser ? 'rgba(212,175,55,0.03)' : 'transparent', borderLeft: t.isUser ? '1px solid rgba(212,175,55,0.15)' : '1px solid rgba(255,255,255,0.02)' }}>
                                                        {drafted ? (
                                                            // Completed pick
                                                            <div style={{ padding: '4px 5px', borderRadius: '5px', background: drafted.isUser ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.04)', border: drafted.isUser ? '1px solid rgba(212,175,55,0.28)' : 'none' }}>
                                                                <div style={{ fontSize: '0.6rem', fontWeight: drafted.isUser ? 800 : 600, color: drafted.isUser ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>
                                                                    {drafted.playerName?.split(' ').slice(-1)[0] || drafted.playerName}
                                                                </div>
                                                                <span style={{ fontSize: '0.52rem', fontWeight: 700, color: POS_COLORS[drafted.pos] || 'var(--silver)', padding: '0 2px', borderRadius: '2px', background: (POS_COLORS[drafted.pos] || '#666') + '22', display: 'inline-block', marginTop: '1px' }}>{drafted.pos}</span>
                                                            </div>
                                                        ) : isCurrent ? (
                                                            // Active / thinking cell
                                                            <div style={{ padding: '5px', borderRadius: '5px', border: `1px solid ${isMyTurn ? 'var(--gold)' : 'rgba(212,175,55,0.4)'}`, background: isMyTurn ? 'rgba(212,175,55,0.1)' : 'rgba(212,175,55,0.04)', textAlign: 'center', animation: 'wr-pulse 1.4s infinite' }}>
                                                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--gold)' }}>{isMyTurn ? '★' : '⏳'}</div>
                                                            </div>
                                                        ) : (
                                                            // Future pick
                                                            <div style={{ padding: '5px', textAlign: 'center' }}>
                                                                <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.12)', ...mono }}>{thisPick ? `#${thisPick.overall}` : '—'}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── USER PICK PANEL ── */}
                    {isMyTurn && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '12px' }}>
                            {/* Left: Player list */}
                            <div style={card}>
                                {/* Position filter tabs */}
                                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    {availPos.slice(0, 9).map(pos => (
                                        <button key={pos} onClick={() => setPosFilter(pos)} style={{ padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', borderRadius: '5px', border: 'none', background: posFilter === pos ? (pos === 'ALL' ? 'var(--gold)' : POS_COLORS[pos] || 'var(--gold)') : 'var(--charcoal)', color: posFilter === pos ? (pos === 'ALL' ? 'var(--black)' : '#000') : 'var(--silver)' }}>
                                            {pos}
                                        </button>
                                    ))}
                                </div>

                                {/* Search */}
                                <input type="text" placeholder="Search players..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.82rem', marginBottom: '10px', outline: 'none' }} />

                                {/* Player rows */}
                                <div style={{ ...lbl, marginBottom: '6px' }}>BEST AVAILABLE ({filteredPool.length})</div>
                                {filteredPool.slice(0, 20).map((p, pi) => {
                                    const needFit = needs.includes(p.pos);
                                    const dhqCol  = p.val >= 7000 ? '#2ECC71' : p.val >= 4000 ? 'var(--gold)' : p.val >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.35)';
                                    return (
                                        <div key={p.pid} className="wr-md-player-row" onClick={() => makeUserPick(p.pid)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: pi % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                                            <span style={{ width: '22px', fontSize: '0.7rem', color: pi < 3 ? 'var(--gold)' : 'rgba(255,255,255,0.3)', fontWeight: 700, textAlign: 'center', flexShrink: 0 }}>{pi + 1}</span>
                                            <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`}
                                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: needFit ? '1.5px solid #2ECC71' : '1.5px solid transparent' }}
                                                onError={e => { e.target.style.display = 'none'; }} />
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>{[p.team, p.college].filter(Boolean).join(' · ')}</div>
                                            </div>
                                            <span style={posTag(p.pos)}>{p.pos}</span>
                                            <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '56px' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: dhqCol, ...mono }}>{p.val.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)' }}>DHQ</div>
                                            </div>
                                            {needFit && <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#2ECC71', padding: '1px 4px', borderRadius: '3px', background: 'rgba(46,204,113,0.15)', flexShrink: 0 }}>NEED</span>}
                                            <button onClick={e => { e.stopPropagation(); makeUserPick(p.pid); }}
                                                style={{ padding: '5px 10px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.04em' }}>
                                                DRAFT
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Right: Analytics sidebar */}
                            <div>
                                {/* Pick Intel */}
                                <div style={card}>
                                    <div style={lbl}>PICK INTEL</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600, marginBottom: '8px' }}>
                                        Pick #{current?.overall} · Round {current?.round}
                                    </div>
                                    {needs.length > 0 && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <div style={{ fontSize: '0.62rem', color: 'var(--silver)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>YOUR NEEDS</div>
                                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                                {needs.map(pos => (
                                                    <span key={pos} style={{ ...posTag(pos), padding: '3px 7px', fontSize: '0.7rem' }}>{pos}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {hitRates[current?.round] && (
                                        <div style={{ fontSize: '0.68rem', color: 'var(--silver)', marginBottom: '4px' }}>
                                            R{current?.round} hit rate: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                                                {typeof hitRates[current.round] === 'object' ? hitRates[current.round].rate : hitRates[current.round]}%
                                            </span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        {Object.entries(posCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([pos, ct]) => (
                                            <span key={pos} style={{ fontSize: '0.6rem', padding: '2px 5px', borderRadius: '4px', color: POS_COLORS[pos] || 'var(--silver)', background: (POS_COLORS[pos] || '#666') + '15' }}>
                                                {pos} ({ct})
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Scarcity alert */}
                                {scarce.length > 0 && (
                                    <div style={{ ...card, borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.04)' }}>
                                        <div style={{ ...lbl, color: '#f87171' }}>⚠ SCARCITY</div>
                                        {scarce.map(pos => (
                                            <div key={pos} style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '3px' }}>
                                                Only {posCount[pos] || 0} {pos}s in top 40
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Recent picks */}
                                <div style={card}>
                                    <div style={lbl}>RECENT PICKS</div>
                                    {[...picks].reverse().slice(0, 8).map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.68rem' }}>
                                            <span style={{ color: 'var(--silver)', minWidth: '38px', ...mono }}>R{p.round}.{p.pick}</span>
                                            <span style={{ flex: 1, color: p.isUser ? 'var(--gold)' : 'var(--silver)', fontWeight: p.isUser ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</span>
                                            <span style={posTag(p.pos)}>{p.pos}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── WHEN AI IS PICKING — show draft log ── */}
                    {!isMyTurn && picks.length > 0 && (
                        <div style={card}>
                            <div style={lbl}>DRAFT LOG ({picks.length} picks)</div>
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {[...picks].reverse().slice(0, 20).map((p, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.72rem', background: p.isUser ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                                        <span style={{ color: 'var(--silver)', minWidth: '52px', ...mono }}>#{p.overall} R{p.round}.{p.pick}</span>
                                        <span style={{ color: p.isUser ? 'var(--gold)' : 'rgba(255,255,255,0.45)', fontWeight: p.isUser ? 700 : 400, minWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.teamName}</span>
                                        <span style={{ flex: 1, color: p.isUser ? 'var(--white)' : 'var(--silver)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</span>
                                        <span style={posTag(p.pos)}>{p.pos}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.2)', ...mono, fontSize: '0.6rem', minWidth: '46px', textAlign: 'right' }}>{(p.val || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    //  POST-DRAFT RESULTS
    // ══════════════════════════════════════════════════════════════
    if (mode === 'results' && draftState) {
        const grades = gradeMyPicks(draftState.picks);

        // Position breakdown of my picks
        const posBreakdown = {};
        grades.picks.forEach(p => { posBreakdown[p.pos] = (posBreakdown[p.pos] || 0) + 1; });

        // Best and worst
        const bestPick  = grades.picks.reduce((b, p) => (!b || (p.val || 0) > (b.val || 0)) ? p : b, null);
        const worstPick = grades.picks.filter(p => p.verdict === 'Reach').sort((a, b) => (a.val || 0) - (b.val || 0))[0] || null;

        // League-wide DHQ ranking
        const teamDHQ = {};
        draftState.picks.forEach(p => {
            const key = p.teamName || 'Unknown';
            if (!teamDHQ[key]) teamDHQ[key] = { total: 0, picks: [], isUser: false };
            teamDHQ[key].total  += p.val || 0;
            teamDHQ[key].picks.push(p);
            if (p.isUser) teamDHQ[key].isUser = true;
        });
        const leagueRank = Object.entries(teamDHQ).sort((a, b) => b[1].total - a[1].total);

        // Alex's commentary
        const alexNote = (() => {
            let txt = `Grade: ${grades.grade}. You drafted ${grades.picks.length} player${grades.picks.length !== 1 ? 's' : ''} totaling ${grades.totalDHQ.toLocaleString()} DHQ.`;
            if (bestPick) txt += ` Best pick: ${bestPick.playerName} (${bestPick.pos}, ${bestPick.val.toLocaleString()} DHQ at R${bestPick.round}.${bestPick.pick}) — solid value.`;
            if (worstPick) txt += ` Biggest reach: ${worstPick.playerName} at R${worstPick.round}.${worstPick.pick}.`;
            if (Object.keys(posBreakdown).length > 0) txt += ` Position mix: ${Object.entries(posBreakdown).map(([p, ct]) => `${ct} ${p}`).join(', ')}.`;
            if (grades.valueCount >= grades.picks.length * 0.6) {
                txt += ' Strong draft — you consistently found value over ADP.';
            } else if (grades.reachCount >= grades.picks.length * 0.4) {
                txt += ' You reached a few times — high upside if those players hit, but tight on margin for error.';
            } else {
                txt += ' Solid fundamentals — balanced mix of need and value.';
            }
            return txt;
        })();

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', overflowY: 'auto', padding: '16px' }}>
                <style>{'.wr-md-tab-btn { transition: all 0.12s; }'}</style>

                <button onClick={() => setMode('setup')} style={{ position: 'fixed', top: 14, right: 14, zIndex: 910, background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '6px 13px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    ✕ NEW DRAFT
                </button>

                {/* Grade hero */}
                <div style={{ ...card, textAlign: 'center', padding: '28px 20px', background: 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.1) 0%, var(--black) 65%)', marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '5rem', fontWeight: 800, color: grades.gradeColor, lineHeight: 1, marginBottom: '4px' }}>{grades.grade}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px' }}>DRAFT GRADE</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '16px' }}>
                        {grades.picks.length} picks · {grades.totalDHQ.toLocaleString()} DHQ · {grades.avgEV.toLocaleString()} avg
                    </div>
                    {/* Value/Fair/Reach counters */}
                    <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '18px' }}>
                        {[['VALUE', grades.valueCount, '#2ECC71'], ['FAIR', grades.fairCount, 'var(--gold)'], ['REACH', grades.reachCount, '#E74C3C']].map(([label, count, color]) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{count}</div>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>{label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => { saveDraft(); setSaveMsg('Saved!'); setTimeout(() => setSaveMsg(''), 2500); }}
                            style={{ padding: '10px 22px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', fontWeight: 700 }}>
                            {saveMsg || 'SAVE DRAFT'}
                        </button>
                        <button onClick={() => setMode('live')}
                            style={{ padding: '10px 22px', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', fontWeight: 700 }}
                            title="Return to the draft board">
                            VIEW BOARD
                        </button>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(212,175,55,0.2)' }}>
                    {[['summary', 'My Picks'], ['league', 'League Board'], ['log', 'Full Log']].map(([tab, label]) => (
                        <button key={tab} className="wr-md-tab-btn" onClick={() => setResultView(tab)}
                            style={{ flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: resultView === tab ? 'var(--gold)' : 'var(--black)', color: resultView === tab ? 'var(--black)' : 'var(--gold)', borderRight: tab !== 'log' ? '1px solid rgba(212,175,55,0.2)' : 'none' }}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── MY PICKS ── */}
                {resultView === 'summary' && (
                    <div>
                        {/* Notes from the Front */}
                        <div style={{ ...card, borderColor: 'rgba(212,175,55,0.3)' }}>
                            <div style={lbl}>NOTES FROM THE FRONT</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--silver)', lineHeight: 1.75 }}>{alexNote}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gold)', marginTop: '10px', fontStyle: 'italic', opacity: 0.8 }}>— Alex, War Room AI</div>
                        </div>

                        {/* Position breakdown */}
                        {Object.keys(posBreakdown).length > 0 && (
                            <div style={card}>
                                <div style={lbl}>POSITION BREAKDOWN</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {Object.entries(posBreakdown).sort((a, b) => b[1] - a[1]).map(([pos, ct]) => (
                                        <div key={pos} style={{ padding: '10px 14px', borderRadius: '8px', textAlign: 'center', background: (POS_COLORS[pos] || '#666') + '18', border: `1px solid ${POS_COLORS[pos] || '#666'}33` }}>
                                            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.5rem', fontWeight: 800, color: POS_COLORS[pos] || 'var(--silver)', lineHeight: 1 }}>{ct}</div>
                                            <div style={{ fontSize: '0.62rem', color: POS_COLORS[pos] || 'var(--silver)', fontWeight: 700, marginTop: '2px' }}>{pos}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Graded picks */}
                        <div style={card}>
                            <div style={lbl}>YOUR PICKS — GRADED</div>
                            {grades.picks.map((p, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--silver)', minWidth: '45px', ...mono }}>R{p.round}.{p.pick}</span>
                                    <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`}
                                        style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                        onError={e => e.target.style.display = 'none'} />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</div>
                                        <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.7 }}>{p.pos} · {(p.val || 0).toLocaleString()} DHQ{p.age ? ` · Age ${p.age}` : ''}</div>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', color: p.verdict === 'Value' ? '#2ECC71' : p.verdict === 'Reach' ? '#E74C3C' : 'var(--gold)', background: p.verdict === 'Value' ? 'rgba(46,204,113,0.14)' : p.verdict === 'Reach' ? 'rgba(231,76,60,0.14)' : 'rgba(212,175,55,0.14)', flexShrink: 0 }}>
                                        {p.verdict}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── LEAGUE BOARD ── */}
                {resultView === 'league' && (
                    <div style={card}>
                        <div style={lbl}>DRAFT CLASS RANKINGS BY DHQ</div>
                        {leagueRank.map(([name, data], i) => (
                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', background: data.isUser ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: i === 0 ? 'var(--gold)' : 'rgba(255,255,255,0.3)', minWidth: '20px', textAlign: 'center', ...mono }}>{i + 1}</span>
                                <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: data.isUser ? 700 : 400, color: data.isUser ? 'var(--gold)' : 'var(--white)' }}>{name}</span>
                                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', minWidth: '52px', textAlign: 'right' }}>{data.picks.length} picks</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: data.isUser ? 'var(--gold)' : 'var(--silver)', minWidth: '72px', textAlign: 'right', ...mono }}>{data.total.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── FULL LOG ── */}
                {resultView === 'log' && (
                    <div style={card}>
                        <div style={lbl}>FULL DRAFT LOG — {draftState.picks.length} picks</div>
                        {draftState.picks.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.72rem', background: p.isUser ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                                <span style={{ color: 'rgba(255,255,255,0.3)', minWidth: '56px', ...mono }}>#{p.overall} R{p.round}.{p.pick}</span>
                                <span style={{ color: p.isUser ? 'var(--gold)' : 'rgba(255,255,255,0.4)', fontWeight: p.isUser ? 700 : 400, minWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.teamName}</span>
                                <span style={{ flex: 1, color: p.isUser ? 'var(--white)' : 'var(--silver)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.playerName}</span>
                                <span style={posTag(p.pos)}>{p.pos}</span>
                                <span style={{ color: 'rgba(255,255,255,0.2)', ...mono, minWidth: '50px', textAlign: 'right' }}>{(p.val || 0).toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Fallback (shouldn't reach here)
    return null;
}
