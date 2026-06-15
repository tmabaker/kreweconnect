import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  FluentProvider,
  webDarkTheme,
} from "@fluentui/react-components";
import { AuthProvider, RequireAuth, MspAdminRoute } from "./shared/auth";
import { AppShell } from "./shared/components/AppShell";
import { TenantProvider } from "./shared/hooks/useTenantContext";

// Lazy-loaded page components
const DashboardPage = lazy(() =>
  import("./apps/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage }))
);
const DirectoryPage = lazy(() =>
  import("./apps/directory/DirectoryPage").then((m) => ({ default: m.DirectoryPage }))
);
const EmployeeDetailPage = lazy(() =>
  import("./apps/directory/EmployeeDetailPage").then((m) => ({ default: m.EmployeeDetailPage }))
);
const OrgChartPage = lazy(() =>
  import("./apps/directory/OrgChartPage").then((m) => ({ default: m.OrgChartPage }))
);
const ContractsPage = lazy(() =>
  import("./apps/contracts/ContractsPage").then((m) => ({ default: m.ContractsPage }))
);
const ContractListPage = lazy(() =>
  import("./apps/contracts/ContractListPage").then((m) => ({ default: m.ContractListPage }))
);
const ContractDetailPage = lazy(() =>
  import("./apps/contracts/ContractDetailPage").then((m) => ({ default: m.ContractDetailPage }))
);
const ContractFormPage = lazy(() =>
  import("./apps/contracts/ContractFormPage").then((m) => ({ default: m.ContractFormPage }))
);
const RenewalsPage = lazy(() =>
  import("./apps/contracts/RenewalsPage").then((m) => ({ default: m.RenewalsPage }))
);
const SettingsPage = lazy(() =>
  import("./apps/settings/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

// Use dark theme by default (NOIT branding)
const theme = webDarkTheme;

function App() {
  return (
    <FluentProvider theme={theme} style={{ height: "100vh" }}>
      <AuthProvider>
        <RequireAuth>
          <TenantProvider>
          <BrowserRouter basename="/app/kreweconnect">
            <Routes>
              <Route element={<AppShell />}>
                {/* MSP-admin-only landing. Clients are redirected to /directory. */}
                <Route index element={<MspAdminRoute><DashboardPage /></MspAdminRoute>} />
                {/* KreweConnect — available to clients (their own tenant only). */}
                <Route path="/directory" element={<DirectoryPage />} />
                <Route path="/directory/:id" element={<EmployeeDetailPage />} />
                <Route path="/org-chart" element={<OrgChartPage />} />
                {/* KreweReview / Contracts + Settings — MSP-admin only. */}
                <Route path="/contracts" element={<MspAdminRoute><ContractsPage /></MspAdminRoute>} />
                <Route path="/contracts/all" element={<MspAdminRoute><ContractListPage /></MspAdminRoute>} />
                <Route path="/contracts/new" element={<MspAdminRoute><ContractFormPage /></MspAdminRoute>} />
                <Route path="/contracts/renewals" element={<MspAdminRoute><RenewalsPage /></MspAdminRoute>} />
                <Route path="/contracts/:id" element={<MspAdminRoute><ContractDetailPage /></MspAdminRoute>} />
                <Route path="/contracts/:id/edit" element={<MspAdminRoute><ContractFormPage /></MspAdminRoute>} />
                <Route path="/settings" element={<MspAdminRoute><SettingsPage /></MspAdminRoute>} />
              </Route>
            </Routes>
          </BrowserRouter>
          </TenantProvider>
        </RequireAuth>
      </AuthProvider>
    </FluentProvider>
  );
}

export default App;
