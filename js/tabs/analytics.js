// ══════════════════════════════════════════════════════════════════
// js/tabs/analytics.js — AnalyticsPanel: League analytics terminal
// with 5 sub-tabs: Roster, Draft, Waiver/Trades, Playoffs, Timeline
// Extracted from league-detail.js. Props: all required state from LeagueDetail.
// ══════════════════════════════════════════════════════════════════

function AnalyticsPanel({
  analyticsData,
  analyticsTab,
  setAnalyticsTab,
  myRoster,
  currentLeague,
  standings,
  playersData,
  statsData,
  stats2025Data,
  sleeperUserId,
  timeRecomputeTs,
  setTimeRecomputeTs,
  activeYear,
  setActiveTab,
  viewingOwnerId,
  setViewingOwnerId,
  timeDelta,
  timeYear,
  setTradeSubTab,
  getOwnerName,
}) {
    const _seasonCtx = React.useContext(window.App.SeasonContext) || {};
    // _SS mirrors the window.S shape consumed throughout this component
    const _SS = {
        rosters: _seasonCtx.rosters?.length ? _seasonCtx.rosters : (window.S?.rosters || currentLeague?.rosters || []),
        myRosterId: _seasonCtx.myRosterId ?? window.S?.myRosterId,
        tradedPicks: _seasonCtx.tradedPicks !== undefined ? _seasonCtx.tradedPicks : (window.S?.tradedPicks || []),
        playerStats: _seasonCtx.playerStats || window.S?.playerStats || {},
    };

    const aCardStyle = { background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px' };
    const aHeaderStyle = { fontFamily: 'Rajdhani, sans-serif', color: 'var(--gold)', fontSize: '1.125rem', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '12px', borderBottom: '1px solid rgba(212,175,55,0.2)', paddingBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
    const aValStyle = { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', fontWeight: 500 };
    const goodColor = '#2ECC71';
    const warnColor = '#F0A500';
    const badColor = '#E74C3C';
    const sevIcon = (sev) => sev === 'high' || sev === 'critical' ? '\uD83D\uDD34' : sev === 'medium' ? '\u26A0\uFE0F' : '\u2705';
    const sevColor = (sev) => sev === 'high' || sev === 'critical' ? badColor : sev === 'medium' ? warnColor : goodColor;
    const pctFmt = (v) => Math.round((v || 0) * 100) + '%';
    const numFmt = (v) => v != null ? (typeof v === 'number' ? v.toLocaleString() : v) : '\u2014';
    // showAlerts block removed — alerts now on Brief tab

    // ── ANALYST VIEW: full analytics terminal ──
    const subTabs = [
        { key: 'roster', label: 'Roster' },
        { key: 'draft', label: 'Draft' },
        { key: 'trades', label: 'Waiver / Trades' },
        { key: 'playoffs', label: 'Playoffs' },
        { key: 'timeline', label: 'Timeline' },
    ];
    const subTabBtnStyle = (active) => ({
        padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', letterSpacing: '0.06em', transition: 'all 0.2s',
        border: active ? '2px solid var(--gold)' : '2px solid rgba(212,175,55,0.3)',
        background: active ? 'var(--gold)' : 'transparent',
        color: active ? 'var(--black)' : 'var(--gold)',
    });
    const tableRowStyle = (i) => ({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', ...(i === 0 ? { fontWeight: 700, color: 'var(--gold)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' } : { color: 'var(--silver)' }) });
    const d = analyticsData;

    // ── Overview stats for the summary bar ──
    const _overviewStats = (() => {
        const allRosters = _SS.rosters || [];
        const totalTeams = allRosters.length;
        const myRid = String(_SS.myRosterId || myRoster?.roster_id || '');
        const playerScores = window.App?.LI?.playerScores || {};
        const allDhqs = allRosters.map(r => (r.players || []).reduce((s, pid) => s + (playerScores[pid] || 0), 0));
        const myDhq = allRosters.find(r => String(r.roster_id) === myRid) ?
            (allRosters.find(r => String(r.roster_id) === myRid).players || []).reduce((s, pid) => s + (playerScores[pid] || 0), 0) : 0;
        const avgDhq = allDhqs.length ? Math.round(allDhqs.reduce((a, b) => a + b, 0) / allDhqs.length) : 0;
        const myRoster2 = allRosters.find(r => String(r.roster_id) === myRid);
        const wins = myRoster2?.settings?.wins || 0;
        const losses = myRoster2?.settings?.losses || 0;
        const winPct = (wins + losses) > 0 ? Math.round(wins / (wins + losses) * 100) : null;
        const sorted = [...allRosters].sort((a, b) => {
            const aw = a.settings?.wins || 0, bw = b.settings?.wins || 0;
            if (bw !== aw) return bw - aw;
            return (b.settings?.fpts || 0) - (a.settings?.fpts || 0);
        });
        const myRank = sorted.findIndex(r => String(r.roster_id) === myRid) + 1;
        const dhqVsAvg = avgDhq > 0 ? Math.round((myDhq - avgDhq) / avgDhq * 100) : 0;
        return { totalTeams, myRank, wins, losses, winPct, myDhq, avgDhq, dhqVsAvg };
    })();

    return (
    <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '2rem', fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.06em' }}>LEAGUE ANALYTICS</div>
        </div>

        {/* Overview summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
            {[
                { label: 'POWER RANK', val: _overviewStats.myRank ? `#${_overviewStats.myRank} of ${_overviewStats.totalTeams}` : '—', col: _overviewStats.myRank <= Math.ceil(_overviewStats.totalTeams / 3) ? '#2ECC71' : _overviewStats.myRank <= Math.ceil(_overviewStats.totalTeams * 2 / 3) ? '#F0A500' : '#E74C3C' },
                { label: 'RECORD', val: _overviewStats.winPct !== null ? `${_overviewStats.wins}–${_overviewStats.losses}` : '—', sub: _overviewStats.winPct !== null ? `${_overviewStats.winPct}% win` : '', col: _overviewStats.winPct >= 60 ? '#2ECC71' : _overviewStats.winPct >= 40 ? '#F0A500' : '#E74C3C' },
                { label: 'DHQ VS AVG', val: _overviewStats.avgDhq > 0 ? (_overviewStats.dhqVsAvg >= 0 ? `+${_overviewStats.dhqVsAvg}%` : `${_overviewStats.dhqVsAvg}%`) : '—', col: _overviewStats.dhqVsAvg >= 5 ? '#2ECC71' : _overviewStats.dhqVsAvg >= -5 ? '#F0A500' : '#E74C3C' },
                { label: 'LEAGUE SIZE', val: _overviewStats.totalTeams ? `${_overviewStats.totalTeams} teams` : '—', col: 'var(--silver)' },
            ].map(s => (
                <div key={s.label} style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.64rem', color: 'var(--silver)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px', opacity: 0.7 }}>{s.label}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 600, color: s.col }}>{s.val}</div>
                    {s.sub && <div style={{ fontSize: '0.68rem', color: 'var(--silver)', marginTop: '2px', opacity: 0.7 }}>{s.sub}</div>}
                </div>
            ))}
        </div>

        <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '12px' }}>Elite Tier Teams = playoff bracket champions, runner-ups, and semi-finalists when available. Falls back to top 3 by record in the current season.</div>

        {/* Sub-tab navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {subTabs.map(t => (
                <div key={t.key} style={subTabBtnStyle(analyticsTab === t.key)} onClick={() => setAnalyticsTab(t.key)}>{t.label}</div>
            ))}
        </div>

        {!d ? (
            <div style={{ ...aCardStyle, color: 'var(--silver)', textAlign: 'center', padding: '40px' }}>
                {window.App?.LI_LOADED ? 'Computing analytics...' : 'League Intelligence is still loading. Please wait...'}
            </div>
        ) : (
        <React.Fragment>

        {/* ═══ ROSTER CONSTRUCTION ═══ */}
        {analyticsTab === 'roster' && (() => {
            const r = d.roster;
            if (!r) return <div style={{ color: 'var(--silver)' }}>No roster data available.</div>;
            const w = r.winnerProfile;
            const l = r.leagueProfile;
            const m = r.myProfile;
            // Elite = top 5 at position
            const playerScores = window.App?.LI?.playerScores || {};
            const SS = _SS;
            const allRosters = SS?.rosters || [];
            const winnerIds = new Set(d.winners || []);
            const hasEliteFn = typeof window.App?.countElitePlayers === 'function';
            function countElite(rosterList) {
                if (!rosterList.length) return 0;
                let total = 0;
                rosterList.forEach(ros => {
                    total += hasEliteFn ? window.App.countElitePlayers(ros.players || []) : (ros.players || []).filter(pid => (playerScores[pid] || 0) >= 7000).length;
                });
                return +(total / rosterList.length).toFixed(1);
            }
            const wElite = countElite(allRosters.filter(ros => winnerIds.has(ros.roster_id)));
            const lElite = countElite(allRosters);
            const myRid = SS?.myRosterId;
            const mElite = countElite(allRosters.filter(ros => ros.roster_id === myRid));

            // Health score
            let healthScore = 0;
            let tier = 'UNKNOWN';
            let needs = [];
            try {
                if (window.assessTeamFromGlobal) {
                    const assessment = window.assessTeamFromGlobal(myRid);
                    if (assessment) {
                        healthScore = assessment.healthScore || 0;
                        tier = (assessment.tier || 'UNKNOWN').toUpperCase();
                        needs = assessment.needs || [];
                    }
                }
            } catch(e) { window.wrLog('analytics.assessTeam', e); }
            // Winner avg health
            let winnerHealthTotal = 0, winnerHealthCount = 0;
            try {
                winnerIds.forEach(wid => {
                    if (window.assessTeamFromGlobal) {
                        const wa = window.assessTeamFromGlobal(wid);
                        if (wa) { winnerHealthTotal += wa.healthScore || 0; winnerHealthCount++; }
                    }
                });
            } catch(e) { window.wrLog('analytics.winnerHealth', e); }
            const winnerHealthAvg = winnerHealthCount > 0 ? Math.round(winnerHealthTotal / winnerHealthCount) : 0;
            const healthDelta = healthScore - winnerHealthAvg;

            // Compete window
            const compWindow = d.window || {};
            const compYears = compWindow.years || 0;
            // Avg compete window — dead code removed

            // KPI sparkline data: build from projection years
            const projData = (d.projection || []).map(p => p.projectedDHQ);
            const healthData = (d.projection || []).map(p => p.projectedHealth || healthScore);

            // ── KPI Card style ──
            const kpiCardStyle = {
                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: '10px',
                padding: '10px 12px 8px',
                flex: '1 1 0',
                minWidth: '140px',
                position: 'relative',
                overflow: 'hidden',
            };
            const kpiNumberStyle = {
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '1.8rem',
                lineHeight: 1,
                color: 'var(--white)',
                marginBottom: '2px',
            };
            const kpiLabelStyle = {
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.68rem',
                color: 'var(--silver)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: 0.7,
            };
            const kpiDeltaStyle = (positive) => ({
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: positive ? goodColor : badColor,
                marginTop: '4px',
            });

            // ── Position data for BarChart ──
            const posOrder = ['QB','RB','TE','WR','K','DL','LB','DB'];
            const allPos = [...new Set([...Object.keys(w.posInvestment || {}), ...Object.keys(m.posInvestment || {})])].filter(p => p !== 'UNK').sort((a,b) => { const ia = posOrder.indexOf(a); const ib = posOrder.indexOf(b); return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); });
            const posBarItems = allPos.map(pos => ({
                label: pos,
                value: Math.round((m.posInvestment[pos] || 0) * 100),
                color: '#4ECDC4',
            }));
            const posBarWinnerItems = allPos.map(pos => ({
                label: pos,
                value: Math.round((w.posInvestment[pos] || 0) * 100),
                color: CHART_COLORS?.gold || '#D4AF37',
            }));

            // ── Radar data ──
            const radarValues = {};
            allPos.forEach(pos => {
                const wPct = (w.posInvestment[pos] || 0) * 100;
                const mPct = (m.posInvestment[pos] || 0) * 100;
                radarValues[pos] = Math.min(100, Math.round(mPct / Math.max(wPct, 1) * 100));
            });

            // ── Rankings: all teams sorted by health ──
            const teamRankings = [];
            allRosters.forEach(ros => {
                let hs = 0, tier = '';
                try {
                    if (window.assessTeamFromGlobal) {
                        const a = window.assessTeamFromGlobal(ros.roster_id);
                        if (a) { hs = a.healthScore || 0; tier = a.tier || ''; }
                    }
                } catch(e) { window.wrLog('rankings.assessTeam', e); }
                const totalDhq = (ros.players || []).reduce((s, pid) => s + (playerScores[pid] || 0), 0);
                const s = ros.settings || {};
                const rUser = currentLeague.users?.find(u => u.user_id === ros.owner_id);
                teamRankings.push({
                    rosterId: ros.roster_id,
                    name: getOwnerName(ros.roster_id),
                    teamName: rUser?.metadata?.team_name || '',
                    avatar: rUser?.avatar || null,
                    wins: s.wins || 0,
                    losses: s.losses || 0,
                    healthScore: hs,
                    totalDhq,
                    tier,
                    isMe: ros.roster_id === myRid,
                });
            });
            teamRankings.sort((a, b) => b.healthScore - a.healthScore);

            // ── Insight cards ──
            const insights = [];
            const projMyAgeInsight = m.avgAge + (timeDelta || 0);
            const ageDiff = projMyAgeInsight - w.avgAge;
            if (Math.abs(ageDiff) > 0.3) {
                insights.push({
                    color: ageDiff > 0 ? badColor : goodColor,
                    title: ageDiff > 0 ? 'Roster Running Older' : 'Youth Advantage',
                    text: 'Your roster is ' + Math.abs(ageDiff).toFixed(1) + ' years ' + (ageDiff > 0 ? 'older' : 'younger') + ' than champion average (' + w.avgAge.toFixed(1) + ' yrs).' + (timeDelta ? ' (projected for ' + timeYear + ')' : ''),
                });
            }
            if (m.avgBenchQuality < w.avgBenchQuality * 0.75) {
                insights.push({
                    color: warnColor,
                    title: 'Bench Depth Concern',
                    text: 'Bench quality (' + numFmt(m.avgBenchQuality) + ') is significantly below elite tier benchmark (' + numFmt(w.avgBenchQuality) + ').',
                });
            }
            if (m.avgTotalDHQ < w.avgTotalDHQ * 0.85) {
                insights.push({
                    color: badColor,
                    title: 'Total Value Gap',
                    text: 'Your total DHQ (' + numFmt(m.avgTotalDHQ) + ') trails elite tier average (' + numFmt(w.avgTotalDHQ) + ') by ' + Math.round((1 - m.avgTotalDHQ / w.avgTotalDHQ) * 100) + '%.',
                });
            }
            if (compYears >= 3) {
                insights.push({
                    color: goodColor,
                    title: 'Strong Compete Window',
                    text: compYears + ' years remaining in your competitive window. Maximize with targeted upgrades.',
                });
            }

            const gapsList = d.gaps || r.gaps || [];

            // ── Roster Diagnosis Summary ──
            const projMyAge = m.avgAge + (timeDelta || 0);
            const projWAge = w.avgAge; // champion profile is historical, no projection needed
            const ageDiffDiag = projMyAge - projWAge;
            const eliteDiffDiag = mElite - wElite;
            const dhqGap = m.avgTotalDHQ - w.avgTotalDHQ;
            const benchGap = m.avgBenchQuality - w.avgBenchQuality;
            const rosterStrategy = ageDiffDiag > 1.5 && dhqGap < 0 ? 'sell aging veterans and acquire young elites'
                : eliteDiffDiag < -1 ? 'buy young elite players to close the talent gap'
                : dhqGap >= 0 && ageDiffDiag <= 0.5 ? 'hold course — your roster matches the elite tier template'
                : 'target strategic upgrades at your weakest positions';

            return (
            <React.Fragment>
                {/* ── ROSTER DIAGNOSIS — Alex Ingram Slack-style ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Roster Diagnosis">
                        {(() => {
                            const parts = [];
                            // Tier intro
                            if (tier === 'ELITE') parts.push('You\'re built to win right now.');
                            else if (tier === 'CONTENDER') parts.push('You\'re in the mix — a move or two away from a title push.');
                            else if (tier === 'CROSSROADS') parts.push('You\'re at a crossroads. Not bad enough to blow it up, not good enough to compete for the title.');
                            else parts.push('Rebuilding mode. The goal right now is accumulating assets, not winning weekly matchups.');
                            // Age comparison
                            if (Math.abs(ageDiffDiag) >= 1) {
                                parts.push(ageDiffDiag > 0 ? 'Your roster skews older than typical elite tier teams — keep an eye on your window.' : 'You\'re younger than most contenders, which gives you a longer runway.');
                            }
                            // Needs
                            if (needs.length >= 2) parts.push('Your biggest gaps are at ' + needs.slice(0, 2).map(n => typeof n === 'string' ? n : n.pos).join(' and ') + '.');
                            else if (needs.length === 1) parts.push('Your main weakness is ' + (typeof needs[0] === 'string' ? needs[0] : needs[0].pos) + '.');
                            // Strategy
                            if (tier === 'ELITE' || tier === 'CONTENDER') parts.push('Protect your core and make surgical upgrades at weak spots.');
                            else if (tier === 'CROSSROADS') parts.push('Either commit to competing by filling gaps, or pivot to a rebuild and sell aging assets for picks.');
                            else parts.push('Target young players and draft capital. Sell veterans who won\'t be around for your next competitive window.');
                            return parts.join(' ');
                        })()}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => setActiveTab('trades'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.84rem', cursor: 'pointer' } }, 'Find Trade Targets'),
                            React.createElement('button', { onClick: () => setActiveTab('fa'), style: { padding: '6px 14px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.84rem', cursor: 'pointer' } }, 'View Free Agents')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    {/* Total DHQ */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Total DHQ</div>
                        <div style={kpiNumberStyle}>{(m.avgTotalDHQ || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                        <div style={kpiDeltaStyle(m.avgTotalDHQ >= w.avgTotalDHQ)}>
                            {m.avgTotalDHQ >= w.avgTotalDHQ ? '\u25B2' : '\u25BC'} {Math.abs(Math.round((m.avgTotalDHQ - l.avgTotalDHQ) / Math.max(l.avgTotalDHQ, 1) * 100))}% vs lg avg
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            {typeof Sparkline !== 'undefined' && projData.length >= 2 && React.createElement(Sparkline, { data: projData, width: 120, height: 28, color: m.avgTotalDHQ >= w.avgTotalDHQ ? goodColor : badColor })}
                        </div>
                    </div>
                    {/* Health Score */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Health Score</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={kpiNumberStyle}>{healthScore}</div>
                            <div style={{ marginTop: '4px' }}>
                                {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: healthScore, size: 48, thickness: 5 })}
                            </div>
                        </div>
                        <div style={kpiDeltaStyle(healthDelta >= 0)}>
                            {healthDelta >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(healthDelta)} vs elite tier
                        </div>
                    </div>
                    {/* Elite Count */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Elite Players</div>
                        <div style={kpiNumberStyle}>{mElite}</div>
                        <div style={kpiDeltaStyle(mElite >= wElite)}>
                            {mElite >= Math.ceil(wElite) ? '= ' : '\u25BC '}{mElite >= Math.ceil(wElite) ? 'above' : Math.abs(mElite - Math.ceil(wElite)) + ' below'} elite tier ({Math.ceil(wElite)})
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.5, marginTop: '4px' }}>Top 5 at position</div>
                    </div>
                    {/* Compete Window */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Compete Window</div>
                        <div style={kpiNumberStyle}>{compYears}<span style={{ fontSize: '1rem', color: 'var(--silver)', marginLeft: '4px' }}>yr</span></div>
                        <div style={kpiDeltaStyle(compYears >= 3)}>
                            {compYears >= 3 ? '\u25B2 Strong' : compYears >= 1 ? '\u25AC Narrowing' : '\u25BC Rebuild mode'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6, marginTop: '4px' }}>{compWindow.label || ''}</div>
                    </div>
                </div>

                {/* ── TWO-COLUMN CHART GRID ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    {/* Left: Position Investment BarChart */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}><span>POSITION INVESTMENT</span>{typeof StarBtn !== 'undefined' && <StarBtn id="analytics_pos_inv" title="Position Investment" content={`DHQ allocation: ${Object.entries(m?.byPosition||{}).map(([p,v])=>`${p}: ${Math.round((v||0)/((m?.total||1)/100))}%`).join(', ')}`} sourceModule="Analytics" />}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Position investment shows what % of your total roster DHQ is allocated to each position. For example, "QB: 18%" means 18% of your total dynasty value is in QBs.</div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Elite Tier Teams</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarWinnerItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Elite Tier %</span>
                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} Your %</span>
                        </div>
                    </div>

                    {/* Right: Gap Analysis Visual Cards */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}><span>GAP ANALYSIS</span>{typeof StarBtn !== 'undefined' && <StarBtn id="analytics_gap" title="Gap Analysis" content={gapsList.length === 0 ? 'No significant gaps vs elite tier' : `${gapsList.length} roster gap${gapsList.length !== 1 ? 's' : ''} vs elite tier`} sourceModule="Analytics" />}</div>
                        {gapsList.length === 0 && <div style={{ color: goodColor, fontSize: '0.9rem', padding: '12px 0' }}>Your roster matches the elite tier template closely.</div>}
                        {gapsList.slice().sort((a,b) => { const sevOrder = {critical:0,high:1,medium:2,low:3}; return (sevOrder[a.priority||a.severity]||9) - (sevOrder[b.priority||b.severity]||9); }).slice(0, 6).map((g, i) => {
                            const sev = g.priority || g.severity || 'low';
                            const sevBg = sev === 'high' || sev === 'critical' ? 'rgba(231,76,60,0.08)' : sev === 'medium' ? 'rgba(240,165,0,0.08)' : 'rgba(46,204,113,0.06)';
                            const gapDhq = (typeof g.winners === 'number' && typeof g.yours === 'number' && g.unit !== '%') ? Math.max(0, g.winners - g.yours) : 0;
                            // Parse position from gap title/name/area/action if g.pos is missing
                            const gapPos = g.pos || (g.title || g.name || g.area || g.action || '').match(/\b(QB|RB|WR|TE|K|DL|LB|DB)\b/)?.[1] || null;
                            const avgPlayerVal = gapPos ? ({QB:8000,RB:5500,WR:5500,TE:5000,K:2000,DL:3500,LB:3500,DB:3500}[gapPos] || 4000) : 4000;
                            const neededPlayers = gapDhq > 0 ? Math.max(1, Math.round(gapDhq / avgPlayerVal)) : 0;
                            return (
                            <div key={i} style={{
                                padding: '10px 14px', marginBottom: '8px',
                                background: sevBg,
                                borderLeft: '3px solid ' + sevColor(sev),
                                borderRadius: '0 8px 8px 0',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: sevColor(sev), fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase' }}>
                                        {g.action || g.area}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', padding: '2px 8px',
                                        borderRadius: '10px', background: sevColor(sev), color: 'var(--black)', fontWeight: 700,
                                    }}>
                                        {(sev).toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--silver)', fontSize: '0.78rem', marginTop: '4px' }}>
                                    {g.detail || (neededPlayers > 0 && gapPos
                                        ? 'Need ~' + neededPlayers + ' more ' + gapPos + (neededPlayers > 1 ? 's' : '') + ' to match elite tier'
                                        : (g.yours != null && g.winners != null
                                            ? (g.unit === '%' ? pctFmt(g.yours) + ' (elite tier: ' + pctFmt(g.winners) + ')' : numFmt(g.yours) + ' ' + (g.unit || 'DHQ') + ' (elite tier: ' + numFmt(g.winners) + ')')
                                            : ''))}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── INSIGHT CARDS ── */}
                {insights.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                    {insights.map((ins, i) => (
                        <div key={i} style={{
                            background: 'rgba(26,26,26,0.8)', borderRadius: '10px', padding: '14px 16px',
                            borderLeft: '4px solid ' + ins.color,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: ins.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {ins.title}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>{ins.text}</div>
                        </div>
                    ))}
                </div>
                )}

                {/* ── 5-YEAR OUTLOOK (moved from Projections) ── */}
                {(() => {
                    const proj = d.projection;
                    const win = d.window;
                    if (!proj || !proj.length) return null;
                    const maxDHQ = Math.max(...proj.map(p => p.projectedDHQ), 1);
                    const tierColor = (tier) => tier === 'Contender' ? goodColor : tier === 'Playoff Team' ? warnColor : badColor;
                    return (
                        <div style={{ ...aCardStyle, marginTop: '12px' }}>
                            <div style={aHeaderStyle}><span>YOUR 5-YEAR OUTLOOK</span>{typeof StarBtn !== 'undefined' && <StarBtn id="analytics_outlook" title="5-Year Outlook" content={(d?.projection||[]).map(p=>`${p.year}: ${p.tier||'—'}`).join(' · ')} sourceModule="Analytics" />}</div>
                            {proj.map((p, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <span style={{ color: 'var(--silver)', fontFamily: 'Inter, sans-serif', minWidth: '40px', fontSize: '0.9rem' }}>{p.year}</span>
                                    <div style={{ flex: 1, position: 'relative', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: (p.projectedDHQ / maxDHQ * 100) + '%', background: tierColor(p.tier), borderRadius: '6px', opacity: 0.6, transition: 'width 0.5s ease' }} />
                                        <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: 'var(--white)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            {p.projectedDHQ.toLocaleString()} DHQ
                                        </div>
                                    </div>
                                    <span style={{ color: tierColor(p.tier), fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', minWidth: '90px', textAlign: 'right' }}>
                                        {p.tier} {p.tier === 'Rebuilding' || p.tier === 'Deep Rebuild' ? '\uD83D\uDD34' : p.tier === 'Playoff Team' ? '\u26A0\uFE0F' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })()}

                {/* ── AGING CLIFF ALERT (moved from Projections) ── */}
                {(() => {
                    const S2 = _SS;
                    const LI2 = window.App?.LI || {};
                    const ps2 = LI2.playerScores || {};
                    const pm2 = LI2.playerMeta || {};
                    const pw2 = window.App.peakWindows;
                    const myRid2 = S2?.myRosterId;
                    const myRos2 = (S2?.rosters || []).find(r => r.roster_id === myRid2);
                    const myPl2 = myRos2?.players || [];
                    let tDHQ2 = 0, arDHQ2 = 0;
                    const arPlayers2 = [];
                    myPl2.forEach(pid => {
                        const dq = ps2[pid] || 0;
                        const mt = pm2[pid] || {};
                        tDHQ2 += dq;
                        if (!mt.age || !mt.pos) return;
                        const pe = (pw2[mt.pos] || [23, 29])[1];
                        if (mt.age + 2 > pe && dq >= 2000) {
                            arDHQ2 += dq;
                            arPlayers2.push({ name: playersData[pid]?.full_name || S2?.players?.[pid]?.full_name || mt.name || ('Player ' + pid), age: mt.age, dhq: dq });
                        }
                    });
                    const arPct2 = tDHQ2 > 0 ? Math.round(arDHQ2 / tDHQ2 * 100) : 0;
                    arPlayers2.sort((a, b) => b.dhq - a.dhq);
                    if (!arPlayers2.length && arPct2 === 0) return null;
                    return (
                        <div style={{ ...aCardStyle, marginTop: '12px' }}>
                            <div style={aHeaderStyle}><span>AGING CLIFF ALERT</span>{typeof StarBtn !== 'undefined' && <StarBtn id="analytics_aging_cliff" title="Aging Cliff Alert" content="High-DHQ players within 2 years of peak-end age" sourceModule="Analytics" />}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Players within 2 years of their position's peak-end age with 2000+ DHQ value. These are your highest-risk assets for dynasty value decline.</div>
                            <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.6rem', color: arPct2 > 30 ? badColor : arPct2 > 15 ? warnColor : goodColor }}>{arPct2}%</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>Your DHQ past peak by {(parseInt(S2?.season) || 2026) + 2}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    {(() => {
                                        let lgT = 0, lgA = 0;
                                        (S2?.rosters || []).forEach(r => {
                                            (r.players || []).forEach(pid => {
                                                const dv = ps2[pid] || 0;
                                                const mv = pm2[pid] || {};
                                                lgT += dv;
                                                if (mv.age && mv.pos) {
                                                    const pe = (pw2[mv.pos] || [23,29])[1];
                                                    if (mv.age + 2 > pe && dv >= 2000) lgA += dv;
                                                }
                                            });
                                        });
                                        const lgP = lgT > 0 ? Math.round(lgA / lgT * 100) : 0;
                                        return <>
                                            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.6rem', color: 'var(--gold)' }}>{lgP}%</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>League avg</div>
                                        </>;
                                    })()}
                                </div>
                            </div>
                            {arPlayers2.length > 0 && (
                                <div>
                                    <div style={{ color: 'var(--silver)', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 700 }}>Players at risk:</div>
                                    {arPlayers2.slice(0, 5).map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem', fontFamily: 'Inter, sans-serif' }}>
                                            <span style={{ color: 'var(--silver)' }}>{p.name} ({p.age})</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ color: badColor }}>{p.dhq.toLocaleString()} DHQ</span>
                                                <span style={{ padding: '2px 8px', background: 'rgba(231,76,60,0.15)', color: badColor, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}>TRADE NOW</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </React.Fragment>
            );
        })()}

        {/* ═══ DRAFT INTELLIGENCE ═══ */}
        {analyticsTab === 'draft' && (() => {
            const dr = d.draft;
            if (!dr) return <div style={{ color: 'var(--silver)' }}>No draft data available.</div>;
            const rounds = Object.keys(dr.winnerDraftProfile || {}).map(Number).sort((a, b) => a - b);
            const S = _SS;
            const myRid = S?.myRosterId;
            const draftOutcomes = (window.App?.LI || {}).draftOutcomes || [];
            const myDraftProfile = {};
            rounds.forEach(rd => {
                const myPicks = draftOutcomes.filter(dp => dp.round === rd && dp.roster_id === myRid);
                if (!myPicks.length) return;
                const posCounts = {};
                myPicks.forEach(dp => { const pos = dp.pos || 'UNK'; posCounts[pos] = (posCounts[pos] || 0) + 1; });
                myDraftProfile[rd] = {};
                Object.entries(posCounts).forEach(([pos, cnt]) => { myDraftProfile[rd][pos] = +(cnt / myPicks.length).toFixed(2); });
            });
            let totalHitDiff = 0;
            let hitRounds = 0;
            let winnerHitAvg = 0, leagueHitAvg = 0;
            rounds.forEach(rd => {
                const hr = dr.winnerHitRate[rd];
                if (!hr) return;
                totalHitDiff += (hr.winners - hr.league);
                winnerHitAvg += hr.winners;
                leagueHitAvg += hr.league;
                hitRounds++;
            });
            const avgHitAdv = hitRounds > 0 ? totalHitDiff / hitRounds : 0;
            winnerHitAvg = hitRounds > 0 ? winnerHitAvg / hitRounds : 0;
            leagueHitAvg = hitRounds > 0 ? leagueHitAvg / hitRounds : 0;
            const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D'];
            const gradeIdx = Math.min(grades.length - 1, Math.max(0, Math.round(4 - avgHitAdv * 20)));
            const totalMyPicks = draftOutcomes.filter(dp => dp.roster_id === myRid).length;
            // Compute top draft position for winners
            const winnerTopPos = {};
            rounds.forEach(rd => {
                Object.entries(dr.winnerDraftProfile[rd] || {}).forEach(([pos, pct]) => {
                    winnerTopPos[pos] = (winnerTopPos[pos] || 0) + pct;
                });
            });
            const topDraftTarget = Object.entries(winnerTopPos).sort((a,b) => b[1] - a[1])[0];

            // KPI card style
            const dKpiCardStyle = {
                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: '14px',
                padding: '20px 18px 14px',
                flex: '1 1 0',
                minWidth: '140px',
            };
            const dKpiNum = { fontFamily: 'Rajdhani, sans-serif', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
            const dKpiLabel = { fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

            // Build bar chart items for hit rate by round
            const hitRateBarItems = rounds.filter(rd => dr.winnerHitRate[rd]).map(rd => ({
                label: 'R' + rd,
                value: Math.round((dr.winnerHitRate[rd].winners || 0) * 100),
                color: goodColor,
            }));
            const hitRateLeagueItems = rounds.filter(rd => dr.winnerHitRate[rd]).map(rd => ({
                label: 'R' + rd,
                value: Math.round((dr.winnerHitRate[rd].league || 0) * 100),
                color: 'rgba(192,192,192,0.6)',
            }));

            // ── Draft Strategy Summary ──
            const myHitRates = {};
            rounds.forEach(rd => {
                const myPicks = draftOutcomes.filter(dp => dp.round === rd && dp.roster_id === myRid);
                if (!myPicks.length) return;
                const hits = myPicks.filter(dp => dp.isHit).length;
                myHitRates[rd] = myPicks.length > 0 ? hits / myPicks.length : 0;
            });
            const myR1Hit = myHitRates[1] || 0;
            const winnerR1Hit = (dr.winnerHitRate[1] || {}).winners || 0;
            const topDraftPos = topDraftTarget ? topDraftTarget[0] : 'RB/WR';
            const draftGradeLetter = grades[gradeIdx];

            return (
            <React.Fragment>
                {/* ── DRAFT STRATEGY SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Draft Intelligence">
                        {!dr.winnerHitRate || Object.keys(dr.winnerHitRate).length === 0
                            ? 'Your upcoming draft picks and league draft intelligence. Target exciting prospects that fit your roster needs.'
                            : totalMyPicks === 0
                            ? 'No draft picks recorded for your team yet. Elite tier teams hit ' + Math.round(winnerR1Hit * 100) + '% on R1 picks in this league \u2014 prioritize ' + topDraftPos + ' in early rounds based on the elite tier template.'
                            : 'Your draft grade: ' + draftGradeLetter + ' \u2014 ' + (gradeIdx <= 2 ? 'elite drafter, a real advantage' : gradeIdx <= 5 ? 'average, not a competitive edge' : 'below average, costing you roster value') + '. Elite tier teams hit ' + Math.round(winnerR1Hit * 100) + '% in R1 vs your ' + Math.round(myR1Hit * 100) + '%. Recommendation: prioritize ' + topDraftPos + ' in R1-R2 based on the elite tier template. ' + (totalMyPicks < 10 ? 'You have limited draft history \u2014 accumulate picks to build through the draft.' : 'Focus on hit rate over volume.')}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => setActiveTab('draft'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Draft Board')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Draft Grade</div>
                        <div style={{ ...dKpiNum, fontSize: '2rem', color: gradeIdx <= 2 ? goodColor : gradeIdx <= 5 ? warnColor : badColor }}>{grades[gradeIdx]}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Based on hit rate advantage</div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Elite Tier Hit Rate</div>
                        <div style={dKpiNum}>{pctFmt(winnerHitAvg)}</div>
                        <div style={{ fontSize: '0.72rem', color: goodColor, fontFamily: 'Inter, sans-serif' }}>
                            +{Math.round(avgHitAdv * 100)}% vs league ({pctFmt(leagueHitAvg)})
                        </div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Your Draft Picks</div>
                        <div style={dKpiNum}>{totalMyPicks || '\u2014'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Across {rounds.length} rounds</div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Champions Draft</div>
                        <div style={dKpiNum}>{topDraftTarget ? topDraftTarget[0] : '\u2014'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7 }}>Most picked position by championship teams</div>
                    </div>
                </div>

                {/* ── TWO-COLUMN: Hit Rates + Draft Formula ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    {/* Hit Rates as BarChart */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}><span>HIT RATES BY ROUND</span>{typeof StarBtn !== 'undefined' && <StarBtn id="analytics_draft_hr" title="Draft Hit Rates" content="Hit rate % by draft round" sourceModule="Analytics · Draft" />}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Hit rate = % of picks at each round that became starter-quality players (top of their position group). Higher hit rate = better draft scouting.</div>
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '0.7rem', color: goodColor, fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Elite Tier Teams</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: hitRateBarItems, width: 340, height: 18, gap: 4 })}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)', fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>League Avg</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: hitRateLeagueItems, width: 340, height: 18, gap: 4 })}
                        </div>
                    </div>

                    {/* Draft Formula */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>WINNING DRAFT FORMULA</div>
                        {rounds.map(rd => {
                            const wProf = dr.winnerDraftProfile[rd] || {};
                            const myProf = myDraftProfile[rd] || {};
                            const sorted = Object.entries(wProf).sort((a, b) => b[1] - a[1]);
                            return (
                            <div key={rd} style={{ marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', color: 'var(--gold)', minWidth: '65px' }}>Round {rd}</span>
                                    <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {sorted.map(([pos, pct]) => (
                                            <span key={pos} style={{
                                                fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', padding: '2px 8px',
                                                borderRadius: '10px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)',
                                                border: '1px solid rgba(212,175,55,0.25)',
                                            }}>{pos} {pctFmt(pct)}</span>
                                        ))}
                                    </div>
                                </div>
                                {Object.keys(myProf).length > 0 && (
                                    <div style={{ marginLeft: '65px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {Object.entries(myProf).sort((a, b) => b[1] - a[1]).map(([pos, pct]) => (
                                            <span key={pos} style={{
                                                fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', padding: '1px 6px',
                                                borderRadius: '8px', background: 'rgba(78,205,196,0.1)', color: '#4ECDC4',
                                                border: '1px solid rgba(78,205,196,0.2)',
                                            }}>{pos} {pctFmt(pct)}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            );
                        })}
                        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.7rem' }}>
                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Elite Tier</span>
                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                        </div>
                    </div>
                </div>
            </React.Fragment>
            );
        })()}

        {/* ═══ WAIVER / TRADE INTELLIGENCE ═══ */}
        {analyticsTab === 'trades' && (() => {
            const tr = d.trades;
            if (!tr) return <div style={{ color: 'var(--silver)' }}>No trade data available.</div>;
            const wp = tr.winnerTradeProfile;
            const lp = tr.leagueTradeProfile;
            const mp = tr.myTradeProfile;
            const topPosBought = (prof) => {
                const entries = Object.entries(prof.positionsBought || {}).sort((a, b) => b[1] - a[1]);
                return entries.slice(0, 3).map(([p]) => p).join(', ') || '\u2014';
            };
            const alerts = [];
            if (mp.avgTradesPerSeason < lp.avgTradesPerSeason) alerts.push({ sev: 'medium', title: 'Low Trade Volume', msg: 'You trade below league average (' + mp.avgTradesPerSeason + ' vs ' + lp.avgTradesPerSeason + ' per season). Elite tier teams average ' + wp.avgTradesPerSeason + '.' });
            if (mp.avgValueGained < 0) alerts.push({ sev: 'high', title: 'Losing Value', msg: 'You\'re losing ' + Math.abs(mp.avgValueGained) + ' DHQ per trade on average. Elite tier teams gain +' + wp.avgValueGained + '.' });
            if (wp.partnerPreference && wp.partnerPreference !== mp.partnerPreference) alerts.push({ sev: 'low', title: 'Trade Partner Strategy', msg: 'Elite tier teams target ' + wp.partnerPreference + ' teams. You trade with ' + mp.partnerPreference + ' teams.' });

            // Build position bought bar chart items
            const allBoughtPos = [...new Set([...Object.keys(wp.positionsBought || {}), ...Object.keys(mp.positionsBought || {})])].filter(p => p !== 'UNK').sort();
            const boughtBarWinner = allBoughtPos.map(pos => ({ label: pos, value: (wp.positionsBought || {})[pos] || 0, color: CHART_COLORS?.gold || '#D4AF37' }));
            const boughtBarYou = allBoughtPos.map(pos => ({ label: pos, value: (mp.positionsBought || {})[pos] || 0, color: '#4ECDC4' }));

            // KPI card style
            const tKpiCardStyle = {
                background: 'linear-gradient(135deg, rgba(26,26,26,0.95), rgba(10,10,10,0.98))',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: '14px',
                padding: '20px 18px 14px',
                flex: '1 1 0',
                minWidth: '140px',
            };
            const tKpiNum = { fontFamily: 'Rajdhani, sans-serif', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
            const tKpiLabel = { fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

            const valueDeltaColor = mp.avgValueGained >= 0 ? goodColor : badColor;

            // ── Trade Strategy Summary ──
            const tradeVolDiff = mp.avgTradesPerSeason - wp.avgTradesPerSeason;
            const hasTraded = mp.avgTradesPerSeason > 0;
            const tradeEfficiency = !hasTraded ? '' : mp.avgValueGained >= 0 ? 'trading efficiently' : 'over-paying in trades';
            const tradeActivity = !hasTraded ? '' : tradeVolDiff < -1 ? 'under-trading' : tradeVolDiff > 1 ? 'over-trading' : 'trading at the right frequency';

            const tradeSummaryText = !hasTraded
                ? 'You haven\u2019t made any trades yet. Active trading is a key trait of winning teams \u2014 elite tier teams average ' + wp.avgTradesPerSeason + ' trades/season and gain +' + wp.avgValueGained + ' DHQ per trade. Consider using the trade finder to identify value opportunities.'
                : 'You average ' + mp.avgTradesPerSeason + ' trades/season vs elite tier teams\' ' + wp.avgTradesPerSeason + '. You ' + (mp.avgValueGained >= 0 ? 'gain +' : 'lose ') + Math.abs(mp.avgValueGained) + ' DHQ per trade (elite tier: +' + wp.avgValueGained + '). You are ' + tradeActivity + ' and ' + tradeEfficiency + '. ' + (mp.avgValueGained < 0 ? 'Focus on extracting value \u2014 target aging stars from contenders or sell depreciating assets.' : 'Keep leveraging your trade edge to consolidate elite talent.');

            return (
            <React.Fragment>
                {/* ── TRADE STRATEGY SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Trade Intelligence">
                        {tradeSummaryText}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => { setTradeSubTab('finder'); setActiveTab('trades'); }, style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Trade Finder')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Your Trades/Season</div>
                        <div style={tKpiNum}>{mp.avgTradesPerSeason}</div>
                        <div style={{ fontSize: '0.72rem', color: mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? goodColor : warnColor, fontFamily: 'Inter, sans-serif' }}>
                            {mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? '\u25B2' : '\u25BC'} League avg: {lp.avgTradesPerSeason}
                        </div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Avg DHQ Gained</div>
                        <div style={{ ...tKpiNum, color: valueDeltaColor }}>{(mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Inter, sans-serif' }}>
                            Elite Tier: +{wp.avgValueGained}
                        </div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Elite Tier Volume</div>
                        <div style={tKpiNum}>{wp.avgTradesPerSeason}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>trades per season</div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Top Positions Bought</div>
                        <div style={{ ...tKpiNum, fontSize: '1.3rem' }}>{topPosBought(wp)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7 }}>Positions champions acquire most via trade</div>
                    </div>
                </div>

                {/* ── TWO-COLUMN: Position Bought + Trade Profile Table ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    {/* Positions Bought BarChart */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>POSITIONS ACQUIRED VIA TRADE</div>
                        {allBoughtPos.length > 0 ? (
                        <React.Fragment>
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Elite Tier Teams</div>
                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarWinner, width: 340, height: 18, gap: 4 })}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Inter, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarYou, width: 340, height: 18, gap: 4 })}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.7rem' }}>
                                <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Elite Tier</span>
                                <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                            </div>
                        </React.Fragment>
                        ) : <div style={{ color: 'var(--silver)', fontSize: '0.85rem', opacity: 0.6 }}>No position data available</div>}
                    </div>

                    {/* Trade Comparison Table */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>TRADE COMPARISON</div>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid rgba(212,175,55,0.2)', fontFamily: 'Inter, sans-serif' }}>
                            <div>Metric</div><div>Elite Tier</div><div>League</div><div>You</div>
                        </div>
                        {[
                            ['Trades/Season', wp.avgTradesPerSeason, lp.avgTradesPerSeason, mp.avgTradesPerSeason],
                            ['Avg DHQ Gained', (wp.avgValueGained >= 0 ? '+' : '') + wp.avgValueGained, (lp.avgValueGained >= 0 ? '+' : '') + lp.avgValueGained, (mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained],
                            ['Top Bought', topPosBought(wp), topPosBought(lp), topPosBought(mp)],
                            ['Partner Pref.', wp.partnerPreference || '\u2014', lp.partnerPreference || '\u2014', mp.partnerPreference || '\u2014'],
                        ].map(([label, wVal, lVal, mVal], i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--silver)' }}>{label}</div>
                                <div style={{ color: 'var(--gold)' }}>{wVal}</div>
                                <div style={{ color: 'var(--silver)', opacity: 0.7 }}>{lVal}</div>
                                <div style={{ color: 'var(--white)' }}>{mVal}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── YOUR LAST 5 TRADES ── */}
                {tr.myLast5 && tr.myLast5.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Your Recent Trade Performance">
                        {tr.myLast5.map((trade, i) => {
                            const netDhq = trade.netDhq || 0;
                            const result = netDhq > 200 ? 'Won' : netDhq < -200 ? 'Lost' : 'Fair';
                            const resultColor = result === 'Won' ? goodColor : result === 'Lost' ? badColor : warnColor;
                            return (
                                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Inter, sans-serif' }}>S{trade.season || '?'} W{trade.week || '?'}</span>
                                        <span style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', padding: '2px 8px', borderRadius: '10px', background: resultColor + '22', color: resultColor, border: '1px solid ' + resultColor + '44', fontWeight: 700 }}>{result}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--silver)', fontFamily: 'Inter, sans-serif' }}>
                                        {(trade.gave || []).join(', ') || 'Unknown'} <span style={{ color: 'var(--gold)', margin: '0 4px' }}>{'\u2192'}</span> {(trade.got || []).join(', ') || 'Unknown'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: netDhq >= 0 ? goodColor : badColor, fontWeight: 700 }}>
                                        {netDhq >= 0 ? '+' : ''}{netDhq.toLocaleString()} DHQ
                                    </div>
                                </div>
                            );
                        })}
                    </GMMessage>
                </div>
                )}

                {/* ── INSIGHT CARDS ROW ── */}
                {alerts.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {alerts.map((a, i) => (
                        <div key={i} style={{
                            background: 'rgba(26,26,26,0.8)', borderRadius: '10px', padding: '14px 16px',
                            borderLeft: '4px solid ' + sevColor(a.sev),
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: sevColor(a.sev), marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {a.title}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>{a.msg}</div>
                        </div>
                    ))}
                </div>
                )}
            </React.Fragment>
            );
        })()}

        {/* ═══ PLAYOFF HISTORY ═══ */}
        {analyticsTab === 'playoffs' && (() => { try {
            const championships = window.App?.LI?.championships || {};
            const seasons = Object.entries(championships).sort(([a],[b]) => b.localeCompare(a));
            if (!seasons.length) return <div style={{ ...aCardStyle, color: 'var(--silver)', textAlign: 'center', padding: '40px' }}>No championship history available yet.</div>;

            // ── Playoff Profile Summary ──
            const myRidP = myRoster?.roster_id;
            let myChampionships = 0, myRunnerUps = 0;
            seasons.forEach(([season, data]) => {
                if (data.champion === myRidP) myChampionships++;
                if (data.runnerUp === myRidP) myRunnerUps++;
            });
            const myPlayoffAppearances = myChampionships + myRunnerUps;
            const playoffDiag = myChampionships > 0
                ? 'You have ' + myChampionships + ' championship' + (myChampionships > 1 ? 's' : '') + ' in ' + seasons.length + ' seasons.'
                : myRunnerUps > 0
                ? 'You have reached ' + myRunnerUps + ' final' + (myRunnerUps > 1 ? 's' : '') + ' but no championships in ' + seasons.length + ' seasons.'
                : 'You haven\'t reached the finals recently.';
            const playoffInsight = myRunnerUps > myChampionships && myRunnerUps > 0
                ? ' You struggle to close out championship matchups — consider roster upgrades at key playoff positions.'
                : myPlayoffAppearances === 0
                ? ' Focus on building a contender before worrying about playoff optimization.'
                : ' Your playoff track record is solid. Maintain your competitive edge.';

            return (
            <React.Fragment>
                {/* ── PLAYOFF PROFILE SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Playoff Profile">
                        {playoffDiag + playoffInsight}
                    </GMMessage>
                </div>

                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>PLAYOFF HISTORY</div>
                    {seasons.map(([season, data]) => {
                        const champName = getOwnerName(data.champion);
                        const runnerName = getOwnerName(data.runnerUp);
                        const isMyChamp = data.champion === myRoster?.roster_id;
                        const isMyRunner = data.runnerUp === myRoster?.roster_id;
                        const champRoster = currentLeague.rosters?.find(r => r.roster_id === data.champion);
                        const champUser = currentLeague.users?.find(u => u.user_id === champRoster?.owner_id);
                        const runnerRoster = currentLeague.rosters?.find(r => r.roster_id === data.runnerUp);
                        const runnerUser = currentLeague.users?.find(u => u.user_id === runnerRoster?.owner_id);
                        return (
                            <div key={season} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: 'var(--gold)', minWidth: '40px' }}>{season}</span>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: isMyChamp ? 'var(--gold)' : 'var(--white)', fontWeight: isMyChamp ? 700 : 400 }}>
                                        {champUser?.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + champUser.avatar} style={{ width:'20px', height:'20px', borderRadius:'50%' }} onError={e => e.target.style.display='none'} />}
                                        Champion: {champName}{champUser?.metadata?.team_name ? ' (' + champUser.metadata.team_name + ')' : ''}{isMyChamp ? ' (You!)' : ''}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--silver)' }}>
                                        {runnerUser?.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + runnerUser.avatar} style={{ width:'20px', height:'20px', borderRadius:'50%' }} onError={e => e.target.style.display='none'} />}
                                        Runner-up: {runnerName}{isMyRunner ? ' (You)' : ''}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── FULL BRACKET DISPLAY ── */}
                {(() => {
                    const bracketData = window.App?.LI?.bracketData;
                    if (!bracketData || !Object.keys(bracketData).length) return null;
                    const bracketSeasons = Object.entries(bracketData).sort(([a],[b]) => b.localeCompare(a));
                    return (
                        <div style={aCardStyle}>
                            <div style={aHeaderStyle}>PLAYOFF BRACKETS</div>
                            {bracketSeasons.map(([season, sData]) => {
                                const brackets = [
                                    { key: 'winners', label: 'Winners Bracket', data: sData.winners || sData.w || [] },
                                    { key: 'losers', label: 'Losers Bracket', data: sData.losers || sData.l || [] },
                                ];
                                return (
                                    <div key={season} style={{ marginBottom: '12px' }}>
                                        <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '8px' }}>{season} Playoffs</div>
                                        {brackets.map(b => {
                                            if (!b.data || !b.data.length) return null;
                                            return (
                                                <div key={b.key} style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{b.label}</div>
                                                    {b.data.map((matchup, mi) => {
                                                        const t1 = matchup.t1 || matchup.team1;
                                                        const t2 = matchup.t2 || matchup.team2;
                                                        const w = matchup.w || matchup.winner;
                                                        // Robust round label: handle 0-indexed rounds and missing values
                                                        let _mr = Math.max(...(b.data || []).map(m => m.r || m.round || 0), 0);
                                                        let _rd = matchup.r || matchup.round || 0;
                                                        // If all rounds are 0, try 1-indexing from matchup index
                                                        if (_mr <= 0) {
                                                            const uniqueRounds = [...new Set((b.data || []).map(m => m.r || m.round || 0))];
                                                            _mr = uniqueRounds.length || 1;
                                                            _rd = mi + 1; // fallback: use matchup index as round proxy
                                                        }
                                                        // If rounds appear 0-indexed (max round is 0-based), shift up by 1
                                                        if (_mr >= 1 && _rd === 0) { _rd = 1; }
                                                        // Debug log removed — was flooding console with every bracket matchup
                                                        const roundLabel = _rd === _mr ? 'Championship' : _rd === _mr - 1 ? 'Semi-finals' : _rd === _mr - 2 ? 'Quarter-finals' : 'Round ' + _rd;
                                                        const isMyGame = t1 === myRidP || t2 === myRidP;
                                                        return (
                                                            <div key={mi} style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginBottom: '4px',
                                                                background: isMyGame ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                                                                borderLeft: isMyGame ? '3px solid var(--gold)' : '3px solid transparent',
                                                                borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif',
                                                            }}>
                                                                <span style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, minWidth: '80px' }}>{roundLabel}</span>
                                                                <span style={{ color: w === t1 ? 'var(--gold)' : 'var(--silver)', fontWeight: w === t1 ? 700 : 400 }}>{getOwnerName(t1)}</span>
                                                                <span style={{ color: 'var(--silver)', opacity: 0.4, fontSize: '0.7rem' }}>vs</span>
                                                                <span style={{ color: w === t2 ? 'var(--gold)' : 'var(--silver)', fontWeight: w === t2 ? 700 : 400 }}>{getOwnerName(t2)}</span>
                                                                {w && <span style={{ color: 'var(--gold)', fontSize: '0.7rem', marginLeft: 'auto' }}>{'\u2192'} {getOwnerName(w)}</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                {/* Rivalry Detection */}
                {(() => {
                    const detectRivalries = window.App?.detectRivalries;
                    if (!detectRivalries || !myRoster) return null;
                    const rivals = detectRivalries(myRoster.roster_id);
                    if (!rivals || !rivals.length) return null;
                    return (
                        <div style={aCardStyle}>
                            <div style={aHeaderStyle}>YOUR PLAYOFF RIVALRIES</div>
                            {rivals.map((r, i) => {
                                const rivalName = getOwnerName(r.rosterId);
                                return (
                                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600, flex: 1 }}>{rivalName}</span>
                                            <span style={{ fontSize: '0.78rem', color: r.wins > r.losses ? goodColor : r.wins < r.losses ? badColor : warnColor, fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>{r.wins}-{r.losses}</span>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{r.total} meetings</span>
                                        </div>
                                        {r.meetings && r.meetings.length > 0 && (
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                {r.meetings.map((mtg, mi) => (
                                                    <span key={mi} style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', padding: '1px 6px', borderRadius: '8px', background: mtg.won ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', color: mtg.won ? goodColor : badColor, border: '1px solid ' + (mtg.won ? goodColor : badColor) + '33' }}>
                                                        Met in {mtg.bracket || 'Winners'} R{mtg.round || '?'} ({mtg.season || '?'})
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {(!r.meetings || !r.meetings.length) && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.65, marginTop: '2px' }}>{r.seasons.join(', ')}</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </React.Fragment>
            );
        } catch(e) { console.warn('[WarRoom] Playoffs render error:', e); return <div style={{ padding: '24px', textAlign: 'center', color: 'var(--silver)' }}>Playoff data could not be rendered. Check console for details.</div>; } })()}

        {/* ═══ TIMELINE ═══ */}
        {analyticsTab === 'timeline' && (() => {
            const championships = window.App?.LI?.championships || {};
            const tradeHistory = window.App?.LI?.tradeHistory || [];
            // Uses shared getOwnerName() passed as prop
            const events = [];

            Object.entries(championships).forEach(([season, data]) => {
                if (data.champion) events.push({ year: season, type: 'champ', title: getOwnerName(data.champion) + ' wins the championship', color: 'var(--gold)', ts: parseInt(season)*100+99 });
                if (data.runnerUp) events.push({ year: season, type: 'finals', title: getOwnerName(data.runnerUp) + ' finishes runner-up', color: 'var(--silver)', ts: parseInt(season)*100+98 });
            });

            // Collect all trades with DHQ, then keep top 5 by total value
            const _tradeEvents = [];
            tradeHistory.forEach(trade => {
                const rids = trade.roster_ids || [];
                const names = rids.map(r => getOwnerName(r)).join(' and ');
                const pids = Object.keys(trade.sides || {}).flatMap(rid => (trade.sides[rid]?.players || []));
                const playerNames = pids.slice(0, 3).map(pid => playersData[pid]?.full_name || pid).join(', ');
                const totalVal = pids.reduce((s, pid) => s + Math.abs(window.App?.LI?.playerScores?.[pid] || 0), 0);
                if (totalVal < 5000) return;
                _tradeEvents.push({
                    year: trade.season || '?', type: 'trade',
                    title: names + ' swap assets' + (playerNames ? ': ' + playerNames : ''),
                    sub: totalVal > 0 ? totalVal.toLocaleString() + ' DHQ moved' : '',
                    color: '#F0A500', ts: parseInt(trade.season||0)*100 + (trade.week||50),
                    _totalVal: totalVal
                });
            });
            _tradeEvents.sort((a, b) => b._totalVal - a._totalVal);
            _tradeEvents.slice(0, 5).forEach(te => events.push(te));

            // Personal highlights per year
            const myRidTLx = myRoster?.roster_id;
            const playerScoresTL = window.App?.LI?.playerScores || {};
            const draftOutcomesTL = (window.App?.LI || {}).draftOutcomes || [];
            const allYears = [...new Set([...Object.keys(championships), ...events.map(e => String(e.year))])].sort((a,b) => b - a);
            allYears.forEach(yr => {
                // Your team's finish
                const cData = championships[yr];
                if (cData) {
                    if (cData.champion === myRidTLx) events.push({ year: yr, type: 'personal', title: 'You won the championship!', color: 'var(--gold)', ts: parseInt(yr)*100+97 });
                    else if (cData.runnerUp === myRidTLx) events.push({ year: yr, type: 'personal', title: 'You finished as runner-up', color: 'var(--silver)', ts: parseInt(yr)*100+96 });
                    else if ((cData.semiFinalists || []).includes(myRidTLx)) events.push({ year: yr, type: 'personal', title: 'You reached the semi-finals', color: '#4ECDC4', ts: parseInt(yr)*100+95 });
                }
                // Your best draft pick that year
                const myDraftPicks = draftOutcomesTL.filter(dp => dp.roster_id === myRidTLx && String(dp.season || dp.year) === String(yr));
                if (myDraftPicks.length > 0) {
                    const bestPick = myDraftPicks.reduce((best, dp) => (playerScoresTL[dp.player_id] || 0) > (playerScoresTL[best.player_id] || 0) ? dp : best, myDraftPicks[0]);
                    const bestDhq = playerScoresTL[bestPick.player_id] || 0;
                    if (bestDhq > 2000) {
                        const pName = playersData[bestPick.player_id]?.full_name || bestPick.player_id;
                        events.push({ year: yr, type: 'personal', title: 'Best draft pick: ' + pName + ' (R' + (bestPick.round || '?') + ', ' + bestDhq.toLocaleString() + ' DHQ)', color: '#4ECDC4', ts: parseInt(yr)*100+94 });
                    }
                }
            });

            events.sort((a, b) => b.ts - a.ts);
            const years = [...new Set(events.map(e => e.year))].sort((a, b) => b - a);

            if (!events.length) return <div style={{ color:'var(--silver)', textAlign:'center', padding:'40px' }}>No timeline events. DHQ engine needs to load trade history and championship data.</div>;

            // ── League Narrative Summary ──
            const champCounts = {};
            Object.values(championships).forEach(data => {
                if (data.champion) champCounts[data.champion] = (champCounts[data.champion] || 0) + 1;
            });
            const champEntries = Object.entries(champCounts).sort((a, b) => b[1] - a[1]);
            const dominantTeam = champEntries.length > 0 ? getOwnerName(champEntries[0][0]) : 'N/A';
            const dominantTitles = champEntries.length > 0 ? champEntries[0][1] : 0;
            const repeatWinners = champEntries.filter(([, cnt]) => cnt > 1).map(([rid]) => getOwnerName(rid));
            const myRidTL = myRoster?.roster_id;
            const myChampsTL = champCounts[myRidTL] || 0;
            // Trajectory from projection data
            const projTL = d.projection || [];
            const tlTrend = projTL.length >= 2 ? projTL[projTL.length - 1].projectedDHQ - projTL[0].projectedDHQ : 0;
            const myTrajectory = tlTrend > 500 ? 'rising' : tlTrend < -500 ? 'declining' : 'stable';
            // Next champion candidates: teams with highest health scores
            const allRostersTL = _SS.rosters || [];
            const teamHealthList = [];
            allRostersTL.forEach(ros => {
                try {
                    if (window.assessTeamFromGlobal) {
                        const a = window.assessTeamFromGlobal(ros.roster_id);
                        if (a) teamHealthList.push({ rid: ros.roster_id, name: getOwnerName(ros.roster_id), health: a.healthScore || 0 });
                    }
                } catch(e) { window.wrLog('timeline.assessTeam', e); }
            });
            teamHealthList.sort((a, b) => b.health - a.health);
            const nextChampCandidates = teamHealthList.slice(0, 3).map(t => t.name).join(', ') || 'insufficient data';

            return (
                <React.Fragment>
                {/* ── LEAGUE NARRATIVE SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="League Narrative">
                        {'League dominated by ' + dominantTeam + ' with ' + dominantTitles + ' title' + (dominantTitles > 1 ? 's' : '') + '.' + (repeatWinners.length > 0 ? ' Repeat elite tier: ' + repeatWinners.join(', ') + '.' : ' No repeat champions yet \u2014 wide-open league.') + ' Your trajectory: ' + myTrajectory + (myChampsTL > 0 ? ' (' + myChampsTL + ' title' + (myChampsTL > 1 ? 's' : '') + ')' : '') + '. Next likely champion candidates: ' + nextChampCandidates + '.'}
                    </GMMessage>
                </div>

                <div style={{ background:'var(--black)', border:'2px solid rgba(212,175,55,0.3)', borderRadius:'12px', padding:'24px' }}>
                    <div style={{ fontFamily:'Rajdhani, sans-serif', fontSize:'1.3rem', color:'var(--gold)', letterSpacing:'0.08em', marginBottom:'12px' }}>LEAGUE TIMELINE</div>
                    {years.map(year => {
                        const yearEvents = events.filter(e => e.year === year);
                        return (
                            <div key={year} style={{ marginBottom:'24px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                    <div style={{ width:'14px', height:'14px', background:'var(--gold)', borderRadius:'50%', border:'3px solid var(--black)', flexShrink:0 }} />
                                    <span style={{ fontFamily:'Rajdhani, sans-serif', fontSize:'1.2rem', color:'var(--gold)' }}>{year}</span>
                                </div>
                                <div style={{ paddingLeft:'20px', borderLeft:'2px solid rgba(212,175,55,0.2)', marginLeft:'6px' }}>
                                    {yearEvents.map((ev, i) => (
                                        <div key={i} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(212,175,55,0.12)', borderLeft:'3px solid '+ev.color, borderRadius:'6px', padding:'10px 14px', marginBottom:'8px', position:'relative' }}>
                                            <div style={{ position:'absolute', left:'-14px', top:'12px', width:'8px', height:'8px', background:ev.color, borderRadius:'50%', border:'2px solid var(--black)' }} />
                                            <div style={{ fontSize:'0.78rem', color:ev.color, textTransform:'uppercase', fontFamily:'Inter, sans-serif', letterSpacing:'0.06em', marginBottom:'3px' }}>{ev.type === 'champ' ? 'Championship' : ev.type === 'finals' ? 'Runner-Up' : ev.type === 'personal' ? 'Your Highlight' : 'Trade'}</div>
                                            <div style={{ fontSize:'0.78rem', color:'var(--white)', fontWeight:600 }}>{ev.title}</div>
                                            {ev.sub && <div style={{ fontSize:'0.74rem', color:'var(--silver)', opacity:0.6, marginTop:'2px' }}>{ev.sub}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
                </React.Fragment>
            );
        })()}

        </React.Fragment>
        )}
    </div>
    );
}
