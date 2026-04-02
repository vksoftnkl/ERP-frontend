import type { Metadata } from "next";
import "./globals.css";
import "@/styles/library/index.scss";
import "react-toastify/dist/ReactToastify.css";
import Providers from "@/store/provider";
import { BusinessContextProvider } from "@/components/layout/business-context";
import GlobalErpHeader from "@/components/layout/global-erp-header";
import GlobalRouteGuard from "@/components/auth/global-route-guard";
import GlobalToaster from "@/components/feedback/global-toaster";
import GlobalTamilInputAssist from "@/components/feedback/global-tamil-input-assist";

export const metadata: Metadata = {
  title: "ERP Client | Operations Platform",
  description: "Landing page and login experience for ERP Client.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://mcp.figma.com/mcp/html-to-design/capture.js"
          async
        />
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
          <GlobalTamilInputAssist />
        </Providers>
      </body>
    </html>
  );
}
