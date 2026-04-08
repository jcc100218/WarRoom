// ══════════════════════════════════════════════════════════════════
// js/tutorial.js — War Room First-Time Tutorial
// Guides new users through: Alex persona setup → GM strategy →
// app walkthrough (brief, dashboard, trades, roster, league, draft).
// Completion stored in localStorage — only shows once.
// ══════════════════════════════════════════════════════════════════

const WR_TUTORIAL_KEY = 'wr_tutorial_done_v1';

const WR_TUTORIAL_STEPS = [
    {
        title: 'Welcome to War Room',
        desc: 'This is your dynasty command center. Before we dive in, let\'s set up your AI advisor and strategy profile. It\'ll take 30 seconds.',
        position: 'center',
    },
    {
        target: '[data-tab="brief"],.sidebar-item:first-child',
        title: 'Intelligence Briefing',
        desc: 'Your daily brief from Alex — personalized team diagnosis, waiver targets, trade opportunities, and league activity. This is your home base.',
        position: 'right',
    },
    {
        target: '[data-tab="dashboard"],.sidebar-item:nth-child(2)',
        title: 'Dashboard',
        desc: 'Configurable KPI widgets — Hubspot-style. Drag, resize, and arrange your analytics exactly how you want them. Click the pencil icon on any widget to swap it.',
        position: 'right',
    },
    {
        target: '[data-tab="myteam"]',
        title: 'My Roster',
        desc: 'Your full roster with DHQ values, trade verdicts, age curves, and positional depth. Every player is clickable for deep analysis.',
        position: 'right',
    },
    {
        target: '[data-tab="trades"]',
        title: 'Trade Center',
        desc: 'Owner DNA profiles, behavioral trade modeling, deal analyzer, and trade finder. The system understands how each owner in your league actually trades.',
        position: 'right',
    },
    {
        target: '[data-tab="fa"]',
        title: 'Free Agency',
        desc: 'FAAB decision engine with tiered targets, bid recommendations, and waiver wire analysis powered by your league\'s scoring settings.',
        position: 'right',
    },
    {
        target: '[data-tab="draft"]',
        title: 'Draft Command',
        desc: 'Custom big boards, prospect tiers, mock drafts with AI opponents, and live pick tracking. Your full draft war room.',
        position: 'right',
    },
    {
        target: '[data-tab="league"]',
        title: 'League Map',
        desc: 'Every team in your league — competitive tiers, roster composition, trade targets, and franchise scouting reports.',
        position: 'right',
    },
    {
        target: '[data-tab="trophies"]',
        title: 'Trophy Room',
        desc: 'League history, championship timeline, all-time records, and your personal trophy case. Import your commissioner\'s historical data for the full picture.',
        position: 'right',
    },
    {
        title: 'You\'re Ready',
        desc: 'Your War Room is set up. Start with the Intelligence Briefing — Alex has your first report ready. Tap any section in the sidebar to explore.',
        position: 'center',
    },
];

let _wrTutStep = 0;
let _wrTutOverlay = null;

function shouldShowWRTutorial() {
    return !localStorage.getItem(WR_TUTORIAL_KEY);
}

function startWRTutorial() {
    if (!shouldShowWRTutorial()) return;
    _wrTutStep = 0;
    _showWRStep();
}

function _showWRStep() {
    if (_wrTutStep >= WR_TUTORIAL_STEPS.length) {
        _endWRTutorial();
        return;
    }

    const step = WR_TUTORIAL_STEPS[_wrTutStep];
    const target = step.target ? document.querySelector(step.target) : null;

    if (_wrTutOverlay) _wrTutOverlay.remove();

    _wrTutOverlay = document.createElement('div');
    _wrTutOverlay.id = 'wr-tutorial-overlay';
    _wrTutOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;pointer-events:all';

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7)';
    backdrop.onclick = () => _nextWRStep();
    _wrTutOverlay.appendChild(backdrop);

    const tooltip = document.createElement('div');
    tooltip.style.cssText = 'position:absolute;max-width:400px;background:#0a0a0a;border:2px solid rgba(212,175,55,0.5);border-radius:16px;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,.6);z-index:10000;pointer-events:all';

    if (step.position === 'center' || !target) {
        tooltip.style.top = '50%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
    } else {
        const rect = target.getBoundingClientRect();
        tooltip.style.top = Math.max(20, rect.top) + 'px';
        tooltip.style.left = (rect.right + 16) + 'px';
        if (parseInt(tooltip.style.left) > window.innerWidth - 420) {
            tooltip.style.left = 'auto';
            tooltip.style.right = '20px';
        }
        target.style.position = target.style.position || 'relative';
        target.style.zIndex = '10001';
        target.style.outline = '2px solid rgba(212,175,55,0.6)';
        target.style.outlineOffset = '2px';
    }

    tooltip.innerHTML = `
        <div style="font-size:0.65rem;font-weight:700;color:rgba(212,175,55,0.8);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Step ${_wrTutStep + 1} of ${WR_TUTORIAL_STEPS.length}</div>
        <div style="font-size:1.1rem;font-weight:800;color:#fff;margin-bottom:8px;letter-spacing:-.02em">${step.title}</div>
        <div style="font-size:0.85rem;color:rgba(255,255,255,0.7);line-height:1.6;margin-bottom:20px">${step.desc}</div>
        <div style="display:flex;gap:8px;align-items:center">
            <button onclick="window._nextWRStep()" style="flex:1;padding:10px;font-size:0.85rem;font-weight:700;background:linear-gradient(135deg,#D4AF37,#b8941f);color:#000;border:none;border-radius:10px;cursor:pointer;font-family:inherit">${_wrTutStep < WR_TUTORIAL_STEPS.length - 1 ? 'Next' : 'Start Exploring'}</button>
            <button onclick="window._endWRTutorial()" style="padding:10px 14px;font-size:0.82rem;color:rgba(255,255,255,0.5);background:none;border:none;cursor:pointer;font-family:inherit">Skip</button>
        </div>
    `;

    _wrTutOverlay.appendChild(tooltip);
    document.body.appendChild(_wrTutOverlay);
}

function _nextWRStep() {
    const prevStep = WR_TUTORIAL_STEPS[_wrTutStep];
    if (prevStep?.target) {
        const el = document.querySelector(prevStep.target);
        if (el) { el.style.zIndex = ''; el.style.outline = ''; el.style.outlineOffset = ''; }
    }
    _wrTutStep++;
    _showWRStep();
}

function _endWRTutorial() {
    WR_TUTORIAL_STEPS.forEach(step => {
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) { el.style.zIndex = ''; el.style.outline = ''; el.style.outlineOffset = ''; }
        }
    });
    if (_wrTutOverlay) { _wrTutOverlay.remove(); _wrTutOverlay = null; }
    localStorage.setItem(WR_TUTORIAL_KEY, '1');
}

window._nextWRStep = _nextWRStep;
window._endWRTutorial = _endWRTutorial;
window.startWRTutorial = startWRTutorial;
window.shouldShowWRTutorial = shouldShowWRTutorial;
