// ══════════════════════════════════════════════════════════════════
// js/tabs/dashboard.js — DashboardPanel: Configurable widget grid
// Unified grid with sm/md/lg widget sizes. Transaction ticker and
// league standings are first-class widgets alongside numeric KPIs.
// ══════════════════════════════════════════════════════════════════

function DashboardPanel({
  selectedWidgets,
  setSelectedWidgets,
  editingKpi,
  setEditingKpi,
  computeKpiValue,
  KPI_OPTIONS,
  rankedTeams,
  sleeperUserId,
  setActiveTab,
  transactions,
  standings,
  currentLeague,
  playersData,
  myRoster,
  getOwnerName,
  getPlayerName,
  timeAgo,
}) {
    // ── Styles ──
    const kpiCardStyle = { background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' };
    const kpiLabelStyle = { fontSize: '0.75rem', color: 'var(--gold)', fontFamily: 'Inter, sans-serif', letterSpacing: '0.04em', marginBottom: '4px', fontWeight: 500, opacity: 0.9 };
    const kpiValueStyle = { fontSize: '1.3rem', fontWeight: '600', color: 'var(--white)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1, letterSpacing: '-0.02em' };
    const kpiSubStyle = { fontSize: '0.6875rem', color: 'var(--silver)', marginTop: '2px', fontFamily: 'Inter, sans-serif', fontWeight: 500, opacity: 0.85 };

    const widgetCardBase = { background: 'var(--black)', border: '2px solid rgba(212,175,55,0.3)', borderRadius: '12px', overflow: 'hidden' };

    // ── Size → gridColumn mapping ──
    const sizeToSpan = { sm: 'span 1', md: 'span 2', lg: 'span 5' };

    // ── Available sizes for a widget key ──
    function getAvailableSizes(key) {
        const opt = KPI_OPTIONS[key];
        if (opt?.sizes) return opt.sizes;
        // Default: numeric KPIs only support sm
        return ['sm'];
    }

    // ── Widget key set (for "already added" checks) ──
    const widgetKeys = (selectedWidgets || []).map(w => w?.key).filter(Boolean);

    // ══════════════════════════════════════════════════════════════
    // TRANSACTION TICKER RENDERER
    // ══════════════════════════════════════════════════════════════
    function renderTransactionTicker(size) {
        const maxHeight = size === 'lg' ? '600px' : '400px';
        return (
            <div style={{ ...widgetCardBase, padding: '20px', maxHeight, overflow: 'auto' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.125rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.06em' }}>TRANSACTION TICKER</div>
                {(!transactions || transactions.length === 0) ? (
                    <SkeletonRows count={6} />
                ) : transactions.map((txn, ti) => (
                    <div key={ti} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.65, minWidth: '40px' }}>{timeAgo(txn.created)}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '3px',
                                background: txn.type === 'trade' ? 'rgba(124,107,248,0.2)' : txn.type === 'waiver' ? 'rgba(52,211,153,0.2)' : txn.type === 'free_agent' ? 'rgba(59,130,246,0.2)' : 'rgba(248,113,113,0.2)',
                                color: txn.type === 'trade' ? 'var(--gold)' : txn.type === 'waiver' ? '#34d399' : txn.type === 'free_agent' ? '#60a5fa' : '#f87171'
                            }}>{(txn.type === 'free_agent' ? 'FA' : txn.type || '').toUpperCase()}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{getOwnerName(txn.roster_ids?.[0])}</span>
                            {txn.type === 'trade' && txn.roster_ids?.[1] && (
                                <span style={{ fontSize: '0.74rem', color: 'var(--silver)', opacity: 0.65 }}>{'\u2194'} {getOwnerName(txn.roster_ids[1])}</span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--white)', paddingLeft: '48px' }}>
                            {Object.keys(txn.adds || {}).map(pid => (
                                <span key={'a'+pid} style={{ color: '#2ECC71', cursor: 'pointer', marginRight: '6px' }}
                                    onClick={() => { if (window._wrSelectPlayer) window._wrSelectPlayer(pid); }}>
                                    +{getPlayerName(pid)}
                                </span>
                            ))}
                            {Object.keys(txn.drops || {}).map(pid => (
                                <span key={'d'+pid} style={{ color: '#E74C3C', marginLeft: '4px', marginRight: '6px' }}>
                                    -{getPlayerName(pid)}
                                </span>
                            ))}
                            {txn.settings?.waiver_bid > 0 && <span style={{ color: '#F0A500', marginLeft: '4px' }}>${txn.settings.waiver_bid}</span>}
                            {txn.type === 'trade' && txn.draft_picks?.length > 0 && (
                                <span style={{ color: 'var(--gold)', fontSize: '0.78rem', marginLeft: '6px' }}>
                                    +{txn.draft_picks.length} pick{txn.draft_picks.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // LEAGUE STANDINGS RENDERER
    // ══════════════════════════════════════════════════════════════
    function renderStandings(size) {
        const isOffseason = currentLeague?.status === 'complete' || currentLeague?.status === 'pre_draft';

        // Group by division if divisions exist
        const divisions = {};
        (standings || []).forEach(t => {
            const div = t.division || 0;
            if (!divisions[div]) divisions[div] = [];
            divisions[div].push(t);
        });
        const divKeys = Object.keys(divisions).sort((a,b) => a - b);
        const hasDivisions = divKeys.length > 1;

        // Build division name lookup from league metadata
        const divNameMap = {};
        if (hasDivisions && currentLeague?.metadata) {
            divKeys.forEach(dk => {
                const metaName = currentLeague.metadata['division_' + dk] || currentLeague.metadata['division_' + dk + '_name'];
                divNameMap[dk] = metaName || ('Division ' + dk);
            });
        }

        // Compact mode for md size (fewer columns)
        const isCompact = size === 'md';

        return (
            <div style={{ ...widgetCardBase, padding: '16px' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.125rem', fontWeight: 600, color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.06em' }}>LEAGUE STANDINGS</div>
                <div>
                    {divKeys.map(divKey => (
                        <div key={divKey} style={{ marginBottom: hasDivisions ? '16px' : '0' }}>
                            {hasDivisions && (
                                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(212,175,55,0.2)' }}>
                                    {divNameMap[divKey] || ('Division ' + divKey)}
                                </div>
                            )}
                            {/* Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '20px 1fr 48px 56px' : '20px 28px 1fr 48px 48px 56px', gap: '4px', padding: '4px 8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
                                <span>#</span>
                                {!isCompact && <span></span>}
                                <span>Team</span>
                                <span style={{textAlign:'right'}}>{isOffseason ? 'HP' : 'W-L'}</span>
                                {!isCompact && <span style={{textAlign:'right'}}>PF</span>}
                                <span style={{textAlign:'right'}}>DHQ</span>
                            </div>
                            {/* Rows */}
                            {divisions[divKey].sort((a,b) => {
                                if (isOffseason) {
                                    const roster_a = currentLeague?.rosters?.find(r => r.owner_id === a.userId);
                                    const roster_b = currentLeague?.rosters?.find(r => r.owner_id === b.userId);
                                    const hs_a = window.assessTeamFromGlobal?.(roster_a?.roster_id)?.healthScore || 0;
                                    const hs_b = window.assessTeamFromGlobal?.(roster_b?.roster_id)?.healthScore || 0;
                                    if (hs_b !== hs_a) return hs_b - hs_a;
                                    return b.pointsFor - a.pointsFor;
                                }
                                if (b.wins !== a.wins) return b.wins - a.wins;
                                if (a.losses !== b.losses) return a.losses - b.losses;
                                return b.pointsFor - a.pointsFor;
                            }).map((team, idx) => {
                                const isMe = team.userId === sleeperUserId;
                                const roster = currentLeague?.rosters?.find(r => r.owner_id === team.userId);
                                const totalDHQ = roster?.players?.reduce((s, pid) => s + (window.App?.LI?.playerScores?.[pid] || 0), 0) || 0;
                                const pf = team.pointsFor || 0;
                                const user = (currentLeague?.users || []).find(u => u.user_id === team.userId);
                                const avatarId = user?.avatar;
                                const avatarUrl = avatarId ? `https://sleepercdn.com/avatars/thumbs/${avatarId}` : null;
                                const teamName = team.teamName;
                                const healthScore = isOffseason ? (window.assessTeamFromGlobal?.(roster?.roster_id)?.healthScore || 0) : 0;
                                return (
                                    <div key={team.rosterId} style={{
                                        display: 'grid', gridTemplateColumns: isCompact ? '20px 1fr 48px 56px' : '20px 28px 1fr 48px 48px 56px', gap: '4px',
                                        padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        background: isMe ? 'rgba(212,175,55,0.08)' : 'transparent',
                                        fontSize: '0.75rem', alignItems: 'center'
                                    }}>
                                        <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', color: idx === 0 ? '#D4AF37' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : 'var(--silver)' }}>{idx + 1}</span>
                                        {!isCompact && (
                                            <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: isMe ? '2px solid var(--gold)' : '1px solid rgba(255,255,255,0.1)' }} />
                                                ) : (
                                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--silver)', fontWeight: 600 }}>
                                                        {(team.displayName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div style={{ overflow: 'hidden' }}>
                                            <div style={{ fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--gold)' : 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {isCompact ? team.displayName : (teamName ? `${teamName} (${team.displayName})` : team.displayName)}{isMe && <span style={{ fontSize: '0.78rem', color: 'var(--gold)', marginLeft: '4px' }}>YOU</span>}
                                            </div>
                                        </div>
                                        <span style={{ textAlign: 'right', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--white)' }}>{isOffseason ? (healthScore > 0 ? healthScore.toFixed(0) : '\u2014') : `${team.wins}-${team.losses}`}</span>
                                        {!isCompact && <span style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--silver)' }}>{pf > 0 ? pf.toFixed(0) : '\u2014'}</span>}
                                        <span style={{ textAlign: 'right', fontSize: '0.78rem', fontFamily: 'Inter, sans-serif', color: totalDHQ >= 80000 ? '#2ECC71' : totalDHQ >= 50000 ? 'var(--gold)' : 'var(--silver)' }}>{totalDHQ > 0 ? (totalDHQ / 1000).toFixed(0) + 'k' : '\u2014'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // SMALL KPI CARD RENDERER
    // ══════════════════════════════════════════════════════════════
    // Map KPI category to tab for click-through navigation
    const categoryToTab = { Trades: 'trades', Draft: 'draft', Roster: 'myteam', League: 'league', Waivers: 'fa', Projection: 'analytics', History: 'trophies' };

    function renderSmallKpi(widget, idx) {
        const kpiKey = widget.key;
        const isEditing = editingKpi === idx;
        const opt = KPI_OPTIONS[kpiKey] || { label: kpiKey, icon: '?', category: '' };
        const val = computeKpiValue(kpiKey);
        const clickTab = categoryToTab[opt.category];
        return (
            <div key={kpiKey + '-' + idx} onClick={() => { if (clickTab && !isEditing && setActiveTab) setActiveTab(clickTab); }} style={{
                ...kpiCardStyle, position: 'relative', cursor: clickTab ? 'pointer' : 'default',
                border: isEditing ? '1px solid var(--gold)' : kpiCardStyle.border,
                gridColumn: 'span 1'
            }}>
                {/* Edit button */}
                <button onClick={e => { e.stopPropagation(); setEditingKpi(isEditing ? null : idx); }}
                    style={{
                        position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px',
                        border: 'none', borderRadius: '50%', cursor: 'pointer',
                        background: isEditing ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                        color: isEditing ? 'var(--black)' : 'var(--silver)',
                        fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', opacity: 0.6
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                    title="Change this widget"
                >{isEditing ? '\u2715' : '\u270E'}</button>

                {/* KPI content */}
                <div style={{ ...kpiLabelStyle, fontSize: '0.72rem' }}>{opt.icon} {opt.category.toUpperCase()}{opt.tip ? React.createElement(Tip, null, opt.tip) : null}</div>
                <div style={{ ...kpiValueStyle, color: val.color, fontSize: '1.3rem' }}>{val.value}</div>
                <div style={kpiSubStyle}>{val.sub}</div>
                {/* Sparkline */}
                {typeof Sparkline !== 'undefined' && val.sparkData && React.createElement(Sparkline, { data: val.sparkData, width: 90, height: 24, color: val.color || '#D4AF37' })}
                {/* Sparkline trend */}
                {typeof Sparkline !== 'undefined' && val.sparkData && val.sparkData.length >= 2 && (() => {
                    const _first = val.sparkData[0], _last = val.sparkData[val.sparkData.length - 1];
                    if (!_first) return null;
                    const _pct = Math.round((_last - _first) / Math.abs(_first) * 100);
                    if (Math.abs(_pct) < 2) return <div style={{ fontSize:'0.65rem', color:'var(--silver)', marginTop:'2px', fontFamily:'Inter, sans-serif', opacity:0.6 }}>{'\u2192'} Stable</div>;
                    const _up = _pct > 0;
                    return <div style={{ fontSize:'0.65rem', color: _up ? '#2ECC71' : '#E74C3C', marginTop:'2px', fontFamily:'Inter, sans-serif', fontWeight:600 }}>{_up ? '\u2191 ' : '\u2193 '}{Math.abs(_pct)}% projected</div>;
                })()}
                {/* Contextual annotation */}
                {(() => { const ann = getKpiAnnotation(kpiKey, val.value); return ann ? <div style={{fontSize:'0.7rem',color:'var(--gold)',marginTop:'6px',fontFamily:'Inter, sans-serif',fontWeight:600,letterSpacing:'0.02em',borderTop:'1px solid rgba(212,175,55,0.15)',paddingTop:'6px'}}>{ann}</div> : null; })()}

                {/* Dropdown picker */}
                {isEditing && renderWidgetPicker(idx, kpiKey)}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // MD/LG WIDGET CARD WRAPPER (edit button + content)
    // ══════════════════════════════════════════════════════════════
    function renderMdLgWidget(widget, idx, content) {
        const isEditing = editingKpi === idx;
        return (
            <div key={widget.key + '-' + idx} style={{
                position: 'relative',
                gridColumn: sizeToSpan[widget.size] || 'span 2',
            }}>
                {/* Edit button */}
                <button onClick={e => { e.stopPropagation(); setEditingKpi(isEditing ? null : idx); }}
                    style={{
                        position: 'absolute', top: '8px', right: '8px', width: '22px', height: '22px',
                        border: 'none', borderRadius: '50%', cursor: 'pointer', zIndex: 10,
                        background: isEditing ? 'var(--gold)' : 'rgba(255,255,255,0.08)',
                        color: isEditing ? 'var(--black)' : 'var(--silver)',
                        fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', opacity: 0.6
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                    title="Change this widget"
                >{isEditing ? '\u2715' : '\u270E'}</button>

                {content}

                {/* Dropdown picker */}
                {isEditing && renderWidgetPicker(idx, widget.key)}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // WIDGET PICKER DROPDOWN
    // ══════════════════════════════════════════════════════════════
    function renderWidgetPicker(idx, currentKey) {
        const widget = selectedWidgets[idx] || {};
        return (
            <div style={{
                position: 'absolute', top: '0', left: '-4px', right: '-4px',
                background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.4)',
                borderRadius: '8px', zIndex: 50, maxHeight: '320px', overflowY: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
            }}>
                {/* Remove widget option */}
                <div onClick={() => {
                    const updated = selectedWidgets.filter((_, i) => i !== idx);
                    setSelectedWidgets(updated);
                    setEditingKpi(null);
                }} style={{
                    padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem',
                    display: 'flex', alignItems: 'center', gap: '6px',
                    color: '#E74C3C', borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(231,76,60,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ fontSize: '0.8rem' }}>{'\u2716'}</span>
                    <div style={{ fontWeight: 600 }}>Remove Widget</div>
                </div>

                {/* Widget options */}
                {Object.entries(KPI_OPTIONS)
                    .filter(([k]) => !widgetKeys.includes(k) || k === currentKey)
                    .map(([k, o]) => {
                        const isActive = k === currentKey;
                        const availSizes = getAvailableSizes(k);
                        return (
                            <div key={k} style={{
                                padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: isActive ? 'rgba(212,175,55,0.15)' : 'transparent',
                                color: isActive ? 'var(--gold)' : 'var(--white)',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                transition: 'background 0.1s'
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(212,175,55,0.15)' : 'transparent'; }}
                            >
                                <div onClick={() => {
                                    const defaultSize = availSizes.includes('sm') ? 'sm' : availSizes[0];
                                    const updated = [...selectedWidgets];
                                    updated[idx] = { key: k, size: isActive ? widget.size : defaultSize };
                                    setSelectedWidgets(updated);
                                    if (!isActive) setEditingKpi(null);
                                }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>{o.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{o.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6 }}>{o.category}</div>
                                    </div>
                                    {isActive && <span style={{ color: 'var(--gold)', fontSize: '0.7rem' }}>{'\u2713'}</span>}
                                </div>
                                {/* Size toggle buttons */}
                                {isActive && availSizes.length > 1 && (
                                    <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}>
                                        {availSizes.map(sz => (
                                            <button key={sz} onClick={(e) => {
                                                e.stopPropagation();
                                                const updated = [...selectedWidgets];
                                                updated[idx] = { ...updated[idx], size: sz };
                                                setSelectedWidgets(updated);
                                            }} style={{
                                                padding: '2px 6px', fontSize: '0.62rem', fontWeight: 700,
                                                fontFamily: 'Inter, sans-serif', textTransform: 'uppercase',
                                                border: '1px solid ' + (widget.size === sz ? 'var(--gold)' : 'rgba(255,255,255,0.15)'),
                                                borderRadius: '3px', cursor: 'pointer',
                                                background: widget.size === sz ? 'var(--gold)' : 'transparent',
                                                color: widget.size === sz ? 'var(--black)' : 'var(--silver)',
                                            }}>{sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // EMPTY SLOT (add widget)
    // ══════════════════════════════════════════════════════════════
    function renderEmptySlot(idx) {
        const isEditing = editingKpi === idx;
        return (
            <div key={'empty-' + idx}
                onClick={() => setEditingKpi(isEditing ? null : idx)}
                style={{
                    ...kpiCardStyle, position: 'relative', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    minHeight: '80px',
                    border: isEditing ? '1px solid var(--gold)' : '1px dashed rgba(212,175,55,0.2)',
                    background: 'transparent', gridColumn: 'span 1'
                }}>
                {!isEditing && <span style={{ fontSize: '1.2rem', color: 'rgba(212,175,55,0.3)' }}>+</span>}
                {isEditing && (
                    <div style={{
                        position: 'absolute', top: '100%', left: '-4px', right: '-4px', marginTop: '4px',
                        background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.4)',
                        borderRadius: '8px', zIndex: 50, maxHeight: '280px', overflowY: 'auto',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                    }}>
                        {Object.entries(KPI_OPTIONS).filter(([k]) => !widgetKeys.includes(k)).map(([k, o]) => {
                            const availSizes = getAvailableSizes(k);
                            const defaultSize = availSizes.includes('sm') ? 'sm' : availSizes[0];
                            return (
                                <div key={k} onClick={(e) => {
                                    e.stopPropagation();
                                    const updated = [...selectedWidgets];
                                    updated[idx] = { key: k, size: defaultSize };
                                    setSelectedWidgets(updated);
                                    setEditingKpi(null);
                                }} style={{
                                    padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    color: 'var(--white)', borderBottom: '1px solid rgba(255,255,255,0.04)'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '0.8rem' }}>{o.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{o.label}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--silver)', opacity: 0.6 }}>{o.category}{availSizes.length > 1 ? ' \u00B7 ' + availSizes.map(s => s.toUpperCase()).join('/') : ''}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ══════════════════════════════════════════════════════════════
    const widgets = selectedWidgets || [];

    return (
        <React.Fragment>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px',
                padding: '16px 24px', background: 'var(--black)',
                borderBottom: '1px solid rgba(212,175,55,0.15)'
            }}>
                {widgets.map((widget, idx) => {
                    // Empty / null slot
                    if (!widget || !widget.key) {
                        return renderEmptySlot(idx);
                    }

                    const { key, size } = widget;

                    // SM widgets: numeric KPI cards
                    if (size === 'sm') {
                        return renderSmallKpi(widget, idx);
                    }

                    // MD / LG widgets: transaction ticker, standings, or KPI in expanded view
                    if (key === 'transaction-ticker') {
                        return renderMdLgWidget(widget, idx, renderTransactionTicker(size));
                    }

                    if (key === 'league-standings') {
                        return renderMdLgWidget(widget, idx, renderStandings(size));
                    }

                    // Fallback for any other key at md/lg: render as expanded KPI
                    const opt = KPI_OPTIONS[key] || { label: key, icon: '?', category: '' };
                    const val = computeKpiValue(key);
                    return renderMdLgWidget(widget, idx, (
                        <div style={{ ...widgetCardBase, padding: '16px', textAlign: 'center' }}>
                            <div style={{ ...kpiLabelStyle }}>{opt.icon} {opt.label}{opt.tip ? React.createElement(Tip, null, opt.tip) : null}</div>
                            <div style={{ ...kpiValueStyle, color: val.color, fontSize: '1.8rem' }}>{val.value}</div>
                            <div style={{ ...kpiSubStyle, fontSize: '0.78rem' }}>{val.sub}</div>
                            {typeof Sparkline !== 'undefined' && val.sparkData && React.createElement(Sparkline, { data: val.sparkData, width: 180, height: 40, color: val.color || '#D4AF37' })}
                        </div>
                    ));
                })}

                {/* Add widget button at end */}
                {renderEmptySlot(widgets.length)}
            </div>

            {/* Close dropdown on outside click */}
            {editingKpi !== null && (
                <div onClick={() => setEditingKpi(null)} style={{
                    position: 'fixed', inset: 0, zIndex: 40, background: 'transparent'
                }}></div>
            )}
        </React.Fragment>
    );
}
