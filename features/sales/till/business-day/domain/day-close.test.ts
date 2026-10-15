import { describe, expect, it } from "vitest";

import {
  CLOSE_CONFIRM_NOTE,
  NO_EDIT,
  approverChoices,
  closeQuestion,
  closedText,
  countsDoneLine,
  dayButtons,
  dayLabelOf,
  dayPrintOf,
  dayReasonParams,
  exceptionBody,
  exceptionClosedText,
  exceptionIntro,
  exceptionPages,
  exceptionProblem,
  isCloseBlocked,
  isPinRefusal,
  reasonChoices,
  reopenBody,
  reopenIntro,
  reopenProblem,
  reopenedText,
  type CountedPage,
  type ExceptionDraft,
} from "./day-close";
import type { DayKey, TillCloseCheck, TillDay } from "./wire";

const DAY: TillDay = {
  tbdId: "d1",
  tbdAccYear: "2026-2027",
  tbdCompanyId: "c1",
  tbdBranchId: "b1",
  tbdBusinessDate: "2026-10-14",
  tbdStatus: "OPEN",
  tbdOpenedOn: "2026-10-14T03:30:00.000Z",
  tbdOpenedBy: "u1",
  tbdClosedOn: null,
  tbdClosedByName: "",
  tbdZNo: "",
  tbdReopenCount: 0,
  sessions: [],
  handoverReceipt: "REQUIRED",
  awaitingReceipt: { thisDay: 0, earlierDays: 0, oldestOn: null },
};

const CLOSED: TillDay = { ...DAY, tbdStatus: "CLOSED", tbdZNo: "3" };

function check(over: Partial<TillCloseCheck> = {}): TillCloseCheck {
  return {
    tbdId: "d1",
    tbdAccYear: "2026-2027",
    tbdBusinessDate: "2026-10-14",
    tbdStatus: "OPEN",
    items: [],
    canClose: false,
    canCloseWithException: false,
    ...over,
  };
}

const KEY: DayKey = { companyId: "c1", branchId: "b1", accYear: "2026-2027", tbdId: "d1" };

describe("dayButtons", () => {
  it("closes an open day the server says may close — F10", () => {
    const buttons = dayButtons(DAY, check({ canClose: true }), true);
    expect(buttons.closeDay).toEqual({ enabled: true, title: "Close the business day — F10" });
    expect(buttons.closeException).toEqual({
      enabled: false,
      title: "Only when every red item is a session still open",
    });
    expect(buttons.reopen).toEqual({ enabled: false, title: "Only a closed day is reopened" });
    expect(buttons.print).toEqual({
      enabled: true,
      label: "Print day X",
      title: "A reading of the day so far: not a closing report",
    });
  });

  it("offers the exception only when every red is a live session", () => {
    const buttons = dayButtons(DAY, check({ canCloseWithException: true }), true);
    expect(buttons.closeDay).toEqual({ enabled: false, title: "Red items block the close: clear them first" });
    expect(buttons.closeException).toEqual({
      enabled: true,
      title: "Only live sessions block: count their drawers here and close",
    });
  });

  it("waits for the check, and ignores another day's", () => {
    expect(dayButtons(DAY, null, true).closeDay).toEqual({
      enabled: false,
      title: "Waiting for the server's close-check",
    });
    expect(dayButtons(DAY, check({ tbdId: "other", canClose: true }), true).closeDay.enabled).toBe(false);
  });

  it("reopens a closed day and prints its store Z", () => {
    const buttons = dayButtons(CLOSED, check({ tbdStatus: "CLOSED" }), true);
    expect(buttons.closeDay).toEqual({ enabled: false, title: "Only an open day is closed" });
    expect(buttons.reopen).toEqual({ enabled: true, title: "Open the closed day again (an area manager's PIN)" });
    expect(buttons.print).toEqual({ enabled: true, label: "Print store Z", title: "The store Z of the closed day" });
  });

  it("needs Business Day EDIT for all three, not for the print", () => {
    const open = dayButtons(DAY, check({ canClose: true, canCloseWithException: true }), false);
    expect(open.closeDay).toEqual({ enabled: false, title: NO_EDIT });
    expect(open.closeException).toEqual({ enabled: false, title: NO_EDIT });
    expect(dayButtons(CLOSED, null, false).reopen).toEqual({ enabled: false, title: NO_EDIT });
    expect(open.print.enabled).toBe(true);
  });

  it("has nothing to do without a day", () => {
    const buttons = dayButtons(null, null, true);
    expect(buttons.closeDay.enabled).toBe(false);
    expect(buttons.reopen.enabled).toBe(false);
    expect(buttons.print.enabled).toBe(false);
  });
});

