import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useQuery } from "@/hooks/useQuery";
import { clearQueryCache, getEntry, invalidateQueries } from "@/lib/queryCache";

function Reader({ fetcher, staleTime, label = "value" }: { fetcher: () => Promise<string>; staleTime?: number; label?: string }) {
  const { data, loading } = useQuery("/thing", fetcher, { staleTime, revalidateOnFocus: false });
  return <p>{loading ? "loading" : `${label}:${data}`}</p>;
}

describe("useQuery", () => {
  beforeEach(() => clearQueryCache());

  it("paints a revisited route from cache without a second request", async () => {
    const fetcher = vi.fn().mockResolvedValue("first");

    const first = render(<Reader fetcher={fetcher} />);
    await screen.findByText("value:first");
    first.unmount();

    // Remount, as navigating away and back does.
    render(<Reader fetcher={fetcher} />);
    // No "loading" frame at all — the cached value is there on the first render.
    expect(screen.getByText("value:first")).toBeTruthy();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });

  it("refetches a revisited route once its data has gone stale", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    const first = render(<Reader fetcher={fetcher} staleTime={0} />);
    await screen.findByText("value:first");
    first.unmount();

    render(<Reader fetcher={fetcher} staleTime={0} />);
    await screen.findByText("value:second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not loop when staleTime is 0", async () => {
    const fetcher = vi.fn().mockResolvedValue("only");
    render(<Reader fetcher={fetcher} staleTime={0} />);
    await screen.findByText("value:only");

    // A staleTime of 0 means "always refresh on arrival", not "refresh forever":
    // the resolved fetch must not re-arm the effect that started it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes mounted queries on invalidation, keeping old data visible", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    render(<Reader fetcher={fetcher} />);
    await screen.findByText("value:first");

    act(() => invalidateQueries("/thing"));
    // Stale data stays on screen rather than blanking to a spinner.
    expect(screen.getByText("value:first")).toBeTruthy();
    await screen.findByText("value:second");
  });

  it("shares one in-flight request between components on the same key", async () => {
    const fetcher = vi.fn().mockResolvedValue("shared");
    render(
      <>
        <Reader fetcher={fetcher} label="a" />
        <Reader fetcher={fetcher} label="b" />
      </>,
    );
    await screen.findByText("a:shared");
    await screen.findByText("b:shared");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops a response that arrives after the session was cleared", async () => {
    let release: (value: string) => void = () => {};
    const fetcher = () => new Promise<string>((resolve) => { release = resolve; });

    render(<Reader fetcher={fetcher} />);
    await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());

    // Sign-out happens while the request is still in flight...
    act(() => clearQueryCache());
    // ...and the old account's response lands afterwards.
    await act(async () => { release("secret from previous session"); });

    expect(getEntry("/thing")).toBeUndefined();
    expect(screen.queryByText(/secret from previous session/)).toBeNull();
  });

  it("keeps a failed refresh from wiping data already on screen", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("offline"));
    render(<Reader fetcher={fetcher} />);
    await screen.findByText("value:first");

    act(() => invalidateQueries("/thing"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByText("value:first")).toBeTruthy();
  });
});
