// ══════════════════════════════════════════════════════════════════
// js/widgets/my-trophies.js — My Trophies Home widget (Phase 9)
//
// Surfaces the user's Trophy Room summary: championship count, playoff
// finishes, runner-ups, all-time record. Click any part to jump to the
// full Trophy Room > Personal view.
//
// Depends on: window.App.LI.championships + ownerHistory helpers on
//             the Trophy Room side. We read from window.App.LI directly
//             so the widget works without TrophyRoomTab being mounted.
// Exposes:    window.MyTrophiesWidget
// ══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    function MyTrophiesWidget({ size, myRoster, setActiveTab }) {
        const mine = React.useMemo(() => {
            const champs = window.App?.LI?.championships || {};
            const myRid = myRoster?.roster_id;
            if (myRid == null) return null;
            let championships = 0;
            let runnerUps = 0;
            const champSeasons = [];
            Object.entries(champs).forEach(([season, c]) => {
                if (c.champion === myRid) { championships += 1; champSeasons.push(season); }
                if (c.runnerUp === myRid) runnerUps += 1;
            });
            const wins = myRoster?.settings?.wins || 0;
            const losses = myRoster?.settings?.losses || 0;
            // Count HOF inductees for this team
            try {
                const leagueId = window.S?.leagues?.[0]?.league_id || window.S?.leagues?.[0]?.id;
                const hof = JSON.parse(localStorage.getItem('wr_hof_' + leagueId) || '[]');
                const teamHof = hof.filter(h => h.scope === 'team' && h.teamRosterId === myRid).length;
                return { championships, runnerUps, champSeasons, wins, losses, teamHof };
            } catch (e) {
                return { championships, runnerUps, champSeasons, wins, losses, teamHof: 0 };
            }
        }, [myRoster]);

        const jump = () => { if (setActiveTab) setActiveTab('trophies'); };

        const base = {
            background: 'var(--off-black)',
            border: '1px solid rgba(212,175,55,0.15)',
            borderRadius: '10px', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: '6px',
            height: '100%', minHeight: 0, cursor: 'pointer',
        };

        if (!mine) {
            return React.createElement('div', { style: { ...base, alignItems: 'center', justifyContent: 'center' }, onClick: jump },
                React.createElement('div', { style: { fontSize: '0.8rem', color: 'var(--silver)', opacity: 0.6 } }, 'Trophy Room — tap to open')
            );
        }

        const record = mine.wins + '-' + mine.losses;

        if (size === 'sm') {
            return React.createElement('div', { style: { ...base, textAlign: 'center', justifyContent: 'center' }, onClick: jump },
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.65 } }, 'Titles'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.7rem', fontWeight: 700, color: mine.championships > 0 ? 'var(--gold)' : 'var(--silver)' } },
                    mine.championships > 0 ? (String(mine.championships) + '🏆') : '0'),
                React.createElement('div', { style: { fontSize: '0.62rem', color: 'var(--silver)', opacity: 0.55 } }, record)
            );
        }

        // md / lg / tall / xxl — show stat grid + champ seasons
        const showSeasons = (size === 'lg' || size === 'tall' || size === 'xxl') && mine.champSeasons.length > 0;
        return React.createElement('div', { style: base, onClick: jump },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '1rem' } }, '🏆'),
                React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.04em', flex: 1 } }, 'My Trophies'),
                React.createElement('span', { style: { fontSize: '0.62rem', color: 'var(--gold)', opacity: 0.7 } }, 'open →')
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' } },
                [
                    { label: 'Titles', val: mine.championships, col: mine.championships > 0 ? 'var(--gold)' : 'var(--silver)' },
                    { label: 'Runner-Up', val: mine.runnerUps, col: mine.runnerUps > 0 ? '#C0C0C0' : 'var(--silver)' },
                    { label: 'HOF', val: mine.teamHof, col: mine.teamHof > 0 ? '#2ECC71' : 'var(--silver)' },
                ].map(s => React.createElement('div', { key: s.label, style: { background: 'var(--black)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px', textAlign: 'center' } },
                    React.createElement('div', { style: { fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: s.col } }, s.val),
                    React.createElement('div', { style: { fontSize: '0.56rem', color: 'var(--silver)', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' } }, s.label)
                ))
            ),
            React.createElement('div', { style: { fontSize: '0.68rem', color: 'var(--silver)', opacity: 0.7 } }, 'All-time record · ' + record),
            showSeasons && React.createElement('div', { style: { fontSize: '0.66rem', color: 'var(--gold)', opacity: 0.85 } }, '👑 ' + mine.champSeasons.join(' · '))
        );
    }

    window.MyTrophiesWidget = MyTrophiesWidget;
})();
