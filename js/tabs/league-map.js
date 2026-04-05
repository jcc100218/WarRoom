// ══════════════════════════════════════════════════════════════════
// js/tabs/league-map.js — LeagueMapTab: League overview, power rankings,
// competitive tiers, trade targets, draft picks, all-players view
// Extracted from league-detail.js. Props: all required state from LeagueDetail.
// ══════════════════════════════════════════════════════════════════

function LeagueMapTab({
  leagueSelectedTeam, setLeagueSelectedTeam,
  leagueSort, setLeagueSort,
  leagueSubView, setLeagueSubView,
  leagueViewMode, setLeagueViewMode,
  lpSort, setLpSort,
  lpFilter, setLpFilter,
  standings,
  currentLeague,
  playersData,
  statsData,
  sleeperUserId,
  myRoster,
  activeYear,
  timeRecomputeTs,
  setTimeRecomputeTs,
  getAcquisitionInfo,
}) {
  const _seasonCtx = React.useContext(window.App.SeasonContext) || {};
  const _sPlayerStats = _seasonCtx.playerStats || window.S?.playerStats || {};
  const _sTradedPicks = _seasonCtx.tradedPicks !== undefined ? _seasonCtx.tradedPicks : (window.S?.tradedPicks || []);
  const normPos = window.App.normPos;

  function calcRawPts(s) { return window.App.calcRawPts(s, currentLeague?.scoring_settings); }
  function getOwnerName(rosterId) {
    const roster = currentLeague.rosters?.find(r => r.roster_id === rosterId);
    const user = currentLeague.users?.find(u => u.user_id === roster?.owner_id);
    return user?.display_name || user?.username || 'Unknown';
  }

  const selectedTeam = leagueSelectedTeam;
  const setSelectedTeam = setLeagueSelectedTeam;

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
      <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.3rem', color: 'var(--gold)', marginBottom: '2px' }}>LEAGUE MAP</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px' }}>Every team, asset, and competitive position in your league</div>
      {/* League Overview — always shown */}
      {(() => {
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
                  <div key={tierName} className="wr-glass" style={{ background: 'var(--black)', border: '2px solid ' + (tierColors[tierName] || '#666') + '44', borderRadius: '10px', padding: '14px', borderLeft: '4px solid ' + (tierColors[tierName] || '#666') }}>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: tierColors[tierName], marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {tierName}
                      <span style={{ fontSize: '0.74rem', fontFamily: 'Oswald', color: 'var(--silver)', fontWeight: 400 }}>{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
                    </div>
                    {teams.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.5 }}>None</div> : teams.map(t => (
                      <div key={t.rosterId} className={t.ownerId === sleeperUserId ? 'wr-my-row' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', borderRadius: '4px' }}>
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

            {/* Power Rankings — 3 views */}
            {(() => {
              const rp = currentLeague?.roster_positions || [];
              // Contender: by optimal PPG
              const contenderRanked = [...allAssessments].map(t => {
                const r = currentLeague.rosters?.find(r2 => r2.roster_id === t.rosterId);
                const ppg = typeof window.App?.calcOptimalPPG === 'function' ? window.App.calcOptimalPPG(r?.players || [], playersData, _sPlayerStats, rp) : 0;
                return { ...t, ppg };
              }).sort((a, b) => b.ppg - a.ppg);
              // Dynasty: by total DHQ
              const dynastyRanked = [...allAssessments].map(t => {
                const r = currentLeague.rosters?.find(r2 => r2.roster_id === t.rosterId);
                const totalDhq = (r?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                return { ...t, totalDhq };
              }).sort((a, b) => b.totalDhq - a.totalDhq);

              const views = [
                { key: 'blended', label: 'Blended', data: ranked, valFn: t => t.healthScore, fmtFn: v => v, colFn: v => v >= 90 ? '#D4AF37' : v >= 80 ? '#2ECC71' : v >= 70 ? '#F0A500' : '#E74C3C', subFn: t => t.tier },
                { key: 'contender', label: 'Contender', data: contenderRanked, valFn: t => t.ppg, fmtFn: v => v > 0 ? v.toFixed(1) : '\u2014', colFn: (v, i) => i < 3 ? '#2ECC71' : i < 8 ? 'var(--silver)' : '#E74C3C', subFn: t => (t.ppg > 0 ? t.ppg.toFixed(1) + ' PPG' : '') },
                { key: 'dynasty', label: 'Dynasty', data: dynastyRanked, valFn: t => t.totalDhq, fmtFn: v => v > 0 ? (v/1000).toFixed(1)+'K' : '\u2014', colFn: (v, i) => i < 3 ? '#2ECC71' : i < 8 ? 'var(--silver)' : '#E74C3C', subFn: t => (t.totalDhq > 0 ? t.totalDhq.toLocaleString() + ' DHQ' : '') },
              ];
              const prView = window._wrPrView || 'blended';
              const view = views.find(v => v.key === prView) || views[0];

              return <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', letterSpacing: '0.06em' }}>POWER RANKINGS</div>
                  <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                    {views.map(v => <button key={v.key} onClick={() => { window._wrPrView = v.key; setTimeRecomputeTs(Date.now()); }} style={{ padding: '3px 10px', fontSize: '0.68rem', fontFamily: 'Oswald', borderRadius: '4px', cursor: 'pointer', border: '1px solid ' + (prView === v.key ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'), background: prView === v.key ? 'rgba(212,175,55,0.12)' : 'transparent', color: prView === v.key ? 'var(--gold)' : 'var(--silver)' }}>{v.label}</button>)}
                  </div>
                </div>
                <div style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', overflow: 'hidden' }}>
                  {(() => {
                    const top5 = view.data.slice(0, 5);
                    const myIdx = view.data.findIndex(t => t.ownerId === sleeperUserId);
                    const showMe = myIdx >= 5;
                    const displayData = showMe ? [...top5, view.data[myIdx]] : top5;
                    const remaining = view.data.length - displayData.length;
                    return <React.Fragment>
                      {displayData.map((t, di) => {
                        const i = view.data.indexOf(t);
                        const isMe = t.ownerId === sleeperUserId;
                        const val = view.valFn(t);
                        const maxVal = view.valFn(view.data[0]) || 1;
                        const pct = Math.min(100, Math.round((val / maxVal) * 100));
                        return (
                          <div key={t.rosterId} className={isMe ? 'wr-my-row' : undefined} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: isMe ? 'rgba(212,175,55,0.04)' : 'transparent', ...(showMe && di === 5 ? { borderTop: '1px dashed rgba(212,175,55,0.2)' } : {}) }}>
                            <span style={{ fontFamily: 'Oswald', fontSize: '0.78rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)', width: '20px', textAlign: 'center' }}>{i + 1}</span>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.ownerName}{isMe ? ' (You)' : ''}</span>
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, flexShrink: 0 }}>{t.tier}</span>
                            <div style={{ width: '60px', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ width: pct + '%', height: '100%', borderRadius: '3px', background: view.colFn(val, i) }}></div>
                            </div>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Oswald', color: view.colFn(val, i), width: '36px', textAlign: 'right' }}>{view.fmtFn(val)}</span>
                          </div>
                        );
                      })}
                      {remaining > 0 && <div style={{ padding: '6px 10px', fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.5, textAlign: 'center' }}>and {remaining} more teams</div>}
                    </React.Fragment>;
                  })()}
                </div>
              </div>;
            })()}

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
                        const elites = typeof window.App?.countElitePlayers === 'function' ? window.App.countElitePlayers(roster?.players || []) : (roster?.players || []).filter(pid => (window.App?.LI?.playerScores?.[pid] || 0) >= 7000).length;
                        const ages = (roster?.players || []).map(pid => playersData[pid]?.age).filter(a => a && a > 18);
                        const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 28;
                        return {
                          Health: best.healthScore,
                          'DHQ Value': Math.min(100, totalDHQ / 800),
                          Youth: Math.min(100, Math.max(0, (32 - avgAge) * 12)),
                          Elites: Math.min(100, elites * 20),
                          Depth: (() => { const starterSet = new Set(roster?.starters || []); const benchQuality = (roster?.players || []).filter(pid => !starterSet.has(pid) && (window.App?.LI?.playerScores?.[pid] || 0) >= 3000).length; return Math.min(100, benchQuality * 15); })(),
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

      {/* Teams / All Players / Draft Picks */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <button onClick={() => setLeagueSubView('teams')} style={sortBtnStyle(leagueSubView === 'teams')}>Teams</button>
        <button onClick={() => setLeagueSubView('players')} style={sortBtnStyle(leagueSubView === 'players')}>All Players</button>
        <button onClick={() => setLeagueSubView('picks')} style={sortBtnStyle(leagueSubView === 'picks')}>Draft Picks</button>
      </div>
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
                const eliteCount = typeof window.App?.countElitePlayers === 'function' ? window.App.countElitePlayers(scored.map(x => x.pid)) : scored.filter(x => x.dhq >= 7000).length;
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
                  <div style={{ fontSize: '0.74rem', color: 'var(--silver)', lineHeight: 1.4 }}>
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
                        <span style={{ color: x.dhq >= 7000 ? '#2ECC71' : x.dhq >= 4000 ? '#3498DB' : 'var(--silver)', fontFamily: 'Oswald' }}>{x.dhq > 0 ? x.dhq.toLocaleString() : '\u2014'}</span>
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
        const posColors = window.App.POS_COLORS;
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
        const tradedPicks = _sTradedPicks;
        const leagueSeason = parseInt(currentLeague.season || activeYear);
        const draftRounds = currentLeague.settings?.draft_rounds || 5;
        const years = [leagueSeason, leagueSeason + 1, leagueSeason + 2];

        // Use shared getOwnerName() defined above

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
                                                    {getOwnerName(currentOwnerRid)}{isMyPick ? ' (You)' : ''}
                                                </span>
                                                <span style={{ color: 'var(--silver)', opacity: traded ? 1 : 0.4 }}>
                                                    {getOwnerName(originalRid)}{isMyOriginal ? ' (You)' : ''}
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
      const posColors = window.App.POS_COLORS;
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
                                const rivalUser = (currentLeague.users || []).find(u => {
                                    const rivalRoster = (currentLeague.rosters || []).find(ros => ros.roster_id === r.rosterId);
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
