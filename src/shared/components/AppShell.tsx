import { Suspense, useEffect, useState } from "react";
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
  ShieldTask24Regular,
  Building24Regular,
  PeopleTeam24Regular,
  Navigation24Regular,
} from "@fluentui/react-icons";
import { TenantSwitcher } from "../../components/TenantSwitcher";
import { ErrorBoundary } from "./ErrorBoundary";
import { Fleur } from "./AimMark";
import { useTenantContext } from "../hooks/useTenantContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { detectUserTenantContext } from "../../services/tenantService";

const useStyles = makeStyles({
  root: {
    display: "flex",
    // dvh tracks the visible viewport on phones, where 100vh hides content
    // behind the browser toolbar.
    height: ["100vh", "100dvh"],
    backgroundColor: tokens.colorNeutralBackground3,
  },
  sidebar: {
    width: "240px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflowY: "auto",
    transitionProperty: "width, transform",
    transitionDuration: "150ms",
  },
  sidebarCollapsed: {
    width: "60px",
  },
  // Phones: the sidebar becomes a drawer over the page instead of a column
  // that permanently eats most of a 375px screen.
  sidebarMobile: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: "260px",
    maxWidth: "85vw",
    zIndex: 1000,
    boxShadow: tokens.shadow28,
    transform: "translateX(-100%)",
  },
  sidebarMobileOpen: {
    transform: "translateX(0)",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
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
    gap: "8px",
    padding: "8px 20px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    minHeight: "52px",
    "@media (max-width: 768px)": { padding: "8px 12px" },
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
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
    "@media (max-width: 768px)": { padding: "12px" },
  },
});

// `mspOnly` items are hidden from client-tenant users — clients only ever see
// their own Directory + Org Chart (KreweConnect). The route guards enforce the
// same rule for direct URL access.
// The KreweAIM fleur de lis, sized like the Fluent icons beside it.
function FleurIcon() {
  return (
    <span style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Fleur size={22} />
    </span>
  );
}

const navItems = [
  { path: "/", label: "Dashboard", icon: <Home24Regular />, section: null, mspOnly: true },
  // KreweAIM first: a personal page every user can open (each sees only their own status).
  { path: "/kreweaim", label: "AI Mastery", icon: <FleurIcon />, section: "KreweAIM" },
  { path: "/directory", label: "Directory", icon: <People24Regular />, section: "KreweConnect" },
  { path: "/org-chart", label: "Org Chart", icon: <Organization24Regular />, section: null, indent: true },
  { path: "/contracts", label: "Dashboard", icon: <Gavel24Regular />, section: "KreweReview", mspOnly: true },
  { path: "/contracts/all", label: "All Contracts", icon: <DocumentText24Regular />, section: null, indent: true, mspOnly: true },
  { path: "/contracts/renewals", label: "Renewals", icon: <CalendarClock24Regular />, section: null, indent: true, mspOnly: true },
  // Governance: clients keep the "Clients" entry — it routes them straight to
  // their own company (wizard answers + assembled policies).
  { path: "/governance", label: "Policy Library", icon: <ShieldTask24Regular />, section: "KREWE Governance", mspOnly: true },
  { path: "/governance/clients", label: "Clients", icon: <Building24Regular />, section: null, indent: true },
  // KreweWorks: each client's portal is its own site; clients see only theirs.
  { path: "/kreweworks", label: "Employee Portal", icon: <PeopleTeam24Regular />, section: "KreweWorks" },
  { path: "/settings", label: "Settings", icon: <Settings24Regular />, section: null, mspOnly: true },
];



export function AppShell() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  // In demo mode, don't call useMsal (no MsalProvider exists)
  const msalContext = isDemoMode ? null : useMsal(); // eslint-disable-line react-hooks/rules-of-hooks
  const { selectedTenant, setSelectedTenant } = useTenantContext();
  const userContext = detectUserTenantContext();
  const isMobile = useIsMobile();
  // Desktop: collapse to an icon rail, remembered per browser.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("kc.sidebarCollapsed") === "1";
    } catch {
      return false;
    }
  });
  // Phones: the drawer starts closed and closes after every navigation.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, isMobile]);

  const toggleNav = () => {
    if (isMobile) {
      setDrawerOpen((open) => !open);
      return;
    }
    setCollapsed((c) => {
      try {
        localStorage.setItem("kc.sidebarCollapsed", c ? "0" : "1");
      } catch {
        // Storage blocked: the toggle still works for this visit.
      }
      return !c;
    });
  };

  const showLabels = isMobile || !collapsed;
  const sidebarClass = [
    styles.sidebar,
    isMobile ? styles.sidebarMobile : collapsed ? styles.sidebarCollapsed : "",
    isMobile && drawerOpen ? styles.sidebarMobileOpen : "",
  ].join(" ");

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
      {isMobile && drawerOpen && (
        <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <div className={sidebarClass} aria-hidden={isMobile && !drawerOpen ? true : undefined}>
        <div className={styles.brand}>
          <ShieldKeyhole24Regular className={styles.brandIcon} />
          {showLabels && <div>
            <Text weight="semibold" size={400}>
              NOIT Client Tools
            </Text>
            <Text size={200} style={{ display: "block", marginTop: "-2px" }}>
              KreweAIM · KreweConnect · KreweReview · KreweWorks
            </Text>
          </div>}
        </div>

        <nav className={styles.nav}>
          {navItems
            .filter((item) => userContext.isMspAdmin || !(item as any).mspOnly)
            .map((item) => {
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : item.path === "/contracts"
                  ? location.pathname === "/contracts"
                  : item.path === "/governance"
                    ? location.pathname === "/governance" ||
                      location.pathname.startsWith("/governance/policies")
                    : location.pathname.startsWith(item.path);

            return (
              <div key={item.path}>
                {showLabels && (item as any).section && (
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
                  style={showLabels && (item as any).indent ? { paddingLeft: "24px" } : undefined}
                  title={showLabels ? undefined : (item as any).section ? `${(item as any).section} · ${item.label}` : item.label}
                >
                  {item.icon}
                  {showLabels && <Text size={300}>{item.label}</Text>}
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
            <Button
              appearance="subtle"
              icon={<Navigation24Regular />}
              aria-label={isMobile ? (drawerOpen ? "Close menu" : "Open menu") : collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={isMobile ? drawerOpen : !collapsed}
              onClick={toggleNav}
            />
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
                  aria-label={displayName}
                >
                  {isMobile ? null : displayName}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Person24Regular />}>Profile</MenuItem>
                  {userContext.isMspAdmin && (
                    <MenuItem icon={<Settings24Regular />} onClick={() => navigate("/settings")}>
                      Settings
                    </MenuItem>
                  )}
                  <Divider />
                  <MenuItem icon={<SignOut24Regular />} onClick={handleLogout}>
                    Sign out
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
        </div>

        <div className={styles.content} data-scroll-root>
          {/* Keyed by route so a crash on one page clears when navigating away,
              instead of the old behavior where one error blanked the whole app. */}
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<Spinner label="Loading..." />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
