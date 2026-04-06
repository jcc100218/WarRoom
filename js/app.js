// ══════════════════════════════════════════════════════════════════
// app.js — OwnerDashboard (root component) + ReactDOM.render
// Must load LAST — depends on all other modules.
// ══════════════════════════════════════════════════════════════════
    const WR_KEYS  = window.App.WR_KEYS;
    const WrStorage = window.App.WrStorage;

    // ── Notes from the Front — Field Log feed from Scout sessions ──
    var FL_CAT_COLORS = { trade:'#D4AF37', roster:'#2ECC71', draft:'#3498DB', waivers:'#9B59B6', research:'#E67E22', note:'#808080' };
    var FL_CAT_ICONS  = { trade:'🔄', roster:'📋', draft:'🎯', waivers:'📡', research:'🔍', note:'📝' };

    function FieldLogPanel(props) {
        var leagues = props.leagues || [];
        var onOpenLeague = props.onOpenLeague;
        var _s1 = React.useState(null);  var entries = _s1[0]; var setEntries = _s1[1];
        var _s2 = React.useState(false); var syncing = _s2[0]; var setSyncing = _s2[1];
        var _s3 = React.useState(0);     var lastRefresh = _s3[0]; var setLastRefresh = _s3[1];
        var _s4 = React.useState(false); var noSupabase = _s4[0]; var setNoSupabase = _s4[1];

        React.useEffect(function() {
            if (!window.OD || !window.OD.loadFieldLog) { setNoSupabase(true); setEntries([]); return; }
            setNoSupabase(false);
            window.OD.loadFieldLog(null, 60)
                .then(function(data) { setEntries(data || []); })
                .catch(function() { setEntries([]); });
        }, [lastRefresh]);

        var grouped = React.useMemo(function() {
            if (!entries || !entries.length) return [];
            var groups = {};
            entries.forEach(function(e) {
                var d = new Date(e.ts);
                var key = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
                if (!groups[key]) groups[key] = { label: key, ts: e.ts, items: [] };
                groups[key].items.push(e);
            });
            return Object.values(groups).sort(function(a,b) { return b.ts - a.ts; });
        }, [entries]);

        function handleManualSync() {
            if (!window.OD || !window.OD.syncPendingFieldLog) return;
            setSyncing(true);
            window.OD.syncPendingFieldLog().catch(function(){}).then(function() {
                setLastRefresh(Date.now());
                setSyncing(false);
            });
        }

        var pendingCount = (entries || []).filter(function(e) { return e.syncStatus === 'pending' || e.syncStatus === 'failed'; }).length;

        return React.createElement('div', { className: 'product-card', style: { gridColumn: '1 / -1' } },
            // Header row
            React.createElement('div', { className: 'product-card-header', style: { marginBottom: '0.75rem' } },
                React.createElement('div', { style: { width:40,height:40,borderRadius:10,background:'rgba(124,107,248,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',flexShrink:0 } }, '📋'),
                React.createElement('div', { style: { flex:1 } },
                    React.createElement('div', { className: 'product-card-title' }, 'NOTES FROM THE FRONT'),
                    React.createElement('div', { className: 'product-card-subtitle' }, 'Intel logged in your Scout sessions')
                ),
                React.createElement('button', { onClick: handleManualSync, disabled: syncing, style: { flexShrink:0,background:'none',border:'1px solid rgba(124,107,248,0.4)',borderRadius:6,color:'#7c6bf8',fontSize:'0.72rem',padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',fontWeight:700,opacity:syncing?0.5:1 } },
                    syncing ? '↻ Syncing…' : '↻ Refresh'
                )
            ),
            // Body
            entries === null
                ? React.createElement('div', { style: { padding:'1rem 0',textAlign:'center',color:'var(--silver)',fontSize:'0.78rem' } }, 'Loading field log…')
                : entries.length === 0
                ? (noSupabase
                    ? React.createElement('div', { style: { padding:'1.5rem 0',textAlign:'center' } },
                        React.createElement('div', { style: { fontSize:'1.6rem',marginBottom:'0.5rem' } }, '🔌'),
                        React.createElement('div', { style: { fontSize:'0.78rem',color:'var(--silver)',lineHeight:1.6 } }, 'Connect your Scout account to see field notes.')
                      )
                    : React.createElement('div', { style: { padding:'1.5rem 0',textAlign:'center' } },
                        React.createElement('div', { style: { fontSize:'2rem',marginBottom:'0.5rem' } }, '📋'),
                        React.createElement('div', { style: { fontSize:'0.78rem',color:'var(--silver)',lineHeight:1.6 } }, 'No field log entries yet. Actions you take in War Room Scout — trade scenarios, draft targets, waiver bids — will appear here automatically after syncing.')
                      )
                  )
                : React.createElement('div', { style: { maxHeight:'340px',overflowY:'auto',paddingRight:'2px' } },
                    grouped.map(function(group) {
                        return React.createElement('div', { key: group.label, style: { marginBottom:'14px' } },
                            React.createElement('div', { style: { fontSize:'0.64rem',fontWeight:700,color:'var(--silver)',textTransform:'uppercase',letterSpacing:'0.08em',padding:'0 0 5px',borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:'6px',opacity:0.7 } }, group.label),
                            group.items.map(function(entry, idx) {
                                var timeStr = new Date(entry.ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
                                var catColor = FL_CAT_COLORS[entry.category] || '#808080';
                                var targetLeague = entry.leagueId ? leagues.find(function(l) { return l.id === entry.leagueId; }) : null;
                                return React.createElement('div', { key: entry.id || idx, style: { display:'flex',gap:'8px',alignItems:'flex-start',padding:'5px 0',borderBottom:'1px solid rgba(255,255,255,0.03)' } },
                                    React.createElement('span', { style: { fontSize:'0.88rem',flexShrink:0,marginTop:'1px' } }, entry.icon || FL_CAT_ICONS[entry.category] || '📋'),
                                    React.createElement('div', { style: { flex:1,minWidth:0 } },
                                        React.createElement('div', { style: { fontSize:'0.8rem',color:'var(--white)',lineHeight:1.35 } }, entry.text),
                                        entry.players && entry.players.length > 0 && React.createElement('div', { style: { fontSize:'0.68rem',color:'#7c6bf8',marginTop:'2px' } }, entry.players.map(function(p){ return p.name||p; }).join(', ')),
                                        entry.context && React.createElement('div', { style: { fontSize:'0.72rem',color:'var(--silver)',marginTop:'2px',fontStyle:'italic',opacity:0.8,lineHeight:1.3 } }, entry.context),
                                        React.createElement('div', { style: { display:'flex',gap:'5px',alignItems:'center',marginTop:'3px',flexWrap:'wrap' } },
                                            React.createElement('span', { style: { fontSize:'0.64rem',color:catColor,fontWeight:700,textTransform:'uppercase' } }, entry.category),
                                            React.createElement('span', { style: { fontSize:'0.64rem',color:'var(--silver)',opacity:0.4 } }, '·'),
                                            React.createElement('span', { style: { fontSize:'0.64rem',color:'var(--silver)',opacity:0.6 } }, timeStr),
                                            targetLeague && React.createElement('span', { style: { fontSize:'0.64rem',color:'var(--silver)',opacity:0.4 } }, '·'),
                                            targetLeague && React.createElement('span', { style: { fontSize:'0.64rem',color:'var(--silver)',opacity:0.7 } }, targetLeague.name)
                                        )
                                    ),
                                    targetLeague && onOpenLeague && React.createElement('button', { onClick: function(){ onOpenLeague(targetLeague, entry.category); }, style: { flexShrink:0,background:'none',border:'1px solid rgba(212,175,55,0.35)',borderRadius:4,color:'var(--gold)',fontSize:'0.62rem',padding:'2px 7px',cursor:'pointer',fontFamily:'inherit',fontWeight:700,marginTop:'1px' } }, 'OPEN →')
                                );
                            })
                        );
                    })
                  ),
            // Footer
            entries !== null && pendingCount > 0 && React.createElement('div', { style: { marginTop:'8px',paddingTop:'8px',borderTop:'1px solid rgba(255,255,255,0.06)',fontSize:'0.68rem',color:'var(--silver)',opacity:0.7 } }, pendingCount + ' entries pending sync from Scout. Open War Room Scout to push them.')
        );
    }

    // ── ESPN Connect Card ─────────────────────────────────────────
    function ESPNConnectCard({ leagues, connecting, error, onConnect, onSelectLeague, reconBase }) {
        const [leagueId, setLeagueId]   = React.useState('');
        const [espnS2, setEspnS2]       = React.useState('');
        const [swid, setSwid]           = React.useState('');
        const [showCreds, setShowCreds] = React.useState(false);

        const RED = '#cc0000';
        const RED_BG = 'rgba(204,0,0,0.08)';
        const RED_BORDER = 'rgba(204,0,0,0.3)';

        function espnScoutUrl(numericId) {
            return reconBase + '?espn_league=' + numericId;
        }

        if (leagues.length > 0) {
            return React.createElement('div', null,
                leagues.map(function(l) {
                    return React.createElement('div', {
                        key: l.id,
                        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: RED_BG, border: '1px solid ' + RED_BORDER, borderRadius: 10, marginBottom: 8, cursor: 'pointer' },
                        onClick: function() { onSelectLeague(l); }
                    },
                        React.createElement('div', { style: { width: 32, height: 32, borderRadius: 8, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
                            React.createElement('span', { style: { fontSize: 13, fontWeight: 800, color: '#fff' } }, 'E')
                        ),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', { style: { fontSize: '0.86rem', fontWeight: 600, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, l.name),
                            React.createElement('div', { style: { fontSize: '0.72rem', color: 'var(--silver)', marginTop: 2 } },
                                (l.rosters || []).length + ' teams · ' + l.season + ' · ESPN'
                            )
                        ),
                        React.createElement('span', { style: { fontSize: '0.64rem', fontWeight: 800, background: RED, color: '#fff', borderRadius: 4, padding: '2px 6px', flexShrink: 0 } }, 'ESPN')
                    );
                }),
                React.createElement('a', {
                    href: espnScoutUrl(leagues[0]._espnLeagueId),
                    target: '_blank', rel: 'noopener noreferrer',
                    className: 'hub-cta',
                    style: { textDecoration: 'none', background: RED, marginTop: 4, display: 'block', textAlign: 'center', padding: '10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, color: '#fff', letterSpacing: '.06em' }
                }, 'OPEN IN WAR ROOM SCOUT →'),
                React.createElement('button', {
                    onClick: function() { /* allow reconnecting */ },
                    style: { background: 'none', border: 'none', color: 'var(--silver)', fontSize: '0.72rem', cursor: 'pointer', marginTop: 6, padding: 0 }
                }, '+ Connect another league')
            );
        }

        return React.createElement('div', null,
            React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '0.75rem', lineHeight: 1.6 } },
                'Connect any ESPN Fantasy Football league. Your League ID is in the URL: fantasy.espn.com/football/league?leagueId=',
                React.createElement('strong', { style: { color: 'var(--white)' } }, '123456')
            ),
            React.createElement('input', {
                placeholder: 'ESPN League ID (e.g. 123456)',
                value: leagueId,
                onChange: function(e) { setLeagueId(e.target.value); },
                onKeyDown: function(e) { if (e.key === 'Enter') onConnect(leagueId, espnS2, swid); },
                style: { width: '100%', fontSize: '0.9rem', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' }
            }),
            React.createElement('div', {
                onClick: function() { setShowCreds(!showCreds); },
                style: { fontSize: '0.72rem', color: 'var(--silver)', cursor: 'pointer', marginBottom: showCreds ? 8 : 0, display: 'flex', alignItems: 'center', gap: 4 }
            },
                React.createElement('span', null, showCreds ? '▾' : '▸'),
                ' Private league? Add cookies for access'
            ),
            showCreds && React.createElement('div', { style: { marginBottom: 8 } },
                React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--silver)', lineHeight: 1.5, marginBottom: 6 } },
                    'F12 → Application → Cookies → fantasy.espn.com — copy espn_s2 and SWID values.'
                ),
                React.createElement('input', {
                    placeholder: 'espn_s2 cookie value',
                    type: 'password',
                    value: espnS2,
                    onChange: function(e) { setEspnS2(e.target.value); },
                    style: { width: '100%', fontSize: '0.78rem', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', boxSizing: 'border-box', marginBottom: 6, fontFamily: 'monospace' }
                }),
                React.createElement('input', {
                    placeholder: 'SWID cookie value {XXXXXXXX-...}',
                    value: swid,
                    onChange: function(e) { setSwid(e.target.value); },
                    style: { width: '100%', fontSize: '0.78rem', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--white)', boxSizing: 'border-box', fontFamily: 'monospace' }
                })
            ),
            error && React.createElement('div', { style: { fontSize: '0.75rem', color: '#E74C3C', marginBottom: 8, padding: '6px 10px', background: 'rgba(231,76,60,0.08)', borderRadius: 6, lineHeight: 1.5 } }, error),
            React.createElement('button', {
                onClick: function() { onConnect(leagueId, espnS2, swid); },
                disabled: connecting,
                style: { width: '100%', padding: '10px', background: connecting ? 'rgba(204,0,0,0.5)' : RED, color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: connecting ? 'not-allowed' : 'pointer', letterSpacing: '.05em', fontFamily: 'inherit' }
            }, connecting ? 'Connecting...' : 'CONNECT ESPN LEAGUE')
        );
    }

    // Main Dashboard
    function OwnerDashboard() {
        const [showSettings, setShowSettings] = useState(false);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [sleeperUser, setSleeperUser] = useState(null);
        const [selectedYear, setSelectedYear] = useState('2026');
        const [sleeperLeagues, setSleeperLeagues] = useState([]);
        const [activeLeagueId, setActiveLeagueId] = useState(null);
        const [selectedLeague, setSelectedLeague] = useState(null);
        // ESPN state
        const [espnLeagues, setEspnLeagues] = useState([]);
        const [espnConnecting, setEspnConnecting] = useState(false);
        const [espnError, setEspnError] = useState(null);
        // Display name state
        const [customDisplayName, setCustomDisplayName] = useState(() => {
            return localStorage.getItem('od_display_name') || '';
        });

        // Cloud sync — load from Supabase on mount
        useEffect(() => {
            if (window.OD?.loadDisplayName) {
                window.OD.loadDisplayName().then(name => {
                    if (name) { setCustomDisplayName(name); localStorage.setItem('od_display_name', name); }
                }).catch(err => window.wrLog('app.loadDisplayName', err));
            }
        }, []);
        const leagueMates = React.useMemo(() => {
            const seen = new Set();
            // seed with current user's id so we exclude ourselves
            if (sleeperUser?.user_id) seen.add(sleeperUser.user_id);
            const mates = [];
            sleeperLeagues.forEach(league => {
                (league.users || []).forEach(u => {
                    const uid = u.user_id;
                    if (uid && !seen.has(uid)) {
                        seen.add(uid);
                        mates.push(u);
                    }
                });
            });
            return mates.sort((a, b) => (a.display_name || a.username || '').localeCompare(b.display_name || b.username || ''));
        }, [sleeperLeagues, sleeperUser]);

        const AVAILABLE_YEARS = ['2023', '2024', '2025', '2026'];

        useEffect(() => {
            if (sleeperUsername) loadSleeperData();
        }, [selectedYear]);

        async function loadSleeperData() {
            setLoading(true);
            setError(null);

            try {
                const user = await fetchSleeperUser(sleeperUsername);
                if (!user) {
                    setError("Couldn't find that Sleeper username — check spelling and try again");
                    setLoading(false);
                    return;
                }
                setSleeperUser(user);

                const leagues = await fetchUserLeagues(user.user_id, selectedYear);

                const leaguesWithDetails = await Promise.all(
                    leagues.map(async (league) => {
                        try {
                            const [rosters, users] = await Promise.all([
                                fetchLeagueRosters(league.league_id),
                                fetchLeagueUsers(league.league_id)
                            ]);

                            const myRoster = rosters.find(r => r.owner_id === user.user_id);
                            
                            return {
                                id: league.league_id,
                                name: league.name,
                                wins: myRoster?.settings?.wins || 0,
                                losses: myRoster?.settings?.losses || 0,
                                ties: myRoster?.settings?.ties || 0,
                                season: selectedYear,
                                scoring_settings: league.scoring_settings || {},
                                roster_positions: league.roster_positions || [],
                                settings: league.settings || {},
                                rosters,
                                users
                            };
                        } catch (e) {
                            console.error(`Failed to load league ${league.name}:`, e);
                            return null;
                        }
                    })
                );

                const validLeagues = leaguesWithDetails.filter(l => l !== null);
                setSleeperLeagues(validLeagues);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load Sleeper data:', err);
                setError('Failed to load Sleeper data. Please refresh.');
                setLoading(false);
            }
        }

        // Hook must be above the early return to maintain consistent hook order
        const [reconLeagueId, setReconLeagueId] = useState(null);

        // Show league detail if selected
        const LeagueDetail = window.LeagueDetail;
        if (selectedLeague) {
            return <>
                <ErrorBoundary>
                    <LeagueDetail
                        league={selectedLeague}
                        onBack={() => setSelectedLeague(null)}
                        sleeperUserId={sleeperUser?.user_id}
                        onOpenSettings={() => setShowSettings(true)}
                    />
                </ErrorBoundary>
                {showSettings && (
                    <SettingsModal
                        onClose={() => setShowSettings(false)}
                        initDisplayName={customDisplayName}
                        onDisplayNameSave={(name) => {
                            setCustomDisplayName(name);
                            window.OD.saveDisplayName(name);
                        }}
                        leagueMates={leagueMates}
                    />
                )}
            </>;
        }

        // ── Shared helpers ──
        const lastLeagueId = WrStorage.get(WR_KEYS.LAST_LEAGUE_ID);
        const lastLeagueName = WrStorage.get(WR_KEYS.LAST_LEAGUE_NAME);
        const displayName = sleeperUser
            ? (customDisplayName || sleeperUser.display_name || sleeperUser.username || sleeperUsername).toUpperCase()
            : (customDisplayName || 'COMMANDER').toUpperCase();

        const RECONAI_BASE = 'https://jcc100218.github.io/ReconAI/';
        function reconUrl(leagueId) {
            return leagueId ? RECONAI_BASE + '?league=' + leagueId : RECONAI_BASE;
        }

        function leagueHealth(league) {
            const gp = league.wins + league.losses + (league.ties || 0);
            const wp = gp > 0 ? Math.round((league.wins / gp) * 100) : null;
            const myRoster = league.rosters?.find(r => r.owner_id === sleeperUser?.user_id);
            const rosterSlots = league.roster_positions?.filter(p => p !== 'BN' && p !== 'IR' && p !== 'TAXI').length || 0;
            const filled = myRoster?.starters?.filter(s => s && s !== '0').length || 0;
            const fillPct = rosterSlots > 0 ? Math.round((filled / rosterSlots) * 100) : null;
            return { gp, wp, fillPct, teamCount: league.rosters?.length || 0 };
        }

        function LeagueSelector({ onSelect, accent }) {
            const accentColor = 'var(--gold)';
            const accentBg = 'rgba(212,175,55,0.08)';
            const accentBorder = 'rgba(212,175,55,0.3)';
            if (!sleeperUsername) return null;
            if (loading) return <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--silver)', fontSize: '0.82rem' }}>Loading leagues...</div>;
            if (error) return <div style={{ padding: '0.75rem', textAlign: 'center', color: '#E74C3C', fontSize: '0.82rem' }}>{error}</div>;
            if (sleeperLeagues.length === 0) return <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--silver)', fontSize: '0.82rem' }}>No leagues found for {selectedYear}</div>;
            return (
                <div className="hub-league-selector">
                    <label>Select League</label>
                    <div className="hub-league-list">
                        {sleeperLeagues.map(l => {
                            const h = leagueHealth(l);
                            const recordCol = h.wp === null ? 'var(--silver)' : h.wp >= 60 ? 'var(--win-green)' : h.wp < 40 ? 'var(--loss-red)' : 'var(--silver)';
                            const fillCol = h.fillPct === null ? 'var(--silver)' : h.fillPct >= 90 ? 'var(--win-green)' : h.fillPct >= 70 ? 'var(--silver)' : 'var(--loss-red)';
                            return (
                                <div key={l.id} className="hub-league-item" onClick={() => onSelect(l)}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = accentBg; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = accentBorder; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '3px', fontSize: '0.72rem', color: 'var(--silver)' }}>
                                            <span>{h.teamCount}T</span>
                                            <span style={{ color: recordCol, fontWeight: 700 }}>{l.wins}-{l.losses}{l.ties > 0 ? '-'+l.ties : ''}</span>
                                            {h.fillPct !== null && <span style={{ color: fillCol }}>{h.fillPct}% filled</span>}
                                        </div>
                                    </div>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={accentColor} strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        function handleSelectLeague(league) {
            setActiveLeagueId(league.id);
            setSelectedLeague(league);
            WrStorage.set(WR_KEYS.LAST_LEAGUE_ID, league.id);
            WrStorage.set(WR_KEYS.LAST_LEAGUE_NAME, league.name);
        }

        async function handleESPNConnect(leagueId, espnS2, swid) {
            if (!leagueId) { setEspnError('Enter your ESPN league ID'); return; }
            const numericId = leagueId.replace(/\D/g, '');
            if (!numericId) { setEspnError('League ID must be a number from your ESPN URL'); return; }
            if (!window.ESPN) { setEspnError('ESPN connector not loaded — refresh and try again'); return; }
            setEspnConnecting(true);
            setEspnError(null);
            try {
                const year = parseInt(selectedYear);
                // Persist credentials for Scout deep-link
                if (espnS2) localStorage.setItem('espn_s2', espnS2);
                if (swid)   localStorage.setItem('espn_swid', swid);
                const result = await window.ESPN.connectLeague(numericId, year, espnS2 || null, swid || null);
                const league = {
                    id:              result.league.league_id,
                    name:            result.league.name,
                    season:          String(year),
                    wins:            0, losses: 0, ties: 0,
                    rosters:         result.rosters,
                    scoring_settings: result.league.scoring_settings,
                    roster_positions: result.league.roster_positions,
                    settings:         result.league.settings || {},
                    _espn:            true,
                    _espnLeagueId:    numericId,
                };
                setEspnLeagues(prev => {
                    const filtered = prev.filter(l => l._espnLeagueId !== numericId);
                    return [...filtered, league];
                });
            } catch (e) {
                setEspnError(e.message || 'ESPN connection failed');
            } finally {
                setEspnConnecting(false);
            }
        }

        const resumeLeague = sleeperLeagues.find(l => l.id === lastLeagueId);

        return (
            <div className="app-container">
                {/* ── Header ── */}
                <header className="header">
                    <div className="header-brand">
                        <img src="icon-192.png" alt="Logo" style={{ width:'44px',height:'44px',borderRadius:'10px',boxShadow:'0 2px 12px rgba(212,175,55,.3)' }} />
                        <div className="header-text">
                            <h1 className="owner-name" style={{ fontSize:'1.1rem',letterSpacing:'.06em' }}>WAR ROOM</h1>
                            <div className="header-subtitle">{String(displayName)}</div>
                        </div>
                    </div>
                    <a href={RECONAI_BASE} onClick={() => localStorage.setItem('fw_preferred_view','scout')} style={{ fontSize:'0.72rem',color:'var(--gold)',textDecoration:'none',fontWeight:700,padding:'4px 10px',border:'1px solid rgba(212,175,55,.25)',borderRadius:'6px',whiteSpace:'nowrap',marginRight:'8px' }} title="Switch to Scout mobile view">Scout</a>
                    <svg className="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={() => setShowSettings(true)} style={{ cursor: 'pointer' }}>
                        <circle cx="12" cy="12" r="3" stroke="var(--gold)"/>
                        <path d="M12 1v6m0 6v6m-5.2-7.8l-4.3-4.2m12.9 0l4.3 4.2M1 12h6m6 0h6m-7.8 5.2l-4.2 4.3m0-12.9l4.2 4.3" stroke="var(--gold)"/>
                    </svg>
                </header>

                {/* ── Session Strip ── */}
                {resumeLeague && !loading && (
                    <div className="session-strip">
                        <span className="session-strip-label">Last Session:</span>
                        <span className="session-strip-league">{lastLeagueName}</span>
                        <button className="session-strip-btn primary" onClick={() => handleSelectLeague(resumeLeague)}>Resume</button>
                        <button className="session-strip-btn secondary" onClick={() => handleSelectLeague(resumeLeague)}>View Alerts</button>
                        <button className="session-strip-btn secondary" onClick={() => handleSelectLeague(resumeLeague)}>Open Draft Room</button>
                    </div>
                )}

                {/* ── 4 Platform Cards ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', padding: '0 12px' }}>

                    {/* ──── SLEEPER ──── */}
                    <div className="product-card">
                        <div className="product-card-header">
                            <div className="product-card-icon gold">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--black)" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                            </div>
                            <div>
                                <div className="product-card-title">SLEEPER</div>
                                <div className="product-card-subtitle">{sleeperUsername ? sleeperLeagues.length + ' league' + (sleeperLeagues.length !== 1 ? 's' : '') + ' synced' : 'Connect your account'}</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            {!sleeperUsername ? (
                                <div className="hub-connect-card">
                                    <input id="wr-sleeper-input" placeholder="Sleeper username" onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } } }} />
                                    <button className="hub-cta gold" onClick={() => { const v = document.getElementById('wr-sleeper-input')?.value?.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } }}>CONNECT</button>
                                    <button className="hub-cta ghost" style={{ marginTop: '6px' }} onClick={() => { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:'jcc100218'})); WrStorage.set(WR_KEYS.DEMO_MODE, '1'); window.location.reload(); }}>Demo League</button>
                                </div>
                            ) : (
                                <>
                                    <LeagueSelector onSelect={handleSelectLeague} accent="gold" />
                                    {resumeLeague ? (
                                        <button className="hub-cta gold" onClick={() => handleSelectLeague(resumeLeague)}>ENTER {lastLeagueName?.toUpperCase()}</button>
                                    ) : sleeperLeagues.length > 0 ? (
                                        <button className="hub-cta gold" onClick={() => handleSelectLeague(sleeperLeagues[0])}>ENTER {sleeperLeagues[0].name?.toUpperCase()}</button>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ──── ESPN ──── */}
                    <div className="product-card">
                        <div className="product-card-header">
                            <div className="product-card-icon gold">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--black)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
                            </div>
                            <div>
                                <div className="product-card-title">ESPN</div>
                                <div className="product-card-subtitle">{espnLeagues.length ? espnLeagues.length + ' league' + (espnLeagues.length !== 1 ? 's' : '') + ' synced' : 'Connect your league'}</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            <ESPNConnectCard
                                leagues={espnLeagues}
                                connecting={espnConnecting}
                                error={espnError}
                                onConnect={handleESPNConnect}
                                onSelectLeague={handleSelectLeague}
                                reconBase={RECONAI_BASE}
                            />
                        </div>
                    </div>

                    {/* ──── MFL ──── */}
                    <div className="product-card">
                        <div className="product-card-header">
                            <div className="product-card-icon gold">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--black)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                            </div>
                            <div>
                                <div className="product-card-title">MFL</div>
                                <div className="product-card-subtitle">MyFantasyLeague connector</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '8px' }}>Enter your MFL League ID and year to connect.</div>
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                <input id="wr-mfl-id" placeholder="League ID" style={{ flex: 1, padding: '8px 10px', background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }} />
                                <input id="wr-mfl-year" placeholder="Year" defaultValue="2026" style={{ width: '70px', padding: '8px 10px', background: 'var(--charcoal)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '6px', color: 'var(--white)', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', textAlign: 'center' }} />
                            </div>
                            <button className="hub-cta gold" onClick={() => {
                                const id = document.getElementById('wr-mfl-id')?.value?.trim();
                                const yr = document.getElementById('wr-mfl-year')?.value?.trim() || '2026';
                                if (id) { localStorage.setItem('mfl_league_id', id); localStorage.setItem('mfl_year', yr); window.location.reload(); }
                            }}>CONNECT MFL</button>
                        </div>
                    </div>

                    {/* ──── YAHOO ──── */}
                    <div className="product-card">
                        <div className="product-card-header">
                            <div className="product-card-icon gold">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--black)" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                            </div>
                            <div>
                                <div className="product-card-title">YAHOO</div>
                                <div className="product-card-subtitle">OAuth connected</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '8px' }}>Yahoo leagues connect via OAuth in Scout.</div>
                            <a href={RECONAI_BASE} className="hub-cta ghost" style={{ textDecoration: 'none' }}>Connect via Scout</a>
                        </div>
                    </div>

                </div>

                {showSettings && (
                    <SettingsModal
                        onClose={() => setShowSettings(false)}
                        initDisplayName={customDisplayName}
                        onDisplayNameSave={(name) => {
                            setCustomDisplayName(name);
                            window.OD.saveDisplayName(name);
                        }}
                        leagueMates={leagueMates}
                    />
                )}

            </div>
        );
    }

    ReactDOM.render(<OwnerDashboard />, document.getElementById('root'));
