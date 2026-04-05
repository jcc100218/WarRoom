// ══════════════════════════════════════════════════════════════════
// js/tabs/my-team.js — MyTeamTab: Dynasty roster view with DHQ values,
// PPG stats, age curves, acquisition history, and column customization
// Extracted from league-detail.js. Props: all required state from LeagueDetail.
// ══════════════════════════════════════════════════════════════════

function MyTeamTab({
  // Core data
  myRoster,
  currentLeague,
  playersData,
  statsData,
  stats2025Data,
  standings,
  sleeperUserId,

  // Roster filter / sort / columns
  rosterFilter,
  setRosterFilter,
  rosterSort,
  setRosterSort,
  visibleCols,
  setVisibleCols,
  expandedPid,
  setExpandedPid,
  showColPicker,
  setShowColPicker,
  colPreset,
  setColPreset,

  // View toggle
  myTeamView,
  setMyTeamView,
  compareTeamId,
  setCompareTeamId,

  // GM Strategy
  gmStrategy,
  setGmStrategy,
  gmStrategyOpen,
  setGmStrategyOpen,

  // Alex avatar
  setAlexAvatar,
  setAvatarKey,

  // Navigation / Recon panel
  setActiveTab,
  setReconPanelOpen,
  sendReconMessage,

  // Misc
  timeRecomputeTs,
  setTimeRecomputeTs,
}) {
  const _seasonCtx = React.useContext(window.App.SeasonContext) || {};
  const _sPlayerStats = _seasonCtx.playerStats || window.S?.playerStats || {};
  const _sTradedPicks = _seasonCtx.tradedPicks !== undefined ? _seasonCtx.tradedPicks : (window.S?.tradedPicks || []);

  function calcRawPts(s) { return window.App.calcRawPts(s, currentLeague?.scoring_settings); }

  function getPlayerName(playerId) {
    const player = playersData[playerId];
    if (!player) return `Player ${playerId}`;
    return player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || `Player ${playerId}`;
  }

  // ── filteredAndSortedRows (formerly a sibling function of renderMyTeamTab) ──
  function filteredAndSortedRows(rows) {
    const offPos = new Set(['QB','RB','WR','TE','K']);
    const idpPos = new Set(['DL','LB','DB']);
    let filtered = rows;
    if (rosterFilter === 'Starters') filtered = rows.filter(r => r.isStarter);
    else if (rosterFilter === 'Bench') filtered = rows.filter(r => !r.isStarter && !r.isIR && !r.isTaxi);
    else if (rosterFilter === 'Taxi') filtered = rows.filter(r => r.isTaxi);
    else if (rosterFilter === 'IR') filtered = rows.filter(r => r.isIR);
    else if (rosterFilter === 'Offense') filtered = rows.filter(r => offPos.has(r.pos));
    else if (rosterFilter === 'IDP') filtered = rows.filter(r => idpPos.has(r.pos));

    const posOrder = {QB:0,RB:1,WR:2,TE:3,K:4,DL:5,LB:6,DB:7};
    const groupByPos = rosterFilter === 'Offense' || rosterFilter === 'IDP';
    return [...filtered].sort((a, b) => {
      // When filtering by Offense/IDP, group by position first then sort within
      if (groupByPos && a.pos !== b.pos) return (posOrder[a.pos]||99) - (posOrder[b.pos]||99);
      const {key, dir} = rosterSort;
      if (key === 'dhq') return (b.dhq - a.dhq) * dir;
      if (key === 'age') return ((a.age||99) - (b.age||99)) * dir;
      if (key === 'ppg') return ((b.curPPG||0) - (a.curPPG||0)) * dir;
      if (key === 'prev') return ((b.prevPPG||0) - (a.prevPPG||0)) * dir;
      if (key === 'trend') return ((b.trend||0) - (a.trend||0)) * dir;
      if (key === 'gp') return ((b.curGP||0) - (a.curGP||0)) * dir;
      if (key === 'durability') return ((b.durabilityGP||0) - (a.durabilityGP||0)) * dir;
      if (key === 'name') { const na = getPlayerName(a.pid).toLowerCase(), nb = getPlayerName(b.pid).toLowerCase(); return (na < nb ? -1 : na > nb ? 1 : 0) * dir; }
      if (key === 'pos') return ((posOrder[a.pos]||99) - (posOrder[b.pos]||99)) * dir;
      if (key === 'peak') return ((b.peakYrsLeft||0) - (a.peakYrsLeft||0)) * dir;
      if (key === 'action') { const ord = {BUY:3,HOLD:2,SELL:1}; return ((ord[b.rec]||0) - (ord[a.rec]||0)) * dir; }
      if (key === 'yrsExp') return ((b.p.years_exp||0) - (a.p.years_exp||0)) * dir;
      if (key === 'college') { const ca = (a.p.college||'').toLowerCase(), cb = (b.p.college||'').toLowerCase(); return (ca < cb ? -1 : ca > cb ? 1 : 0) * dir; }
      if (key === 'nflDraft') return (((a.p.draft_round || (a.p.draft_pick ? Math.ceil(a.p.draft_pick/32) : 99)) - (b.p.draft_round || (b.p.draft_pick ? Math.ceil(b.p.draft_pick/32) : 99))) * dir);
      if (key === 'posRankLg') return (a.dhq - b.dhq) * dir; // proxy: higher dhq = better rank
      if (key === 'posRankNfl') return ((a.meta?.fcRank||999) - (b.meta?.fcRank||999)) * dir;
      if (key === 'starterSzn') return ((b.meta?.starterSeasons||0) - (a.meta?.starterSeasons||0)) * dir;
      if (key === 'height') return ((b.p.height||0) - (a.p.height||0)) * dir;
      if (key === 'weight') return ((b.p.weight||0) - (a.p.weight||0)) * dir;
      if (key === 'depthChart') return ((a.p.depth_chart_order||99) - (b.p.depth_chart_order||99)) * dir;
      if (key === 'slot') { const ord = {starter:0,taxi:1,bench:2,ir:3}; return ((ord[a.section]||9) - (ord[b.section]||9)) * dir; }
      if (key === 'acquired') { const aa = getAcquisitionInfo(a.pid, myRoster?.roster_id), ab = getAcquisitionInfo(b.pid, myRoster?.roster_id); return (aa.method < ab.method ? -1 : aa.method > ab.method ? 1 : 0) * dir; }
      if (key === 'acquiredDate') { const aa = getAcquisitionInfo(a.pid, myRoster?.roster_id), ab = getAcquisitionInfo(b.pid, myRoster?.roster_id); return (aa.date < ab.date ? -1 : aa.date > ab.date ? 1 : 0) * dir; }
      if (key === 'sos') {
        const getSosRank = (r) => { const s = window.App?.SOS?.getPlayerSOS?.(r.pid, r.pos, r.p?.team); return s?.avgRank || 16; };
        return (getSosRank(b) - getSosRank(a)) * dir; // higher rank = easier = sort first by default
      }
      return 0;
    });
  }

  if (!myRoster) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--silver)' }}>No roster found</div>;

  const ROSTER_COLUMNS = {
    pos:        { label: 'Position', shortLabel: 'Pos', width: '40px', group: 'core' },
    age:        { label: 'Age', shortLabel: 'Age', width: '38px', group: 'dynasty' },
    dhq:        { label: 'DHQ Dynasty Value', shortLabel: 'DHQ', width: '64px', group: 'dynasty' },
    ppg:        { label: 'Points Per Game', shortLabel: 'PPG', width: '48px', group: 'stats' },
    prev:       { label: 'Previous Season PPG', shortLabel: 'Prev', width: '48px', group: 'stats' },
    trend:      { label: 'Year-over-Year Trend %', shortLabel: 'Trend', width: '50px', group: 'dynasty' },
    peak:       { label: 'Peak Window Phase', shortLabel: 'Peak', width: '50px', group: 'dynasty' },
    action:     { label: 'Trade Recommendation', shortLabel: 'Action', width: '56px', group: 'dynasty' },
    gp:         { label: 'Games Played', shortLabel: 'GP', width: '36px', group: 'stats' },
    durability: { label: 'Durability — games played out of 17 (green=15+, amber=10-14, red=<10)', shortLabel: 'Dur', width: '40px', group: 'stats' },
    yrsExp:     { label: 'Years of Experience', shortLabel: 'Exp', width: '38px', group: 'dynasty' },
    college:    { label: 'College', shortLabel: 'College', width: '90px', group: 'scout' },
    // nflDraft removed — Sleeper doesn't reliably provide draft capital data
    posRankLg:  { label: 'League Position Rank', shortLabel: 'Lg Rank', width: '54px', group: 'dynasty' },
    posRankNfl: { label: 'NFL Position Rank', shortLabel: 'NFL Rank', width: '56px', group: 'dynasty' },
    starterSzn: { label: 'Starter Seasons', shortLabel: 'Str Szn', width: '48px', group: 'dynasty' },
    height:     { label: 'Height', shortLabel: 'Ht', width: '42px', group: 'scout' },
    weight:     { label: 'Weight (lbs)', shortLabel: 'Wt', width: '42px', group: 'scout' },
    depthChart: { label: 'Depth Chart Position', shortLabel: 'Depth', width: '48px', group: 'scout' },
    slot:       { label: 'Roster Slot', shortLabel: 'Slot', width: '40px', group: 'core' },
    acquired:   { label: 'Acquisition Method', shortLabel: 'Acquired', width: '66px', group: 'core' },
    acquiredDate: { label: 'Date Acquired', shortLabel: 'Date', width: '58px', group: 'core' },
    sos:        { label: 'Sched Strength (1=hardest, 32=easiest)', shortLabel: 'SOS', width: '44px', group: 'stats' },
  };

  const COLUMN_PRESETS = {
    dynasty: ['pos','age','dhq','peak','trend','action','acquired'],
    stats:   ['pos','age','dhq','ppg','prev','trend','gp','durability','sos'],
    scout:   ['pos','age','college','slot','height','weight','depthChart','yrsExp'],
    full:    Object.keys(ROSTER_COLUMNS),
  };

  const allPlayers = myRoster.players || [];
  const starters = new Set(myRoster.starters || []);
  const reserve = new Set(myRoster.reserve || []);
  const taxi = new Set(myRoster.taxi || []);

  const normPos = window.App.normPos;

  // Build enriched player rows
  const rows = allPlayers.map(pid => {
    const p = playersData[pid];
    if (!p) return null;
    const pos = normPos(p.position) || p.position || '?';
    const dhq = window.App?.LI?.playerScores?.[pid] || 0;
    const meta = window.App?.LI?.playerMeta?.[pid];
    const st = statsData[pid] || {};
    const prev = stats2025Data?.[pid] || {};

    const curPts = calcRawPts(st) || 0;
    const curGP = st.gp || 0;
    const curPPG = curGP > 0 ? +(curPts / curGP).toFixed(1) : 0;

    const prevPts = calcRawPts(prev) || 0;
    const prevGP = prev.gp || 0;
    const prevPPG = prevGP > 0 ? +(prevPts / prevGP).toFixed(1) : 0;

    // Effective PPG: use current season if available, else fallback to previous season
    const effectivePPG = curPPG > 0 ? curPPG : prevPPG;
    const effectiveGP = curGP > 0 ? curGP : prevGP;
    // 2-year rolling average GP for durability (use meta.recentGP if available for longer history)
    const durabilityGP = meta?.recentGP > 0 ? meta.recentGP : (curGP > 0 && prevGP > 0 ? Math.round((curGP + prevGP) / 2) : effectiveGP);

    const trend = meta?.trend || (prevPPG && curPPG ? Math.round((curPPG - prevPPG) / prevPPG * 100) : 0);

    const age = p.age || (p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000) : null);
    const isStarter = starters.has(pid);
    const isIR = reserve.has(pid);
    const isTaxi = taxi.has(pid);
    const section = isStarter ? 'starter' : isIR ? 'ir' : isTaxi ? 'taxi' : 'bench';

    const peaks = window.App.peakWindows;
    const [pLo, pHi] = peaks[pos] || [24,29];
    const peakRangeHi = Math.max(pHi + 4, age ? age + 1 : pHi + 4);
    const peakPct = age ? Math.max(0, Math.min(100, ((age - (pLo-4)) / (peakRangeHi - (pLo-4))) * 100)) : 50;
    const peakPhase = !age ? '\u2014' : age < pLo ? 'PRE' : age <= pHi ? 'PRIME' : 'POST';
    const peakYrsLeft = age ? Math.max(0, pHi - age) : 0;

    const _pidElite = typeof window.App?.isElitePlayer === 'function' ? window.App.isElitePlayer(pid) : dhq >= 7000;
    // Recommendation for MY roster — shared getPlayerAction() with simplified fallback
    const pa = typeof window.getPlayerAction === 'function' ? window.getPlayerAction(pid) : null;
    const rec = pa ? pa.label : (peakYrsLeft <= 0 ? 'Sell' : _pidElite && peakYrsLeft >= 3 ? 'Hold Core' : peakYrsLeft >= 4 && dhq < 4000 ? 'Stash' : 'Hold');

    return { pid, p, pos, dhq, age, curPPG, prevPPG, effectivePPG, effectiveGP, prevGP, durabilityGP, trend, isStarter, isIR, isTaxi, section, peakPhase, peakPct, peakYrsLeft, rec, curGP, meta, injury: p.injury_status };
  }).filter(Boolean);

  // Position-level PPG percentiles for color coding
  const posPPGs = {};
  rows.forEach(r => {
    if (!posPPGs[r.pos]) posPPGs[r.pos] = [];
    if (r.curPPG > 0) posPPGs[r.pos].push(r.curPPG);
  });
  const posP75 = {}, posP25 = {};
  Object.entries(posPPGs).forEach(([pos, vals]) => {
    vals.sort((a,b) => a-b);
    posP75[pos] = vals[Math.floor(vals.length * 0.75)] || 10;
    posP25[pos] = vals[Math.floor(vals.length * 0.25)] || 5;
  });

  // Cell background helpers (FM-style colored cells)
  const dhqBg = v => v >= 7000 ? 'rgba(46,204,113,0.15)' : v >= 4000 ? 'rgba(52,152,219,0.12)' : v >= 2000 ? 'rgba(255,255,255,0.04)' : 'transparent';
  const dhqCol = v => v >= 7000 ? '#2ECC71' : v >= 4000 ? '#3498DB' : v >= 2000 ? 'var(--silver)' : 'rgba(255,255,255,0.25)';
  const ageBg = a => !a ? 'transparent' : a <= 24 ? 'rgba(46,204,113,0.12)' : a <= 28 ? 'transparent' : a <= 31 ? 'rgba(240,165,0,0.1)' : 'rgba(231,76,60,0.1)';
  const ageCol = a => !a ? 'var(--silver)' : a <= 24 ? '#2ECC71' : a <= 28 ? 'var(--white)' : a <= 31 ? '#F0A500' : '#E74C3C';
  const ppgBg = (v, pos) => v >= (posP75[pos]||10) ? 'rgba(46,204,113,0.12)' : v <= (posP25[pos]||3) ? 'rgba(231,76,60,0.08)' : 'transparent';
  const trendBg = t => t >= 15 ? 'rgba(46,204,113,0.12)' : t <= -15 ? 'rgba(231,76,60,0.1)' : 'transparent';
  const statusCol = s => s === 'starter' ? 'var(--gold)' : s === 'ir' ? '#E74C3C' : s === 'taxi' ? '#3498DB' : 'transparent';
  const posColors = window.App.POS_COLORS;

  const filtered = filteredAndSortedRows(rows);

  // renderCell — renders each data cell with FM-style coloring
  function renderCell(colKey, r) {
    const col = ROSTER_COLUMNS[colKey];
    const base = { width: col.width, minWidth: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.84rem', padding: '0 5px' };

    switch(colKey) {
      case 'pos': return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: (posColors[r.pos]||'#666')+'22', color: posColors[r.pos]||'var(--silver)' }}>{r.pos}</span></div>;
      case 'age': return <div key={colKey} style={{...base, background: ageBg(r.age)}}><span style={{ color: ageCol(r.age), fontWeight: 600 }}>{r.age||'\u2014'}</span></div>;
      case 'dhq': return <div key={colKey} style={{...base, background: dhqBg(r.dhq)}}><span style={{ color: dhqCol(r.dhq), fontWeight: 700, fontFamily: 'Inter, sans-serif', fontSize: '0.82rem' }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span></div>;
      case 'ppg': return <div key={colKey} style={{...base, background: ppgBg(r.effectivePPG, r.pos)}}><span style={{ color: r.effectivePPG >= (posP75[r.pos]||10) ? '#2ECC71' : 'var(--silver)' }}>{r.effectivePPG > 0 ? r.effectivePPG : '\u2014'}{r.curPPG === 0 && r.prevPPG > 0 ? '*' : ''}</span></div>;
      case 'prev': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', opacity: 0.6 }}>{r.prevPPG > 0 ? r.prevPPG : '\u2014'}</span></div>;
      case 'trend': {
        const trendBars = (() => {
          const t = r.trend || 0;
          const up = t > 0;
          const color = t >= 15 ? '#2ECC71' : t <= -15 ? '#E74C3C' : 'var(--silver)';
          const heights = up ? [4, 6, 8, 11, 14] : t < 0 ? [14, 11, 8, 6, 4] : [8, 9, 10, 9, 8];
          return React.createElement('div', { className: 'wr-spark' }, ...heights.map((h, i) => React.createElement('div', { key: i, className: 'wr-spark-bar', style: { height: h + 'px', background: color } })));
        })();
        return <div key={colKey} style={{...base, background: trendBg(r.trend), flexDirection: 'column', gap: '1px'}}>
          <span style={{ color: r.trend>=15?'#2ECC71':r.trend<=-15?'#E74C3C':'var(--silver)', fontWeight: 600, fontSize: '0.74rem' }}>{r.trend>0?'+'+r.trend+'%':r.trend<0?r.trend+'%':'\u2014'}</span>
          {trendBars}
        </div>;
      }
      case 'peak': return <div key={colKey} style={{...base, flexDirection: 'column', gap: '1px'}}>
        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: r.peakPhase==='PRIME'?'#2ECC71':r.peakPhase==='PRE'?'#3498DB':'#E74C3C' }}>{r.peakPhase}</span>
        <div style={{ width: '30px', height: '3px', borderRadius: '1px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position:'absolute',left:0,top:0,height:'100%',width:'30%',background:'rgba(52,152,219,0.4)' }}></div>
          <div style={{ position:'absolute',left:'30%',top:0,height:'100%',width:'40%',background:'rgba(46,204,113,0.4)' }}></div>
          <div style={{ position:'absolute',left:'70%',top:0,height:'100%',width:'30%',background:'rgba(231,76,60,0.3)' }}></div>
          <div style={{ position:'absolute',left:r.peakPct+'%',top:'-1px',width:'2px',height:'5px',background:'var(--white)',borderRadius:'1px' }}></div>
        </div>
      </div>;
      case 'action': {
        const ann = getPlayerAnnotation(r.pid);
        return <div key={colKey} style={{...base, flexDirection:'column', gap:'2px', alignItems:'center'}} title={ann?.text || ''}>
          <span style={{ fontSize:'0.74rem',fontWeight:700,padding:'3px 8px',borderRadius:'4px',background:/sell/i.test(r.rec)?'rgba(231,76,60,0.15)':/buy|build|core/i.test(r.rec)?'rgba(46,204,113,0.18)':'rgba(212,175,55,0.15)',color:/sell/i.test(r.rec)?'#E74C3C':/buy|build|core/i.test(r.rec)?'#2ECC71':'var(--gold)',border:'1px solid '+(/sell/i.test(r.rec)?'rgba(231,76,60,0.3)':/buy|build|core/i.test(r.rec)?'rgba(46,204,113,0.3)':'rgba(212,175,55,0.3)') }}>{r.rec}</span>
        </div>;
      }
      case 'gp': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.74rem' }}>{r.effectiveGP > 0 ? r.effectiveGP : '\u2014'}{r.curGP === 0 && r.prevGP > 0 ? '*' : ''}</span></div>;
      case 'durability': { const gpForDur = r.durabilityGP || 0; return <div key={colKey} style={{...base}} title={'Avg GP: ' + gpForDur + '/17'}><div style={{ width:'24px',height:'4px',borderRadius:'2px',background:'rgba(255,255,255,0.06)',overflow:'hidden' }}><div style={{ width:Math.min(100,(gpForDur/17)*100)+'%',height:'100%',background:gpForDur>=15?'#2ECC71':gpForDur>=10?'#F0A500':'#E74C3C',borderRadius:'2px' }}></div></div></div>; }
      case 'yrsExp': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)' }}>{r.p.years_exp ?? '\u2014'}</span></div>;
      case 'college': return <div key={colKey} style={{...base, justifyContent: 'flex-start'}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.p.college || '\u2014'}</span></div>;
      case 'nflDraft': { const dr = r.p.draft_round; const dp = r.p.draft_pick; const dy = r.p.draft_year; const dRound = dr || (dp ? Math.ceil(dp / 32) : null); const draftLabel = dRound ? (dy ? "'" + String(dy).slice(2) + ' ' : '') + 'Rd ' + dRound + (dp ? '.' + ((dp - 1) % 32 + 1) : '') : (r.p.undrafted === true || (r.p.years_exp > 0 && !dp && !dr) ? 'UDFA' : '\u2014'); return <div key={colKey} style={{...base}}><span style={{ color: dRound ? 'var(--silver)' : 'rgba(255,255,255,0.3)', fontSize: '0.74rem' }}>{draftLabel}</span></div>; }
      case 'posRankLg': {
        const allAtPos = (currentLeague.rosters||[]).flatMap(ros => (ros.players||[]).filter(pid => {
          const pp = playersData[pid];
          return pp && (normPos(pp.position) === r.pos);
        })).map(pid => ({pid, dhq: window.App?.LI?.playerScores?.[pid] || 0})).sort((a,b) => b.dhq - a.dhq);
        const rank = allAtPos.findIndex(x => x.pid === r.pid) + 1;
        return <div key={colKey} style={{...base}}><span style={{ color: rank<=3?'#2ECC71':rank<=8?'var(--gold)':'var(--silver)', fontWeight: rank<=3?700:400 }}>{rank > 0 ? '#'+rank : '\u2014'}</span></div>;
      }
      case 'posRankNfl': {
        const meta = r.meta;
        return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)' }}>{meta?.fcRank ? '#'+meta.fcRank : '\u2014'}</span></div>;
      }
      case 'starterSzn': return <div key={colKey} style={{...base}}><span style={{ color: (r.meta?.starterSeasons||0)>=3?'#2ECC71':(r.meta?.starterSeasons||0)>=1?'var(--gold)':'var(--silver)', fontWeight: 600 }}>{r.meta?.starterSeasons ?? '\u2014'}</span></div>;
      case 'height': {
        const h = r.p.height;
        return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem' }}>{h ? Math.floor(h/12)+"'"+h%12+'"' : '\u2014'}</span></div>;
      }
      case 'weight': return <div key={colKey} style={{...base}}><span style={{ color: 'var(--silver)', fontSize: '0.72rem' }}>{r.p.weight || '\u2014'}</span></div>;
      case 'depthChart': return <div key={colKey} style={{...base}}><span style={{ color: r.p.depth_chart_order != null ? 'var(--silver)' : 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{r.p.depth_chart_order != null ? r.pos + (r.p.depth_chart_order + 1) : (r.section === 'ir' ? 'IR' : (!r.p.team || r.p.team === 'FA') ? 'FA' : 'N/A')}</span></div>;
      case 'slot': return <div key={colKey} style={{...base}}><span style={{ fontSize:'0.76rem',color:'var(--silver)',opacity:0.65,textTransform:'uppercase' }}>{r.section==='starter'?'STR':r.section==='ir'?'IR':r.section==='taxi'?'TAX':'BN'}</span></div>;
      case 'acquired': {
        const acq = getAcquisitionInfo(r.pid, myRoster?.roster_id);
        const col = acq.method === 'Drafted' ? '#a78bfa' : acq.method === 'Traded' ? '#F0A500' : acq.method === 'Waiver' ? '#2ECC71' : acq.method === 'FA' ? '#1ABC9C' : 'var(--silver)';
        return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', fontWeight: 600, color: col }}>{acq.method}{acq.cost ? ' ' + acq.cost : ''}</span></div>;
      }
      case 'acquiredDate': {
        const acq = getAcquisitionInfo(r.pid, myRoster?.roster_id);
        return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.6 }}>{acq.date}</span></div>;
      }
      case 'sos': {
        const sosMod = window.App?.SOS;
        if (!sosMod?.ready) return <div key={colKey} style={{...base}}><span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.72rem' }}>\u2014</span></div>;
        const team = r.p?.team;
        if (!team) return <div key={colKey} style={{...base}}><span style={{ color: 'rgba(255,255,255,0.2)' }}>\u2014</span></div>;
        const sos = sosMod.getPlayerSOS(r.pid, r.pos, team);
        if (!sos) return <div key={colKey} style={{...base}}><span style={{ color: 'rgba(255,255,255,0.2)' }}>\u2014</span></div>;
        const sosBg = sos.avgRank >= 25 ? 'rgba(46,204,113,0.12)' : sos.avgRank <= 8 ? 'rgba(231,76,60,0.1)' : 'transparent';
        return <div key={colKey} style={{...base, background: sosBg, flexDirection: 'column', gap: '1px'}} title={sos.label + ' schedule (' + sos.avgRank + '/32)'}>
          <span style={{ color: sos.color, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>{sos.avgRank}</span>
          <span style={{ color: sos.color, fontSize: '0.58rem', opacity: 0.8 }}>{sos.label.toUpperCase()}</span>
        </div>;
      }
      default: return <div key={colKey} style={{...base}}>{'\u2014'}</div>;
    }
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '12px' }}>
        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.05em' }}>MY TEAM</span>
        {(() => {
          const champs = window.App?.LI?.championships || {};
          const myChampCount = Object.values(champs).filter(c => c.champion === myRoster?.roster_id).length;
          if (myChampCount > 0) return <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700 }}>{myChampCount > 1 ? myChampCount + 'x ' : ''}Champion</span>;
          return null;
        })()}
        <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>{allPlayers.length} players</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--silver)' }}>Total DHQ: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{rows.reduce((s,r) => s+r.dhq, 0).toLocaleString()}</span></span>
      </div>

      {/* Alex Ingram GM Diagnosis + KPIs */}
      {(() => {
        const assess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
        const tier = (assess?.tier || '').toUpperCase();
        const needs = assess?.needs?.slice(0, 3) || [];
        const elites = typeof window.App?.countElitePlayers === 'function' ? window.App.countElitePlayers(rows.map(r => r.pid)) : rows.filter(r => r.dhq >= 7000).length;

        // Compute KPI ranks
        const leagueSize = (currentLeague.rosters || []).length;
        const rp2 = currentLeague?.roster_positions || [];
        const ppgRanks = (currentLeague.rosters || []).map(r => {
          const ppg = typeof window.App?.calcOptimalPPG === 'function'
            ? window.App.calcOptimalPPG(r.players || [], playersData, _sPlayerStats, rp2) : 0;
          return { rid: r.roster_id, ppg };
        }).sort((a, b) => b.ppg - a.ppg);
        if (ppgRanks.every(r => r.ppg === 0)) {
          ppgRanks.forEach(r => { const ros = (currentLeague.rosters || []).find(x => x.roster_id === r.rid); r.ppg = Math.round((ros?.players || []).reduce((s, pid) => s + ((window.App?.LI?.playerScores || {})[pid] || 0), 0) / 550); });
          ppgRanks.sort((a, b) => b.ppg - a.ppg);
        }
        const contenderRank = ppgRanks.findIndex(r => r.rid === myRoster?.roster_id) + 1;
        const totalTeams = leagueSize || 12;

        const dVals = (currentLeague.rosters || []).map(r => {
          const pDHQ = (r.players || []).reduce((s, pid) => s + ((window.App?.LI?.playerScores || {})[pid] || 0), 0);
          let pickDHQ = 0;
          {
            const draftRounds = currentLeague.settings?.draft_rounds || 5;
            const leagueSeason = parseInt(currentLeague.season) || new Date().getFullYear();
            for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) for (let rd = 1; rd <= draftRounds; rd++) {
              const pv = typeof getIndustryPickValue === 'function' ? getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams) : window.App.PlayerValue?.getPickValue?.(yr, rd, totalTeams) ?? 0;
              const ta = (_sTradedPicks).find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === r.roster_id && p.owner_id !== r.roster_id);
              if (!ta) pickDHQ += pv;
              (_sTradedPicks).filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === r.roster_id && p.roster_id !== r.roster_id).forEach(() => { pickDHQ += pv; });
            }
          }
          return { rid: r.roster_id, total: pDHQ + pickDHQ };
        }).sort((a, b) => b.total - a.total);
        const dynastyRank = dVals.findIndex(r => r.rid === myRoster?.roster_id) + 1;

        // Compete window
        const avgPeak = rows.filter(r => r.isStarter && r.peakYrsLeft > 0).reduce((s, r) => s + r.peakYrsLeft, 0) / (rows.filter(r => r.isStarter && r.peakYrsLeft > 0).length || 1);
        const competeWindow = Math.round(avgPeak);

        // Pick capital
        const pickCapital = (() => {
          let val = 0;
          const draftRounds = currentLeague.settings?.draft_rounds || 5;
          const leagueSeason = parseInt(currentLeague.season) || new Date().getFullYear();
          for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) for (let rd = 1; rd <= draftRounds; rd++) {
            const pv = typeof getIndustryPickValue === 'function' ? getIndustryPickValue(rd, Math.ceil(totalTeams / 2), totalTeams) : window.App.PlayerValue?.getPickValue?.(yr, rd, totalTeams) ?? 0;
            const ta = (_sTradedPicks).find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster?.roster_id && p.owner_id !== myRoster?.roster_id);
            if (!ta) val += pv;
            (_sTradedPicks).filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster?.roster_id && p.roster_id !== myRoster?.roster_id).forEach(() => { val += pv; });
          }
          return val;
        })();

        return <div style={{ marginBottom: '12px' }}>
          <GMMessage compact>
            {tier === 'REBUILDING' ? 'Rebuilding phase.' : tier === 'CONTENDER' || tier === 'ELITE' ? 'Legitimate contender.' : 'At a crossroads.'}
            {needs.length ? ' Weakest at ' + needs.slice(0, 2).map(n => n.pos).join(' and ') + '.' : ''}
            {needs.length ? ' Priority: ' + needs.slice(0, 2).map(n => (n.urgency === 'deficit' ? 'find ' : 'add ') + n.pos + (n.urgency === 'deficit' ? ' via trade or waivers' : ' depth')).join('; ') + '.' : ''}
            {elites < 2 ? ' Need more elite assets (top 5 at position).' : ''}
          </GMMessage>

          {/* 4 KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
            {[
              { label: 'CONTENDER', value: '#' + contenderRank + '/' + totalTeams, color: contenderRank <= 3 ? '#2ECC71' : contenderRank <= 8 ? 'var(--gold)' : '#E74C3C' },
              { label: 'DYNASTY', value: '#' + dynastyRank + '/' + totalTeams, color: dynastyRank <= 3 ? '#2ECC71' : dynastyRank <= 8 ? 'var(--gold)' : '#E74C3C' },
              { label: 'WINDOW', value: competeWindow > 0 ? competeWindow + 'yr' : 'Now', color: competeWindow >= 3 ? '#2ECC71' : competeWindow >= 1 ? 'var(--gold)' : '#E74C3C' },
              { label: 'PICK CAPITAL', value: Math.round(pickCapital / 1000) + 'K', color: pickCapital >= 20000 ? '#2ECC71' : pickCapital >= 10000 ? 'var(--gold)' : '#E74C3C' },
            ].map((kpi, i) => <div key={i} style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: '0.64rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            </div>)}
          </div>
        </div>;
      })()}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        <button onClick={() => setMyTeamView('roster')} style={{
          padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
          background: myTeamView === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
          color: myTeamView === 'roster' ? 'var(--black)' : 'var(--silver)',
          border: '1px solid ' + (myTeamView === 'roster' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
          borderRadius: '6px', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em'
        }}>Roster</button>
        <button onClick={() => setMyTeamView('compare')} style={{
          padding: '5px 14px', fontSize: '0.76rem', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
          background: myTeamView === 'compare' ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
          color: myTeamView === 'compare' ? 'var(--black)' : 'var(--silver)',
          border: '1px solid ' + (myTeamView === 'compare' ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
          borderRadius: '6px', cursor: 'pointer', fontWeight: 700, letterSpacing: '0.04em'
        }}>Compare</button>
      </div>

      {myTeamView === 'compare' && (
        <div>
          <select value={compareTeamId || ''} onChange={e => setCompareTeamId(parseInt(e.target.value) || null)} style={{
            padding: '6px 12px', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif',
            background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.3)',
            borderRadius: '6px', color: 'var(--white)', marginBottom: '16px', width: '100%', maxWidth: '300px'
          }}>
            <option value="">Select team to compare...</option>
            {standings.filter(t => t.userId !== sleeperUserId).map(t => (
              <option key={t.rosterId} value={t.rosterId}>{t.displayName} ({t.wins}-{t.losses})</option>
            ))}
          </select>
          {compareTeamId && (() => {
            const theirRoster = currentLeague.rosters.find(r => r.roster_id === compareTeamId);
            if (!theirRoster) return null;
            const theirUser = currentLeague.users?.find(u => u.user_id === theirRoster.owner_id);
            const myPlayers = (myRoster.players || []);
            const theirPlayers = (theirRoster.players || []);
            const myTotal = myPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
            const theirTotal = theirPlayers.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
            // Head-to-head from matchups (current season)
            const myWins = myRoster.settings?.wins || 0;
            const myLosses = myRoster.settings?.losses || 0;
            const theirWins = theirRoster.settings?.wins || 0;
            const theirLosses = theirRoster.settings?.losses || 0;

            // Championships
            const champs = window.App?.LI?.championships || {};
            const myChamps = Object.values(champs).filter(c => c.champion === myRoster.roster_id).length;
            const theirChamps = Object.values(champs).filter(c => c.champion === compareTeamId).length;

            // Playoff records
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

            // Head-to-head in playoffs
            let h2hWins = 0, h2hLosses = 0;
            Object.values(brackets).forEach(({ winners }) => {
                (winners || []).forEach(m => {
                    if ((m.t1 === myRoster.roster_id && m.t2 === compareTeamId) || (m.t2 === myRoster.roster_id && m.t1 === compareTeamId)) {
                        if (m.w === myRoster.roster_id) h2hWins++;
                        else if (m.w === compareTeamId) h2hLosses++;
                    }
                });
            });

            return (
              <div>
                {/* Matchup header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', marginBottom: '16px', alignItems: 'start' }}>
                  {/* You */}
                  <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: '6px' }}>You</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', marginBottom: '4px' }}>{myWins}-{myLosses}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.4 }}>
                      {myTotal.toLocaleString()} DHQ<br/>
                      Playoffs: {myPW}-{myPL}<br/>
                      {myChamps > 0 ? myChamps + 'x Champion' : 'No titles'}
                    </div>
                  </div>
                  {/* VS + H2H */}
                  <div style={{ textAlign: 'center', paddingTop: '10px' }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '6px' }}>VS</div>
                    {(h2hWins > 0 || h2hLosses > 0) ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--silver)' }}>
                        <div style={{ fontWeight: 700, color: h2hWins > h2hLosses ? '#2ECC71' : h2hWins < h2hLosses ? '#E74C3C' : 'var(--silver)' }}>H2H: {h2hWins}-{h2hLosses}</div>
                        <div style={{ opacity: 0.65, marginTop: '2px' }}>in playoffs</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.6 }}>No playoff H2H</div>
                    )}
                  </div>
                  {/* Them */}
                  <div style={{ textAlign: 'center', padding: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--silver)', textTransform: 'uppercase', marginBottom: '6px' }}>{theirUser?.display_name || 'Opponent'}</div>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', marginBottom: '4px' }}>{theirWins}-{theirLosses}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.4 }}>
                      {theirTotal.toLocaleString()} DHQ<br/>
                      Playoffs: {theirPW}-{theirPL}<br/>
                      {theirChamps > 0 ? theirChamps + 'x Champion' : 'No titles'}
                    </div>
                  </div>
                </div>
                {/* Full roster comparison by position */}
                <div style={{ marginTop: '16px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Full Roster by Position</div>
                    {['QB','RB','WR','TE','K','DL','LB','DB'].map(pos => {
                        const myAtPos = myPlayers.filter(pid => normPos(playersData[pid]?.position) === pos)
                            .map(pid => ({ pid, p: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                            .sort((a,b) => b.dhq - a.dhq);
                        const theirAtPos = theirPlayers.filter(pid => normPos(playersData[pid]?.position) === pos)
                            .map(pid => ({ pid, p: playersData[pid], dhq: window.App?.LI?.playerScores?.[pid] || 0 }))
                            .sort((a,b) => b.dhq - a.dhq);
                        if (!myAtPos.length && !theirAtPos.length) return null;
                        const maxLen = Math.max(myAtPos.length, theirAtPos.length);

                        const myPosDHQ = myAtPos.reduce((s, x) => s + x.dhq, 0);
                        const theirPosDHQ = theirAtPos.reduce((s, x) => s + x.dhq, 0);
                        const posDiff = myPosDHQ - theirPosDHQ;
                        return (
                            <div key={pos} style={{ marginBottom: '12px', background: 'var(--black)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
                                <div style={{ padding: '6px 10px', background: (posColors[pos] || '#666') + '15', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</span>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem' }}>
                                        <span style={{ color: myPosDHQ >= theirPosDHQ ? '#2ECC71' : 'var(--silver)' }}>You: {myPosDHQ.toLocaleString()}</span>
                                        <span style={{ color: theirPosDHQ >= myPosDHQ ? '#2ECC71' : 'var(--silver)' }}>Them: {theirPosDHQ.toLocaleString()}</span>
                                        <span style={{ fontWeight: 700, color: posDiff > 0 ? '#2ECC71' : posDiff < 0 ? '#E74C3C' : 'var(--silver)' }}>{posDiff > 0 ? '+' : ''}{posDiff.toLocaleString()}</span>
                                    </div>
                                </div>
                                {Array.from({ length: maxLen }).map((_, i) => {
                                    const my = myAtPos[i];
                                    const their = theirAtPos[i];
                                    return (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            {/* My player */}
                                            <div style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', borderRight: '1px solid rgba(255,255,255,0.04)', background: my && their && my.dhq > their.dhq ? 'rgba(46,204,113,0.04)' : 'transparent', cursor: my ? 'pointer' : 'default' }}
                                                onClick={() => { if (my && window._wrSelectPlayer) window._wrSelectPlayer(my.pid); }}>
                                                {my ? (<>
                                                    <div style={{ width: '18px', height: '18px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+my.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'18px',height:'18px',borderRadius:'50%',objectFit:'cover' }} /></div>
                                                    <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'var(--white)', cursor: 'pointer' }}>{my.p?.full_name || '?'}</span>
                                                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.76rem', color: my.dhq >= 7000 ? '#2ECC71' : my.dhq >= 4000 ? '#3498DB' : 'var(--silver)' }}>{my.dhq > 0 ? my.dhq.toLocaleString() : '\u2014'}</span>
                                                </>) : <span style={{ color: 'var(--silver)', opacity: 0.3, fontSize: '0.72rem' }}>{'\u2014'}</span>}
                                            </div>
                                            {/* Their player */}
                                            <div style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', background: their && my && their.dhq > my.dhq ? 'rgba(46,204,113,0.04)' : 'transparent', cursor: their ? 'pointer' : 'default' }}
                                                onClick={() => { if (their && window._wrSelectPlayer) window._wrSelectPlayer(their.pid); }}>
                                                {their ? (<>
                                                    <div style={{ width: '18px', height: '18px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+their.pid+'.jpg'} onError={e=>e.target.style.display='none'} style={{ width:'18px',height:'18px',borderRadius:'50%',objectFit:'cover' }} /></div>
                                                    <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: 'var(--white)', cursor: 'pointer' }}>{their.p?.full_name || '?'}</span>
                                                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.76rem', color: their.dhq >= 7000 ? '#2ECC71' : their.dhq >= 4000 ? '#3498DB' : 'var(--silver)' }}>{their.dhq > 0 ? their.dhq.toLocaleString() : '\u2014'}</span>
                                                </>) : <span style={{ color: 'var(--silver)', opacity: 0.3, fontSize: '0.72rem' }}>{'\u2014'}</span>}
                                            </div>
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
      )}

      {/* ── GM STRATEGY PANEL ── */}
      <div style={{ marginBottom: '14px' }}>
        <button onClick={() => setGmStrategyOpen(!gmStrategyOpen)} style={{
          width: '100%', padding: '10px 14px', background: gmStrategyOpen ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
          border: '1px solid ' + (gmStrategyOpen ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'),
          borderRadius: gmStrategyOpen ? '10px 10px 0 0' : '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.15s'
        }}>
          <AlexAvatar size={28} />
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', color: 'var(--gold)', letterSpacing: '0.04em' }}>GM STRATEGY</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6 }}>
              {gmStrategy.mode === 'contend' ? 'Win Now' : gmStrategy.mode === 'rebuild' ? 'Rebuilding' : 'Balanced'} · {gmStrategy.riskTolerance} risk
              {gmStrategy.untouchable?.length > 0 ? ' · ' + gmStrategy.untouchable.length + ' untouchable' : ''}
            </div>
          </div>
          <span style={{ color: 'var(--gold)', fontSize: '0.8rem' }}>{gmStrategyOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {gmStrategyOpen && (
          <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.2)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px' }}>
            {/* Mode */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Team Mode</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{id:'contend',label:'Win Now',desc:'Maximize this season'},{id:'balanced',label:'Balanced',desc:'Compete + build'},{id:'rebuild',label:'Rebuild',desc:'Accumulate youth & picks'}].map(m => (
                  <button key={m.id} onClick={() => setGmStrategy(prev => ({...prev, mode: m.id}))} style={{
                    flex: 1, padding: '10px 8px', background: gmStrategy.mode === m.id ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                    color: gmStrategy.mode === m.id ? 'var(--black)' : 'var(--silver)',
                    border: '1px solid ' + (gmStrategy.mode === m.id ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
                    borderRadius: '8px', cursor: 'pointer', textAlign: 'center'
                  }}>
                    <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', letterSpacing: '0.03em' }}>{m.label}</div>
                    <div style={{ fontSize: '0.66rem', opacity: 0.6, marginTop: '2px' }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {/* Risk Tolerance */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Risk Tolerance</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['conservative','moderate','aggressive'].map(r => (
                  <button key={r} onClick={() => setGmStrategy(prev => ({...prev, riskTolerance: r}))} style={{
                    flex: 1, padding: '8px', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', textTransform: 'capitalize',
                    background: gmStrategy.riskTolerance === r ? (r==='aggressive'?'#E74C3C':r==='conservative'?'#3498DB':'var(--gold)') : 'rgba(255,255,255,0.04)',
                    color: gmStrategy.riskTolerance === r ? (r==='aggressive'||r==='conservative'?'#fff':'var(--black)') : 'var(--silver)',
                    border: '1px solid ' + (gmStrategy.riskTolerance === r ? 'transparent' : 'rgba(255,255,255,0.08)'),
                    borderRadius: '6px', cursor: 'pointer'
                  }}>{r}</button>
                ))}
              </div>
            </div>
            {/* Positional Priorities */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Positional Priorities <span style={{ fontSize: '0.66rem', color: 'var(--silver)', opacity: 0.5, textTransform: 'none' }}>— click to increase priority</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {['QB','RB','WR','TE','DL','LB','DB','K'].map(pos => {
                  const val = gmStrategy.positionalNeeds?.[pos] || 5;
                  const posColors = window.App.POS_COLORS;
                  return (
                    <button key={pos} onClick={() => setGmStrategy(prev => ({...prev, positionalNeeds: {...prev.positionalNeeds, [pos]: val >= 10 ? 1 : val + 1}}))} style={{
                      padding: '8px 4px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + (posColors[pos] || '#666') + (val >= 7 ? '55' : '22'),
                      borderRadius: '6px', cursor: 'pointer', textAlign: 'center'
                    }}>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', fontWeight: 700, color: posColors[pos] || 'var(--silver)' }}>{pos}</div>
                      <div style={{ display: 'flex', gap: '1px', justifyContent: 'center', marginTop: '3px' }}>
                        {Array.from({length: 10}).map((_, i) => (
                          <div key={i} style={{ width: '4px', height: '8px', borderRadius: '1px', background: i < val ? (posColors[pos] || '#666') : 'rgba(255,255,255,0.08)' }} />
                        ))}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.5, marginTop: '2px' }}>{val >= 8 ? 'Critical' : val >= 5 ? 'Moderate' : 'Low'}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Untouchable Players */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Untouchable Players</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {(gmStrategy.untouchable || []).map(pid => {
                  const p = playersData[pid];
                  return (
                    <span key={pid} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '14px', fontSize: '0.74rem', color: 'var(--gold)' }}>
                      {p?.full_name || pid}
                      <span onClick={() => setGmStrategy(prev => ({...prev, untouchable: prev.untouchable.filter(id => id !== pid)}))} style={{ cursor: 'pointer', color: '#E74C3C', fontWeight: 700 }}>&times;</span>
                    </span>
                  );
                })}
                {(gmStrategy.untouchable || []).length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.4 }}>No untouchable players set</span>}
              </div>
              <select onChange={e => { const pid = e.target.value; if (pid && !(gmStrategy.untouchable || []).includes(pid)) setGmStrategy(prev => ({...prev, untouchable: [...(prev.untouchable || []), pid]})); e.target.value = ''; }} style={{
                width: '100%', padding: '6px 10px', fontSize: '0.76rem', fontFamily: 'Inter, sans-serif',
                background: 'var(--charcoal)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'var(--white)'
              }}>
                <option value="">+ Add untouchable player...</option>
                {(myRoster?.players || []).filter(pid => !(gmStrategy.untouchable || []).includes(pid)).sort((a,b) => (window.App?.LI?.playerScores?.[b] || 0) - (window.App?.LI?.playerScores?.[a] || 0)).map(pid => {
                  const p = playersData[pid];
                  return <option key={pid} value={pid}>{p?.full_name || pid} ({(window.App?.LI?.playerScores?.[pid] || 0).toLocaleString()} DHQ)</option>;
                })}
              </select>
            </div>
            {/* Trade Targets (positions) */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Target Positions in Trades</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['QB','RB','WR','TE','DL','LB','DB','Picks'].map(t => {
                  const active = (gmStrategy.targets || []).includes(t);
                  return <button key={t} onClick={() => setGmStrategy(prev => ({...prev, targets: active ? (prev.targets || []).filter(x => x !== t) : [...(prev.targets || []), t]}))} style={{
                    padding: '5px 12px', fontSize: '0.74rem', fontFamily: 'Inter, sans-serif',
                    background: active ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)',
                    color: active ? '#2ECC71' : 'var(--silver)',
                    border: '1px solid ' + (active ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.08)'),
                    borderRadius: '14px', cursor: 'pointer'
                  }}>{t}{active ? ' \u2713' : ''}</button>;
                })}
              </div>
            </div>
            {/* Strategy Notes */}
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Strategy Notes</div>
              <textarea value={gmStrategy.notes || ''} onChange={e => setGmStrategy(prev => ({...prev, notes: e.target.value}))} placeholder="Add your personal strategy notes... (e.g., 'Looking to move RB depth for a WR1 before the trade deadline')" style={{
                width: '100%', minHeight: '60px', padding: '8px 10px', fontSize: '0.78rem',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px', color: 'var(--silver)', fontFamily: 'Inter, sans-serif', resize: 'vertical', lineHeight: 1.5
              }} />
            </div>
            {/* Alex Ingram Avatar Picker */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Customize Alex Ingram</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ALEX_AVATARS.map(av => (
                  <button key={av.id} onClick={() => { setAlexAvatar(av.id); setAvatarKey(k => k+1); }} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    padding: '8px', background: getAlexAvatar() === av.id ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                    border: '2px solid ' + (getAlexAvatar() === av.id ? 'var(--gold)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: '10px', cursor: 'pointer', minWidth: '68px', transition: 'all 0.15s'
                  }}>
                    {av.src ? (
                      <img src={av.src} alt={av.label} style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4AF37, #B8941E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 800, color: '#0A0A0A', fontFamily: 'Rajdhani, sans-serif' }}>AI</div>
                    )}
                    <span style={{ fontSize: '0.62rem', color: getAlexAvatar() === av.id ? 'var(--gold)' : 'var(--silver)', textAlign: 'center', lineHeight: 1.2 }}>{av.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {myTeamView === 'roster' && (<div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {['All','Starters','Bench','Taxi','IR','Offense','IDP'].map(f => (
          <button key={f} onClick={() => setRosterFilter(f)} style={{
            padding: '4px 10px', fontSize: '0.72rem', fontWeight: rosterFilter === f ? 700 : 400,
            fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.03em',
            background: rosterFilter === f ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
            color: rosterFilter === f ? 'var(--black)' : 'var(--silver)',
            border: '1px solid ' + (rosterFilter === f ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
            borderRadius: '3px', cursor: 'pointer'
          }}>{f}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65 }}>{filtered.length} shown</span>
      </div>

      {/* Roster status legend */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '6px', fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.7 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '3px', height: '12px', borderRadius: '1px', background: 'var(--gold)' }}></span> Starter</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '3px', height: '12px', borderRadius: '1px', background: '#3498DB' }}></span> Taxi</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '3px', height: '12px', borderRadius: '1px', background: '#E74C3C' }}></span> IR</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '3px', height: '12px', borderRadius: '1px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }}></span> Bench</span>
      </div>

      {/* Preset buttons + column picker */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.65, fontFamily: 'Inter, sans-serif' }}>VIEW:</span>
        {Object.entries(COLUMN_PRESETS).map(([key, cols]) => (
          <button key={key} onClick={() => { setVisibleCols(cols); setColPreset(key); }}
            style={{
              padding: '3px 10px', fontSize: '0.7rem', fontWeight: colPreset === key ? 700 : 400,
              fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
              background: colPreset === key ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
              color: colPreset === key ? 'var(--black)' : 'var(--silver)',
              border: '1px solid ' + (colPreset === key ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
              borderRadius: '3px', cursor: 'pointer', letterSpacing: '0.03em'
            }}>{key}</button>
        ))}
        <button onClick={() => setShowColPicker(!showColPicker)} style={{
          marginLeft: 'auto', padding: '3px 10px', fontSize: '0.7rem',
          fontFamily: 'Inter, sans-serif', background: showColPicker ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
          color: showColPicker ? 'var(--gold)' : 'var(--silver)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer'
        }}>COLUMNS</button>
      </div>

      {/* Column picker dropdown */}
      {showColPicker && (
        <div style={{
          background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '8px',
          padding: '10px', marginBottom: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px'
        }}>
          {Object.entries(ROSTER_COLUMNS).map(([key, col]) => {
            const active = visibleCols.includes(key);
            return (
              <label key={key} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem',
                background: active ? 'rgba(212,175,55,0.1)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--silver)'
              }}>
                <input type="checkbox" checked={active} onChange={() => {
                  if (active) setVisibleCols(prev => prev.filter(c => c !== key));
                  else setVisibleCols(prev => [...prev, key]);
                  setColPreset('custom');
                }} style={{ accentColor: 'var(--gold)' }} />
                {col.label}
                <span style={{ fontSize: '0.76rem', opacity: 0.6, marginLeft: 'auto' }}>{col.group}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Frozen left + scrollable right table */}
      {/* Roster table with inline expand cards */}
      <div style={{ border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px', overflow: 'hidden', background: 'var(--black)' }}>
        {/* Header row */}
        <div style={{ display: 'flex', height: '36px', background: 'rgba(212,175,55,0.08)', borderBottom: '2px solid rgba(212,175,55,0.2)' }}>
          <div style={{ width: '220px', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none', borderRight: '2px solid rgba(212,175,55,0.15)' }}
            onClick={() => setRosterSort(prev => prev.key === 'name' ? {...prev, dir: prev.dir*-1} : {key: 'name', dir: 1})}>
            Player{rosterSort.key === 'name' ? (rosterSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}
          </div>
          <div style={{ flex: 1, display: 'flex', overflowX: 'auto' }}>
            {visibleCols.map(colKey => {
              const col = ROSTER_COLUMNS[colKey];
              if (!col) return null;
              return (
                <div key={colKey} onClick={() => setRosterSort(prev => prev.key === colKey ? {...prev, dir: prev.dir*-1} : {key: colKey, dir: 1})}
                  style={{ width: col.width, minWidth: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none' }}>
                  {col.shortLabel || col.label}{rosterSort.key === colKey ? (rosterSort.dir === -1 ? ' \u25BC' : ' \u25B2') : ''}
                </div>
              );
            })}
          </div>
        </div>

        {/* Player rows + inline expand */}
        {filtered.map((r, idx) => {
          const isExpanded = expandedPid === r.pid;
          const contract = window.NFL_CONTRACTS?.[r.pid];
          const peaks = window.App.peakWindows;
          const [pLo, pHi] = peaks[r.pos] || [24,29];

          const _recLower = (r.rec || '').toLowerCase();
          const actionClass = _recLower === 'sell now' || _recLower === 'sell' ? 'wr-row-sell' :
            _recLower === 'sell high' ? 'wr-row-sell-high' :
            _recLower === 'hold core' || _recLower === 'build around' ? 'wr-row-core' : '';
          const ringClass = 'wr-ring wr-ring-' + r.pos;
          const untouchables = (window._wrGmStrategy?.untouchable || []);
          const isUntouchable = untouchables.includes(r.pid);

          return (
            <React.Fragment key={r.pid}>
              {/* Normal row */}
              <div className={[actionClass, isUntouchable ? 'wr-untouchable' : ''].filter(Boolean).join(' ')} style={{ display: 'flex', borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isExpanded ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background 0.1s' }}
                onClick={() => setExpandedPid(prev => prev === r.pid ? null : r.pid)}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'; }}>
                {/* Frozen player info */}
                <div style={{ width: '220px', flexShrink: 0, height: '38px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 6px', borderRight: '2px solid rgba(212,175,55,0.15)', borderLeft: '3px solid ' + statusCol(r.section) }}>
                  <div className={'wr-ring wr-ring-' + r.pos} style={{ width: '26px', height: '26px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+r.pid+'.jpg'} alt="" onError={e=>e.target.style.display='none'} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} /></div>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPlayerName(r.pid)}</span>
                      {(() => { const pt = window._playerTags?.[r.pid]; if (!pt) return null; const cfg = { trade: { bg: 'rgba(240,165,0,0.15)', col: '#F0A500', lbl: 'TB' }, cut: { bg: 'rgba(231,76,60,0.15)', col: '#E74C3C', lbl: 'CUT' }, untouchable: { bg: 'rgba(46,204,113,0.15)', col: '#2ECC71', lbl: 'UT' }, watch: { bg: 'rgba(52,152,219,0.15)', col: '#3498DB', lbl: 'W' } }[pt]; return cfg ? <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, background: cfg.bg, color: cfg.col, flexShrink: 0 }}>{cfg.lbl}</span> : null; })()}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.65 }}>{r.p.team || 'FA'}{r.injury ? ' \u00B7 '+r.injury : ''}</div>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.4 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>
                {/* Data columns */}
                <div style={{ flex: 1, display: 'flex', height: '38px', overflowX: 'auto' }}>
                  {visibleCols.map(colKey => ROSTER_COLUMNS[colKey] ? renderCell(colKey, r) : null)}
                </div>
              </div>

              {/* Inline expand card — Madden/FM style */}
              {isExpanded && (
                <div style={{ borderBottom: '2px solid rgba(212,175,55,0.25)', background: 'linear-gradient(135deg, rgba(212,175,55,0.04), rgba(0,0,0,0.3))', padding: '16px 20px', animation: 'wrFadeIn 0.2s ease' }}>
                  {/* Top: Photo + Identity + Quick Stats */}
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                    <div style={{ flexShrink: 0, position: 'relative' }}>
                      <img src={'https://sleepercdn.com/content/nfl/players/'+r.pid+'.jpg'} alt="" onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='flex';}} style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', objectPosition: 'top', border: '2px solid rgba(212,175,55,0.3)' }} />
                      <div style={{ display: 'none', width: '80px', height: '80px', borderRadius: '10px', background: 'var(--charcoal)', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 700, color: 'var(--silver)', border: '2px solid rgba(212,175,55,0.2)' }}>{(r.p.first_name||'?')[0]}{(r.p.last_name||'?')[0]}</div>
                      <div style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '8px', background: (posColors[r.pos]||'#666')+'25', color: posColors[r.pos]||'var(--silver)', whiteSpace: 'nowrap' }}>{r.pos}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1 }}>{r.p.full_name || getPlayerName(r.pid)}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                        {r.pos} {'\u00B7'} {r.p.team || 'FA'} {'\u00B7'} Age {r.age || '?'} {'\u00B7'} {r.p.years_exp||0}yr exp
                        {r.p.college ? ' \u00B7 '+r.p.college : ''}
                      </div>
                      {r.injury && <div style={{ fontSize: '0.74rem', color: '#E74C3C', fontWeight: 600, marginTop: '3px' }}>{r.injury}</div>}
                      {/* Verdict badge */}
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'Inter, sans-serif', padding: '2px 10px', borderRadius: '10px', background: r.rec.includes('SELL') ? 'rgba(231,76,60,0.15)' : r.rec.includes('BUY') ? 'rgba(46,204,113,0.15)' : 'rgba(212,175,55,0.12)', color: r.rec.includes('SELL') ? '#E74C3C' : r.rec.includes('BUY') ? '#2ECC71' : 'var(--gold)', letterSpacing: '0.04em' }}>{r.rec}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: '10px', background: dhqBg(r.dhq), color: dhqCol(r.dhq) }}>
                          {(typeof window.App?.isElitePlayer === 'function' ? window.App.isElitePlayer(r.pid) : r.dhq >= 7000) ? 'Elite' : r.dhq >= 4000 ? 'Starter' : r.dhq >= 2000 ? 'Depth' : 'Stash'} {'\u00B7'} {r.dhq.toLocaleString()} DHQ
                        </span>
                        {r.peakYrsLeft > 0 && <span style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: '10px', background: r.peakPhase === 'PRE' ? 'rgba(46,204,113,0.1)' : 'rgba(212,175,55,0.08)', color: r.peakPhase === 'PRE' ? '#2ECC71' : 'var(--gold)' }}>{r.peakYrsLeft}yr peak left</span>}
                      </div>
                    </div>
                  </div>

                  {/* Dynasty Profile */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Dynasty Profile</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.5 }}>
                      {r.peakPhase === 'PRE' && r.dhq >= 4000 ? 'Rising asset with ' + r.peakYrsLeft + ' peak years ahead. Buy window closing \u2014 value only goes up from here.' :
                       r.peakPhase === 'PRIME' && r.dhq >= 7000 ? 'Elite producer in prime. Cornerstone dynasty asset \u2014 hold unless offered a king\'s ransom.' :
                       r.peakPhase === 'PRIME' && r.dhq >= 4000 ? 'Solid starter in peak window. ' + r.peakYrsLeft + ' productive years left. Hold or sell high if trending down.' :
                       r.peakPhase === 'POST' ? 'Past peak \u2014 dynasty value declining. ' + (r.dhq >= 3000 ? 'Still producing but sell before the cliff.' : 'Move for any return.') :
                       r.dhq < 2000 ? 'Depth piece. Low dynasty value \u2014 roster clogger unless a breakout is imminent.' :
                       'Moderate dynasty asset. Watch trajectory.'}
                      {r.trend >= 20 ? ' Trending up ' + r.trend + '% \u2014 stock rising.' : r.trend <= -20 ? ' Production down ' + Math.abs(r.trend) + '% \u2014 red flag.' : ''}
                    </div>
                  </div>

                  {/* Stat boxes grid — Madden style */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                    {(() => {
                      const dhqPct = Math.min(100, Math.round((r.dhq / 10000) * 100));
                      const dhqFilled = Math.round(dhqPct / 10);
                      const dhqColor = r.dhq >= 7000 ? 'filled-green' : r.dhq >= 4000 ? 'filled' : 'filled-red';
                      return [
                        { label: 'DHQ', val: r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014', col: dhqCol(r.dhq), gauge: true },
                        { label: 'RANK', val: (() => {
                          const allAtPos = (currentLeague.rosters||[]).flatMap(ros=>(ros.players||[]).filter(pid2=>normPos(playersData[pid2]?.position)===r.pos)).map(pid2=>({pid:pid2,dhq:window.App?.LI?.playerScores?.[pid2]||0})).sort((a,b)=>b.dhq-a.dhq);
                          const rank = allAtPos.findIndex(x=>x.pid===r.pid)+1;
                          return rank > 0 ? r.pos + rank : '\u2014';
                        })(), col: 'var(--gold)' },
                        { label: 'PPG', val: r.effectivePPG || '\u2014', col: r.effectivePPG >= (posP75[r.pos]||10) ? '#2ECC71' : '#f0f0f3' },
                        { label: 'GP', val: r.effectiveGP || '\u2014', col: r.effectiveGP >= 14 ? '#2ECC71' : r.effectiveGP >= 10 ? 'var(--silver)' : '#E74C3C' },
                        { label: 'TREND', val: r.trend ? (r.trend > 0 ? '+' : '') + r.trend + '%' : '\u2014', col: r.trend >= 15 ? '#2ECC71' : r.trend <= -15 ? '#E74C3C' : 'var(--silver)' },
                        { label: 'DEPTH', val: r.p.depth_chart_order != null ? r.pos + (r.p.depth_chart_order + 1) : '\u2014', col: r.p.depth_chart_order != null && r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--silver)' },
                      ].map((s, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 6px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 600, color: s.col, letterSpacing: '-0.02em' }}>{s.val}</div>
                          {s.gauge && <div className="wr-gauge" style={{ marginTop: '3px' }}>{Array.from({length: 10}, (_, gi) => <div key={gi} className={'wr-gauge-seg' + (gi < dhqFilled ? ' ' + dhqColor : '')}></div>)}</div>}
                          <div style={{ fontSize: '0.64rem', color: 'var(--silver)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Physical + Draft Profile */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Profile</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', fontSize: '0.78rem' }}>
                      <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Ht </span><span style={{ color: 'var(--white)' }}>{r.p.height ? Math.floor(r.p.height/12)+"'"+r.p.height%12+'"' : '\u2014'}</span></div>
                      <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Wt </span><span style={{ color: 'var(--white)' }}>{r.p.weight ? r.p.weight+'lbs' : '\u2014'}</span></div>
                      <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Slot </span><span style={{ color: 'var(--white)' }}>{r.section === 'starter' ? 'Starter' : r.section === 'ir' ? 'IR' : r.section === 'taxi' ? 'Taxi' : 'Bench'}</span></div>
                      <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>Exp </span><span style={{ color: 'var(--white)' }}>{r.p.years_exp || 0}yr</span></div>
                      {r.p.college && <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>College </span><span style={{ color: 'var(--white)' }}>{r.p.college}</span></div>}
                      {r.p.depth_chart_order != null && <div><span style={{ color: 'var(--silver)', opacity: 0.6 }}>NFL Depth </span><span style={{ color: r.p.depth_chart_order <= 1 ? '#2ECC71' : 'var(--white)' }}>{r.pos + (r.p.depth_chart_order + 1)}</span></div>}
                    </div>
                  </div>

                  {/* Age Curve visualization */}
                  {(() => {
                    const pw = window.App.peakWindows;
                    const nP = r.pos === 'DE' || r.pos === 'DT' ? 'DL' : r.pos === 'CB' || r.pos === 'S' ? 'DB' : r.pos;
                    const [pLo, pHi] = pw[nP] || [24, 29];
                    const ages = Array.from({length: 17}, (_, i) => i + 20);
                    return <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Age Curve</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{'Currently age ' + (r.age || '?') + ' \u00B7 ' + r.peakPhase + ' \u00B7 ' + (r.peakYrsLeft > 0 ? '~' + r.peakYrsLeft + 'yr left' : 'Past peak')}</div>
                      </div>
                      <div style={{ display: 'flex', height: '22px', borderRadius: '5px', overflow: 'hidden', gap: '1px' }}>
                        {ages.map(a => {
                          const col = a < pLo - 3 ? 'rgba(96,165,250,0.3)' : a < pLo ? 'rgba(46,204,113,0.45)' : (a >= pLo && a <= pHi) ? 'rgba(46,204,113,0.75)' : a <= pHi + 2 ? 'rgba(212,175,55,0.45)' : 'rgba(231,76,60,0.35)';
                          const isMe = a === (r.age || 0);
                          return <div key={a} style={{ flex: 1, background: col, opacity: isMe ? 1 : 0.55, outline: isMe ? '2px solid #D4AF37' : 'none', outlineOffset: '-1px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: isMe ? '#f0f0f3' : 'transparent' }}>{isMe ? a : ''}</div>;
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.64rem', color: 'var(--silver)', marginTop: '3px' }}>
                        <span>20</span><span>{'Peak ' + pLo + '\u2013' + pHi}</span><span>36</span>
                      </div>
                    </div>;
                  })()}

                  {/* Career Stats Table */}
                  <InlineCareerStats pid={r.pid} pos={r.pos} player={r.p} scoringSettings={currentLeague?.scoring_settings} statsData={statsData} />

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={e => { e.stopPropagation(); setReconPanelOpen(true); sendReconMessage('What trades can I make involving ' + (r.p.full_name || getPlayerName(r.pid)) + '? Consider their DHQ value (' + r.dhq + '), age (' + r.age + '), and peak window (' + r.peakPhase + ').'); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>TRADE</button>
                    {[{tag:'trade',label:'TRADE BLOCK',bg:'rgba(240,165,0,0.15)',col:'#F0A500',border:'rgba(240,165,0,0.3)'},{tag:'cut',label:'CUT',bg:'rgba(231,76,60,0.15)',col:'#E74C3C',border:'rgba(231,76,60,0.3)'},{tag:'untouchable',label:'UNTOUCHABLE',bg:'rgba(46,204,113,0.15)',col:'#2ECC71',border:'rgba(46,204,113,0.3)'},{tag:'watch',label:'WATCH',bg:'rgba(52,152,219,0.15)',col:'#3498DB',border:'rgba(52,152,219,0.3)'}].map(t => {
                      const isActive = window._playerTags?.[r.pid] === t.tag;
                      return <button key={t.tag} onClick={e => { e.stopPropagation(); const leagueId = currentLeague.id || currentLeague.league_id || ''; const tags = window._playerTags || {}; if (tags[r.pid] === t.tag) delete tags[r.pid]; else tags[r.pid] = t.tag; window._playerTags = { ...tags }; if (window.OD?.savePlayerTags) window.OD.savePlayerTags(leagueId, tags); setTimeRecomputeTs(Date.now()); }} style={{ padding: '7px 12px', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', background: isActive ? t.bg : 'transparent', color: isActive ? t.col : 'var(--silver)', border: '1px solid ' + (isActive ? t.border : 'rgba(255,255,255,0.1)'), borderRadius: '6px', cursor: 'pointer', fontWeight: isActive ? 700 : 400, letterSpacing: '0.03em' }}>{t.label}</button>;
                    })}
                    <button onClick={e => { e.stopPropagation(); setExpandedPid(null); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Drop Candidates */}
      {(() => {
        const drops = rows.filter(r => !r.isStarter && !r.isIR && !r.isTaxi)
            .sort((a, b) => a.dhq - b.dhq).slice(0, 3);
        if (!drops.length) return null;
        return <div style={{ marginTop: '12px' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: '#E74C3C', letterSpacing: '0.04em', marginBottom: '6px' }}>DROP CANDIDATES</div>
            {drops.map(d => <div key={d.pid} onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(d.pid); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--white)' }}>{getPlayerName(d.pid)}</span>
                <span style={{ color: d.dhq > 0 ? 'var(--silver)' : '#E74C3C', fontFamily: 'Inter, sans-serif' }}>{d.dhq > 0 ? d.dhq.toLocaleString() : 'No value'}</span>
            </div>)}
        </div>;
      })()}
      </div>)}
    </div>
  );
}
