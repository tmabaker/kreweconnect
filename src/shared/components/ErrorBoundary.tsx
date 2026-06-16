import { Component, type ReactNode } from "react";
import { Button, Title2, Text } from "@fluentui/react-components";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

const CHUNK_RELOAD_KEY = "kc-chunk-reloaded";

/** True for the "stale lazy chunk after a deploy" class of errors. */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /loading chunk|dynamically imported module|importing a module script failed|chunkloaderror/i.test(
    msg
  );
}

/**
 * Catches render errors in routed pages so one page crashing (e.g. a data-driven
 * exception) degrades to a recoverable message instead of unmounting the whole
 * app — which previously left every subsequent navigation blank. Keyed by route
 * in AppShell so navigating elsewhere clears the error automatically.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    // A stale chunk after a fresh deploy: reload once to pull the new assets.
    if (isChunkLoadError(err) && !sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            padding: "64px 24px",
            textAlign: "center",
          }}
        >
          <Title2>This page didn’t load</Title2>
          <Text>Something went wrong rendering this view. Reloading usually fixes it.</Text>
          <Button
            appearance="primary"
            onClick={() => {
              sessionStorage.removeItem(CHUNK_RELOAD_KEY);
              window.location.reload();
            }}
          >
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
