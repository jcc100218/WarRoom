// ══════════════════════════════════════════════════════════════════
// js/tabs/flash-brief.js — FlashBriefPanel: Two-box layout
// Left: Alex Ingram's intelligence briefing with action buttons
// Right: Field Notes from Scout (placeholder — next week)
// ══════════════════════════════════════════════════════════════════

function FlashBriefPanel({
  myRoster,
  rankedTeams,
  sleeperUserId,
  currentLeague,
  activeYear,
  setActiveTab,
  briefDraftInfo,
  playersData,
  statsData,
  setReconPanelOpen,
  sendReconMessage,
}) {
    function ordinal(n) { const s = ['th','st','nd','rd']; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }

    const BRIEF_PERSONALITY = {
        default: {
            greeting: (t, name) => (t < 12 ? 'Good morning' : t < 17 ? 'Good afternoon' : 'Good evening') + ', ' + name + '.',
            elite: (rank, hs) => "Your roster is elite — top of the food chain right now.",
            contender: (rank, hs) => "Your roster's sitting in solid shape — " + ordinal(rank) + " in the league with a health score of " + hs + ". You're right in the mix.",
            crossroads: (rank, hs) => "You're at a crossroads — ranked " + ordinal(rank) + " with a health score of " + hs + ". Some decisions coming up that'll define your direction.",
            rebuilding: (rank, hs) => "Rebuilding mode — ranked " + ordinal(rank) + ". Health score is " + hs + ". But that's where the opportunity is.",
            waiver: (name, pos, dhq) => "I've been watching the wire — " + name + " is sitting out there unclaimed.",
            trade: (count) => "I've mapped out the owners in your league. A few look ripe for a deal.",
            draft: (days, date) => "Draft is " + days + " day" + (days !== 1 ? 's' : '') + " out. Time to sharpen your board.",
            rank: (rank, tier) => "You're #" + rank + " in the league pecking order right now.",
        },
        general: {
            greeting: (t, name) => name + ". Listen up.",
            elite: (rank, hs) => "Health score " + hs + ". That's dominance. Don't get comfortable — maintain that edge.",
            contender: (rank, hs) => "Ranked " + ordinal(rank) + ". Health score " + hs + ". Solid, but solid doesn't win championships. Push harder.",
            crossroads: (rank, hs) => "Ranked " + ordinal(rank) + ". Health score " + hs + ". You're at a crossroads and I need you to make a decision. Now.",
            rebuilding: (rank, hs) => "Ranked " + ordinal(rank) + ". Health score " + hs + ". We're in rebuild mode. That means discipline, not panic.",
            waiver: (name, pos, dhq) => name + " is available on the wire. Pick him up before your opponents wake up.",
            trade: (count) => "I've profiled every owner in this league. Time to exploit their weaknesses.",
            draft: (days, date) => days + " days until the draft. You better have your board locked in.",
            rank: (rank, tier) => "You're " + ordinal(rank) + ". " + (rank <= 3 ? "Good. Stay hungry." : "Not good enough. Let's fix it."),
        },
        enthusiast: {
            greeting: (t, name) => "Hey! " + (t < 12 ? 'Good morning' : t < 17 ? 'Good afternoon' : 'Good evening') + "! LET'S GO, " + name + "!",
            elite: (rank, hs) => "ELITE! Man, you are COOKING right now! Health score " + hs + " — that's what I'm talking about!",
            contender: (rank, hs) => "Dude, " + ordinal(rank) + " in the league! Health score " + hs + "! You've got JUICE right now, let's keep it rolling!",
            crossroads: (rank, hs) => "Okay okay okay — ranked " + ordinal(rank) + ", health score " + hs + ". We're at a CROSSROADS but that's where the MAGIC happens!",
            rebuilding: (rank, hs) => "Alright, " + ordinal(rank) + " place, health score " + hs + " — REBUILDING BABY! This is where you lay the foundation for something SPECIAL!",
            waiver: (name, pos, dhq) => "OH MAN — " + name + " is just sitting there on the wire! You GOTTA grab this guy!",
            trade: (count) => "I've been studying every owner in this league and I am FIRED UP about some trade targets!",
            draft: (days, date) => "DRAFT IN " + days + " DAYS! Oh man I love this time of year! Let's get your board DIALED IN!",
            rank: (rank, tier) => "You're #" + rank + "! " + (rank <= 3 ? "TOP THREE BABY!" : "Let's CLIMB!"),
        },
        bayou: {
            greeting: (t, name) => "Mornin', cher. How we doin' today, " + name + "?",
            elite: (rank, hs) => "Boy I tell you what, this roster is NASTY good. Health score " + hs + ". Ain't nobody touchin' us right now.",
            contender: (rank, hs) => "We sittin' at " + ordinal(rank) + ", health score " + hs + ". That's a good gumbo right there — just need a little more seasoning.",
            crossroads: (rank, hs) => "We at a crossroads, " + ordinal(rank) + " place, health score " + hs + ". Time to fish or cut bait, ya heard me?",
            rebuilding: (rank, hs) => "Look, we " + ordinal(rank) + " right now. Health score " + hs + ". But down here we know how to build somethin' from nothin'.",
            waiver: (name, pos, dhq) => name + " just fell off somebody's bayou boat and landed right on the wire. Go get 'em.",
            trade: (count) => "I been watchin' these owners real close. Got a few that's ready to make a deal.",
            draft: (days, date) => "Draft's " + days + " days out. Time to set them trotlines and see what we catch.",
            rank: (rank, tier) => "We #" + rank + " in the peckin' order. " + (rank <= 3 ? "Top of the food chain, baby!" : "We comin' for 'em."),
        },
        wit: {
            greeting: (t, name) => (t < 12 ? 'Morning' : t < 17 ? 'Afternoon' : 'Evening') + ", " + name + ". Your opponents didn't get any smarter overnight.",
            elite: (rank, hs) => "Elite tier. Health score " + hs + ". Try not to let it go to your head — though I suppose your leaguemates already have.",
            contender: (rank, hs) => ordinal(rank) + " place, health score " + hs + ". Solid enough to be dangerous, not quite good enough to be cocky about it.",
            crossroads: (rank, hs) => "Ranked " + ordinal(rank) + ", health score " + hs + ". You're at a crossroads — which, historically, is where people make their worst decisions. Let's not do that.",
            rebuilding: (rank, hs) => ordinal(rank) + " place. Health score " + hs + ". Rebuilding. The good news? It's hard to get worse. The bad news? Your leaguemates know it too.",
            waiver: (name, pos, dhq) => name + " is sitting on the waiver wire like a forgotten lunch. Someone's going to eat eventually — might as well be you.",
            trade: (count) => "I've studied every owner in your league. Some of them actually think they're good at this.",
            draft: (days, date) => days + " days to the draft. Plenty of time for your opponents to overthink their boards.",
            rank: (rank, tier) => "#" + rank + " in the league. " + (rank <= 3 ? "Not bad. Almost impressive." : "Room for improvement, as they say diplomatically."),
        },
        closer: {
            greeting: (t, name) => "Let's go to work, " + name + ".",
            elite: (rank, hs) => "Elite. Period. Health score " + hs + ". Now protect it.",
            contender: (rank, hs) => ordinal(rank) + " place. Health score " + hs + ". You play to win the game.",
            crossroads: (rank, hs) => ordinal(rank) + ". Health score " + hs + ". Crossroads. Make a decision and commit. No half-measures.",
            rebuilding: (rank, hs) => ordinal(rank) + ". Health score " + hs + ". Rebuilding. You don't build a house by wishing — you lay bricks. Let's go.",
            waiver: (name, pos, dhq) => name + " is on the wire. Go get him. Done.",
            trade: (count) => "Owners profiled. Weaknesses identified. Time to make moves.",
            draft: (days, date) => days + " days. Draft. Be ready.",
            rank: (rank, tier) => "#" + rank + ". " + (rank <= 3 ? "Keep it." : "Change it."),
        },
        strategist: {
            greeting: (t, name) => (t < 12 ? 'Good morning' : t < 17 ? 'Good afternoon' : 'Good evening') + ", " + name + ". Let's review the board.",
            elite: (rank, hs) => "Health score " + hs + ". Elite positioning. Portfolio is optimized — focus shifts to sustaining competitive advantage.",
            contender: (rank, hs) => "Position: " + ordinal(rank) + ". Health score: " + hs + ". Contender-class roster. Key variable: positional gaps and trade leverage.",
            crossroads: (rank, hs) => "Position: " + ordinal(rank) + ". Health score: " + hs + ". Crossroads classification. Decision matrix: commit to competing or pivot to accumulation.",
            rebuilding: (rank, hs) => "Position: " + ordinal(rank) + ". Health score: " + hs + ". Rebuild phase. Optimal strategy: maximize asset acquisition, minimize win-now spending.",
            waiver: (name, pos, dhq) => "Waiver wire analysis: " + name + " at " + pos + " (DHQ " + dhq.toLocaleString() + ") available. Addresses your positional deficit.",
            trade: (count) => "Owner analysis complete. " + count + " trade scenarios identified with positive expected value.",
            draft: (days, date) => "T-minus " + days + " days to draft. Board calibration recommended.",
            rank: (rank, tier) => "League position: " + ordinal(rank) + ". Classification: " + tier + ".",
        },
    };

    const myAssess = typeof window.assessTeamFromGlobal === 'function' ? window.assessTeamFromGlobal(myRoster?.roster_id) : null;
    const tier = (myAssess?.tier || 'UNKNOWN').toUpperCase();
    const hs = myAssess?.healthScore || 0;
    const needs = myAssess?.needs || [];
    const strengths = myAssess?.strengths || [];
    const elites = typeof window.App?.countElitePlayers === 'function' ? window.App.countElitePlayers(myRoster?.players || []) : 0;
    const myRank = rankedTeams.findIndex(t => t.userId === sleeperUserId) + 1;
    const scores = window.App?.LI?.playerScores || {};
    const ownerProfiles = window.App?.LI?.ownerProfiles || {};

    // FAAB
    const budget = currentLeague?.settings?.waiver_budget || 0;
    const spent = myRoster?.settings?.waiver_budget_used || 0;
    const faabRemaining = Math.max(0, budget - spent);

    // Best waiver target
    const waiverTarget = useMemo(() => {
        if (!needs.length) return null;
        const normPos = window.App?.normPos || (p => p);
        const rostered = new Set();
        (currentLeague?.rosters || []).forEach(r => (r.players || []).concat(r.taxi || [], r.reserve || []).forEach(pid => rostered.add(String(pid))));
        const needPos = typeof needs[0] === 'string' ? needs[0] : needs[0]?.pos;
        if (!needPos) return null;
        // Minimum DHQ 1500 to be worth recommending — below that it's roster filler
        const candidates = Object.entries(playersData || {})
            .filter(([pid, p]) => !rostered.has(pid) && normPos(p.position) === needPos && p.team && p.active !== false && (scores[pid] || 0) >= 1500)
            .map(([pid, p]) => ({ pid, name: p.full_name || '', dhq: scores[pid] || 0, pos: needPos, team: p.team }))
            .sort((a, b) => b.dhq - a.dhq);
        // If no good target at primary need, try secondary needs
        if (!candidates.length && needs.length > 1) {
            for (let i = 1; i < Math.min(needs.length, 4); i++) {
                const altPos = typeof needs[i] === 'string' ? needs[i] : needs[i]?.pos;
                if (!altPos) continue;
                const alt = Object.entries(playersData || {})
                    .filter(([pid, p]) => !rostered.has(pid) && normPos(p.position) === altPos && p.team && p.active !== false && (scores[pid] || 0) >= 1500)
                    .map(([pid, p]) => ({ pid, name: p.full_name || '', dhq: scores[pid] || 0, pos: altPos, team: p.team }))
                    .sort((a, b) => b.dhq - a.dhq);
                if (alt.length) return alt[0];
            }
        }
        return candidates[0] || null;
    }, [needs, playersData, scores, currentLeague]);

    // Key drops (high-value players dropped in last 3 weeks)
    const keyDrops = useMemo(() => {
        const drops = [];
        const transactions = window.S?.transactions || {};
        const curWeek = window.S?.currentWeek || 1;
        for (let w = curWeek; w >= Math.max(1, curWeek - 2); w--) {
            ((transactions['w' + w]) || []).forEach(t => {
                if (t.type !== 'free_agent' && t.type !== 'waiver') return;
                Object.keys(t.drops || {}).forEach(pid => {
                    const dhq = scores[pid] || 0;
                    if (dhq >= 1500) drops.push({ pid, name: playersData?.[pid]?.full_name || '?', dhq, pos: playersData?.[pid]?.position || '?' });
                });
            });
        }
        return drops.sort((a, b) => b.dhq - a.dhq).slice(0, 3);
    }, [scores, playersData]);

    // Draft countdown
    const draftCountdown = useMemo(() => {
        if (!briefDraftInfo?.start_time || briefDraftInfo.status !== 'pre_draft') return null;
        const diff = briefDraftInfo.start_time - Date.now();
        if (diff <= 0) return null;
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        return { days, hours, date: new Date(briefDraftInfo.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
    }, [briefDraftInfo]);

    // Active traders in league
    const activeTrades = useMemo(() => {
        const txns = window.S?.transactions || {};
        const flat = Array.isArray(txns) ? txns : Object.values(txns).flat();
        return flat.filter(t => t.type === 'trade').length;
    }, []);

    // Field notes from Supabase (with localStorage fallback)
    const [fieldEntries, setFieldEntries] = useState([]);
    useEffect(() => {
        // Try Supabase first, fall back to localStorage
        if (window.OD?.loadFieldLog) {
            window.OD.loadFieldLog(null, 15).then(data => {
                if (data && data.length) { setFieldEntries(data); return; }
                // Fall back to localStorage
                try {
                    const raw = localStorage.getItem('scout_field_log_v1');
                    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setFieldEntries(parsed.slice(0, 15)); }
                } catch {}
            }).catch(() => {
                try {
                    const raw = localStorage.getItem('scout_field_log_v1');
                    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setFieldEntries(parsed.slice(0, 15)); }
                } catch {}
            });
        } else {
            try {
                const raw = localStorage.getItem('scout_field_log_v1');
                if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) setFieldEntries(parsed.slice(0, 15)); }
            } catch {}
        }
    }, []);

    // Greeting based on time of day + personality
    const hour = new Date().getHours();
    const userName = window.S?.user?.display_name || window.S?.user?.username || 'Commander';
    const alexStyle = localStorage.getItem('wr_alex_style') || 'default';
    const p = BRIEF_PERSONALITY[alexStyle] || BRIEF_PERSONALITY.default;
    const greetingText = p.greeting(hour, userName);

    // Build Alex's conversational briefing
    const needPos = needs.length ? (typeof needs[0] === 'string' ? needs[0] : needs[0]?.pos) : '';
    const tierMsg = tier === 'ELITE' ? p.elite(myRank, hs)
        : tier === 'CONTENDER' ? p.contender(myRank, hs)
        : tier === 'CROSSROADS' ? p.crossroads(myRank, hs)
        : p.rebuilding(myRank, hs);

    // Portfolio vs league average
    const portfolioComparison = (() => {
        const myDHQ = (myRoster?.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0);
        const allDHQs = (currentLeague?.rosters || []).map(r => (r.players || []).reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0));
        const avgDHQ = allDHQs.length ? allDHQs.reduce((a, b) => a + b, 0) / allDHQs.length : 0;
        if (avgDHQ > 0) {
            const pct = Math.round((myDHQ - avgDHQ) / avgDHQ * 100);
            return pct > 0 ? `Your portfolio is ${pct}% above league average.` : pct < 0 ? `Your portfolio trails the league average by ${Math.abs(pct)}%.` : '';
        }
        return '';
    })();

    let briefText = tierMsg;
    if (portfolioComparison) briefText += ' ' + portfolioComparison;
    if (elites > 0) briefText += ` You've got ${elites} elite player${elites > 1 ? 's' : ''} anchoring the roster.`;
    if (needPos) briefText += ` Your biggest gap is at ${needPos} — I've been keeping an eye on options for you.`;
    if (activeTrades > 0) briefText += ` ${activeTrades} trade${activeTrades > 1 ? 's have' : ' has'} gone down in the league recently. Worth watching who's moving what.`;
    if (budget > 0) briefText += ` You've got $${faabRemaining} of $${budget} FAAB left to work with.`;

    const alexAvatar = (() => {
        const key = localStorage.getItem('wr_alex_avatar') || 'brain';
        const map = { brain:'\u{1F9E0}', target:'\u{1F3AF}', chart:'\u{1F4CA}', football:'\u{1F3C8}', bolt:'\u26A1', fire:'\u{1F525}', medal:'\u{1F396}\uFE0F', trophy:'\u{1F3C6}' };
        return map[key] || '\u{1F9E0}';
    })();

    const cardStyle = { background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '14px', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' };
    const btnStyle = { padding: '12px 16px', background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '10px', color: 'var(--gold)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 500, textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '10px', transition: 'all 0.15s', lineHeight: 1.5 };

    return React.createElement('div', {
        style: { padding: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: 'calc(100vh - 120px)', alignContent: 'start' },
        className: 'wr-fade-in'
    },
        // ═══ LEFT: ALEX'S BRIEFING ═══
        React.createElement('div', { style: cardStyle },
            // Header
            React.createElement('div', { style: { padding: '20px 20px 0', borderBottom: '1px solid rgba(212,175,55,0.1)', paddingBottom: '12px' } },
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' } }, React.createElement('span', { style: { fontSize: '0.9rem' } }, alexAvatar), 'INTELLIGENCE BRIEFING'),
                React.createElement('div', { style: { fontSize: '1.2rem', fontWeight: 700, color: 'var(--white)' } }, greetingText),
            ),
            // Body
            React.createElement('div', { style: { padding: '16px 20px', flex: 1, overflowY: 'auto' } },
                // Alex's message
                React.createElement('div', { style: { fontSize: '0.85rem', color: 'var(--silver)', lineHeight: 1.75, marginBottom: '20px' } },
                    briefText
                ),
                // Action buttons
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    // Waiver target
                    waiverTarget && React.createElement('button', {
                        onClick: () => setActiveTab('fa'), style: btnStyle,
                        onMouseEnter: e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)',
                        onMouseLeave: e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)',
                    },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '🎯'),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' } }, p.waiver(waiverTarget.name, waiverTarget.pos, waiverTarget.dhq)),
                            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--silver)', marginTop: '2px' } }, `${waiverTarget.pos} · DHQ ${waiverTarget.dhq.toLocaleString()} · Fills your ${waiverTarget.pos} gap perfectly. Worth a look.`),
                        ),
                    ),
                    // Key drops
                    keyDrops.length > 0 && React.createElement('button', {
                        onClick: () => setActiveTab('fa'), style: btnStyle,
                        onMouseEnter: e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)',
                        onMouseLeave: e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)',
                    },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '⚠️'),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' } }, `Heads up — ${keyDrops.length > 1 ? 'some high-value players hit' : 'a high-value player hit'} the wire recently.`),
                            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--silver)', marginTop: '2px' } }, keyDrops.map(d => `${d.name} (${d.pos}, ${d.dhq.toLocaleString()})`).join(', ') + '. Might be worth scooping up before someone else does.'),
                        ),
                    ),
                    // Trade block
                    React.createElement('button', {
                        onClick: () => setActiveTab('trades'), style: btnStyle,
                        onMouseEnter: e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)',
                        onMouseLeave: e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)',
                    },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '🔄'),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' } }, p.trade(Object.keys(ownerProfiles).length)),
                            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--silver)', marginTop: '2px' } }, 'Let me show you who needs what — and what you could get in return.'),
                        ),
                    ),
                    // Draft countdown
                    draftCountdown && React.createElement('button', {
                        onClick: () => setActiveTab('draft'), style: btnStyle,
                        onMouseEnter: e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)',
                        onMouseLeave: e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)',
                    },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '📋'),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' } }, p.draft(draftCountdown.days, draftCountdown.date)),
                            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--silver)', marginTop: '2px' } }, `${draftCountdown.date} · I've got your scouting report ready when you are.`),
                        ),
                    ),
                    // Power ranking
                    React.createElement('button', {
                        onClick: () => setActiveTab('league'), style: btnStyle,
                        onMouseEnter: e => e.currentTarget.style.background = 'rgba(212,175,55,0.15)',
                        onMouseLeave: e => e.currentTarget.style.background = 'rgba(212,175,55,0.08)',
                    },
                        React.createElement('span', { style: { fontSize: '1rem' } }, '🏆'),
                        React.createElement('div', null,
                            React.createElement('div', { style: { fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem' } }, p.rank(myRank, tier)),
                            React.createElement('div', { style: { fontSize: '0.75rem', color: 'var(--silver)', marginTop: '2px' } }, `${tier} tier · See where everyone else stands.`),
                        ),
                    ),
                ),
            ),
        ),

        // ═══ RIGHT: FIELD NOTES ═══
        React.createElement('div', { style: cardStyle },
            React.createElement('div', { style: { padding: '20px 20px 0', borderBottom: '1px solid rgba(212,175,55,0.1)', paddingBottom: '12px' } },
                React.createElement('div', { style: { fontFamily: "'Courier Prime', 'Courier New', monospace", fontSize: '1.2rem', color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px', fontWeight: 700 } }, 'FIELD NOTES'),
                React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', fontFamily: "'Courier Prime', 'Courier New', monospace" } }, 'Intel logged from Scout sessions'),
            ),
            React.createElement('div', { style: { padding: '16px 20px', flex: 1, overflowY: 'auto' } },
                !fieldEntries.length
                    ? React.createElement('div', { style: { textAlign: 'center', padding: '40px 0', color: 'var(--silver)', opacity: 0.5 } },
                        React.createElement('div', { style: { fontSize: '2rem', marginBottom: '8px' } }, '📋'),
                        React.createElement('div', { style: { fontSize: '0.9rem', fontFamily: "'Courier Prime', 'Courier New', monospace", fontWeight: 700 } }, 'No field notes yet.'),
                        React.createElement('div', { style: { fontSize: '0.78rem', marginTop: '6px', lineHeight: 1.5, fontFamily: "'Courier Prime', 'Courier New', monospace" } }, 'Actions from War Room Scout will appear here.'),
                    )
                    : fieldEntries.map((entry, i) => React.createElement('div', {
                        key: entry.id || i,
                        style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: "'Courier Prime', 'Courier New', monospace" }
                    },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' } },
                            React.createElement('span', { style: { fontSize: '0.82rem' } }, entry.icon || '📋'),
                            React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 600 } },
                                new Date(entry.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                                new Date(entry.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                            ),
                            React.createElement('span', { style: {
                                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                                padding: '1px 5px', borderRadius: '3px', marginLeft: 'auto',
                                background: entry.source === 'warroom' ? 'rgba(212,175,55,0.15)' : 'rgba(0,200,180,0.15)',
                                color: entry.source === 'warroom' ? 'var(--gold)' : '#00c8b4',
                            } }, entry.source === 'warroom' ? 'WAR ROOM' : 'SCOUT'),
                        ),
                        React.createElement('div', { style: { fontSize: '0.78rem', color: 'var(--silver)', lineHeight: 1.4 } }, entry.text || ''),
                    ))
            ),
        ),
    );
}
