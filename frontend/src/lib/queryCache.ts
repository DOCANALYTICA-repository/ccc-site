// A tiny stale-while-revalidate cache shared by every page.
//
// Without it each route mounted with `data === null`, painted "Loading…", and
// refetched from zero — so moving between tabs read exactly like a full page
// reload even though React Router never left the document. Keeping resolved
// responses in a module-level map lets a revisited route paint its previous
// data on the first frame while a refresh runs quietly behind it.

export interface CacheEntry<T = unknown> {
  /** Absent until the first successful fetch resolves. */
  data?: T;
  error?: unknown;
  /** ms epoch of the last success; 0 means "invalidated, refetch on mount". */
  updatedAt: number;
  /** Whether a refresh is in flight over already-painted data. */
  validating: boolean;
}

interface Internal {
  entry: CacheEntry;
  inflight?: Promise<unknown>;
}

const store = new Map<string, Internal>();
const subscribers = new Map<string, Set<() => void>>();

// Bumped by clearQueryCache. A request that was already in flight when the
// session ended must not write its response into the cache the next account
// reads from, so every fetch remembers the generation it started in.
let generation = 0;

/** Entry identity is stable until something actually changes, which is what
 *  useSyncExternalStore needs to avoid re-rendering on every store read. */
export function getEntry<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key)?.entry as CacheEntry<T> | undefined;
}

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn());
}

export function subscribe(key: string, fn: () => void) {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (!set.size) subscribers.delete(key);
  };
}

function patch(key: string, next: Partial<CacheEntry>) {
  const existing = store.get(key) ?? { entry: { updatedAt: 0, validating: false } };
  existing.entry = { ...existing.entry, ...next };
  store.set(key, existing);
  notify(key);
}

/** Overwrite a key's data locally — for optimistic updates after a mutation. */
export function setQueryData<T>(key: string, data: T) {
  patch(key, { data, error: undefined, updatedAt: Date.now() });
}

/** Fetch `key`, collapsing concurrent callers onto one request. */
export function fetchQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = store.get(key);
  if (existing?.inflight) return existing.inflight as Promise<T>;

  patch(key, { validating: true });
  const slot = store.get(key)!;
  const startedIn = generation;

  const inflight = fetcher().then(
    (data) => {
      slot.inflight = undefined;
      if (startedIn === generation) {
        patch(key, { data, error: undefined, updatedAt: Date.now(), validating: false });
      }
      return data;
    },
    (error) => {
      slot.inflight = undefined;
      // Keep any previously good data on screen; surface the error alongside it
      // so a failed background refresh never blanks a working page.
      if (startedIn === generation) patch(key, { error, validating: false });
      throw error;
    },
  );

  slot.inflight = inflight;
  return inflight;
}

/** Mark cached keys stale so mounted queries refresh and the next mount refetches.
 *  Data is kept, not dropped — a stale list still beats a spinner. */
export function invalidateQueries(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) patch(key, { updatedAt: 0 });
  }
}

/** Invalidate one key without touching the ones nested under it — e.g. refresh
 *  the "/events" list while leaving "/events/:id" alone. */
export function invalidateQuery(key: string) {
  if (store.has(key)) patch(key, { updatedAt: 0 });
}

/** Drop everything — used on sign-out so the next account starts clean. */
export function clearQueryCache() {
  generation++;
  const keys = [...store.keys()];
  store.clear();
  keys.forEach(notify);
}
