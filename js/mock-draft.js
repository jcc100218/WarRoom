// ══════════════════════════════════════════════════════════════════
// js/mock-draft.js — War Room Mock Draft Simulator
// Setup → pick-by-pick board → On The Clock with search/filters →
// AI opponents with need-weighted logic → trade execution → grade
// React component compiled by Babel standalone, rendered in DraftTab
// ══════════════════════════════════════════════════════════════════

function MockDraftPanel({ playersData, myRoster, currentLeague, draftRounds: propRounds }) {
    // ── Data refs ──────────────────────────────────────────────────
    const LI            = window.App?.LI || {};
    const S             = window.S || {};
    const rosters       = S.rosters || [];
    const myRid         = S.myRosterId;
    const assessFn      = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
    const ownerProfiles = LI.ownerProfiles || {};
    const hitRates      = LI.hitRateByRound || {};
    const scores        = LI.playerScores || {};
    const playerMeta    = LI.playerMeta || {};
    const posColors     = window.App?.POS_COLORS || { QB:'#60a5fa', RB:'#34d399', WR:'#d4af37', TE:'#fbbf24', DL:'#fb923c', LB:'#d4af37', DB:'#f472b6' };
    const normPos       = window.App?.normPos || (p => (p || '').toUpperCase());

    // ── Detect default draft slot from roster standings ────────────
    const defaultSlot = React.useMemo(() => {
        if (!rosters.length || !myRid) return 1;
        const sorted = [...rosters].sort((a, b) => (a.settings?.wins || 0) - (b.settings?.wins || 0));
        const idx = sorted.findIndex(r => r.roster_id === myRid);
        return idx >= 0 ? idx + 1 : 1;
    }, [rosters, myRid]);

    // ── Config state ───────────────────────────────────────────────
    const [config, setConfig] = React.useState({
        leagueSize: rosters.length || 12,
        rounds:     propRounds || 5,
        mySlot:     1,
        draftType:  'snake',
        clockSpeed: 'fast',
    });

    React.useEffect(() => {
        setConfig(c => ({
            ...c,
            mySlot:     defaultSlot,
            leagueSize: rosters.length || c.leagueSize,
        }));
    }, [defaultSlot, rosters.length]);

    // ── Mode + draft state ─────────────────────────────────────────
    const [mode,        setMode]        = React.useState('setup');
    const [draftState,  setDraftState]  = React.useState(null);
    const [simResults,  setSimResults]  = React.useState(null);
    const [savedDrafts, setSavedDrafts] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('wr_mock_drafts_' + (currentLeague?.id || '')) || '[]'); }
        catch { return []; }
    });

    // ── On The Clock UI filters ────────────────────────────────────
    const [posFilter,    setPosFilter]    = React.useState('');
    const [playerSearch, setPlayerSearch] = React.useState('');
    const [resultView,   setResultView]   = React.useState('summary');
    const [saveMsg,      setSaveMsg]      = React.useState('');

    // ── Style constants ────────────────────────────────────────────
    const card = {
        background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)',
        borderRadius: '10px', padding: '14px 16px', marginBottom: '12px',
    };
    const goldLabel = {
        fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif',
        fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px',
    };
    const cfgBtnStyle = (active, accent) => ({
        padding: '5px 13px', border: `1px solid ${active ? (accent || 'var(--gold)') : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '6px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
        fontSize: '0.78rem', fontWeight: active ? 700 : 500,
        background: active ? ((accent || 'var(--gold)') + '22') : 'transparent',
        color: active ? (accent || 'var(--gold)') : 'var(--silver)',
        transition: 'all 0.15s',
    });

    // ── Prospect Pool ──────────────────────────────────────────────
    const prospectPool = React.useMemo(() => {
        let pool = Object.entries(playerMeta)
            .filter(([pid, m]) => m.source === 'FC_ROOKIE' && (scores[pid] || 0) > 0)
            .map(([pid, m]) => {
                const p = playersData?.[pid] || S.players?.[pid] || {};
                return {
                    pid,
                    name:    p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || pid,
                    pos:     normPos(m.pos || p.position) || '?',
                    team:    p.team || '',
                    college: p.college || '',
                    val:     scores[pid] || 0,
                    age:     p.age || 21,
                };
            });

        // Fallback: unrostered young players when FC_ROOKIE pool is thin
        if (pool.length < 10) {
            const allPlayers = (playersData && Object.keys(playersData).length > 100) ? playersData : (S.players || {});
            const rostered = new Set();
            rosters.forEach(r => (r.players || []).forEach(pid => rostered.add(String(pid))));
            const existingPids = new Set(pool.map(p => p.pid));
            const fallback = [];
            Object.entries(allPlayers).forEach(([pid, p]) => {
                if (!p || existingPids.has(pid) || rostered.has(String(pid))) return;
                const pos = normPos(p.position);
                if (!pos || pos === 'DEF' || pos === 'UNK' || pos === 'K') return;
                const age = p.age || 25;
                const dhq = scores[pid] || 0;
                if (age > 25 && dhq <= 0) return;
                const val = dhq > 0 ? dhq : Math.max(500, 5000 - (age - 20) * 300);
                fallback.push({
                    pid, name: p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || pid,
                    pos, team: p.team || '', college: p.college || '', val, age,
                });
            });
            fallback.sort((a, b) => b.val - a.val);
            fallback.slice(0, 150).forEach(p => pool.push(p));
        }
        return pool.sort((a, b) => b.val - a.val);
    }, [playerMeta, scores, playersData]);

    // ── Effective user rosterID ────────────────────────────────────
    const effectiveMyRid = (myRid && rosters.length > 0) ? myRid : 'user';

    // ── Get team display name ──────────────────────────────────────
    const getTeamName = React.useCallback((rid, mRid) => {
        if (!rid) return 'Unknown';
        if (rid === 'user' || rid === mRid) return 'YOU';
        if (typeof rid === 'string' && rid.startsWith('ai_')) return 'Team ' + rid.replace('ai_', '');
        const user = (S.leagueUsers || []).find(u =>
            u.user_id === rid || String(u.user_id) === String(rid)
        );
        return user?.display_name || 'Team';
    }, [S.leagueUsers]);

    // ── Build pick order ───────────────────────────────────────────
    const buildPickOrder = (cfg) => {
        const { leagueSize, rounds, mySlot, draftType } = cfg;
        let teamSlots;
        if (rosters.length >= leagueSize) {
            const sorted = [...rosters].sort((a, b) => (a.settings?.wins || 0) - (b.settings?.wins || 0));
            teamSlots = sorted.slice(0, leagueSize).map(r => r.roster_id);
            // Pin user to selected slot
            const curUserIdx = teamSlots.findIndex(rid => rid === myRid);
            const targetIdx  = mySlot - 1;
            if (curUserIdx >= 0 && curUserIdx !== targetIdx) {
                [teamSlots[curUserIdx], teamSlots[targetIdx]] = [teamSlots[targetIdx], teamSlots[curUserIdx]];
            } else if (curUserIdx < 0 && myRid) {
                teamSlots[targetIdx] = myRid;
            }
        } else {
            teamSlots = Array.from({ length: leagueSize }, (_, i) =>
                i === mySlot - 1 ? (effectiveMyRid) : 'ai_' + (i + 1)
            );
        }
        const picks = [];
        for (let rd = 1; rd <= rounds; rd++) {
            const rdOrder = draftType === 'linear'
                ? [...teamSlots]
                : (rd % 2 === 1 ? [...teamSlots] : [...teamSlots].reverse());
            rdOrder.forEach((rid, i) => {
                picks.push({ round: rd, pick: i + 1, overall: picks.length + 1, rosterId: rid });
            });
        }
        return picks;
    };

    // ── AI pick logic (need-weighted + ±3 randomness) ─────────────
    const aiPick = (rosterId, available, mRid) => {
        if (!available.length) return null;
        const assess   = assessFn ? assessFn(rosterId) : null;
        const profile  = ownerProfiles[rosterId] || {};
        const needs    = (assess?.needs || []).slice(0, 4).map(n => typeof n === 'string' ? n : n.pos);
        const targetPos = profile?.targetPos || '';
        const tier     = (assess?.tier || '').toUpperCase();

        const scored = available.map(p => {
            let score = p.val; // BPA baseline
            const needIdx = needs.indexOf(p.pos);
            if (needIdx === 0)      score *= 2.0;
            else if (needIdx === 1) score *= 1.6;
            else if (needIdx >= 2)  score *= 1.2;
            if (targetPos && p.pos === targetPos) score *= 1.3;
            if (tier === 'REBUILDING' && p.age <= 22) score *= 1.15;
            if (tier === 'CONTENDER' && p.val >= 3000) score *= 1.1;
            // ±3 pick randomness
            score += (Math.random() - 0.5) * Math.min(p.val * 0.35, 800);
            return { ...p, score };
        });
        scored.sort((a, b) => b.score - a.score);
        // Pick from top 3 to simulate real variance
        const n = Math.min(3, scored.length);
        return scored[Math.floor(Math.random() * n)];
    };

    // ── Clock speed delays ─────────────────────────────────────────
    const DELAYS = { instant: 0, fast: 120, normal: 500, slow: 1500 };

    // ── Pick analytics ─────────────────────────────────────────────
    const getPickAnalytics = (overall, round, available, mRid) => {
        const hitRate = hitRates[round];
        const assess  = assessFn ? assessFn(mRid) : null;
        const needs   = (assess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
        const posCount = {};
        available.slice(0, 20).forEach(p => { posCount[p.pos] = (posCount[p.pos] || 0) + 1; });
        const scarce = needs.filter(n => (posCount[n] || 0) <= 2);
        const fitScored = available.slice(0, 15).map(p => {
            const needBonus = needs.indexOf(p.pos) === 0 ? 500 : needs.indexOf(p.pos) >= 0 ? 300 : 0;
            return { ...p, fit: p.val + needBonus };
        }).sort((a, b) => b.fit - a.fit);
        return { hitRate, needs, scarce, fitScored, posCount };
    };

    // ── Trade scenario generator ───────────────────────────────────
    const getTradeScenarios = (pickIdx, pickOrder, available, mRid) => {
        const myPick = pickOrder[pickIdx];
        if (!myPick || myPick.rosterId !== mRid) return [];
        const scenarios = [];
        const myVal = myPick.overall <= 12 ? 4000 : myPick.overall <= 24 ? 2200 : myPick.overall <= 48 ? 1200 : 700;

        for (let j = pickIdx + 2; j < Math.min(pickIdx + 10, pickOrder.length); j++) {
            const other = pickOrder[j];
            if (other.rosterId === mRid || other.rosterId === 'user') continue;
            const otherNeeds = (assessFn ? assessFn(other.rosterId)?.needs || [] : [])
                .slice(0, 2).map(n => typeof n === 'string' ? n : n.pos);
            const topAvail = available[0];
            if (topAvail && otherNeeds.includes(topAvail.pos)) {
                const theirVal = other.overall <= 12 ? 4000 : other.overall <= 24 ? 2200 : 1200;
                const netGain  = Math.round(theirVal * 1.15 - myVal + 600);
                if (netGain > 100) {
                    scenarios.push({
                        type: 'down', targetRid: other.rosterId, targetPickIdx: j,
                        targetName: getTeamName(other.rosterId, mRid),
                        give: `Pick #${myPick.overall} (R${myPick.round}.${String(myPick.pick).padStart(2,'0')})`,
                        get:  `Pick #${other.overall} (R${other.round}.${String(other.pick).padStart(2,'0')})`,
                        netDHQ: netGain,
                        reason: `${getTeamName(other.rosterId, mRid)} needs ${topAvail.pos} — ${topAvail.name} is available`,
                    });
                    if (scenarios.length >= 2) break;
                }
            }
        }
        return scenarios;
    };

    // ── Execute trade (swap pick ownership) ───────────────────────
    const executeTrade = (scenario, state) => {
        const { pickOrder, picks, currentIdx, myRid: mRid } = state;
        const newOrder = [...pickOrder];
        // Give your pick to them, take their future pick
        newOrder[currentIdx]              = { ...newOrder[currentIdx], rosterId: scenario.targetRid };
        newOrder[scenario.targetPickIdx]  = { ...newOrder[scenario.targetPickIdx], rosterId: mRid };

        const tradeLogEntry = {
            ...pickOrder[currentIdx], pid: null, playerName: '(traded away)',
            pos: '', val: 0, teamName: 'YOU → ' + scenario.targetName,
            isUser: true, isTrade: true,
        };
        const newState = { ...state, pickOrder: newOrder, picks: [...picks, tradeLogEntry], currentIdx: currentIdx + 1 };
        setDraftState(newState);

        const delay = DELAYS[config.clockSpeed] || 120;
        if (delay === 0) {
            setTimeout(() => batchAdvanceAI(newState, mRid), 0);
        } else {
            setTimeout(() => advanceAIStep(newState, mRid), delay);
        }
    };

    // ── Advance AI one pick at a time (for animated clock speeds) ─
    const advanceAIStep = (state, mRid) => {
        const { pickOrder, picks, currentIdx, pool } = state;
        if (currentIdx >= pickOrder.length) { setMode('results'); return; }

        const current = pickOrder[currentIdx];
        if (current.rosterId === mRid || current.rosterId === 'user') {
            setDraftState(state); return;
        }

        const pick = aiPick(current.rosterId, pool, mRid);
        if (!pick) { setDraftState(state); return; }

        const pIdx   = pool.findIndex(p => p.pid === pick.pid);
        const newPool = [...pool]; if (pIdx >= 0) newPool.splice(pIdx, 1);

        const newState = {
            ...state, pool: newPool, currentIdx: currentIdx + 1,
            picks: [...picks, {
                ...current, pid: pick.pid, playerName: pick.name, pos: pick.pos,
                val: pick.val, teamName: getTeamName(current.rosterId, mRid), isUser: false,
            }],
        };
        setDraftState(newState);

        if (newState.currentIdx >= pickOrder.length) { setMode('results'); return; }

        const next = pickOrder[newState.currentIdx];
        if (next.rosterId !== mRid && next.rosterId !== 'user') {
            setTimeout(() => advanceAIStep(newState, mRid), DELAYS[config.clockSpeed] || 120);
        }
    };

    // ── Batch advance AI instantly ─────────────────────────────────
    const batchAdvanceAI = (state, mRid) => {
        let s = { ...state };
        while (s.currentIdx < s.pickOrder.length) {
            const current = s.pickOrder[s.currentIdx];
            if (current.rosterId === mRid || current.rosterId === 'user') break;
            const pick = aiPick(current.rosterId, s.pool, mRid);
            if (!pick) break;
            const pIdx   = s.pool.findIndex(p => p.pid === pick.pid);
            const newPool = [...s.pool]; if (pIdx >= 0) newPool.splice(pIdx, 1);
            s = {
                ...s, pool: newPool, currentIdx: s.currentIdx + 1,
                picks: [...s.picks, {
                    ...current, pid: pick.pid, playerName: pick.name, pos: pick.pos,
                    val: pick.val, teamName: getTeamName(current.rosterId, mRid), isUser: false,
                }],
            };
        }
        setDraftState(s);
        if (s.currentIdx >= s.pickOrder.length) setMode('results');
    };

    // ── Start draft ────────────────────────────────────────────────
    const startDraft = () => {
        if (prospectPool.length < 5) {
            alert('Not enough prospect data. League Intelligence may still be loading — wait a moment and try again.');
            return;
        }
        const pickOrder = buildPickOrder(config);
        const mRid      = effectiveMyRid;
        const state     = { pool: [...prospectPool], pickOrder, picks: [], currentIdx: 0, myRid: mRid };
        setDraftState(state);
        setPosFilter('');
        setPlayerSearch('');
        setMode('live');

        const first = pickOrder[0];
        if (first && first.rosterId !== mRid) {
            const delay = DELAYS[config.clockSpeed] || 120;
            if (delay === 0) {
                setTimeout(() => batchAdvanceAI(state, mRid), 0);
            } else {
                setTimeout(() => advanceAIStep(state, mRid), delay);
            }
        }
    };

    // ── User makes a pick ──────────────────────────────────────────
    const makePick = (pid) => {
        if (!draftState) return;
        const { pool, pickOrder, picks, currentIdx, myRid: mRid } = draftState;
        const current = pickOrder[currentIdx];
        if (!current) return;

        const pIdx = pool.findIndex(p => p.pid === pid);
        if (pIdx < 0) return;
        const player  = pool[pIdx];
        const newPool = [...pool]; newPool.splice(pIdx, 1);

        const newState = {
            ...draftState, pool: newPool, currentIdx: currentIdx + 1,
            picks: [...picks, {
                ...current, pid: player.pid, playerName: player.name, pos: player.pos,
                val: player.val, teamName: 'YOU', isUser: true,
            }],
        };
        setDraftState(newState);
        setPosFilter('');
        setPlayerSearch('');

        if (newState.currentIdx >= pickOrder.length) { setMode('results'); return; }

        const next = pickOrder[newState.currentIdx];
        if (next.rosterId !== mRid && next.rosterId !== 'user') {
            const delay = DELAYS[config.clockSpeed] || 120;
            if (delay === 0) {
                setTimeout(() => batchAdvanceAI(newState, mRid), 0);
            } else {
                setTimeout(() => advanceAIStep(newState, mRid), delay);
            }
        }
    };

    // ── Monte Carlo multi-sim ──────────────────────────────────────
    const runMultiSim = () => {
        if (prospectPool.length < 5) {
            alert('Not enough prospect data to simulate. Wait for League Intelligence to load.');
            return;
        }
        const NUM_SIMS  = 10;
        const pickOrder = buildPickOrder(config);
        const mRid      = effectiveMyRid;
        const landingData = {};
        const myPickData  = {};

        for (let sim = 0; sim < NUM_SIMS; sim++) {
            const pool = [...prospectPool];
            pickOrder.forEach(slot => {
                if (!pool.length) return;
                let pick;
                if (slot.rosterId === mRid || slot.rosterId === 'user') {
                    const assess = assessFn ? assessFn(mRid) : null;
                    const needs  = (assess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
                    pick = pool.find(p => needs.includes(p.pos)) || pool[0];
                } else {
                    pick = (Math.random() < 0.3 && pool.length >= 5)
                        ? pool[Math.floor(Math.random() * 5)]
                        : aiPick(slot.rosterId, pool, mRid);
                }
                if (!pick) return;
                pool.splice(pool.indexOf(pick), 1);
                if (!landingData[pick.pid]) landingData[pick.pid] = { picks: [], teams: [] };
                landingData[pick.pid].picks.push(slot.overall);
                landingData[pick.pid].teams.push(slot.rosterId);
                if (slot.rosterId === mRid || slot.rosterId === 'user') {
                    if (!myPickData[slot.round]) myPickData[slot.round] = { posFreq: {} };
                    myPickData[slot.round].posFreq[pick.pos] = (myPickData[slot.round].posFreq[pick.pos] || 0) + 1;
                }
            });
        }

        const prospectRanges = Object.entries(landingData)
            .map(([pid, data]) => {
                const p = prospectPool.find(pr => pr.pid === pid) || { name: pid, pos: '?', val: 0 };
                const landings = [...data.picks].sort((a, b) => a - b);
                return {
                    pid, name: p.name, pos: p.pos, val: p.val,
                    min: landings[0], max: landings[landings.length - 1],
                    median: landings[Math.floor(landings.length / 2)],
                    count: landings.length,
                };
            })
            .sort((a, b) => a.median - b.median)
            .slice(0, 30);

        setSimResults({ prospectRanges, myPickData, landingData, numSims: NUM_SIMS, totalPicks: pickOrder.length });
        setMode('multisim');
    };

    // ── Grade user picks ───────────────────────────────────────────
    const gradeMyPicks = (picks) => {
        const myPicks = picks.filter(p => p.isUser && p.pid);
        if (!myPicks.length) return { grade: '?', letter: '?', picks: [], totalDHQ: 0, avgEV: 0 };
        const totalDHQ = myPicks.reduce((s, p) => s + (p.val || 0), 0);
        const avgEV    = Math.round(totalDHQ / myPicks.length);
        const gradedPicks = myPicks.map(p => {
            const bpa  = prospectPool.find(pr => pr.val > p.val && pr.pid !== p.pid);
            const diff = bpa ? p.val - bpa.val : 0;
            return { ...p, verdict: diff >= 0 ? 'Value' : Math.abs(diff) < 500 ? 'Fair' : 'Reach' };
        });
        const valueCount = gradedPicks.filter(p => p.verdict === 'Value').length;
        const pct        = valueCount / myPicks.length;
        const grade = pct >= 0.8 ? 'A+' : pct >= 0.65 ? 'A' : pct >= 0.5 ? 'B+' : pct >= 0.35 ? 'B' : pct >= 0.2 ? 'C+' : 'C';
        return { grade, picks: gradedPicks, totalDHQ, avgEV };
    };

    // ── Save draft ─────────────────────────────────────────────────
    const saveDraft = () => {
        if (!draftState) return;
        const g = gradeMyPicks(draftState.picks);
        const saved = {
            ts: Date.now(), picks: draftState.picks, league: currentLeague?.name || 'Draft',
            teams: config.leagueSize, grade: g.grade, totalDHQ: g.totalDHQ,
        };
        const all = [saved, ...savedDrafts].slice(0, 5);
        localStorage.setItem('wr_mock_drafts_' + (currentLeague?.id || ''), JSON.stringify(all));
        setSavedDrafts(all);
        setSaveMsg('Saved!');
        setTimeout(() => setSaveMsg(''), 2000);
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: SETUP
    // ─────────────────────────────────────────────────────────────
    if (mode === 'setup') {
        const SIZES  = [8, 10, 12, 14, 16];
        const SPEEDS = [['instant','Instant'],['fast','Fast'],['normal','Normal'],['slow','Slow']];

        return (
            <div>
                {/* Header */}
                <div style={{ ...card, textAlign: 'center', padding: '20px 16px' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.04em' }}>
                        MOCK DRAFT ENGINE
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--silver)', marginTop: '4px' }}>
                        {prospectPool.length} prospects loaded · Configure and launch
                    </div>
                </div>

                {/* Config */}
                <div style={card}>
                    <div style={goldLabel}>DRAFT SETTINGS</div>

                    {/* League Size */}
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', marginBottom: '6px' }}>League Size</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {SIZES.map(n => (
                                <button key={n} style={cfgBtnStyle(config.leagueSize === n)}
                                    onClick={() => setConfig(c => ({ ...c, leagueSize: n, mySlot: Math.min(c.mySlot, n) }))}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rounds */}
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', marginBottom: '6px' }}>
                            Rounds — <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{config.rounds}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[1,2,3,4,5].map(n => (
                                <button key={n} style={cfgBtnStyle(config.rounds === n)}
                                    onClick={() => setConfig(c => ({ ...c, rounds: n }))}>
                                    {n}
                                </button>
                            ))}
                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
                            {[10,15,20,25,30].map(n => (
                                <button key={n} style={cfgBtnStyle(config.rounds === n)}
                                    onClick={() => setConfig(c => ({ ...c, rounds: n }))}>
                                    {n}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.45, marginTop: '4px' }}>
                            1–5 for rookie draft · 20–30 for startup
                        </div>
                    </div>

                    {/* My Slot */}
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', marginBottom: '6px' }}>
                            My Pick Slot — <span style={{ color: 'var(--gold)', fontWeight: 700 }}>#{config.mySlot} of {config.leagueSize}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {Array.from({ length: config.leagueSize }, (_, i) => i + 1).map(n => (
                                <button key={n} style={cfgBtnStyle(config.mySlot === n)}
                                    onClick={() => setConfig(c => ({ ...c, mySlot: n }))}>
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Draft Type */}
                    <div style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', marginBottom: '6px' }}>Draft Order</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={cfgBtnStyle(config.draftType === 'snake')}
                                onClick={() => setConfig(c => ({ ...c, draftType: 'snake' }))}>
                                Snake
                            </button>
                            <button style={cfgBtnStyle(config.draftType === 'linear')}
                                onClick={() => setConfig(c => ({ ...c, draftType: 'linear' }))}>
                                Linear
                            </button>
                        </div>
                    </div>

                    {/* Clock Speed */}
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', marginBottom: '6px' }}>AI Clock Speed</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {SPEEDS.map(([val, label]) => (
                                <button key={val} style={cfgBtnStyle(config.clockSpeed === val)}
                                    onClick={() => setConfig(c => ({ ...c, clockSpeed: val }))}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.45, marginTop: '4px' }}>
                            {config.clockSpeed === 'instant'
                                ? 'AI picks batch instantly'
                                : config.clockSpeed === 'fast'
                                ? '~0.1s per AI pick'
                                : config.clockSpeed === 'normal'
                                ? '~0.5s per AI pick'
                                : '~1.5s per pick — watch the board fill in'}
                        </div>
                    </div>
                </div>

                {/* Launch */}
                <div style={{ ...card, textAlign: 'center', padding: '18px 16px' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--silver)', marginBottom: '14px' }}>
                        {config.leagueSize} teams · {config.rounds} rounds · {config.leagueSize * config.rounds} total picks · Slot #{config.mySlot} · {config.draftType === 'snake' ? 'Snake' : 'Linear'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={startDraft}
                            style={{ padding: '11px 28px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
                            START DRAFT
                        </button>
                        <button onClick={runMultiSim}
                            style={{ padding: '11px 20px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
                            10-SIM MONTE CARLO
                        </button>
                    </div>
                </div>

                {/* Saved Drafts */}
                {savedDrafts.length > 0 && (
                    <div style={card}>
                        <div style={goldLabel}>SAVED DRAFTS</div>
                        {savedDrafts.map((d, i) => (
                            <div key={i}
                                onClick={() => { setDraftState({ ...d, pool: [], pickOrder: [], currentIdx: d.picks?.length || 0 }); setResultView('summary'); setMode('results'); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--silver)', minWidth: '68px' }}>{new Date(d.ts).toLocaleDateString()}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--white)', flex: 1 }}>{d.picks?.length || 0} picks · {d.league}</span>
                                {d.grade && <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', padding: '1px 7px', borderRadius: '4px', background: 'rgba(212,175,55,0.1)' }}>{d.grade}</span>}
                                <span style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>View →</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: LIVE DRAFT
    // ─────────────────────────────────────────────────────────────
    if (mode === 'live' && draftState) {
        const { pool, pickOrder, picks, currentIdx, myRid: mRid } = draftState;
        const current    = currentIdx < pickOrder.length ? pickOrder[currentIdx] : null;
        const isMyPick   = !!(current && (current.rosterId === mRid || current.rosterId === 'user'));
        const analytics  = isMyPick && current ? getPickAnalytics(current.overall, current.round, pool, mRid) : null;
        const tradeOpts  = isMyPick && current ? getTradeScenarios(currentIdx, pickOrder, pool, mRid) : [];

        // Filtered player list
        const filteredPool = pool.filter(p => {
            if (posFilter && p.pos !== posFilter) return false;
            if (playerSearch) {
                const q = playerSearch.toLowerCase();
                if (!p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
            }
            return true;
        });
        const availPos = [...new Set(pool.map(p => p.pos))].filter(Boolean).sort();

        // Build board grid data: round_rosterId → pick
        const gridData = {};
        picks.forEach(p => { if (p.pid || p.isTrade) gridData[p.round + '_' + p.rosterId] = p; });
        // Team column order: round-1 slot order
        const teamOrder = pickOrder.filter(p => p.round === 1).map(p => p.rosterId);

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', overflowY: 'auto', padding: '14px 14px 60px' }}>
                {/* Exit */}
                <button onClick={() => setMode('setup')}
                    style={{ position: 'fixed', top: '10px', right: '12px', zIndex: 910, background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '5px 12px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>
                    ✕ Exit
                </button>

                {/* Progress bar */}
                <div style={{ marginBottom: '10px', paddingRight: '80px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, letterSpacing: '0.06em' }}>
                            {current ? `ROUND ${current.round} · PICK ${current.overall} / ${pickOrder.length}` : 'DRAFT COMPLETE'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)' }}>{picks.length} made</div>
                    </div>
                    <div style={{ height: '3px', background: 'rgba(212,175,55,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(currentIdx / pickOrder.length * 100)}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.35s ease' }} />
                    </div>
                </div>

                {/* ── DRAFT BOARD GRID ── */}
                <div style={{ ...card, padding: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '6px' }}>
                        DRAFT BOARD
                    </div>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: teamOrder.length * 72 + 36 + 'px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '28px', padding: '2px 4px', fontSize: '0.55rem', color: 'var(--gold)', fontWeight: 700, textAlign: 'left', borderBottom: '1px solid rgba(212,175,55,0.2)', position: 'sticky', left: 0, background: 'var(--black)', zIndex: 2 }}>RD</th>
                                    {teamOrder.map(rid => (
                                        <th key={rid} style={{
                                            width: '72px', padding: '2px 3px', fontSize: '0.55rem', fontWeight: 700, textAlign: 'center',
                                            textTransform: 'uppercase', letterSpacing: '0.02em',
                                            borderBottom: '1px solid rgba(212,175,55,0.2)',
                                            background: rid === mRid ? 'rgba(212,175,55,0.12)' : 'var(--black)',
                                            color: rid === mRid ? 'var(--gold)' : 'rgba(255,255,255,0.4)',
                                            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                        }}>
                                            {rid === mRid ? 'YOU' : getTeamName(rid, mRid).slice(0, 7)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: config.rounds }, (_, ri) => {
                                    const rd = ri + 1;
                                    return (
                                        <tr key={rd}>
                                            <td style={{ padding: '2px 4px', fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'sticky', left: 0, background: 'var(--black)', zIndex: 1 }}>{rd}</td>
                                            {teamOrder.map(rid => {
                                                const pick      = gridData[rd + '_' + rid];
                                                const isMe      = rid === mRid;
                                                const isCurrent = current && current.round === rd && current.rosterId === rid;
                                                const pc        = posColors[pick?.pos] || 'var(--silver)';
                                                return (
                                                    <td key={rid} style={{
                                                        padding: '2px 3px', textAlign: 'center', width: '72px',
                                                        border: '1px solid rgba(255,255,255,0.04)',
                                                        background: isCurrent
                                                            ? (isMyPick ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.05)')
                                                            : isMe ? 'rgba(212,175,55,0.04)' : 'transparent',
                                                        outline: isCurrent ? `2px solid ${isMyPick ? 'var(--gold)' : 'rgba(255,255,255,0.25)'}` : 'none',
                                                        outlineOffset: '-1px',
                                                    }}>
                                                        {pick ? (
                                                            <>
                                                                <div style={{ fontSize: '0.58rem', color: isMe ? 'var(--white)' : 'rgba(255,255,255,0.65)', fontWeight: isMe ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {pick.isTrade ? '→' : pick.playerName?.split(' ').pop()?.slice(0, 8) || '—'}
                                                                </div>
                                                                {!pick.isTrade && <div style={{ fontSize: '0.5rem', fontWeight: 700, color: pc }}>{pick.pos}</div>}
                                                            </>
                                                        ) : isCurrent ? (
                                                            <div style={{ fontSize: '0.58rem', color: isMyPick ? 'var(--gold)' : 'var(--silver)', fontWeight: 700 }}>
                                                                {isMyPick ? 'YOU' : '…'}
                                                            </div>
                                                        ) : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── MAIN: On The Clock + Analytics ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMyPick ? '1fr 280px' : '1fr', gap: '10px' }}>

                    {/* LEFT COLUMN */}
                    <div>
                        {/* Pick header */}
                        {current && (
                            <div style={{ ...card, borderColor: isMyPick ? 'var(--gold)' : 'rgba(255,255,255,0.07)', background: isMyPick ? 'rgba(212,175,55,0.04)' : 'var(--black)', padding: '10px 14px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.65rem', color: isMyPick ? 'var(--gold)' : 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
                                    {isMyPick ? '⏱ ON THE CLOCK — YOUR PICK' : `Picking now: ${getTeamName(current.rosterId, mRid)}`}
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', fontFamily: 'Rajdhani, sans-serif' }}>
                                    R{current.round}.{String(current.pick).padStart(2, '0')} &nbsp;·&nbsp; Pick #{current.overall}
                                </div>
                            </div>
                        )}

                        {/* ON THE CLOCK — player list with search + filters */}
                        {isMyPick && (
                            <div style={card}>
                                <div style={goldLabel}>BEST AVAILABLE</div>

                                {/* Position filter pills */}
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '7px' }}>
                                    <button onClick={() => setPosFilter('')}
                                        style={{ ...cfgBtnStyle(!posFilter), padding: '3px 10px', fontSize: '0.7rem' }}>All</button>
                                    {availPos.map(pos => (
                                        <button key={pos} onClick={() => setPosFilter(pos === posFilter ? '' : pos)}
                                            style={{ ...cfgBtnStyle(posFilter === pos, posColors[pos] || 'var(--gold)'), padding: '3px 10px', fontSize: '0.7rem' }}>
                                            {pos}
                                        </button>
                                    ))}
                                </div>

                                {/* Search */}
                                <div style={{ position: 'relative', marginBottom: '8px' }}>
                                    <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', pointerEvents: 'none' }}>🔍</span>
                                    <input type="text" placeholder="Search name or team…" value={playerSearch}
                                        onChange={e => setPlayerSearch(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--charcoal)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box', outline: 'none' }}
                                    />
                                </div>

                                {/* Column header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '26px 26px 1fr 40px 60px 44px 68px', gap: '2px', alignItems: 'center', padding: '0 4px 5px', fontSize: '0.58rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(212,175,55,0.12)' }}>
                                    <span>#</span><span></span><span>Player</span>
                                    <span style={{ textAlign: 'center' }}>Pos</span>
                                    <span style={{ textAlign: 'right' }}>DHQ</span>
                                    <span style={{ textAlign: 'center' }}>Fit</span>
                                    <span></span>
                                </div>

                                {/* Rows */}
                                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                                    {filteredPool.slice(0, 35).map((p, pi) => {
                                        const dhqCol  = p.val >= 7000 ? '#2ECC71' : p.val >= 4000 ? '#3498DB' : p.val >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.28)';
                                        const needFit = analytics?.needs?.includes(p.pos);
                                        return (
                                            <div key={p.pid}
                                                style={{ display: 'grid', gridTemplateColumns: '26px 26px 1fr 40px 60px 44px 68px', gap: '2px', alignItems: 'center', padding: '5px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: pi % 2 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: 'default' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,55,0.035)'}
                                                onMouseLeave={e => e.currentTarget.style.background = pi % 2 ? 'rgba(255,255,255,0.01)' : 'transparent'}>
                                                <span style={{ fontSize: '0.65rem', color: pi < 3 ? 'var(--gold)' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{pi + 1}</span>
                                                <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`} alt=""
                                                    style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                                                    onError={e => { e.target.style.display = 'none'; }} />
                                                <div style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                                    <div style={{ fontSize: '0.58rem', color: 'var(--silver)', opacity: 0.5 }}>{[p.team, p.college].filter(Boolean).join(' · ')}</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: posColors[p.pos] || 'var(--silver)', padding: '1px 4px', background: (posColors[p.pos] || '#666') + '22', borderRadius: '4px' }}>{p.pos}</span>
                                                </div>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: dhqCol, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{p.val.toLocaleString()}</span>
                                                <div style={{ textAlign: 'center' }}>
                                                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: needFit ? '#2ECC71' : 'rgba(255,255,255,0.18)' }}>
                                                        {needFit ? 'NEED' : '—'}
                                                    </span>
                                                </div>
                                                <button onClick={() => makePick(p.pid)}
                                                    style={{ padding: '4px 0', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '5px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', width: '100%' }}>
                                                    DRAFT
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {filteredPool.length === 0 && (
                                        <div style={{ padding: '18px', textAlign: 'center', color: 'var(--silver)', opacity: 0.4, fontSize: '0.8rem' }}>
                                            No players match filter
                                        </div>
                                    )}
                                </div>
                                {filteredPool.length > 35 && (
                                    <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.35, textAlign: 'center', padding: '6px 0 0' }}>
                                        +{filteredPool.length - 35} more — refine filter
                                    </div>
                                )}
                            </div>
                        )}

                        {/* AI picking indicator */}
                        {!isMyPick && current && (
                            <div style={{ ...card, textAlign: 'center', padding: '22px 16px' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--silver)' }}>
                                    {getTeamName(current.rosterId, mRid)} is on the clock…
                                </div>
                                {config.clockSpeed !== 'instant' && (
                                    <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.4, marginTop: '4px' }}>
                                        {config.clockSpeed === 'slow' ? 'Watch the board fill in' : 'Watch the board →'}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Trade scenarios */}
                        {tradeOpts.length > 0 && (
                            <div style={card}>
                                <div style={goldLabel}>TRADE SCENARIOS</div>
                                {tradeOpts.map((t, i) => (
                                    <div key={i} style={{ padding: '10px 12px', background: 'rgba(46,204,113,0.03)', border: '1px solid rgba(46,204,113,0.15)', borderRadius: '8px', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#2ECC71', fontWeight: 700 }}>↓ Trade Down</span>
                                            <span style={{ fontSize: '0.88rem', color: '#2ECC71', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>+{t.netDHQ} DHQ</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '6px', fontSize: '0.7rem' }}>
                                            <div style={{ padding: '5px 8px', background: 'rgba(248,113,113,0.06)', borderRadius: '5px', border: '1px solid rgba(248,113,113,0.1)' }}>
                                                <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '2px' }}>YOU GIVE</div>
                                                <div style={{ color: 'var(--silver)' }}>{t.give}</div>
                                            </div>
                                            <div style={{ padding: '5px 8px', background: 'rgba(46,204,113,0.06)', borderRadius: '5px', border: '1px solid rgba(46,204,113,0.1)' }}>
                                                <div style={{ color: '#2ECC71', fontWeight: 600, marginBottom: '2px' }}>YOU GET</div>
                                                <div style={{ color: 'var(--silver)' }}>{t.get}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '0.66rem', color: 'var(--silver)', marginBottom: '7px' }}>{t.reason}</div>
                                        <button onClick={() => executeTrade(t, draftState)}
                                            style={{ padding: '5px 14px', background: 'rgba(46,204,113,0.12)', color: '#2ECC71', border: '1px solid rgba(46,204,113,0.3)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }}>
                                            ACCEPT TRADE
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Draft log */}
                        {picks.length > 0 && (
                            <div style={card}>
                                <div style={goldLabel}>DRAFT LOG ({picks.length})</div>
                                <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                    {[...picks].reverse().slice(0, 25).map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.68rem' }}>
                                            <span style={{ color: 'var(--silver)', minWidth: '38px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem' }}>R{p.round}.{p.pick}</span>
                                            {p.pid && <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
                                            <span style={{ color: p.isUser ? 'var(--gold)' : 'rgba(255,255,255,0.45)', minWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: p.isUser ? 700 : 400 }}>{p.teamName}</span>
                                            <span style={{ color: p.isTrade ? 'rgba(46,204,113,0.7)' : 'var(--white)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.playerName}</span>
                                            {p.pos && <span style={{ color: posColors[p.pos] || 'var(--silver)', fontWeight: 700, fontSize: '0.6rem' }}>{p.pos}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN — Analytics (your pick only) */}
                    {isMyPick && analytics && (
                        <div>
                            <div style={card}>
                                <div style={goldLabel}>PICK INTEL</div>
                                <div style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 700, marginBottom: '8px' }}>
                                    Pick #{current.overall} · Round {current.round}
                                </div>
                                {analytics.hitRate && (
                                    <div style={{ marginBottom: '10px', padding: '8px 10px', background: 'rgba(212,175,55,0.04)', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', marginBottom: '2px' }}>Historical hit rate</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' }}>
                                            {analytics.hitRate.rate || '?'}%
                                        </div>
                                        {analytics.hitRate.bestPos && (
                                            <div style={{ fontSize: '0.65rem', color: 'var(--silver)' }}>
                                                Best: {analytics.hitRate.bestPos.slice(0, 2).map(p => `${p.pos}(${p.rate}%)`).join(' · ')}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {analytics.needs.length > 0 && (
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', marginBottom: '4px' }}>Your needs</div>
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {analytics.needs.map((pos, i) => (
                                                <span key={pos} style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: i === 0 ? 'rgba(248,113,113,0.15)' : 'rgba(212,175,55,0.1)', color: i === 0 ? '#f87171' : 'var(--gold)' }}>
                                                    {i === 0 ? '🔴 ' : ''}{pos}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {analytics.scarce.length > 0 && (
                                <div style={{ ...card, borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.03)' }}>
                                    <div style={{ ...goldLabel, color: '#f87171' }}>SCARCITY ALERT</div>
                                    {analytics.scarce.map(pos => (
                                        <div key={pos} style={{ fontSize: '0.72rem', color: '#f87171', marginBottom: '3px' }}>
                                            Only {analytics.posCount[pos] || 0} {pos}s left in top 20
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={card}>
                                <div style={goldLabel}>TOP FITS</div>
                                {analytics.fitScored.slice(0, 6).map(p => (
                                    <div key={p.pid} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '0.7rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <span style={{ color: posColors[p.pos] || 'var(--silver)', fontWeight: 700, fontSize: '0.62rem', minWidth: '26px' }}>{p.pos}</span>
                                        <span style={{ color: 'var(--white)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                        <span style={{ color: analytics.needs.includes(p.pos) ? '#2ECC71' : 'rgba(255,255,255,0.2)', fontSize: '0.6rem', fontWeight: 700 }}>
                                            {analytics.needs.includes(p.pos) ? '★' : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: MULTI-SIM
    // ─────────────────────────────────────────────────────────────
    if (mode === 'multisim' && simResults) {
        const { prospectRanges, myPickData, landingData, numSims, totalPicks } = simResults;

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', overflowY: 'auto', padding: '20px' }}>
                <button onClick={() => setMode('setup')}
                    style={{ position: 'fixed', top: '10px', right: '12px', zIndex: 910, background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', padding: '5px 12px', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>
                    ✕ Exit
                </button>

                <div style={{ ...card, textAlign: 'center', paddingTop: '20px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', marginBottom: '4px' }}>
                        {numSims} SIMULATIONS COMPLETE
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>
                        {prospectRanges.length} prospects · {config.leagueSize} teams · {config.rounds} rounds
                    </div>
                </div>

                {/* Prospect landing ranges */}
                <div style={card}>
                    <div style={goldLabel}>PROSPECT LANDING RANGES</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 32px 1fr 90px', gap: '4px', padding: '4px 0 6px', fontSize: '0.58rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(212,175,55,0.12)', marginBottom: '4px' }}>
                        <span>Player</span><span>Pos</span><span>Range</span><span style={{ textAlign: 'right' }}>Picks</span>
                    </div>
                    {prospectRanges.map(p => (
                        <div key={p.pid} style={{ display: 'grid', gridTemplateColumns: '140px 32px 1fr 90px', gap: '4px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--white)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: posColors[p.pos] || 'var(--silver)' }}>{p.pos}</span>
                            <div style={{ position: 'relative', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{
                                    position: 'absolute',
                                    left: `${(p.min - 1) / totalPicks * 100}%`,
                                    width: `${Math.max(2, (p.max - p.min) / totalPicks * 100)}%`,
                                    height: '100%', background: 'rgba(212,175,55,0.3)', borderRadius: '5px',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    left: `${(p.median - 1) / totalPicks * 100}%`,
                                    width: '3px', height: '100%', background: 'var(--gold)', borderRadius: '2px',
                                }} />
                            </div>
                            <span style={{ fontSize: '0.62rem', color: 'var(--silver)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>#{p.min}–#{p.max} (med #{p.median})</span>
                        </div>
                    ))}
                </div>

                {/* Your pick projections */}
                {Object.keys(myPickData).length > 0 && (
                    <div style={card}>
                        <div style={goldLabel}>YOUR PICK PROJECTIONS</div>
                        {Object.entries(myPickData).map(([rd, data]) => (
                            <div key={rd} style={{ marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--gold)', fontWeight: 600, marginBottom: '5px' }}>Round {rd}</div>
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                    {Object.entries(data.posFreq).sort((a, b) => b[1] - a[1]).map(([pos, count]) => (
                                        <span key={pos} style={{ fontSize: '0.68rem', padding: '2px 10px', borderRadius: '10px', background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' }}>
                                            {pos}: {Math.round(count / numSims * 100)}%
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Draft tendencies */}
                <div style={card}>
                    <div style={goldLabel}>DRAFT TENDENCIES</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--silver)', marginBottom: '8px' }}>Who goes where across all simulations</div>
                    {(() => {
                        const tendencies = Object.entries(landingData)
                            .map(([pid, data]) => {
                                const p   = prospectPool.find(pr => pr.pid === pid) || { name: pid, pos: '?' };
                                const avg = Math.round(data.picks.reduce((s, v) => s + v, 0) / data.picks.length);
                                const mn  = Math.min(...data.picks);
                                const mx  = Math.max(...data.picks);
                                const teamFreq = {};
                                data.teams.forEach(rid => { teamFreq[rid] = (teamFreq[rid] || 0) + 1; });
                                const [modeRid, modeCt] = Object.entries(teamFreq).sort((a, b) => b[1] - a[1])[0] || [];
                                const modeName = modeRid ? getTeamName(modeRid, effectiveMyRid) : '—';
                                return { pid, name: p.name, pos: p.pos, avg, min: mn, max: mx, modeName, modePct: modeCt ? Math.round(modeCt / data.teams.length * 100) : 0 };
                            })
                            .sort((a, b) => a.avg - b.avg)
                            .slice(0, 12);
                        return tendencies.map((t, i) => (
                            <div key={t.pid} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 56px 80px 1fr', gap: '4px', alignItems: 'center', padding: '5px 6px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--white)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: posColors[t.pos] || 'var(--silver)', textAlign: 'center' }}>{t.pos}</span>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>#{t.avg}</span>
                                <span style={{ fontSize: '0.62rem', color: 'var(--silver)', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>#{t.min}–#{t.max}</span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--silver)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t.modeName} <span style={{ color: 'var(--gold)' }}>({t.modePct}%)</span>
                                </span>
                            </div>
                        ));
                    })()}
                </div>
            </div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: RESULTS / POST-DRAFT
    // ─────────────────────────────────────────────────────────────
    if (mode === 'results' && draftState) {
        const grades = gradeMyPicks(draftState.picks);

        // League DHQ ranking
        const teamDHQ = {};
        draftState.picks.forEach(p => {
            if (!p.pid && !p.val) return;
            const key = p.teamName || 'Unknown';
            if (!teamDHQ[key]) teamDHQ[key] = { total: 0, picks: [], isUser: p.isUser };
            teamDHQ[key].total += p.val || 0;
            teamDHQ[key].picks.push(p);
            if (p.isUser) teamDHQ[key].isUser = true;
        });
        const leagueRanking = Object.entries(teamDHQ).sort((a, b) => b[1].total - a[1].total);

        const bestPick  = grades.picks.reduce((b, p) => (!b || p.val > b.val) ? p : b, null);
        const worstPick = grades.picks.reduce((w, p) => (!w || p.val < w.val) ? p : w, null);
        const posBreakdown = {};
        grades.picks.forEach(p => { posBreakdown[p.pos] = (posBreakdown[p.pos] || 0) + 1; });

        const gradeColor = grades.grade.startsWith('A') ? '#2ECC71' : grades.grade.startsWith('B') ? 'var(--gold)' : '#f87171';

        const TABS = [['summary','Summary'],['table','Round Table'],['log','Full Log']];

        return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', overflowY: 'auto', padding: '16px' }}>
                {/* Grade header */}
                <div style={{ ...card, textAlign: 'center', padding: '24px 16px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '4rem', fontWeight: 800, color: gradeColor, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 }}>
                        {grades.grade}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', marginBottom: '6px' }}>DRAFT GRADE</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '14px' }}>
                        {grades.picks.length} picks · {grades.totalDHQ.toLocaleString()} total DHQ · {grades.avgEV.toLocaleString()} avg/pick
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={saveDraft}
                            style={{ padding: '9px 20px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            {saveMsg || 'SAVE DRAFT'}
                        </button>
                        <button onClick={() => setMode('setup')}
                            style={{ padding: '9px 18px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '7px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem', fontWeight: 700 }}>
                            NEW DRAFT
                        </button>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(212,175,55,0.2)', marginBottom: '10px' }}>
                    {TABS.map(([tab, label], i) => (
                        <button key={tab} onClick={() => setResultView(tab)}
                            style={{ flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: resultView === tab ? 'var(--gold)' : 'var(--black)', color: resultView === tab ? 'var(--black)' : 'var(--gold)', borderRight: i < TABS.length - 1 ? '1px solid rgba(212,175,55,0.2)' : 'none' }}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Summary ── */}
                {resultView === 'summary' && (
                    <>
                        {/* Alex's analysis */}
                        <div style={{ ...card, borderColor: 'rgba(212,175,55,0.3)' }}>
                            <div style={goldLabel}>ALEX'S ANALYSIS</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--silver)', lineHeight: 1.75 }}>
                                {`Overall grade: ${grades.grade}. You drafted ${grades.picks.length} player${grades.picks.length !== 1 ? 's' : ''} for ${grades.totalDHQ.toLocaleString()} total DHQ — ${grades.avgEV.toLocaleString()} per pick average. `}
                                {bestPick ? `Best pick: ${bestPick.playerName} (${bestPick.pos}, ${bestPick.val.toLocaleString()} DHQ at R${bestPick.round}.${bestPick.pick}). ` : ''}
                                {worstPick && worstPick.pid !== bestPick?.pid ? `Your biggest reach was ${worstPick.playerName} at R${worstPick.round}.${worstPick.pick} — ${worstPick.val.toLocaleString()} DHQ is thin for that slot. ` : ''}
                                {`Position breakdown: ${Object.entries(posBreakdown).map(([p, n]) => `${n} ${p}`).join(', ')}. `}
                                {grades.picks.filter(p => p.verdict === 'Value').length >= grades.picks.length * 0.5
                                    ? 'You consistently drafted value — solid dynasty process.'
                                    : 'Some reaches, but the overall portfolio is workable.'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gold)', marginTop: '8px', fontStyle: 'italic' }}>— Alex</div>
                        </div>

                        {/* Your picks graded */}
                        <div style={card}>
                            <div style={goldLabel}>YOUR PICKS</div>
                            {grades.picks.map((p, i) => {
                                const vColor = p.verdict === 'Value' ? '#2ECC71' : p.verdict === 'Fair' ? 'var(--gold)' : '#f87171';
                                const vBg    = p.verdict === 'Value' ? 'rgba(46,204,113,0.12)' : p.verdict === 'Fair' ? 'rgba(212,175,55,0.12)' : 'rgba(248,113,113,0.12)';
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--silver)', minWidth: '42px', fontFamily: 'JetBrains Mono, monospace' }}>R{p.round}.{p.pick}</span>
                                        <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                        <span style={{ fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600, flex: 1 }}>{p.playerName}</span>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: posColors[p.pos] || 'var(--silver)', padding: '1px 6px', borderRadius: '4px', background: (posColors[p.pos] || '#666') + '22' }}>{p.pos}</span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--silver)', fontFamily: 'JetBrains Mono, monospace', minWidth: '48px', textAlign: 'right' }}>{(p.val || 0).toLocaleString()}</span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: vBg, color: vColor, minWidth: '46px', textAlign: 'center' }}>{p.verdict}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* League ranking */}
                        <div style={card}>
                            <div style={goldLabel}>LEAGUE DRAFT RANKING</div>
                            {leagueRanking.map(([name, data], i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <span style={{ fontSize: '0.7rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)', fontWeight: 700, minWidth: '22px' }}>#{i + 1}</span>
                                    <span style={{ fontSize: '0.78rem', color: data.isUser ? 'var(--gold)' : 'var(--white)', fontWeight: data.isUser ? 700 : 400, flex: 1 }}>
                                        {name}{data.isUser ? ' (YOU)' : ''}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--silver)' }}>{data.picks.length} picks</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: i < 3 ? '#2ECC71' : 'var(--silver)', fontFamily: 'JetBrains Mono, monospace' }}>{data.total.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* ── Round Table ── */}
                {resultView === 'table' && (() => {
                    const gridData2 = {};
                    const allTeams  = new Set();
                    const t1Order   = [];
                    draftState.picks.forEach(p => {
                        if (!allTeams.has(p.rosterId)) { allTeams.add(p.rosterId); t1Order.push(p.rosterId); }
                        if (p.pid || p.isTrade) gridData2[p.round + '_' + p.rosterId] = p;
                    });
                    const maxRound = Math.max(...draftState.picks.map(p => p.round));
                    const mRid2    = draftState.myRid;

                    return (
                        <div style={{ ...card, padding: '10px', overflowX: 'auto' }}>
                            <div style={goldLabel}>ROUND TABLE</div>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <table style={{ borderCollapse: 'collapse', minWidth: t1Order.length * 80 + 50 + 'px', tableLayout: 'fixed', width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '30px', padding: '5px 4px', fontSize: '0.6rem', color: 'var(--gold)', fontWeight: 700, textAlign: 'left', borderBottom: '2px solid rgba(212,175,55,0.25)', position: 'sticky', left: 0, background: 'var(--black)', zIndex: 2 }}>RD</th>
                                            {t1Order.map(rid => (
                                                <th key={rid} style={{ width: '80px', padding: '5px 3px', fontSize: '0.58rem', color: rid === mRid2 ? 'var(--black)' : 'var(--gold)', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.02em', borderBottom: '2px solid rgba(212,175,55,0.25)', background: rid === mRid2 ? 'rgba(212,175,55,0.85)' : 'var(--black)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                                    {rid === mRid2 ? 'YOU' : getTeamName(rid, mRid2).slice(0, 8)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: maxRound }, (_, ri) => {
                                            const rd = ri + 1;
                                            return (
                                                <tr key={rd}>
                                                    <td style={{ padding: '3px 4px', fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', left: 0, background: 'var(--black)', zIndex: 1 }}>{rd}</td>
                                                    {t1Order.map(rid => {
                                                        const pick = gridData2[rd + '_' + rid];
                                                        const isMe = rid === mRid2;
                                                        const pc   = posColors[pick?.pos] || 'var(--silver)';
                                                        return (
                                                            <td key={rid} style={{ padding: '3px 3px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.04)', background: isMe ? 'rgba(212,175,55,0.07)' : 'transparent' }}>
                                                                {pick && !pick.isTrade ? (
                                                                    <>
                                                                        <div style={{ fontSize: '0.6rem', color: isMe ? 'var(--white)' : 'rgba(255,255,255,0.7)', fontWeight: isMe ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            {(pick.playerName || '').split(' ').pop().slice(0, 9)}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.5rem', fontWeight: 700, color: pc }}>{pick.pos}</div>
                                                                    </>
                                                                ) : pick?.isTrade ? (
                                                                    <div style={{ fontSize: '0.55rem', color: '#2ECC71', opacity: 0.7 }}>traded</div>
                                                                ) : (
                                                                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.1)' }}>—</div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}

                {/* ── Full Log ── */}
                {resultView === 'log' && (
                    <div style={card}>
                        <div style={goldLabel}>COMPLETE DRAFT ({draftState.picks.length} picks)</div>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            {[...new Set(draftState.picks.map(p => p.round))].map(rd => (
                                <div key={rd}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 4px', borderBottom: '1px solid rgba(212,175,55,0.1)' }}>
                                        ROUND {rd}
                                    </div>
                                    {draftState.picks.filter(p => p.round === rd).map((p, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.025)', fontSize: '0.7rem' }}>
                                            <span style={{ color: 'var(--silver)', minWidth: '26px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem' }}>{p.pick}.</span>
                                            {p.pid && <img src={`https://sleepercdn.com/content/nfl/players/thumb/${p.pid}.jpg`} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />}
                                            <span style={{ color: p.isUser ? 'var(--gold)' : 'var(--silver)', minWidth: '80px', fontWeight: p.isUser ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.teamName}</span>
                                            <span style={{ color: p.isTrade ? 'rgba(46,204,113,0.7)' : 'var(--white)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.playerName}</span>
                                            {p.pos && <span style={{ color: posColors[p.pos] || 'var(--silver)', fontWeight: 700, fontSize: '0.6rem', minWidth: '24px' }}>{p.pos}</span>}
                                            {p.val > 0 && <span style={{ color: 'var(--silver)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', minWidth: '44px', textAlign: 'right' }}>{p.val.toLocaleString()}</span>}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return <div style={{ color: 'var(--silver)', textAlign: 'center', padding: '40px', fontSize: '0.85rem' }}>Loading…</div>;
}
