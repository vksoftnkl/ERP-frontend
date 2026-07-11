"use client";

import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import styles from "./page.module.scss";

type SelectOption = { value: string; label: string };

type QuotationItem = {
  id: string;
  itemName: string;
  qty: string;
  unit: string;
  rate: string;
  discPct: string;
  gstPct: string;
  weight: string;
  bags: string;
};

type QuotationItemField = Exclude<keyof QuotationItem, "id">;

type QuotationForm = {
  quoteRefno: string;
  quoteDate: string;
  validityDays: number;
  validUntil: string;
  salesmanId: string;
  agentId: string;
  contactPerson: string;
  contactNo: string;
  custName: string;
  custAddr: string;
  custPhone: string;
  custGstin: string;
  posStcd: string;
  hasFreight: boolean;
  hasLoad: boolean;
  hasUnload: boolean;
  hasPromo: boolean;
  remarks: string;
  paymentTerms: string;
  deliveryTerms: string;
  otherTerms: string;
  cashDiscPct: string;
  freightAmt: string;
  loadingAmt: string;
  unloadingAmt: string;
  otherCharges: string;
  splDisc: string;
  billSchDisc: string;
};

const SALESMEN: SelectOption[] = [
  { value: "S001", label: "Kumar" },
  { value: "S002", label: "Ravi" },
  { value: "S003", label: "Priya" },
];

const AGENTS: SelectOption[] = [
  { value: "A001", label: "Sri Traders" },
  { value: "A002", label: "VKS Agencies" },
];

const STATE_CODES: SelectOption[] = [
  { value: "33", label: "33 - Tamil Nadu" },
  { value: "32", label: "32 - Kerala" },
  { value: "29", label: "29 - Karnataka" },
  { value: "36", label: "36 - Telangana" },
  { value: "27", label: "27 - Maharashtra" },
];

const MAX_VALIDITY_DAYS = 3650;
const MS_PER_DAY = 86_400_000;
const DEFAULT_VALIDITY_DAYS = 30;

const toNum = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Local-calendar ISO date. `toISOString()` shifts the day for non-UTC offsets. */
const toIsoDate = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const addDays = (iso: string, days: number): string => {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
};

let itemSequence = 0;
const emptyItem = (): QuotationItem => {
  itemSequence += 1;
  return {
    id: `qi-${itemSequence}`,
    itemName: "",
    qty: "",
    unit: "PCS",
    rate: "",
    discPct: "",
    gstPct: "",
    weight: "",
    bags: "",
  };
};

const createForm = (): QuotationForm => {
  const today = toIsoDate(new Date());
  return {
    quoteRefno: "QT-2026-000148",
    quoteDate: today,
    validityDays: DEFAULT_VALIDITY_DAYS,
    validUntil: addDays(today, DEFAULT_VALIDITY_DAYS),
    salesmanId: "",
    agentId: "",
    contactPerson: "",
    contactNo: "",
    custName: "SRI MURUGAN STORES",
    custAddr: "",
    custPhone: "",
    custGstin: "",
    posStcd: "33",
    hasFreight: false,
    hasLoad: false,
    hasUnload: false,
    hasPromo: false,
    remarks: "",
    paymentTerms: "",
    deliveryTerms: "",
    otherTerms: "",
    cashDiscPct: "0",
    freightAmt: "0",
    loadingAmt: "0",
    unloadingAmt: "0",
    otherCharges: "0",
    splDisc: "0",
    billSchDisc: "0",
  };
};

const lineAmount = (item: QuotationItem): number => {
  const gross = toNum(item.qty) * toNum(item.rate);
  return gross - (gross * toNum(item.discPct)) / 100;
};

/* ---------- Nex* widget equivalents ---------- */

const FieldLabel = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
  <label className={styles.label} htmlFor={htmlFor}>
    {children}
  </label>
);

type LineEditProps = {
  id?: string;
  value: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  maxLength?: number;
  bold?: boolean;
  uppercase?: boolean;
};

const LineEdit = ({ bold, uppercase, readOnly, ...rest }: LineEditProps) => (
  <input
    type="text"
    className={bold ? `${styles.input} ${styles.bold}` : styles.input}
    readOnly={readOnly}
    tabIndex={readOnly ? -1 : undefined}
    style={uppercase ? { textTransform: "uppercase" } : undefined}
    {...rest}
  />
);

