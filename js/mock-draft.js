// ══════════════════════════════════════════════════════════════════
// js/mock-draft.js — War Room Mock Draft Engine
// Interactive draft sim + Monte Carlo multi-sim + save/replay
// React component rendered inside DraftTab
// ══════════════════════════════════════════════════════════════════

function MockDraftPanel({ playersData, myRoster, currentLeague, draftRounds }) {
    const [mode, setMode] = useState('setup'); // 'setup' | 'live' | 'multisim' | 'results' | 'replay'
    const [draftState, setDraftState] = useState(null);
    const [simResults, setSimResults] = useState(null);
    const [savedDrafts, setSavedDrafts] = useState(() => {
        try { return JSON.parse(localStorage.getItem('wr_mock_drafts_' + (currentLeague?.id || '')) || '[]'); } catch { return []; }
    });

    const LI = window.App?.LI || {};
    const S = window.S || {};
    const rosters = S.rosters || [];
    const teams = rosters.length || 12;
    const myRid = S.myRosterId;
    const assessFn = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal : null;
    const ownerProfiles = LI.ownerProfiles || {};
    const hitRates = LI.hitRateByRound || {};
    const pickValues = LI.dhqPickValues || {};
    const scores = LI.playerScores || {};
    const playerMeta = LI.playerMeta || {};

    // ── Build Prospect Pool ──
    const prospectPool = useMemo(() => {
        return Object.entries(playerMeta)
            .filter(([pid, m]) => m.source === 'FC_ROOKIE' && (scores[pid] || 0) > 0)
            .map(([pid, m]) => {
                const p = playersData?.[pid] || S.players?.[pid] || {};
                return {
                    pid, name: p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || pid,
                    pos: m.pos || p.position || '?', team: p.team || '', college: p.college || '',
                    val: scores[pid] || 0, age: p.age || 21,
                };
            })
            .sort((a, b) => b.val - a.val);
    }, [playerMeta, scores, playersData]);

    // ── Build Draft Order (snake, respecting traded picks) ──
    const buildPickOrder = () => {
        const order = [...rosters].sort((a, b) => (a.settings?.wins || 0) - (b.settings?.wins || 0));
        const tradedPicks = S.tradedPicks || [];
        const curSeason = String(currentLeague?.season || new Date().getFullYear());
        const picks = [];
        for (let rd = 1; rd <= draftRounds; rd++) {
            const rdOrder = rd % 2 === 1 ? [...order] : [...order].reverse();
            rdOrder.forEach((r, i) => {
                // Check if this pick was traded — owner_id is the current owner
                const traded = tradedPicks.find(tp =>
                    String(tp.season) === curSeason && tp.round === rd &&
                    tp.roster_id === r.roster_id && tp.owner_id !== r.roster_id
                );
                const actualOwner = traded ? traded.owner_id : r.roster_id;
                picks.push({ round: rd, pick: i + 1, overall: picks.length + 1, rosterId: actualOwner, originalRosterId: r.roster_id });
            });
        }
        return picks;
    };

    // ── AI Pick Logic ──
    const aiPick = (rosterId, available) => {
        const assess = assessFn ? assessFn(rosterId) : null;
        const profile = ownerProfiles[rosterId];
        const needs = (assess?.needs || []).slice(0, 4).map(n => typeof n === 'string' ? n : n.pos);
        const targetPos = profile?.targetPos || '';
        const tier = (assess?.tier || '').toUpperCase();

        // Weight: 50% need, 20% historical preference, 30% BPA
        const scored = available.map(p => {
            let score = p.val; // BPA baseline (30%)
            const needIdx = needs.indexOf(p.pos);
            if (needIdx === 0) score *= 2.0;       // Primary need: 2x
            else if (needIdx === 1) score *= 1.6;   // Secondary: 1.6x
            else if (needIdx >= 2) score *= 1.2;    // Tertiary: 1.2x
            if (targetPos && p.pos === targetPos) score *= 1.3; // Historical preference
            if (tier === 'REBUILDING' && p.age <= 22) score *= 1.15; // Rebuilders prefer young
            if (tier === 'CONTENDER' && p.val >= 3000) score *= 1.1; // Contenders prefer proven
            return { ...p, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored[0] || available[0];
    };

    // ── Get Pick Analytics ──
    const getPickAnalytics = (pickOverall, round, available) => {
        const hitRate = hitRates[round];
        const slotEV = typeof pickValues === 'function' ? pickValues(round, pickOverall % teams || teams) : 0;
        const assess = assessFn ? assessFn(myRid) : null;
        const needs = (assess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);

        // Positional scarcity
        const posCount = {};
        available.slice(0, 20).forEach(p => { posCount[p.pos] = (posCount[p.pos] || 0) + 1; });
        const scarce = needs.filter(n => (posCount[n] || 0) <= 2);

        // Fit scores: how much each prospect improves your roster
        const fitScored = available.slice(0, 15).map(p => {
            const needBonus = needs.indexOf(p.pos) === 0 ? 500 : needs.indexOf(p.pos) >= 0 ? 300 : 0;
            return { ...p, fit: p.val + needBonus };
        }).sort((a, b) => b.fit - a.fit);

        return { hitRate, slotEV, needs, scarce, fitScored, posCount };
    };

    // ── Trade Scenario Generator ──
    const getTradeScenarios = (pickIdx, pickOrder, available) => {
        const myPick = pickOrder[pickIdx];
        if (!myPick || myPick.rosterId !== myRid) return [];
        const scenarios = [];
        const myPickVal = typeof pickValues === 'function' ? pickValues(myPick.round, myPick.pick) : myPick.overall <= 12 ? 3000 : myPick.overall <= 24 ? 1800 : 1000;

        // Trade down: find teams behind us who want what's at our slot
        for (let j = pickIdx + 2; j < Math.min(pickIdx + 8, pickOrder.length); j++) {
            const other = pickOrder[j];
            if (other.rosterId === myRid) continue;
            const otherProfile = ownerProfiles[other.rosterId];
            const otherNeeds = (assessFn ? assessFn(other.rosterId)?.needs || [] : []).slice(0, 2).map(n => typeof n === 'string' ? n : n.pos);
            const topAvail = available[0];
            if (topAvail && otherNeeds.includes(topAvail.pos)) {
                const theirVal = typeof pickValues === 'function' ? pickValues(other.round, other.pick) : other.overall <= 12 ? 3000 : 1800;
                const netGain = Math.round(theirVal * 1.2 - myPickVal + 800); // They overpay to move up
                if (netGain > 200) {
                    const ownerName = (S.leagueUsers || []).find(u => u.user_id === other.rosterId)?.display_name || 'Team';
                    scenarios.push({
                        type: 'down', targetRid: other.rosterId, targetName: ownerName,
                        give: `Pick #${myPick.overall} (R${myPick.round}.${myPick.pick})`,
                        get: `Pick #${other.overall} (R${other.round}.${other.pick}) + 2027 3rd`,
                        netDHQ: netGain, reason: `${ownerName} needs ${topAvail.pos} — ${topAvail.name} is available`
                    });
                }
            }
        }
        return scenarios.slice(0, 2);
    };

    // ══════════════════════════════════════════════════════════════
    // START DRAFT
    // ══════════════════════════════════════════════════════════════
    const startDraft = () => {
        const pickOrder = buildPickOrder();
        setDraftState({
            pool: [...prospectPool],
            pickOrder,
            picks: [],
            currentIdx: 0,
            trades: [],
            paused: false,
        });
        setMode('live');
    };

    // ── Make a pick (user or AI) ──
    const makePick = (pid) => {
        if (!draftState) return;
        const { pool, pickOrder, picks, currentIdx } = draftState;
        const current = pickOrder[currentIdx];
        const pIdx = pool.findIndex(p => p.pid === pid);
        if (pIdx < 0) return;
        const player = pool[pIdx];
        const newPool = [...pool]; newPool.splice(pIdx, 1);
        const ownerName = (S.leagueUsers || []).find(u => u.user_id === current.rosterId)?.display_name || 'Team ' + current.pick;

        const newPicks = [...picks, {
            ...current, pid: player.pid, playerName: player.name, pos: player.pos,
            val: player.val, teamName: ownerName, isUser: current.rosterId === myRid,
        }];

        const newState = { ...draftState, pool: newPool, picks: newPicks, currentIdx: currentIdx + 1 };
        setDraftState(newState);

        // If draft complete
        if (currentIdx + 1 >= pickOrder.length) {
            setMode('results');
            return;
        }

        // Auto-advance AI picks
        const next = pickOrder[currentIdx + 1];
        if (next && next.rosterId !== myRid) {
            setTimeout(() => advanceAI(newState), 120);
        }
    };

    const advanceAI = (state) => {
        let s = { ...state };
        while (s.currentIdx < s.pickOrder.length) {
            const current = s.pickOrder[s.currentIdx];
            if (current.rosterId === myRid) break; // Stop at user's pick

            const pick = aiPick(current.rosterId, s.pool);
            if (!pick) break;
            const pIdx = s.pool.findIndex(p => p.pid === pick.pid);
            const newPool = [...s.pool]; if (pIdx >= 0) newPool.splice(pIdx, 1);
            const assess = assessFn ? assessFn(current.rosterId) : null;
            const profile = ownerProfiles[current.rosterId];
            const ownerName = (S.leagueUsers || []).find(u => u.user_id === current.rosterId)?.display_name || 'Team';
            const tier = (assess?.tier || '').toUpperCase();
            const needs = (assess?.needs || []).slice(0, 2).map(n => typeof n === 'string' ? n : n.pos);

            s = {
                ...s, pool: newPool, currentIdx: s.currentIdx + 1,
                picks: [...s.picks, {
                    ...current, pid: pick.pid, playerName: pick.name, pos: pick.pos,
                    val: pick.val, teamName: ownerName, isUser: false,
                    reason: `${ownerName} (${tier}${needs.length ? ', needs ' + needs.join('/') : ''}${profile?.dna ? ', ' + profile.dna : ''})`,
                }],
            };
        }
        setDraftState(s);
        if (s.currentIdx >= s.pickOrder.length) setMode('results');
    };

    // ══════════════════════════════════════════════════════════════
    // MULTI-SIM (Monte Carlo)
    // ══════════════════════════════════════════════════════════════
    const runMultiSim = () => {
        const NUM_SIMS = 10;
        const pickOrder = buildPickOrder();
        const landingData = {}; // pid -> [pickOverall, ...]
        const myPickData = {}; // round -> { posFreq: {QB:n,...}, bestAvail: [...] }

        for (let sim = 0; sim < NUM_SIMS; sim++) {
            const pool = [...prospectPool];
            pickOrder.forEach((slot, idx) => {
                if (!pool.length) return;
                let pick;
                if (slot.rosterId === myRid) {
                    // User picks BPA at top need
                    const assess = assessFn ? assessFn(myRid) : null;
                    const needs = (assess?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n.pos);
                    pick = pool.find(p => needs.includes(p.pos)) || pool[0];
                } else {
                    // AI with randomness: 70% weighted, 30% random from top 5
                    if (Math.random() < 0.3 && pool.length >= 5) {
                        pick = pool[Math.floor(Math.random() * 5)];
                    } else {
                        pick = aiPick(slot.rosterId, pool);
                    }
                }
                if (!pick) return;
                pool.splice(pool.indexOf(pick), 1);
                if (!landingData[pick.pid]) landingData[pick.pid] = [];
                landingData[pick.pid].push(slot.overall);

                if (slot.rosterId === myRid) {
                    if (!myPickData[slot.round]) myPickData[slot.round] = { posFreq: {}, avail: [] };
                    myPickData[slot.round].posFreq[pick.pos] = (myPickData[slot.round].posFreq[pick.pos] || 0) + 1;
                }
            });
        }

        // Aggregate
        const prospectRanges = Object.entries(landingData)
            .map(([pid, landings]) => {
                const p = prospectPool.find(pr => pr.pid === pid) || { name: pid, pos: '?', val: 0 };
                landings.sort((a, b) => a - b);
                return {
                    pid, name: p.name, pos: p.pos, val: p.val,
                    min: landings[0], max: landings[landings.length - 1],
                    median: landings[Math.floor(landings.length / 2)],
                    count: landings.length,
                };
            })
            .sort((a, b) => a.median - b.median)
            .slice(0, 30);

        setSimResults({ prospectRanges, myPickData, numSims: NUM_SIMS });
        setMode('multisim');
    };

    // ══════════════════════════════════════════════════════════════
    // SAVE / LOAD
    // ══════════════════════════════════════════════════════════════
    const saveDraft = () => {
        if (!draftState) return;
        const saved = {
            ts: Date.now(), picks: draftState.picks, trades: draftState.trades,
            league: currentLeague?.name || '', teams,
        };
        const all = [saved, ...savedDrafts].slice(0, 5);
        localStorage.setItem('wr_mock_drafts_' + (currentLeague?.id || ''), JSON.stringify(all));
        setSavedDrafts(all);
    };

    // ══════════════════════════════════════════════════════════════
    // POST-DRAFT GRADES
    // ══════════════════════════════════════════════════════════════
    const gradeMyPicks = (picks) => {
        const myPicks = picks.filter(p => p.isUser);
        if (!myPicks.length) return { grade: '?', picks: [], totalDHQ: 0, avgEV: 0 };
        const totalDHQ = myPicks.reduce((s, p) => s + (p.val || 0), 0);
        const avgEV = Math.round(totalDHQ / myPicks.length);
        const gradedPicks = myPicks.map(p => {
            const bpa = prospectPool.find(pr => pr.val > p.val && pr.pid !== p.pid);
            const diff = bpa ? p.val - bpa.val : 0;
            return { ...p, verdict: diff >= 0 ? 'Value' : Math.abs(diff) < 500 ? 'Fair' : 'Reach' };
        });
        const valueCount = gradedPicks.filter(p => p.verdict === 'Value').length;
        const grade = valueCount >= myPicks.length * 0.8 ? 'A+' : valueCount >= myPicks.length * 0.6 ? 'A' : valueCount >= myPicks.length * 0.4 ? 'B+' : valueCount >= myPicks.length * 0.2 ? 'B' : 'C';
        return { grade, picks: gradedPicks, totalDHQ, avgEV };
    };

    // ══════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════
    const cardStyle = { background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' };
    const goldLabel = { fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' };

    // Full-screen wrapper for live/multisim/results modes
    const fullScreen = mode === 'live' || mode === 'results' || mode === 'multisim';
    const wrapStyle = fullScreen ? { position: 'fixed', inset: 0, zIndex: 900, background: 'var(--black)', overflowY: 'auto', padding: '20px' } : {};
    const exitBtn = fullScreen ? React.createElement('button', {
        onClick: () => setMode('setup'),
        style: { position: 'fixed', top: '16px', right: '16px', zIndex: 910, background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', padding: '6px 14px', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600 }
    }, '✕ Exit Draft') : null;

    // ── SETUP ──
    if (mode === 'setup') {
        return React.createElement('div', null,
            React.createElement('div', { style: { ...cardStyle, textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', marginBottom: '8px' } }, 'MOCK DRAFT ENGINE'),
                React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '16px', lineHeight: 1.5 } },
                    `${teams} teams · ${draftRounds} rounds · ${prospectPool.length} prospects · Snake draft`
                ),
                React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
                    React.createElement('button', {
                        onClick: startDraft,
                        style: { padding: '12px 24px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }
                    }, 'START INTERACTIVE DRAFT'),
                    React.createElement('button', {
                        onClick: runMultiSim,
                        style: { padding: '12px 24px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer' }
                    }, 'RUN 10 SIMULATIONS'),
                ),
            ),
            // Saved drafts
            savedDrafts.length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: goldLabel }, 'SAVED DRAFTS'),
                savedDrafts.map((d, i) => React.createElement('div', {
                    key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' },
                    onClick: () => { setDraftState({ ...d, pool: [], pickOrder: [], currentIdx: d.picks.length }); setMode('results'); }
                },
                    React.createElement('span', { style: { fontSize: '0.78rem', color: 'var(--silver)' } }, new Date(d.ts).toLocaleDateString()),
                    React.createElement('span', { style: { fontSize: '0.78rem', color: 'var(--white)', flex: 1 } }, `${d.picks?.length || 0} picks · ${d.league}`),
                    React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--gold)' } }, 'View →'),
                ))
            ),
        );
    }

    // ── LIVE DRAFT ──
    if (mode === 'live' && draftState) {
        const { pool, pickOrder, picks, currentIdx } = draftState;
        const current = currentIdx < pickOrder.length ? pickOrder[currentIdx] : null;
        const isMyPick = current?.rosterId === myRid;
        const analytics = isMyPick ? getPickAnalytics(current.overall, current.round, pool) : null;
        const tradeOptions = isMyPick ? getTradeScenarios(currentIdx, pickOrder, pool) : [];

        return React.createElement('div', { style: { ...wrapStyle } },
            exitBtn,
            // Progress bar
            React.createElement('div', { style: { height: '3px', background: 'rgba(212,175,55,0.1)', borderRadius: '2px', marginBottom: '16px', overflow: 'hidden' } },
                React.createElement('div', { style: { height: '100%', width: `${Math.round(currentIdx / pickOrder.length * 100)}%`, background: 'var(--gold)', borderRadius: '2px', transition: 'width 0.3s ease' } })
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: isMyPick ? '1fr 340px' : '1fr', gap: '16px' } },
            // Left: Draft board
            React.createElement('div', null,
                // Current pick header
                current && React.createElement('div', { style: { ...cardStyle, borderColor: isMyPick ? 'var(--gold)' : 'rgba(255,255,255,0.1)', background: isMyPick ? 'rgba(212,175,55,0.06)' : 'var(--black)' } },
                    React.createElement('div', { style: { fontSize: '0.68rem', color: isMyPick ? 'var(--gold)' : 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' } },
                        isMyPick ? '⏱ ON THE CLOCK' : `Pick #${current.overall}`
                    ),
                    React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--white)' } },
                        `R${current.round}.${current.pick} — ${isMyPick ? 'YOUR PICK' : ((S.leagueUsers || []).find(u => u.user_id === current.rosterId)?.display_name || 'Team')}`
                    ),
                ),
                // Available players (user's pick)
                isMyPick && React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: goldLabel }, 'BEST AVAILABLE'),
                    pool.slice(0, 12).map(p => React.createElement('div', {
                        key: p.pid,
                        onClick: () => makePick(p.pid),
                        style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', transition: 'all 0.1s' },
                        onMouseEnter: e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)'; e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; },
                        onMouseLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; },
                    },
                        React.createElement('span', { style: { fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)', flex: 1 } }, p.name),
                        React.createElement('span', { style: { fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold)', padding: '1px 6px', borderRadius: '6px', background: 'rgba(212,175,55,0.1)' } }, p.pos),
                        React.createElement('span', { style: { fontSize: '0.78rem', color: 'var(--silver)', fontFamily: 'JetBrains Mono, monospace' } }, p.val.toLocaleString()),
                    ))
                ),
                // Trade options
                isMyPick && tradeOptions.length > 0 && React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: goldLabel }, 'TRADE SCENARIOS'),
                    tradeOptions.map((t, i) => React.createElement('div', {
                        key: i, style: { padding: '8px 10px', background: 'rgba(46,204,113,0.04)', border: '1px solid rgba(46,204,113,0.15)', borderRadius: '8px', marginBottom: '4px' }
                    },
                        React.createElement('div', { style: { fontSize: '0.78rem', color: '#2ECC71', fontWeight: 600, marginBottom: '2px' } }, t.type === 'down' ? '↓ Trade Down' : '↑ Trade Up'),
                        React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, `Give: ${t.give} → Get: ${t.get}`),
                        React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)' } }, t.reason),
                        React.createElement('div', { style: { fontSize: '0.82rem', color: '#2ECC71', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' } }, `+${t.netDHQ} DHQ`),
                    ))
                ),
                // Recent picks log
                picks.length > 0 && React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: goldLabel }, `DRAFT LOG (${picks.length} picks)`),
                    React.createElement('div', { style: { maxHeight: '300px', overflowY: 'auto' } },
                        [...picks].reverse().slice(0, 20).map((p, i) => React.createElement('div', {
                            key: i, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.72rem' }
                        },
                            React.createElement('span', { style: { color: 'var(--silver)', minWidth: '45px' } }, `R${p.round}.${p.pick}`),
                            React.createElement('span', { style: { color: p.isUser ? 'var(--gold)' : 'var(--silver)', fontWeight: p.isUser ? 700 : 400, flex: 1 } }, p.teamName),
                            React.createElement('span', { style: { color: 'var(--white)', fontWeight: 600 } }, p.playerName),
                            React.createElement('span', { style: { color: 'var(--gold)', fontFamily: 'JetBrains Mono, monospace' } }, p.pos),
                        ))
                    )
                ),
            ),
            // Right: Analytics panel (your pick only)
            isMyPick && analytics && React.createElement('div', null,
                // Hit rate
                React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: goldLabel }, 'PICK INTELLIGENCE'),
                    React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--white)', marginBottom: '6px' } },
                        `Pick #${current.overall} · Round ${current.round}`
                    ),
                    analytics.hitRate && React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '4px' } },
                        `Historical hit rate: ${analytics.hitRate.rate || '?'}%`
                    ),
                    analytics.hitRate?.bestPos && React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '8px' } },
                        `Best positions: ${analytics.hitRate.bestPos.slice(0, 3).map(p => `${p.pos} (${p.rate}%)`).join(', ')}`
                    ),
                ),
                // Scarcity alerts
                analytics.scarce.length > 0 && React.createElement('div', { style: { ...cardStyle, borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.04)' } },
                    React.createElement('div', { style: { ...goldLabel, color: '#f87171' } }, 'SCARCITY ALERT'),
                    analytics.scarce.map(pos => React.createElement('div', { key: pos, style: { fontSize: '0.78rem', color: '#f87171', marginBottom: '2px' } },
                        `Only ${analytics.posCount[pos] || 0} ${pos}s left in top 20 — last chance at ${pos} value`
                    )),
                ),
                // Fit scores
                React.createElement('div', { style: cardStyle },
                    React.createElement('div', { style: goldLabel }, 'TEAM FIT'),
                    analytics.fitScored.slice(0, 5).map(p => React.createElement('div', {
                        key: p.pid, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '0.72rem' }
                    },
                        React.createElement('span', { style: { color: 'var(--white)', flex: 1 } }, p.name),
                        React.createElement('span', { style: { color: 'var(--gold)' } }, p.pos),
                        React.createElement('span', { style: { color: analytics.needs.includes(p.pos) ? '#2ECC71' : 'var(--silver)', fontWeight: analytics.needs.includes(p.pos) ? 700 : 400 } },
                            analytics.needs.includes(p.pos) ? 'FILLS NEED' : 'BPA'
                        ),
                    ))
                ),
            ),
            ), // close grid
        ); // close wrapStyle
    }

    // ── MULTI-SIM RESULTS ──
    if (mode === 'multisim' && simResults) {
        const { prospectRanges, myPickData, numSims } = simResults;
        return React.createElement('div', { style: wrapStyle },
            exitBtn,
            React.createElement('div', { style: { ...cardStyle, textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', marginBottom: '4px' } }, `${numSims} SIMULATIONS COMPLETE`),
                React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '12px' } }, `${prospectRanges.length} prospects analyzed across ${teams} teams`),
                React.createElement('button', {
                    onClick: () => setMode('setup'), style: { padding: '6px 16px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem' }
                }, '← Back'),
            ),
            // Prospect landing ranges
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: goldLabel }, 'PROSPECT LANDING RANGES'),
                prospectRanges.map(p => React.createElement('div', {
                    key: p.pid, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }
                },
                    React.createElement('span', { style: { fontSize: '0.78rem', color: 'var(--white)', fontWeight: 600, minWidth: '140px' } }, p.name),
                    React.createElement('span', { style: { fontSize: '0.68rem', color: 'var(--gold)', minWidth: '30px' } }, p.pos),
                    // Range bar
                    React.createElement('div', { style: { flex: 1, height: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', position: 'relative', overflow: 'hidden' } },
                        React.createElement('div', { style: {
                            position: 'absolute', left: `${(p.min - 1) / (teams * draftRounds) * 100}%`,
                            width: `${Math.max(2, (p.max - p.min) / (teams * draftRounds) * 100)}%`,
                            height: '100%', background: 'rgba(212,175,55,0.3)', borderRadius: '6px',
                        }}),
                        React.createElement('div', { style: {
                            position: 'absolute', left: `${(p.median - 1) / (teams * draftRounds) * 100}%`,
                            width: '3px', height: '100%', background: 'var(--gold)', borderRadius: '2px',
                        }}),
                    ),
                    React.createElement('span', { style: { fontSize: '0.68rem', color: 'var(--silver)', minWidth: '80px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' } },
                        `#${p.min}–#${p.max} (med #${p.median})`
                    ),
                ))
            ),
            // Your pick projections
            Object.keys(myPickData).length > 0 && React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: goldLabel }, 'YOUR PICK PROJECTIONS'),
                Object.entries(myPickData).map(([round, data]) => React.createElement('div', {
                    key: round, style: { marginBottom: '8px' }
                },
                    React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--gold)', fontWeight: 600, marginBottom: '4px' } }, `Round ${round}`),
                    React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                        Object.entries(data.posFreq).sort((a, b) => b[1] - a[1]).map(([pos, count]) =>
                            React.createElement('span', { key: pos, style: { fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(212,175,55,0.1)', color: 'var(--gold)' } },
                                `${pos}: ${Math.round(count / numSims * 100)}%`
                            )
                        )
                    ),
                ))
            ),
        );
    }

    // ── RESULTS / POST-DRAFT ──
    if (mode === 'results' && draftState) {
        const grades = gradeMyPicks(draftState.picks);
        return React.createElement('div', { style: wrapStyle },
            exitBtn,
            // Grade header
            React.createElement('div', { style: { ...cardStyle, textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '3rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'Rajdhani, sans-serif', lineHeight: 1 } }, grades.grade),
                React.createElement('div', { style: { fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '8px' } },
                    `${grades.picks.length} picks · ${grades.totalDHQ.toLocaleString()} total DHQ · ${grades.avgEV.toLocaleString()} avg`
                ),
                React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
                    React.createElement('button', { onClick: saveDraft, style: { padding: '8px 16px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 700 } }, 'Save Draft'),
                    React.createElement('button', { onClick: () => setMode('setup'), style: { padding: '8px 16px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem' } }, 'New Draft'),
                ),
            ),
            // Your picks graded
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: goldLabel }, 'YOUR PICKS'),
                grades.picks.map((p, i) => React.createElement('div', {
                    key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
                },
                    React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--silver)', minWidth: '45px' } }, `R${p.round}.${p.pick}`),
                    React.createElement('span', { style: { fontSize: '0.82rem', color: 'var(--white)', fontWeight: 600, flex: 1 } }, p.playerName),
                    React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--gold)' } }, p.pos),
                    React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--silver)', fontFamily: 'JetBrains Mono, monospace' } }, p.val.toLocaleString()),
                    React.createElement('span', { style: {
                        fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px',
                        background: p.verdict === 'Value' ? 'rgba(46,204,113,0.15)' : p.verdict === 'Fair' ? 'rgba(212,175,55,0.15)' : 'rgba(248,113,113,0.15)',
                        color: p.verdict === 'Value' ? '#2ECC71' : p.verdict === 'Fair' ? 'var(--gold)' : '#f87171',
                    } }, p.verdict),
                ))
            ),
            // Full draft log
            React.createElement('div', { style: cardStyle },
                React.createElement('div', { style: goldLabel }, `FULL DRAFT (${draftState.picks.length} picks)`),
                React.createElement('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
                    draftState.picks.map((p, i) => React.createElement('div', {
                        key: i, style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.68rem' }
                    },
                        React.createElement('span', { style: { color: 'var(--silver)', minWidth: '35px' } }, `${p.overall}.`),
                        React.createElement('span', { style: { color: p.isUser ? 'var(--gold)' : 'var(--silver)', minWidth: '120px', fontWeight: p.isUser ? 700 : 400 } }, p.teamName),
                        React.createElement('span', { style: { color: 'var(--white)', flex: 1 } }, p.playerName),
                        React.createElement('span', { style: { color: 'var(--gold)' } }, p.pos),
                    ))
                )
            ),
        );
    }

    return React.createElement('div', { style: { color: 'var(--silver)', textAlign: 'center', padding: '40px' } }, 'Loading...');
}
