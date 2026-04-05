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

        React.useEffect(function() {
            if (!window.OD || !window.OD.loadFieldLog) { setEntries([]); return; }
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
                ? React.createElement('div', { style: { padding:'1.5rem 0',textAlign:'center' } },
                    React.createElement('div', { style: { fontSize:'2rem',marginBottom:'0.5rem' } }, '📋'),
                    React.createElement('div', { style: { fontSize:'0.78rem',color:'var(--silver)',lineHeight:1.6 } }, 'No field log entries yet. Actions you take in ReconAI Scout — trade scenarios, draft targets, waiver bids — will appear here automatically after syncing.')
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
            entries !== null && pendingCount > 0 && React.createElement('div', { style: { marginTop:'8px',paddingTop:'8px',borderTop:'1px solid rgba(255,255,255,0.06)',fontSize:'0.68rem',color:'var(--silver)',opacity:0.7 } }, pendingCount + ' entries pending sync from Scout. Open ReconAI to push them.')
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
            const accentColor = accent === 'purple' ? '#7c6bf8' : 'var(--gold)';
            const accentBg = accent === 'purple' ? 'rgba(124,107,248,0.08)' : 'rgba(212,175,55,0.08)';
            const accentBorder = accent === 'purple' ? 'rgba(124,107,248,0.3)' : 'rgba(212,175,55,0.3)';
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

        const resumeLeague = sleeperLeagues.find(l => l.id === lastLeagueId);

        return (
            <div className="app-container">
                {/* ── Header ── */}
                <header className="header">
                    <div className="header-brand">
                        <img src="icon-192.png" alt="Logo" className="owner-logo-small" />
                        <div className="header-text">
                            <h1 className="owner-name">FANTASY WARS</h1>
                            <div className="header-subtitle">{String(displayName)}</div>
                        </div>
                    </div>
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

                {/* ── Two Equal Product Cards ── */}
                <div className="hub-layout">

                    {/* ──── Card 1: Sleeper Leagues ──── */}
                    <div className="product-card">
                        <div className="product-card-header">
                            <div className="product-card-icon gold">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--black)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                                    <path d="M2 17l10 5 10-5"/>
                                    <path d="M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                            <div>
                                <div className="product-card-title">WAR ROOM</div>
                                <div className="product-card-subtitle">Command your dynasty</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '1rem', lineHeight: 1.6 }}>
                                Draft room, roster control, standings, trade center, and league-wide intelligence — all powered by your Sleeper data.
                            </div>

                            {!sleeperUsername ? (
                                <div className="hub-connect-card">
                                    <input id="wr-sleeper-input" placeholder="Enter your Sleeper username" onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } } }} />
                                    <button className="hub-cta gold" onClick={() => { const v = document.getElementById('wr-sleeper-input')?.value?.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } }}>CONNECT SLEEPER ACCOUNT</button>
                                    <div style={{ marginTop: '8px' }}>
                                        <button className="hub-cta ghost" onClick={() => { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:'jcc100218'})); WrStorage.set(WR_KEYS.DEMO_MODE, '1'); window.location.reload(); }}>Explore Demo League</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <LeagueSelector onSelect={handleSelectLeague} accent="gold" />
                                    {resumeLeague && (
                                        <button className="hub-cta gold" onClick={() => handleSelectLeague(resumeLeague)}>RESUME {lastLeagueName?.toUpperCase()}</button>
                                    )}
                                    {!resumeLeague && sleeperLeagues.length > 0 && (
                                        <button className="hub-cta gold" onClick={() => handleSelectLeague(sleeperLeagues[0])}>ENTER {sleeperLeagues[0].name?.toUpperCase()}</button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ──── Card 2: ReconAI ──── */}
                    <div className="product-card accent-purple">
                        <div className="product-card-header">
                            <div className="product-card-icon purple">
                                <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
                                    <circle cx="16" cy="16" r="8" stroke="#e0d4ff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6"/>
                                    <circle cx="16" cy="16" r="4" stroke="#e0d4ff" strokeWidth="1.5"/>
                                    <circle cx="16" cy="16" r="1.5" fill="#e0d4ff"/>
                                </svg>
                            </div>
                            <div>
                                <div className="product-card-title">RECON<span style={{ color: '#7c6bf8' }}>AI</span></div>
                                <div className="product-card-subtitle">Your AI front office</div>
                            </div>
                        </div>
                        <div className="product-card-body">
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '1rem', lineHeight: 1.6 }}>
                                War room intelligence for trades, waivers, and roster strategy. AI-powered analysis tuned to your exact league and scoring.
                            </div>

                            {!sleeperUsername ? (
                                <div style={{ padding: '1rem 0', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--silver)', marginBottom: '12px' }}>Connect your Sleeper account to unlock ReconAI</div>
                                    <a href={RECONAI_BASE} target="_blank" rel="noopener noreferrer" className="hub-cta ghost-purple" style={{ textDecoration: 'none' }}>Open ReconAI Directly</a>
                                </div>
                            ) : (
                                <>
                                    <LeagueSelector onSelect={(league) => {
                                        setReconLeagueId(league.id);
                                        WrStorage.set(WR_KEYS.LAST_LEAGUE_ID, league.id);
                                        WrStorage.set(WR_KEYS.LAST_LEAGUE_NAME, league.name);
                                    }} accent="purple" />
                                    <a href={reconUrl(reconLeagueId || lastLeagueId)} target="_blank" rel="noopener noreferrer" className="hub-cta purple" style={{ textDecoration: 'none' }}>ENTER RECONAI</a>
                                    {resumeLeague && (
                                        <div className="hub-cta-row">
                                            <a href={reconUrl(lastLeagueId)} target="_blank" rel="noopener noreferrer" className="hub-cta ghost-purple" style={{ textDecoration: 'none' }}>Open {lastLeagueName}</a>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                </div>

                {/* ── Notes from the Front — Field Log feed ── */}
                <div style={{ padding: '0 12px' }}>
                    <FieldLogPanel
                        leagues={sleeperLeagues}
                        onOpenLeague={handleSelectLeague}
                    />
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