/** NexDoubleEdit — right-aligned, read-only numeric display. */
const DoubleEdit = ({ value, decimals = 2 }: { value: number; decimals?: number }) => (
  <input
    type="text"
    className={`${styles.input} ${styles.num}`}
    readOnly
    tabIndex={-1}
    value={value.toFixed(decimals)}
  />
);

type NumberEditProps = {
  id?: string;
  value: string | number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  min?: number;
  max?: number;
  step?: string;
};

const NumberEdit = ({ className, step = "any", ...rest }: NumberEditProps) => (
  <input
    type="number"
    step={step}
    className={`${styles.input} ${styles.num}${className ? ` ${className}` : ""}`}
    {...rest}
  />
);

const DateEdit = ({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) => <input type="date" id={id} className={styles.input} value={value} onChange={onChange} />;

const DropdownSingle = ({
  id,
  value,
  onChange,
  options,
  placeholder = "-- Select --",
}: {
  id?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  placeholder?: string;
}) => (
  <select id={id} className={styles.input} value={value} onChange={onChange}>
    <option value="">{placeholder}</option>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const GroupBox = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className={styles.groupBox}>
    <span className={styles.groupBoxTitle}>{title}</span>
    {children}
  </fieldset>
);

/* ---------------------------- page ---------------------------- */

export default function QuotationEntryPage() {
  const router = useRouter();
  const [form, setForm] = useState<QuotationForm>(createForm);
  const [items, setItems] = useState<QuotationItem[]>(() => [emptyItem()]);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const setField = useCallback(
    <K extends keyof QuotationForm>(key: K, value: QuotationForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /* Quote date, valid-until and validity days stay in sync in every direction. */
  const handleQuoteDate = (event: ChangeEvent<HTMLInputElement>) => {
    const quoteDate = event.target.value;
    setForm((prev) => ({ ...prev, quoteDate, validUntil: addDays(quoteDate, prev.validityDays) }));
  };

  const handleValidityDays = (event: ChangeEvent<HTMLInputElement>) => {
    const days = Math.min(MAX_VALIDITY_DAYS, Math.max(0, Math.trunc(toNum(event.target.value))));
    setForm((prev) => ({ ...prev, validityDays: days, validUntil: addDays(prev.quoteDate, days) }));
  };

  const handleValidUntil = (event: ChangeEvent<HTMLInputElement>) => {
    const validUntil = event.target.value;
    setForm((prev) => ({
      ...prev,
      validUntil,
      validityDays:
        validUntil && prev.quoteDate ? daysBetween(prev.quoteDate, validUntil) : prev.validityDays,
    }));
  };

  /* Clearing a charge flag zeroes its amount, so a disabled field can never inflate the net. */
  const toggleFreight = (checked: boolean) =>
    setForm((prev) => ({ ...prev, hasFreight: checked, freightAmt: checked ? prev.freightAmt : "0" }));
  const toggleLoad = (checked: boolean) =>
    setForm((prev) => ({ ...prev, hasLoad: checked, loadingAmt: checked ? prev.loadingAmt : "0" }));
  const toggleUnload = (checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      hasUnload: checked,
      unloadingAmt: checked ? prev.unloadingAmt : "0",
    }));

  const setItem = useCallback((id: string, key: QuotationItemField, value: string) => {
    setItems((rows) => rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }, []);

  const addRow = useCallback(() => setItems((rows) => [...rows, emptyItem()]), []);

  const totals = useMemo(() => {
    let totItems = 0;
    let totBags = 0;
    let totWeight = 0;
    let gross = 0;
    let itemDisc = 0;
    let taxAmt = 0;

    for (const row of items) {
      const qty = toNum(row.qty);
      if (!row.itemName.trim() && qty === 0) continue;
      totItems += 1;
      totBags += toNum(row.bags);
      totWeight += toNum(row.weight);
      const line = qty * toNum(row.rate);
      const discounted = line - (line * toNum(row.discPct)) / 100;
      gross += line;
      itemDisc += line - discounted;
      taxAmt += (discounted * toNum(row.gstPct)) / 100;
    }

    const schDisc = 0; // scheme engine hook
    const cdAmt = ((gross - itemDisc) * toNum(form.cashDiscPct)) / 100;
    const taxable =
      gross - itemDisc - schDisc - cdAmt - toNum(form.splDisc) - toNum(form.billSchDisc);
    const charges =
      toNum(form.freightAmt) +
      toNum(form.loadingAmt) +
      toNum(form.unloadingAmt) +
      toNum(form.otherCharges);
    const net = taxable + taxAmt + charges;
    const roundedNet = Math.round(net);

    return {
      totItems,
      totBags,
      totWeight,
      gross,
      itemDisc,
      schDisc,
      cdAmt,
      taxable,
      taxAmt,
      roundOff: roundedNet - net,
      net: roundedNet,
    };
  }, [
    items,
    form.cashDiscPct,
    form.splDisc,
    form.billSchDisc,
    form.freightAmt,
    form.loadingAmt,
    form.unloadingAmt,
    form.otherCharges,
  ]);

  /* -------- button actions -------- */

  const saveQuotation = useCallback((): boolean => {
    if (!form.quoteDate) {
      toast.error("Quote date is required.");
      return false;
    }
    const payloadItems = items.filter((row) => row.itemName.trim() && toNum(row.qty) > 0);
    if (payloadItems.length === 0) {
      toast.error("Add at least one item with a quantity.");
      return false;
    }
    console.log("Quotation payload", { form, items: payloadItems, totals });
    return true;
  }, [form, items, totals]);

  const onSave = useCallback(() => {
    if (saveQuotation()) toast.success("Quotation saved.");
  }, [saveQuotation]);

  const onSaveAndPrint = useCallback(() => {
    if (saveQuotation()) toast.success("Quotation saved and sent to print.");
  }, [saveQuotation]);

  const onDelete = useCallback(() => {
    if (!selectedRow) {
      toast.warn("Select a row to delete.");
      return;
    }
    setItems((rows) => rows.filter((row) => row.id !== selectedRow));
    setSelectedRow(null);
  }, [selectedRow]);

  const onClear = useCallback(() => {
    setItems([emptyItem()]);
    setSelectedRow(null);
    setForm((prev) => ({
      ...createForm(),
      quoteRefno: prev.quoteRefno,
      custName: prev.custName,
      salesmanId: prev.salesmanId,
      agentId: prev.agentId,
    }));
  }, []);

  const onShowList = useCallback(() => toast.info("Quotation list is not wired up yet."), []);
  const onEdit = useCallback(() => toast.info("Edit is not wired up yet."), []);
  const onCancel = useCallback(() => router.back(), [router]);

  /* -------- keyboard shortcuts (same as the Qt dialog) -------- */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const actions: Record<string, () => void> = {
        F2: onEdit,
        F3: onDelete,
        F5: onSave,
        F6: onSaveAndPrint,
        F7: onClear,
        F8: onShowList,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEdit, onDelete, onSave, onSaveAndPrint, onClear, onShowList]);

  return (
    <div className={styles.dialog}>
      <div className={styles.header}>
        <span className={styles.title}>QUOTATION ENTRY</span>
      </div>

      <div className={styles.row3}>
        <GroupBox title="Customer">
          <div className={styles.form}>
            <FieldLabel htmlFor="txtCustName">Customer Name</FieldLabel>
            <LineEdit id="txtCustName" value={form.custName} readOnly />

            <FieldLabel htmlFor="txtCustAddr">Address</FieldLabel>
            <LineEdit
              id="txtCustAddr"
              value={form.custAddr}
              onChange={(event) => setField("custAddr", event.target.value)}
            />

            <FieldLabel htmlFor="txtCustPhone">Phone</FieldLabel>
            <LineEdit
              id="txtCustPhone"
              value={form.custPhone}
              onChange={(event) => setField("custPhone", event.target.value)}
            />

            <FieldLabel htmlFor="txtCustGstin">GSTIN</FieldLabel>
            <LineEdit
              id="txtCustGstin"
              value={form.custGstin}
              maxLength={15}
              uppercase
              onChange={(event) => setField("custGstin", event.target.value.toUpperCase())}
            />

            <FieldLabel htmlFor="ddPosStcd">POS State Code</FieldLabel>
            <DropdownSingle
              id="ddPosStcd"
              value={form.posStcd}
              options={STATE_CODES}
              onChange={(event) => setField("posStcd", event.target.value)}
            />
          </div>
        </GroupBox>

        <GroupBox title="Sales Info">
          <div className={styles.form}>
            <FieldLabel htmlFor="ddSalesman">Salesman</FieldLabel>
            <DropdownSingle
              id="ddSalesman"
              value={form.salesmanId}
              options={SALESMEN}
              onChange={(event) => setField("salesmanId", event.target.value)}
            />

            <FieldLabel htmlFor="ddAgent">Agent</FieldLabel>
            <DropdownSingle
              id="ddAgent"
              value={form.agentId}
              options={AGENTS}
              onChange={(event) => setField("agentId", event.target.value)}
            />

            <FieldLabel htmlFor="txtContactPerson">Contact Person</FieldLabel>
            <LineEdit
              id="txtContactPerson"
              value={form.contactPerson}
              onChange={(event) => setField("contactPerson", event.target.value)}
            />

            <FieldLabel htmlFor="txtContactNo">Contact No</FieldLabel>
            <LineEdit
              id="txtContactNo"
              value={form.contactNo}
              onChange={(event) => setField("contactNo", event.target.value)}
            />

            <span />
            <div className={styles.checks}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.hasFreight}
                  onChange={(event) => toggleFreight(event.target.checked)}
                />
                Freight
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.hasLoad}
                  onChange={(event) => toggleLoad(event.target.checked)}
                />
                Load
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.hasUnload}
                  onChange={(event) => toggleUnload(event.target.checked)}
                />
                Unload
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={form.hasPromo}
                  onChange={(event) => setField("hasPromo", event.target.checked)}
                />
                Promo
              </label>
            </div>
          </div>
        </GroupBox>

        <GroupBox title="Quotation">
          <div className={styles.form}>
            <FieldLabel htmlFor="txtQuoteRefno">Quote No *</FieldLabel>
            <LineEdit id="txtQuoteRefno" value={form.quoteRefno} readOnly bold />

            <FieldLabel htmlFor="dtQuoteDate">Quote Date *</FieldLabel>
            <DateEdit id="dtQuoteDate" value={form.quoteDate} onChange={handleQuoteDate} />

            <FieldLabel htmlFor="dtValidUntil">Valid Until</FieldLabel>
            <DateEdit id="dtValidUntil" value={form.validUntil} onChange={handleValidUntil} />

            <FieldLabel htmlFor="spinValidityDays">Validity Days</FieldLabel>
            <NumberEdit
              id="spinValidityDays"
              className={styles.spin}
              min={0}
              max={MAX_VALIDITY_DAYS}
              step="1"
              value={form.validityDays}
              onChange={handleValidityDays}
            />
          </div>
        </GroupBox>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Item Name</th>
              <th className={styles.num} style={{ width: 90 }}>
                Qty
              </th>
              <th style={{ width: 80 }}>Unit</th>
              <th className={styles.num} style={{ width: 110 }}>
                Rate
              </th>
              <th className={styles.num} style={{ width: 90 }}>
                Disc %
              </th>
              <th className={styles.num} style={{ width: 90 }}>
                GST %
              </th>
              <th className={styles.num} style={{ width: 100 }}>
                Weight
              </th>
              <th className={styles.num} style={{ width: 80 }}>
                Bags
              </th>
              <th className={styles.num} style={{ width: 130 }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={10}>
                  No items. Press Enter on the last row to add.
                </td>
              </tr>
            ) : (
              items.map((row, index) => (
                <tr
                  key={row.id}
                  className={selectedRow === row.id ? styles.selected : undefined}
                  onClick={() => setSelectedRow(row.id)}
                >
                  <td>{index + 1}</td>
                  <td>
                    <input
                      className={styles.cellInput}
                      placeholder="Item name…"
                      value={row.itemName}
                      onChange={(event) => setItem(row.id, "itemName", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && index === items.length - 1) addRow();
                      }}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.qty}
                      onChange={(event) => setItem(row.id, "qty", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className={styles.cellInput}
                      value={row.unit}
                      onChange={(event) => setItem(row.id, "unit", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.rate}
                      onChange={(event) => setItem(row.id, "rate", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.discPct}
                      onChange={(event) => setItem(row.id, "discPct", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.gstPct}
                      onChange={(event) => setItem(row.id, "gstPct", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.weight}
                      onChange={(event) => setItem(row.id, "weight", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>
                    <input
                      type="number"
                      step="any"
                      className={`${styles.cellInput} ${styles.num}`}
                      value={row.bags}
                      onChange={(event) => setItem(row.id, "bags", event.target.value)}
                    />
                  </td>
                  <td className={styles.num}>{lineAmount(row).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.row3Bottom}>
        <GroupBox title="Charges">
          <div className={styles.form}>
            <FieldLabel>Cash Discount %</FieldLabel>
            <div className={styles.inline}>
              <NumberEdit
                className={styles.cdPercent}
                value={form.cashDiscPct}
                onChange={(event) => setField("cashDiscPct", event.target.value)}
              />
              <span className={styles.label}>CD Amt</span>
              <DoubleEdit value={totals.cdAmt} />
            </div>

            <FieldLabel>Freight Amt</FieldLabel>
            <NumberEdit
              value={form.freightAmt}
              disabled={!form.hasFreight}
              onChange={(event) => setField("freightAmt", event.target.value)}
            />

            <FieldLabel>Loading Amt</FieldLabel>
            <NumberEdit
              value={form.loadingAmt}
              disabled={!form.hasLoad}
              onChange={(event) => setField("loadingAmt", event.target.value)}
            />

            <FieldLabel>UnLoading Amt</FieldLabel>
            <NumberEdit
              value={form.unloadingAmt}
              disabled={!form.hasUnload}
              onChange={(event) => setField("unloadingAmt", event.target.value)}
            />

            <FieldLabel>Other Charges</FieldLabel>
            <NumberEdit
              value={form.otherCharges}
              onChange={(event) => setField("otherCharges", event.target.value)}
            />
          </div>
        </GroupBox>

        <GroupBox title="Terms">
          <div className={styles.form}>
            <FieldLabel htmlFor="txtRemarks">Remarks</FieldLabel>
            <LineEdit
              id="txtRemarks"
              value={form.remarks}
              onChange={(event) => setField("remarks", event.target.value)}
            />

            <FieldLabel htmlFor="txtPaymentTerms">Payment Terms</FieldLabel>
            <LineEdit
              id="txtPaymentTerms"
              value={form.paymentTerms}
              onChange={(event) => setField("paymentTerms", event.target.value)}
            />

            <FieldLabel htmlFor="txtDeliveryTerms">Delivery Terms</FieldLabel>
            <LineEdit
              id="txtDeliveryTerms"
              value={form.deliveryTerms}
              onChange={(event) => setField("deliveryTerms", event.target.value)}
            />

            <FieldLabel htmlFor="txtTermsConditions">Other Terms</FieldLabel>
            <LineEdit
              id="txtTermsConditions"
              value={form.otherTerms}
              onChange={(event) => setField("otherTerms", event.target.value)}
            />
          </div>
        </GroupBox>

        <GroupBox title="Totals">
          <div className={styles.totalsGrid}>
            <span className={styles.label}>Total Items</span>
            <DoubleEdit value={totals.totItems} decimals={0} />
            <span className={styles.label}>Total Bags</span>
            <DoubleEdit value={totals.totBags} />
            <span className={styles.label}>Total Weight</span>
            <DoubleEdit value={totals.totWeight} />

            <span className={styles.label}>Item Discount</span>
            <DoubleEdit value={totals.itemDisc} />
            <span className={styles.label}>Scheme Discount</span>
            <DoubleEdit value={totals.schDisc} />
            <span className={styles.label}>Gross Amount</span>
            <DoubleEdit value={totals.gross} />

            <span className={styles.label}>Special Discount</span>
            <DoubleEdit value={toNum(form.splDisc)} />
            <span className={styles.label}>Bill Scheme Discount</span>
            <DoubleEdit value={toNum(form.billSchDisc)} />
            <span className={styles.label}>Taxable Amount</span>
            <DoubleEdit value={totals.taxable} />

            <span className={styles.label}>Tax Amount</span>
            <DoubleEdit value={totals.taxAmt} />
            <span className={styles.label}>Round Off</span>
            <DoubleEdit value={totals.roundOff} />
            <span className={styles.label}>Net Amount</span>
            <DoubleEdit value={totals.net} />
          </div>
        </GroupBox>
      </div>

      <div className={styles.btnBar}>
        <button type="button" className={styles.btn} onClick={onShowList}>
          Show List - F8
        </button>
        <button type="button" className={styles.btn} onClick={onEdit}>
          Edit - F2
        </button>
        <button type="button" className={styles.btn} onClick={onDelete}>
          Delete - F3
        </button>
        <button type="button" className={styles.btn} onClick={onClear}>
          Clear - F7
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.primary}`}
          onClick={onSaveAndPrint}
        >
          Save &amp; Print - F6
        </button>
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={onSave}>
          Save - F5
        </button>
        <button type="button" className={styles.btn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
