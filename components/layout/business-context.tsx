"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { ERPDynamicSelectOption } from "@/components/library/ui";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  AUTH_SESSION_EVENT,
  type AuthSessionChangeDetail,
} from "@/lib/auth/session";

const COMPANY_LIST_ENDPOINT = "/company-masters/list";
const BRANCH_LIST_ENDPOINT = "/branch-masters/list";
const BUSINESS_CONTEXT_CACHE_KEY = "erp_client_business_context";

type CompanyRecord = {
  compId: string;
  compName: string;
  compFinYearFrom: string | null;
  compFinYearTo: string | null;
  compDefault?: boolean;
};

type BranchRecord = {
  brId: string;
  brName: string;
  brIsDefault?: boolean;
};

type PersistedBusinessContext = {
  companyId: string | null;
  companyName: string | null;
  compFinYearFrom: string | null;
  compFinYearTo: string | null;
  branchId: string | null;
  branchName: string | null;
};

type BusinessContextValue = {
  companyOptions: ERPDynamicSelectOption[];
  branchOptions: ERPDynamicSelectOption[];
  selectedCompanyId: string;
  selectedBranchId: string;
  activeCompany: CompanyRecord | null;
  activeBranch: BranchRecord | null;
  isCompanySelectionLocked: boolean;
  isBranchSelectionLocked: boolean;
  loading: boolean;
  companyLoading: boolean;
  branchLoading: boolean;
  error: string | null;
  setSelectedCompanyId: (value: string) => void;
  setSelectedBranchId: (value: string) => void;
  setCompanySelectionLocked: (value: boolean) => void;
  setBranchSelectionLocked: (value: boolean) => void;
  refresh: () => Promise<void>;
};

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};

const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

function isLoginRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

function readPersistedBusinessContext(): PersistedBusinessContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const persisted = window.sessionStorage.getItem(BUSINESS_CONTEXT_CACHE_KEY);
  if (!persisted) {
    return null;
  }
  try {
    return JSON.parse(persisted) as PersistedBusinessContext;
  } catch {
    window.sessionStorage.removeItem(BUSINESS_CONTEXT_CACHE_KEY);
    return null;
  }
}

function persistBusinessContext(value: PersistedBusinessContext | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!value) {
    window.sessionStorage.removeItem(BUSINESS_CONTEXT_CACHE_KEY);
    return;
  }
  window.sessionStorage.setItem(BUSINESS_CONTEXT_CACHE_KEY, JSON.stringify(value));
}

export function clearBusinessContextSession(): void {
  persistBusinessContext(null);
}

function chooseDefaultCompany(companies: CompanyRecord[]): CompanyRecord | null {
  return companies.find((company) => company.compDefault) ?? companies[0] ?? null;
}

function chooseDefaultBranch(branches: BranchRecord[]): BranchRecord | null {
  return branches.find((branch) => branch.brIsDefault) ?? branches[0] ?? null;
}

function mapCompanyOptions(companies: CompanyRecord[]): ERPDynamicSelectOption[] {
  return [DEFAULT_COMPANY_OPTION, ...companies.map((company) => ({
    value: company.compId,
    label: company.compName,
  }))];
}

function mapBranchOptions(branches: BranchRecord[]): ERPDynamicSelectOption[] {
  return [DEFAULT_BRANCH_OPTION, ...branches.map((branch) => ({
    value: branch.brId,
    label: branch.brName,
  }))];
}

