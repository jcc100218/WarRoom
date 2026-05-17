#!/usr/bin/env node
// War Room regression guardrails for deep links, mobile layout, and dashboard widgets.
// Usage: npm run test:regression
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEAGUE_ID = '1312100327931019264';
const USER = 'bigloco';
const MOBILE_WIDTHS = [390, 430];
const MAIN_TABS = [
  'dashboard',
  'myteam',
  'compare',
  'trades',
  'fa',
  'draft',
  'analytics',
  'alex',
  'trophies',
  'calendar',
];
const ROUTED_TABS = [...MAIN_TABS, 'strategy', 'league'];
const WIDGET_SIZES = ['sm', 'slim', 'narrow', 'md', 'lg', 'tall', 'xl', 'xxl'];

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('.');
  } catch (err) {
    failed++;
    failures.push(`  FAIL: ${name}\n        ${err.message}`);
    process.stdout.write('F');
  }
}

function group(label) {
  process.stdout.write(`\n  ${label}  `);
}

function ok(value, label) {
  if (!value) throw new Error(label || 'expected truthy value');
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label || 'mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function sourceHas(source, needle, label) {
  ok(source.includes(needle), label || `missing source fragment: ${needle}`);
}

function sourceMatches(source, regex, label) {
  ok(regex.test(source), label || `source did not match ${regex}`);
}

function routeUrlModel(pathname, search, hash) {
  const query = new URLSearchParams(search || '');
  query.delete('league');
  query.delete('leagueId');
  query.delete('tab');
  const qs = query.toString();
  return pathname + (qs ? '?' + qs : '') + (hash || '');
}

function parseHashModel(hash, search) {
  const params = new URLSearchParams((hash || '').replace('#', ''));
  const query = new URLSearchParams(search || '');
  const rawTab = params.get('tab') || query.get('tab') || 'dashboard';
  return {
    leagueId: params.get('league') || query.get('league') || query.get('leagueId'),
    tab: rawTab === 'brief' ? 'dashboard' : rawTab,
  };
}

function extractSpanMap(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\{([^}]+)\\}`));
  if (!match) throw new Error(`${name} map not found`);
  const out = {};
  for (const item of match[1].matchAll(/([a-z]+)\s*:\s*'span\s+(\d+)'/gi)) {
    out[item[1]] = Number(item[2]);
  }
  return out;
}

const appSrc = read('js/app.js');
const indexHtml = read('index.html');
const onboardingSrc = read('onboarding.html');
const leagueDetailSrc = read('js/league-detail.js');
const dashboardSrc = read('js/tabs/dashboard.js');
const flashBriefSrc = read('js/tabs/flash-brief.js');
const freeAgencySrc = read('js/free-agency.js');
const analyticsSrc = read('js/tabs/analytics.js');
const leagueMapSrc = read('js/tabs/league-map.js');
const leagueHistorySrc = read('js/shared/league-history.js');
const trophyRoomSrc = read('js/tabs/trophy-room.js');

console.log('\nWar Room regression tests');

group('cold-load routes');

test('route helper preserves dev/user query while adding league hash', () => {
  sourceHas(appSrc, 'const query = new URLSearchParams(window.location.search || \'\');', 'routeUrl must read current query string');
  sourceHas(appSrc, 'query.delete(\'league\');', 'routeUrl must remove stale query league');
  sourceHas(appSrc, 'query.delete(\'leagueId\');', 'routeUrl must remove stale query leagueId');
  sourceHas(appSrc, 'query.delete(\'tab\');', 'routeUrl must remove stale query tab');
  sourceHas(appSrc, 'return window.location.pathname + (qs ? \'?\' + qs : \'\') + (hash || \'\');', 'routeUrl must preserve query before hash');

  for (const tab of ROUTED_TABS) {
    const hash = `#league=${LEAGUE_ID}&tab=${tab}`;
    const url = routeUrlModel('/', `?dev=true&user=${USER}`, hash);
    eq(url, `/?dev=true&user=${USER}${hash}`, `direct URL for ${tab}`);
  }
});

