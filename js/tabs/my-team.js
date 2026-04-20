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

  // Compare sub-view was promoted to its own top-level tab (js/tabs/compare.js)
  // so myTeamView / compareTeamId props are gone.

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
  getAcquisitionInfo: getAcquisitionInfoProp,
}) {
  // Fallback if prop not passed — prevents crash
  const getAcquisitionInfo = typeof getAcquisitionInfoProp === 'function' ? getAcquisitionInfoProp : () => ({ method: 'Unknown', date: '', cost: '' });
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
    // Phase 2: Position grouping is ALWAYS the primary ordering (QB→RB→WR→TE→K→DL→LB→DB).
    // Works for every filter — All, Starters, Bench, Taxi, IR, Offense, IDP — and within
    // each position group the user's selected sort column + direction applies as a secondary sort.
    // Exception: when the user explicitly clicks the Pos header, direction toggles the whole
    // block (so Pos ▼ reverses to DB→LB→…→QB).
    return [...filtered].sort((a, b) => {
      const {key, dir} = rosterSort;
      if (a.pos !== b.pos) {
        const d = ((posOrder[a.pos] ?? 99) - (posOrder[b.pos] ?? 99));
        // Only invert position grouping when user is explicitly sorting by Pos desc.
        return key === 'pos' ? d * dir : d;
      }
      if (key === 'dhq') return (b.dhq - a.dhq) * dir;
      if (key === 'age') return ((a.age||99) - (b.age||99)) * dir;
      if (key === 'ppg') {
        // Honor the rolling PPG window so sort order matches what's displayed.
        let av = a.curPPG || 0, bv = b.curPPG || 0;
        if (ppgWindow !== 'season' && typeof window.App?.computeRollingPPG === 'function') {
          const n = ppgWindow === 'l3' ? 3 : 5;
          const ra = window.App.computeRollingPPG(a.pid, n);
          const rb = window.App.computeRollingPPG(b.pid, n);
          // Only override if rolling data is available for the player; else fall back to seasonal.
          if (ra > 0) av = ra;
          if (rb > 0) bv = rb;
        }
        return (bv - av) * dir;
      }
      if (key === 'prev') return ((b.prevPPG||0) - (a.prevPPG||0)) * dir;
      if (key === 'trend') return ((b.trend||0) - (a.trend||0)) * dir;
      if (key === 'gp') return ((b.curGP||0) - (a.curGP||0)) * dir;
      if (key === 'durability') return ((b.durabilityGP||0) - (a.durabilityGP||0)) * dir;
      if (key === 'name') { const na = getPlayerName(a.pid).toLowerCase(), nb = getPlayerName(b.pid).toLowerCase(); return (na < nb ? -1 : na > nb ? 1 : 0) * dir; }
      if (key === 'pos') { const d = ((posOrder[a.pos] ?? 99) - (posOrder[b.pos] ?? 99)); return d !== 0 ? d * dir : (b.dhq - a.dhq); }
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
    trend:      { label: 'Year-over-Year PPG Change (%) — how this season\u2019s PPG compares to last season\u2019s', shortLabel: 'YoY PPG %', width: '58px', group: 'dynasty' },
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
    dynasty: ['pos','age','dhq','peak','trend','action','acquired','acquiredDate'],
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

  // Drop candidate PIDs: non-starters with lowest DHQ (bottom 3 bench players)
  const dropCandidatePids = React.useMemo(() => {
    const benchPlayers = rows.filter(r => !r.isStarter && !r.isIR && !r.isTaxi)
      .sort((a, b) => a.dhq - b.dhq).slice(0, 3);
    return new Set(benchPlayers.map(r => r.pid));
  }, [rows]);

  // Dismissed drop alerts (persisted in localStorage per league)
  const [dismissedDrops, setDismissedDrops] = React.useState(() => {
    try {
      const leagueId = currentLeague?.id || currentLeague?.league_id || '';
      const stored = localStorage.getItem('wr_dismissed_drops_' + leagueId);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  // Rolling PPG window — persisted per-user. 'season' = full season-to-date,
  // 'l5' / 'l3' = last N games computed from window.App.computeRollingPPG
  // (populated once wr:weekly-points-loaded fires).
  const [ppgWindow, setPpgWindow] = React.useState(() => {
    try { return localStorage.getItem('wr_ppg_window') || 'season'; } catch { return 'season'; }
  });
  React.useEffect(() => {
    try { localStorage.setItem('wr_ppg_window', ppgWindow); } catch {}
  }, [ppgWindow]);
  // Force a re-render when weekly points become available so rolling-PPG cells update.
  const [, forcePpgRerender] = React.useState(0);
  React.useEffect(() => {
    const h = () => forcePpgRerender(n => n + 1);
    window.addEventListener('wr:weekly-points-loaded', h);
    return () => window.removeEventListener('wr:weekly-points-loaded', h);
  }, []);
  const dismissDrop = React.useCallback((pid) => {
    const playerName = window.App?.playersData?.[pid]?.full_name || pid;
    setDismissedDrops(prev => {
      const next = new Set(prev);
      next.add(pid);
      try {
        const leagueId = currentLeague?.id || currentLeague?.league_id || '';
        localStorage.setItem('wr_dismissed_drops_' + leagueId, JSON.stringify([...next]));
      } catch {}
      return next;
    });
    window.wrLogAction?.('\uD83D\uDEAB', 'Dismissed drop alert for ' + playerName, 'roster', { players: [{ name: playerName, pid: pid }], actionType: 'dismiss-drop' });
  }, [currentLeague]);

  const filtered = filteredAndSortedRows(rows);

  // renderCell — renders each data cell with FM-style coloring
  function renderCell(colKey, r) {
    const col = ROSTER_COLUMNS[colKey];
    const base = { width: col.width, minWidth: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.84rem', padding: '0 5px' };

    switch(colKey) {
      case 'pos': return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', background: (posColors[r.pos]||'#666')+'22', color: posColors[r.pos]||'var(--silver)' }}>{r.pos}</span></div>;
      case 'age': return <div key={colKey} style={{...base, background: ageBg(r.age)}}><span style={{ color: ageCol(r.age), fontWeight: 600 }}>{r.age||'\u2014'}</span></div>;
      case 'dhq': return <div key={colKey} style={{...base, background: dhqBg(r.dhq)}}><span style={{ color: dhqCol(r.dhq), fontWeight: 700, fontFamily: 'Inter, sans-serif', fontSize: '0.82rem' }}>{r.dhq > 0 ? r.dhq.toLocaleString() : '\u2014'}</span></div>;
      case 'ppg': {
        // Rolling PPG override — swap in last-N-games PPG when user toggled the window.
        // If a window is active but weekly data isn't ready for this player, fall back
        // to seasonal and mark the cell "· Szn" so the user knows it's not rolling.
        let shown = r.effectivePPG;
        let marker = r.curPPG === 0 && r.prevPPG > 0 ? '*' : '';
        if (ppgWindow !== 'season') {
          const n = ppgWindow === 'l3' ? 3 : 5;
          const rolling = typeof window.App?.computeRollingPPG === 'function'
            ? window.App.computeRollingPPG(r.pid, n)
            : 0;
          if (rolling > 0) { shown = rolling; marker = ' · L' + n; }
          else { marker = ' · Szn'; }
        }
        return <div key={colKey} style={{...base, background: ppgBg(shown, r.pos)}}><span style={{ color: shown >= (posP75[r.pos]||10) ? '#2ECC71' : 'var(--silver)' }}>{shown > 0 ? shown : '\u2014'}{marker}</span></div>;
      }
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
        const methodColors = { Drafted: '#3498DB', Traded: '#9B59B6', Waiver: 'var(--gold)', FA: '#2ECC71', Original: 'var(--silver)' };
        const col = methodColors[acq.method] || 'var(--silver)';
        const methods = ['Drafted', 'Traded', 'Waiver', 'FA'];
        return <div key={colKey} style={{...base}}><span
          style={{ fontSize: '0.65rem', fontWeight: 600, color: col, padding: '1px 5px', borderRadius: '3px', border: `1px solid ${col}40`, background: `${col}10`, cursor: 'pointer' }}
          title="Click to change acquisition method"
          onClick={e => {
            e.stopPropagation();
            const curIdx = methods.indexOf(acq.method);
            const next = methods[(curIdx + 1) % methods.length];
            try {
              const overrides = JSON.parse(localStorage.getItem('wr_acquired_overrides') || '{}');
              overrides[r.pid] = { method: next, date: acq.date || '\u2014', cost: '' };
              localStorage.setItem('wr_acquired_overrides', JSON.stringify(overrides));
              // Force re-render by dispatching a custom event
              window.dispatchEvent(new Event('resize'));
            } catch {}
          }}
        >{acq.method}{acq.cost ? ' ' + acq.cost : ''}</span></div>;
      }
      case 'acquiredDate': {
        const acq = getAcquisitionInfo(r.pid, myRoster?.roster_id);
        const show = acq.date && acq.date !== '\u2014' ? acq.date : '';
        return <div key={colKey} style={{...base}}><span style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.8 }}>{show || '\u2014'}</span></div>;
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

        // Pick capital — count of total picks owned (not DHQ value)
        const pickCount = (() => {
          let count = 0;
          const draftRounds = currentLeague.settings?.draft_rounds || 5;
          const leagueSeason = parseInt(currentLeague.season) || new Date().getFullYear();
          for (let yr = leagueSeason; yr <= leagueSeason + 2; yr++) for (let rd = 1; rd <= draftRounds; rd++) {
            // Check if this pick was traded away
            const tradedAway = (_sTradedPicks).find(p => parseInt(p.season) === yr && p.round === rd && p.roster_id === myRoster?.roster_id && p.owner_id !== myRoster?.roster_id);
            if (!tradedAway) count++;
            // Count picks acquired from other teams
            (_sTradedPicks).filter(p => parseInt(p.season) === yr && p.round === rd && p.owner_id === myRoster?.roster_id && p.roster_id !== myRoster?.roster_id).forEach(() => { count++; });
          }
          return count;
        })();
        const expectedPicks = (currentLeague.settings?.draft_rounds || 5) * 3; // 3 years worth

        return <div style={{ marginBottom: '12px' }}>
          <GMMessage compact>
            {tier === 'REBUILDING' ? 'Rebuilding phase.' : tier === 'CONTENDER' || tier === 'ELITE' ? 'Legitimate contender.' : 'At a crossroads.'}
            {needs.length ? ' Weakest at ' + needs.slice(0, 2).map(n => n.pos).join(' and ') + '.' : ''}
            {needs.length ? ' Priority: ' + needs.slice(0, 2).map(n => (n.urgency === 'deficit' ? 'find ' : 'add ') + n.pos + (n.urgency === 'deficit' ? ' via trade or waivers' : ' depth')).join('; ') + '.' : ''}
            {elites < 2 ? ' Need more elite assets (top 5 at position).' : ''}
          </GMMessage>

          {/* 4 KPIs — Phase 2: WINDOW card replaced with TIER */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '10px' }}>
            {(() => {
              const tierColor = tier === 'ELITE' ? '#2ECC71'
                : tier === 'CONTENDER' ? 'var(--gold)'
                : tier === 'CROSSROADS' ? '#F0A500'
                : tier === 'REBUILDING' ? '#E74C3C'
                : 'var(--silver)';
              const tierLabel = tier ? tier.charAt(0) + tier.slice(1).toLowerCase() : '—';
              return [
                { label: 'CONTENDER', value: '#' + contenderRank + '/' + totalTeams, color: contenderRank <= 3 ? '#2ECC71' : contenderRank <= 8 ? 'var(--gold)' : '#E74C3C' },
                { label: 'DYNASTY', value: '#' + dynastyRank + '/' + totalTeams, color: dynastyRank <= 3 ? '#2ECC71' : dynastyRank <= 8 ? 'var(--gold)' : '#E74C3C' },
                { label: 'TIER', value: tierLabel, color: tierColor },
                { label: 'PICKS', value: pickCount + ' picks', color: pickCount >= expectedPicks ? '#2ECC71' : pickCount >= expectedPicks * 0.6 ? 'var(--gold)' : '#E74C3C' },
              ].map((kpi, i) => <div key={i} style={{ background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', color: kpi.color }}>{kpi.value}</div>
                <div style={{ fontSize: '0.64rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
              </div>);
            })()}
          </div>

          {/* Phase 2: Per-position peak summary — avg peak years left by position group */}
          {(() => {
            const POS_ORDER = ['QB','RB','WR','TE','K','DL','LB','DB'];
            const stats = {};
            rows.forEach(r => {
              if (!stats[r.pos]) stats[r.pos] = { total: 0, count: 0, rising: 0 };
              if (r.peakYrsLeft > 0) stats[r.pos].total += r.peakYrsLeft;
              stats[r.pos].count += 1;
              if (r.peakPhase === 'PRE' || r.peakPhase === 'PRIME') stats[r.pos].rising += 1;
            });
            const shown = POS_ORDER.filter(p => stats[p] && stats[p].count > 0);
            if (!shown.length) return null;
            return React.createElement('div', {
              style: { marginTop: '10px', padding: '8px 12px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '6px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }
            },
              React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, opacity: 0.7 } }, 'PEAKS'),
              ...shown.map(p => {
                const s = stats[p];
                const avg = s.count > 0 ? (s.total / s.count) : 0;
                const col = avg >= 4 ? '#2ECC71' : avg >= 2 ? 'var(--gold)' : '#E74C3C';
                return React.createElement('div', { key: p, style: { display: 'flex', alignItems: 'baseline', gap: '4px' } },
                  React.createElement('span', { style: { fontSize: '0.7rem', fontWeight: 700, color: (window.App?.POS_COLORS?.[p] || 'var(--silver)') } }, p),
                  React.createElement('span', { style: { fontSize: '0.76rem', fontFamily: 'JetBrains Mono, monospace', color: col } }, avg > 0 ? avg.toFixed(1) + 'yr' : '—'),
                  React.createElement('span', { style: { fontSize: '0.6rem', color: 'var(--silver)', opacity: 0.5 } }, '(' + s.count + ')')
                );
              })
            );
          })()}
        </div>;
      })()}

      {/* Compare sub-view was extracted to js/tabs/compare.js. Roster view renders unconditionally below. */}
      <div>
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
          padding: '3px 10px', fontSize: '0.7rem',
          fontFamily: 'Inter, sans-serif', background: showColPicker ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
          color: showColPicker ? 'var(--gold)' : 'var(--silver)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px', cursor: 'pointer'
        }}>COLUMNS</button>
        {/* Rolling PPG window selector — Season / L5 / L3 — wires to window.App.computeRollingPPG */}
        <span style={{ fontSize: '0.7rem', color: 'var(--silver)', opacity: 0.65, marginLeft: '6px', fontFamily: 'Inter, sans-serif' }}>PPG:</span>
        {[{k:'season',l:'Season'},{k:'l5',l:'L5'},{k:'l3',l:'L3'}].map(opt => (
          <button key={opt.k} onClick={() => setPpgWindow(opt.k)} title={opt.k === 'season' ? 'Season-to-date PPG' : 'Last ' + (opt.k === 'l5' ? 5 : 3) + ' games — requires weekly data'} style={{
            padding: '3px 8px', fontSize: '0.7rem', fontWeight: ppgWindow === opt.k ? 700 : 400,
            fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
            background: ppgWindow === opt.k ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
            color: ppgWindow === opt.k ? 'var(--black)' : 'var(--silver)',
            border: '1px solid ' + (ppgWindow === opt.k ? 'var(--gold)' : 'rgba(255,255,255,0.08)'),
            borderRadius: '3px', cursor: 'pointer', letterSpacing: '0.03em'
          }}>{opt.l}</button>
        ))}
        {/* SI-1: Saved List Views — capture columns/sort/filter, restore across sessions */}
        {window.WR?.SavedViews?.SavedViewBar && (
          <div style={{ marginLeft: 'auto' }}>
            {React.createElement(window.WR.SavedViews.SavedViewBar, {
              surface: 'roster',
              leagueId: currentLeague?.id,
              currentState: { columns: visibleCols, sort: rosterSort, filters: { rosterFilter } },
              onApply: (v) => {
                if (Array.isArray(v.columns) && v.columns.length) { setVisibleCols(v.columns); setColPreset('custom'); }
                if (v.sort && v.sort.key) setRosterSort({ key: v.sort.key, dir: v.sort.dir || 1 });
                if (v.filters && typeof v.filters.rosterFilter === 'string') setRosterFilter(v.filters.rosterFilter);
              },
            })}
          </div>
        )}
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
              <div className={[actionClass, isUntouchable ? 'wr-untouchable' : ''].filter(Boolean).join(' ')} style={{ display: 'flex', overflow: 'hidden', borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isExpanded ? 'rgba(212,175,55,0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background 0.1s' }}
                onClick={() => setExpandedPid(prev => prev === r.pid ? null : r.pid)}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(212,175,55,0.06)'; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent'; }}>
                {/* Frozen player info */}
                <div style={{ width: '220px', flexShrink: 0, height: '38px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 6px', borderRight: '2px solid rgba(212,175,55,0.15)', borderLeft: '3px solid ' + statusCol(r.section) }}>
                  <div className={'wr-ring wr-ring-' + r.pos} style={{ width: '26px', height: '26px', flexShrink: 0 }}><img src={'https://sleepercdn.com/content/nfl/players/thumb/'+r.pid+'.jpg'} alt="" onError={e=>e.target.style.display='none'} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} /></div>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPlayerName(r.pid)}</span>
                      {(() => { const pt = window._playerTags?.[r.pid]; if (!pt) return null; const cfg = { trade: { bg: 'rgba(240,165,0,0.15)', col: '#F0A500', lbl: 'TB' }, cut: { bg: 'rgba(231,76,60,0.15)', col: '#E74C3C', lbl: 'CUT' }, untouchable: { bg: 'rgba(46,204,113,0.15)', col: '#2ECC71', lbl: 'UT' }, watch: { bg: 'rgba(52,152,219,0.15)', col: '#3498DB', lbl: 'W' } }[pt]; return cfg ? <span style={{ fontSize: '0.58rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 700, background: cfg.bg, color: cfg.col, flexShrink: 0, lineHeight: 1 }}>{cfg.lbl}</span> : null; })()}
                      {dropCandidatePids.has(r.pid) && !dismissedDrops.has(r.pid) && <span onClick={e => { e.stopPropagation(); dismissDrop(r.pid); }} title="Drop candidate (click to dismiss)" style={{ fontSize: '0.56rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 700, background: 'rgba(231,76,60,0.2)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.4)', flexShrink: 0, cursor: 'pointer', lineHeight: 1 }}>DROP?</span>}
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
                      <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.3rem', color: 'var(--white)', letterSpacing: '0.02em', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {r.p.full_name || getPlayerName(r.pid)}
                        {typeof StarBtn !== 'undefined' && <StarBtn id={'myteam_' + r.pid} title={r.p.full_name || getPlayerName(r.pid)} content={`${r.pos} · ${r.p.team || 'FA'} · Age ${r.age || '?'} · ${r.dhq.toLocaleString()} DHQ · ${r.rec}`} sourceModule="My Team" />}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginTop: '2px' }}>
                        {r.pos} {'\u00B7'} {r.p.team || 'FA'} {'\u00B7'} Age {r.age || '?'} {'\u00B7'} {r.p.years_exp||0}yr exp
                        {r.p.college ? ' \u00B7 '+r.p.college : ''}
                      </div>
                      {r.injury && <div style={{ fontSize: '0.74rem', color: '#E74C3C', fontWeight: 600, marginTop: '3px' }}>{r.injury}</div>}
                      {/* Dynasty profile — inline */}
                      <div style={{ fontSize: '0.72rem', fontStyle: 'italic', color: 'var(--silver)', opacity: 0.8, marginTop: '2px' }}>
                        {r.peakPhase === 'PRE' && r.dhq >= 4000 ? 'Rising asset with ' + r.peakYrsLeft + ' peak years ahead. Buy window closing.' :
                         r.peakPhase === 'PRIME' && r.dhq >= 7000 ? 'Elite producer in prime. Cornerstone dynasty asset.' :
                         r.peakPhase === 'PRIME' && r.dhq >= 4000 ? 'Solid starter in peak window. ' + r.peakYrsLeft + ' productive years left.' :
                         r.peakPhase === 'POST' ? 'Past peak \u2014 dynasty value declining. ' + (r.dhq >= 3000 ? 'Sell before the cliff.' : 'Move for any return.') :
                         r.dhq < 2000 ? 'Depth piece. Low dynasty value.' :
                         'Moderate dynasty asset. Watch trajectory.'}
                        {r.trend >= 20 ? ' Trending up ' + r.trend + '%.' : r.trend <= -20 ? ' Production down ' + Math.abs(r.trend) + '%.' : ''}
                      </div>
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
                    <button onClick={e => { e.stopPropagation(); const playerName = r.p.full_name || getPlayerName(r.pid); setReconPanelOpen(true); sendReconMessage("I'd like help with " + playerName + ". Here are my options:\n1. Who are the best trade partners for " + playerName + "?\n2. What's the long-term projection for " + playerName + "?\n3. Should I hold or sell " + playerName + " right now?"); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'rgba(124,107,248,0.15)', color: '#9b8afb', border: '1px solid rgba(124,107,248,0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>ASK ALEX</button>
                    {/* Phase 2: News button removed per user feedback (2026-04-18) */}
                    {[{tag:'trade',label:'TRADE BLOCK',bg:'rgba(240,165,0,0.15)',col:'#F0A500',border:'rgba(240,165,0,0.3)'},{tag:'cut',label:'CUT',bg:'rgba(231,76,60,0.15)',col:'#E74C3C',border:'rgba(231,76,60,0.3)'},{tag:'untouchable',label:'UNTOUCHABLE',bg:'rgba(46,204,113,0.15)',col:'#2ECC71',border:'rgba(46,204,113,0.3)'},{tag:'watch',label:'WATCH',bg:'rgba(52,152,219,0.15)',col:'#3498DB',border:'rgba(52,152,219,0.3)'}].map(t => {
                      const isActive = window._playerTags?.[r.pid] === t.tag;
                      return <button key={t.tag} onClick={e => { e.stopPropagation(); const leagueId = currentLeague.id || currentLeague.league_id || ''; const tags = window._playerTags || {}; const wasActive = tags[r.pid] === t.tag; if (wasActive) delete tags[r.pid]; else tags[r.pid] = t.tag; window._playerTags = { ...tags }; if (window.OD?.savePlayerTags) window.OD.savePlayerTags(leagueId, tags); if (!wasActive) { const playerName = r.p.full_name || getPlayerName(r.pid); window.wrLogAction?.('\uD83C\uDFF7\uFE0F', 'Tagged ' + playerName + ' as ' + t.label, 'roster', { players: [{ name: playerName, pid: r.pid }], actionType: 'tag' }); } setTimeRecomputeTs(Date.now()); }} style={{ padding: '7px 12px', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', background: isActive ? t.bg : 'transparent', color: isActive ? t.col : 'var(--silver)', border: '1px solid ' + (isActive ? t.border : 'rgba(255,255,255,0.1)'), borderRadius: '6px', cursor: 'pointer', fontWeight: isActive ? 700 : 400, letterSpacing: '0.03em' }}>{t.label}</button>;
                    })}
                    <button onClick={e => { e.stopPropagation(); setExpandedPid(null); }} style={{ padding: '7px 16px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'transparent', color: 'var(--silver)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer' }}>COLLAPSE</button>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      </div>
    </div>
  );
}
