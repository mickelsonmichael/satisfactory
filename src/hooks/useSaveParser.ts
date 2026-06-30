import { useEffect, useRef, useState } from 'react';
import { parseSaveFile } from '../lib/parserAdapter';
import type { ParseResult, StaticMarker } from '../types';

interface UseSaveParserResult {
  result: ParseResult | null;
  loading: boolean;
  error: string | null;
  progress: number;
  progressMsg: string;
}

export function useSaveParser(
  source: File | string | null,
  staticMarkers: StaticMarker[],
  seenDropPodIds: ReadonlySet<string>,
): UseSaveParserResult {
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!source || staticMarkers.length === 0) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoading(true);
    setError(null);
    setProgress(0);
    setResult(null);

    (async () => {
      try {
        let buffer: ArrayBuffer;
        let filename: string;

        if (source instanceof File) {
          filename = source.name;
          buffer = await source.arrayBuffer();
        } else {
          filename = source.split('/').pop() ?? 'save.sav';
          const resp = await fetch(source, { signal: abort.signal });
          if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${source}`);
          buffer = await resp.arrayBuffer();
        }

        if (abort.signal.aborted) return;

        await new Promise<void>((resolve) => setTimeout(resolve, 10));

        const parsed = await parseSaveFile(
          filename,
          buffer,
          staticMarkers,
          seenDropPodIds,
          (pct, msg) => {
            setProgress(pct);
            setProgressMsg(msg);
          },
        );

        if (abort.signal.aborted) return;
        setResult(parsed);
      } catch (e: unknown) {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [source, staticMarkers, seenDropPodIds]);

  return { result, loading, error, progress, progressMsg };
}
