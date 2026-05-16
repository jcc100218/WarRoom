// ══════════════════════════════════════════════════════════════════
// js/draft/command-center.js — <DraftCommandCenter/> main shell
//
// The 6-panel desktop dashboard. Owns draftState via useReducer, renders
// three row bands: header (60px) · top (Big Board / Draft Grid / Opponent
// Intel) · bottom (Live Analytics / Alex Stream). Wires the CPU auto-pick
// loop, speed control, localStorage auto-save, and the setup flow.
//
// Phase 1 replaces the old <MockDraftPanel/> when the feature flag
// `localStorage.wr_draft_cc_enabled` is on (default). Flip it off in
// devtools to fall back to the original MockDraftSimulator.
//
// Depends on: all js/draft/* modules above (styles, scouting, persona,
//             cpu-engine, state, big-board, draft-grid, opponent-intel,
//             alex-stream, live-analytics)
// Exposes:    window.DraftCommandCenter (React component)
//             window.DraftCC.featureFlag (localStorage key helper)
// ══════════════════════════════════════════════════════════════════

(function() {
    const { DRAFT_CC_LAYOUT, FONT_UI, FONT_DISPL, FONT_MONO, panelCard, bpBucket } = window.DraftCC.styles;
    const SpeedMap = { slow: 1600, medium: 700, fast: 250, paused: -1 };

    const FEATURE_FLAG_KEY = 'wr_draft_cc_enabled';
    function isFeatureEnabled() {
        try {
            const v = localStorage.getItem(FEATURE_FLAG_KEY);
            // Default ON — user must explicitly set to 'false' to disable
            return v !== 'false';
        } catch (e) { return true; }
    }

    // ── Top-level shell ──────────────────────────────────────────────
    // Reorder a draft pool by the selected saved board lane. Players not in the
    // saved order keep their original DHQ-sorted position at the tail. Refreshes
    // consensusRank so reach/steal detection reflects the board the user picked.
    function applyUserBigBoardOrder(pool, leagueId, draftType) {
        if (!Array.isArray(pool) || !pool.length || !leagueId) return pool;
        try {
            const saved = window.DraftCC?.context?._private?.loadStoredBoard
                ? window.DraftCC.context._private.loadStoredBoard(leagueId, draftType)
                : null;
            const lane = saved?.activeLane || saved?.boardMode || 'dhq';
            const savedOrder = lane === 'ai' && Array.isArray(saved?.aiOrder) && saved.aiOrder.length
                ? saved.aiOrder
                : lane === 'my' && Array.isArray(saved?.myOrder) && saved.myOrder.length
                    ? saved.myOrder
                    : null;
            if (!savedOrder || !savedOrder.length) return pool;
            const rank = new Map();
            savedOrder.forEach((pid, i) => rank.set(String(pid), i));
            const getRank = p => {
                if (rank.has(String(p.pid))) return rank.get(String(p.pid));
                if (p.csvPid && rank.has(String(p.csvPid))) return rank.get(String(p.csvPid));
                return Infinity;
            };
            const reordered = pool.slice().sort((a, b) => {
                const ra = getRank(a);
                const rb = getRank(b);
                if (ra !== rb) return ra - rb;
                return (b.dhq || 0) - (a.dhq || 0);
            });
            reordered.forEach((p, i) => { p.consensusRank = i + 1; });
            return reordered;
        } catch (e) {
            if (window.wrLog) window.wrLog('cc.bigboardOrder', e);
            return pool;
        }
    }

    function normalizeDraftName(name) {
        return (name || '').toLowerCase().replace(/[''`.]/g, '').replace(/\s+(jr\.?|sr\.?|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();
    }

    function formatTradeAssetPick(pick) {
        if (!pick) return '';
        return 'R' + pick.round + '.' + String(pick.slot || 0).padStart(2, '0');
    }

    function formatTradeAssetPlayer(pid) {
        const p = window.S?.players?.[pid] || {};
        const full = p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim();
        return full || pid;
    }

    function formatTradePackageSide(proposal, side) {
        const picks = side === 'my' ? (proposal?.myGive || []) : (proposal?.theirGive || []);
        const players = side === 'my' ? (proposal?.myGivePlayers || []) : (proposal?.theirGivePlayers || []);
        const faab = side === 'my' ? (proposal?.myGiveFaab || 0) : (proposal?.theirGiveFaab || 0);
        const items = [];
        picks.slice(0, 2).forEach(p => items.push(formatTradeAssetPick(p)));
        players.slice(0, 1).forEach(pid => items.push(formatTradeAssetPlayer(pid)));
        const displayedAssets = Math.min(2, picks.length) + Math.min(1, players.length);
        if (faab > 0) items.push('$' + faab + ' FAAB');
        const remaining = Math.max(0, picks.length + players.length - displayedAssets);
        if (remaining) items.push('+' + remaining);
        return items.length ? items.join(', ') : 'No assets';
    }

    function liveTradeTimingLabel(tradeWindow) {
        if (tradeWindow?.onClock) return 'On clock now';
        if (tradeWindow?.picksAway === 1) return 'Next pick';
        return (tradeWindow?.picksAway || 0) + ' picks away';
    }

    function describeLiveTradeWindow(tradeWindow) {
        const suggestion = tradeWindow?.suggestion || {};
        const proposal = suggestion.proposal || {};
        const give = formatTradePackageSide(proposal, 'my');
        const get = formatTradePackageSide(proposal, 'their');
        return liveTradeTimingLabel(tradeWindow) + ' at ' + tradeWindow.pickLabel + ': '
            + (suggestion.label || tradeWindow.motive || 'Trade window') + ' with ' + tradeWindow.teamName
            + '. Give ' + give + '; get ' + get + '. '
            + tradeWindow.likelihood + '% acceptance vs ' + tradeWindow.acceptanceLine + '% Buyer Line.';
    }

    function formatLiveClockTime(ts) {
        if (!ts) return 'not checked yet';
        try {
            return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        } catch (_) {
            return 'recently';
        }
    }

    function sleeperDraftUrl(draftId) {
        return draftId ? 'https://sleeper.com/draft/nfl/' + draftId : '';
    }

    function looksLikeRookieSleeperDraft(draft) {
        const rounds = draft?.settings?.rounds || 0;
        const playerType = draft?.settings?.player_type;
        const descr = (draft?.metadata?.description || draft?.metadata?.name || '').toLowerCase();
        return playerType === 1
            || /rookie/.test(descr)
            || (rounds > 0 && rounds <= 6);
    }

    function liveDraftSetupPatch(draft) {
        if (!draft?.draft_id) return {};
        const rounds = draft.settings?.rounds || 0;
        const patch = {
            sleeperDraftId: draft.draft_id,
            liveDraftMeta: {
                draftId: draft.draft_id,
                status: draft.status || '',
                startTime: draft.start_time || null,
                type: draft.type || '',
                rounds,
                teams: draft.settings?.teams || 0,
            },
        };
        if (looksLikeRookieSleeperDraft(draft)) patch.variant = 'rookie';
        if (rounds) patch.rounds = rounds;
        if (draft.settings?.teams) patch.leagueSize = draft.settings.teams;
        if (draft.type) patch.draftType = draft.type;
        return patch;
    }

    function refreshRookieValuesFromEngine(saved, stateFns, playersData) {
        if (!saved || saved.variant !== 'rookie' || !stateFns?.buildPool) return saved;
        const freshPool = stateFns.buildPool({ variant: 'rookie', playersData, maxSize: 200 });
        if (!freshPool?.length) return saved;

        const byPid = new Map();
        const byCsvPid = new Map();
        const byName = new Map();
        freshPool.forEach(p => {
            byPid.set(String(p.pid), p);
            if (p.csvPid) byCsvPid.set(String(p.csvPid), p);
            byName.set(normalizeDraftName(p.name), p);
        });
        const findFresh = p => byPid.get(String(p?.pid)) || byCsvPid.get(String(p?.pid)) || byCsvPid.get(String(p?.csvPid)) || byName.get(normalizeDraftName(p?.name));
        const mergeFresh = p => {
            const fresh = findFresh(p);
            return fresh ? { ...p, ...fresh, reasoning: p.reasoning || fresh.reasoning, confidence: p.confidence || fresh.confidence } : p;
        };

        return {
            ...saved,
            pool: (saved.pool || []).map(mergeFresh).sort((a, b) => (b.dhq || 0) - (a.dhq || 0)),
            originalPool: freshPool.slice(),
            picks: (saved.picks || []).map(mergeFresh),
        };
    }

    function DraftCommandCenter({ playersData, myRoster, currentLeague, draftRounds: propRounds, forcedMode }) {
        const stateFns = window.DraftCC.state;

        // Phase 5+: mount-time fetch for the league's drafts so upcomingSettings
        // is populated even when window.S.drafts is empty (which is common —
        // the main app's Draft Room tab fetches it separately into draft-room.js).
        const [fetchedDrafts, setFetchedDrafts] = React.useState(null);
        const leagueIdForFetch = currentLeague?.league_id || currentLeague?.id;
        React.useEffect(() => {
            if (!leagueIdForFetch) return;
            let cancelled = false;
            const fn = window.Sleeper?.fetchDrafts || (async (lid) => {
                const resp = await fetch('https://api.sleeper.app/v1/league/' + lid + '/drafts');
                return resp.ok ? resp.json() : [];
            });
            fn(leagueIdForFetch).then(d => {
                if (!cancelled) setFetchedDrafts(Array.isArray(d) ? d : []);
            }).catch(() => { if (!cancelled) setFetchedDrafts([]); });
            return () => { cancelled = true; };
        }, [leagueIdForFetch]);

        // Default setup from real Sleeper draft data
        const draftMeta = React.useMemo(() => {
            const rosters = window.S?.rosters || currentLeague?.rosters || [];
            const users = window.S?.leagueUsers || currentLeague?.users || [];
            const myUid = window.S?.user?.user_id || '';
            const myRid = myRoster?.roster_id;
            const tradedPicks = window.S?.tradedPicks || [];
            const leagueSeason = String(currentLeague?.season || new Date().getFullYear());
            // Prefer mount-fetched drafts, then window.S cache, then currentLeague synthetic fallback
            const drafts = (fetchedDrafts && fetchedDrafts.length) ? fetchedDrafts : (window.S?.drafts || []);
            const upcoming = drafts.find(d => d.status === 'pre_draft')
                || drafts.find(d => d.status === 'drafting')
                || drafts[0];
            const sleeperOrder = upcoming?.draft_order || {};

            const slotToRoster = {};
            const hasRealDraftOrder = Object.keys(sleeperOrder).length > 0;
            if (hasRealDraftOrder) {
                Object.entries(sleeperOrder).forEach(([userId, slot]) => {
                    const roster = rosters.find(r => r.owner_id === userId);
                    const user = users.find(u => u.user_id === userId);
                    const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + slot;
                    slotToRoster[slot] = { rosterId: roster?.roster_id, ownerName: name, userId };
                });
            } else {
                const sorted = [...rosters].sort((a, b) => {
                    const wa = a.settings?.wins || 0;
                    const wb = b.settings?.wins || 0;
                    if (wa !== wb) return wa - wb;
                    return (a.settings?.fpts || 0) - (b.settings?.fpts || 0);
                });
                sorted.forEach((r, i) => {
                    const user = users.find(u => u.user_id === r.owner_id);
                    const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + (i + 1);
                    slotToRoster[i + 1] = { rosterId: r.roster_id, ownerName: name, userId: r.owner_id };
                });
            }

            // Compute total teams — prefer upcoming.settings.teams, then league settings, then roster count
            const fallbackTeams = (rosters.length) || 12;
            const totalTeams = (upcoming?.settings?.teams)
                || (currentLeague?.settings?.num_teams)
                || (window.S?.leagues?.[0]?.settings?.num_teams)
                || Math.max(Object.keys(slotToRoster).length, fallbackTeams);

            // Fill in any missing slots with remaining rosters (round-robin over
            // ghost/unmapped rosters). When draft_order is partial (e.g., only
            // the user is mapped), this keeps every slot populated so downstream
            // code like buildPickOrder + isUserTurn works correctly.
            const mappedRosterIds = new Set(Object.values(slotToRoster).map(e => e.rosterId).filter(Boolean));
            const unmappedRosters = rosters.filter(r => !mappedRosterIds.has(r.roster_id));
            let ghostIdx = 0;
            for (let slot = 1; slot <= totalTeams; slot++) {
                if (slotToRoster[slot]) continue;
                const r = unmappedRosters[ghostIdx++] || {};
                const user = r.owner_id ? users.find(u => u.user_id === r.owner_id) : null;
                const name = user?.metadata?.team_name || user?.display_name || user?.username || 'Team ' + slot;
                slotToRoster[slot] = {
                    rosterId: r.roster_id || null,
                    ownerName: name,
                    userId: r.owner_id || null,
                };
            }

            let mySlot = null;
            for (const [slot, info] of Object.entries(slotToRoster)) {
                if (info.userId === myUid || info.rosterId === myRid) {
                    mySlot = parseInt(slot, 10);
                    break;
                }
            }

            const numTeams = totalTeams;

            // If we couldn't find the user in the draft_order mapping (common in
            // demo/test leagues with unmapped users), force them into slot 1.
            if (!mySlot && myRid != null) {
                const forcedSlot = 1;
                mySlot = forcedSlot;
                slotToRoster[forcedSlot] = {
                    rosterId: myRid,
                    ownerName: 'YOU',
                    userId: myUid || null,
                };
            }

            // Build pick ownership (traded picks)
            const pickOwnership = {};
            for (let rd = 1; rd <= (propRounds || 5); rd++) {
                for (let slot = 1; slot <= numTeams; slot++) {
                    const origInfo = slotToRoster[slot] || {};
                    const origRid = origInfo.rosterId;
                    const traded = tradedPicks.find(tp =>
                        tp.round === rd && tp.roster_id === origRid &&
                        tp.owner_id !== origRid && String(tp.season) === leagueSeason
                    );
                    if (traded) {
                        const newOwner = rosters.find(r => r.roster_id === traded.owner_id);
                        const newUser = users.find(u => u.user_id === newOwner?.owner_id);
                        const newName = newUser?.metadata?.team_name || newUser?.display_name || 'Team';
                        pickOwnership[rd + '-' + slot] = {
                            ownerName: newName,
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

            // Phase 5+: surface the upcoming draft's full settings so Solo mode
            // defaults can match the league's scheduled draft. Prefer the real
            // draft object; fall back to currentLeague.settings which always
            // has draft_rounds + num_teams on a synced Sleeper league.
            const legacyLeagueSettings = currentLeague?.settings || window.S?.leagues?.[0]?.settings || {};
            const upcomingSettings = upcoming ? {
                draftId: upcoming.draft_id,
                rounds: upcoming.settings?.rounds || legacyLeagueSettings.draft_rounds || null,
                teams:  upcoming.settings?.teams  || legacyLeagueSettings.num_teams || null,
                type:   upcoming.type || null,
                startTime: upcoming.start_time || null,
                status:  upcoming.status || null,
                season:  upcoming.season || null,
            } : (legacyLeagueSettings.draft_rounds || legacyLeagueSettings.num_teams ? {
                draftId: null,
                rounds: legacyLeagueSettings.draft_rounds || null,
                teams:  legacyLeagueSettings.num_teams || null,
                type:   null,
                startTime: null,
                status:  null,
                season:  null,
            } : null);

            return {
                mySlot: mySlot || Math.min(6, numTeams),
                slotToRoster,
                pickOwnership,
                numTeams,
                draftType: upcoming?.type || 'snake',
                upcomingSettings,
            };
        }, [myRoster, currentLeague, propRounds, fetchedDrafts]);

        // Reducer + initial state (load from localStorage if possible)
        const [state, dispatch] = React.useReducer(
            stateFns.reducer,
            null,
            () => {
                let saved = stateFns.loadFromLocal(currentLeague?.league_id || currentLeague?.id, forcedMode);
                if (saved && saved.phase !== 'setup') {
                    saved = refreshRookieValuesFromEngine(saved, stateFns, playersData);
                    // Recompose personas — we strip them on save, so rehydrate from the live DNA map
                    const leagueId = currentLeague?.league_id || currentLeague?.id || '';
                    let draftDnaMap = {};
                    try {
                        if (window.DraftHistory?.loadDraftDNA) {
                            draftDnaMap = window.DraftHistory.loadDraftDNA(leagueId) || {};
                        }
                    } catch (e) {}
                    saved.personas = window.DraftCC.persona.composeAllPersonas(leagueId, draftDnaMap);
                    // Old saves stripped originalPool; new saves preserve it.
                    if (!saved.originalPool || !saved.originalPool.length) {
                        saved.originalPool = saved.pool.slice();
                    }
                    // Re-apply the user's custom Big Board order on resume so changes
                    // to the board since the draft was saved are reflected immediately.
                    saved.pool = applyUserBigBoardOrder(saved.pool, leagueId, saved.variant);
                    return saved;
                }
                // Phase 5+: prefer the league's scheduled upcoming draft settings
                // so Solo defaults match whatever's actually scheduled in Sleeper.
                const upcoming = draftMeta.upcomingSettings;
                return stateFns.initialDraftState({
                    leagueId: currentLeague?.league_id || currentLeague?.id || '',
                    season: currentLeague?.season,
                    rounds: upcoming?.rounds || propRounds || 5,
                    leagueSize: upcoming?.teams || draftMeta.numTeams,
                    draftType: upcoming?.type || draftMeta.draftType || 'snake',
                    userRosterId: myRoster?.roster_id,
                    userSlot: draftMeta.mySlot,
                    // Honor forced mode (e.g., live-sync from the Follow Live Draft tab)
                    mode: forcedMode || 'solo',
                });
            }
        );

        // Resume banner is only shown when we're still in setup phase but have a saved draft
        const [showResume, setShowResume] = React.useState(false);

        // Phase 5+: sync setup defaults when draftMeta updates post-mount (e.g.
        // after the async Sleeper drafts fetch resolves). Only applies during
        // setup phase — we don't want to clobber an in-progress draft.
        const draftMetaSignature = draftMeta.mySlot + '|' + draftMeta.numTeams + '|' + (draftMeta.upcomingSettings?.rounds || '') + '|' + (draftMeta.upcomingSettings?.type || '');
        React.useEffect(() => {
            // Only sync when we're in setup — drafting/complete phases are locked in
            if (state.phase !== 'setup') return;
            const upcoming = draftMeta.upcomingSettings;
            const patch = {};
            if (draftMeta.mySlot && state.userSlot !== draftMeta.mySlot) patch.userSlot = draftMeta.mySlot;
            if (draftMeta.numTeams && state.leagueSize !== draftMeta.numTeams) patch.leagueSize = draftMeta.numTeams;
            if (upcoming?.rounds && state.rounds !== upcoming.rounds) patch.rounds = upcoming.rounds;
            if (upcoming?.type && state.draftType !== upcoming.type) patch.draftType = upcoming.type;
            if (Object.keys(patch).length) {
                dispatch({ type: 'SETUP_CHANGE', payload: patch });
            }
        }, [draftMetaSignature, state.phase]);

        const [viewport, setViewport] = React.useState(() => bpBucket());
        React.useEffect(() => {
            const onResize = () => setViewport(bpBucket());
            window.addEventListener('resize', onResize);
            return () => window.removeEventListener('resize', onResize);
        }, []);

        // Wait for CSV prospects to load (for rookie variant)
        const [csvReady, setCsvReady] = React.useState(window.DraftCC.scouting?.isLoaded || false);
        React.useEffect(() => {
            if (csvReady) return;
            let cancelled = false;
            window.DraftCC.scouting?.ready?.then(() => {
                if (!cancelled) setCsvReady(true);
            });
            return () => { cancelled = true; };
        }, [csvReady]);

        // Auto-save to localStorage (debounced 500ms)
        const saveTimerRef = React.useRef(null);
        React.useEffect(() => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                stateFns.saveToLocal(state, forcedMode);
            }, 500);
            return () => clearTimeout(saveTimerRef.current);
        }, [state]);

        // Current slot + whose turn is it
        // isUserTurn prefers rosterId match (post-trade ownership), but falls back
        // to teamIdx match for leagues where rosterId is null (e.g., unmapped slots).
        const currentSlot = state.pickOrder[state.currentIdx] || null;
        const liveStateRef = React.useRef(state);
        React.useEffect(() => {
            liveStateRef.current = state;
        }, [state]);
        const userIdx = (state.userSlot || 1) - 1;
        // In mock modes the user picks their slot via the dropdown, which doesn't
        // rewrite pickOrder rosterIds — the slot they picked still has some ghost
        // roster's ID. Match on slot number in those modes so the DRAFT button shows.
        const isMockMode = state.mode !== 'live-sync';
        const isUserTurn = state.phase === 'drafting' && !!currentSlot && (
            currentSlot.rosterId === state.userRosterId ||
            (isMockMode && currentSlot.slot === state.userSlot) ||
            (currentSlot.rosterId == null && currentSlot.teamIdx === userIdx)
        );
        const isDone = state.phase === 'complete';

        // CPU auto-pick loop
        const cpuTimerRef = React.useRef(null);
        React.useEffect(() => {
            if (state.phase !== 'drafting') return;
            if (state.mode === 'live-sync') return; // Live sync: picks come from Sleeper poll, not AI
            if (state.mode === 'manual') return; // Manual mode: user records every pick
            if (isUserTurn) return;
            if (isDone) return;
            if (state.speed === 'paused') return;
            if (state.overrideMode) return; // User is manually picking for the CPU team

            const delay = SpeedMap[state.speed] ?? 700;
            cpuTimerRef.current = setTimeout(() => {
                const slot = state.pickOrder[state.currentIdx];
                if (!slot || slot.rosterId === state.userRosterId) return;

                // Phase 5: Ghost replay mode — use historical pick instead of AI
                if (state.mode === 'ghost' && state.replay && state.replay.replayPicks) {
                    const replayPick = state.replay.replayPicks[state.currentIdx];
                    if (replayPick) {
                        dispatch({
                            type: 'MAKE_PICK',
                            player: {
                                pid: replayPick.pid,
                                name: replayPick.name,
                                pos: replayPick.pos,
                                dhq: replayPick.dhq,
                                photoUrl: replayPick.photoUrl,
                                college: replayPick.college,
                            },
                            isUser: false,
                            reasoning: replayPick.reasoning,
                            confidence: 1.0,
                        });
                        return;
                    }
                }

                const persona = state.personas?.[slot.rosterId] || null;
                const teamRoster = state.teamRosters?.[slot.teamIdx] || [];
                let pick = null;
                let reasoning = null;
                let confidence = null;
                try {
                    if (persona && window.DraftCC.cpuEngine) {
                        // Phase 1 deferred: inject GM mode weights into draft context so downstream
                        // MockEngine logic can bias BPA / youth / need per the user's chosen mode.
                        const gmCtx = (function () {
                            try {
                                const leagueId = (state.leagueId || window.S?.leagues?.[0]?.league_id);
                                const desc = window.WR?.GmMode?.describe?.(window.WR.GmMode.getMode(leagueId));
                                return desc ? { gmMode: desc.id, draftWeights: desc.draftWeights } : {};
                            } catch (_) { return {}; }
                        })();
                        const draftCtx = state.draftContext || null;
                        const result = window.DraftCC.cpuEngine.personaPick(
                            persona,
                            state.pool,
                            slot.round,
                            slot.overall,
                            Object.assign({
                                teamRoster,
                                draftTuning: state.draftTuning,
                                draftContext: draftCtx,
                                boardContext: draftCtx?.boardContext || null,
                                ownerIntel: persona?.ownerIntel || draftCtx?.ownerContext?.[String(slot.rosterId)] || null,
                            }, gmCtx)
                        );
                        if (result) {
                            pick = result.player;
                            reasoning = result.reasoning;
                            confidence = result.confidence;
                        }
                    }
                } catch (e) {
                    if (window.wrLog) window.wrLog('cc.cpuPick', e);
                }

                // Fallback: best DHQ
                if (!pick && state.pool.length) {
                    pick = state.pool[0];
                    reasoning = { primary: 'BPA fallback', baseVal: pick.dhq, nudges: [] };
                }

                if (pick) {
                    dispatch({ type: 'MAKE_PICK', player: pick, isUser: false, reasoning, confidence });
                }
            }, delay);

            return () => clearTimeout(cpuTimerRef.current);
        }, [state.phase, state.currentIdx, state.speed, state.mode, state.overrideMode, isUserTurn, isDone]);

        // ── Phase 3: CPU trade offer generation ──────────────────────
        // After each completed pick, roll for a trade offer. Cooldown prevents spam.
        const lastOfferIdxRef = React.useRef(-Infinity);
        const lastPickCountRef = React.useRef(0);
        React.useEffect(() => {
            if (state.phase !== 'drafting') return;
            if (state.mode === 'live-sync' || state.mode === 'manual') return;
            if (state.activeOffer) return;            // don't stack offers
            if (state.proposerDrawer) return;         // user is building their own
            if (state.picks.length === lastPickCountRef.current) return;
            lastPickCountRef.current = state.picks.length;

            const lastPick = state.picks[state.picks.length - 1];
            if (!lastPick || lastPick.isUser) return; // only after CPU picks

            // Small delay so the UI breathes between pick + offer
            const t = setTimeout(() => {
                try {
                    const offer = window.DraftCC.tradeSimulator?.maybeGenerateTradeOffer(
                        state,
                        lastPick.rosterId,
                        { lastOfferPickIdx: lastOfferIdxRef.current }
                    );
                    if (offer) {
                        lastOfferIdxRef.current = state.currentIdx;
                        dispatch({ type: 'OFFER_TRADE', offer });
                    }
                } catch (e) {
                    if (window.wrLog) window.wrLog('cc.tradeGen', e);
                }
            }, 300);

            return () => clearTimeout(t);
        }, [state.currentIdx, state.phase, state.mode, state.activeOffer, state.proposerDrawer]);

        // ── Phase 5: Live Sync polling loop ─────────────────────────
        // When mode==='live-sync' and phase==='drafting', start polling the
        // Sleeper draft every 5s. Each new pick is converted to our state.pick
        // shape and dispatched as MAKE_PICK so the rest of the pipeline (grid,
        // Alex stream, reach/steal detection) reacts normally.
        //
        // Strictly read-only — never writes picks back to Sleeper.
        React.useEffect(() => {
            if (state.mode !== 'live-sync') return;
            if (state.phase !== 'drafting') return;
            if (!state.sleeperDraftId) return;
            if (!window.DraftCC.liveSync) return;

            const normPos = window.App?.normPos || (p => p);
            const getDHQ = (pid) => window.App?.LI?.playerScores?.[pid] || 0;

            const initialPickNo = Math.max(
                Number(state.liveSync?.lastPickNo || 0),
                Number(state.currentIdx || 0)
            );
            const seenPickKeys = (state.picks || [])
                .map(p => p.sleeperPickNo ? ('no:' + p.sleeperPickNo) : null)
                .filter(Boolean);

            window.DraftCC.liveSync.start(state.sleeperDraftId, (sleeperPicks, snapshot) => {
                const active = liveStateRef.current || state;
                const activePlayersData = window.S?.players || {};
                const mapped = (sleeperPicks || []).map(sleeperPick => {
                    const pid = sleeperPick.player_id;
                    const p = activePlayersData[pid] || {};
                    const poolMatch = (active.pool || []).find(x => String(x.pid) === String(pid))
                        || (active.originalPool || []).find(x => String(x.pid) === String(pid));
                    const player = {
                        pid,
                        name: poolMatch?.name || p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || 'Unknown',
                        pos: poolMatch?.pos || normPos(p.position) || p.position || '?',
                        dhq: poolMatch?.dhq || getDHQ(pid),
                        consensusRank: poolMatch?.consensusRank || null,
                        photoUrl: poolMatch?.photoUrl || ('https://sleepercdn.com/content/nfl/players/thumb/' + pid + '.jpg'),
                        college: poolMatch?.college || p.college || '',
                        tier: poolMatch?.tier || null,
                        csv: poolMatch?.csv || null,
                    };
                    return {
                        sleeperPick,
                        player,
                        reasoning: { primary: 'Live Sleeper pick', baseVal: player.dhq, nudges: [] },
                        confidence: 1.0,
                    };
                });
                dispatch({
                    type: 'APPLY_LIVE_SYNC_PICKS',
                    picks: mapped,
                    status: {
                        status: snapshot?.draftStatus === 'complete' ? 'complete' : 'mirroring',
                        draftStatus: snapshot?.draftStatus || '',
                        remotePickCount: snapshot?.remotePickCount || 0,
                        lastPickNo: snapshot?.lastPickNo || initialPickNo,
                        duplicateCount: snapshot?.duplicateCount || 0,
                        lastPollAt: Date.now(),
                        stale: false,
                        error: null,
                    },
                });
            }, {
                initialPickNo,
                seenPickKeys,
                onStatus: status => dispatch({ type: 'LIVE_SYNC_STATUS', payload: status }),
            });

            return () => {
                if (window.DraftCC.liveSync?.isRunning?.()) {
                    window.DraftCC.liveSync.stop();
                }
            };
        }, [state.mode, state.phase, state.sleeperDraftId, state.userRosterId]);

        // ── Live-Sync variant auto-correction ──────────────────────────
        // When resuming a live-sync draft, the saved state's `variant` can be
        // stale if the user initially selected it before we started auto-detecting
        // rookie drafts. Fetch the Sleeper draft meta once and, if it indicates a
        // rookie draft but we're still on startup, rebuild the pool.
        //
        // Only rebuilds when picks.length === 0 — we refuse to clobber a pool
        // that already has picks dispatched against it.
        const variantFixedRef = React.useRef(false);
        React.useEffect(() => {
            if (state.mode !== 'live-sync') return;
            if (!state.sleeperDraftId) return;
            if (state.phase === 'setup') return;
            if (variantFixedRef.current) return;
            variantFixedRef.current = true;

            (async () => {
                try {
                    const resp = await fetch('https://api.sleeper.app/v1/draft/' + state.sleeperDraftId);
                    if (!resp.ok) return;
                    const meta = await resp.json();
                    const playerType = meta?.settings?.player_type;
                    const rounds = meta?.settings?.rounds || 0;
                    const descr = (meta?.metadata?.description || meta?.metadata?.name || '').toLowerCase();
                    const looksRookie = playerType === 1
                        || /rookie/.test(descr)
                        || (rounds > 0 && rounds <= 6);
                    if (!looksRookie) return;
                    if (state.variant === 'rookie') return;
                    if (state.picks && state.picks.length > 0) {
                        if (window.wrLog) window.wrLog('cc.variantMismatch', { sleeperDraftId: state.sleeperDraftId, saved: state.variant, detected: 'rookie', picks: state.picks.length });
                        return;
                    }
                    const leagueId = currentLeague?.league_id || currentLeague?.id || '';
                    let newPool = stateFns.buildPool({ variant: 'rookie', playersData, maxSize: 200 });
                    newPool = applyUserBigBoardOrder(newPool, leagueId, 'rookie');
                    dispatch({ type: 'SETUP_CHANGE', payload: { variant: 'rookie', pool: newPool, originalPool: newPool.slice() } });
                } catch (e) {
                    if (window.wrLog) window.wrLog('cc.variantAutoCorrect', e);
                }
            })();
        }, [state.mode, state.sleeperDraftId, state.phase]);

        // ── Phase 4: Alex AI trigger effects ────────────────────────
        // Fires rule-based events (always free) and Sonnet AI events (budget-limited)
        // after each completed pick. Triggers: R1 pick, user pick, reach/steal, round change.
        const lastAlexPickCountRef = React.useRef(0);
        const lastAlexRoundRef = React.useRef(0);
        const alexSonnetCooldownRef = React.useRef(0);
        React.useEffect(() => {
            if (state.phase !== 'drafting') return;
            if (state.picks.length === lastAlexPickCountRef.current) return;
            const prevCount = lastAlexPickCountRef.current;
            lastAlexPickCountRef.current = state.picks.length;

            const lastPick = state.picks[state.picks.length - 1];
            if (!lastPick) return;
            const projectedAlexRead = lastPick.alexCommentary?.streamText || lastPick.reasoning?.alexCommentary?.streamText || '';

            // Round change banner (rule-triggered, free)
            if (lastPick.round !== lastAlexRoundRef.current && lastAlexRoundRef.current > 0) {
                dispatch({
                    type: 'ALEX_EVENT_ADD',
                    event: {
                        type: 'rule',
                        badge: 'R',
                        color: 'var(--gold)',
                        title: 'Round ' + lastPick.round + ' begins',
                        text: state.pickOrder.length - state.currentIdx + ' picks remain.',
                        relatedPickNo: lastPick.overall,
                    },
                });
            }
            lastAlexRoundRef.current = lastPick.round;

            // Pick line (rule-triggered, free) — every pick gets a line
            dispatch({
                type: 'ALEX_EVENT_ADD',
                event: {
                    type: projectedAlexRead ? 'ai' : (lastPick.isUser ? 'user' : 'rule'),
                    badge: projectedAlexRead ? 'A' : (lastPick.isUser ? '★' : '•'),
                    color: projectedAlexRead ? 'var(--gold)' : (lastPick.isUser ? 'var(--gold)' : 'var(--silver)'),
                    title: projectedAlexRead
                        ? 'Alex read · R' + lastPick.round + '.' + String(lastPick.slot).padStart(2, '0') + ' · ' + lastPick.name
                        : 'R' + lastPick.round + '.' + String(lastPick.slot).padStart(2, '0') + ' · ' + lastPick.name,
                    text: projectedAlexRead || ((lastPick.isUser ? 'You selected ' : '') + lastPick.pos + (lastPick.dhq > 0 ? ' · ' + lastPick.dhq.toLocaleString() + ' DHQ' : '')),
                    relatedPickNo: lastPick.overall,
                },
            });

            // Reach/steal detection (rule-triggered, free)
            if (lastPick.consensusRank && Math.abs(lastPick.overall - lastPick.consensusRank) > 8) {
                const isSteal = lastPick.overall > lastPick.consensusRank;
                dispatch({
                    type: 'ALEX_EVENT_ADD',
                    event: {
                        type: 'rule',
                        badge: isSteal ? '↓' : '↑',
                        color: isSteal ? '#2ECC71' : '#E74C3C',
                        title: (isSteal ? 'STEAL' : 'REACH') + ' · ' + lastPick.name,
                        text: lastPick.pos + ' taken at pick #' + lastPick.overall + ' vs. consensus #' + Math.round(lastPick.consensusRank),
                        relatedPickNo: lastPick.overall,
                    },
                });
            }

            // Sonnet AI event (budget-limited)
            // Triggers: R1 pick, user pick, reach beyond threshold
            // Throttle: at most once per 3 picks
            const sonnetUsed = state.alex.alexSpend.sonnet || 0;
            const budget = state.alex.alexSpend.budget || 12;
            const shouldFireAI =
                sonnetUsed < budget &&
                (state.currentIdx - alexSonnetCooldownRef.current >= 3 || lastPick.isUser) &&
                (
                    lastPick.round === 1 ||              // R1 pick
                    lastPick.isUser ||                   // user's own pick
                    (lastPick.consensusRank && Math.abs(lastPick.overall - lastPick.consensusRank) > 10)  // big reach/steal
                );

            if (shouldFireAI && typeof window.dhqAI === 'function') {
                alexSonnetCooldownRef.current = state.currentIdx;
                const persona = state.personas?.[lastPick.rosterId];
                const reasoning = lastPick.reasoning || {};
                const nudgesText = (reasoning.nudges || []).slice(0, 3).map(n => n.name + ' ' + (n.pct >= 0 ? '+' : '') + n.pct + '%').join(', ');
                const userPersona = state.personas?.[state.userRosterId];
                const ownerIntelText = window.DraftCC?.context?.summarizeOwnerIntel
                    ? window.DraftCC.context.summarizeOwnerIntel(persona?.ownerIntel || state.draftContext?.ownerContext?.[String(lastPick.rosterId)])
                    : '';
                const contextLines = [
                    `Draft pick: ${lastPick.name} (${lastPick.pos}) at R${lastPick.round}.${String(lastPick.slot).padStart(2, '0')}, overall #${lastPick.overall}.`,
                    `By: ${persona?.teamName || 'Team ' + lastPick.teamIdx}, DNA: ${persona?.draftDna?.label || '—'}, Trade DNA: ${persona?.tradeDna?.label || '—'}, Posture: ${persona?.posture?.label || '—'}.`,
                    ownerIntelText ? `Owner intel: ${ownerIntelText}.` : '',
                    nudgesText ? `Picker reasoning: ${nudgesText}.` : '',
                    lastPick.isUser ? `THIS IS THE USER'S OWN PICK. Grade it for them honestly.` : '',
                    userPersona ? `User's team needs: ${(userPersona.assessment?.needs || []).slice(0, 3).map(n => typeof n === 'string' ? n : n?.pos).join(', ')}.` : '',
                ].filter(Boolean).join(' ');

                dispatch({ type: 'ALEX_SET_THINKING', thinking: true });
                dispatch({ type: 'ALEX_SPEND_SONNET' });

                const prompt = lastPick.isUser
                    ? `React to the user's draft pick in 1-2 sentences. Be Alex the draft analyst — direct, punchy, in character. Say if it's a good fit, a reach, or a steal. Context: ${contextLines}`
                    : `React to this draft pick in 1-2 sentences as Alex the draft analyst. Tell the user what this pick reveals about the opposing team's strategy. Context: ${contextLines}`;

                const messages = [{ role: 'user', content: prompt }];
                window.dhqAI('pick-analysis', prompt, contextLines, { messages })
                    .then(response => {
                        const replyText = typeof response === 'string' ? response : (response?.content || response?.text || '');
                        if (!replyText) return;
                        dispatch({
                            type: 'ALEX_EVENT_ADD',
                            event: {
                                type: 'ai',
                                badge: '✦',
                                color: 'var(--gold)',
                                title: lastPick.isUser ? 'Alex grades your pick' : 'Alex · ' + (persona?.teamName || 'CPU') + ' take',
                                text: replyText.slice(0, 350),
                                relatedPickNo: lastPick.overall,
                            },
                        });
                    })
                    .catch(e => {
                        if (window.wrLog) window.wrLog('alex.pickAnalysis', e);
                    })
                    .finally(() => {
                        dispatch({ type: 'ALEX_SET_THINKING', thinking: false });
                    });
            }
        }, [state.picks.length, state.phase]);

        // ── P2E: Live trade-window readout ─────────────────────────────
        // Live drafts stay read-only, but Alex should still flag actionable
        // windows based on owner intel, remaining picks, and buyer-line odds.
        const liveTradeAlertRef = React.useRef('');
        React.useEffect(() => {
            if (state.mode !== 'live-sync') return;
            if (state.phase !== 'drafting') return;
            const windows = window.DraftCC.tradeSimulator?.buildLiveTradeWindows?.(state, { lookahead: 5 }) || [];
            const best = windows[0];
            if (!best) return;
            const alertFloor = Math.max((best.acceptanceLine || 70) - 8, best.suggestion?.evaluation?.counterLine || 0);
            if ((best.likelihood || 0) < alertFloor) return;
            const key = [state.currentIdx, best.rosterId, best.suggestion?.id].join(':');
            if (liveTradeAlertRef.current === key) return;
            liveTradeAlertRef.current = key;

            const clears = best.likelihood >= best.acceptanceLine;
            dispatch({
                type: 'ALEX_EVENT_ADD',
                event: {
                    type: 'rule',
                    badge: 'T',
                    color: clears ? '#2ECC71' : 'var(--gold)',
                    title: 'Live trade window · ' + best.teamName,
                    text: describeLiveTradeWindow(best) + ' ' + (clears ? 'This clears their line.' : 'This is close enough to stage before the room moves.'),
                    relatedPickNo: best.overall || null,
                },
            });
        }, [state.mode, state.phase, state.currentIdx, state.pickOrder, state.personas, state.tradedAssets, state.draftTuning, state.picks.length]);

        // ── Actions ──────────────────────────────────────────────────
        const onStartDraft = React.useCallback(async () => {
            const leagueId = currentLeague?.league_id || currentLeague?.id || '';

            let pool = stateFns.buildPool({
                variant: state.variant,
                playersData,
                maxSize: 200,
            });
            pool = applyUserBigBoardOrder(pool, leagueId, state.variant);
            const originalPool = pool.slice();
            let pickOrder = stateFns.buildPickOrder(
                state.rounds,
                state.leagueSize,
                state.draftType,
                draftMeta.slotToRoster,
                draftMeta.pickOwnership
            );
            if (state.mode !== 'live-sync' && state.userRosterId != null) {
                const selectedSlotInfo = draftMeta.slotToRoster?.[state.userSlot] || {};
                pickOrder = pickOrder.map(p => {
                    if (p.slot === state.userSlot) {
                        return { ...p, rosterId: state.userRosterId, ownerName: 'YOU', traded: p.traded };
                    }
                    if (draftMeta.mySlot && p.slot === draftMeta.mySlot && draftMeta.mySlot !== state.userSlot) {
                        return {
                            ...p,
                            rosterId: selectedSlotInfo.rosterId || p.rosterId,
                            ownerName: selectedSlotInfo.ownerName || p.ownerName,
                        };
                    }
                    return p;
                });
            }

            // Compose personas
            let draftDnaMap = {};
            try {
                if (window.DraftHistory?.loadDraftDNA) {
                    draftDnaMap = window.DraftHistory.loadDraftDNA(leagueId) || {};
                }
            } catch (e) {}
            const personas = window.DraftCC.persona.composeAllPersonas(leagueId, draftDnaMap);

            // P2: analyst projected mock scenario handoff. Stages projected
            // picks before the user's first turn so they can rehearse the room.
            let prePicks = [];
            let narrative = null;
            if (state.mode === 'scenario' && state.analystScenario?.picks?.length && window.DraftCC.analystMock?.applyProjectedScenario) {
                const result = window.DraftCC.analystMock.applyProjectedScenario(state, pool, pickOrder, state.analystScenario);
                if (result) {
                    pool = result.pool;
                    pickOrder = result.pickOrder;
                    prePicks = result.prePicks || [];
                    narrative = result.narrative;
                }
            } else if (state.mode === 'scenario' && state.scenarioId) {
                const result = window.DraftCC.scenarios?.applyScenario(state, pool, pickOrder, state.scenarioId);
                if (result) {
                    pool = result.pool;
                    pickOrder = result.pickOrder;
                    prePicks = result.prePicks || [];
                    narrative = result.narrative;
                }
            }

            // Phase 5: ghost replay — fetch picks and stage them
            let replay = null;
            if (state.mode === 'ghost') {
                if (!state.sleeperDraftId) {
                    alert('Ghost Replay mode requires selecting a draft from the Replay Source list.');
                    return;
                }
                try {
                    const sleeperPicks = await window.DraftCC.ghostReplay.loadReplayPicks(state.sleeperDraftId);
                    if (sleeperPicks.length) {
                        replay = window.DraftCC.ghostReplay.buildReplayState(state, sleeperPicks);
                        narrative = '👻 GHOST REPLAY · ' + sleeperPicks.length + ' picks loaded. Use the scrubber to time-travel.';
                    } else {
                        alert('The selected draft has no picks yet — nothing to replay. Pick a completed draft, or try Live Sync mode for a draft in progress.');
                        return;
                    }
                } catch (e) {
                    if (window.wrLog) window.wrLog('cc.ghostLoad', e);
                    alert('Failed to fetch draft picks from Sleeper: ' + (e?.message || 'unknown error'));
                    return;
                }
            }

            // Phase 5: live sync — validate that a draft was picked
            let liveDraftStatus = '';
            if (state.mode === 'live-sync') {
                if (!state.sleeperDraftId) {
                    alert('Live Sync mode requires selecting an upcoming or in-progress draft from the Live Sync Source list.');
                    return;
                }
                liveDraftStatus = state.liveDraftMeta?.status || '';
                narrative = liveDraftStatus === 'pre_draft'
                    ? '📡 LIVE SYNC · Waiting room open. War Room will mirror Sleeper as soon as picks begin.'
                    : '📡 LIVE SYNC · Mirroring draft from Sleeper every 5s. Read-only — no picks are sent back.';
            }

            const draftContext = window.DraftCC?.context?.buildDraftContext
                ? window.DraftCC.context.buildDraftContext({
                    state: {
                        ...state,
                        phase: 'drafting',
                        pool,
                        pickOrder,
                        personas,
                        picks: prePicks,
                        currentIdx: prePicks.length,
                    },
                    currentLeague,
                    myRoster,
                    playersData,
                    pool,
                    pickOrder,
                    personas,
                    draftMeta,
                })
                : null;

            dispatch({
                type: 'START_DRAFT',
                pool,
                pickOrder,
                personas,
                draftContext,
                originalPool,
                prePicks,
                narrative,
                replay,
                liveDraftStatus,
            });

            // Phase 2: async DraftHistory sync (mirrors Scout draft-ui.js:1977)
            if (window.DraftHistory?.syncDraftDNA && leagueId) {
                window.DraftHistory.syncDraftDNA(leagueId).then(map => {
                    if (!map) return;
                    const normalize = window.DraftCC.persona.normalizeDraftDna;
                    const payload = {};
                    Object.entries(map).forEach(([rid, raw]) => {
                        payload[rid] = normalize(raw);
                    });
                    dispatch({ type: 'MERGE_DRAFT_DNA', payload });
                }).catch(() => { /* ok, fallback persists */ });
            }
        }, [
            state.variant,
            state.rounds,
            state.leagueSize,
            state.draftType,
            state.userRosterId,
            state.userSlot,
            state.mode,
            state.scenarioId,
            state.sleeperDraftId,
            state.draftTuning,
            draftMeta,
            playersData,
            currentLeague,
        ]);

        // ── Phase 2: predictions refresh ────────────────────────────
        // Recompute willReach / willPassOn / likelyPick for every persona
        // at the start of each round. Cached per round in draftState.personas[rid].predictions.
        const lastPredRoundRef = React.useRef(-1);
        const personaSignature = Object.keys(state.personas || {}).length;
        React.useEffect(() => {
            if (state.phase !== 'drafting') return;
            if (!currentSlot) return;
            const round = currentSlot.round;
            if (round === lastPredRoundRef.current) return;
            if (!personaSignature) return;

            lastPredRoundRef.current = round;
            const payload = {};
            Object.entries(state.personas).forEach(([rid, persona]) => {
                try {
                    const draftCtx = state.draftContext || null;
                    const preds = window.DraftCC.cpuEngine.computePredictions(
                        persona,
                        state.pool,
                        round,
                        currentSlot.overall,
                        {
                            draftTuning: state.draftTuning,
                            draftContext: draftCtx,
                            boardContext: draftCtx?.boardContext || null,
                            ownerIntel: persona?.ownerIntel || draftCtx?.ownerContext?.[String(rid)] || null,
                        }
                    );
                    payload[rid] = preds;
                } catch (e) {
                    if (window.wrLog) window.wrLog('cc.computePreds', e);
                }
            });
            if (Object.keys(payload).length) {
                dispatch({ type: 'UPDATE_PREDICTIONS', payload, round });
            }
        }, [state.phase, currentSlot?.round, personaSignature]);

        const onExit = React.useCallback(() => {
            // Phase 5: stop live-sync polling if it's running
            if (window.DraftCC.liveSync?.isRunning?.()) {
                window.DraftCC.liveSync.stop();
            }
            stateFns.clearLocal(currentLeague?.league_id || currentLeague?.id, forcedMode);
            dispatch({ type: 'RESET' });
            setShowResume(false);
        }, [currentLeague]);

        const onResumeYes = React.useCallback(() => {
            setShowResume(false);
            // Rebuild personas (we don't persist them)
            const leagueId = currentLeague?.league_id || currentLeague?.id || '';
            let draftDnaMap = {};
            try {
                if (window.DraftHistory?.loadDraftDNA) {
                    draftDnaMap = window.DraftHistory.loadDraftDNA(leagueId) || {};
                }
            } catch (e) {}
            const personas = window.DraftCC.persona.composeAllPersonas(leagueId, draftDnaMap);
            const draftContext = window.DraftCC?.context?.buildDraftContext
                ? window.DraftCC.context.buildDraftContext({
                    state: { ...state, personas },
                    currentLeague,
                    myRoster,
                    playersData,
                    pool: state.pool,
                    pickOrder: state.pickOrder,
                    personas,
                    draftMeta,
                })
                : state.draftContext || null;
            dispatch({ type: 'HYDRATE', state: { personas, originalPool: state.originalPool?.length ? state.originalPool : state.pool.slice(), draftContext } });
        }, [currentLeague, myRoster, playersData, draftMeta, state]);

        const onResumeNo = React.useCallback(() => {
            stateFns.clearLocal(currentLeague?.league_id || currentLeague?.id, forcedMode);
            dispatch({ type: 'RESET' });
            setShowResume(false);
        }, [currentLeague]);

        // Phase 3: open the trade proposer drawer for a given CPU roster
        const onPropose = React.useCallback((rosterId) => {
            if (!rosterId || String(rosterId) === String(state.userRosterId)) return;
            dispatch({ type: 'OPEN_PROPOSER', targetRosterId: rosterId });
        }, [state.userRosterId]);

        // ── Render ───────────────────────────────────────────────────
        // Mobile redirect
        if (viewport === 'mobile') {
            return <MobileFeed state={state} dispatch={dispatch} onStart={onStartDraft} isUserTurn={isUserTurn} currentSlot={currentSlot} />;
        }

        // Setup phase
        if (state.phase === 'setup') {
            return (
                <SetupScreen
                    state={state}
                    dispatch={dispatch}
                    draftMeta={draftMeta}
                    playersData={playersData}
                    currentLeague={currentLeague}
                    myRoster={myRoster}
                    csvReady={csvReady}
                    showResume={showResume}
                    onStartDraft={onStartDraft}
                    onResumeYes={onResumeYes}
                    onResumeNo={onResumeNo}
                    forcedMode={forcedMode}
                />
            );
        }

        // Drafting / complete phase → Command Center grid
        return (
            <CommandCenterGrid
                state={state}
                dispatch={dispatch}
                isUserTurn={isUserTurn}
                currentSlot={currentSlot}
                onExit={onExit}
                onPropose={onPropose}
                viewport={viewport}
            />
        );
    }

    // ── Setup screen ─────────────────────────────────────────────────
    function SetupScreen({ state, dispatch, draftMeta, playersData, currentLeague, myRoster, csvReady, showResume, onStartDraft, onResumeYes, onResumeNo, forcedMode }) {
        const [showOther, setShowOther] = React.useState(false);
        const selStyle = {
            width: '100%',
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '6px',
            color: 'var(--white)',
            fontSize: '0.82rem',
            fontFamily: FONT_UI,
            outline: 'none',
            cursor: 'pointer',
        };

        const update = (patch) => dispatch({ type: 'SETUP_CHANGE', payload: patch });
        const upcoming = draftMeta.upcomingSettings || null;
        const totalPicks = (state.rounds || 0) * (state.leagueSize || 0);
        const poolCount = state.variant === 'rookie'
            ? (window.getProspects?.()?.length || state.pool?.length || 0)
            : (state.pool?.length || Object.keys(window.App?.LI?.playerScores || {}).length || 0);
        const previewOrder = window.DraftCC?.state?.buildPickOrder
            ? window.DraftCC.state.buildPickOrder(state.rounds, state.leagueSize, state.draftType, draftMeta.slotToRoster || {}, draftMeta.pickOwnership || {})
            : [];
        const ownedPreview = previewOrder.filter(p => Number(p.rosterId) === Number(state.userRosterId)).slice(0, 6);
        const userPickPreview = ownedPreview.length ? ownedPreview : previewOrder.filter(p => Number(p.slot) === Number(state.userSlot)).slice(0, 6);
        const slotOwner = draftMeta.slotToRoster?.[state.userSlot]?.ownerName || (state.userSlot === draftMeta.mySlot ? 'You' : 'Team ' + state.userSlot);
        const fallbackPickPreview = Array.from({ length: Math.min(6, state.rounds || 0) }, (_, i) => {
            const round = i + 1;
            const slot = state.draftType === 'snake' && round % 2 === 0 ? state.leagueSize - state.userSlot + 1 : state.userSlot;
            return { round, slot, overall: ((round - 1) * state.leagueSize) + slot, ownerName: slotOwner, traded: false };
        });
        const pickPreviewRows = userPickPreview.length ? userPickPreview : fallbackPickPreview;
        const variantLabels = {
            startup: 'Startup pool',
            rookie: 'Rookie pool',
            redraft: 'Redraft pool',
            best_ball: 'Bestball pool',
        };
        const poolChoices = [
            { id: 'startup', label: 'startup', sub: 'DHQ-ranked dynasty board' },
            { id: 'rookie', label: 'rookie', sub: csvReady ? (window.getProspects?.()?.length || 0) + ' prospects loaded' : 'loading CSV...' },
            { id: 'redraft', label: 'redraft', sub: 'current-season adapter' },
            { id: 'best_ball', label: 'bestball', sub: 'ceiling + stack adapter' },
        ];
        const setupSummary = [
            variantLabels[state.variant] || 'Startup pool',
            state.draftType === 'snake' ? 'Snake draft' : 'Linear draft',
            state.rounds + ' rounds',
            state.leagueSize + ' teams',
        ].join(' - ');
        const paceLabel = state.mode === 'manual'
            ? 'manual entry'
            : state.mode === 'live-sync'
                ? 'Sleeper mirror'
                : state.speed + ' CPU';

        return (
            <div className="draft-setup-shell">
                {showResume && (
                    <div style={{
                        padding: '12px 16px',
                        background: 'linear-gradient(90deg, rgba(212,175,55,0.12), rgba(212,175,55,0.02))',
                        border: '1px solid rgba(212,175,55,0.35)',
                        borderRadius: '8px',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', marginBottom: '2px' }}>Resume draft in progress?</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)' }}>
                                {state.picks.length} picks made - Round {state.pickOrder[state.currentIdx]?.round || '?'}
                            </div>
                        </div>
                        <button onClick={onResumeYes} style={{ padding: '6px 16px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '5px', fontWeight: 700, cursor: 'pointer', fontSize: '0.76rem', fontFamily: FONT_UI }}>Resume</button>
                        <button onClick={onResumeNo} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.74rem', fontFamily: FONT_UI }}>Discard</button>
                    </div>
                )}

                <div className="draft-setup-head">
                    <h2 style={{ color: forcedMode === 'live-sync' ? 'rgba(155,138,251,1)' : 'var(--gold)' }}>
                        {forcedMode === 'live-sync' ? 'FOLLOW LIVE DRAFT' : 'MOCK DRAFT CENTER'}
                    </h2>
                    <p>{forcedMode === 'live-sync' ? 'Read-only Sleeper mirror with War Room draft intelligence.' : 'Configure the draft, preview your pick path, then launch the command center.'}</p>
                </div>

                {forcedMode === 'live-sync' && (
                    <div className="draft-setup-panel" style={{ marginBottom: 12, borderColor: 'rgba(124,107,248,0.26)' }}>
                        <LiveSyncDraftPicker state={state} update={update} leagueId={state.leagueId} />
                        {state.sleeperDraftId && (
                            <div className="draft-setup-note" style={{ marginTop: 8 }}>
                                Read-only mirror. If the Sleeper room has not started, Start Mirror opens a waiting room and begins polling without making picks.
                            </div>
                        )}
                    </div>
                )}

                {!forcedMode && state.mode === 'scenario' && <ScenarioPicker state={state} update={update} />}
                {!forcedMode && state.mode === 'ghost' && <GhostDraftPicker state={state} update={update} leagueId={state.leagueId} />}

                <div className="draft-setup-grid">
                    <section className="draft-setup-panel">
                        {state.mode === 'solo' && upcoming && (upcoming.rounds || upcoming.teams) && (
                            <div className="draft-setup-match">
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ECC71', flexShrink: 0 }} />
                                <div>
                                    <strong>Mocking your upcoming draft</strong>
                                    <span>{upcoming.type || 'snake'} - {upcoming.rounds || '?'}R x {upcoming.teams || '?'}T{upcoming.startTime ? ' - ' + new Date(upcoming.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
                                </div>
                            </div>
                        )}

                        <div className="draft-setup-label">Pool Type</div>
                        <div className="draft-setup-choice" style={{ marginTop: 6, marginBottom: 12, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                            {poolChoices.map(choice => (
                                <button key={choice.id} type="button" className={state.variant === choice.id ? 'is-active' : ''} onClick={() => update({ variant: choice.id })}>
                                    {choice.label}
                                    <span>{choice.sub}</span>
                                </button>
                            ))}
                        </div>

                        <div className="draft-setup-form">
                            <div className="draft-setup-two">
                                <div>
                                    <div className="draft-setup-label">Draft Rounds</div>
                                    <select value={state.rounds} onChange={e => update({ rounds: +e.target.value })} style={selStyle}>
                                        {[3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 23, 25].map(v => <option key={v} value={v} style={{ background: '#111' }}>{v} rounds</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="draft-setup-label">League Size</div>
                                    <select value={state.leagueSize} onChange={e => {
                                        const n = +e.target.value;
                                        update({ leagueSize: n, userSlot: Math.min(state.userSlot, n) });
                                    }} style={selStyle}>
                                        {(() => {
                                            const standard = [8, 10, 12, 14, 16, 20, 24, 28, 32];
                                            const opts = new Set(standard);
                                            if (state.leagueSize) opts.add(state.leagueSize);
                                            return [...opts].sort((a, b) => a - b).map(v => <option key={v} value={v} style={{ background: '#111' }}>{v} teams</option>);
                                        })()}
                                    </select>
                                </div>
                            </div>
                            <div className="draft-setup-two">
                                <div>
                                    <div className="draft-setup-label">Your Draft Position</div>
                                    <select value={state.userSlot} onChange={e => update({ userSlot: +e.target.value })} style={selStyle}>
                                        {Array.from({ length: state.leagueSize }, (_, i) => {
                                            const slot = i + 1;
                                            const info = draftMeta.slotToRoster[slot];
                                            const isMine = slot === draftMeta.mySlot;
                                            const ownerLabel = info?.ownerName ? ' - ' + info.ownerName : '';
                                            return <option key={slot} value={slot} style={{ background: '#111' }}>{slot}.01{ownerLabel}{isMine ? ' (YOU)' : ''}</option>;
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <div className="draft-setup-label">Draft Type</div>
                                    <select value={state.draftType} onChange={e => update({ draftType: e.target.value })} style={selStyle}>
                                        <option value="snake" style={{ background: '#111' }}>Snake</option>
                                        <option value="linear" style={{ background: '#111' }}>Linear</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="draft-setup-panel">
                        <div className="draft-hq-panel-head">
                            <span>Pick Path Preview</span>
                            <em>{setupSummary}</em>
                        </div>
                        <div className="draft-setup-kpis">
                            <div><span>Your slot</span><strong>{state.userSlot} of {state.leagueSize}</strong><em>{slotOwner}</em></div>
                            <div><span>Total picks</span><strong>{totalPicks}</strong><em>{state.rounds} rounds</em></div>
                            <div><span>Pool</span><strong>{poolCount || '--'}</strong><em>{state.variant === 'rookie' ? 'prospects' : 'players'}</em></div>
                            <div><span>Format</span><strong>{state.draftType}</strong><em>{paceLabel}</em></div>
                        </div>
                        <div className="draft-setup-label" style={{ marginBottom: 6 }}>Your first picks</div>
                        <div className="draft-setup-timeline">
                            {pickPreviewRows.map((p, i) => (
                                <div key={p.round + '-' + p.slot + '-' + i}>
                                    <strong>{p.round}.{String(p.slot).padStart(2, '0')}</strong>
                                    <span>Overall {p.overall} - {p.ownerName || slotOwner}</span>
                                    <em>{p.traded ? 'acquired' : 'native'}</em>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="draft-setup-panel is-start">
                        <div className="draft-hq-panel-head">
                            <span>Simulation Controls</span>
                            <em>{state.mode}</em>
                        </div>
                        {state.mode !== 'manual' ? (
                            <>
                                <div className="draft-setup-label">CPU Speed</div>
                                <div className="draft-setup-speed">
                                    {['slow', 'medium', 'fast'].map(v => (
                                        <button key={v} type="button" className={state.speed === v ? 'is-active' : ''} onClick={() => update({ speed: v })}>{v}</button>
                                    ))}
                                </div>
                                <DraftTuningControls state={state} update={update} />
                            </>
                        ) : (
                            <div className="draft-setup-note">
                                Manual entry records the room pick by pick without CPU autopicks.
                            </div>
                        )}
                        <div className="draft-setup-note" style={{ marginTop: 10 }}>
                            {setupSummary}. The command center will use owner DNA, needs, draft history, and your saved Big Board order.
                        </div>
                        <button
                            type="button"
                            className="draft-setup-start"
                            onClick={onStartDraft}
                            disabled={state.variant === 'rookie' && !csvReady}
                            style={{
                                background: state.variant === 'rookie' && !csvReady ? 'rgba(212,175,55,0.3)' : (forcedMode === 'live-sync' ? '#9b8afb' : 'var(--gold)'),
                                color: forcedMode === 'live-sync' ? '#fff' : 'var(--black)',
                                borderColor: state.variant === 'rookie' && !csvReady ? 'rgba(212,175,55,0.3)' : (forcedMode === 'live-sync' ? '#9b8afb' : 'var(--gold)'),
                            }}
                        >
                            {state.variant === 'rookie' && !csvReady ? 'LOADING PROSPECTS...' : (forcedMode === 'live-sync' ? 'START MIRROR' : 'START DRAFT')}
                        </button>

                        {!forcedMode && (
                            <div className="draft-setup-secondary">
                                <button type="button" onClick={() => setShowOther(v => !v)}>
                                    <span>{showOther ? 'Hide other mock options' : 'Other mock options'}</span>
                                    <span>{state.mode === 'manual' ? 'Manual room active' : state.mode === 'scenario' ? 'Scenario active' : state.mode === 'ghost' ? 'Ghost active' : 'Manual - Scenarios - Ghost replay - Templates'}</span>
                                </button>
                                {showOther && (
                                    <div className="draft-setup-other">
                                        <ModeSelector state={state} update={update} />
                                        <TemplateLoader state={state} dispatch={dispatch} />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
                {!forcedMode && (
                    <AnalystMockPanel
                        state={state}
                        dispatch={dispatch}
                        draftMeta={draftMeta}
                        playersData={playersData}
                        currentLeague={currentLeague}
                        myRoster={myRoster}
                    />
                )}
            </div>
        );
    }

    function AnalystMockPanel({ state, dispatch, draftMeta, playersData, currentLeague, myRoster }) {
        const engine = window.DraftCC?.analystMock;
        const presets = engine?.PRESETS || [];
        const [presetId, setPresetId] = React.useState('league-history');
        const [roundLimit, setRoundLimit] = React.useState('full');
        const [reports, setReports] = React.useState([]);
        const [activeId, setActiveId] = React.useState(null);
        const [filters, setFilters] = React.useState({ team: 'all', round: 'all', pos: 'ALL', focus: 'all', query: '' });
        const [expandedOverall, setExpandedOverall] = React.useState(null);
        const active = reports.find(r => r.id === activeId) || reports[0] || null;
        React.useEffect(() => {
            if (!active?.picks?.length) return;
            const stillValid = active.picks.some(p => Number(p.overall) === Number(expandedOverall));
            if (stillValid) return;
            const firstUser = active.summary?.userPicks?.[0];
            setExpandedOverall(firstUser?.overall || active.picks[0].overall);
        }, [active?.id]);
        if (!engine || !presets.length) return null;

        const generate = () => {
            const report = engine.generateProjectedMock({
                state,
                draftMeta,
                playersData,
                currentLeague,
                myRoster,
                presetId,
                roundLimit,
            });
            setReports(prev => [report].concat(prev.filter(r => r.id !== report.id)).slice(0, 4));
            setActiveId(report.id);
        };
        const useAsScenario = () => {
            if (!active) return;
            dispatch({
                type: 'SETUP_CHANGE',
                payload: {
                    mode: 'scenario',
                    scenarioId: null,
                    analystScenario: active,
                },
            });
        };
        const driverLabel = (counts) => {
            const order = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
            return order.slice(0, 3).map(([k, v]) => k.replace(/_/g, ' ') + ' ' + v).join(' - ') || 'No drivers yet';
        };
        const fmt = n => {
            const v = Number(n || 0);
            if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
            return String(Math.round(v));
        };
        const patchFilters = patch => setFilters(prev => ({ ...prev, ...patch }));
        const filteredPicks = active
            ? (engine.applyReportFilters ? engine.applyReportFilters(active, filters, state) : active.picks)
            : [];
        const brief = active?.summary?.reportBrief || null;
        const teamOptions = active ? Array.from(new Map(active.picks.map(p => {
            const key = String(p.rosterId || p.ownerName || p.slot);
            return [key, { key, label: p.ownerName || ('Team ' + p.slot) }];
        })).values()).sort((a, b) => a.label.localeCompare(b.label)) : [];
        const roundOptions = active ? Array.from(new Set(active.picks.map(p => Number(p.round)))).sort((a, b) => a - b) : [];
        const posOptions = active ? Array.from(new Set(active.picks.map(p => String(p.pos || '?').toUpperCase()))).sort() : [];
        const focusCount = id => {
            if (!active) return 0;
            if (id === 'all') return active.picks.length;
            if (id === 'my') return active.summary?.userPicks?.length || 0;
            if (id === 'reaches') return active.summary?.reaches?.length || 0;
            if (id === 'steals') return active.summary?.steals?.length || 0;
            if (id === 'trades') return active.summary?.tradeSignals?.length || 0;
            if (id === 'high') return active.picks.filter(p => p.confidence === 'high').length;
            if (id === 'owner_history') return active.picks.filter(p => (p.drivers || []).some(d => d.code === 'owner_history')).length;
            if (id === 'need') return active.picks.filter(p => p.alexCommentary?.meta?.needHit || (p.drivers || []).some(d => d.code === 'need')).length;
            return 0;
        };
        const focusOptions = [
            { id: 'all', label: 'All' },
            { id: 'my', label: 'My Picks' },
            { id: 'reaches', label: 'Reaches' },
            { id: 'steals', label: 'Steals' },
            { id: 'trades', label: 'Trade Heat' },
            { id: 'high', label: 'High Certainty' },
            { id: 'owner_history', label: 'Owner DNA' },
            { id: 'need', label: 'Need Fits' },
        ];
        const controlStyle = {
            padding: '7px 9px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '6px',
            color: 'var(--white)',
            fontSize: '0.68rem',
            fontFamily: FONT_UI,
            outline: 'none',
            minWidth: 0,
        };
        const chipStyle = activeChip => ({
            padding: '5px 8px',
            borderRadius: '5px',
            border: '1px solid ' + (activeChip ? 'rgba(212,175,55,0.46)' : 'rgba(255,255,255,0.08)'),
            background: activeChip ? 'rgba(212,175,55,0.13)' : 'rgba(255,255,255,0.025)',
            color: activeChip ? 'var(--gold)' : 'var(--silver)',
            cursor: 'pointer',
            fontSize: '0.58rem',
            fontFamily: FONT_UI,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
        });
        const preset = engine.presetFor(presetId);
        const comparison = active && reports.length > 1 && engine.compareReports
            ? engine.compareReports([active].concat(reports.filter(r => r.id !== active.id)), state)
            : null;

        return (
            <section className="draft-setup-panel" style={{ marginTop: 12 }}>
                <div className="draft-hq-panel-head">
                    <span>Analyst Projected Mock</span>
                    <em>{preset.label} - {roundLimit === 'full' ? 'full draft' : roundLimit + ' round' + (Number(roundLimit) === 1 ? '' : 's')}</em>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, alignItems: 'start' }}>
                    <div>
                        <div className="draft-setup-choice" style={{ marginTop: 6, marginBottom: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                            {presets.map(p => (
                                <button key={p.id} type="button" className={presetId === p.id ? 'is-active' : ''} onClick={() => setPresetId(p.id)}>
                                    {p.label}
                                    <span>{p.desc}</span>
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={roundLimit} onChange={e => setRoundLimit(e.target.value)} style={{
                                padding: '7px 10px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(212,175,55,0.2)',
                                borderRadius: '6px',
                                color: 'var(--white)',
                                fontSize: '0.76rem',
                                fontFamily: FONT_UI,
                                outline: 'none',
                            }}>
                                <option value="1" style={{ background: '#111' }}>1 round</option>
                                <option value="3" style={{ background: '#111' }}>3 rounds</option>
                                <option value="full" style={{ background: '#111' }}>Full draft</option>
                            </select>
                            <button type="button" onClick={generate} style={{
                                padding: '8px 14px',
                                background: 'var(--gold)',
                                color: 'var(--black)',
                                border: '1px solid var(--gold)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.72rem',
                                fontFamily: FONT_UI,
                                fontWeight: 800,
                                letterSpacing: '0.04em',
                            }}>GENERATE LEAGUE MOCK</button>
                            {active && (
                                <button type="button" onClick={useAsScenario} style={{
                                    padding: '8px 12px',
                                    background: 'rgba(46,204,113,0.12)',
                                    color: '#2ECC71',
                                    border: '1px solid rgba(46,204,113,0.35)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem',
                                    fontFamily: FONT_UI,
                                    fontWeight: 800,
                                }}>REHEARSE THIS PROJECTION</button>
                            )}
                        </div>
                    </div>
                    <div style={{
                        minHeight: 190,
                        padding: '10px 12px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(212,175,55,0.12)',
                        borderRadius: '8px',
                    }}>
                        {!active && (
                            <div style={{ color: 'var(--silver)', opacity: 0.62, fontSize: '0.72rem', lineHeight: 1.55 }}>
                                Generate a league-specific pick-by-pick projection using draft order, owner profiles, saved boards, roster needs, and tuning assumptions.
                            </div>
                        )}
                        {active && (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 8 }}>
                                    <div><span style={{ display: 'block', fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase' }}>Picks</span><strong style={{ color: 'var(--gold)', fontFamily: FONT_MONO }}>{active.summary.totalPicks}</strong></div>
                                    <div><span style={{ display: 'block', fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase' }}>Your Picks</span><strong style={{ color: '#2ECC71', fontFamily: FONT_MONO }}>{active.summary.userPicks.length}</strong></div>
                                    <div><span style={{ display: 'block', fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase' }}>Basis</span><strong style={{ color: 'var(--white)', fontFamily: FONT_MONO }}>{active.basis}</strong></div>
                                </div>
                                {brief && (
                                    <div style={{
                                        marginBottom: 9,
                                        padding: '8px 9px',
                                        background: 'rgba(212,175,55,0.055)',
                                        border: '1px solid rgba(212,175,55,0.16)',
                                        borderRadius: '7px',
                                    }}>
                                        <div style={{ color: 'var(--gold)', fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900, fontFamily: FONT_UI, marginBottom: 3 }}>Report Brief</div>
                                        <div style={{ color: 'var(--white)', fontSize: '0.66rem', lineHeight: 1.35, fontFamily: FONT_UI }}>{brief.headline}</div>
                                        <div style={{ color: 'var(--silver)', opacity: 0.72, fontSize: '0.58rem', lineHeight: 1.35, marginTop: 4, fontFamily: FONT_UI }}>{brief.userPath}</div>
                                    </div>
                                )}
                                {brief && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6, marginBottom: 9 }}>
                                        <div style={{ padding: '7px 8px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', borderRadius: 6 }}>
                                            <span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pressure</span>
                                            <strong style={{ display: 'block', color: 'var(--white)', fontSize: '0.72rem', fontFamily: FONT_MONO, marginTop: 2 }}>{brief.positionPressure?.[0] ? brief.positionPressure[0].key + ' x' + brief.positionPressure[0].count : 'Even'}</strong>
                                        </div>
                                        <div style={{ padding: '7px 8px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', borderRadius: 6 }}>
                                            <span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Value Team</span>
                                            <strong style={{ display: 'block', color: '#2ECC71', fontSize: '0.68rem', fontFamily: FONT_UI, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brief.valueTeams?.[0]?.ownerName || '—'}</strong>
                                        </div>
                                        <div style={{ padding: '7px 8px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)', borderRadius: 6 }}>
                                            <span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Watch</span>
                                            <strong style={{ display: 'block', color: 'var(--gold)', fontSize: '0.72rem', fontFamily: FONT_MONO, marginTop: 2 }}>{(active.summary.reaches?.length || 0) + (active.summary.steals?.length || 0) + (active.summary.tradeSignals?.length || 0)}</strong>
                                        </div>
                                    </div>
                                )}
                                <div style={{ fontSize: '0.58rem', color: 'var(--silver)', opacity: 0.65, marginBottom: 8 }}>{driverLabel(active.summary.driverCounts)}</div>
                                <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                    {reports.map(r => (
                                        <button key={r.id} type="button" onClick={() => setActiveId(r.id)} style={{
                                            padding: '3px 7px',
                                            borderRadius: '4px',
                                            border: '1px solid ' + (active.id === r.id ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.08)'),
                                            background: active.id === r.id ? 'rgba(212,175,55,0.12)' : 'transparent',
                                            color: active.id === r.id ? 'var(--gold)' : 'var(--silver)',
                                            cursor: 'pointer',
                                            fontSize: '0.56rem',
                                            fontFamily: FONT_UI,
                                        }}>{r.label}</button>
                                    ))}
                                </div>
                                {comparison?.ready && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                                        gap: 6,
                                        marginBottom: 9,
                                        padding: '7px 8px',
                                        background: 'rgba(155,138,251,0.055)',
                                        border: '1px solid rgba(155,138,251,0.18)',
                                        borderRadius: 7,
                                    }}>
                                        <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase' }}>Changed Picks</span><strong style={{ color: 'rgba(214,208,255,0.98)', fontFamily: FONT_MONO, fontSize: '0.68rem' }}>{comparison.changedPickCount}</strong></div>
                                        <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase' }}>Target Risk</span><strong style={{ color: comparison.summary.targetRisk ? '#F0A500' : '#2ECC71', fontFamily: FONT_MONO, fontSize: '0.68rem' }}>{comparison.summary.targetRisk}</strong></div>
                                        <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.62, fontSize: '0.5rem', textTransform: 'uppercase' }}>Top Grade</span><strong style={{ color: 'var(--gold)', fontFamily: FONT_UI, fontSize: '0.66rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{comparison.teamGrades?.[0]?.letter || '?'} · {comparison.teamGrades?.[0]?.ownerName || '—'}</strong></div>
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.62fr 0.62fr 1fr', gap: 6, marginBottom: 7 }}>
                                    <select value={filters.team} onChange={e => patchFilters({ team: e.target.value })} style={controlStyle}>
                                        <option value="all" style={{ background: '#111' }}>All teams</option>
                                        {teamOptions.map(t => <option key={t.key} value={t.key} style={{ background: '#111' }}>{t.label}</option>)}
                                    </select>
                                    <select value={filters.round} onChange={e => patchFilters({ round: e.target.value })} style={controlStyle}>
                                        <option value="all" style={{ background: '#111' }}>All rounds</option>
                                        {roundOptions.map(r => <option key={r} value={r} style={{ background: '#111' }}>R{r}</option>)}
                                    </select>
                                    <select value={filters.pos} onChange={e => patchFilters({ pos: e.target.value })} style={controlStyle}>
                                        <option value="ALL" style={{ background: '#111' }}>All pos</option>
                                        {posOptions.map(pos => <option key={pos} value={pos} style={{ background: '#111' }}>{pos}</option>)}
                                    </select>
                                    <input value={filters.query} onChange={e => patchFilters({ query: e.target.value })} placeholder="Search report..." style={{ ...controlStyle, width: '100%' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                                    {focusOptions.map(f => (
                                        <button key={f.id} type="button" onClick={() => patchFilters({ focus: f.id })} style={chipStyle(filters.focus === f.id)}>
                                            {f.label} <span style={{ opacity: 0.62, fontFamily: FONT_MONO }}>{focusCount(f.id)}</span>
                                        </button>
                                    ))}
                                    {(filters.team !== 'all' || filters.round !== 'all' || filters.pos !== 'ALL' || filters.focus !== 'all' || filters.query) && (
                                        <button type="button" onClick={() => setFilters({ team: 'all', round: 'all', pos: 'ALL', focus: 'all', query: '' })} style={chipStyle(false)}>Clear</button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--silver)', opacity: 0.68, fontSize: '0.56rem', fontFamily: FONT_UI, marginBottom: 5 }}>
                                    <span>{filteredPicks.length} of {active.picks.length} projected picks</span>
                                    <span>{brief?.roundSummaries?.length || 0} rounds · {brief?.teamSummaries?.length || 0} teams</span>
                                </div>
                                <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 3 }}>
                                    {!filteredPicks.length && (
                                        <div style={{ padding: 14, color: 'var(--silver)', opacity: 0.68, fontSize: '0.68rem', textAlign: 'center' }}>No picks match the current report filters.</div>
                                    )}
                                    {filteredPicks.map(p => {
                                        const expanded = Number(expandedOverall) === Number(p.overall);
                                        const isReach = (active.summary.reaches || []).some(x => Number(x.overall) === Number(p.overall));
                                        const isSteal = (active.summary.steals || []).some(x => Number(x.overall) === Number(p.overall));
                                        const isTrade = (active.summary.tradeSignals || []).some(x => Number(x.overall) === Number(p.overall));
                                        const isMine = String(p.rosterId || '') === String(state.userRosterId || '') || (!p.rosterId && Number(p.slot) === Number(state.userSlot));
                                        const borderColor = isMine ? 'rgba(46,204,113,0.34)' : expanded ? 'rgba(212,175,55,0.34)' : 'rgba(255,255,255,0.055)';
                                        return (
                                            <div key={p.overall} onClick={() => setExpandedOverall(expanded ? null : p.overall)} role="button" tabIndex={0} style={{
                                                marginBottom: 6,
                                                padding: '7px 8px',
                                                border: '1px solid ' + borderColor,
                                                background: expanded ? 'rgba(212,175,55,0.065)' : isMine ? 'rgba(46,204,113,0.04)' : 'rgba(255,255,255,0.018)',
                                                borderRadius: 7,
                                                cursor: 'pointer',
                                            }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) 62px', gap: 8, alignItems: 'start' }}>
                                                    <span style={{ color: isMine ? '#2ECC71' : 'var(--gold)', fontFamily: FONT_MONO, fontSize: '0.64rem' }}>{p.round}.{String(p.slot).padStart(2, '0')}</span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <strong style={{ display: 'block', color: 'var(--white)', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name} <span style={{ color: 'var(--gold)', fontSize: '0.58rem' }}>{p.pos}</span></strong>
                                                        <em style={{ display: 'block', color: 'var(--silver)', opacity: 0.66, fontSize: '0.58rem', fontStyle: 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.ownerName}</em>
                                                    </span>
                                                    <span style={{ textAlign: 'right' }}>
                                                        <span style={{ display: 'block', color: p.confidence === 'high' ? '#2ECC71' : p.confidence === 'medium' ? 'var(--gold)' : 'var(--silver)', fontSize: '0.54rem', textTransform: 'uppercase', fontWeight: 900 }}>{p.confidence}</span>
                                                        <span style={{ display: 'block', color: isSteal ? '#2ECC71' : isReach ? '#E74C3C' : 'var(--silver)', fontFamily: FONT_MONO, fontSize: '0.56rem', marginTop: 2 }}>{isSteal ? 'STEAL' : isReach ? 'REACH' : isTrade ? 'TRADE' : fmt(p.dhq)}</span>
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                                    {isMine && <span style={chipStyle(true)}>Your pick</span>}
                                                    {(p.drivers || []).slice(0, 3).map(d => <span key={d.code} style={{ ...chipStyle(false), cursor: 'default', padding: '3px 6px', fontSize: '0.51rem' }}>{d.label}</span>)}
                                                </div>
                                                {expanded && (
                                                    <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                        <div style={{ color: 'var(--silver)', opacity: 0.78, fontSize: '0.6rem', lineHeight: 1.38, fontFamily: FONT_UI, marginBottom: 7 }}>{p.note}</div>
                                                        {p.alexCommentary && (
                                                            <div style={{ padding: '7px 8px', background: 'rgba(212,175,55,0.055)', border: '1px solid rgba(212,175,55,0.14)', borderRadius: 6 }}>
                                                                <div style={{ color: 'var(--gold)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 900, marginBottom: 4 }}>Alex Pick Read</div>
                                                                <div style={{ display: 'grid', gap: 5 }}>
                                                                    {[p.alexCommentary.teamImpact, p.alexCommentary.ownerFit, p.alexCommentary.boardRead, p.alexCommentary.roomImpact, p.alexCommentary.pivot].filter(Boolean).map((line, idx) => (
                                                                        <div key={idx} style={{ color: idx === 2 ? 'var(--white)' : 'var(--silver)', opacity: idx === 2 ? 0.92 : 0.75, fontSize: '0.6rem', lineHeight: 1.35, fontFamily: FONT_UI }}>{line}</div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginTop: 7 }}>
                                                            <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.55, fontSize: '0.48rem', textTransform: 'uppercase' }}>DHQ</span><strong style={{ color: 'var(--gold)', fontFamily: FONT_MONO, fontSize: '0.64rem' }}>{fmt(p.dhq)}</strong></div>
                                                            <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.55, fontSize: '0.48rem', textTransform: 'uppercase' }}>Board</span><strong style={{ color: 'var(--white)', fontFamily: FONT_MONO, fontSize: '0.64rem' }}>{p.consensusRank ? '#' + Math.round(p.consensusRank) : '—'}</strong></div>
                                                            <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.55, fontSize: '0.48rem', textTransform: 'uppercase' }}>Tier</span><strong style={{ color: 'var(--white)', fontFamily: FONT_MONO, fontSize: '0.64rem' }}>{p.tier || '—'}</strong></div>
                                                            <div><span style={{ display: 'block', color: 'var(--silver)', opacity: 0.55, fontSize: '0.48rem', textTransform: 'uppercase' }}>Alt</span><strong style={{ color: 'var(--white)', fontFamily: FONT_UI, fontSize: '0.58rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.alternatives || [])[0]?.name || '—'}</strong></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        );
    }

    function DraftTuningControls({ state, update }) {
        const t = state.draftTuning || {};
        const patch = (key, value) => update({ draftTuning: { ...t, [key]: Number(value) } });
        const rows = [
            { key: 'ownerDna', label: 'Owner DNA', left: 'Class-agnostic', right: 'History-heavy' },
            { key: 'classValue', label: 'Class Value', left: 'Loose tiers', right: 'Board discipline' },
            { key: 'needFit', label: 'Roster Fit', left: 'BPA', right: 'Need-driven' },
            { key: 'tradeActivity', label: 'Trade Activity', left: 'No trades', right: 'Aggressive' },
            { key: 'variance', label: 'Pick Variance', left: 'Predictable', right: 'Chaotic' },
        ];
        return (
            <div style={{ marginTop: '14px' }}>
                <div className="draft-setup-label">Simulation Tuning</div>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '10px 12px',
                    marginTop: '6px',
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(212,175,55,0.12)',
                    borderRadius: '8px',
                }}>
                    {rows.map(row => {
                        const value = t[row.key] ?? (row.key === 'ownerDna' ? 70 : row.key === 'classValue' ? 65 : row.key === 'needFit' ? 60 : row.key === 'tradeActivity' ? 50 : 45);
                        return (
                            <div key={row.key}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ flex: 1, fontSize: '0.66rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT_UI }}>{row.label}</span>
                                    <span style={{ fontSize: '0.66rem', color: 'var(--white)', fontFamily: FONT_MONO, minWidth: 34, textAlign: 'right' }}>{value}%</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={value}
                                    onChange={e => patch(row.key, e.target.value)}
                                    style={{ width: '100%', accentColor: 'var(--gold)' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.55, fontFamily: FONT_UI, marginTop: '-1px' }}>
                                    <span>{row.left}</span>
                                    <span>{row.right}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Phase 5: ModeSelector ────────────────────────────────────────
    // Live Sync moved to its own top-level tab ("Follow Live Draft").
    function ModeSelector({ state, update }) {
        const modes = [
            { id: 'solo',     label: 'Custom Solo',  desc: 'Manually configure rounds & teams',   icon: '⚡' },
            { id: 'manual',   label: 'Manual Room',  desc: 'Record every pick yourself',           icon: '✍' },
            { id: 'scenario', label: 'Scenario',     desc: 'Canned "what-if" scenarios',          icon: '🎯' },
            { id: 'ghost',    label: 'Ghost Replay', desc: 'Replay a prior Sleeper draft',        icon: '👻' },
        ];
        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '6px',
                }}>Alternate Mock Mode</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' }}>
                    {modes.map(m => {
                        const isActive = state.mode === m.id;
                        return (
                            <button key={m.id} onClick={() => update({ mode: m.id })} style={{
                                padding: '10px 8px',
                                background: isActive ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                                border: '1px solid ' + (isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                                borderRadius: '6px',
                                color: isActive ? 'var(--gold)' : 'var(--silver)',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                fontFamily: FONT_UI,
                                cursor: 'pointer',
                            }}>
                                <div style={{ fontSize: '1rem', marginBottom: '3px' }}>{m.icon}</div>
                                <div>{m.label}</div>
                                <div style={{ fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.6, marginTop: '2px' }}>{m.desc}</div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Phase 5: ScenarioPicker ──────────────────────────────────────
    function ScenarioPicker({ state, update }) {
        const presets = window.DraftCC.scenarios?.presets || [];
        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '6px',
                }}>Scenario</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {presets.map(p => {
                        const isActive = state.scenarioId === p.id;
                        return (
                            <button key={p.id} onClick={() => update({ scenarioId: p.id })} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                background: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                                border: '1px solid ' + (isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                                borderRadius: '6px',
                                color: 'var(--white)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontFamily: FONT_UI,
                            }}>
                                <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{p.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isActive ? 'var(--gold)' : 'var(--white)' }}>{p.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.7, marginTop: '2px' }}>{p.desc}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Phase 5: GhostDraftPicker ────────────────────────────────────
    // Pulls drafts from THIS league only, walking the previous_league_id chain
    // backward so dynasty continuations from prior seasons are included.
    function GhostDraftPicker({ state, update, leagueId }) {
        const [drafts, setDrafts] = React.useState(null);
        const [loading, setLoading] = React.useState(false);
        const [progress, setProgress] = React.useState('');

        React.useEffect(() => {
            if (!leagueId) return;
            setLoading(true);
            setProgress('Loading drafts from this league…');
            window.DraftCC.ghostReplay.listLeagueChainDrafts(leagueId)
                .then(d => {
                    setDrafts(d || []);
                    setProgress('');
                })
                .catch(e => {
                    setDrafts([]);
                    setProgress('Error: ' + (e?.message || 'unknown'));
                    if (window.wrLog) window.wrLog('ghostPicker.list', e);
                })
                .finally(() => setLoading(false));
        }, [leagueId]);

        const completeDrafts = (drafts || []).filter(d => d.status === 'complete');
        const otherDrafts = (drafts || []).filter(d => d.status !== 'complete');

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '6px',
                }}>
                    <div style={{
                        fontSize: '0.64rem',
                        fontWeight: 700,
                        color: 'var(--gold)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        flex: 1,
                    }}>Replay Source</div>
                    {!loading && drafts && (
                        <span style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.6 }}>
                            {completeDrafts.length} complete · {otherDrafts.length} other
                        </span>
                    )}
                </div>
                {loading && (
                    <div style={{
                        fontSize: '0.72rem',
                        color: 'var(--silver)',
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '5px',
                    }}>
                        {progress || 'Loading drafts from Sleeper…'}
                    </div>
                )}
                {!loading && drafts && drafts.length === 0 && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(231,76,60,0.08)',
                        border: '1px solid rgba(231,76,60,0.25)',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: '#E74C3C',
                    }}>
                        No drafts found for this league.
                    </div>
                )}
                {!loading && drafts && drafts.length > 0 && completeDrafts.length === 0 && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(240,165,0,0.08)',
                        border: '1px solid rgba(240,165,0,0.3)',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: '#F0A500',
                        marginBottom: '6px',
                        lineHeight: 1.5,
                    }}>
                        ⚠ This league has no completed drafts yet. Try <strong>Solo</strong> or <strong>Scenario</strong> mode, or <strong>Live Sync</strong> to mirror a draft in progress.
                    </div>
                )}
                {!loading && completeDrafts.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        maxHeight: 280,
                        overflowY: 'auto',
                        paddingRight: 4,
                    }}>
                        {completeDrafts.map(d => {
                            const isActive = state.sleeperDraftId === d.draft_id;
                            return (
                                <button key={d.draft_id}
                                    onClick={() => update({ sleeperDraftId: d.draft_id })}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '8px 12px',
                                        background: isActive ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.03)',
                                        border: '1px solid ' + (isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                                        borderRadius: '5px',
                                        color: 'var(--white)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontFamily: FONT_UI,
                                        fontSize: '0.72rem',
                                    }}>
                                    <span style={{
                                        fontSize: '0.58rem',
                                        color: 'var(--gold)',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        minWidth: 42,
                                    }}>{d.season}</span>
                                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {d.type || 'snake'} · {d.settings?.rounds || '?'}R × {d.settings?.teams || '?'}T
                                        {d.leagueName && <span style={{ color: 'var(--silver)', opacity: 0.6, marginLeft: 6 }}>· {d.leagueName}</span>}
                                    </span>
                                    <span style={{
                                        fontSize: '0.54rem',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'rgba(46,204,113,0.15)',
                                        color: '#2ECC71',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                        fontWeight: 700,
                                    }}>complete</span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {/* In-progress / not-started drafts still render as informational so users see them */}
                {!loading && otherDrafts.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                        <div style={{
                            fontSize: '0.54rem',
                            color: 'var(--silver)',
                            opacity: 0.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '3px',
                        }}>In progress / upcoming ({otherDrafts.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: 100, overflowY: 'auto' }}>
                            {otherDrafts.slice(0, 10).map(d => (
                                <div key={d.draft_id}
                                    title={d.status === 'pre_draft' ? 'Not started yet — no picks to replay' : 'Draft in progress — use Live Sync mode instead'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '5px 10px',
                                        background: 'rgba(255,255,255,0.015)',
                                        border: '1px dashed rgba(255,255,255,0.05)',
                                        borderRadius: '4px',
                                        color: 'var(--silver)',
                                        cursor: 'not-allowed',
                                        fontFamily: FONT_UI,
                                        fontSize: '0.62rem',
                                        opacity: 0.45,
                                    }}>
                                    <span style={{ fontSize: '0.52rem', fontWeight: 700, minWidth: 42 }}>{d.season}</span>
                                    <span style={{
                                        flex: 1,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}>{(d.leagueName || 'Unknown').slice(0, 30)} · {d.type || 'snake'} · {d.settings?.teams || '?'}T</span>
                                    <span style={{
                                        fontSize: '0.5rem',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'rgba(240,165,0,0.12)',
                                        color: '#F0A500',
                                        textTransform: 'uppercase',
                                        fontWeight: 700,
                                    }}>{d.status === 'pre_draft' ? 'upcoming' : d.status}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Phase 5: LiveSyncDraftPicker ─────────────────────────────────
    // Shows only pre_draft / drafting status drafts from this league's chain.
    // A live sync source must be something currently scheduled or in-flight —
    // completed drafts would be ghost replay territory.
    function LiveSyncDraftPicker({ state, update, leagueId }) {
        const [drafts, setDrafts] = React.useState(null);
        const [loading, setLoading] = React.useState(false);

        React.useEffect(() => {
            if (!leagueId) return;
            setLoading(true);
            window.DraftCC.ghostReplay.listLeagueChainDrafts(leagueId)
                .then(d => setDrafts(d || []))
                .catch(() => setDrafts([]))
                .finally(() => setLoading(false));
        }, [leagueId]);

        // Filter to only drafts we can actually sync against
        const liveDrafts = (drafts || [])
            .filter(d => d.status === 'pre_draft' || d.status === 'drafting')
            // Sort: drafting first (most urgent), then pre_draft by start_time asc (next up)
            .sort((a, b) => {
                if (a.status !== b.status) return a.status === 'drafting' ? -1 : 1;
                return (a.start_time || Infinity) - (b.start_time || Infinity);
            });
        const liveDraftSignature = liveDrafts.map(d => d.draft_id + ':' + d.status).join('|');

        React.useEffect(() => {
            if (loading || state.sleeperDraftId || !liveDrafts.length) return;
            update(liveDraftSetupPatch(liveDrafts[0]));
        }, [loading, state.sleeperDraftId, liveDraftSignature]);

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '6px',
                }}>
                    <div style={{
                        fontSize: '0.64rem',
                        fontWeight: 700,
                        color: 'var(--gold)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        flex: 1,
                    }}>Live Sync Source</div>
                    {!loading && liveDrafts && (
                        <span style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.6 }}>
                            {liveDrafts.length} upcoming
                        </span>
                    )}
                </div>
                {loading && (
                    <div style={{
                        fontSize: '0.72rem',
                        color: 'var(--silver)',
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '5px',
                    }}>
                        Loading upcoming drafts…
                    </div>
                )}
                {!loading && liveDrafts.length === 0 && (
                    <div style={{
                        padding: '10px 14px',
                        background: 'rgba(240,165,0,0.08)',
                        border: '1px solid rgba(240,165,0,0.3)',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: '#F0A500',
                        lineHeight: 1.5,
                    }}>
                        ⚠ No upcoming or in-progress drafts in this league. Live Sync mirrors a real draft as it happens — come back when one is scheduled.
                    </div>
                )}
                {!loading && liveDrafts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 220, overflowY: 'auto' }}>
                        {liveDrafts.map(d => {
                            const isActive = state.sleeperDraftId === d.draft_id;
                            const isDrafting = d.status === 'drafting';
                            const statusLabel = isDrafting ? 'LIVE' : 'UPCOMING';
                            const statusCol = isDrafting ? '#2ECC71' : '#F0A500';
                            const startStr = d.start_time
                                ? new Date(d.start_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                                : (isDrafting ? 'in progress' : 'not scheduled');
                            return (
                                <button key={d.draft_id}
                                    onClick={() => update(liveDraftSetupPatch(d))}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: isActive ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.03)',
                                        border: '1px solid ' + (isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'),
                                        borderRadius: '5px',
                                        color: 'var(--white)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontFamily: FONT_UI,
                                        fontSize: '0.72rem',
                                    }}>
                                    {isDrafting && (
                                        <span style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: '#2ECC71',
                                            animation: 'pulse 1.4s infinite',
                                            flexShrink: 0,
                                        }} />
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {d.season} · {d.type || 'snake'} · {d.settings?.rounds || '?'}R × {d.settings?.teams || '?'}T
                                        </div>
                                        <div style={{ fontSize: '0.58rem', color: 'var(--silver)', opacity: 0.6, marginTop: '2px' }}>
                                            {d.leagueName} · {startStr}
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.54rem',
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        background: statusCol + '15',
                                        color: statusCol,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>{statusLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ── Phase 5: TemplateLoader ──────────────────────────────────────
    function TemplateLoader({ state, dispatch }) {
        const leagueId = state.leagueId;
        const [templates, setTemplates] = React.useState([]);
        const [refreshKey, setRefreshKey] = React.useState(0);

        React.useEffect(() => {
            const list = window.DraftCC.persistence?.listTemplates(leagueId) || [];
            setTemplates(list);
        }, [leagueId, refreshKey]);

        if (!templates.length) return null;

        const onLoad = (tpl) => {
            const loaded = window.DraftCC.persistence.loadTemplate(leagueId, tpl.id);
            if (!loaded) return;
            dispatch({ type: 'HYDRATE', state: loaded });
        };

        const onDelete = (tpl) => {
            if (!confirm('Delete template "' + tpl.name + '"?')) return;
            window.DraftCC.persistence.deleteTemplate(leagueId, tpl.id);
            setRefreshKey(x => x + 1);
        };

        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '6px',
                }}>Saved Templates ({templates.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 150, overflowY: 'auto' }}>
                    {templates.map(tpl => (
                        <div key={tpl.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            fontFamily: FONT_UI,
                            fontSize: '0.72rem',
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontWeight: 700,
                                    color: 'var(--white)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>{tpl.name}</div>
                                <div style={{ fontSize: '0.58rem', color: 'var(--silver)', opacity: 0.6 }}>
                                    {new Date(tpl.ts).toLocaleString()} · {tpl.state.picks?.length || 0} picks
                                </div>
                            </div>
                            <button onClick={() => onLoad(tpl)} style={{
                                padding: '4px 10px',
                                background: 'var(--gold)',
                                color: 'var(--black)',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                fontFamily: FONT_UI,
                            }}>LOAD</button>
                            <button onClick={() => onDelete(tpl)} style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                color: '#E74C3C',
                                border: '1px solid rgba(231,76,60,0.3)',
                                borderRadius: '3px',
                                cursor: 'pointer',
                                fontSize: '0.6rem',
                                fontFamily: FONT_UI,
                            }}>×</button>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    function MyDraftRosterPanel({ state }) {
        const players = window.S?.players || {};
        const scores = window.App?.LI?.playerScores || {};
        const rosters = window.S?.rosters || [];
        const normPos = window.App?.normPos || (p => p);
        const posColors = window.App?.POS_COLORS || {
            QB: '#FF6B6B', RB: '#4ECDC4', WR: '#45B7D1', TE: '#F7DC6F',
            DL: '#E67E22', LB: '#F0A500', DB: '#5DADE2', K: '#BB8FCE',
        };
        const fmt = (n) => {
            const v = Number(n) || 0;
            return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
        };
        const playerName = (pid, fallback) => {
            const p = players[pid] || {};
            return fallback || p.full_name || ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || pid;
        };
        const playerAge = (pid, fallback) => {
            const p = players[pid] || {};
            if (fallback != null) return Number(fallback);
            if (p.age) return Number(p.age);
            if (p.birth_date) {
                const d = new Date(p.birth_date).getTime();
                if (Number.isFinite(d)) return Math.floor((Date.now() - d) / 31557600000);
            }
            return null;
        };
        const projectDhq = (dhq, pos, age, years) => {
            const base = Number(dhq) || 0;
            if (!base) return 0;
            const core = window.App?.DhqCore || window.DhqCore;
            if (!core?.ageCurveFactor || !age) return Math.round(base * Math.pow(0.94, years));
            const nowFactor = Math.max(0.01, core.ageCurveFactor(age, pos));
            const futureFactor = core.ageCurveFactor(age + years, pos) / nowFactor;
            return Math.max(0, Math.round(base * futureFactor * Math.pow(0.96, years)));
        };

        const myPicks = React.useMemo(() => {
            return (state.picks || []).filter(p => p.rosterId === state.userRosterId || p.isUser);
        }, [state.picks, state.userRosterId]);

        const baseRoster = React.useMemo(() => {
            return rosters.find(r => String(r.roster_id) === String(state.userRosterId));
        }, [state.userRosterId, rosters.length]);

        const rosterRows = React.useMemo(() => {
            const effective = window.DraftCC?.state?.getEffectivePlayers
                ? window.DraftCC.state.getEffectivePlayers(state, state.userRosterId, baseRoster?.players || [])
                : (baseRoster?.players || []);
            const baseRows = (effective || []).map(pid => {
                const p = players[pid] || {};
                const pos = normPos(p.position) || p.position || '?';
                const dhq = scores[pid] || (typeof window.dynastyValue === 'function' ? window.dynastyValue(pid) : 0) || 0;
                return {
                    pid,
                    name: playerName(pid),
                    pos,
                    team: p.team || 'FA',
                    age: playerAge(pid),
                    dhq,
                    projected5: projectDhq(dhq, pos, playerAge(pid), 5),
                    source: 'Roster',
                };
            });
            const pickRows = myPicks.map(p => ({
                pid: p.pid,
                name: p.name,
                pos: p.pos,
                team: p.team || p.college || 'Draft',
                age: playerAge(p.pid, p.age || p.csv?.age || null),
                dhq: p.dhq || 0,
                projected5: projectDhq(p.dhq || 0, p.pos, playerAge(p.pid, p.age || p.csv?.age || null), 5),
                source: 'Pick ' + p.round + '.' + String(p.slot).padStart(2, '0'),
                isPick: true,
            }));
            return [...baseRows, ...pickRows].filter(r => r.pos && r.dhq > 0).sort((a, b) => {
                if (a.pos !== b.pos) return a.pos.localeCompare(b.pos);
                return b.dhq - a.dhq;
            });
        }, [state, state.userRosterId, baseRoster, players, scores, myPicks]);

        const grouped = React.useMemo(() => {
            const m = {};
            rosterRows.forEach(r => {
                if (!m[r.pos]) m[r.pos] = [];
                m[r.pos].push(r);
            });
            return m;
        }, [rosterRows]);

        const compareRows = React.useMemo(() => {
            return (state.pool || []).slice(0, 80).map(p => {
                const pos = p.pos || '?';
                const age = playerAge(p.pid, p.age || p.csv?.age || null);
                const projected5 = projectDhq(p.dhq || 0, pos, age, 5);
                const room = (grouped[pos] || []).slice().sort((a, b) => b.dhq - a.dhq);
                const topMine = room[0] || null;
                return {
                    ...p,
                    age,
                    projected5,
                    topMine,
                    delta: (p.dhq || 0) - (topMine?.dhq || 0),
                };
            }).sort((a, b) => {
                const needA = a.delta > 0 ? 1 : 0;
                const needB = b.delta > 0 ? 1 : 0;
                return needB - needA || (b.dhq || 0) - (a.dhq || 0);
            }).slice(0, 10);
        }, [state.pool, grouped, players]);

        const totalDhq = rosterRows.reduce((sum, r) => sum + (r.dhq || 0), 0);
        const pickDhq = myPicks.reduce((sum, p) => sum + (p.dhq || 0), 0);
        const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'].filter(pos => grouped[pos]?.length)
            .concat(Object.keys(grouped).filter(pos => !['QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'].includes(pos)));

        return (
            <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 10px',
                background: 'var(--black)',
                border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: '8px',
                overflow: 'hidden',
                fontFamily: FONT_UI,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexShrink: 0 }}>
                    <div style={{ fontFamily: FONT_DISPL, fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1 }}>My Roster Build</div>
                    <span style={{ fontSize: '0.58rem', color: 'var(--silver)', opacity: 0.65 }}>{myPicks.length} picks</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px', flexShrink: 0 }}>
                    <div style={{ padding: '6px 8px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.14)', borderRadius: '5px' }}>
                        <div style={{ fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.65, textTransform: 'uppercase' }}>Roster DHQ</div>
                        <div style={{ fontFamily: FONT_MONO, color: 'var(--gold)', fontWeight: 700, fontSize: '0.84rem' }}>{fmt(totalDhq)}</div>
                    </div>
                    <div style={{ padding: '6px 8px', background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.14)', borderRadius: '5px' }}>
                        <div style={{ fontSize: '0.52rem', color: 'var(--silver)', opacity: 0.65, textTransform: 'uppercase' }}>Draft Added</div>
                        <div style={{ fontFamily: FONT_MONO, color: '#2ECC71', fontWeight: 700, fontSize: '0.84rem' }}>{fmt(pickDhq)}</div>
                    </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '3px' }}>
                    <div style={{ fontSize: '0.56rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Build By Position</div>
                    {positions.length === 0 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--silver)', opacity: 0.45, fontSize: '0.7rem' }}>Your mock picks will appear here.</div>
                    )}
                    {positions.slice(0, 7).map(pos => {
                        const rows = grouped[pos].slice(0, 3);
                        return (
                            <div key={pos} style={{ marginBottom: '6px', paddingBottom: '5px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                    <strong style={{ fontSize: '0.62rem', color: posColors[pos] || 'var(--gold)', width: 28 }}>{pos}</strong>
                                    <span style={{ fontSize: '0.54rem', color: 'var(--silver)', opacity: 0.55 }}>{grouped[pos].length} players</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.56rem', color: 'var(--gold)', fontFamily: FONT_MONO }}>{fmt(grouped[pos].reduce((s, r) => s + r.dhq, 0))}</span>
                                </div>
                                {rows.map(r => (
                                    <div key={r.source + '-' + r.pid} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.6rem', lineHeight: 1.45 }}>
                                        <span style={{ flex: 1, color: r.isPick ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                                        <span style={{ color: 'var(--silver)', opacity: 0.55, fontFamily: FONT_MONO }}>{fmt(r.dhq)}</span>
                                        <span style={{ color: r.projected5 >= r.dhq ? '#2ECC71' : 'var(--silver)', fontFamily: FONT_MONO, minWidth: 32, textAlign: 'right' }}>Y5 {fmt(r.projected5)}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })}

                    <div style={{ fontSize: '0.56rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>Available Vs Team</div>
                    {compareRows.map(p => {
                        const col = p.delta > 0 ? '#2ECC71' : p.delta > -600 ? 'var(--gold)' : 'var(--silver)';
                        return (
                            <div key={p.pid} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) 42px 44px 44px', gap: '5px', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.035)', fontSize: '0.6rem' }}>
                                <span style={{ color: posColors[p.pos] || 'var(--silver)', fontWeight: 700 }}>{p.pos}</span>
                                <span style={{ color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                <span style={{ color: 'var(--gold)', textAlign: 'right', fontFamily: FONT_MONO }}>{fmt(p.dhq)}</span>
                                <span style={{ color: col, textAlign: 'right', fontFamily: FONT_MONO }}>{p.delta > 0 ? '+' : ''}{fmt(p.delta)}</span>
                                <span style={{ color: p.projected5 >= p.dhq ? '#2ECC71' : 'var(--silver)', textAlign: 'right', fontFamily: FONT_MONO }}>Y5 {fmt(p.projected5)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Drafting / complete grid ─────────────────────────────────────
    function CommandCenterGrid({ state, dispatch, isUserTurn, currentSlot, onExit, viewport, onPropose }) {
        const L = DRAFT_CC_LAYOUT;
        // Filter by rosterId so post-trade ownership is respected
        const myPicks = state.picks.filter(p => p.rosterId === state.userRosterId || p.isUser);
        const grade = window.DraftCC.state.gradeDraft(myPicks, state.originalPool);

        const BigBoardPanel = window.DraftCC.BigBoardPanel;
        const DraftGridPanel = window.DraftCC.DraftGridPanel;
        const OpponentIntelPanel = window.DraftCC.OpponentIntelPanel;
        const AlexStreamPanel = window.DraftCC.AlexStreamPanel;
        const LiveAnalyticsPanel = window.DraftCC.LiveAnalyticsPanel;
        const TradeModal = window.DraftCC.TradeModal;
        const TradeProposer = window.DraftCC.TradeProposer;

        // Header styles
        const headerCss = {
            height: L.HEADER_H + 'px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '0 14px',
            background: 'var(--black)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '8px',
            marginBottom: (L.GRID_GAP) + 'px',
        };

        const speedBtn = (v) => ({
            padding: '4px 10px',
            fontSize: '0.68rem',
            fontFamily: FONT_UI,
            fontWeight: 600,
            background: state.speed === v ? 'rgba(212,175,55,0.15)' : 'transparent',
            color: state.speed === v ? 'var(--gold)' : 'var(--silver)',
            border: '1px solid ' + (state.speed === v ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.08)'),
            borderRadius: '4px',
            cursor: 'pointer',
            textTransform: 'capitalize',
        });

        const liveTradeWindow = React.useMemo(() => {
            if (state.mode !== 'live-sync' || state.phase !== 'drafting') return null;
            try {
                const windows = window.DraftCC.tradeSimulator?.buildLiveTradeWindows?.(state, { lookahead: 6 }) || [];
                return windows[0] || null;
            } catch (e) {
                if (window.wrLog) window.wrLog('cc.liveTradeWindow', e);
                return null;
            }
        }, [state.mode, state.phase, state.currentIdx, state.pickOrder, state.personas, state.tradedAssets, state.draftTuning, state.picks.length, state.userRosterId]);

        const tradeDeskTarget = React.useMemo(() => {
            if (liveTradeWindow?.rosterId) return liveTradeWindow.rosterId;
            const userRosterId = String(state.userRosterId || '');
            if (currentSlot?.rosterId && String(currentSlot.rosterId) !== userRosterId) {
                return currentSlot.rosterId;
            }
            const upcoming = (state.pickOrder || [])
                .slice(state.currentIdx)
                .find(slot => slot?.rosterId && String(slot.rosterId) !== userRosterId);
            if (upcoming?.rosterId) return upcoming.rosterId;
            const personaId = Object.keys(state.personas || {}).find(rosterId => String(rosterId) !== userRosterId);
            return personaId || null;
        }, [currentSlot, liveTradeWindow, state.currentIdx, state.personas, state.pickOrder, state.userRosterId]);

        const liveDecisionDeck = React.useMemo(() => {
            if (state.mode !== 'live-sync' || state.phase !== 'drafting') return null;
            try {
                return window.DraftCC.liveDecisionEngine?.buildDecisionDeck?.(state, { tradeWindow: liveTradeWindow }) || null;
            } catch (e) {
                if (window.wrLog) window.wrLog('cc.liveDecisionDeck', e);
                return null;
            }
        }, [state.mode, state.phase, state.currentIdx, state.pool, state.pickOrder, state.draftContext, state.personas, state.draftedPids, state.userRosterId, liveTradeWindow]);

        const openTradeDesk = React.useCallback(() => {
            if (tradeDeskTarget) onPropose(tradeDeskTarget);
        }, [onPropose, tradeDeskTarget]);
        const learningSaveKeyRef = React.useRef('');
        React.useEffect(() => {
            const helpers = window.DraftCC?.state || {};
            if (state.phase !== 'complete' || !helpers.buildDraftRecap || !helpers.saveDraftLearning) return;
            const saveKey = [state.id, state.picks?.length || 0, grade.totalDHQ || 0].join(':');
            if (learningSaveKeyRef.current === saveKey) return;
            try {
                helpers.saveDraftLearning(helpers.buildDraftRecap(state, {
                    grade,
                    id: 'learning_' + (state.id || Date.now()),
                }));
                learningSaveKeyRef.current = saveKey;
            } catch (e) {
                if (window.wrLog) window.wrLog('cc.draftLearning', e);
            }
        }, [state.phase, state.id, state.picks?.length, grade.totalDHQ, grade.letter]);
        const lastPick = state.picks?.[state.picks.length - 1] || null;
        const canUndoManualPick = state.phase === 'drafting' && lastPick && (
            state.mode === 'manual' || lastPick.source === 'manual-live' || lastPick.source === 'manual-draft'
        );

        // Desktop grid or tablet collapse
        const isTablet = viewport === 'tablet';

        return (
            <div style={{ fontFamily: FONT_UI, paddingBottom: '12px' }}>
                {/* ── HEADER ───────────────────────────────────────── */}
                <div style={headerCss}>
                    <div style={{
                        fontFamily: FONT_DISPL,
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--gold)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                    }}>
                        Draft Command
                    </div>
                    <div style={{
                        fontSize: '0.6rem',
                        color: 'var(--silver)',
                        opacity: 0.6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        flexShrink: 0,
                    }}>
                        {state.mode} · {state.variant}
                    </div>

                    {/* Progress */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{
                            flex: 1,
                            height: 4,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 2,
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                width: Math.round((state.currentIdx / state.pickOrder.length) * 100) + '%',
                                height: '100%',
                                background: 'var(--gold)',
                                transition: 'width 0.4s ease',
                            }} />
                        </div>
                        <span style={{ fontSize: '0.64rem', color: 'var(--silver)', flexShrink: 0 }}>
                            {state.currentIdx} / {state.pickOrder.length}
                        </span>
                    </div>

                    {/* Grade live indicator */}
                    {myPicks.length > 0 && (
                        <div style={{
                            padding: '4px 10px',
                            background: 'rgba(212,175,55,0.08)',
                            border: '1px solid rgba(212,175,55,0.25)',
                            borderRadius: '4px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: 'var(--gold)',
                        }}>
                            {grade.letter} · {grade.totalDHQ >= 1000 ? (grade.totalDHQ / 1000).toFixed(1) + 'k' : grade.totalDHQ} DHQ
                        </div>
                    )}

                    {/* Speed buttons */}
                    {state.phase === 'drafting' && state.mode !== 'live-sync' && state.mode !== 'manual' && (
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            {['slow', 'medium', 'fast', 'paused'].map(v => (
                                <button key={v} onClick={() => dispatch({ type: 'SET_SPEED', speed: v })} style={speedBtn(v)}>
                                    {v === 'paused' ? '⏸' : v}
                                </button>
                            ))}
                        </div>
                    )}

                    {state.phase === 'drafting' && tradeDeskTarget && (
                        <button
                            onClick={openTradeDesk}
                            title="Open trade proposer"
                            style={{
                                padding: '5px 10px',
                                background: 'rgba(212,175,55,0.12)',
                                border: '1px solid rgba(212,175,55,0.35)',
                                borderRadius: '4px',
                                color: 'var(--gold)',
                                cursor: 'pointer',
                                fontSize: '0.66rem',
                                fontFamily: FONT_UI,
                                flexShrink: 0,
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                            }}
                        >
                            ⇄ TRADE
                        </button>
                    )}

                    {canUndoManualPick && (
                        <button
                            onClick={() => dispatch({ type: 'UNDO_LAST_PICK', manualOnly: true })}
                            title="Undo the last manual pick entry"
                            style={{
                                padding: '5px 10px',
                                background: 'rgba(155,138,251,0.12)',
                                border: '1px solid rgba(155,138,251,0.35)',
                                borderRadius: '4px',
                                color: 'rgba(214,208,255,0.98)',
                                cursor: 'pointer',
                                fontSize: '0.66rem',
                                fontFamily: FONT_UI,
                                flexShrink: 0,
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                            }}
                        >
                            UNDO PICK
                        </button>
                    )}

                    {/* Phase 5: Save template button */}
                    {myPicks.length > 0 && (
                        <button
                            onClick={() => {
                                const defaultName = 'Mock ' + new Date().toLocaleString();
                                const name = prompt('Template name:', defaultName);
                                if (!name) return;
                                const rec = window.DraftCC.persistence?.saveTemplate(state, name);
                                if (rec) {
                                    dispatch({
                                        type: 'ALEX_EVENT_ADD',
                                        event: {
                                            type: 'rule',
                                            badge: '💾',
                                            color: '#2ECC71',
                                            title: 'Template saved',
                                            text: '"' + rec.name + '" · load later from the setup screen',
                                        },
                                    });
                                }
                            }}
                            title="Save this draft as a template"
                            style={{
                                padding: '5px 10px',
                                background: 'rgba(46,204,113,0.12)',
                                border: '1px solid rgba(46,204,113,0.3)',
                                borderRadius: '4px',
                                color: '#2ECC71',
                                cursor: 'pointer',
                                fontSize: '0.66rem',
                                fontFamily: FONT_UI,
                                flexShrink: 0,
                                fontWeight: 600,
                            }}>💾 SAVE</button>
                    )}

                    {/* Phase 4: Export PNG button */}
                    {myPicks.length > 0 && (
                        <button
                            onClick={() => window.DraftCC.exports?.downloadDraftCard(state)}
                            title="Export pick card as PNG"
                            style={{
                                padding: '5px 10px',
                                background: 'rgba(124,107,248,0.12)',
                                border: '1px solid rgba(124,107,248,0.3)',
                                borderRadius: '4px',
                                color: 'rgba(155,138,251,0.9)',
                                cursor: 'pointer',
                                fontSize: '0.66rem',
                                fontFamily: FONT_UI,
                                flexShrink: 0,
                                fontWeight: 600,
                            }}>📥 EXPORT</button>
                    )}

                    <button onClick={onExit} style={{
                        padding: '5px 12px',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        color: 'var(--silver)',
                        cursor: 'pointer',
                        fontSize: '0.68rem',
                        fontFamily: FONT_UI,
                        flexShrink: 0,
                    }}>Exit</button>
                </div>

                {state.mode === 'live-sync' && (
                    <LiveSyncStatusBanner
                        state={state}
                        liveSync={state.liveSync}
                        currentSlot={currentSlot}
                        dispatch={dispatch}
                        layoutGap={L.GRID_GAP}
                    />
                )}

                {state.mode === 'live-sync' && (state.stagedLiveOffers || []).length > 0 && (
                    <StagedLiveOffersPanel
                        offers={state.stagedLiveOffers || []}
                        sleeperDraftId={state.sleeperDraftId}
                        dispatch={dispatch}
                        layoutGap={L.GRID_GAP}
                    />
                )}

                <LiveTradeWindowBanner
                    tradeWindow={liveTradeWindow}
                    onOpen={() => liveTradeWindow?.rosterId && onPropose(liveTradeWindow.rosterId)}
                    layoutGap={L.GRID_GAP}
                />

                {state.mode === 'live-sync' && liveDecisionDeck && (
                    <LiveDecisionDeckPanel
                        deck={liveDecisionDeck}
                        onTrade={openTradeDesk}
                        layoutGap={L.GRID_GAP}
                    />
                )}

                {/* Phase 5: Scenario / Ghost replay narrative banner */}
                {state.scenarioNarrative && (
                    <div style={{
                        padding: '8px 14px',
                        marginBottom: L.GRID_GAP + 'px',
                        background: 'linear-gradient(90deg, rgba(212,175,55,0.15), rgba(212,175,55,0.02))',
                        border: '1px solid rgba(212,175,55,0.35)',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        color: 'var(--gold)',
                        fontWeight: 600,
                        fontFamily: FONT_UI,
                    }}>
                        {state.scenarioNarrative}
                    </div>
                )}

                {/* Phase 5: Ghost replay scrubber */}
                {state.mode === 'ghost' && state.replay && (
                    <div style={{
                        padding: '10px 14px',
                        marginBottom: L.GRID_GAP + 'px',
                        background: 'rgba(124,107,248,0.05)',
                        border: '1px solid rgba(124,107,248,0.3)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontFamily: FONT_UI,
                    }}>
                        <span style={{ fontSize: '1rem' }}>👻</span>
                        <span style={{ fontSize: '0.68rem', color: 'rgba(155,138,251,0.9)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Ghost Replay
                        </span>
                        <input
                            type="range"
                            min={0}
                            max={state.replay.totalPicks}
                            value={state.currentIdx}
                            onChange={e => dispatch({ type: 'REPLAY_SEEK', idx: parseInt(e.target.value) })}
                            style={{ flex: 1, cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.68rem', color: 'var(--silver)', fontFamily: "'JetBrains Mono', monospace", minWidth: 60, textAlign: 'right' }}>
                            {state.currentIdx} / {state.replay.totalPicks}
                        </span>
                    </div>
                )}

                {/* ── TOP ROW: Big Board / Draft Grid / Opponent Intel ───── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isTablet ? '1fr 1fr' : `${L.SPAN.BIG_BOARD}fr ${L.SPAN.DRAFT_GRID}fr ${L.SPAN.OPP_INTEL}fr`,
                    gap: L.GRID_GAP + 'px',
                    height: isTablet ? 'auto' : (L.ROW_TOP_H + 'px'),
                    marginBottom: L.GRID_GAP + 'px',
                }}>
                    <div style={{ minHeight: isTablet ? 500 : '100%', minWidth: 0 }}>
                        <BigBoardPanel state={state} dispatch={dispatch} isUserTurn={isUserTurn} />
                    </div>
                    <div style={{ minHeight: isTablet ? 500 : '100%', minWidth: 0 }}>
                        <DraftGridPanel state={state} dispatch={dispatch} isUserTurn={isUserTurn} currentSlot={currentSlot} />
                    </div>
                    {!isTablet && (
                        <div style={{ minHeight: '100%', minWidth: 0 }}>
                            <OpponentIntelPanel state={state} dispatch={dispatch} currentSlot={currentSlot} onPropose={onPropose} />
                        </div>
                    )}
                </div>

                {/* ── BOTTOM ROW: Live Analytics / Alex Stream ───── */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isTablet
                        ? '1fr 1fr'
                        : '5fr 3fr 4fr',
                    gap: L.GRID_GAP + 'px',
                    height: isTablet ? 'auto' : L.ROW_BOTTOM_H + 'px',
                }}>
                    {isTablet && (
                        <div style={{ minHeight: 240, minWidth: 0 }}>
                            <OpponentIntelPanel state={state} dispatch={dispatch} currentSlot={currentSlot} onPropose={onPropose} />
                        </div>
                    )}
                    <div style={{ minHeight: isTablet ? 240 : '100%', minWidth: 0 }}>
                        <LiveAnalyticsPanel state={state} />
                    </div>
                    <div style={{ minHeight: isTablet ? 240 : '100%', minWidth: 0 }}>
                        <MyDraftRosterPanel state={state} />
                    </div>
                    <div style={{ minHeight: isTablet ? 240 : '100%', minWidth: 0 }}>
                        <AlexStreamPanel state={state} dispatch={dispatch} />
                    </div>
                </div>

                {/* Phase 3: CPU trade offer modal (fixed-position) */}
                {state.activeOffer && TradeModal && <TradeModal state={state} dispatch={dispatch} />}

                {/* Phase 3: User trade proposer drawer (fixed-position) */}
                {state.proposerDrawer && TradeProposer && <TradeProposer state={state} dispatch={dispatch} />}

                {/* Phase 7: Post-draft recap — full-screen modal with grade + per-position + roster + export */}
                {state.phase === 'complete' && (() => {
                    const stateHelpers = window.DraftCC?.state || {};
                    const recap = stateHelpers.buildDraftRecap
                        ? stateHelpers.buildDraftRecap(state, { grade })
                        : null;
                    // Build per-position summary from myPicks
                    const posSummary = {};
                    (myPicks || []).forEach(pk => {
                        const normalized = stateHelpers.normalizePickRecord ? stateHelpers.normalizePickRecord(pk) : pk;
                        const pos = (normalized?.pos || pk.player?.position || pk.pos || '').toUpperCase();
                        if (!pos) return;
                        if (!posSummary[pos]) posSummary[pos] = { count: 0, dhq: 0, players: [] };
                        posSummary[pos].count += 1;
                        posSummary[pos].dhq += (normalized?.dhq || pk.player?.dhq || pk.dhq || 0);
                        posSummary[pos].players.push(normalized?.name || pk.player?.full_name || pk.player?.name || pk.name || pk.pid);
                    });
                    const POS_ORDER = ['QB','RB','WR','TE','K','DL','LB','DB'];
                    const orderedPositions = POS_ORDER.filter(p => posSummary[p]).concat(Object.keys(posSummary).filter(p => !POS_ORDER.includes(p)));

                    const gradeColor = grade.letter.startsWith('A') ? '#2ECC71' : grade.letter.startsWith('B') ? '#D4AF37' : grade.letter.startsWith('C') ? '#F0A500' : '#E74C3C';

                    // League-wide percentile — how our total DHQ ranks
                    const allDraftTotals = recap?.leagueTotals || (stateHelpers.leagueTotalsFromPicks ? stateHelpers.leagueTotalsFromPicks(state.picks || []) : {});
                    const totals = Object.values(allDraftTotals).sort((a, b) => b - a);
                    const myRank = recap?.rank || (totals.indexOf(grade.totalDHQ) + 1);
                    const myPct = recap?.percentile ?? (totals.length ? Math.round(((totals.length - myRank) / Math.max(1, totals.length - 1)) * 100) : 0);

                    return (
                        <div style={{
                            position: 'fixed', inset: 0, background: 'rgba(5,6,9,0.82)',
                            zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '24px', animation: 'wrFadeIn 0.2s ease'
                        }} onClick={e => { if (e.target === e.currentTarget) onExit && onExit(); }}>
                            <div style={{
                                width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto',
                                background: '#0a0b0d', border: '2px solid ' + gradeColor + '55',
                                borderRadius: '16px', boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
                            }}>
                                {/* Hero */}
                                <div style={{ padding: '28px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, ' + gradeColor + '15, transparent 70%)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '6px' }}>Draft Complete — Recap</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                        <div style={{ fontFamily: FONT_DISPL, fontSize: '5.5rem', fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{grade.letter}</div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall Draft Grade</div>
                                            <div style={{ fontSize: '0.96rem', color: 'var(--white)', marginTop: '6px', lineHeight: 1.5 }}>
                                                Total DHQ: <strong style={{ color: gradeColor }}>{grade.totalDHQ.toLocaleString()}</strong> across {myPicks.length} pick{myPicks.length === 1 ? '' : 's'} · {grade.pct}% value capture
                                            </div>
                                            {totals.length >= 3 && (
                                                <div style={{ fontSize: '0.82rem', color: 'var(--silver)', marginTop: '4px' }}>
                                                    You finished <strong style={{ color: myRank <= 3 ? '#2ECC71' : myRank <= totals.length / 2 ? 'var(--gold)' : '#E74C3C' }}>#{myRank}</strong> of {totals.length} teams by draft DHQ ({myPct}th percentile)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Per-position breakdown */}
                                <div style={{ padding: '22px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>Positional Breakdown</div>
                                    {orderedPositions.length ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                            {orderedPositions.map(pos => {
                                                const s = posSummary[pos];
                                                const posCol = (window.App?.POS_COLORS || {})[pos] || 'var(--silver)';
                                                return <div key={pos} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid ' + posCol }}>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: posCol, letterSpacing: '0.04em' }}>{pos}</div>
                                                    <div style={{ fontFamily: FONT_DISPL, fontSize: '1.2rem', fontWeight: 700, color: 'var(--white)', marginTop: '2px' }}>{s.count}</div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.7 }}>{s.dhq.toLocaleString()} DHQ</div>
                                                </div>;
                                            })}
                                        </div>
                                    ) : <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6 }}>No picks on record.</div>}
                                </div>

                                {/* Pick-by-pick roster list */}
                                <div style={{ padding: '22px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--gold)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>Your Draft Class</div>
                                    {(myPicks || []).length ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {myPicks.map((pk, i) => {
                                                const normalized = stateHelpers.normalizePickRecord ? stateHelpers.normalizePickRecord(pk) : pk;
                                                const p = pk.player || {};
                                                const pos = (normalized?.pos || p.position || pk.pos || '').toUpperCase();
                                                const posCol = (window.App?.POS_COLORS || {})[pos] || 'var(--silver)';
                                                const dhq = normalized?.dhq || p.dhq || pk.dhq || 0;
                                                const dhqCol = dhq >= 7000 ? '#2ECC71' : dhq >= 4000 ? '#3498DB' : 'var(--silver)';
                                                return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }}>
                                                    <span style={{ fontFamily: FONT_DISPL, fontSize: '0.72rem', color: 'var(--gold)', width: '48px' }}>
                                                        {pk.round && pk.pickInRound ? (pk.round + '.' + String(pk.pickInRound).padStart(2, '0')) : ('#' + (i + 1))}
                                                    </span>
                                                    <img src={'https://sleepercdn.com/content/nfl/players/thumb/' + pk.pid + '.jpg'} alt="" onError={e => e.target.style.display = 'none'} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                                                    <span style={{ flex: 1, fontSize: '0.84rem', color: 'var(--white)', fontWeight: 600 }}>{normalized?.name || p.full_name || p.name || pk.name || pk.pid}</span>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: posCol, padding: '1px 6px', background: 'rgba(0,0,0,0.4)', borderRadius: '3px' }}>{pos}</span>
                                                    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.82rem', color: dhqCol, minWidth: '56px', textAlign: 'right' }}>{dhq > 0 ? dhq.toLocaleString() : '—'}</span>
                                                </div>;
                                            })}
                                        </div>
                                    ) : <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6 }}>No picks made.</div>}
                                </div>

                                {/* Alex commentary */}
                                <div style={{ padding: '22px 32px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: 'linear-gradient(135deg, #D4AF37, #B8941E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.56rem', fontWeight: 800, color: '#0A0A0A' }}>AI</div>
                                        <span style={{ fontFamily: FONT_DISPL, fontSize: '0.82rem', color: 'var(--gold)', letterSpacing: '0.06em' }}>Alex's Take</span>
                                    </div>
                                    <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,0.05)', borderLeft: '3px solid rgba(212,175,55,0.4)', borderRadius: '0 6px 6px 0', fontSize: '0.84rem', color: 'var(--silver)', lineHeight: 1.55 }}>
                                        {(() => {
                                            const topPos = orderedPositions[0] || 'skill positions';
                                            const letterPhrase = grade.letter.startsWith('A') ? "one of the best drafts in the league — you captured elite value" : grade.letter.startsWith('B') ? "a solid class with clear upside" : grade.letter.startsWith('C') ? "a middling haul, with room for growth" : "a tough draft — the value just wasn't there at your slots";
                                            return "This was " + letterPhrase + ". You leaned heaviest at " + topPos + " (" + (posSummary[orderedPositions[0]]?.count || 0) + " picks) and banked " + grade.totalDHQ.toLocaleString() + " DHQ across " + myPicks.length + " selections. " + (myRank <= 3 ? "You're top-3 by draft DHQ — this class sets you up for a run." : myRank <= totals.length / 2 ? "You're in the upper half — now the work is in the development window." : "You'll need to work the waiver wire and trade market to close the gap.");
                                        })()}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ padding: '18px 32px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <button onClick={() => {
                                        try {
                                            const key = 'wr_draft_recap_' + Date.now();
                                            const payload = stateHelpers.saveDraftRecap
                                                ? stateHelpers.saveDraftRecap(state, { grade, key })
                                                : recap;
                                            if (!payload) localStorage.setItem(key, JSON.stringify(recap || {}));
                                            alert('Draft recap saved locally (' + key + ')');
                                        } catch (e) { alert('Save failed: ' + e.message); }
                                    }} style={{ padding: '10px 22px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.35)', borderRadius: '6px', fontFamily: FONT_DISPL, fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>SAVE RECAP</button>
                                    <button onClick={() => {
                                        try {
                                            const text = stateHelpers.formatDraftRecapText
                                                ? stateHelpers.formatDraftRecapText(recap || stateHelpers.buildDraftRecap(state, { grade }))
                                                : 'Draft Recap - ' + grade.letter;
                                            const blob = new Blob([text], { type: 'text/plain' });
                                            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'draft-recap-' + Date.now() + '.txt'; a.click(); URL.revokeObjectURL(url);
                                        } catch (e) { alert('Export failed: ' + e.message); }
                                    }} style={{ padding: '10px 22px', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', fontFamily: FONT_DISPL, fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>EXPORT .TXT</button>
                                    <button onClick={onExit} style={{ padding: '10px 22px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: FONT_DISPL, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>DRAFT AGAIN</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    }

    function LiveSyncStatusBanner({ state, liveSync, currentSlot, dispatch, layoutGap }) {
        const status = liveSync?.status || 'idle';
        const color = status === 'mirroring' ? '#2ECC71'
            : status === 'waiting' ? '#F0A500'
                : status === 'complete' ? 'var(--gold)'
                    : '#E74C3C';
        const label = status === 'mirroring' ? 'Mirror Healthy'
            : status === 'waiting' ? 'Waiting Room'
                : status === 'complete' ? 'Draft Complete'
                    : status === 'stale' ? 'Sync Needs Attention'
                        : status === 'error' ? 'Poll Error'
                            : 'Live Sync';
        const text = status === 'waiting'
            ? 'Sleeper has not posted picks yet. War Room is polling and will mirror the room when pick 1 lands.'
            : status === 'mirroring'
                ? 'Read-only mirror active. Last checked ' + formatLiveClockTime(liveSync?.lastPollAt) + '.'
                : status === 'complete'
                    ? 'Sleeper marked this draft complete. Review your class and next moves.'
                    : (liveSync?.error || 'War Room paused live application until the Sleeper feed reconciles.');
        const current = currentSlot
            ? 'Next local slot: R' + currentSlot.round + '.' + String(currentSlot.slot || 0).padStart(2, '0') + ' · #' + currentSlot.overall
            : 'No next slot';
        return (
            <div style={{
                padding: '9px 14px',
                marginBottom: (layoutGap || 8) + 'px',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(155,138,251,0.24)',
                borderLeft: '3px solid ' + color,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontFamily: FONT_UI,
            }}>
                <div style={{ color, fontWeight: 900, fontFamily: FONT_DISPL, fontSize: '0.78rem', minWidth: 92 }}>
                    {label}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--silver)', fontSize: '0.66rem', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {text}
                    </div>
                    <div style={{ color: 'var(--silver)', opacity: 0.62, fontSize: '0.56rem', marginTop: 2 }}>
                        {current} · Sleeper picks seen: {liveSync?.remotePickCount || 0} · Applied: {state.currentIdx || 0}
                    </div>
                </div>
                {(liveSync?.duplicateCount || liveSync?.missedPickCount) > 0 && (
                    <div style={{ color: '#F0A500', fontSize: '0.58rem', fontWeight: 800, textAlign: 'right', flexShrink: 0 }}>
                        {liveSync?.duplicateCount || 0} dup · {liveSync?.missedPickCount || 0} gap
                    </div>
                )}
                {dispatch && state.phase === 'drafting' && (
                    <button
                        onClick={() => dispatch({ type: 'SET_OVERRIDE', enabled: !state.overrideMode })}
                        title={state.overrideMode ? 'Return to read-only Sleeper mirror' : 'Apply the next pick manually from the Big Board'}
                        style={liveMiniButtonStyle(
                            state.overrideMode ? 'rgba(155,138,251,0.22)' : 'rgba(255,255,255,0.035)',
                            state.overrideMode ? 'rgba(214,208,255,0.98)' : 'var(--silver)',
                            state.overrideMode ? 'rgba(155,138,251,0.45)' : 'rgba(255,255,255,0.12)'
                        )}
                    >
                        {state.overrideMode ? 'MANUAL ON' : 'MANUAL PICK'}
                    </button>
                )}
            </div>
        );
    }

    function StagedLiveOffersPanel({ offers, sleeperDraftId, dispatch, layoutGap }) {
        if (!offers || !offers.length) return null;
        const counts = offers.reduce((acc, offer) => {
            const status = offer.status || 'staged';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
        return (
            <div style={{
                padding: '9px 14px',
                marginBottom: (layoutGap || 8) + 'px',
                background: 'rgba(124,107,248,0.045)',
                border: '1px solid rgba(155,138,251,0.24)',
                borderRadius: '6px',
                fontFamily: FONT_UI,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
                    <div style={{ color: 'rgba(155,138,251,1)', fontSize: '0.58rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Staged Live Offers
                        <span style={{ marginLeft: 8, color: 'var(--silver)', opacity: 0.7, fontWeight: 700 }}>
                            {(counts.pending || 0)} pending · {(counts.accepted || 0)} accepted · {(counts.rejected || 0)} rejected
                        </span>
                    </div>
                    {sleeperDraftId && (
                        <button
                            onClick={() => window.open(sleeperDraftUrl(sleeperDraftId), '_blank', 'noopener,noreferrer')}
                            style={liveMiniButtonStyle('rgba(155,138,251,0.16)', 'rgba(214,208,255,0.98)', 'rgba(155,138,251,0.34)')}
                        >
                            OPEN SLEEPER
                        </button>
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {offers.slice(0, 3).map(offer => (
                        <StagedOfferRow
                            key={offer.id}
                            offer={offer}
                            dispatch={dispatch}
                            onDismiss={() => dispatch({ type: 'DISMISS_STAGED_LIVE_OFFER', offerId: offer.id })}
                        />
                    ))}
                </div>
            </div>
        );
    }

    function StagedOfferRow({ offer, dispatch, onDismiss }) {
        const [copied, setCopied] = React.useState(false);
        const onCopy = () => copyLiveText(offer.copyText || '').then(ok => {
            setCopied(ok);
            setTimeout(() => setCopied(false), 1400);
        });
        const status = offer.status || 'staged';
        const statusColor = status === 'accepted' ? '#2ECC71'
            : status === 'rejected' ? '#E74C3C'
                : status === 'pending' ? 'var(--gold)'
                    : 'rgba(155,138,251,0.95)';
        const updateStatus = nextStatus => dispatch?.({ type: 'UPDATE_LIVE_OFFER_STATUS', offerId: offer.id, status: nextStatus });
        return (
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto auto auto',
                alignItems: 'center',
                gap: 8,
                padding: '7px 8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '5px',
            }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--white)', fontSize: '0.66rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {offer.partnerName || 'Trade partner'} · {offer.likelihood || 0}% / {offer.acceptanceLine || 70}% Buyer Line
                    </div>
                    <div style={{ color: 'var(--silver)', opacity: 0.74, fontSize: '0.56rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                        <span style={{ color: statusColor, fontWeight: 800, textTransform: 'uppercase' }}>{status}</span> · Give {offer.giveText || 'package'} / Get {offer.getText || 'package'}
                    </div>
                </div>
                <button onClick={onCopy} style={liveMiniButtonStyle('rgba(46,204,113,0.11)', '#2ECC71', 'rgba(46,204,113,0.28)')}>
                    {copied ? 'COPIED' : 'COPY'}
                </button>
                <button onClick={() => updateStatus('pending')} style={liveMiniButtonStyle(status === 'pending' ? 'rgba(212,175,55,0.15)' : 'transparent', 'var(--gold)', 'rgba(212,175,55,0.28)')}>
                    SENT
                </button>
                <button onClick={() => updateStatus('accepted')} style={liveMiniButtonStyle(status === 'accepted' ? 'rgba(46,204,113,0.16)' : 'transparent', '#2ECC71', 'rgba(46,204,113,0.28)')}>
                    YES
                </button>
                <button onClick={() => updateStatus('rejected')} style={liveMiniButtonStyle(status === 'rejected' ? 'rgba(231,76,60,0.16)' : 'transparent', '#E74C3C', 'rgba(231,76,60,0.28)')}>
                    NO
                </button>
                <button onClick={onDismiss} style={liveMiniButtonStyle('transparent', 'var(--silver)', 'rgba(255,255,255,0.12)')}>
                    ×
                </button>
            </div>
        );
    }

    function liveMiniButtonStyle(background, color, borderColor) {
        return {
            padding: '4px 7px',
            background,
            border: '1px solid ' + borderColor,
            borderRadius: '4px',
            color,
            cursor: 'pointer',
            fontFamily: FONT_UI,
            fontSize: '0.55rem',
            fontWeight: 900,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
        };
    }

    function copyLiveText(text) {
        if (!text) return Promise.resolve(false);
        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
        }
        window.prompt('Copy live offer summary:', text);
        return Promise.resolve(true);
    }

    function liveTone(tone) {
        if (tone === 'green') return { main: '#2ECC71', bg: 'rgba(46,204,113,0.08)', border: 'rgba(46,204,113,0.26)' };
        if (tone === 'purple') return { main: 'rgba(155,138,251,1)', bg: 'rgba(155,138,251,0.08)', border: 'rgba(155,138,251,0.28)' };
        if (tone === 'red') return { main: '#E74C3C', bg: 'rgba(231,76,60,0.08)', border: 'rgba(231,76,60,0.28)' };
        if (tone === 'amber') return { main: '#F0A500', bg: 'rgba(240,165,0,0.08)', border: 'rgba(240,165,0,0.28)' };
        return { main: 'var(--gold)', bg: 'rgba(212,175,55,0.08)', border: 'rgba(212,175,55,0.28)' };
    }

    function shortLiveValue(value) {
        const n = Number(value || 0);
        if (!n) return '0';
        return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
    }

    function openLiveDecisionPlayer(player) {
        if (!player?.pid) return;
        if (typeof window.openPlayerModal === 'function') {
            try { window.openPlayerModal(player.pid); return; } catch (_) {}
        }
        if (typeof window.WR?.openPlayerCard === 'function') {
            try { window.WR.openPlayerCard(player.pid); } catch (_) {}
        }
    }

    function LiveDecisionDeckPanel({ deck, onTrade, layoutGap }) {
        const cards = deck?.cards || [];
        if (!cards.length) return null;
        const next = deck?.nextUserPick;
        const nextLabel = next
            ? (next.picksAway === 0 ? 'You are on deck now' : next.picksAway + ' picks to your next turn')
            : 'No user pick remaining';
        return (
            <div style={{
                padding: '10px 14px',
                marginBottom: (layoutGap || 8) + 'px',
                background: 'rgba(255,255,255,0.022)',
                border: '1px solid rgba(212,175,55,0.22)',
                borderRadius: '6px',
                fontFamily: FONT_UI,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ color: 'var(--gold)', fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', flex: 1 }}>
                        On-Clock Decision Deck
                    </div>
                    <div style={{ color: 'var(--silver)', opacity: 0.66, fontSize: '0.56rem', fontWeight: 700 }}>
                        {nextLabel} · {deck.assumptions?.boardLane || 'dhq'} board
                    </div>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
                    gap: 7,
                    marginBottom: deck.alerts?.length ? 8 : 0,
                }}>
                    {cards.map(card => {
                        const tone = liveTone(card.tone);
                        const player = card.player;
                        const clickable = card.action === 'trade' || player?.pid;
                        return (
                            <button
                                key={card.kind + ':' + (player?.pid || card.detail || '')}
                                onClick={() => card.action === 'trade' ? onTrade?.() : openLiveDecisionPlayer(player)}
                                disabled={!clickable}
                                style={{
                                    minWidth: 0,
                                    padding: '8px 9px',
                                    background: tone.bg,
                                    border: '1px solid ' + tone.border,
                                    borderLeft: '3px solid ' + tone.main,
                                    borderRadius: '5px',
                                    textAlign: 'left',
                                    cursor: clickable ? 'pointer' : 'default',
                                    fontFamily: FONT_UI,
                                    color: 'var(--silver)',
                                }}
                            >
                                <div style={{ color: tone.main, fontSize: '0.52rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                                    {card.label}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, marginBottom: 4 }}>
                                    {player?.pos && (
                                        <span style={{ flexShrink: 0, color: tone.main, border: '1px solid ' + tone.border, borderRadius: 3, padding: '0 4px', fontSize: '0.52rem', fontWeight: 900 }}>
                                            {player.pos}
                                        </span>
                                    )}
                                    <strong style={{ color: 'var(--white)', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {player?.name || card.detail}
                                    </strong>
                                </div>
                                {player && (
                                    <div style={{ display: 'flex', gap: 7, color: 'var(--silver)', opacity: 0.78, fontSize: '0.54rem', fontFamily: FONT_MONO, marginBottom: 4 }}>
                                        <span>DHQ {shortLiveValue(player.dhq)}</span>
                                        <span>Y5 {shortLiveValue(player.y5)}</span>
                                        {player.tier && <span>T{player.tier}</span>}
                                    </div>
                                )}
                                <div style={{ color: 'var(--silver)', opacity: 0.76, fontSize: '0.56rem', lineHeight: 1.35 }}>
                                    {player ? card.detail : (card.drivers || []).slice(0, 2).join(' · ')}
                                </div>
                            </button>
                        );
                    })}
                </div>
                {!!deck.alerts?.length && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {deck.alerts.map(alert => {
                            const tone = liveTone(alert.tone);
                            return (
                                <div key={alert.type + ':' + alert.title} style={{
                                    flex: '1 1 190px',
                                    minWidth: 0,
                                    padding: '6px 8px',
                                    background: tone.bg,
                                    border: '1px solid ' + tone.border,
                                    borderRadius: '4px',
                                }}>
                                    <div style={{ color: tone.main, fontSize: '0.52rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{alert.title}</div>
                                    <div style={{ color: 'var(--silver)', opacity: 0.8, fontSize: '0.56rem', lineHeight: 1.35, marginTop: 2 }}>{alert.text}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    function LiveTradeWindowBanner({ tradeWindow, onOpen, layoutGap }) {
        if (!tradeWindow) return null;
            const suggestion = tradeWindow.suggestion || {};
            const proposal = suggestion.proposal || {};
            const give = formatTradePackageSide(proposal, 'my');
            const get = formatTradePackageSide(proposal, 'their');
            const clears = tradeWindow.likelihood >= tradeWindow.acceptanceLine;
            const statusColor = clears ? '#2ECC71' : '#F0A500';
            return (
                <div style={{
                    padding: '9px 14px',
                    marginBottom: (layoutGap || 8) + 'px',
                    background: 'rgba(124,107,248,0.055)',
                    border: '1px solid rgba(155,138,251,0.28)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    minHeight: 48,
                    fontFamily: FONT_UI,
                }}>
                    <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        border: '1px solid rgba(155,138,251,0.45)',
                        color: 'rgba(155,138,251,1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: FONT_DISPL,
                        fontWeight: 800,
                        flexShrink: 0,
                    }}>T</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            minWidth: 0,
                            marginBottom: 2,
                        }}>
                            <span style={{ fontSize: '0.58rem', color: 'rgba(155,138,251,1)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, flexShrink: 0 }}>
                                Live Trade Window
                            </span>
                            <span style={{ color: 'var(--white)', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {tradeWindow.teamName} · {tradeWindow.pickLabel}
                            </span>
                        </div>
                        <div style={{ color: 'var(--silver)', fontSize: '0.64rem', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {liveTradeTimingLabel(tradeWindow)} · {suggestion.label || tradeWindow.motive || 'Package'} · Give {give} / Get {get}
                        </div>
                    </div>
                    <div style={{
                        color: statusColor,
                        fontFamily: FONT_MONO,
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        textAlign: 'right',
                        flexShrink: 0,
                    }}>
                        {tradeWindow.likelihood}% / {tradeWindow.acceptanceLine}%
                        <div style={{ color: 'var(--silver)', opacity: 0.68, fontSize: '0.52rem', fontFamily: FONT_UI, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Buyer Line
                        </div>
                    </div>
                    <button
                        onClick={onOpen}
                        style={{
                            padding: '6px 10px',
                            background: 'rgba(155,138,251,0.14)',
                            border: '1px solid rgba(155,138,251,0.34)',
                            borderRadius: '4px',
                            color: 'rgba(214,208,255,0.98)',
                            cursor: 'pointer',
                            fontFamily: FONT_UI,
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            flexShrink: 0,
                        }}
                    >
                        OPEN TRADE DESK
                    </button>
                </div>
            );
        }

        // ── Mobile: read-only feed ───────────────────────────────────────
        function MobileFeed({ state, dispatch, onStart, isUserTurn, currentSlot }) {
        const BigBoardPanel = window.DraftCC.BigBoardPanel;
        const DraftGridPanel = window.DraftCC.DraftGridPanel;
        const AlexStreamPanel = window.DraftCC.AlexStreamPanel;

        if (state.phase === 'setup') {
            return (
                <div style={{ padding: '16px', fontFamily: FONT_UI, textAlign: 'center' }}>
                    <div style={{
                        padding: '14px 18px',
                        background: 'rgba(240,165,0,0.08)',
                        border: '1px solid rgba(240,165,0,0.25)',
                        borderRadius: '8px',
                        marginBottom: '16px',
                        fontSize: '0.76rem',
                        color: '#F0A500',
                        lineHeight: 1.5,
                    }}>
                        📱 Run mock drafts on desktop for the full 6-panel experience.
                        Mobile supports a read-only feed view.
                    </div>
                    <button onClick={onStart} style={{
                        width: '100%',
                        padding: '14px',
                        background: 'var(--gold)',
                        color: 'var(--black)',
                        border: 'none',
                        borderRadius: '8px',
                        fontFamily: FONT_DISPL,
                        fontSize: '1rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        letterSpacing: '0.06em',
                    }}>
                        START MOCK DRAFT
                    </button>
                </div>
            );
        }

        return (
            <div style={{ fontFamily: FONT_UI, padding: '4px 0' }}>
                <div style={{ height: 400, marginBottom: 10 }}>
                    <BigBoardPanel state={state} dispatch={dispatch} isUserTurn={isUserTurn} />
                </div>
                <div style={{ height: 260, marginBottom: 10 }}>
                    <AlexStreamPanel state={state} dispatch={dispatch} />
                </div>
                <div style={{ height: 300 }}>
                    <DraftGridPanel state={state} dispatch={dispatch} isUserTurn={isUserTurn} currentSlot={currentSlot} />
                </div>
            </div>
        );
    }

    // ── Expose ───────────────────────────────────────────────────────
    window.DraftCommandCenter = DraftCommandCenter;
    window.DraftCC = window.DraftCC || {};
    window.DraftCC.featureFlag = {
        key: FEATURE_FLAG_KEY,
        isEnabled: isFeatureEnabled,
    };
})();
