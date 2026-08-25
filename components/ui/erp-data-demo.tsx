"use client";

import { type FormEvent, useMemo, useState } from "react";
import ReusableTable, { type ReusableTableColumn } from "@/components/ui/table";

type TabType = "employee" | "project" | "inventory";
type SortDirection = "asc" | "desc";

type EmployeeRow = {
  id: number;
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  startDate: string;
};

type ProjectRow = {
  id: number;
  projectName: string;
  projectCode: string;
  client: string;
  budget: string;
  deadline: string;
  priority: "Low" | "Medium" | "High" | "Critical";
};

type InventoryRow = {
  id: number;
  itemName: string;
  sku: string;
  category: string;
  quantity: string;
  unitPrice: string;
  supplier: string;
};

type ERPFormData = {
  employeeId: string;
  fullName: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  startDate: string;
  projectName: string;
  projectCode: string;
  client: string;
  budget: string;
  deadline: string;
  priority: string;
  itemName: string;
  sku: string;
  category: string;
  quantity: string;
  unitPrice: string;
  supplier: string;
};

type SortConfig = Record<TabType, { key: string | null; direction: SortDirection }>;
type PagerConfig = Record<TabType, number>;
type SearchConfig = Record<TabType, string>;

const INITIAL_FORM_DATA: ERPFormData = {
  employeeId: "",
  fullName: "",
  department: "",
  position: "",
  email: "",
  phone: "",
  startDate: "",
  projectName: "",
  projectCode: "",
  client: "",
  budget: "",
  deadline: "",
  priority: "",
  itemName: "",
  sku: "",
  category: "",
  quantity: "",
  unitPrice: "",
  supplier: "",
};

const INITIAL_EMPLOYEES: EmployeeRow[] = [
  {
    id: 1,
    employeeId: "EMP001",
    fullName: "Sarah Johnson",
    department: "IT",
    position: "Senior Developer",
    email: "sarah.j@company.com",
    phone: "+1 (555) 001-0001",
    startDate: "2023-01-15",
  },
  {
    id: 2,
    employeeId: "EMP002",
    fullName: "Michael Chen",
    department: "Sales",
    position: "Sales Manager",
    email: "michael.c@company.com",
    phone: "+1 (555) 001-0002",
    startDate: "2022-06-20",
  },
  {
    id: 3,
    employeeId: "EMP003",
    fullName: "Emily Rodriguez",
    department: "HR",
    position: "HR Specialist",
    email: "emily.r@company.com",
    phone: "+1 (555) 001-0003",
    startDate: "2023-03-10",
  },
  {
    id: 4,
    employeeId: "EMP004",
    fullName: "David Kim",
    department: "Finance",
    position: "Financial Analyst",
    email: "david.k@company.com",
    phone: "+1 (555) 001-0004",
    startDate: "2023-05-22",
  },
  {
    id: 5,
    employeeId: "EMP005",
    fullName: "Jessica Brown",
    department: "Marketing",
    position: "Marketing Director",
    email: "jessica.b@company.com",
    phone: "+1 (555) 001-0005",
    startDate: "2021-11-30",
  },
];

const INITIAL_PROJECTS: ProjectRow[] = [
  {
    id: 1,
    projectName: "Website Redesign",
    projectCode: "PRJ-2024-001",
    client: "Acme Corp",
    budget: "50000",
    deadline: "2024-06-30",
    priority: "High",
  },
  {
    id: 2,
    projectName: "Mobile App Development",
    projectCode: "PRJ-2024-002",
    client: "Tech Startup Inc",
    budget: "120000",
    deadline: "2024-09-15",
    priority: "Critical",
  },
  {
    id: 3,
    projectName: "Database Migration",
    projectCode: "PRJ-2024-003",
    client: "Finance Group",
    budget: "35000",
    deadline: "2024-05-20",
    priority: "Medium",
  },
  {
    id: 4,
    projectName: "CRM Implementation",
    projectCode: "PRJ-2024-004",
    client: "Sales Corp",
    budget: "85000",
    deadline: "2024-08-10",
    priority: "High",
  },
  {
    id: 5,
    projectName: "Cloud Infrastructure",
    projectCode: "PRJ-2024-005",
    client: "Tech Giants",
    budget: "200000",
    deadline: "2024-12-31",
    priority: "Critical",
  },
];

