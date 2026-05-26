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
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import { extractRows } from "@/features/masters/shared/normalizers";
import { useApi } from "@/hooks/useApi";
import {
  AUTH_SESSION_EVENT,
  type AuthSessionChangeDetail,
} from "@/lib/auth/session";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  businessContextChanged,
  selectBusinessContext,
  type PersistedBusinessContext,
} from "@/store/slices/authSlice";

const COMPANY_LIST_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
const BRANCH_BY_COMPANY_BASE = "/master-lookups/branches/by-company";

type CompanyRecord = {
  id: string;
  name: string;
};
type BranchRecord = {
  id: string;
  name: string;
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

export function clearBusinessContextSession(): void {
  // Business context is cleared through the persisted Redux auth slice.
}

function chooseDefaultCompany(companies: CompanyRecord[]): CompanyRecord | null {
  return companies[0] ?? null;
}

function chooseDefaultBranch(branches: BranchRecord[]): BranchRecord | null {
  return branches[0] ?? null;
}

function mapCompanyOptions(companies: CompanyRecord[]): ERPDynamicSelectOption[] {
  return [DEFAULT_COMPANY_OPTION, ...companies.map((company) => ({
    value: company.id,
    label: company.name,
  }))];
}

function mapBranchOptions(branches: BranchRecord[]): ERPDynamicSelectOption[] {
  return [DEFAULT_BRANCH_OPTION, ...branches.map((branch) => ({
    value: branch.id,
    label: branch.name,
  }))];
}

export function BusinessContextProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const persistedBusinessContext = useAppSelector(selectBusinessContext);
  const pathname = usePathname();
  const hideShell = !pathname || isLoginRoute(pathname);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState(
    persistedBusinessContext?.companyId ?? "",
  );
  const [selectedBranchId, setSelectedBranchIdState] = useState(
    persistedBusinessContext?.branchId ?? "",
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
  } = useApi<unknown>(BRANCH_BY_COMPANY_BASE, {
    toast: {
      success: false,
      error: false,
    },
  });
  const refreshCompanies = useCallback(async (): Promise<CompanyRecord[]> => {
    const payload = await loadCompanies({
      query: {
        module: "companies",
        limit: "20",
      },
    });
    const nextCompanies = extractRows<CompanyRecord>(payload).filter(
      (company): company is CompanyRecord =>
        typeof company?.id === "string" && typeof company?.name === "string",
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
      url: `${BRANCH_BY_COMPANY_BASE}/${companyId.trim()}`,
    });
    const nextBranches = extractRows<BranchRecord>(payload).filter(
      (branch): branch is BranchRecord =>
        typeof branch?.id === "string" && typeof branch?.name === "string",
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
    const hasSelectedCompany = companies.some((company) => company.id === selectedCompanyId);
    if (hasSelectedCompany) {
      return;
    }
    const fallbackCompany = chooseDefaultCompany(companies);
    setSelectedCompanyIdState(fallbackCompany?.id ?? "");
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
    const hasSelectedBranch = branches.some((branch) => branch.id === selectedBranchId);
    if (hasSelectedBranch) {
      return;
    }
    const fallbackBranch = chooseDefaultBranch(branches);
    setSelectedBranchIdState(fallbackBranch?.id ?? "");
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
      dispatch(businessContextChanged(null));
      setSelectedCompanyIdState("");
      setSelectedBranchIdState("");
      setCompanies([]);
      setBranches([]);
    };
    window.addEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, handleAuthSessionChange as EventListener);
    };
  }, [dispatch, hideShell]);
  const activeCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );
  useEffect(() => {
    if (hideShell) {
      return;
    }
    dispatch(businessContextChanged(
      activeCompany
        ? {
            companyId: activeCompany.id,
            companyName: activeCompany.name,
            compFinYearFrom: null,
            compFinYearTo: null,
            branchId: activeBranch?.id ?? null,
            branchName: activeBranch?.name ?? null,
          }
        : null,
    ));
  }, [activeBranch, activeCompany, dispatch, hideShell]);
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