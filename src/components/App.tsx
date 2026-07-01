import { useState, useEffect, useMemo } from 'react';
import { useSave } from '../context/SaveContext';
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
  loadBuildingOpacity,
  saveBuildingOpacity,
  loadShowDisconnections,
  saveShowDisconnections,
} from '../lib/filterStorage';
import type {
  LayerState,
  CollectibleType,
  Building,
  BuildingLine,
  BuildingCategory,
  ResourceData,
  ResourcePurity,
  Cave,
  CavesData,
  RecipeData,
} from '../types';
import { analyzeEfficiency } from '../lib/efficiency';
import MapViewer from './MapViewer';
import LayerControls from './LayerControls';
import LoadingOverlay, { PageLoader } from './LoadingOverlay';
import TopNav, { TOP_NAV_HEIGHT } from './TopNav';
import StatsPanel from './StatsPanel';
import RecipesPanel from './RecipesPanel';
import SettingsPanel from './SettingsPanel';

// Stable empty arrays used before a save loads, so building prop references stay constant.
const EMPTY_BUILDINGS: Building[] = [];
const EMPTY_LINES: BuildingLine[] = [];

function initLayerStates(): LayerState[] {
  const saved = loadVisibleCollectibles();
  return LAYER_DEFAULTS.map((d) => ({
    ...d,
    visible: saved ? saved.has(d.type) : d.visible,
    uncollectedCount: 0,
    collectedCount: 0,
  }));
}

function initBuildingVisibility(): Record<BuildingCategory, boolean> {
  const saved = loadBuildingVisibility();
  return Object.fromEntries(
    BUILDING_CATEGORIES.map((c) => [c.id, saved?.[c.id] ?? false]),
  ) as Record<BuildingCategory, boolean>;
}

