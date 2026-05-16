// ══════════════════════════════════════════════════════════════════
// js/draft/state.js — draftState reducer + localStorage hydration
//
// Owns the single source of truth for the Draft Command Center.
// The main <DraftCommandCenter/> component uses useReducer over this
// reducer; panels read from it via React context.
//
// Phase 1 implements the core flow:
//   - SETUP    — user picks mode/rounds/draftPos, pool is built
//   - DRAFTING — picks advance, pool shrinks, teamRosters update
//   - COMPLETE — end state, grade computed
//
// Phase 2+ extends with personas updates, trade offers, analytics.
//
// Depends on: scouting.js (window.getProspects), trade-calc.js globals
// Exposes:    window.DraftCC.state.{ reducer, initialDraftState, buildPool, buildPickOrder, saveToLocal, loadFromLocal }
// ══════════════════════════════════════════════════════════════════

(function() {
    const DRAFT_STATE_VERSION = 1;
    // Phase 5+: separate keys per tab (Mock Draft Center vs Follow Live Draft)
    // so each tab maintains its own auto-resume state without stepping on the other.
    const LS_KEY = (leagueId, forcedMode) => {
        const mode = forcedMode === 'live-sync' ? 'live' : 'mock';
        return 'wr_draft_cc_current_' + mode + '_' + (leagueId || 'default');
    };

    function initialLiveSyncState(patch = {}) {
        return {
            status: 'idle', // 'idle' | 'waiting' | 'mirroring' | 'stale' | 'error' | 'complete'
            draftStatus: '',
            lastPollAt: null,
            startedAt: null,
            lastPickNo: 0,
            expectedPickNo: 1,
            remotePickCount: 0,
            duplicateCount: 0,
            missedPickCount: 0,
            stale: false,
            error: null,
            ...(patch || {}),
        };
    }

    function mergeLiveSync(current, patch = {}) {
        const next = { ...initialLiveSyncState(), ...(current || {}), ...(patch || {}) };
        if (patch.error === null) next.error = null;
        if (patch.status === 'mirroring' || patch.status === 'waiting' || patch.status === 'complete') {
            next.stale = false;
        }
        return next;
    }

    function livePickNo(pick) {
        return Number(pick?.sleeperPickNo || pick?.sleeperPick?.pick_no || pick?.pick_no || 0);
    }

    // ── Initial state factory ────────────────────────────────────────
    function initialDraftState(opts = {}) {
        return {
            version: DRAFT_STATE_VERSION,
            phase:   'setup',       // 'setup' | 'drafting' | 'complete'
            id:      'dcc_' + Date.now(),
            leagueId: opts.leagueId || '',
            season:   opts.season || new Date().getFullYear(),
            mode:     opts.mode || 'solo',      // 'solo' | 'manual' | 'ghost' | 'scenario' | 'live-sync'
            variant:  opts.variant || 'startup', // 'rookie' | 'startup' | 'redraft' | 'best_ball'
            speed:    opts.speed || 'medium',    // 'slow' | 'medium' | 'fast'
            draftTuning: {
                ownerDna: 70,
                classValue: 65,
                needFit: 60,
                tradeActivity: 50,
                variance: 45,
                ...(opts.draftTuning || {}),
            },

            // Setup config
            rounds: opts.rounds || 5,
            leagueSize: opts.leagueSize || 12,
            draftType: opts.draftType || 'snake',
            userRosterId: opts.userRosterId || null,
            userSlot: opts.userSlot || 1,      // 1-indexed
            sleeperDraftId: opts.sleeperDraftId || null,
            liveDraftMeta: opts.liveDraftMeta || null,

            // Pool + order
            pool: [],
            originalPool: [],
            pickOrder: [],

            // Picks & drafted
            picks: [],
            pickedByIdx: {},
            draftedPids: {}, // Object for easy JSON serialization (set-like)
            currentIdx: 0,

            // Team intelligence
            personas: {},
            draftContext: null,
            teamRosters: {}, // teamIdx → [pos, pos, ...]
            pinnedRosterId: null,

            // Trade state (Phase 3)
            activeOffer: null,
            proposerDrawer: null,
            completedTrades: [],
            // Ledger of player + FAAB movement from accepted trades. Keyed by
            // rosterId. Consumers (opponent intel, roster views, simulator)
            // can apply this on top of base rosters to derive effective
            // post-trade state inside the mock draft context.
            // { [rosterId]: { incomingPlayers: [pid], outgoingPlayers: [pid], faabDelta: number } }
            tradedAssets: {},

            // Analytics (Phase 4)
            analytics: {
                liveHealth: { at: 0, delta: 0 },
                liveGrade: { letter: '?', totalDHQ: 0 },
                tierTransition: null,
                positionRuns: {},
                valueCurve: [],
            },

            // Alex (Phase 4)
            alex: {
                style: 'default',
                stream: [],
                alexSpend: { sonnet: 0, flash: 0, budget: 12 },
                thinking: false,
                lastInsightAt: 0,
            },

            briefing: null,
            replay: null,
            scenarioId: null,
            scenarioNarrative: null,
            liveSync: initialLiveSyncState(),
            stagedLiveOffers: [],
            manualCorrections: [],

            // Phase 5+: when set, the next MAKE_PICK dispatch will be applied
            // as if the user made it FOR the CPU team on the clock. Auto-clears.
            overrideMode: false,
        };
    }

    function normProspectName(name) {
        return (name || '')
            .toLowerCase()
            .replace(/[''`.]/g, '')
            .replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function matchSleeperRookie(prospect, playersData) {
        const target = normProspectName(prospect?.name);
        if (!target) return null;
        const src = playersData || window.S?.players || {};
        for (const [pid, player] of Object.entries(src)) {
            if (!player || player.years_exp !== 0) continue;
            const fullName = player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim();
            if (normProspectName(fullName) === target) return { pid, player };
        }
        return null;
    }

    // ── Pool builder — use CSV prospects (rookie) or Sleeper DHQ (startup) ──
    function buildPool(opts = {}) {
        const { variant = 'startup', playersData, maxSize = 200 } = opts;
        const normPos = window.App?.normPos || (p => p);

        // Rookie variant — pull from CSV prospects
        if (variant === 'rookie') {
            if (typeof window.getProspects === 'function') {
                const prospects = window.getProspects();
                if (prospects && prospects.length) {
                    return prospects.slice(0, maxSize).map(p => {
                        const sleeper = matchSleeperRookie(p, playersData);
                        const sid = sleeper?.pid || p.sleeperId || p.player_id || p.playerId || p.pid;
                        const engineDHQ = sid ? (window.App?.LI?.playerScores?.[sid] || 0) : 0;
                        const dhq = engineDHQ || p.dynastyValue || p.draftScore * 1000 || 0;
                        return {
                            pid: sid,
                            csvPid: p.pid,
                            name: sleeper?.player?.full_name || p.name,
                            pos: p.pos || p.mappedPos || normPos(sleeper?.player?.position) || 'WR',
                            team: sleeper?.player?.team || '',
                            college: p.college || p.school || sleeper?.player?.college || '',
                            age: p.age || p.csv?.age || sleeper?.player?.age || null,
                            dhq,
                            csv: p,
                            photoUrl: sleeper
                                ? 'https://sleepercdn.com/content/nfl/players/thumb/' + sid + '.jpg'
                                : (p.photoUrl || (p.espnId ? 'https://a.espncdn.com/i/headshots/college-football/players/full/' + p.espnId + '.png' : '')),
                            consensusRank: p.consensusRank || p.rank,
                            tier: p.tier,
                            size: p.size,
                            weight: p.weight,
                            speed: p.speed,
                            summary: p.summary,
                            source: engineDHQ ? 'DHQ_ENGINE' : 'CSV_PROSPECT',
                            isCSV: true,
                        };
                    }).sort((a, b) => (b.dhq || 0) - (a.dhq || 0));
                }
            }
            // Fall through to startup if CSV missing
        }

        // Startup variant — pull from Sleeper DHQ scores
        const getDHQ = pid => {
            if (typeof window.dynastyValue === 'function') {
                const v = window.dynastyValue(pid);
                if (v > 0) return v;
            }
            return window.App?.LI?.playerScores?.[pid] || 0;
        };
        const VALID = (typeof window.getLeaguePositions === 'function')
            ? window.getLeaguePositions({ asSet: true })
            : new Set(['QB','RB','WR','TE']);
        const src = playersData || window.S?.players || {};
        const pool = Object.entries(src)
            .filter(([, p]) => VALID.has(normPos(p.position)) && p.status !== 'Inactive' && (p.first_name || p.full_name))
            .map(([pid, p]) => ({
                pid,
                name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                pos: normPos(p.position),
                team: p.team || 'FA',
                college: p.college || '',
                age: p.age || (p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000) : null),
                birth_date: p.birth_date || null,
                dhq: getDHQ(pid),
                photoUrl: 'https://sleepercdn.com/content/nfl/players/thumb/' + pid + '.jpg',
            }))
            .filter(p => p.dhq > 0)
            .sort((a, b) => b.dhq - a.dhq)
            .slice(0, maxSize);

        // Synthetic consensusRank for reach/steal detection in startup mode —
        // index in the DHQ-sorted pool is the "consensus" rank order.
        pool.forEach((p, i) => { p.consensusRank = i + 1; });
        return pool;
    }

    // ── Pick order builder ───────────────────────────────────────────
    function buildPickOrder(rounds, leagueSize, draftType, slotToRoster = {}, pickOwnership = {}) {
        const order = [];
        for (let r = 1; r <= rounds; r++) {
            const rev = draftType === 'snake' && r % 2 === 0;
            for (let s = 0; s < leagueSize; s++) {
                const teamIdx = rev ? leagueSize - 1 - s : s;
                const slot = teamIdx + 1; // 1-indexed slot
                const origInfo = slotToRoster[slot] || {};
                const ownershipKey = r + '-' + slot;
                const owner = pickOwnership[ownershipKey] || { rosterId: origInfo.rosterId, ownerName: origInfo.ownerName, traded: false };
                order.push({
                    round: r,
                    slot,
                    teamIdx,
                    overall: order.length + 1,
                    originalRosterId: origInfo.rosterId || null,
                    rosterId: owner.rosterId || origInfo.rosterId || null,
                    originalOwnerName: origInfo.ownerName || ('Team ' + slot),
                    ownerName: owner.ownerName || origInfo.ownerName || ('Team ' + slot),
                    traded: !!owner.traded,
                    actualPick: null,
                });
            }
        }
        return order;
    }

    function pickName(pick) {
        const player = pick?.player || {};
        return player.full_name || player.name || pick?.name || pick?.full_name || pick?.pid || '';
    }

    function pickPos(pick) {
        const player = pick?.player || {};
        return String(player.position || player.pos || pick?.pos || pick?.position || '').toUpperCase();
    }

    function pickDhq(pick) {
        const player = pick?.player || {};
        return Number(player.dhq ?? player.val ?? pick?.dhq ?? pick?.val ?? 0) || 0;
    }

    function normalizePickRecord(pick) {
        if (!pick) return null;
        return {
            ...pick,
            pid: pick.pid || pick.player?.pid || pick.player_id || null,
            name: pickName(pick),
            pos: pickPos(pick),
            dhq: pickDhq(pick),
        };
    }

    function buildPickedByIdx(picks) {
        return (picks || []).reduce((acc, raw) => {
            const pick = normalizePickRecord(raw);
            if (!pick || pick.overall == null) return acc;
            acc[pick.overall] = pick;
            return acc;
        }, {});
    }

    function leagueTotalsFromPicks(picks) {
        return (picks || []).reduce((acc, raw) => {
            const pick = normalizePickRecord(raw);
            const rosterId = pick?.rosterId;
            if (rosterId == null) return acc;
            acc[rosterId] = (acc[rosterId] || 0) + pickDhq(pick);
            return acc;
        }, {});
    }

    function slimPlayer(player) {
        if (!player) return null;
        return {
            pid: player.pid,
            csvPid: player.csvPid || null,
            name: player.name || player.full_name || '',
            pos: player.pos || player.position || '',
            team: player.team || player.nflTeam || '',
            college: player.college || player.school || '',
            age: player.age || null,
            birth_date: player.birth_date || null,
            dhq: Number(player.dhq || player.val || 0),
            consensusRank: player.consensusRank || player.rank || null,
            tier: player.tier || player.csv?.tier || null,
            photoUrl: player.photoUrl || '',
            source: player.source || null,
            isCSV: !!player.isCSV,
        };
    }

    function slimPool(pool, maxSize) {
        return (pool || []).slice(0, maxSize || 600).map(slimPlayer).filter(Boolean);
    }

    function rebuildDraftDerived(picks) {
        const draftedPids = {};
        const teamRosters = {};
        (picks || []).forEach(p => {
            if (p?.pid) draftedPids[p.pid] = true;
            const idx = p?.teamIdx;
            if (idx != null) teamRosters[idx] = [...(teamRosters[idx] || []), p.pos];
        });
        return {
            draftedPids,
            teamRosters,
            pickedByIdx: buildPickedByIdx(picks),
        };
    }

    function restorePoolAfterUndo(state, remainingPicks, undonePick) {
        const drafted = new Set((remainingPicks || []).map(p => String(p.pid)).filter(Boolean));
        const original = state.originalPool || [];
        const existing = new Set((state.pool || []).map(p => String(p.pid)).filter(Boolean));
        let nextPool = state.pool || [];
        const pid = String(undonePick?.pid || '');
        if (pid && !drafted.has(pid) && !existing.has(pid)) {
            const originalMatch = original.find(p => String(p.pid) === pid) || undonePick;
            nextPool = [originalMatch, ...nextPool];
        }
        const rank = new Map();
        original.forEach((p, idx) => { if (p?.pid != null) rank.set(String(p.pid), idx); });
        return nextPool.slice().sort((a, b) => {
            const ar = rank.has(String(a.pid)) ? rank.get(String(a.pid)) : 999999;
            const br = rank.has(String(b.pid)) ? rank.get(String(b.pid)) : 999999;
            if (ar !== br) return ar - br;
            return Number(b.dhq || 0) - Number(a.dhq || 0);
        });
    }

    // ── Reducer ──────────────────────────────────────────────────────
    function reducer(state, action) {
        switch (action.type) {
            case 'SETUP_CHANGE':
                return { ...state, ...action.payload };

            case 'START_DRAFT': {
                // Phase 5: scenario/replay support
                // action.prePicks — picks pre-applied before draft begins (scenario mode)
                // action.replay — { replayPicks, totalPicks } for ghost mode
                // action.narrative — optional banner text
                const prePicks = (action.prePicks || []).map(normalizePickRecord).filter(Boolean);
                const derived = rebuildDraftDerived(prePicks);
                const originalPool = action.originalPool && action.originalPool.length
                    ? action.originalPool.slice()
                    : action.pool.slice().concat(prePicks.map(p => ({ pid: p.pid, name: p.name, pos: p.pos, dhq: p.dhq })));

                return {
                    ...state,
                    phase: 'drafting',
                    pool: action.pool,
                    originalPool,
                    pickOrder: action.pickOrder,
                    personas: action.personas || {},
                    draftContext: action.draftContext || null,
                    picks: prePicks.slice(),
                    pickedByIdx: derived.pickedByIdx,
                    draftedPids: derived.draftedPids,
                    currentIdx: prePicks.length,
                    teamRosters: derived.teamRosters,
                    replay: action.replay || null,
                    scenarioNarrative: action.narrative || null,
                    liveSync: state.mode === 'live-sync'
                        ? initialLiveSyncState({
                            status: action.liveDraftStatus === 'drafting' ? 'mirroring' : 'waiting',
                            draftStatus: action.liveDraftStatus || '',
                            startedAt: Date.now(),
                            lastPickNo: prePicks.length,
                            expectedPickNo: prePicks.length + 1,
                            remotePickCount: prePicks.length,
                        })
                        : state.liveSync,
                    stagedLiveOffers: state.mode === 'live-sync' ? [] : state.stagedLiveOffers,
                };
            }

            case 'MAKE_PICK': {
                const { player, isUser, reasoning, confidence } = action;
                const slot = state.pickOrder[state.currentIdx];
                if (!slot || !player) return state;
                const newPool = state.pool.filter(p => p.pid !== player.pid);
                const newDrafted = { ...state.draftedPids, [player.pid]: true };
                const pickSource = action.source || (state.mode === 'live-sync' && state.overrideMode ? 'manual-live' : state.mode === 'manual' ? 'manual-draft' : null);
                const newPick = {
                    id: 'pick_' + slot.overall + '_' + Date.now(),
                    round: slot.round,
                    slot: slot.slot,
                    pickInRound: slot.slot,
                    overall: slot.overall,
                    teamIdx: slot.teamIdx,
                    rosterId: slot.rosterId,
                    isUser: !!isUser,
                    pid: player.pid,
                    name: player.name,
                    pos: player.pos,
                    dhq: player.dhq,
                    consensusRank: player.consensusRank || null,
                    photoUrl: player.photoUrl || '',
                    college: player.college || '',
                    tier: player.tier || null,
                    csv: player.csv || null,
                    reasoning: reasoning || null,
                    confidence: confidence || null,
                    alexReaction: null,
                    source: pickSource,
                    ts: Date.now(),
                };
                const newCurrent = state.currentIdx + 1;
                const teamPositions = state.teamRosters[slot.teamIdx] || [];
                const nextPicks = [...state.picks, newPick];
                const nextManualCorrections = (pickSource === 'manual-live' || pickSource === 'manual-draft')
                    ? [{
                        type: 'apply',
                        pickId: newPick.id,
                        overall: newPick.overall,
                        pid: newPick.pid,
                        source: pickSource,
                        ts: newPick.ts,
                    }, ...(state.manualCorrections || [])].slice(0, 50)
                    : state.manualCorrections;
                const nextState = {
                    ...state,
                    pool: newPool,
                    picks: nextPicks,
                    pickedByIdx: { ...(state.pickedByIdx || {}), [newPick.overall]: newPick },
                    draftedPids: newDrafted,
                    currentIdx: newCurrent,
                    teamRosters: {
                        ...state.teamRosters,
                        [slot.teamIdx]: [...teamPositions, player.pos],
                    },
                    manualCorrections: nextManualCorrections,
                    phase: newCurrent >= state.pickOrder.length ? 'complete' : 'drafting',
                    // Auto-clear override mode after any pick is made
                    overrideMode: false,
                };
                const nextContext = window.DraftCC?.context?.applyPickToContext
                    ? window.DraftCC.context.applyPickToContext(state.draftContext, newPick, nextState)
                    : state.draftContext;
                return { ...nextState, draftContext: nextContext };
            }

            case 'PIN_TEAM':
                return { ...state, pinnedRosterId: action.rosterId };

            case 'SET_OVERRIDE':
                return { ...state, overrideMode: !!action.enabled };

            case 'UNDO_LAST_PICK': {
                if (!state.picks?.length) return state;
                const lastPick = state.picks[state.picks.length - 1];
                const source = lastPick?.source || '';
                const manualSource = source === 'manual-live' || source === 'manual-draft' || state.mode === 'manual';
                if (action.manualOnly && !manualSource) return state;
                const picks = state.picks.slice(0, -1);
                const derived = rebuildDraftDerived(picks);
                const currentIdx = Math.max(0, state.currentIdx - 1);
                const nextState = {
                    ...state,
                    picks,
                    pickedByIdx: derived.pickedByIdx,
                    draftedPids: derived.draftedPids,
                    currentIdx,
                    teamRosters: derived.teamRosters,
                    pool: restorePoolAfterUndo(state, picks, lastPick),
                    phase: 'drafting',
                    overrideMode: false,
                    manualCorrections: [{
                        type: 'undo',
                        pickId: lastPick.id || null,
                        overall: lastPick.overall,
                        pid: lastPick.pid,
                        source: source || 'manual',
                        ts: Date.now(),
                    }, ...(state.manualCorrections || [])].slice(0, 50),
                    alex: {
                        ...state.alex,
                        stream: (state.alex?.stream || []).filter(ev => Number(ev.relatedPickNo || 0) !== Number(lastPick.overall || 0)),
                    },
                    liveSync: state.mode === 'live-sync'
                        ? mergeLiveSync(state.liveSync, { expectedPickNo: currentIdx + 1 })
                        : state.liveSync,
                };
                const nextContext = window.DraftCC?.context?.undoPickInContext
                    ? window.DraftCC.context.undoPickInContext(state.draftContext, lastPick, nextState)
                    : state.draftContext;
                return { ...nextState, draftContext: nextContext };
            }

            // ── Phase 3: Trades ────────────────────────────────────────
            case 'OFFER_TRADE': {
                // payload: offer object { fromRosterId, toRosterId, theirGive: [picks], myGive: [picks], theirGainDHQ, myGainDHQ, likelihood, grade, taxes, reason }
                return { ...state, activeOffer: action.offer };
            }

            case 'DECLINE_TRADE':
                return { ...state, activeOffer: null };

            case 'ACCEPT_TRADE': {
                // Swap pick ownership in pickOrder: all user-given picks go to CPU, all CPU-given picks go to user.
                const offer = action.offer || state.activeOffer;
                if (!offer) return state;
                const newPickOrder = state.pickOrder.map((p, idx) => {
                    // Only swap picks that haven't been made yet (idx >= currentIdx)
                    if (idx < state.currentIdx) return p;
                    // Check if this slot matches a my-give (user giving this pick to CPU)
                    const isMyGive = (offer.myGive || []).some(g => g.round === p.round && g.teamIdx === p.teamIdx);
                    if (isMyGive) {
                        return { ...p, rosterId: offer.fromRosterId, traded: true };
                    }
                    // Check if this slot matches a their-give (CPU giving this pick to user)
                    const isTheirGive = (offer.theirGive || []).some(g => g.round === p.round && g.teamIdx === p.teamIdx);
                    if (isTheirGive) {
                        return { ...p, rosterId: state.userRosterId, traded: true };
                    }
                    return p;
                });
                const ta = { ...(state.tradedAssets || {}) };
                const ensure = (rid) => {
                    if (!ta[rid]) ta[rid] = { incomingPlayers: [], outgoingPlayers: [], faabDelta: 0 };
                    return ta[rid];
                };
                const userRid = state.userRosterId;
                const cpuRid = offer.fromRosterId;
                const myGivePlayers = offer.myGivePlayers || [];
                const theirGivePlayers = offer.theirGivePlayers || [];
                const myGiveFaab = offer.myGiveFaab || 0;
                const theirGiveFaab = offer.theirGiveFaab || 0;
                if (myGivePlayers.length) {
                    ensure(userRid).outgoingPlayers = [...ensure(userRid).outgoingPlayers, ...myGivePlayers];
                    ensure(cpuRid).incomingPlayers = [...ensure(cpuRid).incomingPlayers, ...myGivePlayers];
                }
                if (theirGivePlayers.length) {
                    ensure(cpuRid).outgoingPlayers = [...ensure(cpuRid).outgoingPlayers, ...theirGivePlayers];
                    ensure(userRid).incomingPlayers = [...ensure(userRid).incomingPlayers, ...theirGivePlayers];
                }
                if (myGiveFaab > 0) { ensure(userRid).faabDelta -= myGiveFaab; ensure(cpuRid).faabDelta += myGiveFaab; }
                if (theirGiveFaab > 0) { ensure(cpuRid).faabDelta -= theirGiveFaab; ensure(userRid).faabDelta += theirGiveFaab; }
                return {
                    ...state,
                    pickOrder: newPickOrder,
                    tradedAssets: ta,
                    activeOffer: null,
                    completedTrades: [
                        ...state.completedTrades,
                        {
                            ...offer,
                            acceptedAt: state.currentIdx,
                            ts: Date.now(),
                        },
                    ],
                };
            }

            case 'OPEN_PROPOSER': {
                // payload: { targetRosterId }
                return {
                    ...state,
                    proposerDrawer: {
                        targetRosterId: action.targetRosterId,
                        myGive: [],
                        theirGive: [],
                        myGivePlayers: [],
                        theirGivePlayers: [],
                        myGiveFaab: 0,
                        theirGiveFaab: 0,
                            status: 'building', // 'building' | 'sending' | 'countered' | 'accepted' | 'declined' | 'planned' | 'pending'
                    },
                };
            }

            case 'CLOSE_PROPOSER':
                return { ...state, proposerDrawer: null };

            case 'UPDATE_PROPOSER': {
                // payload: partial merge into proposerDrawer
                if (!state.proposerDrawer) return state;
                return {
                    ...state,
                    proposerDrawer: { ...state.proposerDrawer, ...action.payload },
                };
            }

            case 'STAGE_LIVE_OFFER': {
                const offer = {
                    ...(action.offer || {}),
                    id: action.offer?.id || ('live_offer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
                    status: action.offer?.status || 'staged',
                    stagedAt: Date.now(),
                    pickNo: state.currentIdx + 1,
                };
                return {
                    ...state,
                    stagedLiveOffers: [offer, ...(state.stagedLiveOffers || [])].slice(0, 8),
                    proposerDrawer: state.proposerDrawer
                        ? { ...state.proposerDrawer, status: 'planned', stagedOfferId: offer.id }
                        : state.proposerDrawer,
                };
            }

            case 'DISMISS_STAGED_LIVE_OFFER':
                return {
                    ...state,
                    stagedLiveOffers: (state.stagedLiveOffers || []).filter(o => o.id !== action.offerId),
                };

            case 'UPDATE_LIVE_OFFER_STATUS':
                return {
                    ...state,
                    stagedLiveOffers: (state.stagedLiveOffers || []).map(offer => {
                        if (offer.id !== action.offerId) return offer;
                        const status = action.status || offer.status || 'staged';
                        return {
                            ...offer,
                            status,
                            outcome: action.outcome || offer.outcome || null,
                            updatedAt: Date.now(),
                            sentAt: status === 'pending' && !offer.sentAt ? Date.now() : offer.sentAt,
                            resolvedAt: (status === 'accepted' || status === 'rejected') ? Date.now() : offer.resolvedAt,
                        };
                    }),
                    proposerDrawer: state.proposerDrawer?.stagedOfferId === action.offerId
                        ? { ...state.proposerDrawer, status: action.status === 'pending' ? 'pending' : action.status || state.proposerDrawer.status }
                        : state.proposerDrawer,
                };

            case 'LIVE_SYNC_STATUS': {
                const liveSync = mergeLiveSync(state.liveSync, action.payload || {});
                const remoteComplete = liveSync.status === 'complete' && state.currentIdx >= state.pickOrder.length;
                return {
                    ...state,
                    liveSync,
                    phase: remoteComplete ? 'complete' : state.phase,
                };
            }

            case 'APPLY_LIVE_SYNC_PICKS': {
                const incoming = action.picks || [];
                if (!incoming.length) {
                    return { ...state, liveSync: mergeLiveSync(state.liveSync, action.status || {}) };
                }

                let pool = state.pool;
                let picks = state.picks.slice();
                let draftedPids = { ...state.draftedPids };
                let teamRosters = { ...state.teamRosters };
                let pickOrder = state.pickOrder.slice();
                let pickedByIdx = { ...(state.pickedByIdx || {}) };
                let currentIdx = state.currentIdx;
                let draftContext = state.draftContext;
                let duplicateCount = 0;
                let missedPickCount = 0;
                let lastPickNo = state.liveSync?.lastPickNo || 0;
                const existingPickNos = new Set(picks.map(livePickNo).filter(Boolean));

                incoming.forEach(item => {
                    const sleeperPick = item.sleeperPick || item.raw || item;
                    const player = item.player;
                    const pickNo = Number(sleeperPick?.pick_no || (currentIdx + 1));
                    lastPickNo = Math.max(lastPickNo, pickNo);
                    if (!player?.pid) {
                        duplicateCount += 1;
                        return;
                    }
                    if (existingPickNos.has(pickNo) || draftedPids[player.pid]) {
                        duplicateCount += 1;
                        return;
                    }
                    if (pickNo && pickNo !== currentIdx + 1) {
                        missedPickCount += Math.max(1, Math.abs(pickNo - (currentIdx + 1)));
                        return;
                    }

                    const slot = pickOrder[currentIdx];
                    if (!slot) return;
                    const rosterId = sleeperPick?.roster_id || slot.rosterId;
                    const adjustedSlot = {
                        ...slot,
                        rosterId,
                        traded: slot.originalRosterId != null && String(rosterId) !== String(slot.originalRosterId),
                    };
                    pickOrder[currentIdx] = adjustedSlot;

                    pool = pool.filter(p => String(p.pid) !== String(player.pid));
                    draftedPids = { ...draftedPids, [player.pid]: true };
                    const newPick = {
                        id: 'pick_' + adjustedSlot.overall + '_' + Date.now(),
                        round: adjustedSlot.round,
                        slot: adjustedSlot.slot,
                        pickInRound: adjustedSlot.slot,
                        overall: adjustedSlot.overall,
                        teamIdx: adjustedSlot.teamIdx,
                        rosterId,
                        isUser: String(rosterId) === String(state.userRosterId),
                        pid: player.pid,
                        name: player.name,
                        pos: player.pos,
                        dhq: player.dhq,
                        consensusRank: player.consensusRank || null,
                        photoUrl: player.photoUrl || '',
                        college: player.college || '',
                        tier: player.tier || null,
                        csv: player.csv || null,
                        reasoning: item.reasoning || { primary: 'Live Sleeper pick', baseVal: player.dhq, nudges: [] },
                        confidence: item.confidence || 1.0,
                        alexReaction: null,
                        sleeperPickNo: pickNo,
                        sleeperPickedBy: sleeperPick?.picked_by || null,
                        source: 'live-sync',
                        ts: Date.now(),
                    };
                    picks = [...picks, newPick];
                    pickedByIdx = { ...pickedByIdx, [newPick.overall]: newPick };
                    existingPickNos.add(pickNo);
                    const teamPositions = teamRosters[adjustedSlot.teamIdx] || [];
                    teamRosters = {
                        ...teamRosters,
                        [adjustedSlot.teamIdx]: [...teamPositions, player.pos],
                    };
                    currentIdx += 1;
                    const nextStateForContext = {
                        ...state,
                        pool,
                        picks,
                        draftedPids,
                        currentIdx,
                        pickOrder,
                        teamRosters,
                    };
                    draftContext = window.DraftCC?.context?.applyPickToContext
                        ? window.DraftCC.context.applyPickToContext(draftContext, newPick, nextStateForContext)
                        : draftContext;
                });

                const statusPatch = {
                    ...(action.status || {}),
                    lastPickNo,
                    expectedPickNo: currentIdx + 1,
                    duplicateCount: (state.liveSync?.duplicateCount || 0) + duplicateCount,
                    missedPickCount: (state.liveSync?.missedPickCount || 0) + missedPickCount,
                };
                if (missedPickCount > 0) {
                    statusPatch.status = 'stale';
                    statusPatch.stale = true;
                    statusPatch.error = 'Sleeper pick order skipped ahead. War Room paused rather than applying picks to the wrong slots.';
                }

                return {
                    ...state,
                    pool,
                    picks,
                    pickedByIdx,
                    draftedPids,
                    currentIdx,
                    pickOrder,
                    teamRosters,
                    draftContext,
                    phase: currentIdx >= pickOrder.length ? 'complete' : state.phase,
                    liveSync: mergeLiveSync(state.liveSync, statusPatch),
                };
            }

            case 'UPDATE_BOARD_CONTEXT': {
                const nextContext = window.DraftCC?.context?.applyBoardPatchToContext
                    ? window.DraftCC.context.applyBoardPatchToContext(state.draftContext, action.patch || {})
                    : state.draftContext;
                return { ...state, draftContext: nextContext };
            }

            // ── Phase 4: Alex AI ──────────────────────────────────────
            case 'ALEX_EVENT_ADD': {
                // payload: { id, type, badge, color, title, text, relatedPickNo, ts }
                const ev = {
                    id: action.event.id || ('ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
                    type: action.event.type || 'rule',
                    badge: action.event.badge || '•',
                    color: action.event.color || 'var(--silver)',
                    title: action.event.title || '',
                    text: action.event.text || '',
                    relatedPickNo: action.event.relatedPickNo || null,
                    ts: action.event.ts || Date.now(),
                };
                // Cap stream at 50 most recent events
                const newStream = [ev, ...state.alex.stream].slice(0, 50);
                return {
                    ...state,
                    alex: { ...state.alex, stream: newStream },
                };
            }

            case 'ALEX_SPEND_SONNET':
                return {
                    ...state,
                    alex: {
                        ...state.alex,
                        alexSpend: {
                            ...state.alex.alexSpend,
                            sonnet: (state.alex.alexSpend.sonnet || 0) + 1,
                        },
                    },
                };

            case 'ALEX_SPEND_FLASH':
                return {
                    ...state,
                    alex: {
                        ...state.alex,
                        alexSpend: {
                            ...state.alex.alexSpend,
                            flash: (state.alex.alexSpend.flash || 0) + 1,
                        },
                    },
                };

            case 'ALEX_SET_THINKING':
                return {
                    ...state,
                    alex: { ...state.alex, thinking: !!action.thinking },
                };

            case 'ALEX_UPDATE_BUDGET':
                return {
                    ...state,
                    alex: {
                        ...state.alex,
                        alexSpend: { ...state.alex.alexSpend, budget: action.budget },
                    },
                };

            case 'COMPLETE_PROPOSAL': {
                // payload: { accepted: boolean, offer: offer }
                if (!state.proposerDrawer) return state;
                if (!action.accepted) {
                    return {
                        ...state,
                        proposerDrawer: { ...state.proposerDrawer, status: 'declined' },
                    };
                }
                // Accepted: swap picks like ACCEPT_TRADE
                const offer = action.offer;
                const newPickOrder = state.pickOrder.map((p, idx) => {
                    if (idx < state.currentIdx) return p;
                    const isMyGive = (offer.myGive || []).some(g => g.round === p.round && g.teamIdx === p.teamIdx);
                    if (isMyGive) return { ...p, rosterId: offer.fromRosterId, traded: true };
                    const isTheirGive = (offer.theirGive || []).some(g => g.round === p.round && g.teamIdx === p.teamIdx);
                    if (isTheirGive) return { ...p, rosterId: state.userRosterId, traded: true };
                    return p;
                });
                // Record player + FAAB movement so roster/intel views can derive
                // effective post-trade state. Base rosters live outside state
                // (window.S.rosters), so we track deltas here rather than mutate.
                const ta = { ...(state.tradedAssets || {}) };
                const ensure = (rid) => {
                    if (!ta[rid]) ta[rid] = { incomingPlayers: [], outgoingPlayers: [], faabDelta: 0 };
                    return ta[rid];
                };
                const userRid = state.userRosterId;
                const cpuRid = offer.fromRosterId;
                const myGivePlayers = offer.myGivePlayers || [];
                const theirGivePlayers = offer.theirGivePlayers || [];
                const myGiveFaab = offer.myGiveFaab || 0;
                const theirGiveFaab = offer.theirGiveFaab || 0;
                if (myGivePlayers.length) {
                    ensure(userRid).outgoingPlayers = [...ensure(userRid).outgoingPlayers, ...myGivePlayers];
                    ensure(cpuRid).incomingPlayers = [...ensure(cpuRid).incomingPlayers, ...myGivePlayers];
                }
                if (theirGivePlayers.length) {
                    ensure(cpuRid).outgoingPlayers = [...ensure(cpuRid).outgoingPlayers, ...theirGivePlayers];
                    ensure(userRid).incomingPlayers = [...ensure(userRid).incomingPlayers, ...theirGivePlayers];
                }
                if (myGiveFaab > 0) { ensure(userRid).faabDelta -= myGiveFaab; ensure(cpuRid).faabDelta += myGiveFaab; }
                if (theirGiveFaab > 0) { ensure(cpuRid).faabDelta -= theirGiveFaab; ensure(userRid).faabDelta += theirGiveFaab; }
                return {
                    ...state,
                    pickOrder: newPickOrder,
                    tradedAssets: ta,
                    proposerDrawer: { ...state.proposerDrawer, status: 'accepted' },
                    completedTrades: [
                        ...state.completedTrades,
                        { ...offer, acceptedAt: state.currentIdx, ts: Date.now(), userInitiated: true },
                    ],
                };
            }

            case 'MERGE_DRAFT_DNA': {
                // payload: { [rosterId]: DraftDnaShape } — merge only the draftDna field
                // so we don't clobber predictions or other persona state.
                const newPersonas = { ...state.personas };
                Object.entries(action.payload || {}).forEach(([rid, draftDna]) => {
                    if (newPersonas[rid]) {
                        newPersonas[rid] = {
                            ...newPersonas[rid],
                            draftDna: { ...newPersonas[rid].draftDna, ...draftDna },
                        };
                    }
                });
                return { ...state, personas: newPersonas };
            }

            case 'UPDATE_PREDICTIONS': {
                // payload: { [rosterId]: { willReach, willPassOn, likelyPick } }
                const newPersonas = { ...state.personas };
                Object.entries(action.payload || {}).forEach(([rid, preds]) => {
                    if (newPersonas[rid]) {
                        newPersonas[rid] = {
                            ...newPersonas[rid],
                            predictions: {
                                round: action.round || 0,
                                ...preds,
                            },
                        };
                    }
                });
                return { ...state, personas: newPersonas };
            }

            case 'RESET': {
                return initialDraftState({
                    leagueId: state.leagueId,
                    season: state.season,
                    mode: state.mode,
                    variant: state.variant,
                    rounds: state.rounds,
                    leagueSize: state.leagueSize,
                    draftType: state.draftType,
                    userRosterId: state.userRosterId,
                    userSlot: state.userSlot,
                    sleeperDraftId: state.sleeperDraftId,
                    liveDraftMeta: state.liveDraftMeta,
                    draftTuning: state.draftTuning,
                });
            }

            case 'HYDRATE':
                return { ...state, ...action.state };

            case 'SET_SPEED':
                return { ...state, speed: action.speed };

            case 'SET_MODE':
                return { ...state, mode: action.mode };

            case 'SET_SCENARIO':
                return { ...state, scenarioId: action.scenarioId };

            case 'SET_REPLAY_DRAFT':
                // payload: { draftId, draftMeta }
                return {
                    ...state,
                    sleeperDraftId: action.draftId,
                    replayMeta: action.meta || null,
                };

            case 'REPLAY_SEEK': {
                // Jump the replay pointer to a given pick index. Truncates
                // state.picks to that index and rebuilds draftedPids + teamRosters.
                if (!state.replay) return state;
                const target = Math.max(0, Math.min(action.idx || 0, state.replay.replayPicks.length));
                const picks = state.replay.replayPicks.slice(0, target);
                const derived = rebuildDraftDerived(picks);
                // Pool shrinks — drop the pid of every pick made
                const pool = state.originalPool.filter(p => !derived.draftedPids[p.pid]);
                return {
                    ...state,
                    picks,
                    currentIdx: target,
                    pickedByIdx: derived.pickedByIdx,
                    draftedPids: derived.draftedPids,
                    teamRosters: derived.teamRosters,
                    pool,
                };
            }

            default:
                return state;
        }
    }

    // ── localStorage save/load (debounced externally) ────────────────
    // forcedMode is an explicit second arg so the Mock Draft and Live Sync
    // tabs never trample each other's auto-resume state.
    function saveToLocal(state, forcedMode) {
        if (!state || !state.leagueId) return;
        try {
            if (state.phase === 'setup') return;
            const toSave = {
                ...state,
                picks: state.picks.map(p => ({ ...p, csv: null })),
                pool: state.pool.slice(0, 300),
                originalPool: slimPool(state.originalPool && state.originalPool.length ? state.originalPool : state.pool, 600),
                personas: {},
            };
            // Use the tab's mode to pick the right key (live-sync → 'live', else 'mock')
            const keyMode = forcedMode || (state.mode === 'live-sync' ? 'live-sync' : null);
            localStorage.setItem(LS_KEY(state.leagueId, keyMode), JSON.stringify(toSave));
        } catch (e) {
            if (window.wrLog) window.wrLog('draftState.save', e);
        }
    }

    function loadFromLocal(leagueId, forcedMode) {
        if (!leagueId) return null;
        try {
            const raw = localStorage.getItem(LS_KEY(leagueId, forcedMode));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed.version !== DRAFT_STATE_VERSION) {
                localStorage.removeItem(LS_KEY(leagueId, forcedMode));
                return null;
            }
            // Sanity check: if forcedMode is set, ignore state with a mismatched mode
            if (forcedMode === 'live-sync' && parsed.mode !== 'live-sync') return null;
            if (!forcedMode && parsed.mode === 'live-sync') return null;
            if (!parsed.pickedByIdx) parsed.pickedByIdx = buildPickedByIdx(parsed.picks || []);
            if (!parsed.manualCorrections) parsed.manualCorrections = [];
            if (!parsed.stagedLiveOffers) parsed.stagedLiveOffers = [];
            return parsed;
        } catch (e) {
            if (window.wrLog) window.wrLog('draftState.load', e);
            return null;
        }
    }

    function clearLocal(leagueId, forcedMode) {
        try { localStorage.removeItem(LS_KEY(leagueId, forcedMode)); } catch (e) {}
    }

    // ── Grade helper ─────────────────────────────────────────────────
    function gradeDraft(myPicks, originalPool) {
        if (!myPicks.length) return { letter: '?', totalDHQ: 0, pct: 0 };
        const totalDHQ = myPicks.reduce((s, p) => s + (p.dhq || 0), 0);
        const ranks = new Map(originalPool.map((p, i) => [p.pid, i + 1]));
        let values = 0;
        for (const p of myPicks) {
            const rank = ranks.get(p.pid) ?? p.overall;
            if (rank <= p.overall * 1.3) values++;
        }
        const pct = values / myPicks.length;
        const letter =
            pct >= 0.85 ? 'A+' :
            pct >= 0.7  ? 'A'  :
            pct >= 0.55 ? 'B+' :
            pct >= 0.4  ? 'B'  : 'C';
        return { letter, totalDHQ, pct: Math.round(pct * 100) };
    }

    function buildDraftRecap(state, opts = {}) {
        const userRosterId = opts.userRosterId ?? state?.userRosterId;
        const picks = (state?.picks || []).map(normalizePickRecord).filter(Boolean);
        const myPicks = picks.filter(p =>
            String(p.rosterId) === String(userRosterId)
            || (!p.rosterId && Number(p.slot) === Number(state?.userSlot))
            || p.isUser
        );
        const grade = opts.grade || gradeDraft(myPicks, state?.originalPool || []);
        const leagueTotals = leagueTotalsFromPicks(picks);
        const totals = Object.entries(leagueTotals)
            .map(([rosterId, totalDHQ]) => ({ rosterId, totalDHQ }))
            .sort((a, b) => b.totalDHQ - a.totalDHQ);
        const rank = totals.findIndex(row => String(row.rosterId) === String(userRosterId)) + 1;
        const percentile = totals.length && rank > 0
            ? Math.round(((totals.length - rank) / Math.max(1, totals.length - 1)) * 100)
            : 0;
        const ownerLearning = {};
        picks.forEach(p => {
            const key = String(p.rosterId ?? p.slot ?? 'unknown');
            if (!ownerLearning[key]) {
                ownerLearning[key] = {
                    rosterId: p.rosterId ?? null,
                    ownerName: p.ownerName || null,
                    picks: 0,
                    totalDHQ: 0,
                    posCounts: {},
                    earlyPositions: [],
                    reaches: 0,
                    steals: 0,
                };
            }
            const row = ownerLearning[key];
            row.picks += 1;
            row.totalDHQ += pickDhq(p);
            const pos = pickPos(p) || '?';
            row.posCounts[pos] = (row.posCounts[pos] || 0) + 1;
            if (Number(p.round || 0) <= 2) row.earlyPositions.push(pos);
            if (p.consensusRank && Number(p.consensusRank) > Number(p.overall || 0) + 8) row.reaches += 1;
            if (p.consensusRank && Number(p.consensusRank) < Number(p.overall || 0) - 8) row.steals += 1;
        });
        return {
            schemaVersion: 'draft-recap-v2',
            id: opts.id || ('recap_' + Date.now()),
            leagueId: state?.leagueId || '',
            season: state?.season || new Date().getFullYear(),
            mode: state?.mode || 'solo',
            variant: state?.variant || 'startup',
            grade,
            totalDHQ: grade.totalDHQ,
            pct: grade.pct,
            rank: rank || null,
            percentile,
            picks: myPicks.map(p => ({
                round: p.round,
                slot: p.slot,
                overall: p.overall,
                pickInRound: p.pickInRound || p.slot,
                rosterId: p.rosterId,
                pid: p.pid,
                name: pickName(p),
                pos: pickPos(p),
                dhq: pickDhq(p),
            })),
            leagueTotals,
            ownerLearning,
            savedAt: Date.now(),
        };
    }

    function draftLearningKey(leagueId) {
        return 'wr_draft_owner_learning_' + (leagueId || 'default');
    }

    function saveDraftLearning(recap) {
        if (!recap?.leagueId || typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem(draftLearningKey(recap.leagueId));
            const existing = raw ? JSON.parse(raw) : [];
            const next = [recap, ...(Array.isArray(existing) ? existing : [])].slice(0, 20);
            localStorage.setItem(draftLearningKey(recap.leagueId), JSON.stringify(next));
            if (window.App?.LI) {
                window.App.LI.draftOutcomes = next;
            }
            return next;
        } catch (e) {
            if (window.wrLog) window.wrLog('draftState.saveLearning', e);
            return null;
        }
    }

    function saveDraftRecap(state, opts = {}) {
        const recap = buildDraftRecap(state, opts);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(opts.key || ('wr_draft_recap_' + Date.now()), JSON.stringify(recap));
        }
        saveDraftLearning(recap);
        return recap;
    }

    function formatDraftRecapText(recap) {
        const lines = [
            'Draft Recap - ' + (recap?.grade?.letter || '?') + ' (' + Number(recap?.totalDHQ || 0).toLocaleString() + ' DHQ, ' + Number(recap?.pct || 0) + '% value)',
            '',
        ];
        (recap?.picks || []).forEach((pk, i) => {
            lines.push('  ' + (i + 1) + '. ' + (pk.name || pk.pid) + ' - ' + (pk.pos || '?') + ' · ' + Number(pk.dhq || 0).toLocaleString() + ' DHQ');
        });
        if (recap?.rank) {
            lines.push('');
            lines.push('League rank: #' + recap.rank + ' · ' + recap.percentile + 'th percentile by draft DHQ');
        }
        return lines.join('\n');
    }

    // Apply the tradedAssets ledger on top of a base roster to derive the
    // player-ids the roster effectively controls inside the mock context.
    function getEffectivePlayers(state, rosterId, basePlayers) {
        const ledger = state?.tradedAssets?.[rosterId];
        if (!ledger) return basePlayers || [];
        const out = new Set(basePlayers || []);
        (ledger.outgoingPlayers || []).forEach(pid => out.delete(pid));
        (ledger.incomingPlayers || []).forEach(pid => out.add(pid));
        return [...out];
    }
    function getFaabDelta(state, rosterId) {
        return state?.tradedAssets?.[rosterId]?.faabDelta || 0;
    }

    window.DraftCC = window.DraftCC || {};
    window.DraftCC.state = {
        DRAFT_STATE_VERSION,
        LS_KEY,
        initialDraftState,
        buildPool,
        buildPickOrder,
        reducer,
        saveToLocal,
        loadFromLocal,
        clearLocal,
        gradeDraft,
        normalizePickRecord,
        buildPickedByIdx,
        leagueTotalsFromPicks,
        buildDraftRecap,
        saveDraftRecap,
        saveDraftLearning,
        formatDraftRecapText,
        getEffectivePlayers,
        getFaabDelta,
    };
})();
