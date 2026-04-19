// ══════════════════════════════════════════════════════════════════
// js/draft/scouting.js — Prospect CSV pipeline for War Room main app
//
// Loads draft-war-room/player.csv (ranks + source columns) and
// draft-war-room/player-enrichment.csv (school, photo, summary,
// size/weight/speed) from the local filesystem, merges them, computes
// tier/grade/draftScore per csv-loader.js, and exposes:
//
//   window.getProspects()                 -> Array<Prospect>
//   window.findProspect(name)             -> Prospect | null
//   window.DraftCC.scouting.ready         -> Promise<Array<Prospect>>
//   window.DraftCC.scouting.isLoaded      -> boolean
//
// Draft-room.js has defensive `typeof window.findProspect === 'function'`
// checks at :76 and :86 that until now have always been false, because
// csv-loader.js only runs inside the standalone draft-war-room/index.html
// page. Loading this module immediately unlocks rich prospect data in the
// main app.
//
// Depends on: (none — uses fetch + globals, safe to load early)
// ══════════════════════════════════════════════════════════════════

(function() {
    const CSV_BASE = 'draft-war-room/';
    const PLAYER_CSV     = CSV_BASE + 'player.csv';
    const ENRICHMENT_CSV = CSV_BASE + 'player-enrichment.csv';

    // ── CSV parser (handles quoted fields containing commas) ─────────
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        return lines.slice(1).map((line, idx) => {
            const vals = [];
            let cur = '';
            let quoted = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { quoted = !quoted; }
                else if (ch === ',' && !quoted) { vals.push(cur); cur = ''; }
                else { cur += ch; }
            }
            vals.push(cur);
            const obj = { _rowIndex: idx + 1 };
            headers.forEach((h, i) => { obj[h] = vals[i] ? vals[i].trim() : ''; });
            return obj;
        });
    }

    // ── Scoring (ported from draft-war-room/csv-loader.js) ────────────
    function calculateTier(rank) {
        if (rank <= 10)  return 1;
        if (rank <= 32)  return 2;
        if (rank <= 64)  return 3;
        if (rank <= 100) return 4;
        if (rank <= 150) return 5;
        if (rank <= 224) return 6;
        return 7;
    }

    function calculateGrade(rank) {
        if (rank <= 5)   return 9.0 + (6 - rank) * 0.2;
        if (rank <= 10)  return 8.5 + (11 - rank) * 0.1;
        if (rank <= 32)  return 7.0 + (33 - rank) * 0.07;
        if (rank <= 64)  return 6.0 + (65 - rank) * 0.03;
        if (rank <= 100) return 5.0 + (101 - rank) * 0.03;
        if (rank <= 224) return 3.0 + (225 - rank) * 0.016;
        return Math.max(1.0, 3.0 - (rank - 224) * 0.01);
    }

    const POSITION_VALUES = {
        // Phase 7: 'ED' is a valid CSV abbreviation for edge rushers alongside 'EDGE' / 'DE'.
        // Previously only 'EDGE' / 'DE' were keyed — CSVs using 'ED' (e.g., draft-war-room/player.csv)
        // fell through to the default 1.0, producing under-weighted draftScores
        // (Rueben Bain Jr., rank 7, pos 'ED': (250-7)/25 * 1.0 = 9.72 instead of × 1.3).
        'QB': 1.5, 'EDGE': 1.3, 'DE': 1.3, 'ED': 1.3, 'OT': 1.25, 'T': 1.25,
        'WR': 1.2, 'CB': 1.15, 'DT': 1.1, 'DL': 1.1, 'IDL': 1.1,
        'LB': 1.05, 'ILB': 1.05, 'OLB': 1.05, 'S': 1.0, 'TE': 0.95,
        'IOL': 0.9, 'OG': 0.9, 'G': 0.9, 'C': 0.9, 'RB': 0.85,
        'K': 0.5, 'P': 0.5,
    };

    const FANTASY_POS_MULT = {
        'QB': 2.0, 'RB': 1.90, 'WR': 1.75, 'TE': 1.5, 'K': 0.5,
        'DE': 0.35, 'EDGE': 0.35, 'ED': 0.35, 'OLB': 0.35,
        'LB': 0.30, 'ILB': 0.30,
        'DB': 0.25, 'S': 0.25, 'CB': 0.25,
        'DL': 0.2, 'DT': 0.2, 'IDL': 0.2,
        'OT': 0.15, 'T': 0.15, 'IOL': 0.15, 'OG': 0.15, 'G': 0.15, 'C': 0.15, 'OL': 0.15,
        'P': 0.2,
    };

    function calculateDraftScore(rank, pos) {
        const posValue = POSITION_VALUES[pos] || 1.0;
        const baseScore = Math.max(0, (250 - rank) / 25);
        return Math.round(baseScore * posValue * 100) / 100;
    }

    // Map raw CSV pos to Sleeper-canonical positions (WR/RB/QB/TE/DL/LB/DB/EDGE)
    function mapCSVPos(pos) {
        if (!pos) return '';
        const upper = pos.toUpperCase();
        // Phase 7 fix: include 'ED' (CSV variant for edge rusher) so it maps to DL alongside DE/EDGE.
        if (['DE','DT','ED','EDGE','IDL','NT'].includes(upper)) return 'DL';
        if (['ILB','OLB','MLB'].includes(upper)) return 'LB';
        if (['CB','S','FS','SS'].includes(upper)) return 'DB';
        return upper;
    }

    // ── Loader (runs once on module init, returns a Promise) ─────────
    let _ready = null;
    let _prospects = [];
    let _nameIndex = {};

    function loadProspects() {
        if (_ready) return _ready;
        _ready = (async function() {
            let playersRaw = [];
            let enrichmentMap = {};

            // Fetch player.csv
            try {
                const resp = await fetch(PLAYER_CSV);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                const text = await resp.text();
                playersRaw = parseCSV(text);
            } catch (e) {
                if (window.wrLog) window.wrLog('scouting.loadPlayers', e);
                return [];
            }

            // Fetch enrichment (optional — missing file is OK)
            try {
                const resp = await fetch(ENRICHMENT_CSV);
                if (resp.ok) {
                    const text = await resp.text();
                    const rows = parseCSV(text);
                    rows.forEach(r => {
                        const key = (r.name || '').toLowerCase().trim();
                        if (!key) return;
                        enrichmentMap[key] = {
                            previousRank: parseInt(r.Rank, 10) || null,
                            school: r.school || '',
                            espnId: r.espn_id || '',
                            photoUrl: r.photo_url || '',
                            summary: r.summary || '',
                            year: r.year || '',
                            size: r.size || '',
                            weight: r.weight || '',
                            speed: r.speed || '',
                            fantasyMultiplier: parseFloat(r.fantasyMultiplier) || 1.0,
                        };
                    });
                }
            } catch (e) {
                if (window.wrLog) window.wrLog('scouting.loadEnrichment', e);
            }

            // Detect source columns (any column not in standard set)
            const STANDARD = new Set([
                'rank','player name','player','name','pos','position',
                'college','school','player_id','id','_rowindex','exp','avg',
            ]);
            const allCols = playersRaw.length ? Object.keys(playersRaw[0]) : [];
            const sourceCols = allCols.filter(c => !STANDARD.has(c.toLowerCase()));

            // Build prospects
            const prospects = playersRaw.map((row, idx) => {
                const rank = parseInt(row.Rank || row.rank || (idx + 1), 10);
                const name = (row.Name || row.name || row.Player || '').trim();
                const rawPos = (row.Pos || row.pos || row.Position || '').trim();
                const pos = rawPos.toUpperCase();
                const mappedPos = mapCSVPos(rawPos);
                const key = name.toLowerCase().trim();
                const enrich = enrichmentMap[key] || {};

                const tier = calculateTier(rank);
                const grade = Math.round(calculateGrade(rank) * 10) / 10;
                const draftScore = calculateDraftScore(rank, pos);
                const fantasyMultiplier = enrich.fantasyMultiplier || FANTASY_POS_MULT[pos] || 0.3;
                // Dynasty value: draft score scaled to DHQ-ish numbers (0-10000 range)
                // so rookies without a Sleeper DHQ can slot into the big-board ladder.
                const dynastyValue = Math.round(draftScore * fantasyMultiplier * 1000);

                // Source ranks (for "consensus baseline" comparison later)
                const sourceRanks = {};
                sourceCols.forEach(col => {
                    const v = row[col];
                    if (v && v !== '-' && v !== 'N/A') {
                        const parsed = parseFloat(v);
                        if (!isNaN(parsed)) sourceRanks[col] = parsed;
                    }
                });

                // Consensus rank: prefer "Avg" column if present, else mean of sourceRanks
                let consensusRank = rank;
                if (row.Avg && !isNaN(parseFloat(row.Avg))) {
                    consensusRank = parseFloat(row.Avg);
                } else if (Object.keys(sourceRanks).length) {
                    const vals = Object.values(sourceRanks);
                    consensusRank = vals.reduce((a, b) => a + b, 0) / vals.length;
                }

                return {
                    // Identity
                    pid: 'csv_' + key.replace(/[^a-z0-9]/g, '_'),
                    name,
                    pos: mappedPos || pos,
                    rawPos: pos,
                    mappedPos,
                    // Rank + scoring
                    rank,
                    previousRank: enrich.previousRank,
                    consensusRank: Math.round(consensusRank * 10) / 10,
                    tier,
                    grade,
                    draftScore,
                    dynastyValue,
                    fantasyMultiplier,
                    // Enrichment
                    college: enrich.school || '',
                    school: enrich.school || '',
                    photoUrl: enrich.photoUrl || '',
                    espnId: enrich.espnId || '',
                    summary: enrich.summary || '',
                    year: enrich.year || '',
                    size: enrich.size || '',
                    weight: enrich.weight || '',
                    speed: enrich.speed || '',
                    experience: row.Exp || '',
                    // Source ranks for analytics later
                    sourceRanks,
                };
            }).filter(p => p.name);

            prospects.sort((a, b) => a.rank - b.rank);
            _prospects = prospects;
            _nameIndex = {};
            prospects.forEach(p => {
                _nameIndex[p.name.toLowerCase().trim()] = p;
                // Also index by "first last" variants
                const parts = p.name.toLowerCase().split(' ');
                if (parts.length >= 2) {
                    _nameIndex[(parts[0] + ' ' + parts[parts.length - 1]).trim()] = p;
                }
            });

            window.DraftCC.scouting.isLoaded = true;
            if (window.wrLog) window.wrLog('scouting.loaded', { count: prospects.length });
            return prospects;
        })();
        return _ready;
    }

    // ── Public API ────────────────────────────────────────────────────
    function getProspects() {
        return _prospects.slice();
    }

    function findProspect(name) {
        if (!name) return null;
        const key = String(name).toLowerCase().trim();
        if (_nameIndex[key]) return _nameIndex[key];
        // Fuzzy: strip punctuation + try first/last
        const stripped = key.replace(/[^a-z0-9 ]/g, '').trim();
        if (_nameIndex[stripped]) return _nameIndex[stripped];
        const parts = stripped.split(' ');
        if (parts.length >= 2) {
            const firstLast = parts[0] + ' ' + parts[parts.length - 1];
            if (_nameIndex[firstLast]) return _nameIndex[firstLast];
        }
        return null;
    }

    // Expose
    window.DraftCC = window.DraftCC || {};
    window.DraftCC.scouting = {
        ready: loadProspects(),
        isLoaded: false,
        getProspects,
        findProspect,
    };
    window.getProspects = getProspects;
    window.findProspect = findProspect;
})();
