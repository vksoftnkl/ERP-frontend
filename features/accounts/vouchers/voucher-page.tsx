"use client";

/**
 * One voucher menu — the register first, the voucher in place (the Qt
 * `TxnMainView` for a voucher type). Mounted for each voucher type's own menu
 * (Contra, Journal, the notes, the accounting Sales / Purchase, the Receipt /
 * Payment Vouchers) with its type fixed, and for the all-in-one Voucher
 * Register (menu 262) with none: there the list shows every type the user may
 * view, and the entry has a type band. Opened by keys (a link from Issued
 * Cheques) it starts on that voucher, and its list is one Esc away.
 *
 * The register's rights are never menu 262's: each type is judged on its own
 * menu, and `/vouchers/types` (asked without a menu) returns each with them.
 */
import { useCallback, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { useBusinessContext } from "@/components/layout/business-context";
import { useGetVoucherTypesQuery } from "@/store/api/vouchersApi";
import { VoucherListView } from "./components/voucher-list-view";
import VoucherScreen from "./voucher-screen";
import type { VoucherKeys } from "./vouchers.types";

type View =
  | { screen: "list" }
  /** `typeCode` "" on the register = the first type it offers. */
  | { screen: "entry"; keys?: VoucherKeys; typeCode: string; serial: number };

export type VoucherPageProps = {
  /** "" = the Voucher Register: every type. */
  typeCode: string;
  /** The type's own menu; none on the register. */
  menuId?: number;
  title: string;
  subtitle: string;
  /** Open on this voucher rather than on the register. */
  initialKeys?: VoucherKeys;
  /** With `initialKeys` on the register: the voucher's type. */
  initialTypeCode?: string;
};

export default function VoucherPage(props: VoucherPageProps) {
  const { typeCode, menuId, title, subtitle, initialKeys, initialTypeCode } = props;
  const register = typeCode === "";
  const [view, setView] = useState<View>(() =>
    initialKeys
      ? { screen: "entry", keys: initialKeys, typeCode: initialTypeCode ?? typeCode, serial: 0 }
      : { screen: "list" },
  );
  const serial = useRef(0);

  // The register's types, for a new voucher's first type.
  const { activeCompany } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const registerTypes = useGetVoucherTypesQuery(register && companyId ? { companyId } : skipToken);

  const open = useCallback(
    (keys?: VoucherKeys, rowType?: string) => {
      serial.current += 1;
      setView({ screen: "entry", keys, typeCode: register ? (rowType ?? "") : typeCode, serial: serial.current });
    },
    [register, typeCode],
  );
  const switchType = useCallback((code: string) => {
    serial.current += 1;
    setView({ screen: "entry", typeCode: code, serial: serial.current });
  }, []);
  const back = useCallback(() => setView({ screen: "list" }), []);

  if (view.screen === "list") {
    return (
      <VoucherListView
        typeCode={typeCode}
        title={title}
        subtitle={subtitle}
        onCreate={() => open()}
        onOpen={(keys, rowType) => open(keys, rowType)}
      />
    );
  }
  const entryType = view.typeCode || registerTypes.data?.data.types[0]?.typeCode || "";
  return (
    <VoucherScreen
      // A fresh mount per opening and per type: the open-by-keys effect runs
      // once, and a switched type starts a clean voucher.
      key={`${view.serial}-${entryType}`}
      typeCode={entryType}
      menuId={menuId}
      title={title}
      register={register}
      initialKeys={view.keys}
      onSwitchType={register ? switchType : undefined}
      onBackToList={back}
    />
  );
}
