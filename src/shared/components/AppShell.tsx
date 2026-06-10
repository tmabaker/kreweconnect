import { Suspense } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { isDemoMode, demoUser } from "../auth/demoMode";
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Avatar,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Spinner,
  Divider,
} from "@fluentui/react-components";
import {
  Home24Regular,
  People24Regular,
  DocumentText24Regular,
  Settings24Regular,
  SignOut24Regular,
  Person24Regular,
  ShieldKeyhole24Regular,
  Organization24Regular,
  Gavel24Regular,
  CalendarClock24Regular,
} from "@fluentui/react-icons";
import { TenantSwitcher } from "../../components/TenantSwitcher";
import { useTenantContext } from "../hooks/useTenantContext";
import { detectUserTenantContext } from "../../services/tenantService";

const useStyles = makeStyles({
  root: {
    display: "flex",
    height: "100vh",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  sidebar: {
    width: "240px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  sidebarCollapsed: {
    width: "60px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brandIcon: {
    color: tokens.colorBrandForeground1,
    fontSize: "24px",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "12px 8px",
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    cursor: "pointer",
    color: tokens.colorNeutralForeground2,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: "52px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  content: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
  },
});

const navItems = [
  { path: "/", label: "Dashboard", icon: <Home24Regular />, section: null },
  { path: "/directory", label: "Directory", icon: <People24Regular />, section: "KreweConnect" },
  { path: "/org-chart", label: "Org Chart", icon: <Organization24Regular />, section: null, indent: true },
  { path: "/contracts", label: "Dashboard", icon: <Gavel24Regular />, section: "KreweReview" },
  { path: "/contracts/all", label: "All Contracts", icon: <DocumentText24Regular />, section: null, indent: true },
  { path: "/contracts/renewals", label: "Renewals", icon: <CalendarClock24Regular />, section: null, indent: true },
  { path: "/settings", label: "Settings", icon: <Settings24Regular />, section: null },
];



export function AppShell() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  // In demo mode, don't call useMsal (no MsalProvider exists)
  const msalContext = isDemoMode ? null : useMsal(); // eslint-disable-line react-hooks/rules-of-hooks
  const { selectedTenant, setSelectedTenant } = useTenantContext();
  const userContext = detectUserTenantContext();

  const displayName = isDemoMode
    ? demoUser.name
    : msalContext?.accounts[0]?.name || msalContext?.accounts[0]?.username || "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    if (isDemoMode) return;
    msalContext?.instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  };

  return (
    <div className={styles.root}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.brand}>
          <ShieldKeyhole24Regular className={styles.brandIcon} />
          <div>
            <Text weight="semibold" size={400}>
              NOIT Client Tools
            </Text>
            <Text size={200} style={{ display: "block", marginTop: "-2px" }}>
              KreweConnect · KreweReview
            </Text>
          </div>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : item.path === "/contracts"
                  ? location.pathname === "/contracts"
                  : location.pathname.startsWith(item.path);

            return (
              <div key={item.path}>
                {(item as any).section && (
                  <Text
                    size={200}
                    weight="semibold"
                    style={{
                      display: "block",
                      padding: "8px 12px 4px",
                      color: tokens.colorNeutralForeground3,
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {(item as any).section}
                  </Text>
                )}
                <div
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                  onClick={() => navigate(item.path)}
                  style={(item as any).indent ? { paddingLeft: "24px" } : undefined}
                >
                  {item.icon}
                  <Text size={300}>{item.label}</Text>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className={styles.main}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <TenantSwitcher
              selectedTenant={selectedTenant}
              onTenantChange={setSelectedTenant}
              isMspAdmin={userContext.isMspAdmin}
            />
          </div>

          {isDemoMode && (
            <Text
              size={200}
              weight="semibold"
              style={{
                backgroundColor: tokens.colorPaletteGoldBackground2,
                color: tokens.colorPaletteGoldForeground2,
                padding: "2px 10px",
                borderRadius: tokens.borderRadiusMedium,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Demo Mode
            </Text>
          )}

          <div className={styles.headerRight}>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  icon={<Avatar name={displayName} initials={initials} size={28} />}
                >
                  {displayName}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Person24Regular />}>Profile</MenuItem>
                  <MenuItem icon={<Settings24Regular />} onClick={() => navigate("/settings")}>
                    Settings
                  </MenuItem>
                  <Divider />
                  <MenuItem icon={<SignOut24Regular />} onClick={handleLogout}>
                    Sign out
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </div>

        <div className={styles.content}>
          <Suspense fallback={<Spinner label="Loading..." />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
