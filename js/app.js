// ══════════════════════════════════════════════════════════════════
// app.js — OwnerDashboard (root component) + ReactDOM.render
// Must load LAST — depends on all other modules.
// ══════════════════════════════════════════════════════════════════
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
        const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('wr_onboarded_v1'));
        // Display name state
        const [customDisplayName, setCustomDisplayName] = useState(() => {
            return localStorage.getItem('od_display_name') || '';
        });

        // Cloud sync — load from Supabase on mount
        useEffect(() => {
            if (window.OD?.loadDisplayName) {
                window.OD.loadDisplayName().then(name => {
                    if (name) { setCustomDisplayName(name); localStorage.setItem('od_display_name', name); }
                }).catch(() => {});
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

        // Show league detail if selected
        if (selectedLeague) {
            return <>
                <LeagueDetail
                    league={selectedLeague}
                    onBack={() => setSelectedLeague(null)}
                    sleeperUserId={sleeperUser?.user_id}
                    onOpenSettings={() => setShowSettings(true)}
                />
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

        return (
            <div className="app-container">
                {/* Onboarding overlay */}
                {showOnboarding && (
                    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', overflowY:'auto' }}>
                        <div style={{ background:'linear-gradient(135deg, var(--off-black), var(--charcoal))', border:'2px solid var(--gold)', borderRadius:'16px', padding:'32px', maxWidth:'540px', width:'100%' }}>
                            {/* Header */}
                            <div style={{ textAlign:'center', marginBottom:'20px' }}>
                                <div style={{ fontFamily:'Bebas Neue', fontSize:'2rem', color:'var(--gold)', letterSpacing:'0.08em', marginBottom:'4px' }}>WELCOME TO YOUR WAR ROOM</div>
                                <div style={{ fontSize:'0.88rem', color:'var(--silver)', lineHeight:1.6 }}>Here's what matters right now — and what to do next.</div>
                            </div>

                            {/* Team status (if data available) */}
                            {sleeperLeagues.length > 0 && (() => {
                                const lastId = localStorage.getItem('wr_last_league_id');
                                const lastName = localStorage.getItem('wr_last_league_name');
                                if (!lastName) return null;
                                return <div style={{ background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:'10px', padding:'14px 16px', marginBottom:'16px', textAlign:'center' }}>
                                    <div style={{ fontSize:'0.78rem', color:'var(--gold)', fontFamily:'Oswald', textTransform:'uppercase', marginBottom:'4px' }}>YOUR LEAGUE</div>
                                    <div style={{ fontSize:'1rem', color:'var(--white)', fontWeight:700 }}>{lastName}</div>
                                </div>;
                            })()}

                            {/* Quick paths — action-oriented, not feature descriptions */}
                            <div style={{ marginBottom:'20px' }}>
                                <div style={{ fontSize:'0.78rem', color:'var(--gold)', fontFamily:'Oswald', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'10px' }}>YOUR FIRST MOVES</div>
                                {[
                                    { label: 'Diagnose your team', desc: 'See strengths, weaknesses, and what to fix first', action: 'analytics' },
                                    { label: 'Scout your league', desc: 'Map every roster, find trade targets', action: 'league' },
                                    { label: 'Find trade partners', desc: 'Who needs what you have — and vice versa', action: 'trades' },
                                    { label: 'Plan your draft', desc: 'Build your board, know your picks', action: 'draft' },
                                    { label: 'Set waiver strategy', desc: 'Best adds this week with bid confidence', action: 'fa' },
                                ].map((path, i) => (
                                    <div key={i} onClick={() => { setShowOnboarding(false); localStorage.setItem('wr_onboarded_v1', '1'); if (sleeperLeagues.length === 1) setSelectedLeague(sleeperLeagues[0]); }} style={{ display:'flex', gap:'12px', padding:'10px 12px', borderRadius:'8px', cursor:'pointer', transition:'background 0.12s', borderBottom:'1px solid rgba(255,255,255,0.04)' }} onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,55,0.06)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                        <div style={{ fontFamily:'Bebas Neue', fontSize:'1.2rem', color:'var(--gold)', minWidth:'22px', textAlign:'center' }}>{i+1}</div>
                                        <div>
                                            <div style={{ fontSize:'0.88rem', color:'var(--white)', fontWeight:600 }}>{path.label}</div>
                                            <div style={{ fontSize:'0.76rem', color:'var(--silver)', opacity:0.6 }}>{path.desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Primary CTA */}
                            <button onClick={() => { setShowOnboarding(false); localStorage.setItem('wr_onboarded_v1', '1'); }} style={{ width:'100%', padding:'12px', background:'var(--gold)', color:'var(--black)', border:'none', borderRadius:'8px', fontFamily:'Bebas Neue', fontSize:'1.2rem', letterSpacing:'0.06em', cursor:'pointer', marginBottom:'8px' }}>
                                START WITH TEAM DIAGNOSIS
                            </button>
                            <div style={{ textAlign:'center', fontSize:'0.76rem', color:'var(--silver)', opacity:0.4 }}>You can always access all modules from the sidebar</div>
                        </div>
                    </div>
                )}
                <header className="header">
                    <div className="header-title">FANTASY FOOTBALL WAR ROOM</div>
                    <h1 className="owner-name">
                        <img src="icon-192.png" alt="OD Logo" className="owner-logo-small" />
                        {sleeperUser
                            ? (customDisplayName || sleeperUser.display_name || sleeperUser.username || sleeperUsername).toUpperCase() + ' FOOTBALL CLUB'
                            : sleeperUsername
                                ? 'LOADING...'
                                : (customDisplayName || newSession?.user?.displayName || newSession?.user?.email?.split('@')[0] || 'COMMANDER').toUpperCase() + ' FOOTBALL CLUB'}
                        <img src="icon-192.png" alt="OD Logo" className="owner-logo-small" />
                    </h1>
                    <div className="quote">
                        "If you're not first, you're last"
                        <div className="quote-author">— Ricky Bobby</div>
                    </div>
                    <svg 
                        className="settings-icon" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        onClick={() => setShowSettings(true)}
                        style={{ cursor: 'pointer' }}
                    >
                        <circle cx="12" cy="12" r="3" stroke="var(--gold)"/>
                        <path d="M12 1v6m0 6v6m-5.2-7.8l-4.3-4.2m12.9 0l4.3 4.2M1 12h6m6 0h6m-7.8 5.2l-4.2 4.3m0-12.9l4.2 4.3" stroke="var(--gold)"/>
                    </svg>
                </header>

                <div className="main-layout">
                    {/* Leagues */}
                    <div className="center-column">
                        <div className="league-window">
                            <div className="league-window-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ flexShrink: 0 }}>SLEEPER LEAGUES</div>
                                <select
                                    value={selectedYear}
                                    onChange={e => setSelectedYear(e.target.value)}
                                    style={{
                                        background: 'var(--charcoal)',
                                        border: '1px solid rgba(212,175,55,0.4)',
                                        borderRadius: '4px',
                                        color: 'var(--white)',
                                        fontFamily: 'Oswald, sans-serif',
                                        fontWeight: '700',
                                        fontSize: '0.72rem',
                                        padding: '0.18rem 0.45rem',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        flexShrink: 0,
                                    }}
                                >
                                    {AVAILABLE_YEARS.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="league-window-scroll">
                                {/* Command Center Summary */}
                                {(() => {
                                    const lastLeagueId = localStorage.getItem('wr_last_league_id');
                                    const lastLeagueName = localStorage.getItem('wr_last_league_name');
                                    if (lastLeagueId && lastLeagueName && !loading) {
                                        const resumeLeague = sleeperLeagues.find(l => l.id === lastLeagueId);
                                        return (
                                            <div style={{ margin: '8px', padding: '12px', background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(212,175,55,0.02))', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px' }}>
                                                <div style={{ fontFamily: 'Bebas Neue, cursive', fontSize: '0.82rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '8px' }}>COMMAND CENTER</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '10px' }}>Last session: <strong style={{ color: 'var(--white)' }}>{lastLeagueName}</strong></div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {resumeLeague && (
                                                        <button onClick={() => { setActiveLeagueId(resumeLeague.id); setSelectedLeague(resumeLeague); }}
                                                            style={{ padding: '5px 12px', fontSize: '0.72rem', fontFamily: 'Oswald, sans-serif', fontWeight: 700, background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '5px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                                                            Resume League
                                                        </button>
                                                    )}
                                                    {resumeLeague && (
                                                        <button onClick={() => { setActiveLeagueId(resumeLeague.id); setSelectedLeague(resumeLeague); }}
                                                            style={{ padding: '5px 12px', fontSize: '0.72rem', fontFamily: 'Oswald, sans-serif', fontWeight: 600, background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '5px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                                                            View Alerts
                                                        </button>
                                                    )}
                                                    {resumeLeague && (
                                                        <button onClick={() => { setActiveLeagueId(resumeLeague.id); setSelectedLeague(resumeLeague); }}
                                                            style={{ padding: '5px 12px', fontSize: '0.72rem', fontFamily: 'Oswald, sans-serif', fontWeight: 600, background: 'transparent', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '5px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                                                            Open Draft Room
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                                {!sleeperUsername ? (
                                    <div style={{ padding: '2rem', maxWidth: '420px', margin: '0 auto' }}>
                                        {/* Activation card */}
                                        <div style={{ background: 'linear-gradient(135deg, var(--off-black), var(--charcoal))', border: '2px solid rgba(212,175,55,0.4)', borderRadius: '14px', padding: '28px 24px', textAlign: 'center', marginBottom: '16px' }}>
                                            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.6rem', color: 'var(--gold)', letterSpacing: '0.06em', marginBottom: '6px' }}>CONNECT YOUR LEAGUE</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--silver)', lineHeight: 1.6, marginBottom: '20px' }}>
                                                War Room runs on your league data. Connect to unlock dynasty strategy, roster analysis, and league-wide intelligence.
                                            </div>
                                            {/* Primary CTA */}
                                            <div style={{ marginBottom: '16px' }}>
                                                <input id="wr-sleeper-input" placeholder="Enter your Sleeper username" style={{ width: '100%', padding: '12px 16px', background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: 'var(--white)', fontFamily: 'Oswald', fontSize: '0.95rem', marginBottom: '8px', textAlign: 'center' }} onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } } }} />
                                                <button onClick={() => { const v = document.getElementById('wr-sleeper-input')?.value?.trim(); if (v) { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:v})); window.location.reload(); } }} style={{ width: '100%', padding: '12px', background: 'var(--gold)', color: 'var(--black)', border: 'none', borderRadius: '8px', fontFamily: 'Bebas Neue', fontSize: '1.1rem', letterSpacing: '0.05em', cursor: 'pointer' }}>CONNECT SLEEPER ACCOUNT</button>
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: 'var(--silver)', opacity: 0.5 }}>Supports Sleeper dynasty leagues. Enter your Sleeper username above.</div>
                                        </div>
                                        {/* Secondary paths */}
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button onClick={() => { localStorage.setItem('od_auth_v1', JSON.stringify({sleeperUsername:'jcc100218'})); localStorage.setItem('wr_demo_mode', '1'); window.location.reload(); }} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '8px', color: 'var(--gold)', fontFamily: 'Oswald', fontSize: '0.82rem', cursor: 'pointer' }}>Explore Demo League</button>
                                        </div>
                                    </div>
                                ) : loading ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gold)' }}>
                                        Loading leagues...
                                    </div>
                                ) : error ? (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#E74C3C', fontSize: '0.85rem' }}>
                                        {error}
                                    </div>
                                ) : sleeperLeagues.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--silver)', fontSize: '0.85rem' }}>
                                        No leagues found for {selectedYear}
                                    </div>
                                ) : (
                                    sleeperLeagues.map(league => (
                                        <div
                                            key={league.id}
                                            className={`league-item ${activeLeagueId === league.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setActiveLeagueId(league.id);
                                                setSelectedLeague(league);
                                                localStorage.setItem('wr_last_league_id', league.id);
                                                localStorage.setItem('wr_last_league_name', league.name);
                                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                <div className="league-item-name" style={{ flex: 1 }}>
                                                    {league.name}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                    {league.rosters && (
                                                        <span style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6 }}>
                                                            {league.rosters.length} teams
                                                        </span>
                                                    )}
                                                    <div className="league-item-record" style={{ fontWeight: 700, fontSize: '0.78rem' }}>
                                                        {league.wins}-{league.losses}{league.ties > 0 ? `-${league.ties}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ReconAI Launch Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', paddingTop: '8px' }}>
                        <a href="https://jcc100218.github.io/ReconAI/" target="_blank" rel="noopener noreferrer" style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                            padding: '16px 20px', borderRadius: '12px', textDecoration: 'none',
                            background: 'linear-gradient(135deg, rgba(124,107,248,0.15), rgba(124,107,248,0.05))',
                            border: '2px solid rgba(124,107,248,0.3)',
                            transition: 'all 0.2s', cursor: 'pointer'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#7c6bf8'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,107,248,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(124,107,248,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
                        >
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #7c6bf8, #5b4cc4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 16px rgba(124,107,248,0.3)'
                            }}>
                                <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
                                    <circle cx="16" cy="16" r="8" stroke="#e0d4ff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6"/>
                                    <circle cx="16" cy="16" r="4" stroke="#e0d4ff" strokeWidth="1.5"/>
                                    <circle cx="16" cy="16" r="1.5" fill="#e0d4ff"/>
                                </svg>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f0f0f3', letterSpacing: '-0.02em' }}>
                                    Recon<span style={{ color: '#7c6bf8' }}>AI</span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#7d8291', marginTop: '2px' }}>AI Advisor</div>
                            </div>
                        </a>
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
