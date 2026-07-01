import { useSave } from '../context/SaveContext';
import { TOP_NAV_HEIGHT } from './TopNav';
import type { AutoRefreshInterval } from '../lib/filterStorage';

interface Props {
  open: boolean;
  onClose: () => void;
  buildingOpacity: number;
  onBuildingOpacityChange: (v: number) => void;
}

const INTERVALS: AutoRefreshInterval[] = [5, 15, 30, 45, 60];

const PANEL_W = 300;

export default function SettingsPanel({ open, onClose, buildingOpacity, onBuildingOpacityChange }: Props) {
  const { autoRefresh, setAutoRefresh, autoRefreshInterval, setAutoRefreshInterval } = useSave();

  if (!open) return null;

  const base: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    color: '#ddd',
  };

  return (
    <>
      {/* Invisible backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1099,
        }}
      />

      {/* Panel */}
      <div
        style={{
          ...base,
          position: 'fixed',
          top: TOP_NAV_HEIGHT + 6,
          right: 12,
          width: PANEL_W,
          zIndex: 1100,
          background: 'rgba(15,15,20,0.97)',
          border: '1px solid #444',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid #333',
          }}
        >
          <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Settings</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '2px 4px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '14px 14px 18px' }}>

          {/* Building Opacity */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Building Overlay
              </span>
              <span style={{ color: '#FA9549', fontWeight: 700, fontSize: 12 }}>
                {Math.round(buildingOpacity * 100)}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#555', fontSize: 11 }}>0%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(buildingOpacity * 100)}
                onChange={(e) => onBuildingOpacityChange(Number(e.target.value) / 100)}
                style={{ flex: 1, accentColor: '#FA9549', cursor: 'pointer' }}
              />
              <span style={{ color: '#555', fontSize: 11 }}>100%</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #2a2a2a', marginBottom: 18 }} />

          {/* Auto-Refresh */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Auto-Refresh
              </span>
            </div>

            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}
              title="Periodically re-check for a newer save and load it automatically"
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={() => setAutoRefresh(!autoRefresh)}
                style={{ accentColor: '#FA9549', width: 14, height: 14 }}
              />
              <span style={{ color: '#888', fontSize: 12 }}>Enabled</span>
            </label>

            {/* Interval selector */}
            <div style={{ opacity: autoRefresh ? 1 : 0.35, transition: 'opacity 0.15s' }}>
              <div style={{ color: '#666', fontSize: 11, marginBottom: 6 }}>Interval</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {INTERVALS.map((m) => (
                  <button
                    key={m}
                    disabled={!autoRefresh}
                    onClick={() => setAutoRefreshInterval(m)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      background: autoRefreshInterval === m ? 'rgba(250,149,73,0.15)' : 'none',
                      border: '1px solid',
                      borderColor: autoRefreshInterval === m ? '#FA9549' : '#333',
                      borderRadius: 5,
                      color: autoRefreshInterval === m ? '#FA9549' : '#666',
                      cursor: autoRefresh ? 'pointer' : 'default',
                      fontSize: 11,
                      fontWeight: autoRefreshInterval === m ? 700 : 400,
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
