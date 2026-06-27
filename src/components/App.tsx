import { useState, useEffect } from 'react';
import { useManifest } from '../hooks/useManifest';
import { useSaveParser } from '../hooks/useSaveParser';
import { LAYER_DEFAULTS } from '../lib/collectibles';
import type { LayerState, CollectibleType, StaticCollectibles, StaticMarker } from '../types';
import MapViewer from './MapViewer';
import LayerControls from './LayerControls';
import LoadingOverlay from './LoadingOverlay';
import FileUpload from './FileUpload';

function initLayerStates(): LayerState[] {
  return LAYER_DEFAULTS.map((d) => ({
    ...d,
    uncollectedCount: 0,
    collectedCount: 0,
  }));
}

export default function App() {
  const { defaultSavePath, loading: manifestLoading } = useManifest();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [layerStates, setLayerStates] = useState<LayerState[]>(initLayerStates);
  const [showCollected, setShowCollected] = useState(false);
  const [staticMarkers, setStaticMarkers] = useState<StaticMarker[]>([]);

  // Load the game's complete collectible database once on mount
  useEffect(() => {
    fetch('/data/collectibles.json')
      .then((r) => r.json())
      .then((data: StaticCollectibles) => setStaticMarkers(data.markers))
      .catch((e) => console.error('Failed to load collectibles.json:', e));
  }, []);

  const source = uploadedFile ?? defaultSavePath;
  const { result, loading, error, progress, progressMsg } = useSaveParser(source, staticMarkers);

  // Derive layer counts from the full marker set
  useEffect(() => {
    if (!result) return;
    setLayerStates((prev) =>
      prev.map((ls) => {
        const mine = result.markers.filter((m) => m.type === ls.type);
        return {
          ...ls,
          uncollectedCount: mine.filter((m) => !m.collected).length,
          collectedCount: mine.filter((m) => m.collected).length,
        };
      }),
    );
  }, [result]);

  function toggleLayer(type: CollectibleType) {
    setLayerStates((prev) =>
      prev.map((ls) => (ls.type === type ? { ...ls, visible: !ls.visible } : ls)),
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#111' }}>
      <LoadingOverlay visible={loading || manifestLoading} progress={progress} message={progressMsg} />

      <MapViewer result={result} layerStates={layerStates} showCollected={showCollected} />

      <LayerControls
        layerStates={layerStates}
        onToggle={toggleLayer}
        showCollected={showCollected}
        onToggleCollected={() => setShowCollected((v) => !v)}
        sessionName={result?.sessionName ?? ''}
        saveVersion={result?.saveVersion ?? 0}
      />

      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1000,
          width: 170,
        }}
      >
        <FileUpload onFileSelected={setUploadedFile} />
      </div>

      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 60,
            right: 16,
            zIndex: 1000,
            background: '#7f1d1d',
            color: '#fca5a5',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            maxWidth: 300,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