test('initial history replacement keeps the incoming hash on cold load', () => {
  sourceHas(appSrc, 'const route = parseHash(window.location.hash);', 'cold-load path must parse current hash');
  sourceHas(appSrc, 'history.replaceState(state, \'\', routeUrl(window.location.hash));', 'initial replaceState must keep hash');
  sourceHas(appSrc, 'routeUrl(buildHash(league.id, route.tab || \'dashboard\'))', 'league restore must rebuild hash via routeUrl');
});

test('parseHash supports hash routes, query routes, and brief legacy redirect', () => {
  eq(parseHashModel(`#league=${LEAGUE_ID}&tab=draft`, `?dev=true&user=${USER}`).leagueId, LEAGUE_ID, 'hash league');
  eq(parseHashModel(`#league=${LEAGUE_ID}&tab=draft`, `?dev=true&user=${USER}`).tab, 'draft', 'hash tab');
  eq(parseHashModel('', `?dev=true&user=${USER}&leagueId=${LEAGUE_ID}&tab=fa`).leagueId, LEAGUE_ID, 'query league fallback');
  eq(parseHashModel('', `?dev=true&user=${USER}&leagueId=${LEAGUE_ID}&tab=brief`).tab, 'dashboard', 'brief redirect');
});

test('every routed tab has a cold-load URL and render branch', () => {
  for (const tab of ROUTED_TABS) {
    const hash = `#league=${LEAGUE_ID}&tab=${tab}`;
    const directUrl = `/?dev=true&user=${USER}${hash}`;
    ok(directUrl.includes(`tab=${tab}`), `${tab} route missing tab`);
    if (tab === 'dashboard') {
      sourceHas(leagueDetailSrc, '<DashboardPanel', 'dashboard branch missing');
    } else {
      sourceHas(leagueDetailSrc, `activeTab === '${tab}'`, `${tab} render branch missing`);
    }
  }
});

test('every main sidebar tab remains directly addressable', () => {
  for (const tab of MAIN_TABS) {
    sourceHas(leagueDetailSrc, `tab: '${tab}'`, `${tab} nav entry missing`);
  }
});

test('GM strategy remains routed through GM office, not a sidebar button', () => {
  sourceHas(leagueDetailSrc, "activeTab === 'strategy'", 'strategy route must still render');
  sourceHas(leagueDetailSrc, "{ label: 'GM\\'s Office', tab: 'alex', iconKey: 'office' }", 'GM office sidebar entry missing');
  ok(!leagueDetailSrc.includes("{ label: 'GM Strategy', tab: 'strategy'"), 'GM Strategy should not be a sidebar entry');
});

test('analytics module keeps only value-producing sub-tabs', () => {
  ok(!analyticsSrc.includes("key: 'playoffs'"), 'analytics should not expose Playoffs sub-tab');
  ok(!analyticsSrc.includes("key: 'timeline'"), 'analytics should not expose Timeline sub-tab');
  ok(!analyticsSrc.includes("analyticsTab === 'playoffs'"), 'Playoffs render branch should be removed');
  ok(!analyticsSrc.includes("analyticsTab === 'timeline'"), 'Timeline render branch should be removed');
  sourceHas(analyticsSrc, 'const analyticsViewTab = activeSubTab.key;', 'legacy analytics sub-tab routes should fall back to a valid tab');
});

group('click-through paths');

test('custom report player rows open the unified player card', () => {
  sourceHas(leagueMapSrc, 'function canOpenReportPlayer(row, report)', 'custom reports need a player-row gate');
  sourceHas(leagueMapSrc, "report?.dataSource === 'players' && row?.pid", 'custom report rows must only be clickable when player-backed');
  sourceHas(leagueMapSrc, "context: 'custom_report'", 'custom report player-card context missing');
  sourceHas(leagueMapSrc, 'window.WR.openPlayerCard(row.pid, options);', 'custom reports should prefer the unified player card');
  sourceHas(leagueMapSrc, 'window.openPlayerModal(row.pid);', 'custom reports should fall back to the shared player modal');
  sourceHas(leagueMapSrc, "role: 'button'", 'custom report player rows should be accessible controls');
  sourceHas(leagueMapSrc, 'handleReportPlayerRowKey(e, row, report)', 'custom report player rows need keyboard activation');
  sourceHas(leagueMapSrc, '{...reportPlayerRowProps(row, previewReport)}', 'analytics report preview rows must carry player-card click props');
  sourceHas(leagueMapSrc, '{...reportPlayerRowProps(row, report)}', 'full report rows must carry player-card click props');
});

