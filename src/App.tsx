import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  FluentProvider,
  webDarkTheme,
} from "@fluentui/react-components";
import { AuthProvider, RequireAuth, MspAdminRoute } from "./shared/auth";
import { AppShell } from "./shared/components/AppShell";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
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
const GovernancePage = lazy(() =>
  import("./apps/governance/GovernancePage").then((m) => ({ default: m.GovernancePage }))
);
const PolicyDetailPage = lazy(() =>
  import("./apps/governance/PolicyDetailPage").then((m) => ({ default: m.PolicyDetailPage }))
);
const PolicyFormPage = lazy(() =>
  import("./apps/governance/PolicyFormPage").then((m) => ({ default: m.PolicyFormPage }))
);
const PolicyVariablesPage = lazy(() =>
  import("./apps/governance/PolicyVariablesPage").then((m) => ({ default: m.PolicyVariablesPage }))
);
const WizardPage = lazy(() =>
  import("./apps/governance/WizardPage").then((m) => ({ default: m.WizardPage }))
);
const GovClientsPage = lazy(() =>
  import("./apps/governance/ClientsPage").then((m) => ({ default: m.ClientsPage }))
);
const GovClientDetailPage = lazy(() =>
  import("./apps/governance/ClientDetailPage").then((m) => ({ default: m.ClientDetailPage }))
);
const AssembledPolicyPage = lazy(() =>
  import("./apps/governance/AssembledPolicyPage").then((m) => ({ default: m.AssembledPolicyPage }))
);

// Use dark theme by default (NOIT branding)
const theme = webDarkTheme;

function App() {
  return (
    <FluentProvider theme={theme} style={{ height: "100vh" }}>
      <ErrorBoundary>
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
                {/* KREWE Governance — library management is MSP-only; the wizard,
                    client profile, and assembled viewer are client-reachable
                    (the API scopes them to the caller's own company). */}
                <Route path="/governance" element={<MspAdminRoute><GovernancePage /></MspAdminRoute>} />
                <Route path="/governance/policies/new" element={<MspAdminRoute><PolicyFormPage /></MspAdminRoute>} />
                <Route path="/governance/policies/:id" element={<MspAdminRoute><PolicyDetailPage /></MspAdminRoute>} />
                <Route path="/governance/policies/:id/edit" element={<MspAdminRoute><PolicyFormPage /></MspAdminRoute>} />
                <Route path="/governance/policies/:id/variables" element={<MspAdminRoute><PolicyVariablesPage /></MspAdminRoute>} />
                <Route path="/governance/policies/:id/wizard" element={<WizardPage />} />
                <Route path="/governance/clients" element={<GovClientsPage />} />
                <Route path="/governance/clients/:id" element={<GovClientDetailPage />} />
                <Route path="/governance/assembled/:id" element={<AssembledPolicyPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          </TenantProvider>
        </RequireAuth>
      </AuthProvider>
      </ErrorBoundary>
    </FluentProvider>
  );
}

export default App;