export function BusinessContextProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideShell = !pathname || isLoginRoute(pathname);
  const initialPersistedContext = useMemo(readPersistedBusinessContext, []);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState(
    initialPersistedContext?.companyId ?? "",
  );
  const [selectedBranchId, setSelectedBranchIdState] = useState(
    initialPersistedContext?.branchId ?? "",
  );
  const [isCompanySelectionLocked, setCompanySelectionLocked] = useState(false);
  const [isBranchSelectionLocked, setBranchSelectionLocked] = useState(false);
  const {
    run: loadCompanies,
    loading: companyLoading,
    error: companyError,
  } = useApi<unknown>(COMPANY_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });
  const {
    run: loadBranches,
    loading: branchLoading,
    error: branchError,
  } = useApi<unknown>(BRANCH_LIST_ENDPOINT, {
    toast: {
      success: false,
      error: false,
    },
  });

  const refreshCompanies = useCallback(async (): Promise<CompanyRecord[]> => {
    const payload = await loadCompanies({
      query: {
        compIsActive: "true",
        limit: "100",
      },
    });
    const nextCompanies = extractRows<CompanyRecord>(payload).filter(
      (company): company is CompanyRecord =>
        typeof company?.compId === "string" && typeof company?.compName === "string",
    );
    setCompanies(nextCompanies);
    return nextCompanies;
  }, [loadCompanies]);

  const refreshBranches = useCallback(async (companyId: string): Promise<BranchRecord[]> => {
    if (!companyId.trim()) {
      setBranches([]);
      return [];
    }
    const payload = await loadBranches({
      query: {
        compId: companyId.trim(),
        brIsActive: "true",
        limit: "100",
      },
    });
    const nextBranches = extractRows<BranchRecord>(payload).filter(
      (branch): branch is BranchRecord =>
        typeof branch?.brId === "string" && typeof branch?.brName === "string",
    );
    setBranches(nextBranches);
    return nextBranches;
  }, [loadBranches]);

  const refresh = useCallback(async () => {
    if (hideShell) {
      return;
    }
    await refreshCompanies();
  }, [hideShell, refreshCompanies]);

  useEffect(() => {
    if (hideShell) {
      return;
    }
    void refreshCompanies();
  }, [hideShell, refreshCompanies]);

  useEffect(() => {
    if (hideShell) {
      return;
    }
    if (companies.length === 0) {
      setSelectedCompanyIdState("");
      setBranches([]);
      setSelectedBranchIdState("");
      return;
    }
    const hasSelectedCompany = companies.some((company) => company.compId === selectedCompanyId);
    if (hasSelectedCompany) {
      return;
    }
    const fallbackCompany = chooseDefaultCompany(companies);
    setSelectedCompanyIdState(fallbackCompany?.compId ?? "");
  }, [companies, hideShell, selectedCompanyId]);

  useEffect(() => {
    if (hideShell) {
      return;
    }
    if (!selectedCompanyId.trim()) {
      setBranches([]);
      setSelectedBranchIdState("");
      return;
    }
    void refreshBranches(selectedCompanyId);
  }, [hideShell, refreshBranches, selectedCompanyId]);

  useEffect(() => {
    if (hideShell) {
      return;
    }
    if (!selectedCompanyId.trim()) {
      return;
    }
    if (branches.length === 0) {
      setSelectedBranchIdState("");
      return;
    }
    const hasSelectedBranch = branches.some((branch) => branch.brId === selectedBranchId);
    if (hasSelectedBranch) {
      return;
    }
    const fallbackBranch = chooseDefaultBranch(branches);
    setSelectedBranchIdState(fallbackBranch?.brId ?? "");
  }, [branches, hideShell, selectedBranchId, selectedCompanyId]);

  useEffect(() => {
    if (hideShell) {
      return;
    }
    const handleAuthSessionChange = (event: Event) => {
      const authEvent = event as CustomEvent<AuthSessionChangeDetail>;
      if (authEvent.detail?.token !== null) {
        return;
      }
      clearBusinessContextSession();
      setSelectedCompanyIdState("");
      setSelectedBranchIdState("");
      setCompanies([]);
      setBranches([]);
    };
    window.addEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange as EventListener);
    };
  }, [hideShell]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.compId === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.brId === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  useEffect(() => {
    if (hideShell) {
      return;
    }
    persistBusinessContext(
      activeCompany
        ? {
            companyId: activeCompany.compId,
            companyName: activeCompany.compName,
            compFinYearFrom: activeCompany.compFinYearFrom ?? null,
            compFinYearTo: activeCompany.compFinYearTo ?? null,
            branchId: activeBranch?.brId ?? null,
            branchName: activeBranch?.brName ?? null,
          }
        : null,
    );
  }, [activeBranch, activeCompany, hideShell]);

  const value = useMemo<BusinessContextValue>(() => ({
    companyOptions: mapCompanyOptions(companies),
    branchOptions: mapBranchOptions(branches),
    selectedCompanyId,
    selectedBranchId,
    activeCompany,
    activeBranch,
    isCompanySelectionLocked,
    isBranchSelectionLocked,
    loading: companyLoading || branchLoading,
    companyLoading,
    branchLoading,
    error: companyError ?? branchError ?? null,
    setSelectedCompanyId: (value) => {
      if (isCompanySelectionLocked) {
        return;
      }
      setSelectedCompanyIdState(value);
      setSelectedBranchIdState("");
    },
    setSelectedBranchId: (value) => {
      if (isBranchSelectionLocked) {
        return;
      }
      setSelectedBranchIdState(value);
    },
    setCompanySelectionLocked,
    setBranchSelectionLocked,
    refresh,
  }), [
    activeBranch,
    activeCompany,
    branchError,
    branchLoading,
    branches,
    companies,
    companyError,
    companyLoading,
    isBranchSelectionLocked,
    isCompanySelectionLocked,
    refresh,
    selectedBranchId,
    selectedCompanyId,
  ]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext(): BusinessContextValue {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusinessContext must be used within BusinessContextProvider");
  }
  return context;
}