export default function App() {
  const { result, loading, manifestLoading, progressMsg, error, activeView } = useSave();

  const [layerStates, setLayerStates] = useState<LayerState[]>(initLayerStates);
  const [showCollected, setShowCollected] = useState(false);
  const [localCollected, setLocalCollected] = useState<Set<string>>(new Set());
  const [resourceData, setResourceData] = useState<ResourceData | null>(null);
  const [caves, setCaves] = useState<Cave[]>([]);
  const [showCaves, setShowCaves] = useState<boolean>(loadShowCaves);
  const [showHeight, setShowHeight] = useState<boolean>(loadShowHeight);
  const [buildingVisibility, setBuildingVisibility] = useState<Record<BuildingCategory, boolean>>(
    initBuildingVisibility,
  );
  const [resourcePurity, setResourcePurity] = useState<
    Record<string, Record<ResourcePurity, boolean>>
  >({});
  const [recipeData, setRecipeData] = useState<RecipeData | null>(null);
  const [showEfficiency, setShowEfficiency] = useState(false);
  const [showDisconnections, setShowDisconnections] = useState(loadShowDisconnections);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [buildingOpacity, setBuildingOpacity] = useState<number>(loadBuildingOpacity);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load static resource node database (independent of the save file).
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/resourceNodes.json`)
      .then((r) => r.json())
      .then((data: ResourceData) => {
        setResourceData(data);
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

  // Load static cave geometry (independent of the save file).
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/caves.json`)
      .then((r) => r.json())
      .then((data: CavesData) => setCaves(data.caves))
      .catch((e) => console.error('Failed to load caves.json:', e));
  }, []);

  // Recipe rates — loaded lazily the first time the user navigates to either
  // the Recipes view or enables the efficiency analysis.
  useEffect(() => {
    if ((activeView !== 'recipes' && !showEfficiency) || recipeData) return;
    fetch(`${import.meta.env.BASE_URL}data/recipes.json`)
      .then((r) => r.json())
      .then((data: RecipeData) => setRecipeData(data))
      .catch((e) => console.error('Failed to load recipes.json:', e));
  }, [activeView, showEfficiency, recipeData]);

  // Derive layer counts from the full marker set.
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

  // Clear building selection when the displayed save changes.
  useEffect(() => {
    setSelectedBuildingId(null);
  }, [result]);

  // Persist filter selections across page loads.
  useEffect(() => {
    saveVisibleCollectibles(layerStates.filter((ls) => ls.visible).map((ls) => ls.type));
  }, [layerStates]);

  useEffect(() => {
    if (!resourceData) return;
    saveResourcePurity(resourcePurity);
  }, [resourcePurity, resourceData]);

  useEffect(() => { saveShowCaves(showCaves); }, [showCaves]);
  useEffect(() => { saveShowHeight(showHeight); }, [showHeight]);
  useEffect(() => { saveBuildingVisibility(buildingVisibility); }, [buildingVisibility]);
  useEffect(() => { saveBuildingOpacity(buildingOpacity); }, [buildingOpacity]);

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

  const disconnectionCount = useMemo(() => {
    if (!result?.factory) return 0;
    return result.factory.nodes.filter(
      (n) =>
        (n.kind === 'factory' || n.kind === 'extractor') &&
        !/FrackingCore/i.test(n.cls) &&
        (
          !n.hasPower ||
          (n.openInputs > 0 && n.connectedInputs === 0) ||
          (n.openOutputs > 0 && n.connectedOutputs === 0)
        ),
    ).length;
  }, [result?.factory]);

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

  const pageStyle: React.CSSProperties = {
    position: 'fixed',
    top: TOP_NAV_HEIGHT,
    left: 0,
    right: 0,
    bottom: 0,
    overflowY: 'auto',
    background: 'rgba(15,15,20,0.97)',
    color: '#ddd',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
  };

  const pageInner: React.CSSProperties = {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '36px 48px',
  };

  return (
    <>
      <TopNav onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        buildingOpacity={buildingOpacity}
        onBuildingOpacityChange={setBuildingOpacity}
      />

      {/* Map view: kept mounted so Leaflet retains its viewport state */}
      <div
        style={{
          position: 'fixed',
          top: TOP_NAV_HEIGHT,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#000',
          display: activeView === 'map' ? 'block' : 'none',
        }}
      >
        <LoadingOverlay visible={loading || manifestLoading} message={progressMsg} />

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
          factory={result?.factory ?? null}
          showDisconnections={showDisconnections}
          buildingOpacity={buildingOpacity}
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
          resourceLayers={resourceData?.layers ?? []}
          resourcePurity={resourcePurity}
          onTogglePurity={toggleResourcePurity}
          onSetAllResources={setAllResources}
          buildings={result?.buildings ?? EMPTY_BUILDINGS}
          buildingLines={result?.buildingLines ?? EMPTY_LINES}
          buildingVisibility={buildingVisibility}
          onToggleBuildingCategory={toggleBuildingCategory}
          onSetAllBuildings={setAllBuildings}
          showEfficiency={showEfficiency}
          onToggleEfficiency={toggleEfficiency}
          efficiency={efficiency}
          selectedResult={selectedResult}
          onSelectBuilding={setSelectedBuildingId}
          onCloseSelected={() => setSelectedBuildingId(null)}
          showDisconnections={showDisconnections}
          onToggleDisconnections={() => setShowDisconnections((v) => { saveShowDisconnections(!v); return !v; })}
          disconnectionCount={disconnectionCount}
        />
      </div>

      {activeView === 'stats' && (
        <div style={pageStyle}>
          {loading || manifestLoading ? (
            <PageLoader message={progressMsg || undefined} />
          ) : (
            <div style={pageInner}>
              <StatsPanel stats={result?.stats ?? null} />
            </div>
          )}
        </div>
      )}

      {activeView === 'recipes' && (
        <div style={pageStyle}>
          {loading || manifestLoading ? (
            <PageLoader message={progressMsg || undefined} />
          ) : !recipeData ? (
            <PageLoader message="Loading recipe data…" />
          ) : (
            <div style={pageInner}>
              <RecipesPanel
                recipeData={recipeData}
                markers={result?.markers ?? []}
                unlockedSchematics={result?.unlockedSchematics ?? []}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 1003,
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
    </>
  );
}
