import { useEffect, useState } from 'react';
import type { Manifest } from '../types';

interface UseManifestResult {
  manifest: Manifest | null;
  defaultSavePath: string | null;
  loading: boolean;
  error: string | null;
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}saves/manifest.json`)
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

  const defaultSave = manifest?.saves.find((s) => s.filename === manifest.default) ?? manifest?.saves[0];
  // manifest paths are repo-relative (e.g. "saves/foo.sav"); prefix BASE_URL so the
  // fetch resolves correctly under a non-root base (GitHub Pages /satisfactory/).
  const defaultSavePath = defaultSave ? `${import.meta.env.BASE_URL}${defaultSave.path}` : null;

  return {
    manifest,
    defaultSavePath,
    loading,
    error,
  };
}