describe("dayPrintOf", () => {
  it("prints the day X while open, the store Z once closed, with the day's own branch", () => {
    expect(dayPrintOf(DAY, { companyId: "hc", branchId: "hb" })).toEqual({
      target: { docId: "d1", companyId: "c1", accYear: "2026-2027", branchId: "b1", filename: "day-x-20261014" },
      label: "Day X 14-10-2026",
    });
    expect(dayPrintOf(CLOSED, { companyId: "hc", branchId: "hb" })).toEqual({
      target: { docId: "d1", companyId: "c1", accYear: "2026-2027", branchId: "b1", filename: "store-z-20261014" },
      label: "Store Z 14-10-2026",
    });
  });
});

describe("close day", () => {
  it("asks and answers as Qt", () => {
    expect(closeQuestion(DAY)).toBe("Close business day 14-10-2026?");
    expect(CLOSE_CONFIRM_NOTE).toContain("The store Z is issued.");
    expect(closedText(DAY, "4")).toBe("Business day 14-10-2026 is closed — store Z 4.");
    expect(closedText(DAY, "")).toBe("Business day 14-10-2026 is closed.");
  });

  it("treats TILL_DAY_CLOSE_BLOCKED or any 409 as 'something changed', not an error", () => {
    expect(isCloseBlocked({ status: 409, code: "", field: "", message: "" })).toBe(true);
    expect(isCloseBlocked({ status: 422, code: "TILL_DAY_CLOSE_BLOCKED", field: "", message: "" })).toBe(true);
    expect(isCloseBlocked({ status: 403, code: "TILL_RIGHT_EDIT", field: "", message: "" })).toBe(false);
  });

  it("clears the PIN on a PIN refusal", () => {
    expect(isPinRefusal({ status: 422, code: "TILL_APPROVER_PIN", field: "", message: "" })).toBe(true);
    expect(isPinRefusal({ status: 422, code: "", field: "approverPin", message: "" })).toBe(true);
    expect(isPinRefusal({ status: 422, code: "TILL_REASON_INVALID", field: "reasonId", message: "" })).toBe(false);
  });
});

describe("reasons and approvers", () => {
  it("asks grid 134 for one category, active only", () => {
    expect(dayReasonParams("c1", "DAY_CLOSE")).toEqual({ icompany_id: "c1", icategory: "DAY_CLOSE", iinactive: "" });
  });

  it("keeps a reason's note rule", () => {
    expect(
      reasonChoices([
        { trs_id: "r1", trs_name: "Cashier gone", trs_needs_note: false, trs_category: "DAY_CLOSE" },
        { trs_id: "r2", trs_code: "OTHER", trs_name: "", trs_needs_note: "true", trs_category: "DAY_CLOSE" },
        { trs_name: "no id" },
      ]),
    ).toEqual([
      { id: "r1", name: "Cashier gone", needsNote: false },
      { id: "r2", name: "OTHER", needsNote: true },
    ]);
  });

  it("leaves the caller out and flags an approver with no PIN", () => {
    expect(
      approverChoices(
        [
          { userId: "ME", loginName: "VKPOS", fullName: "VK POS", hasPin: true },
          { userId: "u2", loginName: "ANITA", fullName: "Anita S", hasPin: true },
          { userId: "u3", loginName: "zt-approver", fullName: "", hasPin: false },
        ],
        "me",
      ),
    ).toEqual([
      { id: "u2", label: "Anita S" },
      { id: "u3", label: "zt-approver  (no till PIN set)" },
    ]);
  });
});

