import { describe, expect, it } from "vitest";
import { shareLinkUrl, type PrintShareLink } from "./share";

const link: PrintShareLink = {
  token: "k3J9xQ2mP7vT5wL8nR4sYb",
  path: "/print-share/k3J9xQ2mP7vT5wL8nR4sYb/bill-bil00016.pdf",
  url: null,
  expiresAt: "2026-11-27T05:30:00.000Z",
};

describe("shareLinkUrl", () => {
  it("prefers the server's own public URL", () => {
    expect(shareLinkUrl({ ...link, url: "https://cloud.example.com/api/v1/print-share/x/y.pdf" }, "https://lan:3011/api/v1", "https://lan:3001")).toBe(
      "https://cloud.example.com/api/v1/print-share/x/y.pdf",
    );
  });

  it("puts the path under an absolute API base", () => {
    expect(shareLinkUrl(link, "https://erp.example.com/api/v1/", "https://erp.example.com")).toBe(
      "https://erp.example.com/api/v1/print-share/k3J9xQ2mP7vT5wL8nR4sYb/bill-bil00016.pdf",
    );
  });

  it("resolves a relative API base against the page's origin", () => {
    expect(shareLinkUrl(link, "/api/v1", "https://erp.example.com")).toBe(
      "https://erp.example.com/api/v1/print-share/k3J9xQ2mP7vT5wL8nR4sYb/bill-bil00016.pdf",
    );
  });
});
