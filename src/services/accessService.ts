/**
 * Who a signed-in client user should email to request access to an area they
 * cannot open. Comes from /api/me (ACCESS_CONTACTS app setting, per tenant),
 * so no client contact is baked into this public repo. Fetched once per visit.
 */
import { apiSend } from "./graphService";

export interface AccessContact {
  name: string;
  email: string;
}

const useBackendApi = import.meta.env.VITE_USE_BACKEND_API === "true";
let pending: Promise<AccessContact | null> | null = null;

export function fetchAccessContact(): Promise<AccessContact | null> {
  if (!useBackendApi) return Promise.resolve(null);
  if (!pending) {
    pending = apiSend("/me")
      .then((r) => r.json())
      .then((me: { accessContact?: AccessContact | null }) => me?.accessContact ?? null)
      .catch(() => {
        pending = null; // try again on the next page that asks
        return null;
      });
  }
  return pending;
}
