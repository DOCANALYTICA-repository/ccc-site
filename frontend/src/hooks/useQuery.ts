import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  fetchQuery,
  getEntry,
  invalidateQueries,
  invalidateQuery,
  setQueryData,
  subscribe,
  type CacheEntry,
} from "@/lib/queryCache";

export interface UseQueryOptions {
  /** How long a cached response counts as fresh. Inside the window a revisit
   *  paints from cache with no request at all. */
  staleTime?: number;
  /** Skip the request entirely — for queries gated on a selection. */
  enabled?: boolean;
  /** Refresh stale data when the tab regains focus. */
  revalidateOnFocus?: boolean;
  /** While a new key loads, keep showing the last key's data instead of
   *  blanking. Use on search-as-you-type lists, where every keystroke is a
   *  new key and an empty frame between them reads as a flicker. */
  keepPreviousData?: boolean;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: unknown;
  /** True only before the very first response — never on a revisit. */
  loading: boolean;
  /** A refresh is running behind data already on screen. */
  validating: boolean;
  refetch: () => Promise<T | undefined>;
  /** Write the cache locally, e.g. after a mutation returns the new row. */
  mutate: (data: T) => void;
}

const EMPTY: CacheEntry = { updatedAt: 0, validating: false };

/**
 * Read a cached endpoint. A revisited route renders its previous data on the
 * first frame and refreshes in the background, which is what keeps tab
 * switching from looking like a page reload.
 *
 * Pass `key = null` to disable the query (nothing to fetch yet).
 */
export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  {
    staleTime = 30_000,
    enabled = true,
    revalidateOnFocus = true,
    keepPreviousData = false,
  }: UseQueryOptions = {},
): UseQueryResult<T> {
  const active = enabled && key !== null;

  // The fetcher is a fresh closure every render; only ever call the latest one.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const entry = useSyncExternalStore(
    useCallback((onChange: () => void) => (active ? subscribe(key, onChange) : () => {}), [key, active]),
    useCallback(() => (active ? getEntry<T>(key) : undefined), [key, active]),
  );

  const { data, error, updatedAt, validating } = (entry ?? EMPTY) as CacheEntry<T>;

  const previous = useRef<T | undefined>(undefined);
  if (data !== undefined) previous.current = data;
  const visible = data === undefined && keepPreviousData ? previous.current : data;

  const run = useCallback(() => {
    if (!active) return Promise.resolve(undefined);
    return fetchQuery<T>(key, () => fetcherRef.current()).catch(() => undefined);
  }, [key, active]);

  // updatedAt in the deps is what makes invalidation reactive: invalidateQueries
  // resets it to 0, this re-runs, and the refresh happens under existing data.
  //
  // The two guards below are what keep that from spinning. Once a key has been
  // fetched in this mount, only an invalidation (updatedAt back to 0) starts
  // another request — otherwise a staleTime of 0 would re-arm the effect with
  // its own result, forever.
  const fetchedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const firstTouch = fetchedKey.current !== key;
    if (!firstTouch && updatedAt !== 0) return;
    fetchedKey.current = key;
    if (firstTouch && updatedAt !== 0 && Date.now() - updatedAt < staleTime) return;
    void run();
  }, [active, key, updatedAt, staleTime, run]);

  useEffect(() => {
    if (!active || !revalidateOnFocus) return;
    function onFocus() {
      const current = getEntry<T>(key!);
      if (current && Date.now() - current.updatedAt < staleTime) return;
      void run();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, key, staleTime, revalidateOnFocus, run]);

  return {
    data: visible,
    error,
    loading: visible === undefined && error === undefined && active,
    validating,
    refetch: run,
    mutate: useCallback((next: T) => { if (key) setQueryData(key, next); }, [key]),
  };
}

export { invalidateQueries, invalidateQuery };
