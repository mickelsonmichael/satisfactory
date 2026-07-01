import { useState } from 'react';
import { useSave } from '../context/SaveContext';
import { TOP_NAV_HEIGHT } from './TopNav';
import { clearAllCached } from '../lib/parseCache';
import type { AutoRefreshInterval } from '../lib/filterStorage';

interface Props {
  open: boolean;
  onClose: () => void;
  buildingOpacity: number;
  onBuildingOpacityChange: (v: number) => void;
}

const INTERVALS: AutoRefreshInterval[] = [5, 15, 30, 60];

const PANEL_W = 300;

export default function SettingsPanel({ open, onClose, buildingOpacity, onBuildingOpacityChange }: Props) {
  const { autoRefresh, setAutoRefresh, autoRefreshInterval, setAutoRefreshInterval } = useSave();
  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'cleared' | 'error'>('idle');

  async function handleClearCache() {
    setClearState('clearing');
    try {
      await clearAllCached();
      setClearState('cleared');
      setTimeout(() => setClearState('idle'), 2000);
    } catch {
      setClearState('error');
      setTimeout(() => setClearState('idle'), 2000);
    }
  }

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

            <div style={{ display: 'flex', gap: 4 }}>
              {/* Off button */}
              <button
                onClick={() => setAutoRefresh(false)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  background: !autoRefresh ? 'rgba(250,149,73,0.15)' : 'none',
                  border: '1px solid',
                  borderColor: !autoRefresh ? '#FA9549' : '#333',
                  borderRadius: 5,
                  color: !autoRefresh ? '#FA9549' : '#666',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: !autoRefresh ? 700 : 400,
                }}
              >
                Off
              </button>

              {INTERVALS.map((m) => (
                <button
                  key={m}
                  onClick={() => { setAutoRefresh(true); setAutoRefreshInterval(m); }}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    background: autoRefresh && autoRefreshInterval === m ? 'rgba(250,149,73,0.15)' : 'none',
                    border: '1px solid',
                    borderColor: autoRefresh && autoRefreshInterval === m ? '#FA9549' : '#333',
                    borderRadius: 5,
                    color: autoRefresh && autoRefreshInterval === m ? '#FA9549' : '#666',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: autoRefresh && autoRefreshInterval === m ? 700 : 400,
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #2a2a2a', margin: '18px 0 16px' }} />

          {/* Parse Cache */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Parse Cache
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                Up to 3 recent saves cached locally
              </div>
            </div>
            <button
              onClick={handleClearCache}
              disabled={clearState !== 'idle'}
              style={{
                padding: '5px 12px',
                background: clearState === 'cleared'
                  ? 'rgba(250,149,73,0.15)'
                  : clearState === 'error'
                  ? 'rgba(200,60,60,0.15)'
                  : 'none',
                border: '1px solid',
                borderColor: clearState === 'cleared'
                  ? '#FA9549'
                  : clearState === 'error'
                  ? '#c83c3c'
                  : '#444',
                borderRadius: 5,
                color: clearState === 'cleared'
                  ? '#FA9549'
                  : clearState === 'error'
                  ? '#c83c3c'
                  : '#aaa',
                cursor: clearState === 'idle' ? 'pointer' : 'default',
                fontSize: 11,
                fontWeight: clearState !== 'idle' ? 700 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {clearState === 'clearing' ? 'Clearing…' : clearState === 'cleared' ? 'Cleared!' : clearState === 'error' ? 'Error' : 'Clear cache'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
