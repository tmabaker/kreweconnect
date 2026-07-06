import { Component, type ReactNode } from "react";
import { Button, Title2, Text } from "@fluentui/react-components";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
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
 * Catches render errors so one crash degrades to a recoverable, *diagnostic*
 * message instead of unmounting the whole app (which left navigation blank).
 * Used both at the app root and (keyed by route) around the page content.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }

  componentDidCatch(err: unknown) {
    // Surface the error so it can be diagnosed from a user's report.
    console.error("[KreweConnect] render error:", err);
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
          <Text
            font="monospace"
            size={200}
            style={{
              maxWidth: 680,
              wordBreak: "break-word",
              color: "#c50f1f",
              background: "rgba(0,0,0,0.04)",
              padding: "8px 12px",
              borderRadius: 6,
            }}
          >
            {this.state.message}
          </Text>
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
