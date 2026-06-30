import { useState, useEffect, useRef, useMemo } from 'react';
import { useManifest, saveUrl } from '../hooks/useManifest';
import { useSaveParser } from '../hooks/useSaveParser';
import { LAYER_DEFAULTS } from '../lib/collectibles';
import { BUILDING_CATEGORIES } from '../lib/buildings';
import {
  loadVisibleCollectibles,
  saveVisibleCollectibles,
  loadResourcePurity,
  saveResourcePurity,
  loadBuildingVisibility,
  saveBuildingVisibility,
  loadShowCaves,
  saveShowCaves,
  loadShowHeight,
  saveShowHeight,
  loadAutoRefresh,
  saveAutoRefresh,
  loadSeenDropPodIds,
  mergeSeenDropPodIds,
} from '../lib/filterStorage';
import { extractDropPodIds } from '../lib/parserAdapter';
import type {
  LayerState,
  CollectibleType,
  Building,
  BuildingLine,
  BuildingCategory,
  StaticCollectibles,
  StaticMarker,
  ResourceData,
  ResourcePurity,
  Cave,
  CavesData,
  RecipeData,
} from '../types';
import { analyzeEfficiency } from '../lib/efficiency';
import MapViewer from './MapViewer';
import LayerControls from './LayerControls';
import LoadingOverlay from './LoadingOverlay';

// How often auto-refresh re-checks the manifest for a newer save.
const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Stable empty arrays used before a save loads, so building prop references stay constant.
const EMPTY_BUILDINGS: Building[] = [];
const EMPTY_LINES: BuildingLine[] = [];

function initLayerStates(): LayerState[] {
  // Restore which collectible layers were visible on a previous visit, if any.
  const saved = loadVisibleCollectibles();
  return LAYER_DEFAULTS.map((d) => ({
    ...d,
    visible: saved ? saved.has(d.type) : d.visible,
    uncollectedCount: 0,
    collectedCount: 0,
  }));
}

function initBuildingVisibility(): Record<BuildingCategory, boolean> {
  // Every category defaults OFF (buildings are dense); restore saved selections if any.
  const saved = loadBuildingVisibility();
  return Object.fromEntries(
    BUILDING_CATEGORIES.map((c) => [c.id, saved?.[c.id] ?? false]),
  ) as Record<BuildingCategory, boolean>;
}

