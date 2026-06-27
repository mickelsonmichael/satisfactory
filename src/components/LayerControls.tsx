import type { LayerState, CollectibleType } from '../types';

interface Props {
  layerStates: LayerState[];
  onToggle: (type: CollectibleType) => void;
  showCollected: boolean;
  onToggleCollected: () => void;
  sessionName: string;
  saveVersion: number;
}

export default function LayerControls({
  layerStates,
  onToggle,
  showCollected,
  onToggleCollected,
  sessionName,
  saveVersion,
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 1000,
        background: 'rgba(15,15,20,0.92)',
        border: '1px solid #333',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#ddd',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        minWidth: 210,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#fff' }}>
        {sessionName || 'Satisfactory Map'}
      </div>
      {saveVersion > 0 && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
          SaveVersion {saveVersion}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {layerStates.map((ls) => (
          <label
            key={ls.type}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={ls.visible}
              onChange={() => onToggle(ls.type)}
              style={{ accentColor: ls.color, width: 14, height: 14 }}
            />
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: ls.color,
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            />
            <span style={{ flex: 1 }}>{ls.label}</span>
            <span style={{ color: '#888', fontSize: 11 }}>
              {ls.uncollectedCount}
              {ls.collectedCount > 0 && (
                <span style={{ color: '#555' }}> / {ls.collectedCount}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid #333',
          marginTop: 10,
          paddingTop: 8,
        }}
      >
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={showCollected}
            onChange={onToggleCollected}
            style={{ width: 14, height: 14 }}
          />
          <span style={{ color: '#888', fontSize: 12 }}>Show collected</span>
        </label>
      </div>
    </div>
  );
}