group('live platform gate');

test('live loader keeps non-Sleeper connector files sandbox-only', () => {
  sourceHas(indexHtml, 'const WR_PLATFORM_SANDBOX_ACCESS', 'sandbox platform flag missing from loader');
  sourceHas(indexHtml, "'sleeper-api.js',", 'Sleeper connector must remain in live loader');
  sourceHas(indexHtml, "'app-config.js',", 'shared backend config must load before backend-backed modules');
  sourceHas(indexHtml, "if (WR_PLATFORM_SANDBOX_ACCESS) WR_SHARED_FILES.splice(7, 0, 'espn-api.js', 'mfl-api.js', 'yahoo-api.js');", 'beta connectors must be gated behind sandbox flag');
  ok(!/WRShared\.loadMany\(\[[\s\S]*'espn-api\.js'/.test(indexHtml), 'ESPN connector should not be in unconditional live loadMany list');
});

test('War Room app filters beta-platform leagues out of live route data', () => {
  sourceHas(appSrc, 'const PLATFORM_SANDBOX_ACCESS = WR_HOST.includes(\'sandbox\')', 'app sandbox platform flag missing');
  sourceHas(appSrc, 'const visibleEspnLeagues = PLATFORM_SANDBOX_ACCESS ? espnLeagues : [];', 'ESPN leagues must be hidden on live');
  sourceHas(appSrc, 'const visibleMflLeagues = PLATFORM_SANDBOX_ACCESS ? mflLeagues : [];', 'MFL leagues must be hidden on live');
  sourceHas(appSrc, 'const resumeLeague = [...sleeperLeagues, ...visibleEspnLeagues, ...visibleMflLeagues].find(l => l.id === lastLeagueId);', 'resume must use filtered platform leagues');
});

test('onboarding only persists allowed platforms for the current environment', () => {
  sourceHas(onboardingSrc, 'window.FW_PLATFORM_SANDBOX_ACCESS = betaPlatforms;', 'onboarding sandbox flag missing');
  sourceHas(onboardingSrc, '.live-platforms .sandbox-platform { display: none; }', 'live onboarding should hide beta platform cards');
  sourceHas(onboardingSrc, 'if (!platformAccessAllowed(id)) return;', 'platform toggle must block live beta selection');
  sourceHas(onboardingSrc, 'patchProfile({ platforms: Array.from(selectedPlatforms).filter(platformAccessAllowed) });', 'saved onboarding platforms must be filtered');
});

group('mobile overflow');

test('league shell clamps horizontal overflow at 390px and 430px', () => {
  sourceMatches(leagueDetailSrc, /@media\(max-width:767px\)/, 'mobile media query missing');
  sourceHas(leagueDetailSrc, 'html,body,#root{max-width:100%;overflow-x:hidden}', 'root overflow clamp missing');
  sourceHas(leagueDetailSrc, '.wr-main-content{margin-left:0 !important;width:100% !important;max-width:100vw;overflow-x:hidden;box-sizing:border-box;padding-top:var(--wr-dev-banner-height,0px)}', 'main content mobile clamp missing');
  sourceHas(leagueDetailSrc, '.wr-sidebar{left:-220px !important;top:var(--wr-dev-banner-height,0px) !important;transform:none !important}', 'sidebar off-canvas rule missing');
  sourceHas(leagueDetailSrc, '.wr-sidebar.open{left:0 !important}', 'sidebar open rule missing');
  for (const width of MOBILE_WIDTHS) {
    ok(width <= 767, `${width}px should exercise the mobile shell rules`);
  }
});

test('main content no longer carries fixed desktop width on mobile', () => {
  sourceHas(leagueDetailSrc, '<div className="wr-main-content" style={{', 'main content wrapper missing');
  sourceHas(leagueDetailSrc, "width: 'calc(100vw - ' + sidebarWidth + 'px)'", 'desktop content width must be viewport-clamped');
  sourceHas(leagueDetailSrc, "maxWidth: 'calc(100vw - ' + sidebarWidth + 'px)'", 'desktop content max-width must stay viewport-clamped');
  sourceHas(leagueDetailSrc, "overflowX: 'hidden'", 'desktop content overflow clamp missing');
  sourceHas(leagueDetailSrc, 'margin-left:0 !important;width:100% !important;max-width:100vw', 'mobile margin override missing');
});

group('dashboard widgets');

test('dashboard mobile grid collapses every widget size to one safe column', () => {
  const sizeSpan = extractSpanMap(dashboardSrc, 'sizeSpan');
  sourceHas(dashboardSrc, '.wr-dashboard-grid{', 'dashboard grid CSS missing');
  sourceHas(dashboardSrc, 'grid-template-columns:minmax(0,1fr) !important;', 'mobile single-column grid missing');
  sourceHas(dashboardSrc, '.wr-dashboard-grid>.wr-widget{', 'mobile widget override missing');
  sourceHas(dashboardSrc, 'grid-column:1 / -1 !important;', 'mobile widget column override missing');
  sourceHas(dashboardSrc, 'grid-row:auto !important;', 'mobile widget row override missing');
  sourceHas(dashboardSrc, 'min-width:0;', 'mobile min-width guard missing');

  for (const width of MOBILE_WIDTHS) {
    const activeColumns = width <= 767 ? 1 : 4;
    for (const size of WIDGET_SIZES) {
      ok(sizeSpan[size] >= 1, `${size} span missing`);
      const effectiveSpan = width <= 767 ? 1 : sizeSpan[size];
      ok(effectiveSpan <= activeColumns, `${size} spans ${effectiveSpan} columns at ${width}px`);
    }
  }
});

test('dashboard tablet grid clamps xl/xxl spans to active columns', () => {
  const sizeSpan = extractSpanMap(dashboardSrc, 'sizeSpan');
  sourceHas(dashboardSrc, 'grid-template-columns:repeat(2,minmax(140px,1fr)) !important;', 'tablet two-column grid missing');
  sourceHas(dashboardSrc, '.wr-dashboard-grid>.wr-widget[style*="span 4"]{', 'tablet span-4 selector missing');
  sourceHas(dashboardSrc, 'grid-column:span 2 !important;', 'tablet span-4 clamp missing');
  for (const size of ['xl', 'xxl']) {
    eq(sizeSpan[size], 4, `${size} should request four columns on desktop`);
    ok(2 <= 2, `${size} tablet clamp exceeds active columns`);
  }
});

test('dashboard widget shell defines every supported size for rows and columns', () => {
  const sizeSpan = extractSpanMap(dashboardSrc, 'sizeSpan');
  const rowSpan = extractSpanMap(dashboardSrc, 'rowSpan');
  for (const size of WIDGET_SIZES) {
    ok(Number.isFinite(sizeSpan[size]), `${size} missing from sizeSpan`);
    ok(Number.isFinite(rowSpan[size]), `${size} missing from rowSpan`);
  }
});

test('Intel Brief waiver card uses the Free Agency Action HQ source', () => {
  sourceHas(freeAgencySrc, 'window.App.buildFreeAgencyActionBoard = buildFreeAgencyActionBoard;', 'shared FA board helper missing');
  sourceHas(freeAgencySrc, 'window.App.getFreeAgencyBriefTarget', 'brief target helper missing');
  sourceHas(freeAgencySrc, '(scores[pid] || 0) > 0', 'shared FA board must not recommend unvalued candidates');
  sourceHas(freeAgencySrc, "const ROOKIE_DRAFT_LOCK_STATUSES = new Set(['pre_draft', 'drafting']);", 'shared FA board must treat upcoming/live rookie drafts as waiver-locked');
  sourceHas(freeAgencySrc, 'window.App.rookiesLockedForWaivers = rookiesLockedForWaivers;', 'rookie waiver lock helper must be exposed for brief/FA consistency');
  sourceHas(freeAgencySrc, 'ROOKIE_DHQ_SOURCES.has(source)', 'shared FA board must filter DHQ-valued rookies while rookie waivers are locked');
  sourceHas(freeAgencySrc, 'rookiesLockedForWaivers(currentLeague, briefDraftInfo)', 'shared FA board must use league draft lock state');
  sourceHas(flashBriefSrc, 'window.App.getFreeAgencyBriefTarget({', 'Intel Brief must use shared FA target');
  sourceHas(flashBriefSrc, 'if (hasActionTargetHelper) return null;', 'Intel Brief must not fall back to stale waiver logic while shared helper is available');
  sourceHas(dashboardSrc, 'statsData,', 'dashboard must pass current stats into Intel Brief');
  sourceHas(dashboardSrc, 'timeRecomputeTs,', 'dashboard must pass recompute timestamp into Intel Brief');
  sourceHas(leagueDetailSrc, 'statsData={statsData}', 'league detail must pass stats into dashboard');
  sourceHas(leagueDetailSrc, 'timeRecomputeTs={timeRecomputeTs}', 'league detail must pass recompute timestamp into dashboard');
});

test('draft FantasyCalc value request is allowed by app CSP', () => {
  sourceHas(indexHtml, 'https://api.fantasycalc.com', 'FantasyCalc API must be present in connect-src');
  sourceHas(read('js/draft-room.js'), 'https://api.fantasycalc.com/values/current', 'draft room FantasyCalc fetch missing');
});

test('first-run tutorial waits for Home instead of interrupting navigated workflows', () => {
  sourceHas(leagueDetailSrc, "hashTab !== 'dashboard'", 'tutorial must bail if user has left Home');
  sourceHas(leagueDetailSrc, 'window.shouldShowWRTutorial', 'tutorial should respect shouldShow before start');
});

test('empty Field Notes defaults to compact decision-log utility', () => {
  sourceHas(leagueDetailSrc, "{ id: 'dw1', key: 'field-notes',        size: 'slim' }", 'default Field Notes widget should be compact');
  sourceHas(leagueDetailSrc, "w.key === 'field-notes' && w.id === 'dw1' && w.size === 'narrow'", 'old default Field Notes layouts should migrate compact');
  sourceHas(flashBriefSrc, 'No decisions logged yet', 'empty Field Notes should explain decision log state');
  sourceHas(flashBriefSrc, 'OPEN GM OFFICE', 'empty Field Notes should offer an action');
});

group('league-scoped history');

test('history globals are replaced per active league instead of merged across leagues', () => {
  sourceHas(leagueHistorySrc, 'window.App.LI.championshipLeagueId = key;', 'active championship league id missing');
  sourceHas(leagueHistorySrc, 'window.App.LI.championships = Object.assign({}, cache.championships || {});', 'championships must replace active league snapshot');
  ok(!leagueHistorySrc.includes('Object.assign({}, window.App.LI.championships || {}, cache.championships || {})'), 'championships should not merge prior league data');
});

test('trophy room reads owner history and championships by current league id', () => {
  sourceHas(trophyRoomSrc, 'const leagueId = currentLeague?.id || currentLeague?.league_id || \'\';', 'trophy room league id source missing');
  sourceHas(trophyRoomSrc, 'window.WrHistory.getOwnerHistory(leagueId)', 'owner history must be league-scoped');
  sourceHas(trophyRoomSrc, 'String(window.App?.LI?.championshipLeagueId || \'\') === String(leagueId)', 'fallback championships must be active-league guarded');
});

group('compiled preview');

test('compiled preview removes browser Babel and keeps app bundle route-ready', () => {
  const previewIndex = path.join(ROOT, 'dist-preview', 'index.html');
  ok(fs.existsSync(previewIndex), 'dist-preview/index.html missing; run npm run build:preview first');
  const html = fs.readFileSync(previewIndex, 'utf8');
  ok(!/type=["']text\/babel["']/i.test(html), 'compiled preview still contains text/babel scripts');
  ok(!/@babel\/standalone/i.test(html), 'compiled preview still loads browser Babel');
  sourceHas(html, './compiled/js/app.js', 'compiled app bundle missing from preview index');
  ok(fs.existsSync(path.join(ROOT, 'dist-preview', 'compiled', 'js', 'app.js')), 'compiled js/app.js missing');
});

console.log('\n');
if (failures.length) {
  console.log(failures.join('\n'));
  console.log('');
}
const status = failed > 0 ? 'FAIL' : 'PASS';
console.log(`${status} ${passed + failed} tests - ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
