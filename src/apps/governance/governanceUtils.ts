import { useCallback, useEffect, useState } from "react";
import { isGovError, type GovError } from "../../services/governanceService";

/** Badge color per policy lifecycle status (Policies.Status is free text; these
 * are the values in use: draft → active → retired, with review as a flag). */
export function getPolicyStatusColor(
  status: string
): "brand" | "success" | "warning" | "danger" | "informative" {
  switch (status.toLowerCase()) {
    case "active":
    case "published":
      return "success";
    case "draft":
      return "informative";
    case "review":
    case "in_review":
      return "warning";
    case "retired":
    case "archived":
      return "danger";
    default:
      return "brand";
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

/** `PolicyVariables.Options` holds a JSON array for select inputs. */
export function parseOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return options.split(",").map((o) => o.trim()).filter(Boolean);
  }
}

export function errorMessage(err: unknown): string {
  if (isGovError(err)) return err.message;
  return err instanceof Error ? err.message : "Something went wrong.";
}

export interface GovQuery<T> {
  data: T | null;
  loading: boolean;
  error: GovError | Error | null;
  reload: () => void;
}

/** Tiny load-on-mount hook for the governance pages (no cache — the data sets
 * are small and freshness matters more than round-trips). */
export function useGovQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): GovQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<GovError | Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
