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
import {
  useGetBranchesByCompanyQuery,
  useGetCompanyListQuery,
  type BranchRecord,
  type CompanyRecord,
} from "@/store/api/businessContextApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  businessContextChanged,
  selectBusinessContext,
  selectIsAuthenticated,
} from "@/store/slices/authSlice";
import {
  branchSelectionLockChanged,
  companySelectionLockChanged,
  selectIsBranchSelectionLocked,
  selectIsCompanySelectionLocked,
} from "@/store/slices/businessContextSlice";

const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Branch",
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
  refresh: () => void;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

function isLoginRoute(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

function mapCompanyOptions(companies: CompanyRecord[]): ERPDynamicSelectOption[] {
  return [
    DEFAULT_COMPANY_OPTION,
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];
}

function mapBranchOptions(branches: BranchRecord[]): ERPDynamicSelectOption[] {
  return [
    DEFAULT_BRANCH_OPTION,
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];
}

export function clearBusinessContextSession(): void {
  // Business context is cleared through the persisted Redux auth slice on logout.
}

export function BusinessContextProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const hideShell = !pathname || isLoginRoute(pathname);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const persistedContext = useAppSelector(selectBusinessContext);
  const isCompanySelectionLocked = useAppSelector(selectIsCompanySelectionLocked);
  const isBranchSelectionLocked = useAppSelector(selectIsBranchSelectionLocked);

  // Local selected IDs — bootstrapped from Redux-persisted context
  const [selectedCompanyId, setSelectedCompanyIdState] = useState(
    persistedContext?.companyId ?? "",
  );
  const [selectedBranchId, setSelectedBranchIdState] = useState(
    persistedContext?.branchId ?? "",
  );

  // ── RTK Query fetches (replace the two useApi calls) ──────────────────────

  const {
    data: companies = [],
    isLoading: companyLoading,
    error: companyQueryError,
    refetch: refetchCompanies,
  } = useGetCompanyListQuery(undefined, { skip: hideShell });

  const {
    data: branches = [],
    isLoading: branchLoading,
    error: branchQueryError,
  } = useGetBranchesByCompanyQuery(selectedCompanyId, {
    skip: hideShell || !selectedCompanyId,
  });

  // ── Clear local state on logout (replaces DOM AUTH_SESSION_EVENT listener) ─

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedCompanyIdState("");
      setSelectedBranchIdState("");
    }
  }, [isAuthenticated]);

  // ── Auto-select first company if none is selected ─────────────────────────

  useEffect(() => {
    if (hideShell || companies.length === 0) return;
    const valid = companies.some((c) => c.id === selectedCompanyId);
    if (!valid) {
      const first = companies[0];
      if (first) setSelectedCompanyIdState(first.id);
    }
  }, [companies, hideShell, selectedCompanyId]);

  // ── Auto-select first branch when company changes ─────────────────────────

  useEffect(() => {
    if (hideShell || !selectedCompanyId) return;
    if (branches.length === 0) {
      setSelectedBranchIdState("");
      return;
    }
    const valid = branches.some((b) => b.id === selectedBranchId);
    if (!valid) {
      const first = branches[0];
      if (first) setSelectedBranchIdState(first.id);
    }
  }, [branches, hideShell, selectedBranchId, selectedCompanyId]);

  // ── Sync selection to Redux authSlice (for persistence + saga) ───────────

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId) ?? null,
    [branches, selectedBranchId],
  );

  useEffect(() => {
    if (hideShell) return;
    dispatch(
      businessContextChanged(
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
      ),
    );
  }, [activeBranch, activeCompany, dispatch, hideShell]);

  // ── Context value ─────────────────────────────────────────────────────────

  const setSelectedCompanyId = useCallback(
    (value: string) => {
      if (isCompanySelectionLocked) return;
      setSelectedCompanyIdState(value);
      setSelectedBranchIdState("");
    },
    [isCompanySelectionLocked],
  );

  const setSelectedBranchId = useCallback(
    (value: string) => {
      if (isBranchSelectionLocked) return;
      setSelectedBranchIdState(value);
    },
    [isBranchSelectionLocked],
  );

  const setCompanySelectionLocked = useCallback(
    (value: boolean) => dispatch(companySelectionLockChanged(value)),
    [dispatch],
  );

  const setBranchSelectionLocked = useCallback(
    (value: boolean) => dispatch(branchSelectionLockChanged(value)),
    [dispatch],
  );

  const refresh = useCallback(() => {
    if (!hideShell) refetchCompanies();
  }, [hideShell, refetchCompanies]);

  function extractErrorMsg(err: unknown): string | null {
    if (!err) return null;
    if (typeof err === "object" && "message" in err) {
      const m = (err as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
    return "Request failed.";
  }

  const value = useMemo<BusinessContextValue>(
    () => ({
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
      error: extractErrorMsg(companyQueryError) ?? extractErrorMsg(branchQueryError),
      setSelectedCompanyId,
      setSelectedBranchId,
      setCompanySelectionLocked,
      setBranchSelectionLocked,
      refresh,
    }),
    [
      activeBranch,
      activeCompany,
      branchLoading,
      branchQueryError,
      branches,
      companyLoading,
      companyQueryError,
      companies,
      isBranchSelectionLocked,
      isCompanySelectionLocked,
      refresh,
      selectedBranchId,
      selectedCompanyId,
      setBranchSelectionLocked,
      setCompanySelectionLocked,
      setSelectedBranchId,
      setSelectedCompanyId,
    ],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext(): BusinessContextValue {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusinessContext must be used within BusinessContextProvider");
  }
  return context;
}
