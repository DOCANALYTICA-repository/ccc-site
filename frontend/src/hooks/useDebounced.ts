import { useEffect, useState } from "react";

/** Trail a fast-changing value (a search box) so it can be used as a query key
 *  without firing a request per keystroke. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
