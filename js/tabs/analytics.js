// ══════════════════════════════════════════════════════════════════
// js/tabs/analytics.js — AnalyticsPanel: League analytics terminal
// with 7 sub-tabs: Roster, Draft, Waivers, Trades, Projections,
// Playoffs, Timeline
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

    const aCardStyle = { background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px' };
    const aHeaderStyle = { fontFamily: 'Bebas Neue, cursive', color: 'var(--gold)', fontSize: '1.2rem', letterSpacing: '0.08em', marginBottom: '12px', borderBottom: '1px solid rgba(212,175,55,0.2)', paddingBottom: '8px' };
    const aValStyle = { fontFamily: 'Oswald, sans-serif', fontSize: '0.95rem' };
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
        { key: 'waivers', label: 'Waivers' },
        { key: 'trades', label: 'Trades' },
        { key: 'projections', label: 'Projections' },
        { key: 'playoffs', label: 'Playoffs' },
        { key: 'timeline', label: 'Timeline' },
    ];
    const subTabBtnStyle = (active) => ({
        padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Bebas Neue, cursive', fontSize: '1rem', letterSpacing: '0.06em', transition: 'all 0.2s',
        border: active ? '2px solid var(--gold)' : '2px solid rgba(212,175,55,0.3)',
        background: active ? 'var(--gold)' : 'transparent',
        color: active ? 'var(--black)' : 'var(--gold)',
    });
    const tableRowStyle = (i) => ({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', ...(i === 0 ? { fontWeight: 700, color: 'var(--gold)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' } : { color: 'var(--silver)' }) });
    const d = analyticsData;

    return (
    <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.4rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>LEAGUE ANALYTICS</div>
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '16px' }}>Winners = playoff bracket champions, runner-ups, and semi-finalists when available. Falls back to top 3 by record in the current season.</div>

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
                fontFamily: 'Bebas Neue, cursive',
                fontSize: '1.8rem',
                lineHeight: 1,
                color: 'var(--white)',
                marginBottom: '2px',
            };
            const kpiLabelStyle = {
                fontFamily: 'Oswald, sans-serif',
                fontSize: '0.68rem',
                color: 'var(--silver)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: 0.7,
            };
            const kpiDeltaStyle = (positive) => ({
                fontFamily: 'Oswald, sans-serif',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: positive ? goodColor : badColor,
                marginTop: '4px',
            });

            // ── Position data for BarChart ──
            const allPos = [...new Set([...Object.keys(w.posInvestment || {}), ...Object.keys(m.posInvestment || {})])].filter(p => p !== 'UNK').sort();
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
            const eliteDiff = mElite - wElite;
            if (eliteDiff < -0.3) {
                insights.push({
                    color: badColor,
                    title: 'Elite Player Deficit',
                    text: 'You need ' + Math.abs(eliteDiff).toFixed(1) + ' more elite players (top 5 at position) to match winners.',
                });
            }
            if (m.avgBenchQuality < w.avgBenchQuality * 0.75) {
                insights.push({
                    color: warnColor,
                    title: 'Bench Depth Concern',
                    text: 'Bench quality (' + numFmt(m.avgBenchQuality) + ') is significantly below winner benchmark (' + numFmt(w.avgBenchQuality) + ').',
                });
            }
            if (m.avgTotalDHQ < w.avgTotalDHQ * 0.85) {
                insights.push({
                    color: badColor,
                    title: 'Total Value Gap',
                    text: 'Your total DHQ (' + numFmt(m.avgTotalDHQ) + ') trails winner average (' + numFmt(w.avgTotalDHQ) + ') by ' + Math.round((1 - m.avgTotalDHQ / w.avgTotalDHQ) * 100) + '%.',
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
                : dhqGap >= 0 && ageDiffDiag <= 0.5 ? 'hold course — your roster matches the winner template'
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
                                parts.push(ageDiffDiag > 0 ? 'Your roster skews older than typical winners — keep an eye on your window.' : 'You\'re younger than most contenders, which gives you a longer runway.');
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
                            React.createElement('button', { onClick: () => setActiveTab('trades'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Find Trade Targets'),
                            React.createElement('button', { onClick: () => setActiveTab('fa'), style: { padding: '6px 14px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'View Free Agents')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    {/* Total DHQ */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Total DHQ <span title="Dynasty Health Quotient — the total dynasty value of all players on your roster, measured by scoring, age, position scarcity, and production." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
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
                        <div style={kpiLabelStyle}>Health Score <span title="0-100 composite score measuring roster balance, depth, age profile, and elite talent. Higher = more championship-ready." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={kpiNumberStyle}>{healthScore}</div>
                            <div style={{ marginTop: '4px' }}>
                                {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: healthScore, size: 48, thickness: 5 })}
                            </div>
                        </div>
                        <div style={kpiDeltaStyle(healthDelta >= 0)}>
                            {healthDelta >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(healthDelta)} vs winners
                        </div>
                    </div>
                    {/* Elite Count */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Elite Players <span title="Players ranked top 5 at their position across all league rosters." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={kpiNumberStyle}>{mElite}</div>
                        <div style={kpiDeltaStyle(mElite >= wElite)}>
                            {mElite >= wElite ? '= ' : '\u25BC '}{mElite >= wElite ? 'above' : Math.abs(mElite - wElite).toFixed(1) + ' below'} winners ({wElite})
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.5, marginTop: '4px' }}>Top 5 at position</div>
                    </div>
                    {/* Compete Window */}
                    <div style={kpiCardStyle}>
                        <div style={kpiLabelStyle}>Compete Window <span title="Estimated years your roster can remain championship-competitive based on age curves, peak windows, and current DHQ trajectory." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
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
                        <div style={aHeaderStyle}>POSITION INVESTMENT</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Position investment shows what % of your total roster DHQ is allocated to each position. For example, "QB: 18%" means 18% of your total dynasty value is in QBs.</div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarWinnerItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: posBarItems, width: Math.min(380, 360), height: 18, gap: 4 })}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners %</span>
                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} Your %</span>
                        </div>
                    </div>

                    {/* Right: Gap Analysis Visual Cards */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>GAP ANALYSIS</div>
                        {gapsList.length === 0 && <div style={{ color: goodColor, fontSize: '0.9rem', padding: '12px 0' }}>Your roster matches the winner template closely.</div>}
                        {gapsList.slice(0, 6).map((g, i) => {
                            const sev = g.priority || g.severity || 'low';
                            const sevBg = sev === 'high' || sev === 'critical' ? 'rgba(231,76,60,0.08)' : sev === 'medium' ? 'rgba(240,165,0,0.08)' : 'rgba(46,204,113,0.06)';
                            return (
                            <div key={i} style={{
                                padding: '10px 14px', marginBottom: '8px',
                                background: sevBg,
                                borderLeft: '3px solid ' + sevColor(sev),
                                borderRadius: '0 8px 8px 0',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: sevColor(sev), fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase' }}>
                                        {g.action || g.area}
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px',
                                        borderRadius: '10px', background: sevColor(sev), color: 'var(--black)', fontWeight: 700,
                                    }}>
                                        {(sev).toUpperCase()}
                                    </span>
                                </div>
                                <div style={{ color: 'var(--silver)', fontSize: '0.78rem', marginTop: '4px' }}>
                                    {g.detail || (g.yours != null && g.winners != null
                                        ? 'You: ' + (g.unit === '%' ? pctFmt(g.yours) : (typeof g.yours === 'number' ? Math.round(g.yours).toLocaleString() : g.yours) + (g.unit ? ' ' + g.unit : ' DHQ')) + ' → Winners: ' + (g.unit === '%' ? pctFmt(g.winners) : (typeof g.winners === 'number' ? Math.round(g.winners).toLocaleString() : g.winners) + (g.unit ? ' ' + g.unit : ' DHQ'))
                                        : (g.unit === '%' ? pctFmt(g.yours) + ' (winners: ' + pctFmt(g.winners) + ')' : numFmt(g.yours) + ' ' + g.unit + ' (winners: ' + numFmt(g.winners) + ')'))}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── RADAR CHART: Position Balance ── */}
                {Object.keys(radarValues).length >= 3 && (
                <div style={{ ...aCardStyle, display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <div>
                        <div style={aHeaderStyle}>POSITION BALANCE vs WINNERS</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '8px', lineHeight: 1.5 }}>100 = you invest 43% more than champions at that position. 70 = matched to champion allocation. Below 70 = underweight vs champions.</div>
                    </div>
                    <div style={{ margin: '0 auto' }}>
                        {typeof RadarChart !== 'undefined' && React.createElement(RadarChart, { values: radarValues, size: 200, color: '#4ECDC4' })}
                    </div>
                </div>
                )}

                {/* ── PERFORMANCE RANKINGS TABLE ── */}
                <div style={{ ...aCardStyle, marginBottom: '12px' }}>
                    <div style={aHeaderStyle}>LEAGUE POWER RANKINGS</div>
                    {/* Header row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 0.7fr 80px 0.9fr 0.7fr', gap: '8px', padding: '8px 0', borderBottom: '2px solid rgba(212,175,55,0.2)', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Oswald, sans-serif' }}>
                        <div>#</div><div>Team</div><div>Record</div><div>Health</div><div>Total DHQ</div><div>Tier</div>
                    </div>
                    {teamRankings.map((team, i) => {
                        const tierUpper = (team.tier || '').toUpperCase();
                        const tierBg = tierUpper === 'ELITE' ? '#D4AF37' : tierUpper === 'CONTENDER' ? goodColor : tierUpper === 'CROSSROADS' ? warnColor : tierUpper === 'REBUILDING' ? badColor : 'var(--silver)';
                        return (
                        <div key={team.rosterId} className={team.isMe ? 'wr-my-row' : undefined} style={{
                            display: 'grid', gridTemplateColumns: '36px 1.4fr 0.7fr 80px 0.9fr 0.7fr', gap: '8px', padding: '8px 0',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: team.isMe ? 'rgba(212,175,55,0.06)' : 'transparent',
                            borderLeft: team.isMe ? '3px solid var(--gold)' : '3px solid transparent',
                            paddingLeft: '4px',
                        }}>
                            <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.1rem', color: i < 3 ? 'var(--gold)' : 'var(--silver)' }}>{i + 1}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {team.avatar && <img src={'https://sleepercdn.com/avatars/thumbs/' + team.avatar} style={{ width:'24px', height:'24px', borderRadius:'50%', flexShrink:0 }} onError={e => e.target.style.display='none'} />}
                                <div>
                                    <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: team.isMe ? 'var(--gold)' : 'var(--white)', fontWeight: team.isMe ? 700 : 400 }}>
                                        {team.name}{team.isMe ? ' (You)' : ''}
                                    </div>
                                    {team.teamName && <div style={{ fontSize: '0.65rem', color: 'var(--silver)', opacity: 0.5 }}>{team.teamName}</div>}
                                </div>
                            </div>
                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', color: 'var(--silver)' }}>{team.wins}-{team.losses}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {typeof MiniDonut !== 'undefined' && React.createElement(MiniDonut, { value: team.healthScore, size: 32, thickness: 3 })}
                            </div>
                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: 'var(--silver)' }}>
                                {team.totalDhq.toLocaleString()}
                                {/* Mini bar indicator */}
                                <div style={{ height: '3px', marginTop: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: Math.min(100, Math.round(team.totalDhq / Math.max(teamRankings[0]?.totalDhq || 1, 1) * 100)) + '%', background: 'var(--gold)', opacity: 0.5, borderRadius: '2px' }} />
                                </div>
                            </div>
                            <div>
                                <span style={{
                                    fontSize: '0.65rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px', borderRadius: '10px',
                                    background: tierBg + '22', color: tierBg, border: '1px solid ' + tierBg + '44', fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                }}>{team.tier || '\u2014'}</span>
                            </div>
                        </div>
                        );
                    })}
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
                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: ins.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {ins.title}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>{ins.text}</div>
                        </div>
                    ))}
                </div>
                )}
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
            const dKpiNum = { fontFamily: 'Bebas Neue, cursive', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
            const dKpiLabel = { fontFamily: 'Oswald, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

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
                            ? 'No draft picks recorded for your team yet. Winners hit ' + Math.round(winnerR1Hit * 100) + '% on R1 picks in this league \u2014 prioritize ' + topDraftPos + ' in early rounds based on the winner template.'
                            : 'Your draft grade: ' + draftGradeLetter + ' \u2014 ' + (gradeIdx <= 2 ? 'elite drafter, a real advantage' : gradeIdx <= 5 ? 'average, not a competitive edge' : 'below average, costing you roster value') + '. Winners hit ' + Math.round(winnerR1Hit * 100) + '% in R1 vs your ' + Math.round(myR1Hit * 100) + '%. Recommendation: prioritize ' + topDraftPos + ' in R1-R2 based on the winner template. ' + (totalMyPicks < 10 ? 'You have limited draft history \u2014 accumulate picks to build through the draft.' : 'Focus on hit rate over volume.')}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => setActiveTab('draft'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Draft Board')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Draft Grade <span title="Letter grade comparing your draft hit rate to the league average. A+ = elite drafter, C = average, D = below average and costing roster value." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={{ ...dKpiNum, fontSize: '2rem', color: gradeIdx <= 2 ? goodColor : gradeIdx <= 5 ? warnColor : badColor }}>{grades[gradeIdx]}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Based on hit rate advantage</div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Winner Hit Rate <span title="% of draft picks by championship teams that became starter-quality players. Higher = better draft scouting by winners." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={dKpiNum}>{pctFmt(winnerHitAvg)}</div>
                        <div style={{ fontSize: '0.72rem', color: goodColor, fontFamily: 'Oswald, sans-serif' }}>
                            +{Math.round(avgHitAdv * 100)}% vs league ({pctFmt(leagueHitAvg)})
                        </div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Your Draft Picks <span title="Total number of draft picks your team has made across all recorded drafts in this league." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={dKpiNum}>{totalMyPicks || '\u2014'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>Across {rounds.length} rounds</div>
                    </div>
                    <div style={dKpiCardStyle}>
                        <div style={dKpiLabel}>Champions Draft <span title="The position that championship-winning teams draft most frequently across all rounds." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={dKpiNum}>{topDraftTarget ? topDraftTarget[0] : '\u2014'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7 }}>Most picked position by championship teams</div>
                    </div>
                </div>

                {/* ── TWO-COLUMN: Hit Rates + Draft Formula ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '12px' }}>
                    {/* Hit Rates as BarChart */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>HIT RATES BY ROUND</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Hit rate = % of picks at each round that became starter-quality players (top of their position group). Higher hit rate = better draft scouting.</div>
                        <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '0.7rem', color: goodColor, fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                            {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: hitRateBarItems, width: 340, height: 18, gap: 4 })}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>League Avg</div>
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
                                    <span style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1rem', color: 'var(--gold)', minWidth: '65px' }}>Round {rd}</span>
                                    <div style={{ flex: 1, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {sorted.map(([pos, pct]) => (
                                            <span key={pos} style={{
                                                fontSize: '0.72rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px',
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
                                                fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '1px 6px',
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
                            <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners</span>
                            <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                        </div>
                    </div>
                </div>
            </React.Fragment>
            );
        })()}

        {/* ═══ WAIVER INTELLIGENCE ═══ */}
        {analyticsTab === 'waivers' && (() => {
            const wv = d.waivers;
            if (!wv) return <div style={{ color: 'var(--silver)' }}>No waiver data available.</div>;
            const positions = [...new Set([...Object.keys(wv.winnerFaabProfile || {}), ...Object.keys(wv.leagueFaabProfile || {})])].filter(p => p !== 'UNK').sort();
            // Get user's FAAB data (approximation from ownerProfiles)
            const S = _SS;
            const LI = window.App?.LI || {};
            const myRid = S?.myRosterId;
            const myOwnerProf = (LI.ownerProfiles || {})[myRid] || {};
            const myTiming = myOwnerProf.weekTiming || {};
            const myTimingTotal = (myTiming.early || 0) + (myTiming.mid || 0) + (myTiming.late || 0) || 1;
            const myTimingPcts = {
                early: ((myTiming.early || 0) / myTimingTotal).toFixed(2),
                mid: ((myTiming.mid || 0) / myTimingTotal).toFixed(2),
                late: ((myTiming.late || 0) / myTimingTotal).toFixed(2),
            };

            // ── Waiver Strategy Summary ──
            const winnerFaab = wv.winnerFaabProfile || {};
            const leagueFaab = wv.leagueFaabProfile || {};
            const underSpendPos = positions.filter(pos => {
                const wAvg = (winnerFaab[pos] || {}).avg || 0;
                const lAvg = (leagueFaab[pos] || {}).avg || 0;
                return wAvg > lAvg * 1.2;
            });
            const topUnderSpend = underSpendPos.length > 0 ? underSpendPos.join(', ') : 'all positions';
            const winnerEarlyPct = Math.round((wv.winnerTiming?.early || 0) * 100);
            const myEarlyPct = Math.round((parseFloat(myTimingPcts.early) || 0) * 100);

            return (
            <React.Fragment>
                {/* ── WAIVER STRATEGY SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Waiver Intelligence">
                        {winnerEarlyPct === 0 && myEarlyPct === 0
                            ? 'No significant FAAB activity yet this season. Monitor early-season pickups closely \u2014 winners typically front-load spending on high-upside ' + (underSpendPos[0] || 'RB/WR') + ' to build early advantages.'
                            : (winnerEarlyPct >= 20 ? 'Winners spend aggressively on ' + topUnderSpend + ' early in the season. ' : 'Winners invest in ' + topUnderSpend + ' early in the season. ') + 'They spend ' + winnerEarlyPct + '% of FAAB budget spent in weeks 1-6 vs your ' + myEarlyPct + '% of FAAB budget spent in weeks 1-6. ' + (myEarlyPct < winnerEarlyPct - 10 ? 'You are under-spending early \u2014 front-load your FAAB to capture impact players before your competition.' : 'Your spending timing aligns well with winners.') + ' Focus waiver claims on high-upside ' + (underSpendPos[0] || 'RB/WR') + ' to maximize roster value.'}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => setActiveTab('fa'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'View Waiver Targets')
                        )}
                    </GMMessage>
                </div>

                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>WINNER FAAB PROFILE</div>
                    <div style={{ ...tableRowStyle(0) }}>
                        <div>Position</div><div>Winner Avg</div><div>League Avg</div><div>W vs L</div>
                    </div>
                    {positions.map((pos, i) => {
                        const wAvg = (wv.winnerFaabProfile[pos] || {}).avg || 0;
                        const lAvg = (wv.leagueFaabProfile[pos] || {}).avg || 0;
                        const diff = lAvg > 0 ? ((wAvg - lAvg) / lAvg * 100).toFixed(0) : (wAvg > 0 ? '+\u221E' : '\u2014');
                        return (
                        <div key={pos} style={{ ...tableRowStyle(1), ...aValStyle }}>
                            <div style={{ color: 'var(--silver)' }}>{pos}</div>
                            <div style={{ color: 'var(--gold)' }}>${wAvg.toFixed(0)}</div>
                            <div>${lAvg.toFixed(0)}</div>
                            <div style={{ color: wAvg > lAvg ? goodColor : wAvg < lAvg ? badColor : 'var(--silver)' }}>{typeof diff === 'string' ? diff : (diff > 0 ? '+' + diff + '%' : diff + '%')}</div>
                        </div>
                        );
                    })}
                </div>

                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>SPENDING TIMING</div>
                    {[
                        { label: 'Winners', data: wv.winnerTiming, color: 'var(--gold)' },
                        { label: 'League', data: wv.leagueTiming, color: 'var(--silver)' },
                        { label: 'You', data: myTimingPcts, color: '#4ECDC4' },
                    ].map(({ label, data, color }) => (
                        <div key={label} style={{ marginBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.85rem', color }}>
                                <span style={{ fontWeight: 700 }}>{label}</span>
                                <span>{pctFmt(data.early)} early / {pctFmt(data.mid)} mid / {pctFmt(data.late)} late</span>
                            </div>
                            <div style={{ display: 'flex', height: '12px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: pctFmt(data.early), background: goodColor, opacity: 0.7 }} />
                                <div style={{ width: pctFmt(data.mid), background: warnColor, opacity: 0.7 }} />
                                <div style={{ width: pctFmt(data.late), background: badColor, opacity: 0.7 }} />
                            </div>
                        </div>
                    ))}
                    {wv.winnerTiming.early > (parseFloat(myTimingPcts.early) || 0) + 0.15 && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(240,165,0,0.1)', borderRadius: '8px', borderLeft: '3px solid ' + warnColor }}>
                            <span style={{ color: warnColor, fontWeight: 700, fontSize: '0.85rem' }}>{'\u26A0\uFE0F'} Winners front-load spending {'\u2014'} you spread too evenly</span>
                        </div>
                    )}
                </div>

                {wv.faabEfficiency && (
                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>FAAB EFFICIENCY (DHQ per $)</div>
                    <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '16px' }}>
                        {[{ label: 'Winners', val: wv.faabEfficiency.winners, color: 'var(--gold)' }, { label: 'League', val: wv.faabEfficiency.league, color: 'var(--silver)' }].map(({ label, val, color }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.6rem', color }}>{val}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>{label}</div>
                            </div>
                        ))}
                    </div>
                    {wv.faabEffByPos && Object.keys(wv.faabEffByPos).length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', borderTop: '1px solid rgba(212,175,55,0.15)', paddingTop: '12px' }}>By Position</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Oswald, sans-serif' }}>
                            <div>Position</div><div>Avg Bid</div><div>DHQ Return</div><div>DHQ per $</div>
                        </div>
                        {Object.entries(wv.faabEffByPos).sort((a,b) => (b[1].dhqPerDollar || 0) - (a[1].dhqPerDollar || 0)).map(([pos, data]) => (
                            <div key={pos} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--silver)' }}>{pos}</div>
                                <div style={{ color: 'var(--white)' }}>${(data.avgBid || 0).toFixed(0)}</div>
                                <div style={{ color: 'var(--white)' }}>{(data.dhqReturn || 0).toLocaleString()}</div>
                                <div style={{ color: (data.dhqPerDollar || 0) >= (wv.faabEfficiency?.winners || 0) ? goodColor : warnColor, fontWeight: 700 }}>{(data.dhqPerDollar || 0).toFixed(1)}</div>
                            </div>
                        ))}
                    </div>
                    )}
                </div>
                )}
            </React.Fragment>
            );
        })()}

        {/* ═══ TRADE INTELLIGENCE ═══ */}
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
            if (mp.avgTradesPerSeason < lp.avgTradesPerSeason) alerts.push({ sev: 'medium', title: 'Low Trade Volume', msg: 'You trade below league average (' + mp.avgTradesPerSeason + ' vs ' + lp.avgTradesPerSeason + ' per season). Winners average ' + wp.avgTradesPerSeason + '.' });
            if (mp.avgValueGained < 0) alerts.push({ sev: 'high', title: 'Losing Value', msg: 'You\'re losing ' + Math.abs(mp.avgValueGained) + ' DHQ per trade on average. Winners gain +' + wp.avgValueGained + '.' });
            if (wp.partnerPreference && wp.partnerPreference !== mp.partnerPreference) alerts.push({ sev: 'low', title: 'Trade Partner Strategy', msg: 'Winners target ' + wp.partnerPreference + ' teams. You trade with ' + mp.partnerPreference + ' teams.' });
            if (mp.avgValueGained >= 0) alerts.push({ sev: 'low', title: 'Positive Value', msg: 'You gain +' + mp.avgValueGained + ' DHQ per trade. Keep extracting surplus in deals.' });

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
            const tKpiNum = { fontFamily: 'Bebas Neue, cursive', fontSize: '2.2rem', lineHeight: 1, color: 'var(--white)', marginBottom: '2px' };
            const tKpiLabel = { fontFamily: 'Oswald, sans-serif', fontSize: '0.7rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 };

            const valueDeltaColor = mp.avgValueGained >= 0 ? goodColor : badColor;

            // ── Trade Strategy Summary ──
            const tradeVolDiff = mp.avgTradesPerSeason - wp.avgTradesPerSeason;
            const hasTraded = mp.avgTradesPerSeason > 0;
            const tradeEfficiency = !hasTraded ? '' : mp.avgValueGained >= 0 ? 'trading efficiently' : 'over-paying in trades';
            const tradeActivity = !hasTraded ? '' : tradeVolDiff < -1 ? 'under-trading' : tradeVolDiff > 1 ? 'over-trading' : 'trading at the right frequency';

            const tradeSummaryText = !hasTraded
                ? 'You haven\u2019t made any trades yet. Active trading is a key trait of winning teams \u2014 winners average ' + wp.avgTradesPerSeason + ' trades/season and gain +' + wp.avgValueGained + ' DHQ per trade. Consider using the trade finder to identify value opportunities.'
                : 'You average ' + mp.avgTradesPerSeason + ' trades/season vs winners\u2019 ' + wp.avgTradesPerSeason + '. You ' + (mp.avgValueGained >= 0 ? 'gain +' : 'lose ') + Math.abs(mp.avgValueGained) + ' DHQ per trade (winners: +' + wp.avgValueGained + '). You are ' + tradeActivity + ' and ' + tradeEfficiency + '. ' + (mp.avgValueGained < 0 ? 'Focus on extracting value \u2014 target aging stars from contenders or sell depreciating assets.' : 'Keep leveraging your trade edge to consolidate elite talent.');

            return (
            <React.Fragment>
                {/* ── TRADE STRATEGY SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Trade Intelligence">
                        {tradeSummaryText}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => { setTradeSubTab('finder'); setActiveTab('trades'); }, style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Open Trade Finder')
                        )}
                    </GMMessage>
                </div>

                {/* ── TOP KPI CARDS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Your Trades/Season <span title="Average number of trades you make per season. Includes player-for-player swaps, pick trades, and multi-asset deals." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={tKpiNum}>{mp.avgTradesPerSeason}</div>
                        <div style={{ fontSize: '0.72rem', color: mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? goodColor : warnColor, fontFamily: 'Oswald, sans-serif' }}>
                            {mp.avgTradesPerSeason >= lp.avgTradesPerSeason ? '\u25B2' : '\u25BC'} League avg: {lp.avgTradesPerSeason}
                        </div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Avg DHQ Gained <span title="Average net DHQ value gained or lost per trade. Positive = you extract value. Negative = you overpay in trades." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={{ ...tKpiNum, color: valueDeltaColor }}>{(mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif' }}>
                            Winners: +{wp.avgValueGained}
                        </div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Winner Volume <span title="Average number of trades per season made by championship-winning teams in this league." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
                        <div style={tKpiNum}>{wp.avgTradesPerSeason}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>trades per season</div>
                    </div>
                    <div style={tKpiCardStyle}>
                        <div style={tKpiLabel}>Top Positions Bought <span title="The positions that championship teams acquire most frequently via trade — shows what winners prioritize in deals." style={{ fontSize:'0.7rem', opacity:0.5, cursor:'help' }}>?</span></div>
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
                                <div style={{ fontSize: '0.7rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winners</div>
                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarWinner, width: 340, height: 18, gap: 4 })}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#4ECDC4', fontFamily: 'Oswald, sans-serif', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
                                {typeof BarChart !== 'undefined' && React.createElement(BarChart, { items: boughtBarYou, width: 340, height: 18, gap: 4 })}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.7rem' }}>
                                <span style={{ color: 'var(--gold)' }}>{'\u25A0'} Winners</span>
                                <span style={{ color: '#4ECDC4' }}>{'\u25A0'} You</span>
                            </div>
                        </React.Fragment>
                        ) : <div style={{ color: 'var(--silver)', fontSize: '0.85rem', opacity: 0.6 }}>No position data available</div>}
                    </div>

                    {/* Trade Comparison Table */}
                    <div style={aCardStyle}>
                        <div style={aHeaderStyle}>TRADE COMPARISON</div>
                        {/* Header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', fontWeight: 700, color: 'var(--gold)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid rgba(212,175,55,0.2)', fontFamily: 'Oswald, sans-serif' }}>
                            <div>Metric</div><div>Winners</div><div>League</div><div>You</div>
                        </div>
                        {[
                            ['Trades/Season', wp.avgTradesPerSeason, lp.avgTradesPerSeason, mp.avgTradesPerSeason],
                            ['Avg DHQ Gained', (wp.avgValueGained >= 0 ? '+' : '') + wp.avgValueGained, (lp.avgValueGained >= 0 ? '+' : '') + lp.avgValueGained, (mp.avgValueGained >= 0 ? '+' : '') + mp.avgValueGained],
                            ['Top Bought', topPosBought(wp), topPosBought(lp), topPosBought(mp)],
                            ['Partner Pref.', wp.partnerPreference || '\u2014', lp.partnerPreference || '\u2014', mp.partnerPreference || '\u2014'],
                        ].map(([label, wVal, lVal, mVal], i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem' }}>
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
                                        <span style={{ fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif' }}>S{trade.season || '?'} W{trade.week || '?'}</span>
                                        <span style={{ fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '2px 8px', borderRadius: '10px', background: resultColor + '22', color: resultColor, border: '1px solid ' + resultColor + '44', fontWeight: 700 }}>{result}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif' }}>
                                        {(trade.gave || []).join(', ') || 'Unknown'} <span style={{ color: 'var(--gold)', margin: '0 4px' }}>{'\u2192'}</span> {(trade.got || []).join(', ') || 'Unknown'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontFamily: 'Oswald, sans-serif', color: netDhq >= 0 ? goodColor : badColor, fontWeight: 700 }}>
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
                            <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.82rem', fontWeight: 700, color: sevColor(a.sev), marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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

        {/* ═══ PROJECTIONS ═══ */}
        {analyticsTab === 'projections' && (() => {
            const proj = d.projection;
            const win = d.window;
            if (!proj || !proj.length) return <div style={{ color: 'var(--silver)' }}>No projection data available.</div>;
            const maxDHQ = Math.max(...proj.map(p => p.projectedDHQ), 1);
            const tierColor = (tier) => tier === 'Contender' ? goodColor : tier === 'Playoff Team' ? warnColor : badColor;

            // Aging cliff analysis
            const S = _SS;
            const LI = window.App?.LI || {};
            const playerScores = LI.playerScores || {};
            const playerMeta = LI.playerMeta || {};
            const peakWindows = window.App.peakWindows;
            const myRid = S?.myRosterId;
            const myRosterObj = (S?.rosters || []).find(r => r.roster_id === myRid);
            const myPlayers = myRosterObj?.players || [];
            let totalDHQ = 0;
            let atRiskDHQ = 0;
            const atRiskPlayers = [];
            myPlayers.forEach(pid => {
                const dhq = playerScores[pid] || 0;
                const meta = playerMeta[pid] || {};
                totalDHQ += dhq;
                if (!meta.age || !meta.pos) return;
                const peakEnd = (peakWindows[meta.pos] || [23, 29])[1];
                if (meta.age + 2 > peakEnd && dhq >= 2000) {
                    atRiskDHQ += dhq;
                    atRiskPlayers.push({ name: playersData[pid]?.full_name || S?.players?.[pid]?.full_name || meta.name || ('Player ' + pid), age: meta.age, dhq });
                }
            });
            const atRiskPct = totalDHQ > 0 ? Math.round(atRiskDHQ / totalDHQ * 100) : 0;
            atRiskPlayers.sort((a, b) => b.dhq - a.dhq);

            // ── Future Outlook Summary ──
            const projTrend = proj.length >= 2 ? proj[proj.length - 1].projectedDHQ - proj[0].projectedDHQ : 0;
            const currentTier = proj[0]?.tier || 'Unknown';
            const windowYears = win?.years || 0;
            const outlook = projTrend > 500 ? 'building momentum' : projTrend < -500 ? 'in decline' : currentTier === 'Contender' ? 'peaking now' : 'stable but not gaining ground';
            const projStrategy = windowYears >= 3 ? 'maximize now — push all-in for a championship'
                : windowYears >= 1 ? 'begin transition — sell aging assets while competitive'
                : 'commit to rebuild — trade veterans for young talent and picks';

            return (
            <React.Fragment>
                {/* ── FUTURE OUTLOOK SUMMARY ── */}
                <div style={{ marginBottom: '16px' }}>
                    <GMMessage title="Future Outlook">
                        {'Your roster is ' + outlook + '. Competitive window: ' + (windowYears > 0 ? windowYears + ' year' + (windowYears > 1 ? 's' : '') : 'closed') + '. ' + atRiskPct + '% of your DHQ is past peak in 2 years' + (atRiskPlayers.length > 0 ? ' (' + atRiskPlayers.slice(0, 3).map(p => p.name).join(', ') + ')' : '') + '. Strategy: ' + projStrategy + '.'}
                        {React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
                            React.createElement('button', { onClick: () => setActiveTab('trades'), style: { padding: '6px 14px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '6px', fontFamily: 'Bebas Neue', fontSize: '0.84rem', cursor: 'pointer' } }, 'Find Trade Candidates')
                        )}
                    </GMMessage>
                </div>

                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>YOUR 5-YEAR OUTLOOK</div>
                    {proj.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <span style={{ color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', minWidth: '40px', fontSize: '0.9rem' }}>{p.year}</span>
                            <div style={{ flex: 1, position: 'relative', height: '24px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: (p.projectedDHQ / maxDHQ * 100) + '%', background: tierColor(p.tier), borderRadius: '6px', opacity: 0.6, transition: 'width 0.5s ease' }} />
                                <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', fontFamily: 'Oswald, sans-serif', color: 'var(--white)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {p.projectedDHQ.toLocaleString()} DHQ
                                </div>
                            </div>
                            <span style={{ color: tierColor(p.tier), fontFamily: 'Oswald, sans-serif', fontSize: '0.8rem', minWidth: '90px', textAlign: 'right' }}>
                                {p.tier} {p.tier === 'Rebuilding' || p.tier === 'Deep Rebuild' ? '\uD83D\uDD34' : p.tier === 'Playoff Team' ? '\u26A0\uFE0F' : ''}
                            </span>
                        </div>
                    ))}
                </div>

                {win && (
                <div style={{ ...aCardStyle, textAlign: 'center', padding: '24px' }}>
                    <div style={{ fontFamily: 'Bebas Neue, cursive', color: 'var(--silver)', fontSize: '1rem', marginBottom: '4px' }}>COMPETITIVE WINDOW</div>
                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.5rem', color: win.years >= 3 ? goodColor : win.years >= 1 ? warnColor : badColor }}>{win.label}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--silver)', marginTop: '4px' }}>{win.years > 0 ? win.years + ' year' + (win.years > 1 ? 's' : '') + ' remaining' : 'Consider rebuilding'}</div>
                </div>
                )}

                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>AGING CLIFF ALERT</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '10px', lineHeight: 1.5 }}>Players within 2 years of their position's peak-end age with 2000+ DHQ value. These are your highest-risk assets for dynasty value decline.</div>
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.6rem', color: atRiskPct > 30 ? badColor : atRiskPct > 15 ? warnColor : goodColor }}>{atRiskPct}%</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>Your DHQ past peak by {(parseInt(S?.season) || 2026) + 2}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            {(() => {
                                // Compute league-wide avg at-risk %
                                let lgTotal = 0, lgAtRisk = 0;
                                (S?.rosters || []).forEach(r => {
                                    (r.players || []).forEach(pid => {
                                        const d = playerScores[pid] || 0;
                                        const m = playerMeta[pid] || {};
                                        lgTotal += d;
                                        if (m.age && m.pos) {
                                            const pe = (peakWindows[m.pos] || [23,29])[1];
                                            if (m.age + 2 > pe && d >= 2000) lgAtRisk += d;
                                        }
                                    });
                                });
                                const lgPct = lgTotal > 0 ? Math.round(lgAtRisk / lgTotal * 100) : 0;
                                return <>
                                    <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.6rem', color: 'var(--gold)' }}>{lgPct}%</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)' }}>League avg</div>
                                </>;
                            })()}
                        </div>
                    </div>
                    {atRiskPlayers.length > 0 && (
                        <div>
                            <div style={{ color: 'var(--silver)', fontSize: '0.8rem', marginBottom: '6px', fontWeight: 700 }}>Players at risk:</div>
                            {atRiskPlayers.slice(0, 5).map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif' }}>
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

                {/* Actionable recommendations */}
                {((d.gaps || []).length > 0 || atRiskPlayers.length > 0) && (
                <div style={aCardStyle}>
                    <div style={aHeaderStyle}>TO EXTEND YOUR WINDOW</div>
                    {atRiskPlayers.length > 0 && (
                        <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.08)', borderLeft: '3px solid ' + badColor, borderRadius: '0 8px 8px 0' }}>
                            <div style={{ color: badColor, fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', marginBottom: '4px' }}>Priority: Trade aging assets while value remains</div>
                            {atRiskPlayers.slice(0, 2).map((p, i) => (
                                <div key={i} style={{ color: 'var(--silver)', fontSize: '0.82rem', marginTop: '4px' }}>
                                    {'Trade ' + p.name + ' (age ' + p.age + ', ' + p.dhq.toLocaleString() + ' DHQ) — sell window closing soon'}
                                </div>
                            ))}
                        </div>
                    )}
                    {(d.gaps || []).slice(0, 5).map((g, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <span style={{ color: sevColor(g.priority), fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>{i + 1}.</span>
                            <div>
                                <span style={{ fontSize: '1rem', marginRight: '6px' }}>{sevIcon(g.priority)}</span>
                                <span style={{ color: sevColor(g.priority), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Oswald, sans-serif' }}>{g.action}</span>
                                <div style={{ color: 'var(--silver)', fontSize: '0.8rem', marginTop: '2px' }}>{g.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
                )}
            </React.Fragment>
            );
        })()}

        {/* ═══ PLAYOFF HISTORY ═══ */}
        {analyticsTab === 'playoffs' && (() => {
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
                                <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.1rem', color: 'var(--gold)', minWidth: '40px' }}>{season}</span>
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
                                        <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '8px' }}>{season} Playoffs</div>
                                        {brackets.map(b => {
                                            if (!b.data || !b.data.length) return null;
                                            return (
                                                <div key={b.key} style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--silver)', fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{b.label}</div>
                                                    {b.data.map((matchup, mi) => {
                                                        const t1 = matchup.t1 || matchup.team1;
                                                        const t2 = matchup.t2 || matchup.team2;
                                                        const w = matchup.w || matchup.winner;
                                                        const roundLabel = matchup.round === 1 ? 'Championship' : matchup.round === 2 ? 'Semi-finals' : 'Quarter-finals';
                                                        const isMyGame = t1 === myRidP || t2 === myRidP;
                                                        return (
                                                            <div key={mi} style={{
                                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginBottom: '4px',
                                                                background: isMyGame ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                                                                borderLeft: isMyGame ? '3px solid var(--gold)' : '3px solid transparent',
                                                                borderRadius: '4px', fontSize: '0.8rem', fontFamily: 'Oswald, sans-serif',
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
                                            <span style={{ fontFamily: 'Oswald, sans-serif', fontSize: '0.85rem', color: 'var(--white)', fontWeight: 600, flex: 1 }}>{rivalName}</span>
                                            <span style={{ fontSize: '0.78rem', color: r.wins > r.losses ? goodColor : r.wins < r.losses ? badColor : warnColor, fontWeight: 700, fontFamily: 'Oswald' }}>{r.wins}-{r.losses}</span>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>{r.total} meetings</span>
                                        </div>
                                        {r.meetings && r.meetings.length > 0 && (
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                {r.meetings.map((mtg, mi) => (
                                                    <span key={mi} style={{ fontSize: '0.68rem', fontFamily: 'Oswald, sans-serif', padding: '1px 6px', borderRadius: '8px', background: mtg.won ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)', color: mtg.won ? goodColor : badColor, border: '1px solid ' + (mtg.won ? goodColor : badColor) + '33' }}>
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
        })()}

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

            tradeHistory.forEach(trade => {
                const rids = trade.roster_ids || [];
                const names = rids.map(r => getOwnerName(r)).join(' and ');
                const pids = Object.keys(trade.sides || {}).flatMap(rid => (trade.sides[rid]?.players || []));
                const playerNames = pids.slice(0, 3).map(pid => playersData[pid]?.full_name || pid).join(', ');
                const totalVal = pids.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
                if (totalVal < 5000) return; // Only show impactful trades (5000+ DHQ moved)
                events.push({
                    year: trade.season || '?', type: 'trade',
                    title: names + ' swap assets' + (playerNames ? ': ' + playerNames : ''),
                    sub: totalVal > 0 ? totalVal.toLocaleString() + ' DHQ moved' : '',
                    color: '#F0A500', ts: parseInt(trade.season||0)*100 + (trade.week||50)
                });
            });

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
                        {'League dominated by ' + dominantTeam + ' with ' + dominantTitles + ' title' + (dominantTitles > 1 ? 's' : '') + '.' + (repeatWinners.length > 0 ? ' Repeat winners: ' + repeatWinners.join(', ') + '.' : ' No repeat champions yet \u2014 wide-open league.') + ' Your trajectory: ' + myTrajectory + (myChampsTL > 0 ? ' (' + myChampsTL + ' title' + (myChampsTL > 1 ? 's' : '') + ')' : '') + '. Next likely champion candidates: ' + nextChampCandidates + '.'}
                    </GMMessage>
                </div>

                <div style={{ background:'var(--black)', border:'2px solid rgba(212,175,55,0.3)', borderRadius:'12px', padding:'24px' }}>
                    <div style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.3rem', color:'var(--gold)', letterSpacing:'0.08em', marginBottom:'12px' }}>LEAGUE TIMELINE</div>
                    {years.map(year => {
                        const yearEvents = events.filter(e => e.year === year);
                        return (
                            <div key={year} style={{ marginBottom:'24px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px' }}>
                                    <div style={{ width:'14px', height:'14px', background:'var(--gold)', borderRadius:'50%', border:'3px solid var(--black)', flexShrink:0 }} />
                                    <span style={{ fontFamily:'Bebas Neue,cursive', fontSize:'1.2rem', color:'var(--gold)' }}>{year}</span>
                                </div>
                                <div style={{ paddingLeft:'20px', borderLeft:'2px solid rgba(212,175,55,0.2)', marginLeft:'6px' }}>
                                    {yearEvents.map((ev, i) => (
                                        <div key={i} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(212,175,55,0.12)', borderLeft:'3px solid '+ev.color, borderRadius:'6px', padding:'10px 14px', marginBottom:'8px', position:'relative' }}>
                                            <div style={{ position:'absolute', left:'-14px', top:'12px', width:'8px', height:'8px', background:ev.color, borderRadius:'50%', border:'2px solid var(--black)' }} />
                                            <div style={{ fontSize:'0.78rem', color:ev.color, textTransform:'uppercase', fontFamily:'Oswald,sans-serif', letterSpacing:'0.06em', marginBottom:'3px' }}>{ev.type === 'champ' ? 'Championship' : ev.type === 'finals' ? 'Runner-Up' : ev.type === 'personal' ? 'Your Highlight' : 'Trade'}</div>
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
