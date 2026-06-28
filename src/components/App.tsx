import { useState, useEffect } from 'react';
import { useManifest, saveUrl } from '../hooks/useManifest';
import { useSaveParser } from '../hooks/useSaveParser';
import { LAYER_DEFAULTS } from '../lib/collectibles';
import type {
  LayerState,
  CollectibleType,
  StaticCollectibles,
  StaticMarker,
  ResourceData,
  ResourcePurity,
} from '../types';
import MapViewer from './MapViewer';
import LayerControls from './LayerControls';
import LoadingOverlay from './LoadingOverlay';

function initLayerStates(): LayerState[] {
  return LAYER_DEFAULTS.map((d) => ({
    ...d,
    uncollectedCount: 0,
    collectedCount: 0,
  }));
}

export default function App() {
  const { saves, defaultIndex, loading: manifestLoading } = useManifest();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  // Which save in the (newest-first) history is selected. Initialized to the
  // default once the manifest loads.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [layerStates, setLayerStates] = useState<LayerState[]>(initLayerStates);
  const [showCollected, setShowCollected] = useState(false);
  const [staticMarkers, setStaticMarkers] = useState<StaticMarker[]>([]);
  const [localCollected, setLocalCollected] = useState<Set<string>>(new Set());
  const [resourceData, setResourceData] = useState<ResourceData | null>(null);
  // Per-layer purity visibility: resourcePurity[layerId][purity]. A marker shows when its
  // layer's entry for its own purity is true. Default all off to avoid clutter.
  const [resourcePurity, setResourcePurity] = useState<
    Record<string, Record<ResourcePurity, boolean>>
  >({});

  // Load the game's complete collectible database once on mount
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/collectibles.json`)
      .then((r) => r.json())
      .then((data: StaticCollectibles) => setStaticMarkers(data.markers))
      .catch((e) => console.error('Failed to load collectibles.json:', e));
  }, []);

  // Load the static resource node database once on mount (independent of the save file)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/resourceNodes.json`)
      .then((r) => r.json())
      .then((data: ResourceData) => {
        setResourceData(data);
        setResourcePurity(
          Object.fromEntries(
            data.layers.map((l) => [l.id, { pure: false, normal: false, impure: false }]),
          ),
        );
      })
      .catch((e) => console.error('Failed to load resourceNodes.json:', e));
  }, []);

  // Jump to the default save once the manifest has loaded.
  useEffect(() => {
    if (defaultIndex != null) setSelectedIndex(defaultIndex);
  }, [defaultIndex]);

  // The manifest save currently displayed (null while an uploaded file is shown).
  const currentSave = uploadedFile ? null : (saves[selectedIndex] ?? null);
  const source = uploadedFile ?? (currentSave ? saveUrl(currentSave) : null);
  const { result, loading, error, progress, progressMsg } = useSaveParser(source, staticMarkers);

  // History navigation. saves is newest-first, so a lower index is newer.
  const canGoNewer = saves.length > 0 && selectedIndex > 0;
  const canGoOlder = saves.length > 0 && selectedIndex < saves.length - 1;

  function goNewer() {
    if (!canGoNewer) return;
    setUploadedFile(null);
    setSelectedIndex((i) => i - 1);
  }

  function goOlder() {
    if (!canGoOlder) return;
    setUploadedFile(null);
    setSelectedIndex((i) => i + 1);
  }

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

  function markCollected(id: string) {
    setLocalCollected((prev) => new Set(prev).add(id));
  }

  function toggleLayer(type: CollectibleType) {
    setLayerStates((prev) =>
      prev.map((ls) => (ls.type === type ? { ...ls, visible: !ls.visible } : ls)),
    );
  }

  function toggleResourcePurity(id: string, purity: ResourcePurity) {
    setResourcePurity((prev) => ({
      ...prev,
      [id]: { ...prev[id], [purity]: !prev[id]?.[purity] },
    }));
  }

  function setAllResources(visible: boolean) {
    setResourcePurity((prev) =>
      Object.fromEntries(
        Object.keys(prev).map((id) => [id, { pure: visible, normal: visible, impure: visible }]),
      ),
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      <LoadingOverlay visible={loading || manifestLoading} progress={progress} message={progressMsg} />

      <MapViewer
        result={result}
        layerStates={layerStates}
        showCollected={showCollected}
        localCollected={localCollected}
        onMarkCollected={markCollected}
        resourceData={resourceData}
        resourcePurity={resourcePurity}
      />

      <LayerControls
        layerStates={layerStates}
        onToggle={toggleLayer}
        showCollected={showCollected}
        onToggleCollected={() => setShowCollected((v) => !v)}
        sessionName={result?.sessionName ?? ''}
        saveTimestamp={currentSave?.timestamp ?? null}
        uploadedFileName={uploadedFile?.name ?? null}
        canGoNewer={canGoNewer}
        canGoOlder={canGoOlder}
        onGoNewer={goNewer}
        onGoOlder={goOlder}
        resourceLayers={resourceData?.layers ?? []}
        resourcePurity={resourcePurity}
        onTogglePurity={toggleResourcePurity}
        onSetAllResources={setAllResources}
        onFileSelected={setUploadedFile}
      />

      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
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
