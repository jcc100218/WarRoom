// ══════════════════════════════════════════════════════════════════
// js/tabs/compare.js — CompareTab: standalone team-vs-team comparison.
//
// Extracted from my-team.js's former "Compare" sub-view and promoted to
// a top-level tab to match the placement mockup's ROSTER group:
//   ROSTER → Home · My Roster · Compare
//
// Shows a hero strip (DHQ stacked bar, win-pct gauges, record / titles
// / playoff record / regular-season H2H) plus a full per-position
// roster diff with stacked %-bars and player cards.
//
// Depends on: window.App.LI (playerScores, championships, bracketData),
//             window.App.normPos / POS_COLORS / peakWindows / calcPPG,
//             window.S.matchups (regular-season H2H).
// Exposes:    window.CompareTab
// ══════════════════════════════════════════════════════════════════

function CompareTab({
    currentLeague,
    myRoster,
    playersData,
    statsData,
    stats2025Data,
    standings,
    sleeperUserId,
}) {
    const [compareTeamId, setCompareTeamId] = React.useState(null);

    if (!myRoster) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--silver)' }}>No roster found</div>;
    }

    const normPos = window.App.normPos;
    const posColors = window.App.POS_COLORS;

    return (
      <div style={{ padding: '22px 26px 60px', maxWidth: '1360px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginBottom: '18px' }}>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.7rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Compare</h1>
          <span style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.65, fontFamily: 'JetBrains Mono, monospace' }}>
            Pick any team to stack against yours
          </span>
        </div>

        <select value={compareTeamId || ''} onChange={e => setCompareTeamId(parseInt(e.target.value) || null)} style={{
          padding: '8px 14px', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif',
          background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)',
          borderRadius: '6px', color: 'var(--white)', marginBottom: '18px', width: '100%', maxWidth: '340px'
        }}>
          <option value="">Select team to compare...</option>
          {standings.filter(t => t.userId !== sleeperUserId).map(t => (
            <option key={t.rosterId} value={t.rosterId}>{t.displayName} ({t.wins}-{t.losses})</option>
          ))}
        </select>

        {!compareTeamId && (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--black)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: 'var(--silver)', opacity: 0.7 }}>
            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>◎</div>
            <div style={{ fontSize: '0.9rem', lineHeight: 1.5, maxWidth: '460px', margin: '0 auto' }}>
              Pick an opponent from the dropdown. You'll get a full DHQ / record / position-by-position breakdown vs. your roster.
            </div>
          </div>
        )}

        {compareTeamId && (() => {
            const theirRoster = currentLeague.rosters.find(r => r.roster_id === compareTeamId);
            if (!theirRoster) return null;
            const theirUser = currentLeague.users?.find(u => u.user_id === theirRoster.owner_id);
            const myPlayers = (myRoster.players || []);
            const theirPlayers = (theirRoster.players || []);
            const myTotal = myPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
            const theirTotal = theirPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
            const myWins = myRoster.settings?.wins || 0;
            const myLosses = myRoster.settings?.losses || 0;
            const theirWins = theirRoster.settings?.wins || 0;
            const theirLosses = theirRoster.settings?.losses || 0;

            const champs = window.App?.LI?.championships || {};
            const myChamps = Object.values(champs).filter(c => c.champion === myRoster.roster_id).length;
            const theirChamps = Object.values(champs).filter(c => c.champion === compareTeamId).length;

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

            let h2hWins = 0, h2hLosses = 0;
            Object.values(brackets).forEach(({ winners }) => {
                (winners || []).forEach(m => {
                    if ((m.t1 === myRoster.roster_id && m.t2 === compareTeamId) || (m.t2 === myRoster.roster_id && m.t1 === compareTeamId)) {
                        if (m.w === myRoster.roster_id) h2hWins++;
                        else if (m.w === compareTeamId) h2hLosses++;
                    }
                });
            });

            // Regular-season H2H from window.S.matchups, excluding playoff weeks.
            let regH2HWins = 0, regH2HLosses = 0, regH2HTies = 0;
            try {
              const matchups = Array.isArray(window.S?.matchups) ? window.S.matchups : [];
              const playoffStart = Number(currentLeague?.settings?.playoff_week_start) || 15;
              const byWeek = {};
              matchups.forEach(m => {
                if (!m || m.roster_id == null) return;
                const wk = Number(m.week) || 0;
                if (wk >= playoffStart || wk <= 0) return;
                const k = wk + '_' + (m.matchup_id || 0);
                (byWeek[k] = byWeek[k] || []).push(m);
              });
              Object.values(byWeek).forEach(pair => {
                if (pair.length !== 2) return;
                const me = pair.find(x => x.roster_id === myRoster.roster_id);
                const them = pair.find(x => x.roster_id === compareTeamId);
                if (!me || !them) return;
                if (me.points > them.points) regH2HWins++;
                else if (me.points < them.points) regH2HLosses++;
                else regH2HTies++;
              });
            } catch (e) { /* ignore */ }

            const myWinPct = (myWins + myLosses) > 0 ? myWins / (myWins + myLosses) : 0;
            const theirWinPct = (theirWins + theirLosses) > 0 ? theirWins / (theirWins + theirLosses) : 0;
            const totalDhq = Math.max(1, myTotal + theirTotal);
            const myDhqPct = (myTotal / totalDhq) * 100;

            const myColor = 'var(--gold)';
            const theirColor = '#7C6BF8';

            return (
              <div>
                {/* Hero — DHQ stacked bar, win-pct gauges, stat tiles */}
                <div style={{ marginBottom: '16px', padding: '18px 20px', background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(124,107,248,0.06))', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: myColor, letterSpacing: '0.04em', textAlign: 'left' }}>You</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', color: 'var(--silver)', opacity: 0.6 }}>VS</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: theirColor, letterSpacing: '0.04em', textAlign: 'right' }}>{theirUser?.display_name || 'Opponent'}</div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: myColor, fontWeight: 700 }}>{myTotal.toLocaleString()} <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6 }}>DHQ</span></span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.6, alignSelf: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Roster DHQ</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: theirColor, fontWeight: 700 }}>{theirTotal.toLocaleString()} <span style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6 }}>DHQ</span></span>
                    </div>
                    <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                      <div style={{ width: myDhqPct + '%', background: `linear-gradient(90deg, ${myColor}, ${myColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '6px', fontSize: '0.58rem', color: '#0A0A0A', fontWeight: 800 }}>
                        {myDhqPct >= 12 ? Math.round(myDhqPct) + '%' : ''}
                      </div>
                      <div style={{ width: (100 - myDhqPct) + '%', background: `linear-gradient(90deg, ${theirColor}cc, ${theirColor})`, display: 'flex', alignItems: 'center', paddingLeft: '6px', fontSize: '0.58rem', color: '#0A0A0A', fontWeight: 800 }}>
                        {(100 - myDhqPct) >= 12 ? Math.round(100 - myDhqPct) + '%' : ''}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                    {[
                      { label: 'Record', my: myWins + '-' + myLosses, their: theirWins + '-' + theirLosses, myWinner: myWinPct >= theirWinPct, gauge: null, sub: null },
                      { label: 'Win %', my: Math.round(myWinPct * 100) + '%', their: Math.round(theirWinPct * 100) + '%', myWinner: myWinPct > theirWinPct, gauge: [myWinPct, theirWinPct], sub: null },
                      { label: 'Playoffs', my: myPW + '-' + myPL, their: theirPW + '-' + theirPL, myWinner: myPW >= theirPW, gauge: null, sub: null },
                      { label: 'Titles', my: myChamps + '🏆', their: theirChamps + '🏆', myWinner: myChamps >= theirChamps, gauge: null, sub: null },
                      { label: 'Reg H2H', my: regH2HWins + 'W', their: regH2HLosses + 'W', myWinner: regH2HWins > regH2HLosses, gauge: null, sub: (regH2HWins + regH2HLosses + regH2HTies) > 0 ? null : 'no data' },
                    ].map((m, i) => (
                      <div key={i} style={{ padding: '8px', background: 'var(--black)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px', opacity: 0.65 }}>{m.label}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 700, color: m.myWinner ? myColor : 'var(--silver)' }}>{m.my}</span>
                          <span style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.4 }}>·</span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 700, color: !m.myWinner ? theirColor : 'var(--silver)' }}>{m.their}</span>
                        </div>
                        {m.gauge && (
                          <div style={{ display: 'flex', height: '3px', borderRadius: '2px', overflow: 'hidden', marginTop: '5px', background: 'rgba(255,255,255,0.06)' }}>
                            <div style={{ width: (m.gauge[0] * 100) + '%', background: myColor }}></div>
                            <div style={{ width: ((1 - m.gauge[0]) * 100) + '%', background: 'transparent' }}></div>
                          </div>
                        )}
                        {m.sub && <div style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.4, marginTop: '3px' }}>{m.sub}</div>}
                      </div>
                    ))}
                  </div>

                  {(h2hWins > 0 || h2hLosses > 0) ? (
                    <div style={{ marginTop: '10px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--silver)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.65 }}>Playoff H2H</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: h2hWins > h2hLosses ? '#2ECC71' : h2hWins < h2hLosses ? '#E74C3C' : 'var(--silver)' }}>{h2hWins}-{h2hLosses}</span>
                    </div>
                  ) : null}
                </div>

                {/* Per-position comparison */}
                <div style={{ marginTop: '16px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Full Roster by Position</div>
                    {['QB','RB','WR','TE','K','DL','LB','DB'].map(pos => {
                        const peaks = window.App?.peakWindows || {};
                        const [pLo, pHi] = peaks[pos] || [24, 29];
                        const statsRef = window.S?.playerStats || statsData || {};
                        const stats2025Ref = stats2025Data || {};
                        const scoring = currentLeague?.scoring_settings;
                        const enrich = (pid) => {
                            const p = playersData[pid];
                            if (!p) return null;
                            const dhq = window.App?.LI?.playerScores?.[pid] || 0;
                            const st = statsRef[pid] || statsData?.[pid] || {};
                            const prev = stats2025Ref?.[pid] || {};
                            const curPPG = (st.gp > 0 && typeof window.App?.calcPPG === 'function') ? +window.App.calcPPG(st, scoring).toFixed(1) : 0;
                            const prevPPG = (prev.gp > 0 && typeof window.App?.calcPPG === 'function') ? +window.App.calcPPG(prev, scoring).toFixed(1) : 0;
                            const effectivePPG = curPPG > 0 ? curPPG : prevPPG;
                            const age = p.age || null;
                            const peakYrs = age ? Math.max(0, pHi - age) : 0;
                            return { pid, p, dhq, age, team: p.team || 'FA', yrsExp: p.years_exp || 0, peakYrs, ppg: effectivePPG };
                        };
                        const myAtPos = myPlayers.map(enrich).filter(r => r && normPos(r.p?.position) === pos).sort((a,b) => b.dhq - a.dhq);
                        const theirAtPos = theirPlayers.map(enrich).filter(r => r && normPos(r.p?.position) === pos).sort((a,b) => b.dhq - a.dhq);
                        if (!myAtPos.length && !theirAtPos.length) return null;
                        const maxLen = Math.max(myAtPos.length, theirAtPos.length);

                        const myPosDHQ = myAtPos.reduce((s, x) => s + x.dhq, 0);
                        const theirPosDHQ = theirAtPos.reduce((s, x) => s + x.dhq, 0);
                        const posDiff = myPosDHQ - theirPosDHQ;
                        const posTotalDhq = Math.max(1, myPosDHQ + theirPosDHQ);
                        const myPosPct = (myPosDHQ / posTotalDhq) * 100;
                        return (
                            <div key={pos} style={{ marginBottom: '12px', background: 'var(--black)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '8px 10px 10px', background: (posColors[pos] || '#666') + '15', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem' }}>
                                            <span style={{ color: myPosDHQ >= theirPosDHQ ? '#2ECC71' : 'var(--silver)' }}>You: {myPosDHQ.toLocaleString()}</span>
                                            <span style={{ color: theirPosDHQ >= myPosDHQ ? '#2ECC71' : 'var(--silver)' }}>Them: {theirPosDHQ.toLocaleString()}</span>
                                            <span style={{ fontWeight: 700, color: posDiff > 0 ? '#2ECC71' : posDiff < 0 ? '#E74C3C' : 'var(--silver)' }}>{posDiff > 0 ? '+' : ''}{posDiff.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    {(myPosDHQ > 0 || theirPosDHQ > 0) ? (
                                      <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                                        <div title={'You: ' + Math.round(myPosPct) + '%'} style={{ width: myPosPct + '%', background: `linear-gradient(90deg, var(--gold), var(--gold)cc)`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '4px', fontSize: '0.5rem', color: '#0A0A0A', fontWeight: 800 }}>
                                          {myPosPct >= 18 ? Math.round(myPosPct) + '%' : ''}
                                        </div>
                                        <div title={'Them: ' + Math.round(100 - myPosPct) + '%'} style={{ width: (100 - myPosPct) + '%', background: `linear-gradient(90deg, #7C6BF8cc, #7C6BF8)`, display: 'flex', alignItems: 'center', paddingLeft: '4px', fontSize: '0.5rem', color: '#0A0A0A', fontWeight: 800 }}>
                                          {(100 - myPosPct) >= 18 ? Math.round(100 - myPosPct) + '%' : ''}
                                        </div>
                                      </div>
                                    ) : null}
                                </div>
                                {Array.from({ length: maxLen }).map((_, i) => {
                                    const my = myAtPos[i];
                                    const their = theirAtPos[i];
                                    const openCard = (pid) => {
                                        if (!pid) return;
                                        if (window.WR && typeof window.WR.openPlayerCard === 'function') window.WR.openPlayerCard(pid);
                                        else if (typeof window._wrSelectPlayer === 'function') window._wrSelectPlayer(pid);
                                    };
                                    const renderCell = (r, isMine) => {
                                        if (!r) return <span style={{ color: 'var(--silver)', opacity: 0.3, fontSize: '0.72rem', padding: '6px 10px', display: 'inline-block' }}>{'\u2014'}</span>;
                                        const dhqCol = r.dhq >= 7000 ? '#2ECC71' : r.dhq >= 4000 ? '#3498DB' : 'var(--silver)';
                                        const winsDhq = isMine ? (their && r.dhq > their.dhq) : (my && r.dhq > my.dhq);
                                        return (
                                            <div onClick={() => openCard(r.pid)} style={{
                                                padding: '6px 10px',
                                                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem',
                                                background: winsDhq ? 'rgba(46,204,113,0.04)' : 'transparent',
                                                cursor: 'pointer',
                                                borderRight: isMine ? '1px solid rgba(255,255,255,0.04)' : 'none'
                                            }}>
                                                <img src={'https://sleepercdn.com/content/nfl/players/thumb/'+r.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'22px',height:'22px',borderRadius:'50%',objectFit:'cover', flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ color: 'var(--white)', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.p?.full_name || '?'}</div>
                                                    <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.7, marginTop: '1px', display: 'flex', gap: '6px' }}>
                                                        <span>{r.team}</span>
                                                        {r.age != null ? <span>· {r.age}yo</span> : null}
                                                        {r.ppg > 0 ? <span>· {r.ppg} PPG</span> : null}
                                                        <span>· {r.yrsExp}y</span>
                                                        <span>· {r.peakYrs}yr peak</span>
                                                    </div>
                                                </div>
                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.76rem', color: dhqCol, flexShrink: 0 }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span>
                                            </div>
                                        );
                                    };
                                    return (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            {renderCell(my, true)}
                                            {renderCell(their, false)}
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
    );
}

window.CompareTab = CompareTab;
