import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
const PicklistsPage = lazy(() =>
  import("./apps/contracts/PicklistsPage").then((m) => ({ default: m.PicklistsPage }))
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
const KreweWorksPage = lazy(() =>
  import("./apps/kreweworks/KreweWorksPage").then((m) => ({ default: m.KreweWorksPage }))
);
const KreweAimPage = lazy(() =>
  import("./apps/kreweaim/KreweAimPage").then((m) => ({ default: m.KreweAimPage }))
);
const AssembledPolicyPage = lazy(() =>
  import("./apps/governance/AssembledPolicyPage").then((m) => ({ default: m.AssembledPolicyPage }))
);

// Use dark theme by default (NOIT branding)
const theme = webDarkTheme;

/** Sends an old address to the same page at the app's own address, keeping the rest of the path and query. */
function MovedTo({ from, to }: { from: string; to: string }) {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${to}${pathname.slice(from.length)}${search}${hash}`} replace />;
}

function App() {
  return (
    <FluentProvider theme={theme} style={{ height: "100vh" }}>
      <ErrorBoundary>
      <AuthProvider>
        <RequireAuth>
          <TenantProvider>
          <BrowserRouter basename="/app">
            <Routes>
              <Route element={<AppShell />}>
                {/* MSP-admin-only landing, and where sign-in returns. Clients are redirected to the directory. */}
                <Route path="/kreweconnect" element={<MspAdminRoute><DashboardPage /></MspAdminRoute>} />
                {/* KreweConnect — available to clients (their own tenant only). */}
                <Route path="/kreweconnect/directory" element={<DirectoryPage />} />
                <Route path="/kreweconnect/directory/:id" element={<EmployeeDetailPage />} />
                <Route path="/kreweconnect/org-chart" element={<OrgChartPage />} />
                {/* KreweReview / Contracts + Settings — MSP-admin only. */}
                <Route path="/krewereview" element={<MspAdminRoute><ContractsPage /></MspAdminRoute>} />
                <Route path="/krewereview/all" element={<MspAdminRoute><ContractListPage /></MspAdminRoute>} />
                <Route path="/krewereview/new" element={<MspAdminRoute><ContractFormPage mode="new" /></MspAdminRoute>} />
                <Route path="/krewereview/renewals" element={<MspAdminRoute><RenewalsPage /></MspAdminRoute>} />
                <Route path="/krewereview/lists" element={<MspAdminRoute><PicklistsPage /></MspAdminRoute>} />
                <Route path="/krewereview/:tenantId/:id" element={<MspAdminRoute><ContractDetailPage /></MspAdminRoute>} />
                <Route path="/krewereview/:tenantId/:id/edit" element={<MspAdminRoute><ContractFormPage mode="edit" /></MspAdminRoute>} />
                <Route path="/krewereview/:tenantId/:id/renew" element={<MspAdminRoute><ContractFormPage mode="renew" /></MspAdminRoute>} />
                <Route path="/settings" element={<MspAdminRoute><SettingsPage /></MspAdminRoute>} />
                {/* KREWE Governance — library management is MSP-only; the wizard,
                    client profile, and assembled viewer are client-reachable
                    (the API scopes them to the caller's own company). */}
                <Route path="/krewegovernance" element={<MspAdminRoute><GovernancePage /></MspAdminRoute>} />
                <Route path="/krewegovernance/policies/new" element={<MspAdminRoute><PolicyFormPage /></MspAdminRoute>} />
                <Route path="/krewegovernance/policies/:id" element={<MspAdminRoute><PolicyDetailPage /></MspAdminRoute>} />
                <Route path="/krewegovernance/policies/:id/edit" element={<MspAdminRoute><PolicyFormPage /></MspAdminRoute>} />
                <Route path="/krewegovernance/policies/:id/variables" element={<MspAdminRoute><PolicyVariablesPage /></MspAdminRoute>} />
                <Route path="/krewegovernance/policies/:id/wizard" element={<WizardPage />} />
                <Route path="/krewegovernance/clients" element={<GovClientsPage />} />
                <Route path="/krewegovernance/clients/:id" element={<GovClientDetailPage />} />
                <Route path="/krewegovernance/assembled/:id" element={<AssembledPolicyPage />} />
                <Route path="/kreweworks" element={<KreweWorksPage />} />
                {/* KreweAIM — client-reachable; members are scoped to the caller. */}
                <Route path="/kreweaim" element={<KreweAimPage />} />
              </Route>
              {/* Each app has its own address. Links from before that keep working. */}
              <Route path="/kreweconnect/kreweaim" element={<MovedTo from="/kreweconnect/kreweaim" to="/kreweaim" />} />
              <Route path="/kreweconnect/contracts/*" element={<MovedTo from="/kreweconnect/contracts" to="/krewereview" />} />
              <Route path="/kreweconnect/governance/*" element={<MovedTo from="/kreweconnect/governance" to="/krewegovernance" />} />
              <Route path="/kreweconnect/kreweworks" element={<MovedTo from="/kreweconnect/kreweworks" to="/kreweworks" />} />
              <Route path="/kreweconnect/settings" element={<MovedTo from="/kreweconnect/settings" to="/settings" />} />
              <Route path="*" element={<Navigate to="/kreweconnect" replace />} />
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
