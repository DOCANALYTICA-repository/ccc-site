import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the pathname so navigating away
   *  from a broken page clears the error instead of stranding the user. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without a boundary anywhere in the tree, one page throwing during render
 * unmounts the whole app — the shell, the nav, everything — and the only way
 * back is a full page reload, which is precisely what a single-page app should
 * never need. This confines the damage to the content area and offers a retry
 * that re-renders in place.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route failed to render:", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="text-lg font-semibold text-ink">This page hit an error.</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The rest of the app is still working — try again, or pick another section from the menu.
        </p>
        <p className="mt-3 break-words text-xs text-ink-muted">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-5 rounded-control bg-ink px-4 py-2.5 text-sm font-medium text-page tap-target"
        >
          Try again
        </button>
      </div>
    );
  }
}
