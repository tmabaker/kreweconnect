/**
 * KreweWorks API client. Each client runs its own KreweWorks portal; the suite
 * only lists them. The backend scopes the list to the caller's tenant.
 */
import { apiSend } from "./graphService";

export interface KreweWorksPortal {
  tenantId: string;
  url: string;
  name: string;
}

const useBackendApi = import.meta.env.VITE_USE_BACKEND_API === "true";

export async function fetchKreweWorksPortals(): Promise<KreweWorksPortal[]> {
  if (!useBackendApi) return [];
  const response = await apiSend("/kreweworks/portals");
  const data = (await response.json()) as { value?: KreweWorksPortal[] };
  return data.value ?? [];
}
