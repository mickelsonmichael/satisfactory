import { useEffect, useState } from 'react';
import type { Manifest, ManifestSave } from '../types';

interface UseManifestResult {
  manifest: Manifest | null;
  /** All saves, ordered newest-first (index 0 is the most recent). */
  saves: ManifestSave[];
  /** Index of the default save within `saves`, or null until the manifest loads. */
  defaultIndex: number | null;
  loading: boolean;
  error: string | null;
}

/** Build a fetchable URL from a repo-relative manifest path. */
export function saveUrl(save: ManifestSave): string {
  // manifest paths are repo-relative (e.g. "saves/foo.sav"); prefix BASE_URL so the
  // fetch resolves correctly under a non-root base (GitHub Pages /satisfactory/).
  return `${import.meta.env.BASE_URL}${save.path}`;
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The manifest URL is stable but its contents change on every deploy, so a
    // cached copy goes stale and hides newly pushed saves until a hard refresh.
    // `no-cache` forces a revalidation each load (cheap 304 when unchanged).
    fetch(`${import.meta.env.BASE_URL}saves/manifest.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Manifest>;
      })
      .then((m) => {
        setManifest(m);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const saves = manifest?.saves ?? [];
  let defaultIndex: number | null = null;
  if (manifest) {
    const i = saves.findIndex((s) => s.filename === manifest.default);
    defaultIndex = i >= 0 ? i : saves.length > 0 ? 0 : null;
  }

  return {
    manifest,
    saves,
    defaultIndex,
    loading,
    error,
  };
}
