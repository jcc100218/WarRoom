// ══════════════════════════════════════════════════════════════════
// js/tabs/flash-brief.js — FlashBriefPanel: Quick action summary for
// the Brief tab: team diagnosis, FAAB, churn alerts, draft countdown
// Extracted from league-detail.js. Props: all required state from LeagueDetail.
// ══════════════════════════════════════════════════════════════════

function FlashBriefPanel({
  myRoster,
  rankedTeams,
  sleeperUserId,
  currentLeague,
  activeYear,
  setActiveTab,
  briefDraftInfo,
  playersData,
  statsData,
  setReconPanelOpen,
  sendReconMessage,
}) {
    const myAssess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
    const tier = (myAssess?.tier || 'UNKNOWN').toUpperCase();
    const hs = myAssess?.healthScore || 0;
    const needs = myAssess?.needs || [];
    const elites = typeof window.App?.countElitePlayers === 'function' ? window.App.countElitePlayers(myRoster?.players || []) : 0;
    const myRank = rankedTeams.findIndex(t => t.userId === sleeperUserId) + 1;
    const scores = window.App?.LI?.playerScores || {};

    // FAAB
    const budget = currentLeague?.settings?.waiver_budget || 0;
    const spent = myRoster?.settings?.waiver_budget_used || 0;
    const faabRemaining = Math.max(0, budget - spent);

    return (
        <div style={{ padding: '16px', maxWidth: '800px', margin: '0 auto' }} className="wr-fade-in">
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--gold)', letterSpacing: '0.05em', marginBottom: '12px' }}>BRIEF</div>

            {/* 1. Alex Ingram Diagnosis */}
            <GMMessage compact>
                {tier === 'REBUILDING' ? 'Rebuilding phase.' : tier === 'CONTENDER' || tier === 'ELITE' ? 'You\'re in contention.' : 'At a crossroads.'}
                {' Ranked #' + myRank + ' of ' + rankedTeams.length + '.'}
                {' Health: ' + hs + '. ' + elites + ' elite player' + (elites !== 1 ? 's' : '') + '.'}
                {needs.length ? ' Weakest at ' + needs.slice(0, 3).map(n => typeof n === 'string' ? n : n.pos).join(', ') + '.' : ''}
                {needs.length && needs[0] ? ' Priority: acquire ' + (typeof needs[0] === 'string' ? needs[0] : needs[0].pos) + ' starter.' : ''}
            </GMMessage>

            {/* 2. BUY action — biggest need */}
            {needs.length > 0 && (() => {
                const _normPos = window.App?.normPos || (p => p);
                const _rosteredSet = new Set();
                (currentLeague?.rosters || []).forEach(r => {
                    (r.players || []).concat(r.taxi || [], r.reserve || []).forEach(pid => _rosteredSet.add(String(pid)));
                });
                const _needPos = typeof needs[0] === 'string' ? needs[0] : needs[0].pos;
                const _waiverTarget = _needPos ? Object.entries(playersData || {})
                    .filter(([pid, p]) => !_rosteredSet.has(pid) && _normPos(p.position) === _needPos && p.team && p.status !== 'Inactive' && p.active !== false)
                    .map(([pid, p]) => ({ pid, name: p.full_name || ((p.first_name||'') + ' ' + (p.last_name||'')).trim(), dhq: scores[pid] || 0, team: p.team || '' }))
                    .sort((a, b) => b.dhq - a.dhq)[0] : null;
                const _tradeTarget = _needPos && !_waiverTarget ? (currentLeague?.rosters || [])
                    .filter(r => r.roster_id !== window.S?.myRosterId)
                    .flatMap(r => (r.players || []).map(pid => ({ pid, name: (playersData[pid]?.full_name || ''), dhq: scores[pid] || 0, pos: _normPos(playersData[pid]?.position || '') })))
                    .filter(p => p.pos === _needPos && p.dhq > 0)
                    .sort((a, b) => b.dhq - a.dhq)[0] : null;
                return (
                    <div style={{ background: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2ECC71', background: 'rgba(46,204,113,0.15)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'Oswald' }}>BUY</span>
                        <div>
                            {_waiverTarget ? (<>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>Target {_waiverTarget.name} on waivers</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>DHQ {_waiverTarget.dhq.toLocaleString()} · {_waiverTarget.team} · fits your {_needPos} gap</div>
                            </>) : _tradeTarget ? (<>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>Trade for {_tradeTarget.name}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>DHQ {_tradeTarget.dhq.toLocaleString()} · fills your {_needPos} gap</div>
                            </>) : (<>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>Acquire {_needPos} starter</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{typeof needs[0] === 'string' ? needs[0] : needs[0].urgency} — biggest positional gap</div>
                            </>)}
                        </div>
                    </div>
                );
            })()}

            {/* 3. Navigation CTAs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setActiveTab('trades')} style={{ flex: 1, padding: '8px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Oswald', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>FIND TRADES</button>
                <button onClick={() => setActiveTab('fa')} style={{ flex: 1, padding: '8px', background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', fontFamily: 'Oswald', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>FREE AGENTS</button>
            </div>

            {/* 4. FAAB Remaining */}
            {budget > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', marginBottom: '12px' }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: faabRemaining > budget * 0.5 ? '#2ECC71' : faabRemaining > budget * 0.25 ? 'var(--gold)' : '#E74C3C' }}>{'$' + faabRemaining}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>FAAB remaining of ${budget}</span>
            </div>}

            {/* 7. Roster Churn Alerts */}
            {(() => {
                const recentDrops = [];
                const transactions = window.S?.transactions || {};
                const curWeek = window.S?.currentWeek || 1;
                for (let w = curWeek; w >= Math.max(1, curWeek - 2); w--) {
                    (transactions['w' + w] || []).forEach(t => {
                        if (t.type !== 'free_agent' && t.type !== 'waiver') return;
                        Object.keys(t.drops || {}).forEach(pid => {
                            const dhq = scores[pid] || 0;
                            if (dhq >= 1500) {
                                const dropper = (currentLeague.users || []).find(u => {
                                    const r = (currentLeague.rosters || []).find(r2 => t.roster_ids?.includes(r2.roster_id) && r2.owner_id === u.user_id);
                                    return !!r;
                                });
                                recentDrops.push({ pid, dhq, name: playersData[pid]?.full_name || 'Unknown', pos: playersData[pid]?.position, week: w, droppedBy: dropper?.display_name || 'Unknown' });
                            }
                        });
                    });
                }
                if (!recentDrops.length) return null;
                return <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'Oswald', fontSize: '0.82rem', color: '#F0A500', letterSpacing: '0.04em', marginBottom: '6px' }}>CHURN ALERTS</div>
                    {recentDrops.slice(0, 3).map(d =>
                        <div key={d.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(d.pid); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(240,165,0,0.04)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: '6px', marginBottom: '4px', cursor: 'pointer', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--white)', fontWeight: 600 }}>{d.name}</span>
                            <span style={{ color: 'var(--silver)', fontSize: '0.72rem' }}>{d.pos} · DHQ {d.dhq.toLocaleString()} · Dropped by {d.droppedBy}</span>
                        </div>
                    )}
                </div>;
            })()}

            {/* 8. Draft Countdown */}
            {briefDraftInfo?.start_time && briefDraftInfo.status === 'pre_draft' && (() => {
                const diff = briefDraftInfo.start_time - Date.now();
                if (diff <= 0) return null;
                const days = Math.floor(diff / 86400000);
                const hours = Math.floor((diff % 86400000) / 3600000);
                return <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', marginBottom: '12px' }}>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)' }}>{days}D {hours}H</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>until draft · {new Date(briefDraftInfo.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>;
            })()}

            {/* 9. Draft Class Preview */}
            <div style={{ padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>Draft class intel available via the AI advisor.</div>
                <button onClick={() => { if (typeof setReconPanelOpen === 'function') setReconPanelOpen(true); if (typeof sendReconMessage === 'function') sendReconMessage('What are the strongest position groups in the upcoming rookie draft class?'); }} style={{ marginTop: '6px', padding: '4px 10px', fontSize: '0.72rem', fontFamily: 'Oswald', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '4px', color: 'var(--gold)', cursor: 'pointer' }}>Ask Alex about draft class</button>
            </div>

            {/* 10. Your Power Rank */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px' }}>
                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--gold)' }}>#{myRank}</span>
                <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--white)' }}>Power Ranking</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{tier} · {myRank} of {rankedTeams.length}</div>
                </div>
                <button onClick={() => setActiveTab('league')} style={{ marginLeft: 'auto', fontSize: '0.68rem', fontFamily: 'Oswald', color: 'var(--gold)', background: 'none', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>View All</button>
            </div>
        </div>
    );
}
