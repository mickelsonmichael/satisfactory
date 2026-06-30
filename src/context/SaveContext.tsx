import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useManifest, saveUrl } from '../hooks/useManifest';
import { useSaveParser } from '../hooks/useSaveParser';
import { extractDropPodIds } from '../lib/parserAdapter';
import {
  loadAutoRefresh,
  saveAutoRefresh,
  loadSeenDropPodIds,
  mergeSeenDropPodIds,
} from '../lib/filterStorage';
import type { ManifestSave, ParseResult, StaticCollectibles, StaticMarker } from '../types';

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type ActiveView = 'map' | 'stats' | 'recipes';

export interface SaveContextValue {
  saves: ManifestSave[];
  currentSave: ManifestSave | null;
  activeView: ActiveView;
  setActiveView: (v: ActiveView) => void;
  uploadedFile: File | null;
  setUploadedFile: (f: File | null) => void;
  result: ParseResult | null;
  loading: boolean;
  manifestLoading: boolean;
  error: string | null;
  progress: number;
  progressMsg: string;
  canGoNewer: boolean;
  canGoOlder: boolean;
  goNewer: () => void;
  goOlder: () => void;
  goNewest: () => void;
  goOldest: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

export function useSave(): SaveContextValue {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error('useSave must be used within <SaveProvider>');
  return ctx;
}

export function SaveProvider({ children }: { children: ReactNode }) {
  const [staticMarkers, setStaticMarkers] = useState<StaticMarker[]>([]);
  const [activeView, setActiveView] = useState<ActiveView>('map');
  const { saves, defaultIndex, loading: manifestLoading, refetch } = useManifest();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoRefresh, setAutoRefreshState] = useState<boolean>(loadAutoRefresh);
  const [seenDropPodIds, setSeenDropPodIds] = useState<ReadonlySet<string>>(loadSeenDropPodIds);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/collectibles.json`)
      .then((r) => r.json())
      .then((data: StaticCollectibles) => setStaticMarkers(data.markers))
      .catch((e) => console.error('Failed to load collectibles.json:', e));
  }, []);

  const setAutoRefresh = useCallback((v: boolean) => {
    setAutoRefreshState(v);
    saveAutoRefresh(v);
  }, []);

  // Jump to the default save once the manifest has loaded.
  useEffect(() => {
    if (defaultIndex != null) setSelectedIndex(defaultIndex);
  }, [defaultIndex]);

  // Bootstrap: when the "seen" set is empty on first use, scan the oldest available
  // save to seed it. Ensures pods collected before the app was first opened are detected.
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
    // Intentionally only re-run when saves length changes, not on every seenDropPodIds change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saves.length]);

  // While auto-refresh is on, re-check the manifest every 15 minutes for a newer save.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refetch, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, refetch]);

  // When a refetch surfaces a newer save (its filename changes), jump to it automatically.
  const lastNewestRef = useRef<string | null>(null);
  useEffect(() => {
    const newest = saves[0]?.filename ?? null;
    if (newest == null) return;
    if (lastNewestRef.current == null) {
      lastNewestRef.current = newest;
      return;
    }
    if (newest !== lastNewestRef.current) {
      lastNewestRef.current = newest;
      setUploadedFile(null);
      setSelectedIndex(defaultIndex ?? 0);
    }
  }, [saves, defaultIndex]);

  const currentSave = uploadedFile ? null : (saves[selectedIndex] ?? null);
  const source = uploadedFile ?? (currentSave ? saveUrl(currentSave) : null);
  const { result, loading, error, progress, progressMsg } = useSaveParser(
    source,
    staticMarkers,
    seenDropPodIds,
  );

  // Accumulate DropPod IDs seen across saves so deconstructed pods can still be detected.
  useEffect(() => {
    if (!result || result.dropPodIds.length === 0) return;
    const changed = mergeSeenDropPodIds(result.dropPodIds);
    if (changed) setSeenDropPodIds(loadSeenDropPodIds());
  }, [result]);

  const canGoNewer = saves.length > 0 && selectedIndex > 0;
  const canGoOlder = saves.length > 0 && selectedIndex < saves.length - 1;

  const goNewer = useCallback(() => {
    setUploadedFile(null);
    setSelectedIndex((i) => Math.max(0, i - 1));
  }, []);

  const goOlder = useCallback(() => {
    setUploadedFile(null);
    setSelectedIndex((i) => i + 1);
  }, []);

  const goNewest = useCallback(() => {
    setUploadedFile(null);
    setSelectedIndex(0);
  }, []);

  const goOldest = useCallback(() => {
    setUploadedFile(null);
    setSelectedIndex(saves.length - 1);
  }, [saves.length]);

  const value: SaveContextValue = {
    saves,
    currentSave,
    activeView,
    setActiveView,
    uploadedFile,
    setUploadedFile,
    result,
    loading,
    manifestLoading,
    error,
    progress,
    progressMsg,
    canGoNewer,
    canGoOlder,
    goNewer,
    goOlder,
    goNewest,
    goOldest,
    autoRefresh,
    setAutoRefresh,
  };

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}
