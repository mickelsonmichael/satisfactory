import { useState } from 'react';
import type { LayerState, CollectibleType, ResourceLayer } from '../types';

interface Props {
  layerStates: LayerState[];
  onToggle: (type: CollectibleType) => void;
  showCollected: boolean;
  onToggleCollected: () => void;
  sessionName: string;
  saveVersion: number;
  resourceLayers: ResourceLayer[];
  resourceVisible: Record<string, boolean>;
  onToggleResource: (id: string) => void;
  onSetAllResources: (visible: boolean) => void;
}

const ICON_BASE = `${import.meta.env.BASE_URL}icons/resources/`;

export default function LayerControls({
  layerStates,
  onToggle,
  showCollected,
  onToggleCollected,
  sessionName,
  saveVersion,
  resourceLayers,
  resourceVisible,
  onToggleResource,
  onSetAllResources,
}: Props) {
  const [resourcesExpanded, setResourcesExpanded] = useState(false);

  const visibleCount = resourceLayers.filter((l) => resourceVisible[l.id]).length;
  const allVisible = resourceLayers.length > 0 && visibleCount === resourceLayers.length;
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

      {resourceLayers.length > 0 && (
        <div style={{ borderTop: '1px solid #333', marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setResourcesExpanded((v) => !v)}
              title={resourcesExpanded ? 'Collapse' : 'Expand'}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
                width: 12,
                lineHeight: 1,
              }}
            >
              {resourcesExpanded ? '▼' : '▶'}
            </button>
            <span
              style={{ flex: 1, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setResourcesExpanded((v) => !v)}
            >
              Resource Nodes
            </span>
            <button
              onClick={() => onSetAllResources(!allVisible)}
              style={{
                background: 'none',
                border: '1px solid #444',
                borderRadius: 4,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 10,
                padding: '1px 6px',
              }}
            >
              {allVisible ? 'None' : 'All'}
            </button>
          </div>

          {resourcesExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {resourceLayers.map((layer, i) => {
                const prev = resourceLayers[i - 1];
                const groupBreak = i === 0 || prev.group !== layer.group;
                return (
                  <div key={layer.id}>
                    {groupBreak && (
                      <div
                        style={{
                          color: '#666',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          margin: i === 0 ? '0 0 2px' : '6px 0 2px',
                        }}
                      >
                        {layer.group === 'well' ? 'Resource Wells' : 'Nodes'}
                      </div>
                    )}
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={resourceVisible[layer.id] ?? false}
                        onChange={() => onToggleResource(layer.id)}
                        style={{ width: 14, height: 14 }}
                      />
                      <img
                        src={`${ICON_BASE}${layer.icon}`}
                        alt=""
                        width={16}
                        height={16}
                        style={{ flexShrink: 0, objectFit: 'contain' }}
                      />
                      <span style={{ flex: 1 }}>{layer.name}</span>
                      <span style={{ color: '#888', fontSize: 11 }}>{layer.markers.length}</span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