export default function App() {
  const { saves, defaultIndex, loading: manifestLoading, refetch } = useManifest();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  // Which save in the (newest-first) history is selected. Initialized to the
  // default once the manifest loads.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [layerStates, setLayerStates] = useState<LayerState[]>(initLayerStates);
  const [showCollected, setShowCollected] = useState(false);
  const [staticMarkers, setStaticMarkers] = useState<StaticMarker[]>([]);
  const [localCollected, setLocalCollected] = useState<Set<string>>(new Set());
  const [resourceData, setResourceData] = useState<ResourceData | null>(null);
  const [caves, setCaves] = useState<Cave[]>([]);
  const [showCaves, setShowCaves] = useState<boolean>(loadShowCaves);
  const [showHeight, setShowHeight] = useState<boolean>(loadShowHeight);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(loadAutoRefresh);
  const [seenDropPodIds, setSeenDropPodIds] = useState<ReadonlySet<string>>(loadSeenDropPodIds);
  const [buildingVisibility, setBuildingVisibility] = useState<Record<BuildingCategory, boolean>>(
    initBuildingVisibility,
  );
  // Per-layer purity visibility: resourcePurity[layerId][purity]. A marker shows when its
  // layer's entry for its own purity is true. Default all off to avoid clutter.
  const [resourcePurity, setResourcePurity] = useState<
    Record<string, Record<ResourcePurity, boolean>>
  >({});
  // Efficiency analysis: heavy flow trace over the factory graph, gated behind a toggle.
  const [recipeData, setRecipeData] = useState<RecipeData | null>(null);
  const [showEfficiency, setShowEfficiency] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

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
        // Restore saved purity selections, but only for layers that still exist.
        const saved = loadResourcePurity();
        setResourcePurity(
          Object.fromEntries(
            data.layers.map((l) => [
              l.id,
              saved?.[l.id] ?? { pure: false, normal: false, impure: false },
            ]),
          ),
        );
      })
      .catch((e) => console.error('Failed to load resourceNodes.json:', e));
  }, []);

  // Load the static cave geometry once on mount (independent of the save file)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/caves.json`)
      .then((r) => r.json())
      .then((data: CavesData) => setCaves(data.caves))
      .catch((e) => console.error('Failed to load caves.json:', e));
  }, []);

  // Recipe rates — needed for both the efficiency feature and the Recipes tab.
  // Fetch lazily on first use of either feature, then keep cached.
  const [needsRecipes, setNeedsRecipes] = useState(false);
  useEffect(() => {
    if ((!showEfficiency && !needsRecipes) || recipeData) return;
    fetch(`${import.meta.env.BASE_URL}data/recipes.json`)
      .then((r) => r.json())
      .then((data: RecipeData) => setRecipeData(data))
      .catch((e) => console.error('Failed to load recipes.json:', e));
  }, [showEfficiency, needsRecipes, recipeData]);

  // Jump to the default save once the manifest has loaded.
  useEffect(() => {
    if (defaultIndex != null) setSelectedIndex(defaultIndex);
  }, [defaultIndex]);

  // Bootstrap: when the "seen" set is empty on first use, scan the oldest available
  // save to seed it. This ensures pods collected before the user started using the app
  // (or in sessions that weren't browsed yet) are still detected. Runs once per device.
  useEffect(() => {
    if (seenDropPodIds.size > 0 || saves.length === 0) return;
    const oldest = saves[saves.length - 1];
    fetch(saveUrl(oldest))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((buf) => {
        const ids = extractDropPodIds(oldest.filename, buf);
        const changed = mergeSeenDropPodIds(ids);
        if (changed) setSeenDropPodIds(loadSeenDropPodIds());
      })
      .catch(() => {});
  // Intentionally only re-run when saves length changes (new manifest load), not on
  // every seenDropPodIds change — once seenDropPodIds is non-empty the guard exits early.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saves.length]);

  // While auto-refresh is on, re-check the manifest every 15 minutes for a newer save.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refetch, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refetch]);

  // Track the newest save's filename so we can detect when a refetch surfaces a new
  // one. When it changes after the initial load, switch to it (the default is always
  // the newest save).
  const lastNewestRef = useRef<string | null>(null);
  useEffect(() => {
    const newest = saves[0]?.filename ?? null;
    if (newest == null) return;
    if (lastNewestRef.current == null) {
      // First sighting; the default-jump effect handles the initial selection.
      lastNewestRef.current = newest;
      return;
    }
    if (newest !== lastNewestRef.current) {
      lastNewestRef.current = newest;
      setUploadedFile(null);
      setSelectedIndex(defaultIndex ?? 0);
    }
  }, [saves, defaultIndex]);

  // The manifest save currently displayed (null while an uploaded file is shown).
  const currentSave = uploadedFile ? null : (saves[selectedIndex] ?? null);
  const source = uploadedFile ?? (currentSave ? saveUrl(currentSave) : null);
  const { result, loading, error, progress, progressMsg } = useSaveParser(
    source,
    staticMarkers,
    seenDropPodIds,
  );

  // Run the flow analysis when enabled (and inputs are ready). It is the one heavy step,
  // so it only runs while the toggle is on; useMemo skips recompute on unrelated renders.
  const efficiency = useMemo(() => {
    if (!showEfficiency || !result?.factory || !recipeData) return null;
    try {
      return analyzeEfficiency(result.factory, recipeData, resourceData);
    } catch (e) {
      console.error('Efficiency analysis failed:', e);
      return null;
    }
  }, [showEfficiency, result, recipeData, resourceData]);

  const selectedResult =
    selectedBuildingId && efficiency ? (efficiency.results[selectedBuildingId] ?? null) : null;

  // A building id is only meaningful for the save it came from; clear it on save change.
  useEffect(() => {
    setSelectedBuildingId(null);
  }, [result]);

  // Accumulate DropPod IDs seen across saves so deconstructed pods (which vanish
  // from the save due to a game bug) can still be detected as collected.
  // Only update state when something genuinely new was added — a new Set object with
  // identical contents would change the reference and re-trigger the useSaveParser
  // effect, creating an infinite reload loop.
  useEffect(() => {
    if (!result || result.dropPodIds.length === 0) return;
    const changed = mergeSeenDropPodIds(result.dropPodIds);
    if (changed) setSeenDropPodIds(loadSeenDropPodIds());
  }, [result]);

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

  function goNewest() {
    if (!canGoNewer) return;
    setUploadedFile(null);
    setSelectedIndex(0);
  }

  function goOldest() {
    if (!canGoOlder) return;
    setUploadedFile(null);
    setSelectedIndex(saves.length - 1);
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

  // Persist filter selections (not the marked/collected state) across refreshes.
  useEffect(() => {
    saveVisibleCollectibles(layerStates.filter((ls) => ls.visible).map((ls) => ls.type));
  }, [layerStates]);

  useEffect(() => {
    // Wait until resource layers have loaded before persisting, so we never
    // overwrite saved selections with the empty initial state.
    if (!resourceData) return;
    saveResourcePurity(resourcePurity);
  }, [resourcePurity, resourceData]);

  useEffect(() => {
    saveShowCaves(showCaves);
  }, [showCaves]);

  useEffect(() => {
    saveShowHeight(showHeight);
  }, [showHeight]);

  useEffect(() => {
    saveAutoRefresh(autoRefresh);
  }, [autoRefresh]);

  useEffect(() => {
    saveBuildingVisibility(buildingVisibility);
  }, [buildingVisibility]);

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

  function toggleBuildingCategory(id: BuildingCategory) {
    setBuildingVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Enabling efficiency also reveals production buildings — the coloring and click-to-select
  // act on those footprints, so without them the map shows nothing to analyze.
  function toggleEfficiency() {
    const next = !showEfficiency;
    setShowEfficiency(next);
    if (next) setBuildingVisibility((prev) => ({ ...prev, production: true }));
  }

  function setAllBuildings(visible: boolean) {
    setBuildingVisibility((prev) =>
      Object.fromEntries(Object.keys(prev).map((id) => [id, visible])) as Record<
        BuildingCategory,
        boolean
      >,
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
        buildings={result?.buildings ?? EMPTY_BUILDINGS}
        buildingLines={result?.buildingLines ?? EMPTY_LINES}
        buildingVisibility={buildingVisibility}
        caves={caves}
        showCaves={showCaves}
        showHeight={showHeight}
        efficiency={efficiency?.results ?? null}
        showEfficiency={showEfficiency}
        selectedBuildingId={selectedBuildingId}
        onSelectBuilding={setSelectedBuildingId}
      />

      <LayerControls
        layerStates={layerStates}
        onToggle={toggleLayer}
        showCollected={showCollected}
        onToggleCollected={() => setShowCollected((v) => !v)}
        showCaves={showCaves}
        onToggleCaves={() => setShowCaves((v) => !v)}
        caveCount={caves.length}
        showHeight={showHeight}
        onToggleHeight={() => setShowHeight((v) => !v)}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        sessionName={result?.sessionName ?? ''}
        saveTimestamp={currentSave?.timestamp ?? null}
        uploadedFileName={uploadedFile?.name ?? null}
        canGoNewer={canGoNewer}
        canGoOlder={canGoOlder}
        onGoNewer={goNewer}
        onGoOlder={goOlder}
        onGoNewest={goNewest}
        onGoOldest={goOldest}
        resourceLayers={resourceData?.layers ?? []}
        resourcePurity={resourcePurity}
        onTogglePurity={toggleResourcePurity}
        onSetAllResources={setAllResources}
        buildings={result?.buildings ?? EMPTY_BUILDINGS}
        buildingLines={result?.buildingLines ?? EMPTY_LINES}
        buildingVisibility={buildingVisibility}
        onToggleBuildingCategory={toggleBuildingCategory}
        onSetAllBuildings={setAllBuildings}
        onFileSelected={setUploadedFile}
        stats={result?.stats ?? null}
        showEfficiency={showEfficiency}
        onToggleEfficiency={toggleEfficiency}
        efficiency={efficiency}
        selectedResult={selectedResult}
        onSelectBuilding={setSelectedBuildingId}
        onCloseSelected={() => setSelectedBuildingId(null)}
        recipeData={recipeData}
        markers={result?.markers ?? []}
        unlockedSchematics={result?.unlockedSchematics ?? []}
        onShowRecipes={() => setNeedsRecipes(true)}
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
