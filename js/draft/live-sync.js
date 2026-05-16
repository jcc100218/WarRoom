// ══════════════════════════════════════════════════════════════════
// js/draft/live-sync.js — Live Sync mode (mirror a real Sleeper draft)
//
// Polls Sleeper every 5s during an active Sleeper draft. Mirrors only
// newly observed picks and reports poll health/status back to draftState.
//
// SAFETY: read-only. Never writes picks back to Sleeper. Zero risk to a
// real draft.
//
// Phase 5 ships a functional poll loop + start/stop controls. The full
// "predict what SHOULD happen next" overlay is deferred to post-5.
//
// Depends on: window.Sleeper.fetchDraftPicks, state.js
// Exposes:    window.DraftCC.liveSync.{ start, stop, isRunning }
// ══════════════════════════════════════════════════════════════════

(function() {
    const POLL_INTERVAL_MS = 5000;
    const STALE_AFTER_MS = POLL_INTERVAL_MS * 3;
    let _pollTimer = null;
    let _lastPickNo = 0;
    let _seenPickKeys = new Set();
    let _lastSuccessAt = 0;

    function isRunning() {
        return !!_pollTimer;
    }

    /**
     * start — begin polling a Sleeper draft. On each poll, reports status;
     * when new picks are detected, calls onNewPicks(newPicks, snapshot).
     *
     * @param {string} draftId
     * @param {(picks: object[], snapshot: object) => void} onNewPicks
     * @param {Object} opts — { initialPickNo, seenPickKeys, onStatus }
     */
    function start(draftId, onNewPicks, opts = {}) {
        if (_pollTimer) stop();
        if (!draftId || typeof onNewPicks !== 'function') return;

        _lastPickNo = Number(opts.initialPickNo || 0);
        _seenPickKeys = new Set(opts.seenPickKeys || []);
        _lastSuccessAt = 0;
        const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : null;
        const poll = async () => {
            try {
                let picks = null;
                let meta = null;
                if (window.Sleeper?.fetchDraftPicks) {
                    picks = await window.Sleeper.fetchDraftPicks(draftId);
                } else {
                    const resp = await fetch('https://api.sleeper.app/v1/draft/' + draftId + '/picks');
                    if (resp.ok) picks = await resp.json();
                }
                try {
                    if (window.Sleeper?.fetchDraft) {
                        meta = await window.Sleeper.fetchDraft(draftId);
                    } else {
                        const metaResp = await fetch('https://api.sleeper.app/v1/draft/' + draftId);
                        if (metaResp.ok) meta = await metaResp.json();
                    }
                } catch (_) {}
                if (!Array.isArray(picks)) return;
                const snapshot = reconcilePicks(picks, {
                    initialPickNo: _lastPickNo,
                    seenPickKeys: _seenPickKeys,
                    draftStatus: meta?.status,
                });
                _lastPickNo = Math.max(_lastPickNo, snapshot.lastPickNo || 0);
                _seenPickKeys = new Set(snapshot.seenPickKeys || []);
                _lastSuccessAt = Date.now();

                if (onStatus) onStatus({
                    status: statusFor(meta?.status, snapshot.remotePickCount),
                    draftStatus: meta?.status || '',
                    lastPollAt: _lastSuccessAt,
                    lastPickNo: snapshot.lastPickNo,
                    remotePickCount: snapshot.remotePickCount,
                    duplicateCount: snapshot.duplicateCount,
                    stale: false,
                    error: null,
                });
                if (snapshot.newPicks.length) onNewPicks(snapshot.newPicks, snapshot);
            } catch (e) {
                const now = Date.now();
                const stale = !_lastSuccessAt || now - _lastSuccessAt >= STALE_AFTER_MS;
                if (onStatus) onStatus({
                    status: stale ? 'stale' : 'error',
                    lastPollAt: _lastSuccessAt || null,
                    stale,
                    error: e?.message || 'Live sync poll failed.',
                });
                if (window.wrLog) window.wrLog('liveSync.poll', e);
            }
        };

        // Fire immediately then on interval
        poll();
        _pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    }

    function pickKey(pick) {
        if (!pick) return '';
        if (pick.pick_id) return 'id:' + pick.pick_id;
        if (pick.pick_no) return 'no:' + pick.pick_no;
        return [pick.round, pick.draft_slot, pick.roster_id, pick.player_id].filter(Boolean).join(':');
    }

    function statusFor(draftStatus, remotePickCount) {
        if (draftStatus === 'complete') return 'complete';
        if (draftStatus === 'drafting') return 'mirroring';
        if (remotePickCount > 0) return 'mirroring';
        return 'waiting';
    }

    function reconcilePicks(picks, opts = {}) {
        const initialPickNo = Number(opts.initialPickNo || 0);
        const seen = new Set(opts.seenPickKeys || []);
        const sorted = (Array.isArray(picks) ? picks : [])
            .slice()
            .sort((a, b) => (Number(a.pick_no) || 0) - (Number(b.pick_no) || 0));
        const newPicks = [];
        let duplicateCount = 0;
        let lastPickNo = initialPickNo;

        sorted.forEach(pick => {
            const pickNo = Number(pick.pick_no || 0);
            const key = pickKey(pick);
            if (key && seen.has(key)) {
                duplicateCount += 1;
                lastPickNo = Math.max(lastPickNo, pickNo);
                return;
            }
            if (pickNo <= initialPickNo) {
                if (key) seen.add(key);
                duplicateCount += 1;
                lastPickNo = Math.max(lastPickNo, pickNo);
                return;
            }
            if (key) seen.add(key);
            lastPickNo = Math.max(lastPickNo, pickNo);
            newPicks.push(pick);
        });

        return {
            newPicks,
            duplicateCount,
            lastPickNo,
            remotePickCount: sorted.length,
            seenPickKeys: Array.from(seen),
            draftStatus: opts.draftStatus || '',
        };
    }

    function stop() {
        if (_pollTimer) {
            clearInterval(_pollTimer);
            _pollTimer = null;
        }
        _lastPickNo = 0;
        _seenPickKeys = new Set();
        _lastSuccessAt = 0;
    }

    window.DraftCC = window.DraftCC || {};
    window.DraftCC.liveSync = {
        POLL_INTERVAL_MS,
        STALE_AFTER_MS,
        start,
        stop,
        isRunning,
        _private: {
            pickKey,
            reconcilePicks,
            statusFor,
        },
    };
})();
