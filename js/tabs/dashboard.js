// ══════════════════════════════════════════════════════════════════
// js/tabs/dashboard.js — DashboardPanel: KPI cards + power rankings
// preview for the Dashboard tab
// Extracted from league-detail.js. Props: all required state from LeagueDetail.
// ══════════════════════════════════════════════════════════════════

function DashboardPanel({
  selectedKpis,
  editingKpi,
  setEditingKpi,
  computeKpiValue,
  KPI_OPTIONS,
  rankedTeams,
  sleeperUserId,
  setActiveTab,
  setSelectedKpis,
}) {
    const kpiCardStyle = { background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px', padding: '10px 12px', textAlign: 'center' };
    const kpiLabelStyle = { fontSize: '0.68rem', color: 'var(--gold)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.08em', marginBottom: '4px', fontWeight: '700' };
    const kpiValueStyle = { fontSize: '1.3rem', fontWeight: '700', color: 'var(--white)', fontFamily: 'Bebas Neue, cursive', lineHeight: 1, letterSpacing: '0.03em' };
    const kpiSubStyle = { fontSize: '0.68rem', color: 'var(--silver)', marginTop: '2px', fontFamily: 'Oswald, sans-serif', opacity: 0.7 };

    const myRankIdx = rankedTeams.findIndex(t => t.userId === sleeperUserId);
    const myTeam = myRankIdx >= 0 ? rankedTeams[myRankIdx] : null;

    return (
        <React.Fragment>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px',
                padding: '16px 24px', background: 'var(--black)',
                borderBottom: '1px solid rgba(212,175,55,0.15)'
            }}>
                {selectedKpis.map((kpiKey, idx) => {
                    const opt = KPI_OPTIONS[kpiKey] || { label: kpiKey, icon: '?', category: '' };
                    const val = computeKpiValue(kpiKey);
                    const isEditing = editingKpi === idx;
                    return (
                        <div key={kpiKey + idx} style={{
                            ...kpiCardStyle, position: 'relative', cursor: 'default',
                            border: isEditing ? '1px solid var(--gold)' : kpiCardStyle.border
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
                                title="Change this KPI"
                            >{isEditing ? '\u2715' : '\u270E'}</button>

                            {/* KPI content */}
                            <div style={{ ...kpiLabelStyle, fontSize: '0.72rem' }}>{opt.icon} {opt.category.toUpperCase()}{opt.tip ? React.createElement(Tip, null, opt.tip) : null}</div>
                            <div style={{ ...kpiValueStyle, color: val.color, fontSize: '1.3rem' }}>{val.value}</div>
                            <div style={kpiSubStyle}>{val.sub}</div>
                            {/* Sparkline visualization */}
                            {typeof Sparkline !== 'undefined' && val.sparkData && React.createElement(Sparkline, { data: val.sparkData, width: 90, height: 24, color: val.color || '#D4AF37' })}
                            {/* Sparkline trend annotation */}
                            {typeof Sparkline !== 'undefined' && val.sparkData && val.sparkData.length >= 2 && (() => {
                                const _first = val.sparkData[0], _last = val.sparkData[val.sparkData.length - 1];
                                if (!_first) return null;
                                const _pct = Math.round((_last - _first) / Math.abs(_first) * 100);
                                if (Math.abs(_pct) < 2) return React.createElement('div', { style:{ fontSize:'0.65rem', color:'var(--silver)', marginTop:'2px', fontFamily:'Oswald, sans-serif', opacity:0.6 } }, '\u2192 Stable');
                                const _up = _pct > 0;
                                return React.createElement('div', { style:{ fontSize:'0.65rem', color: _up ? '#2ECC71' : '#E74C3C', marginTop:'2px', fontFamily:'Oswald, sans-serif', fontWeight:600 } }, (_up ? '\u2191 ' : '\u2193 ') + Math.abs(_pct) + '% projected');
                            })()}
                            {/* Contextual annotation */}
                            {(() => { const ann = getKpiAnnotation(kpiKey, val.value); return ann ? React.createElement('div', { style:{fontSize:'0.7rem',color:'var(--gold)',marginTop:'6px',fontFamily:'Oswald',fontWeight:600,letterSpacing:'0.02em',borderTop:'1px solid rgba(212,175,55,0.15)',paddingTop:'6px'} }, ann) : null; })()}

                            {/* Dropdown picker */}
                            {isEditing && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: '-4px', right: '-4px', marginTop: '4px',
                                    background: '#0a0a0a', border: '2px solid rgba(212,175,55,0.4)',
                                    borderRadius: '8px', zIndex: 50, maxHeight: '220px', overflowY: 'auto',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                                }}>
                                    {Object.entries(KPI_OPTIONS)
                                        .filter(([k]) => !selectedKpis.includes(k) || k === kpiKey)
                                        .map(([k, o]) => {
                                            const isActive = k === kpiKey;
                                            return (
                                                <div key={k} onClick={() => {
                                                    const updated = [...selectedKpis];
                                                    updated[idx] = k;
                                                    setSelectedKpis(updated);
                                                    setEditingKpi(null);
                                                }} style={{
                                                    padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem',
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    background: isActive ? 'rgba(212,175,55,0.15)' : 'transparent',
                                                    color: isActive ? 'var(--gold)' : 'var(--white)',
                                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                    transition: 'background 0.1s'
                                                }}
                                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                                >
                                                    <span style={{ fontSize: '0.8rem' }}>{o.icon}</span>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{o.label}</div>
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--silver)', opacity: 0.6 }}>{o.category}</div>
                                                    </div>
                                                    {isActive && <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: '0.7rem' }}>{'\u2713'}</span>}
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Close dropdown on outside click */}
            {editingKpi !== null && (
                <div onClick={() => setEditingKpi(null)} style={{
                    position: 'fixed', inset: 0, zIndex: 40, background: 'transparent'
                }}></div>
            )}

            {/* Power Rankings (Top 5) on Dashboard */}
            {rankedTeams.length > 0 && (() => {
                return <div style={{ padding: '0 24px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ fontFamily: 'Bebas Neue', fontSize: '1rem', color: 'var(--gold)', letterSpacing: '0.06em' }}>POWER RANKINGS</div>
                        <button onClick={() => setActiveTab('league')} style={{ fontSize: '0.7rem', fontFamily: 'Oswald', color: 'var(--gold)', background: 'none', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>View All</button>
                    </div>
                    {myTeam && <div className="wr-my-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--black)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: '10px' }}>
                        <span style={{ fontFamily: 'Bebas Neue', fontSize: '1.4rem', color: 'var(--gold)' }}>#{myRankIdx + 1}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)' }}>{myTeam.displayName}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>{myTeam.tier} {'\u00B7'} Health {myTeam.healthScore}</div>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--silver)' }}>of {rankedTeams.length}</span>
                    </div>}
                </div>;
            })()}
        </React.Fragment>
    );
}