describe("close with exception", () => {
  const LINE = { tenderTypeId: 1, denominationId: "n500", qty: 2 };
  const reasons = [
    { id: "r1", name: "Cashier gone", needsNote: false },
    { id: "r2", name: "Other", needsNote: true },
  ];
  const pages: CountedPage[] = [
    { tssId: "s1", label: "C01-261014-01 · RAVI K", lines: [LINE] },
    { tssId: "s2", label: "C02-261014-01 · MEENA T", lines: [] },
  ];
  const draft: ExceptionDraft = { reasonId: "r1", note: "", approverId: "u2", pin: "1234" };

  it("pages the SESSIONS_LIVE sessions, named from the day's list", () => {
    const live = check({
      items: [
        { code: "SESSIONS_LIVE", tone: "RED", count: 2, detail: "", sessionIds: ["s1", "0123456789ab", "s1"] },
        { code: "CASH_TO_APPROVE", tone: "RED", count: 1, detail: "", sessionIds: ["s9"] },
      ],
    });
    expect(exceptionPages(live, [{ tss_id: "s1", tss_session_no: "C01-261014-01", cashier: "RAVI K" }])).toEqual([
      { tssId: "s1", label: "C01-261014-01 · RAVI K" },
      { tssId: "0123456789ab", label: "01234567" },
    ]);
    expect(exceptionPages(null, [])).toEqual([]);
  });

  it("says what stops the post, in Qt's order", () => {
    expect(exceptionProblem({ ...draft, reasonId: "" }, reasons, pages)).toBe("Pick the reason.");
    expect(exceptionProblem({ ...draft, reasonId: "r2" }, reasons, pages)).toBe("The reason asks for a note.");
    expect(exceptionProblem(draft, reasons, pages)).toBe("Count the drawer of C02-261014-01 · MEENA T.");
    const counted = pages.map((page) => ({ ...page, lines: [LINE] }));
    expect(exceptionProblem({ ...draft, approverId: "" }, reasons, counted)).toBe("Pick the approver.");
    expect(exceptionProblem({ ...draft, pin: "" }, reasons, counted)).toBe("The approver types their till PIN.");
    expect(exceptionProblem({ ...draft, reasonId: "r2", note: "  late " }, reasons, counted)).toBe("");
  });

  it("posts one count per session, the note only when there is one", () => {
    const counted = pages.map((page) => ({ ...page, lines: [LINE] }));
    expect(exceptionBody(KEY, draft, counted)).toEqual({
      ...KEY,
      exception: {
        reasonId: "r1",
        approverId: "u2",
        approverPin: "1234",
        counts: [
          { tssId: "s1", lines: [LINE] },
          { tssId: "s2", lines: [LINE] },
        ],
      },
    });
    expect(exceptionBody(KEY, { ...draft, note: " gone home " }, counted).notes).toBe("gone home");
  });

  it("words the intro, the counts and the result", () => {
    expect(exceptionIntro(1)).toMatch(/^1 session is still open\. Count each drawer here/);
    expect(exceptionIntro(2)).toMatch(/^2 sessions are still open\./);
    expect(
      countsDoneLine([
        { ...pages[0], paise: 125000 },
        { ...pages[1], paise: 0 },
      ]),
    ).toBe("C01-261014-01 · RAVI K  1,250.00   ·   C02-261014-01 · MEENA T  not counted");
    expect(exceptionClosedText("5", 2)).toBe("The day is closed — store Z 5; 2 sessions force-closed on your count.");
    expect(exceptionClosedText("", 1)).toBe("The day is closed; 1 session force-closed on your count.");
  });
});

describe("reopen day", () => {
  const reasons = [{ id: "r1", name: "Correction", needsNote: true }];

  it("names the day with its store Z", () => {
    expect(dayLabelOf(CLOSED)).toBe("14-10-2026 · Z 3");
    expect(dayLabelOf(DAY)).toBe("14-10-2026");
    expect(reopenIntro("14-10-2026 · Z 3")).toMatch(/^Business day 14-10-2026 · Z 3 opens again:/);
    expect(reopenedText("14-10-2026 · Z 3")).toBe("Business day 14-10-2026 · Z 3 is open again.");
  });

  it("asks for the reason, its note, then the PIN", () => {
    expect(reopenProblem({ reasonId: "", note: "", pin: "" }, reasons)).toBe("Pick the reason.");
    expect(reopenProblem({ reasonId: "r1", note: " ", pin: "1" }, reasons)).toBe("The reason asks for a note.");
    expect(reopenProblem({ reasonId: "r1", note: "late bill", pin: "" }, reasons)).toBe("Type your till PIN.");
    expect(reopenProblem({ reasonId: "r1", note: "late bill", pin: "1" }, reasons)).toBe("");
  });

  it("posts the key, the reason and the PIN", () => {
    expect(reopenBody(KEY, { reasonId: "r1", note: "", pin: "9999" })).toEqual({
      ...KEY,
      reasonId: "r1",
      approverPin: "9999",
    });
    expect(reopenBody(KEY, { reasonId: "r1", note: " late ", pin: "9999" }).notes).toBe("late");
  });
});
