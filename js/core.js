// ══════════════════════════════════════════════════════════════════
// core.js — Tier system, access control, fetch helpers
// Must load FIRST — all other modules depend on these.
// ══════════════════════════════════════════════════════════════════
const { useState, useEffect, useMemo, useRef, useCallback } = React;

    // ===== PRODUCT TIER SYSTEM =====
    // Tiers: 'scout' (free), 'reconai' ($4.99), 'warroom' ($9.99)
    function getUserTier() {
        try {
            const p = JSON.parse(localStorage.getItem('od_profile_v1') || '{}');
            if (p.tier === 'warroom' || p.tier === 'commissioner' || p.tier === 'power' || p.tier === 'pro') return 'warroom';
            if (p.tier === 'reconai') return 'reconai';
        } catch(e) {}
        // Check if dev mode
        if (new URLSearchParams(window.location.search).has('dev') || window.location.hostname.includes('sandbox')) return 'warroom';
        return 'scout';
    }

    const TIER_FEATURES = {
        // Scout (free) gets these
        scout: new Set(['my-roster-basic', 'player-cards-basic', 'team-diagnosis-basic', 'ai-1-per-day', 'draft-rankings']),
        // ReconAI adds these
        reconai: new Set(['my-roster-basic', 'player-cards-basic', 'team-diagnosis-basic', 'ai-1-per-day', 'draft-rankings',
            'ai-unlimited', 'player-cards-full', 'team-diagnosis-full', 'waiver-targets', 'trade-quick-check']),
        // War Room gets everything
        warroom: new Set(['my-roster-basic', 'player-cards-basic', 'team-diagnosis-basic', 'ai-1-per-day', 'draft-rankings',
            'ai-unlimited', 'player-cards-full', 'team-diagnosis-full', 'waiver-targets', 'trade-quick-check',
            'trade-finder', 'deal-analyzer', 'owner-dna', 'league-map', 'command-view', 'projections',
            'fa-decision-engine', 'big-board', 'draft-simulation', 'analytics-full', 'intelligence-full']),
    };

    function canAccess(feature) {
        const tier = getUserTier();
        return TIER_FEATURES[tier]?.has(feature) || TIER_FEATURES.warroom.has(feature) && tier === 'warroom';
    }

    // One-time taste tracking
    function useTaste() {
        const key = 'wr_taste_used';
        const used = localStorage.getItem(key);
        if (used) return false;
        localStorage.setItem(key, '1');
        return true; // first time = allow
    }
    function hasTasteLeft() { return !localStorage.getItem('wr_taste_used'); }

    // AI daily limit for scout tier
    function canUseAI() {
        const tier = getUserTier();
        if (tier !== 'scout') return true;
        const key = 'wr_ai_daily_' + new Date().toISOString().split('T')[0];
        const count = parseInt(localStorage.getItem(key) || '0');
        return count < 1;
    }
    function trackAIUse() {
        const key = 'wr_ai_daily_' + new Date().toISOString().split('T')[0];
        const count = parseInt(localStorage.getItem(key) || '0');
        localStorage.setItem(key, String(count + 1));
    }


    function handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(SESSION_KEY);
            window.location.href = 'landing.html';
        }
    }


    // ===== SLEEPER API =====
    const SLEEPER_BASE_URL = 'https://api.sleeper.app/v1';

    async function fetchJSON(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    async function fetchSleeperUser(username) {
        return await fetchJSON(`${SLEEPER_BASE_URL}/user/${encodeURIComponent(username)}`);
    }

    async function fetchUserLeagues(userId, season) {
        return await fetchJSON(`${SLEEPER_BASE_URL}/user/${userId}/leagues/nfl/${season}`);
    }

    async function fetchLeagueRosters(leagueId) {
        return await fetchJSON(`${SLEEPER_BASE_URL}/league/${leagueId}/rosters`);
    }

    async function fetchLeagueUsers(leagueId) {
        return await fetchJSON(`${SLEEPER_BASE_URL}/league/${leagueId}/users`);
    }

    async function fetchLeagueInfo(leagueId) {
        return await fetchJSON(`${SLEEPER_BASE_URL}/league/${leagueId}`);
    }

    let _wrPlayersCache = null;
    async function fetchAllPlayers() {
        if (_wrPlayersCache) return _wrPlayersCache;
        // Check sessionStorage first (avoid re-fetching 10k players on every load)
        try {
            const cached = sessionStorage.getItem('fw_players_cache');
            if (cached) {
                const d = JSON.parse(cached);
                if (Date.now() - d.ts < 3600000) { _wrPlayersCache = d.data; return d.data; }
            }
        } catch(e) {}
        _wrPlayersCache = await fetchJSON(`${SLEEPER_BASE_URL}/players/nfl`);
        try { sessionStorage.setItem('fw_players_cache', JSON.stringify({ data: _wrPlayersCache, ts: Date.now() })); } catch(e) {}
        return _wrPlayersCache;
    }

    const STATS_YEAR = '2025'; // Most recent completed season — used until Sleeper publishes projections

    let _wrStatsCache = {};
    async function fetchSeasonStats(season) {
        if (_wrStatsCache[season]) return _wrStatsCache[season];
        try {
            _wrStatsCache[season] = await fetchJSON(`${SLEEPER_BASE_URL}/stats/nfl/regular/${season}`);
        } catch (e) {
            console.warn('Stats fetch failed:', e);
            _wrStatsCache[season] = {};
        }
        return _wrStatsCache[season];
    }

    let _projectionsCache = {};
    async function fetchSeasonProjections(season) {
        if (_projectionsCache[season]) return _projectionsCache[season];
        try {
            _projectionsCache[season] = await fetchJSON(`${SLEEPER_BASE_URL}/projections/nfl/regular/${season}`);
        } catch (e) {
            console.warn('Projections fetch failed:', e);
            _projectionsCache[season] = {};
        }
        return _projectionsCache[season];
    }

