import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import {
  FluentProvider,
  webDarkTheme,
} from "@fluentui/react-components";
import { AuthProvider, RequireAuth } from "./shared/auth";
import { AppShell } from "./shared/components/AppShell";

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
          <BrowserRouter basename="/app/kreweconnect">
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<DashboardPage />} />
                <Route path="/directory" element={<DirectoryPage />} />
                <Route path="/directory/:id" element={<EmployeeDetailPage />} />
                <Route path="/org-chart" element={<OrgChartPage />} />
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="/contracts/all" element={<ContractListPage />} />
                <Route path="/contracts/new" element={<ContractFormPage />} />
                <Route path="/contracts/renewals" element={<RenewalsPage />} />
                <Route path="/contracts/:id" element={<ContractDetailPage />} />
                <Route path="/contracts/:id/edit" element={<ContractFormPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RequireAuth>
      </AuthProvider>
    </FluentProvider>
  );
}

export default App;
