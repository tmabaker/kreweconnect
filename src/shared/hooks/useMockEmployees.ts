import { useState, useMemo, useCallback } from "react";
import type {
  EmployeeListItem,
  EmployeeDetail,
  EmployeeRef,
  OrgChartNode,
  EmployeeFacets,
} from "../types";

// ─── Realistic mock data for 3 tenants ───────────────────────────

const MOCK_EMPLOYEES: EmployeeListItem[] = [
  // Bayou Automotive (12 employees)
  { id: "ba-001", displayName: "Mike Johnson", givenName: "Mike", surname: "Johnson", email: "mike.johnson@bayouautomotive.com", jobTitle: "General Manager", department: "Executive", officeLocation: "Main Office", mobilePhone: "985-555-0101", businessPhone: "985-555-0001", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-002", displayName: "John Smith", givenName: "John", surname: "Smith", email: "john.smith@bayouautomotive.com", jobTitle: "Service Manager", department: "Service", officeLocation: "Service Center", mobilePhone: "985-555-0102", businessPhone: "985-555-0002", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-003", displayName: "Sarah Williams", givenName: "Sarah", surname: "Williams", email: "sarah.williams@bayouautomotive.com", jobTitle: "Service Advisor", department: "Service", officeLocation: "Service Center", mobilePhone: "985-555-0103", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-004", displayName: "David Brown", givenName: "David", surname: "Brown", email: "david.brown@bayouautomotive.com", jobTitle: "Lead Technician", department: "Service", officeLocation: "Service Center", mobilePhone: "985-555-0104", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-005", displayName: "Lisa Garcia", givenName: "Lisa", surname: "Garcia", email: "lisa.garcia@bayouautomotive.com", jobTitle: "Sales Director", department: "Sales", officeLocation: "Showroom", mobilePhone: "985-555-0105", businessPhone: "985-555-0005", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-006", displayName: "Robert Martinez", givenName: "Robert", surname: "Martinez", email: "robert.martinez@bayouautomotive.com", jobTitle: "Sales Consultant", department: "Sales", officeLocation: "Showroom", mobilePhone: "985-555-0106", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-007", displayName: "Jennifer Lee", givenName: "Jennifer", surname: "Lee", email: "jennifer.lee@bayouautomotive.com", jobTitle: "Finance Manager", department: "Finance", officeLocation: "Main Office", mobilePhone: "985-555-0107", businessPhone: "985-555-0007", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-008", displayName: "Marcus Taylor", givenName: "Marcus", surname: "Taylor", email: "marcus.taylor@bayouautomotive.com", jobTitle: "Parts Manager", department: "Parts", officeLocation: "Parts Dept", mobilePhone: "985-555-0108", businessPhone: "985-555-0008", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-009", displayName: "Amanda Wilson", givenName: "Amanda", surname: "Wilson", email: "amanda.wilson@bayouautomotive.com", jobTitle: "Receptionist", department: "Admin", officeLocation: "Main Office", mobilePhone: "985-555-0109", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-010", displayName: "Chris Anderson", givenName: "Chris", surname: "Anderson", email: "chris.anderson@bayouautomotive.com", jobTitle: "Detailing Specialist", department: "Service", officeLocation: "Detail Shop", mobilePhone: "985-555-0110", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-011", displayName: "Patricia Nguyen", givenName: "Patricia", surname: "Nguyen", email: "patricia.nguyen@bayouautomotive.com", jobTitle: "IT Coordinator", department: "IT", officeLocation: "Main Office", mobilePhone: "985-555-0111", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },
  { id: "ba-012", displayName: "James Thomas", givenName: "James", surname: "Thomas", email: "james.thomas@bayouautomotive.com", jobTitle: "Body Shop Manager", department: "Body Shop", officeLocation: "Body Shop", mobilePhone: "985-555-0112", businessPhone: "985-555-0012", photo: null, isActive: true, tenantDisplayName: "Bayou Automotive" },

  // Fishman Haygood (15 employees)
  { id: "fh-001", displayName: "Katherine Fishman", givenName: "Katherine", surname: "Fishman", email: "kfishman@fishmanhaygood.com", jobTitle: "Managing Partner", department: "Leadership", officeLocation: "Main Office", mobilePhone: "504-555-0201", businessPhone: "504-555-0001", photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-002", displayName: "Richard Haygood", givenName: "Richard", surname: "Haygood", email: "rhaygood@fishmanhaygood.com", jobTitle: "Senior Partner", department: "Leadership", officeLocation: "Main Office", mobilePhone: "504-555-0202", businessPhone: "504-555-0002", photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-003", displayName: "Elena Vasquez", givenName: "Elena", surname: "Vasquez", email: "evasquez@fishmanhaygood.com", jobTitle: "Associate Attorney", department: "Litigation", officeLocation: "Main Office", mobilePhone: "504-555-0203", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-004", displayName: "Michael Chen", givenName: "Michael", surname: "Chen", email: "mchen@fishmanhaygood.com", jobTitle: "Associate Attorney", department: "Corporate", officeLocation: "Main Office", mobilePhone: "504-555-0204", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-005", displayName: "Sandra Phillips", givenName: "Sandra", surname: "Phillips", email: "sphillips@fishmanhaygood.com", jobTitle: "Legal Secretary", department: "Admin", officeLocation: "Main Office", mobilePhone: "504-555-0205", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-006", displayName: "Thomas Washington", givenName: "Thomas", surname: "Washington", email: "twashington@fishmanhaygood.com", jobTitle: "Paralegal", department: "Litigation", officeLocation: "Main Office", mobilePhone: "504-555-0206", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-007", displayName: "Rachel Kim", givenName: "Rachel", surname: "Kim", email: "rkim@fishmanhaygood.com", jobTitle: "Junior Associate", department: "Corporate", officeLocation: "Main Office", mobilePhone: "504-555-0207", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-008", displayName: "Derek Robinson", givenName: "Derek", surname: "Robinson", email: "drobinson@fishmanhaygood.com", jobTitle: "Office Manager", department: "Admin", officeLocation: "Main Office", mobilePhone: "504-555-0208", businessPhone: "504-555-0008", photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-009", displayName: "Angela Foster", givenName: "Angela", surname: "Foster", email: "afoster@fishmanhaygood.com", jobTitle: "Senior Paralegal", department: "Litigation", officeLocation: "Main Office", mobilePhone: "504-555-0209", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-010", displayName: "Brandon Scott", givenName: "Brandon", surname: "Scott", email: "bscott@fishmanhaygood.com", jobTitle: "IT Administrator", department: "IT", officeLocation: "Main Office", mobilePhone: "504-555-0210", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-011", displayName: "Monica Price", givenName: "Monica", surname: "Price", email: "mprice@fishmanhaygood.com", jobTitle: "Associate Attorney", department: "Real Estate", officeLocation: "Main Office", mobilePhone: "504-555-0211", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-012", displayName: "Nathan Hughes", givenName: "Nathan", surname: "Hughes", email: "nhughes@fishmanhaygood.com", jobTitle: "Billing Coordinator", department: "Finance", officeLocation: "Main Office", mobilePhone: "504-555-0212", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-013", displayName: "Diana Russell", givenName: "Diana", surname: "Russell", email: "drussell@fishmanhaygood.com", jobTitle: "Receptionist", department: "Admin", officeLocation: "Main Office", mobilePhone: "504-555-0213", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-014", displayName: "Victor Morales", givenName: "Victor", surname: "Morales", email: "vmorales@fishmanhaygood.com", jobTitle: "Associate Attorney", department: "Litigation", officeLocation: "Main Office", mobilePhone: "504-555-0214", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },
  { id: "fh-015", displayName: "Laura Bennett", givenName: "Laura", surname: "Bennett", email: "lbennett@fishmanhaygood.com", jobTitle: "Law Clerk", department: "Corporate", officeLocation: "Main Office", mobilePhone: "504-555-0215", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Fishman Haygood" },

  // Irby Investments (11 employees)
  { id: "ii-001", displayName: "Charles Irby", givenName: "Charles", surname: "Irby", email: "cirby@irbyinvestments.com", jobTitle: "Managing Director", department: "Executive", officeLocation: "Downtown Office", mobilePhone: "504-555-0301", businessPhone: "504-555-0100", photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-002", displayName: "Stephanie Parker", givenName: "Stephanie", surname: "Parker", email: "sparker@irbyinvestments.com", jobTitle: "VP of Operations", department: "Operations", officeLocation: "Downtown Office", mobilePhone: "504-555-0302", businessPhone: "504-555-0101", photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-003", displayName: "William Turner", givenName: "William", surname: "Turner", email: "wturner@irbyinvestments.com", jobTitle: "Portfolio Manager", department: "Investments", officeLocation: "Downtown Office", mobilePhone: "504-555-0303", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-004", displayName: "Nicole Adams", givenName: "Nicole", surname: "Adams", email: "nadams@irbyinvestments.com", jobTitle: "Financial Analyst", department: "Investments", officeLocation: "Downtown Office", mobilePhone: "504-555-0304", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-005", displayName: "Gregory Hall", givenName: "Gregory", surname: "Hall", email: "ghall@irbyinvestments.com", jobTitle: "Property Manager", department: "Real Estate", officeLocation: "Field Office", mobilePhone: "504-555-0305", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-006", displayName: "Megan Cooper", givenName: "Megan", surname: "Cooper", email: "mcooper@irbyinvestments.com", jobTitle: "Accounting Manager", department: "Finance", officeLocation: "Downtown Office", mobilePhone: "504-555-0306", businessPhone: "504-555-0106", photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-007", displayName: "Daniel Wright", givenName: "Daniel", surname: "Wright", email: "dwright@irbyinvestments.com", jobTitle: "Leasing Agent", department: "Real Estate", officeLocation: "Field Office", mobilePhone: "504-555-0307", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-008", displayName: "Ashley Campbell", givenName: "Ashley", surname: "Campbell", email: "acampbell@irbyinvestments.com", jobTitle: "Executive Assistant", department: "Executive", officeLocation: "Downtown Office", mobilePhone: "504-555-0308", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-009", displayName: "Kevin Mitchell", givenName: "Kevin", surname: "Mitchell", email: "kmitchell@irbyinvestments.com", jobTitle: "Junior Analyst", department: "Investments", officeLocation: "Downtown Office", mobilePhone: "504-555-0309", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-010", displayName: "Christina Rivera", givenName: "Christina", surname: "Rivera", email: "crivera@irbyinvestments.com", jobTitle: "HR Coordinator", department: "HR", officeLocation: "Downtown Office", mobilePhone: "504-555-0310", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
  { id: "ii-011", displayName: "Jason Brooks", givenName: "Jason", surname: "Brooks", email: "jbrooks@irbyinvestments.com", jobTitle: "Maintenance Supervisor", department: "Facilities", officeLocation: "Field Office", mobilePhone: "504-555-0311", businessPhone: null, photo: null, isActive: true, tenantDisplayName: "Irby Investments" },
];

// Manager relationships for detail views and org chart
const MANAGER_MAP: Record<string, string> = {
  "ba-002": "ba-001", "ba-003": "ba-002", "ba-004": "ba-002",
  "ba-005": "ba-001", "ba-006": "ba-005", "ba-007": "ba-001",
  "ba-008": "ba-001", "ba-009": "ba-007", "ba-010": "ba-002",
  "ba-011": "ba-001", "ba-012": "ba-001",
  "fh-003": "fh-001", "fh-004": "fh-002", "fh-005": "fh-001",
  "fh-006": "fh-003", "fh-007": "fh-004", "fh-008": "fh-001",
  "fh-009": "fh-001", "fh-010": "fh-008", "fh-011": "fh-002",
  "fh-012": "fh-008", "fh-013": "fh-008", "fh-014": "fh-001",
  "fh-015": "fh-004",
  "ii-002": "ii-001", "ii-003": "ii-001", "ii-004": "ii-003",
  "ii-005": "ii-002", "ii-006": "ii-002", "ii-007": "ii-005",
  "ii-008": "ii-001", "ii-009": "ii-003", "ii-010": "ii-002",
  "ii-011": "ii-005",
};

const TENANT_PREFIX_MAP: Record<string, string> = {
  "aaaaaaaa-1111-2222-3333-444444444444": "ba-",
  "bbbbbbbb-1111-2222-3333-444444444444": "fh-",
  "cccccccc-1111-2222-3333-444444444444": "ii-",
};

function getEmployeeRef(id: string): EmployeeRef | null {
  const emp = MOCK_EMPLOYEES.find((e) => e.id === id);
  if (!emp) return null;
  return { id: emp.id, displayName: emp.displayName, jobTitle: emp.jobTitle, photo: emp.photo };
}

export function useMockEmployees(tenantId: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [officeFilter, setOfficeFilter] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "department" | "recent">("name");

  const filteredEmployees = useMemo(() => {
    let list = [...MOCK_EMPLOYEES];

    // Tenant filter
    if (tenantId !== "all") {
      const prefix = TENANT_PREFIX_MAP[tenantId];
      if (prefix) {
        list = list.filter((e) => e.id.startsWith(prefix));
      }
    }

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.department && e.department.toLowerCase().includes(q)) ||
          (e.jobTitle && e.jobTitle.toLowerCase().includes(q))
      );
    }

    // Filters
    if (departmentFilter) list = list.filter((e) => e.department === departmentFilter);
    if (officeFilter) list = list.filter((e) => e.officeLocation === officeFilter);
    if (titleFilter) list = list.filter((e) => e.jobTitle === titleFilter);

    // Sort
    if (sortBy === "department") {
      list.sort((a, b) => (a.department ?? "").localeCompare(b.department ?? "") || a.displayName.localeCompare(b.displayName));
    } else {
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    return list;
  }, [tenantId, searchQuery, departmentFilter, officeFilter, titleFilter, sortBy]);

  const facets = useMemo<EmployeeFacets>(() => {
    let list = MOCK_EMPLOYEES;
    if (tenantId !== "all") {
      const prefix = TENANT_PREFIX_MAP[tenantId];
      if (prefix) list = list.filter((e) => e.id.startsWith(prefix));
    }
    return {
      departments: [...new Set(list.map((e) => e.department).filter(Boolean) as string[])].sort(),
      offices: [...new Set(list.map((e) => e.officeLocation).filter(Boolean) as string[])].sort(),
      titles: [...new Set(list.map((e) => e.jobTitle).filter(Boolean) as string[])].sort(),
      companies: [...new Set(list.map((e) => e.companyName).filter(Boolean) as string[])].sort(),
    };
  }, [tenantId]);

  const getDetail = useCallback((id: string): EmployeeDetail | null => {
    const emp = MOCK_EMPLOYEES.find((e) => e.id === id);
    if (!emp) return null;
    const managerId = MANAGER_MAP[id];
    const directReportIds = Object.entries(MANAGER_MAP)
      .filter(([, mgrId]) => mgrId === id)
      .map(([childId]) => childId);
    return {
      ...emp,
      employeeId: `EMP-${id.split("-")[1]}`,
      hireDate: "2020-01-15",
      lastSyncedAt: new Date().toISOString(),
      manager: managerId ? getEmployeeRef(managerId) : null,
      directReports: directReportIds.map(getEmployeeRef).filter(Boolean) as EmployeeRef[],
      customFields: [],
    };
  }, []);

  const getOrgChart = useCallback(
    (rootId?: string): OrgChartNode | null => {
      const prefix =
        tenantId !== "all" ? TENANT_PREFIX_MAP[tenantId] : null;
      const tenantEmps = prefix
        ? MOCK_EMPLOYEES.filter((e) => e.id.startsWith(prefix))
        : MOCK_EMPLOYEES;

      const root = rootId
        ? tenantEmps.find((e) => e.id === rootId)
        : tenantEmps.find((e) => !MANAGER_MAP[e.id]);

      if (!root) return null;

      const buildNode = (emp: EmployeeListItem): OrgChartNode => {
        const childIds = Object.entries(MANAGER_MAP)
          .filter(([, mgrId]) => mgrId === emp.id)
          .map(([childId]) => childId);
        const children = childIds
          .map((cid) => tenantEmps.find((e) => e.id === cid))
          .filter(Boolean) as EmployeeListItem[];
        return {
          id: emp.id,
          displayName: emp.displayName,
          jobTitle: emp.jobTitle,
          department: emp.department,
          photo: emp.photo,
          directReports: children.sort((a, b) => a.displayName.localeCompare(b.displayName)).map(buildNode),
        };
      };

      return buildNode(root);
    },
    [tenantId]
  );

  return {
    employees: filteredEmployees,
    totalCount: filteredEmployees.length,
    facets,
    searchQuery,
    setSearchQuery,
    departmentFilter,
    setDepartmentFilter,
    officeFilter,
    setOfficeFilter,
    titleFilter,
    setTitleFilter,
    sortBy,
    setSortBy,
    getDetail,
    getOrgChart,
  };
}
