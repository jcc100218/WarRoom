// strategy-editor.js — AI GM Strategy Editor
// Pure UI. Zero strategy logic. Calls window.GMStrategy (from shared/strategy.js on Scout CDN).

function StrategyEditor({ onClose }) {
  const GMStrategy = window.GMStrategy;

  const [saved, setSaved] = React.useState(false);
  const [strategy, setStrategy] = React.useState(() => {
    if (GMStrategy?.getStrategy) return GMStrategy.getStrategy();
    return {
      mode: 'balanced',
      targetPositions: [],
      sellPositions: [],
      aggression: 'medium',
      draftStyle: 'bpa',
      alexPersonality: 'balanced',
    };
  });

  const set = (key, val) => setStrategy(prev => ({ ...prev, [key]: val }));

  const toggleArr = (key, val) => setStrategy(prev => {
    const arr = prev[key] || [];
    return { ...prev, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
  });

  const handleSave = () => {
    if (!GMStrategy?.saveStrategy) {
      console.warn('[StrategyEditor] GMStrategy not loaded');
      return;
    }
    GMStrategy.saveStrategy({ ...strategy, lastSyncedFrom: 'warroom' });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'PICKS'];

  const pill = (label, active, onClick) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: '7px 16px',
        borderRadius: 20,
        border: active ? '1.5px solid #D4AF37' : '1.5px solid rgba(212,175,55,0.25)',
        background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
        color: active ? '#D4AF37' : '#9090A8',
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        fontFamily: "'DM Sans', sans-serif",
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );

  const posChip = (pos, key) => {
    const active = (strategy[key] || []).includes(pos);
    return (
      <button
        key={pos}
        onClick={() => toggleArr(key, pos)}
        style={{
          padding: '5px 12px',
          borderRadius: 6,
          border: active ? '1.5px solid #D4AF37' : '1.5px solid rgba(255,255,255,0.1)',
          background: active ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)',
          color: active ? '#D4AF37' : '#9090A8',
          fontSize: 12,
          fontWeight: active ? 700 : 400,
          fontFamily: "'DM Sans', sans-serif",
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >{pos}</button>
    );
  };

  const section = (label) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(212,175,55,0.55)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>
      {label}
    </div>
  );

  const notLoaded = !GMStrategy;

  return (
    <div style={{
      background: '#111114',
      border: '1px solid rgba(212,175,55,0.2)',
      borderRadius: 14,
      padding: '24px 20px 20px',
      fontFamily: "'DM Sans', sans-serif",
      color: '#E8E8F0',
      maxWidth: 560,
      margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#E8E8F0' }}>AI GM Strategy</div>
          <div style={{ fontSize: 12, color: '#9090A8', marginTop: 2 }}>
            {notLoaded
              ? '⚠ GMStrategy not loaded — check CDN'
              : 'Settings sync to Scout automatically'}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9090A8', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        )}
      </div>

      {/* Mode */}
      <div style={{ marginBottom: 20 }}>
        {section('Mode')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Rebuild', val: 'rebuild' },
            { label: 'Balanced Rebuild', val: 'balanced_rebuild' },
            { label: 'Retool', val: 'retool' },
            { label: 'Win Now', val: 'win_now' },
          ].map(({ label, val }) => pill(label, strategy.mode === val, () => set('mode', val)))}
        </div>
      </div>

      {/* Target Positions */}
      <div style={{ marginBottom: 20 }}>
        {section('Target Positions (acquire)')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {POSITIONS.map(pos => posChip(pos, 'targetPositions'))}
        </div>
      </div>

      {/* Sell Positions */}
      <div style={{ marginBottom: 20 }}>
        {section('Sell Positions (trade away)')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {POSITIONS.map(pos => posChip(pos, 'sellPositions'))}
        </div>
      </div>

      {/* Aggression */}
      <div style={{ marginBottom: 20 }}>
        {section('Trade Aggression')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Conservative', val: 'low' },
            { label: 'Medium', val: 'medium' },
            { label: 'Aggressive', val: 'high' },
          ].map(({ label, val }) => pill(label, strategy.aggression === val, () => set('aggression', val)))}
        </div>
      </div>

      {/* Draft Style */}
      <div style={{ marginBottom: 20 }}>
        {section('Draft Style')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Accumulate', val: 'accumulate' },
            { label: 'Consolidate', val: 'consolidate' },
            { label: 'Need', val: 'positional_need' },
            { label: 'BPA', val: 'bpa' },
          ].map(({ label, val }) => pill(label, strategy.draftStyle === val, () => set('draftStyle', val)))}
        </div>
      </div>

      {/* Alex Personality */}
      <div style={{ marginBottom: 24 }}>
        {section('Alex Personality')}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Aggressive', val: 'aggressive' },
            { label: 'Value Hunter', val: 'value_hunter' },
            { label: 'Balanced', val: 'balanced' },
          ].map(({ label, val }) => pill(label, strategy.alexPersonality === val, () => set('alexPersonality', val)))}
        </div>
      </div>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={handleSave}
          disabled={notLoaded}
          style={{
            padding: '10px 28px',
            borderRadius: 8,
            background: notLoaded ? '#333' : 'linear-gradient(135deg,#D4AF37,#B8941F)',
            border: 'none',
            color: notLoaded ? '#666' : '#000',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
            cursor: notLoaded ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          Save Strategy
        </button>

        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2ECC71', fontSize: 13, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ECC71', display: 'inline-block' }}></span>
            Synced to Scout
          </div>
        )}
      </div>
    </div>
  );
}

window.StrategyEditor = StrategyEditor;
