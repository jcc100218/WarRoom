// ══════════════════════════════════════════════════════════════════
// settings.js — SettingsModal component
// ══════════════════════════════════════════════════════════════════

    // ── Sub-components (hooks require stable component boundaries) ──

    function AlexTab({ sectionStyle, sectionTitle }) {
        const styles = window.ALEX_STYLES || { default: { name: 'Default', tone: 'Confident but not arrogant. Direct, data-driven, with personality.' }, general: { name: 'The General', tone: 'Intense, demanding, motivational. Short powerful sentences.' }, enthusiast: { name: 'The Enthusiast', tone: 'Excitable, passionate, full of energy. Uses vivid football jargon.' }, bayou: { name: 'The Bayou', tone: 'Folksy, raw, passionate. Southern warmth and earthiness.' }, wit: { name: 'The Wit', tone: 'Sarcastic, confident, clever. Sharp tongue and sharper mind.' }, closer: { name: 'The Closer', tone: 'Direct, emphatic, no-nonsense. Every sentence is declarative.' }, strategist: { name: 'The Strategist', tone: 'Calculated, competitive, analytical. Cold precision.' } };
        const [currentStyle, setCurrentStyleLocal] = React.useState(localStorage.getItem('wr_alex_style') || 'default');
        const [currentAvatar, setCurrentAvatar] = React.useState(localStorage.getItem('wr_alex_avatar') || 'brain');
        return (<>
        <div style={sectionStyle}>
            <div style={sectionTitle}>COMMUNICATION STYLE</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '0.75rem' }}>Choose how Alex communicates. This affects all AI responses — briefings, chat, trade analysis, draft scouting.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(styles).map(([key, style]) => (
                    <button key={key} onClick={() => { localStorage.setItem('wr_alex_style', key); setCurrentStyleLocal(key); }}
                        style={{
                            padding: '12px 14px', textAlign: 'left',
                            background: currentStyle === key ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                            border: currentStyle === key ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: currentStyle === key ? 'var(--gold)' : 'var(--white)', marginBottom: '3px' }}>
                            {style.name} {currentStyle === key && '\u2713'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)', lineHeight: 1.4 }}>
                            {style.tone.substring(0, 120)}{style.tone.length > 120 ? '...' : ''}
                        </div>
                    </button>
                ))}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.5, marginTop: '8px' }}>Changes take effect on next page load.</div>
        </div>
        <div style={sectionStyle}>
            <div style={sectionTitle}>AVATAR</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '0.75rem' }}>Choose Alex's look. Displayed in briefings and chat.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[
                    { key: 'brain', emoji: '\u{1F9E0}', label: 'The Analyst' },
                    { key: 'target', emoji: '\u{1F3AF}', label: 'The Scout' },
                    { key: 'chart', emoji: '\u{1F4CA}', label: 'The Strategist' },
                    { key: 'football', emoji: '\u{1F3C8}', label: 'The Coach' },
                    { key: 'bolt', emoji: '\u26A1', label: 'The Spark' },
                    { key: 'fire', emoji: '\u{1F525}', label: 'The Motivator' },
                    { key: 'medal', emoji: '\u{1F396}\uFE0F', label: 'The General' },
                    { key: 'trophy', emoji: '\u{1F3C6}', label: 'The Winner' },
                ].map(av => {
                    const isActive = currentAvatar === av.key;
                    return <button key={av.key} onClick={() => { localStorage.setItem('wr_alex_avatar', av.key); setCurrentAvatar(av.key); }}
                        style={{
                            padding: '12px 8px', textAlign: 'center',
                            background: isActive ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                            border: isActive ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px', cursor: 'pointer',
                        }}>
                        <div style={{ fontSize: '1.6rem', marginBottom: '4px' }}>{av.emoji}</div>
                        <div style={{ fontSize: '0.68rem', color: isActive ? 'var(--gold)' : 'var(--silver)' }}>{av.label}</div>
                    </button>;
                })}
            </div>
        </div>
        </>);
    }

    function CommissionerTab({ sectionStyle, sectionTitle }) {
        const leagueId = (window.S || {}).currentLeagueId || '';
        const [docs, setDocs] = React.useState([]);
        const [uploading, setUploading] = React.useState(false);
        const [uploadMsg, setUploadMsg] = React.useState('');

        React.useEffect(() => {
            if (window.OD?.listLeagueDocs && leagueId) {
                window.OD.listLeagueDocs(leagueId).then(d => setDocs(d || []));
            }
        }, [leagueId]);

        const handleFileUpload = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true); setUploadMsg('');
            try {
                const text = await file.text();
                if (!text.trim()) { setUploadMsg('File is empty.'); setUploading(false); return; }
                const name = file.name.toLowerCase();
                const category = name.includes('bylaw') ? 'bylaws' : name.includes('award') ? 'awards' : name.includes('calendar') || name.includes('schedule') ? 'calendar' : name.includes('scor') ? 'scoring' : 'general';
                const ok = await window.OD.uploadLeagueDoc(leagueId, file.name, text, category);
                if (ok) {
                    setUploadMsg('Uploaded! Alex will now reference this document.');
                    const updated = await window.OD.listLeagueDocs(leagueId);
                    setDocs(updated || []);
                    const ctx = await window.OD.getLeagueDocsContext(leagueId);
                    if (ctx) window._leagueDocsContext = ctx;
                } else { setUploadMsg('Upload failed. Check your connection.'); }
            } catch (err) { setUploadMsg('Error: ' + (err.message || 'Unknown')); }
            setUploading(false);
        };

        const handleDelete = async (docName) => {
            if (!confirm('Delete "' + docName + '"? Alex will no longer reference it.')) return;
            await window.OD?.deleteLeagueDoc(leagueId, docName);
            const updated = await window.OD?.listLeagueDocs(leagueId);
            setDocs(updated || []);
            const ctx = await window.OD?.getLeagueDocsContext(leagueId);
            window._leagueDocsContext = ctx || '';
        };

        return (<>
        <div style={sectionStyle}>
            <div style={sectionTitle}>LEAGUE DOCUMENTS</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                Upload your league bylaws, awards history, custom rules, or any league-specific documents. Alex will use these to answer league questions and reference your league's customs.
            </div>
            {!leagueId ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.5 }}>Connect a league first to upload documents.</div>
            ) : (<>
                <div style={{ marginBottom: '12px' }}>
                    <label style={{
                        display: 'block', padding: '14px', textAlign: 'center',
                        background: 'rgba(212,175,55,0.06)', border: '2px dashed rgba(212,175,55,0.25)',
                        borderRadius: '10px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--gold)', fontWeight: 600,
                    }}>
                        {uploading ? 'Uploading...' : '+ Upload Document (.txt, .md, .csv)'}
                        <input type="file" accept=".txt,.md,.csv,.text" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    {uploadMsg && <div style={{ fontSize: '0.72rem', color: uploadMsg.includes('fail') || uploadMsg.includes('Error') ? '#f87171' : '#34d399', marginTop: '6px' }}>{uploadMsg}</div>}
                </div>
                {docs.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>UPLOADED ({docs.length})</div>
                        {docs.map((d, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--white)', flex: 1 }}>{d.name}</span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--gold)', padding: '1px 6px', borderRadius: '6px', background: 'rgba(212,175,55,0.1)' }}>{d.category}</span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--silver)' }}>{new Date(d.uploadedAt).toLocaleDateString()}</span>
                                <button onClick={() => handleDelete(d.name)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 6px' }}>Delete</button>
                            </div>
                        ))}
                    </div>
                )}
            </>)}
        </div>
        </>);
    }

    function SettingsModal({ onClose, initDisplayName, onDisplayNameSave, leagueMates }) {
        const [settingsTab, setSettingsTab] = React.useState('account');
        const [pwMsg, setPwMsg] = React.useState('');
        const [currentPw, setCurrentPw] = React.useState('');
        const [newPw, setNewPw] = React.useState('');
        const [confirmPw, setConfirmPw] = React.useState('');
        const [displayName, setDisplayName] = React.useState(initDisplayName || '');
        const [matesAccess, setMatesAccess] = React.useState(null); // Set of usernames with accounts
        const [giftLinks, setGiftLinks] = React.useState({}); // { username: { url, password } }
        const [giftingFor, setGiftingFor] = React.useState(null);

        const isGiftedAccount = React.useMemo(() => {
            try {
                const auth = JSON.parse(localStorage.getItem('od_auth_v1') || '{}');
                return !!auth.isGifted;
            } catch { return false; }
        }, []);

        const currentTier = React.useMemo(() => {
            try {
                const p = JSON.parse(localStorage.getItem('od_profile_v1') || '{}');
                return p.tier || 'free';
            } catch { return 'free'; }
        }, []);

        const tierLabel = { free: 'War Room Free', pro: 'Dynasty HQ Pro', power: 'Dynasty HQ Power' };
        const tierColor = { free: 'var(--silver)', pro: 'var(--gold)', power: '#A855F7' };
        const tierBg    = { free: 'rgba(192,192,192,0.12)', pro: 'rgba(212,175,55,0.12)', power: 'rgba(168,85,247,0.12)' };

        function goToManagePlan() {
            window.location.href = 'onboarding.html?manage=true';
        }

        function handleCancelPlan() {
            if (!confirm('Cancel your subscription? You will be moved to the War Room Free plan.')) return;
            try {
                const profile = JSON.parse(localStorage.getItem('od_profile_v1') || '{}');
                localStorage.setItem('od_profile_v1', JSON.stringify({ ...profile, tier: 'free' }));
                alert('Subscription cancelled. You are now on the War Room Free plan.');
                onClose();
            } catch { alert('Failed to cancel. Please try again.'); }
        }

        function handleDisplayNameSave() {
            onDisplayNameSave(displayName);
        }

        async function handleChangePassword() {
            setPwMsg('');
            if (!currentPw || !newPw || !confirmPw) { setPwMsg('x Fill in all fields'); return; }
            if (newPw !== confirmPw) { setPwMsg('x New passwords do not match'); return; }
            if (newPw.length < 6) { setPwMsg('x Password must be at least 6 characters'); return; }
            try {
                // Verify current password against stored hash
                const AUTH_KEY = 'od_auth_v1';
                const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
                const encoder = new TextEncoder();
                const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(currentPw));
                const currentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');

                if (auth.passwordHash && auth.passwordHash !== currentHash) {
                    // Also try Supabase in case this is a gifted account
                    const result = await window.OD.verifySupabasePassword(sleeperUsername, currentPw);
                    if (!result || !result.match) {
                        setPwMsg('x Current password is incorrect');
                        return;
                    }
                }
                // Update Supabase
                await window.OD.updatePassword(sleeperUsername, newPw);
                // Update localStorage
                const newHashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(newPw));
                const newHash = Array.from(new Uint8Array(newHashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
                localStorage.setItem(AUTH_KEY, JSON.stringify({ ...auth, passwordHash: newHash, isGifted: false }));
                setCurrentPw(''); setNewPw(''); setConfirmPw('');
                setPwMsg('ok Password updated');
            } catch (e) {
                setPwMsg('x Failed to update password');
            }
        }

        // Load leaguemate access status when modal opens
        React.useEffect(() => {
            if (!leagueMates || leagueMates.length === 0) return;
            const usernames = leagueMates.map(m => m.username).filter(Boolean);
            window.OD.checkUsersAccess(usernames).then(setMatesAccess).catch(() => setMatesAccess(new Set()));
        }, []);

        async function handleGiftAccess(mate) {
            const username = mate.username;
            if (!username) return;
            setGiftingFor(username);
            try {
                // Generate a random 8-char initial password
                const pw = Array.from(crypto.getRandomValues(new Uint8Array(4)))
                    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
                await window.OD.createGiftUser({
                    sleeperUsername: username,
                    password: pw,
                    displayName: mate.display_name || null,
                });
                const base = window.location.href.replace(/\/[^/]*$/, '/');
                const url = `${base}login.html?for=${encodeURIComponent(username)}`;
                setGiftLinks(prev => ({ ...prev, [username]: { url, password: pw } }));
                setMatesAccess(prev => new Set([...(prev || []), username]));
            } catch (e) {
                console.error('Gift failed:', e);
            }
            setGiftingFor(null);
        }

        const sectionStyle = { marginBottom: '1.25rem', padding: '1rem', background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '8px' };
        const sectionTitle = { fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.12em', marginBottom: '0.75rem' };
        const inputStyle = { width: '100%', padding: '0.55rem 0.75rem', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: 'var(--white)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', marginBottom: '0.5rem' };
        const btnPrimary = { flex: 1, padding: '0.6rem', background: 'var(--gold)', border: 'none', borderRadius: '6px', color: 'var(--black)', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' };
        const btnOutline = { flex: 1, padding: '0.6rem', background: 'transparent', border: '1px solid var(--gold)', borderRadius: '6px', color: 'var(--gold)', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' };

        return (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={onClose}>
                <div style={{ background: 'linear-gradient(135deg, var(--off-black) 0%, var(--charcoal) 100%)', border: '3px solid var(--gold)', borderRadius: '12px', padding: '1.5rem', maxWidth: '440px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.8)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                    <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.5rem', color: 'var(--gold)', marginBottom: '0.75rem', textAlign: 'center', letterSpacing: '0.1em' }}>SETTINGS</h2>

                    <div style={{ fontSize: '0.85rem', color: 'var(--silver)', marginBottom: '1rem' }}>
                        Logged in as: <strong style={{ color: 'var(--white)' }}>{sleeperUsername}</strong>
                        {isGiftedAccount && <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--gold)', background: 'rgba(212,175,55,0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>GIFTED — change your password below</span>}
                    </div>

                    {/* Tab bar */}
                    <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '2px solid rgba(212,175,55,0.2)' }}>
                        {[
                            { id: 'account', label: 'Account' },
                            { id: 'alex', label: 'Alex' },
                            { id: 'display', label: 'Display' },
                            { id: 'commissioner', label: 'Commish' },
                            { id: 'subscription', label: 'Plan' },
                            { id: 'data', label: 'Data' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setSettingsTab(tab.id)} style={{
                                flex: 1, padding: '0.6rem 0.5rem', border: 'none',
                                background: settingsTab === tab.id ? 'rgba(212,175,55,0.1)' : 'transparent',
                                borderBottom: settingsTab === tab.id ? '2px solid var(--gold)' : '2px solid transparent',
                                marginBottom: '-2px',
                                color: settingsTab === tab.id ? 'var(--gold)' : 'var(--silver)',
                                fontFamily: 'Inter, sans-serif', fontSize: '0.82rem',
                                fontWeight: settingsTab === tab.id ? 700 : 400,
                                letterSpacing: '0.05em', textTransform: 'uppercase',
                                cursor: 'pointer', transition: 'all 0.15s'
                            }}>{tab.label}</button>
                        ))}
                    </div>

                    {/* ══ ACCOUNT TAB ══ */}
                    {settingsTab === 'account' && (<>
                    {/* ── DISPLAY NAME ── */}
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>DISPLAY NAME</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '0.5rem' }}>Custom name (optional)</div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                                placeholder={sleeperUsername}
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                            />
                            <button onClick={handleDisplayNameSave} style={{ ...btnPrimary, flex: 'none', padding: '0.55rem 0.85rem' }}>Save</button>
                        </div>
                    </div>

                    {/* ── CHANGE PASSWORD ── */}
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>CHANGE PASSWORD</div>
                        <input style={inputStyle} type="password" placeholder="Current password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                        <input style={inputStyle} type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} />
                        <input style={{ ...inputStyle, marginBottom: '0.75rem' }} type="password" placeholder="Confirm new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                        <button onClick={handleChangePassword} style={{ ...btnPrimary, width: '100%', flex: 'none' }}>Update Password</button>
                        {pwMsg && <div style={{ marginTop: '0.5rem', fontSize: '0.73rem', color: pwMsg.startsWith('ok') ? 'var(--win-green)' : '#E74C3C' }}>{pwMsg}</div>}
                    </div>

                    {/* ── LEAGUEMATES ACCESS ── */}
                    {leagueMates && leagueMates.length > 0 && (
                        <div style={sectionStyle}>
                            <div style={sectionTitle}>LEAGUEMATE ACCESS</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)', marginBottom: '0.75rem' }}>
                                Share the dashboard with your league. Each leaguemate gets their own login with full access to all features including AI Scout.
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                                {leagueMates.map(mate => {
                                    const username = mate.username;
                                    if (!username) return null;
                                    const hasAccess = matesAccess?.has(username);
                                    const link = giftLinks[username];
                                    const isGifting = giftingFor === username;
                                    return (
                                        <div key={username} style={{ padding: '0.5rem 0.6rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: `1px solid ${hasAccess ? 'rgba(46,204,113,0.3)' : 'rgba(212,175,55,0.15)'}` }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: link ? '0.4rem' : 0 }}>
                                                {mate.avatar
                                                    ? <div style={{ width: 24, height: 24, flexShrink: 0 }}><img src={`https://sleepercdn.com/avatars/thumbs/${mate.avatar}`} style={{ width: 24, height: 24, borderRadius: '50%' }} onError={e => { e.target.style.display='none'; }} /></div>
                                                    : <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(212,175,55,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.76rem', fontWeight:700, flexShrink: 0 }}>{(mate.display_name || username || '?')[0].toUpperCase()}</div>
                                                }
                                                <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {mate.display_name || username}
                                                </span>
                                                {matesAccess === null
                                                    ? <span style={{ fontSize: '0.76rem', color: 'var(--silver)' }}>checking…</span>
                                                    : hasAccess
                                                        ? <span style={{ fontSize: '0.76rem', color: 'var(--win-green)', fontWeight: 700 }}>ok Has access</span>
                                                        : <button onClick={() => handleGiftAccess(mate)} disabled={isGifting} style={{ padding: '0.2rem 0.55rem', background: 'var(--gold)', border: 'none', borderRadius: '4px', color: 'var(--black)', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                                            {isGifting ? '…' : 'Generate Link'}
                                                        </button>
                                                }
                                            </div>
                                            {link && (
                                                <div style={{ fontSize: '0.76rem', color: 'var(--silver)', wordBreak: 'break-all', background: 'rgba(0,0,0,0.4)', padding: '0.3rem 0.4rem', borderRadius: '4px' }}>
                                                    <div><strong style={{ color: 'var(--gold)' }}>Link:</strong> {link.url}</div>
                                                    <div><strong style={{ color: 'var(--gold)' }}>Temp password:</strong> {link.password}</div>
                                                    <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: '0.2rem' }}>Share both — they can change password after login</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </>)}

                    {/* ══ ALEX TAB — Coaching Style + Avatar ══ */}
                    {settingsTab === 'alex' && <AlexTab sectionStyle={sectionStyle} sectionTitle={sectionTitle} />}

                    {/* ══ DISPLAY TAB ══ */}
                    {settingsTab === 'display' && (<>
                        <div style={sectionStyle}>
                            <div style={sectionTitle}>DASHBOARD THEME</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--silver)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                                Change the visual style of your dashboard widgets.
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {(window.WrTheme ? window.WrTheme.list() : ['default']).map(themeId => {
                                    const t = window.WrTheme?.themes?.[themeId] || {};
                                    const isActive = (window.WrTheme?.current || 'default') === themeId;
                                    return (
                                        <button key={themeId} onClick={() => {
                                            if (window.WrTheme) window.WrTheme.set(themeId);
                                            // Force re-render by updating a dummy state
                                            setSettingsTab('display');
                                        }} style={{
                                            padding: '16px 14px',
                                            background: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                                            border: isActive ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: t.card?.radius || '8px',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: '0.15s',
                                        }}>
                                            <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>{t.preview || '🎨'}</div>
                                            <div style={{
                                                fontFamily: 'Rajdhani, sans-serif',
                                                fontSize: '0.9rem',
                                                fontWeight: 700,
                                                color: isActive ? 'var(--gold)' : 'var(--white)',
                                                letterSpacing: '0.06em',
                                            }}>{t.name || themeId}</div>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.6, marginTop: '4px' }}>
                                                {themeId === 'default' ? 'Dark mode · gold accent' : themeId === 'light' ? 'Light mode · clean & bright' : 'Custom theme'}
                                            </div>
                                            {isActive && (
                                                <div style={{
                                                    marginTop: '8px',
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    color: 'var(--gold)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.08em',
                                                }}>ACTIVE</div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>)}

                    {/* ══ COMMISSIONER TAB — League Docs ══ */}
                    {settingsTab === 'commissioner' && <CommissionerTab sectionStyle={sectionStyle} sectionTitle={sectionTitle} />}

                    {/* ══ SUBSCRIPTION TAB ══ */}
                    {settingsTab === 'subscription' && (<>
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>CURRENT PLAN</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>Current plan:</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: tierColor[currentTier] || 'var(--silver)', background: tierBg[currentTier] || 'rgba(192,192,192,0.12)', padding: '0.15rem 0.55rem', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {tierLabel[currentTier] || 'War Room Free'}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            <button onClick={goToManagePlan} style={{ ...btnPrimary, fontSize: '0.75rem' }}>Upgrade</button>
                            <button onClick={goToManagePlan} style={{ ...btnOutline, fontSize: '0.75rem' }}>Change Plan</button>
                            <button onClick={goToManagePlan} style={{ ...btnOutline, fontSize: '0.75rem' }}>Gift Sub</button>
                            <button onClick={handleCancelPlan} style={{ ...btnOutline, fontSize: '0.75rem', borderColor: 'rgba(231,76,60,0.35)', color: '#E74C3C' }}>Cancel</button>
                        </div>
                        <div style={{ marginTop: '0.6rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Manage your Dynasty HQ subscription</div>
                    </div>

                    {/* ── AI STATUS ── */}
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>AI STATUS</div>
                        {(() => {
                            const hasServer = typeof hasServerAI === 'function' && hasServerAI();
                            const hasKey = !!(window.S?.apiKey || localStorage.getItem('dynastyhq_gemini_key') || localStorage.getItem('dynastyhq_anthropic_key'));
                            const isActive = hasServer || hasKey;
                            return <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? '#2ECC71' : '#E74C3C' }} />
                                    <span style={{ fontSize: '0.82rem', color: isActive ? '#2ECC71' : '#E74C3C', fontWeight: 700 }}>
                                        {isActive ? 'AI Active' : 'AI Not Connected'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--silver)', lineHeight: 1.6, marginBottom: '10px' }}>
                                    {hasServer ? 'AI is included with your subscription. Chat, scouting, and analysis are powered by Claude and Gemini.'
                                     : hasKey ? 'Using your personal API key. AI chat and scouting are active.'
                                     : 'AI features require a subscription or API key. Subscribe to get AI included, or add your own key below.'}
                                </div>
                                {!hasServer && <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6, marginBottom: '4px' }}>OPTIONAL: Add your own API key (power users)</div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        <select id="wr-ai-provider" defaultValue="gemini" style={{ padding: '6px 10px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: 'var(--silver)', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem' }}>
                                            <option value="gemini">Gemini (Free)</option>
                                            <option value="anthropic">Claude</option>
                                        </select>
                                        <input id="wr-ai-key" type="password" placeholder="Paste API key..." style={{ flex: 1, padding: '6px 10px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: 'var(--white)', fontFamily: 'monospace', fontSize: '0.78rem' }} />
                                        <button onClick={() => {
                                            const prov = document.getElementById('wr-ai-provider')?.value || 'gemini';
                                            const key = document.getElementById('wr-ai-key')?.value?.trim();
                                            if (!key) return;
                                            if (window.S) { window.S.aiProvider = prov; window.S.apiKey = key; }
                                            localStorage.setItem('dynastyhq_' + prov + '_key', key);
                                            localStorage.setItem('dynastyhq_provider', prov);
                                            alert('API key saved. AI is now active.');
                                        }} style={{ ...btnPrimary, flex: 'none', padding: '6px 14px', fontSize: '0.78rem' }}>Save</button>
                                    </div>
                                </div>}
                            </>;
                        })()}
                    </div>
                    </>)}

                    {/* ══ DATA TAB ══ */}
                    {settingsTab === 'data' && (<>
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>CACHE MANAGEMENT</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => {
                                localStorage.removeItem('dhq_leagueintel_v10');
                                Object.keys(localStorage).filter(k => k.startsWith('dhq_hist_')).forEach(k => localStorage.removeItem(k));
                                if (window.App) { window.App.LI = {}; window.App.LI_LOADED = false; }
                                alert('DHQ cache cleared. Reload to rebuild.');
                            }} style={{ padding: '6px 12px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '4px', color: '#E74C3C', cursor: 'pointer' }}>
                                Clear DHQ Cache
                            </button>
                            <button onClick={() => { sessionStorage.clear(); alert('Session cache cleared.'); }}
                                style={{ padding: '6px 12px', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--silver)', cursor: 'pointer' }}>
                                Clear Session Cache
                            </button>
                        </div>
                    </div>

                    {/* ── ABOUT ── */}
                    <div style={sectionStyle}>
                        <div style={sectionTitle}>ABOUT</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.65 }}>
                            Fantasy War Room v2.0 &middot; Powered by DHQ Engine &middot; Part of the Fantasy Wars platform
                        </div>
                    </div>
                    </>)}

                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column', marginTop: '1.5rem' }}>
                        <button onClick={handleLogout} style={{ padding: '0.75rem', background: 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)', border: 'none', borderRadius: '8px', color: 'white', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>
                            Logout
                        </button>
                        <button onClick={onClose} style={{ padding: '0.75rem', background: 'var(--black)', border: '2px solid var(--gold)', borderRadius: '8px', color: 'var(--gold)', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        );
    }