const INITIAL_INVENTORY: InventoryRow[] = [
  {
    id: 1,
    itemName: "Office Chair",
    sku: "SKU-12345",
    category: "Furniture",
    quantity: "50",
    unitPrice: "299.99",
    supplier: "Office Supplies Co",
  },
  {
    id: 2,
    itemName: "Laptop",
    sku: "SKU-12346",
    category: "Electronics",
    quantity: "25",
    unitPrice: "1299.99",
    supplier: "Tech Distributors",
  },
  {
    id: 3,
    itemName: "Printer Paper",
    sku: "SKU-12347",
    category: "Supplies",
    quantity: "500",
    unitPrice: "8.99",
    supplier: "Paper Merchants",
  },
  {
    id: 4,
    itemName: "Desk Lamp",
    sku: "SKU-12348",
    category: "Furniture",
    quantity: "75",
    unitPrice: "45.99",
    supplier: "Lighting Solutions",
  },
  {
    id: 5,
    itemName: "Wireless Mouse",
    sku: "SKU-12349",
    category: "Electronics",
    quantity: "100",
    unitPrice: "29.99",
    supplier: "Tech Distributors",
  },
];

function toSearchableString(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function toNumericIfPossible(value: unknown): number | null {
  const cleaned = String(value ?? "").replace(/[, ]+/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function sortData<T extends Record<string, unknown>>(
  data: T[],
  sortKey: string | null,
  direction: SortDirection,
): T[] {
  if (!sortKey) {
    return data;
  }

  const sorted = [...data];
  sorted.sort((a, b) => {
    const left = a[sortKey as keyof T];
    const right = b[sortKey as keyof T];

    const leftNumeric = toNumericIfPossible(left);
    const rightNumeric = toNumericIfPossible(right);
    if (leftNumeric !== null && rightNumeric !== null) {
      return direction === "asc" ? leftNumeric - rightNumeric : rightNumeric - leftNumeric;
    }

    const leftText = String(left ?? "");
    const rightText = String(right ?? "");
    const compare = leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? compare : -compare;
  });

  return sorted;
}

function filterData<T extends Record<string, unknown>>(data: T[], query: string): T[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return data;
  }

  return data.filter((item) =>
    Object.values(item).some((value) => toSearchableString(value).includes(keyword)),
  );
}

function paginateData<T>(data: T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return data.slice(start, start + perPage);
}

function getFormDataFromRecord(record: Record<string, unknown>): ERPFormData {
  const next = { ...INITIAL_FORM_DATA };
  for (const [key, value] of Object.entries(record)) {
    if (key in next) {
      next[key as keyof ERPFormData] = String(value ?? "");
    }
  }
  return next;
}

export default function ERPAdvancedFixed() {
  const [isOpen, setIsOpen] = useState(false);
  const [formType, setFormType] = useState<TabType>("employee");
  const [activeTab, setActiveTab] = useState<TabType>("employee");
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [viewData, setViewData] = useState<Record<string, unknown> | null>(null);
  const [formData, setFormData] = useState<ERPFormData>(INITIAL_FORM_DATA);

  const [employees, setEmployees] = useState<EmployeeRow[]>(INITIAL_EMPLOYEES);
  const [projects, setProjects] = useState<ProjectRow[]>(INITIAL_PROJECTS);
  const [inventory, setInventory] = useState<InventoryRow[]>(INITIAL_INVENTORY);

  const [currentPage, setCurrentPage] = useState<PagerConfig>({
    employee: 1,
    project: 1,
    inventory: 1,
  });
  const [itemsPerPage, setItemsPerPage] = useState<PagerConfig>({
    employee: 10,
    project: 10,
    inventory: 10,
  });
  const [searchQuery, setSearchQuery] = useState<SearchConfig>({
    employee: "",
    project: "",
    inventory: "",
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    employee: { key: null, direction: "asc" },
    project: { key: null, direction: "asc" },
    inventory: { key: null, direction: "asc" },
  });

  const resetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setEditMode(false);
    setEditId(null);
  };

  const closeEditorModal = () => {
    setIsOpen(false);
    resetForm();
  };

  const handleSort = (type: TabType, key: string) => {
    setSortConfig((current) => {
      const nextDirection =
        current[type].key === key && current[type].direction === "asc" ? "desc" : "asc";
      return {
        ...current,
        [type]: { key, direction: nextDirection },
      };
    });
  };

  const handleSearchChange = (type: TabType, value: string) => {
    setSearchQuery((current) => ({ ...current, [type]: value }));
    setCurrentPage((current) => ({ ...current, [type]: 1 }));
  };

  const openCreateModal = (type: TabType) => {
    setFormType(type);
    setIsOpen(true);
    setEditMode(false);
    resetForm();
  };

  const handleEdit = (type: TabType, item: EmployeeRow | ProjectRow | InventoryRow) => {
    setFormType(type);
    setEditMode(true);
    setEditId(item.id);
    setFormData(getFormDataFromRecord(item as unknown as Record<string, unknown>));
    setIsOpen(true);
  };

  const handleView = (type: TabType, item: EmployeeRow | ProjectRow | InventoryRow) => {
    setFormType(type);
    setViewData(item as unknown as Record<string, unknown>);
    setViewMode(true);
  };

  const handleDelete = (type: TabType, id: number) => {
    const allowDelete = window.confirm("Are you sure you want to delete this record?");
    if (!allowDelete) {
      return;
    }

    if (type === "employee") {
      setEmployees((current) => current.filter((item) => item.id !== id));
      return;
    }

    if (type === "project") {
      setProjects((current) => current.filter((item) => item.id !== id));
      return;
    }

    setInventory((current) => current.filter((item) => item.id !== id));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextId = editMode && editId !== null ? editId : Date.now();

    if (formType === "employee") {
      const payload: EmployeeRow = {
        id: nextId,
        employeeId: formData.employeeId.trim(),
        fullName: formData.fullName.trim(),
        department: formData.department.trim(),
        position: formData.position.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        startDate: formData.startDate,
      };

      setEmployees((current) =>
        editMode
          ? current.map((item) => (item.id === nextId ? payload : item))
          : [...current, payload],
      );
    } else if (formType === "project") {
      const payload: ProjectRow = {
        id: nextId,
        projectName: formData.projectName.trim(),
        projectCode: formData.projectCode.trim(),
        client: formData.client.trim(),
        budget: formData.budget.trim(),
        deadline: formData.deadline,
        priority: (formData.priority as ProjectRow["priority"]) || "Low",
      };

      setProjects((current) =>
        editMode
          ? current.map((item) => (item.id === nextId ? payload : item))
          : [...current, payload],
      );
    } else {
      const payload: InventoryRow = {
        id: nextId,
        itemName: formData.itemName.trim(),
        sku: formData.sku.trim(),
        category: formData.category.trim(),
        quantity: formData.quantity.trim(),
        unitPrice: formData.unitPrice.trim(),
        supplier: formData.supplier.trim(),
      };

      setInventory((current) =>
        editMode
          ? current.map((item) => (item.id === nextId ? payload : item))
          : [...current, payload],
      );
    }

    closeEditorModal();
  };

  const getSortArrow = (type: TabType, sortKey: string) => {
    if (sortConfig[type].key !== sortKey) {
      return "↕";
    }

    return sortConfig[type].direction === "asc" ? "▲" : "▼";
  };

  const renderSortHeader = (type: TabType, label: string, sortKey: string) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 border-none bg-transparent p-0 font-semibold text-inherit"
      onClick={() => handleSort(type, sortKey)}
    >
      <span>{label}</span>
      <span className="text-[10px] text-slate-500">{getSortArrow(type, sortKey)}</span>
    </button>
  );

  const actionCell = (
    type: TabType,
    item: EmployeeRow | ProjectRow | InventoryRow,
  ) => (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <button
        type="button"
        className="rounded-[4px] border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
        onClick={() => handleView(type, item)}
      >
        View
      </button>
      <button
        type="button"
        className="rounded-[4px] border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
        onClick={() => handleEdit(type, item)}
      >
        Edit
      </button>
      <button
        type="button"
        className="rounded-[4px] border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
        onClick={() => handleDelete(type, item.id)}
      >
        Delete
      </button>
    </div>
  );

  const employeeColumns = useMemo<ReusableTableColumn<EmployeeRow>[]>(
    () => [
      { key: "employeeId", header: renderSortHeader("employee", "ID", "employeeId"), accessor: "employeeId", width: "120px" },
      { key: "fullName", header: renderSortHeader("employee", "Full Name", "fullName"), accessor: "fullName", width: "200px" },
      { key: "department", header: renderSortHeader("employee", "Department", "department"), accessor: "department", width: "140px" },
      { key: "position", header: renderSortHeader("employee", "Position", "position"), accessor: "position", width: "180px" },
      { key: "email", header: renderSortHeader("employee", "Email", "email"), accessor: "email", width: "210px" },
      { key: "startDate", header: renderSortHeader("employee", "Start Date", "startDate"), accessor: "startDate", width: "120px" },
      {
        key: "actions",
        header: "Actions",
        width: "210px",
        align: "center",
        render: (row) => actionCell("employee", row),
      },
    ],
    [sortConfig.employee],
  );

  const projectColumns = useMemo<ReusableTableColumn<ProjectRow>[]>(
    () => [
      { key: "projectCode", header: renderSortHeader("project", "Code", "projectCode"), accessor: "projectCode", width: "140px" },
      { key: "projectName", header: renderSortHeader("project", "Project Name", "projectName"), accessor: "projectName", width: "220px" },
      { key: "client", header: renderSortHeader("project", "Client", "client"), accessor: "client", width: "180px" },
      {
        key: "budget",
        header: renderSortHeader("project", "Budget", "budget"),
        accessor: "budget",
        width: "140px",
        align: "right",
        render: (row) => `$${Number(row.budget || "0").toLocaleString()}`,
      },
      { key: "deadline", header: renderSortHeader("project", "Deadline", "deadline"), accessor: "deadline", width: "130px" },
      {
        key: "priority",
        header: renderSortHeader("project", "Priority", "priority"),
        accessor: "priority",
        width: "110px",
      },
      {
        key: "actions",
        header: "Actions",
        width: "210px",
        align: "center",
        render: (row) => actionCell("project", row),
      },
    ],
    [sortConfig.project],
  );

  const inventoryColumns = useMemo<ReusableTableColumn<InventoryRow>[]>(
    () => [
      { key: "sku", header: renderSortHeader("inventory", "SKU", "sku"), accessor: "sku", width: "140px" },
      { key: "itemName", header: renderSortHeader("inventory", "Item Name", "itemName"), accessor: "itemName", width: "200px" },
      { key: "category", header: renderSortHeader("inventory", "Category", "category"), accessor: "category", width: "140px" },
      {
        key: "quantity",
        header: renderSortHeader("inventory", "Quantity", "quantity"),
        accessor: "quantity",
        width: "110px",
        align: "right",
      },
      {
        key: "unitPrice",
        header: renderSortHeader("inventory", "Unit Price", "unitPrice"),
        accessor: "unitPrice",
        width: "130px",
        align: "right",
        render: (row) => `$${row.unitPrice}`,
      },
      { key: "supplier", header: renderSortHeader("inventory", "Supplier", "supplier"), accessor: "supplier", width: "180px" },
      {
        key: "actions",
        header: "Actions",
        width: "210px",
        align: "center",
        render: (row) => actionCell("inventory", row),
      },
    ],
    [sortConfig.inventory],
  );

  const filteredEmployees = useMemo(
    () =>
      sortData(
        filterData(employees, searchQuery.employee),
        sortConfig.employee.key,
        sortConfig.employee.direction,
      ),
    [employees, searchQuery.employee, sortConfig.employee],
  );

  const filteredProjects = useMemo(
    () =>
      sortData(
        filterData(projects, searchQuery.project),
        sortConfig.project.key,
        sortConfig.project.direction,
      ),
    [projects, searchQuery.project, sortConfig.project],
  );

  const filteredInventory = useMemo(
    () =>
      sortData(
        filterData(inventory, searchQuery.inventory),
        sortConfig.inventory.key,
        sortConfig.inventory.direction,
      ),
    [inventory, searchQuery.inventory, sortConfig.inventory],
  );

  const paginatedEmployees = useMemo(
    () => paginateData(filteredEmployees, currentPage.employee, itemsPerPage.employee),
    [currentPage.employee, filteredEmployees, itemsPerPage.employee],
  );

  const paginatedProjects = useMemo(
    () => paginateData(filteredProjects, currentPage.project, itemsPerPage.project),
    [currentPage.project, filteredProjects, itemsPerPage.project],
  );

  const paginatedInventory = useMemo(
    () => paginateData(filteredInventory, currentPage.inventory, itemsPerPage.inventory),
    [currentPage.inventory, filteredInventory, itemsPerPage.inventory],
  );

  const activeTotalCount =
    activeTab === "employee"
      ? filteredEmployees.length
      : activeTab === "project"
        ? filteredProjects.length
        : filteredInventory.length;

  const activeCurrentPage = currentPage[activeTab];
  const activeItemsPerPage = itemsPerPage[activeTab];
  const totalPages = Math.max(1, Math.ceil(activeTotalCount / activeItemsPerPage));
  const startIndex = activeTotalCount === 0 ? 0 : (activeCurrentPage - 1) * activeItemsPerPage + 1;
  const endIndex = Math.min(activeCurrentPage * activeItemsPerPage, activeTotalCount);

  const paginationButtons = useMemo(() => {
    const list: Array<number | "ellipsis"> = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if (
        page === 1 ||
        page === totalPages ||
        (page >= activeCurrentPage - 1 && page <= activeCurrentPage + 1)
      ) {
        list.push(page);
      } else if (page === activeCurrentPage - 2 || page === activeCurrentPage + 2) {
        list.push("ellipsis");
      }
    }
    return list;
  }, [activeCurrentPage, totalPages]);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto mb-8 max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold text-slate-900">Enterprise Resource Planning</h1>
        <p className="text-slate-600">Dynamic reusable table integrated for all data modules.</p>
      </div>

      <div className="mx-auto mb-6 max-w-7xl">
        <div className="flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("employee")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "employee"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Employees ({employees.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("project")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "project"
                ? "border-b-2 border-emerald-600 text-emerald-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === "inventory"
                ? "border-b-2 border-amber-600 text-amber-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Inventory ({inventory.length})
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[4px] border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                {activeTab === "employee"
                  ? "Employee Management"
                  : activeTab === "project"
                    ? "Project Tracking"
                    : "Inventory Control"}
              </h2>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  autoComplete="off"
                  type="text"
                  placeholder="Search..."
                  value={searchQuery[activeTab]}
                  onChange={(event) => handleSearchChange(activeTab, event.target.value)}
                  className="w-full rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-72"
                />
                <button
                  type="button"
                  onClick={() => openCreateModal(activeTab)}
                  className={`rounded-[4px] px-4 py-2 text-sm font-semibold text-white transition ${
                    activeTab === "employee"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : activeTab === "project"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  Add{" "}
                  {activeTab === "employee"
                    ? "Employee"
                    : activeTab === "project"
                      ? "Project"
                      : "Item"}
                </button>
              </div>
            </div>
          </header>

          <div className="max-h-[500px] overflow-auto">
            {activeTab === "employee" ? (
              <ReusableTable
                columns={employeeColumns}
                rows={paginatedEmployees}
                rowKey="id"
                minWidth="1200px"
                emptyText="No employees found"
              />
            ) : null}

            {activeTab === "project" ? (
              <ReusableTable
                columns={projectColumns}
                rows={paginatedProjects}
                rowKey="id"
                minWidth="1220px"
                emptyText="No projects found"
              />
            ) : null}

            {activeTab === "inventory" ? (
              <ReusableTable
                columns={inventoryColumns}
                rows={paginatedInventory}
                rowKey="id"
                minWidth="1180px"
                emptyText="No inventory records found"
              />
            ) : null}
          </div>

          <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <span>
                Showing {startIndex} to {endIndex} of {activeTotalCount} entries
              </span>
              <label className="inline-flex items-center gap-2">
                <span>Show:</span>
                <select
                  value={itemsPerPage[activeTab]}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setItemsPerPage((current) => ({ ...current, [activeTab]: next }));
                    setCurrentPage((current) => ({ ...current, [activeTab]: 1 }));
                  }}
                  className="rounded-[4px] border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((current) => ({
                    ...current,
                    [activeTab]: Math.max(1, current[activeTab] - 1),
                  }))
                }
                disabled={activeCurrentPage <= 1}
                className="rounded-[4px] border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              {paginationButtons.map((page, index) =>
                page === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={`page-${page}`}
                    type="button"
                    onClick={() =>
                      setCurrentPage((current) => ({
                        ...current,
                        [activeTab]: page,
                      }))
                    }
                    className={`rounded-[4px] border px-3 py-1 text-sm font-medium ${
                      activeCurrentPage === page
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {page}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((current) => ({
                    ...current,
                    [activeTab]: Math.min(totalPages, current[activeTab] + 1),
                  }))
                }
                disabled={activeCurrentPage >= totalPages}
                className="rounded-[4px] border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </footer>
        </section>
      </div>

      {viewMode && viewData ? (
        <div
          className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setViewMode(false)}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <section
            className="animate-slideUp relative w-full max-w-2xl rounded-[4px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <h3 className="text-xl font-semibold text-slate-900">
                {formType === "employee"
                  ? "Employee Details"
                  : formType === "project"
                    ? "Project Details"
                    : "Inventory Item Details"}
              </h3>
              <button
                type="button"
                onClick={() => setViewMode(false)}
                className="rounded-[4px] border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </header>

            <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              {Object.entries(viewData).map(([key, value]) =>
                key === "id" ? null : (
                  <div key={key}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="text-sm font-medium text-slate-900">{String(value)}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isOpen ? (
        <div
          className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeEditorModal}
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <section
            className="animate-slideUp relative max-h-[calc(90vh/var(--erp-ui-scale))] w-full max-w-2xl overflow-hidden rounded-[4px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold text-slate-900">
                  {editMode ? "Edit" : "Add New"}{" "}
                  {formType === "employee"
                    ? "Employee"
                    : formType === "project"
                      ? "Project"
                      : "Inventory Item"}
                </h3>
                <button
                  type="button"
                  onClick={closeEditorModal}
                  className="rounded-[4px] border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Close
                </button>
              </div>
            </header>

            <div className="max-h-[calc(calc(90vh/var(--erp-ui-scale))-160px)] overflow-y-auto p-6">
              <form
                id="erp-advanced-form"
                onSubmit={handleSubmit}
                autoComplete="off"
                className="space-y-5"
              >
                {formType === "employee" ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        name="employeeId"
                        value={formData.employeeId}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, employeeId: event.target.value }))
                        }
                        required
                        placeholder="Employee ID"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <input
                        autoComplete="off"
                        name="fullName"
                        value={formData.fullName}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, fullName: event.target.value }))
                        }
                        required
                        placeholder="Full Name"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        name="department"
                        value={formData.department}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, department: event.target.value }))
                        }
                        required
                        placeholder="Department"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <input
                        autoComplete="off"
                        name="position"
                        value={formData.position}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, position: event.target.value }))
                        }
                        required
                        placeholder="Position"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, email: event.target.value }))
                        }
                        required
                        placeholder="Email"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                      <input
                        autoComplete="off"
                        name="phone"
                        value={formData.phone}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, phone: event.target.value }))
                        }
                        required
                        placeholder="Phone Number"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <input
                      autoComplete="off"
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, startDate: event.target.value }))
                      }
                      required
                      className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </>
                ) : null}

                {formType === "project" ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        name="projectName"
                        value={formData.projectName}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, projectName: event.target.value }))
                        }
                        required
                        placeholder="Project Name"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <input
                        autoComplete="off"
                        name="projectCode"
                        value={formData.projectCode}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, projectCode: event.target.value }))
                        }
                        required
                        placeholder="Project Code"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <input
                      autoComplete="off"
                      name="client"
                      value={formData.client}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, client: event.target.value }))
                      }
                      required
                      placeholder="Client"
                      className="w-full rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        type="number"
                        name="budget"
                        value={formData.budget}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, budget: event.target.value }))
                        }
                        required
                        placeholder="Budget"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <input
                        autoComplete="off"
                        type="date"
                        name="deadline"
                        value={formData.deadline}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, deadline: event.target.value }))
                        }
                        required
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <select
                      name="priority"
                      value={formData.priority}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, priority: event.target.value }))
                      }
                      required
                      className="w-full rounded-[4px] border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select Priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </>
                ) : null}

                {formType === "inventory" ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        name="itemName"
                        value={formData.itemName}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, itemName: event.target.value }))
                        }
                        required
                        placeholder="Item Name"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <input
                        autoComplete="off"
                        name="sku"
                        value={formData.sku}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, sku: event.target.value }))
                        }
                        required
                        placeholder="SKU"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <input
                      autoComplete="off"
                      name="category"
                      value={formData.category}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, category: event.target.value }))
                      }
                      required
                      placeholder="Category"
                      className="w-full rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <input
                        autoComplete="off"
                        type="number"
                        name="quantity"
                        value={formData.quantity}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, quantity: event.target.value }))
                        }
                        required
                        placeholder="Quantity"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <input
                        autoComplete="off"
                        type="number"
                        step="0.01"
                        name="unitPrice"
                        value={formData.unitPrice}
                        onChange={(event) =>
                          setFormData((current) => ({ ...current, unitPrice: event.target.value }))
                        }
                        required
                        placeholder="Unit Price"
                        className="rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                    <input
                      autoComplete="off"
                      name="supplier"
                      value={formData.supplier}
                      onChange={(event) =>
                        setFormData((current) => ({ ...current, supplier: event.target.value }))
                      }
                      required
                      placeholder="Supplier"
                      className="w-full rounded-[4px] border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </>
                ) : null}
              </form>
            </div>

            <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={closeEditorModal}
                className="rounded-[4px] border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="erp-advanced-form"
                className={`rounded-[4px] px-4 py-2 text-sm font-semibold text-white ${
                  formType === "employee"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : formType === "project"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {editMode ? "Update" : "Add"}{" "}
                {formType === "employee"
                  ? "Employee"
                  : formType === "project"
                    ? "Project"
                    : "Item"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
