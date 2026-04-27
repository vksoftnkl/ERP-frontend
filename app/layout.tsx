import type { Metadata } from "next";
import "./globals.css";
import "@/styles/library/index.scss";
import "react-toastify/dist/ReactToastify.css";
import Providers from "@/store/provider";
import { BusinessContextProvider } from "@/components/layout/business-context";
import GlobalErpHeader from "@/components/layout/global-erp-header";
import GlobalRouteGuard from "@/components/auth/global-route-guard";
import GlobalToaster from "@/components/feedback/global-toaster";

export const metadata: Metadata = {
  title: "ERP Client | Operations Platform",
  description: "Landing page and login experience for ERP Client.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

const enableFigmaCapture =
  process.env.NEXT_PUBLIC_ENABLE_FIGMA_CAPTURE === "true";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {enableFigmaCapture ? (
          <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
        ) : null}
      </head>
      <body>
        <Providers>
          <GlobalRouteGuard>
            <BusinessContextProvider>
              <div className="erp-app-shell">
                <GlobalErpHeader />
                <div className="erp-app-content">{children}</div>
              </div>
            </BusinessContextProvider>
          </GlobalRouteGuard>
          <GlobalToaster />
        </Providers>
      </body>
    </html>
  );
}
