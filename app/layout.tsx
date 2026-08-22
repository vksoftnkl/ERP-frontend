import type { Metadata } from "next";
import "./globals.css";
import "@/styles/library/index.scss";
import "react-toastify/dist/ReactToastify.css";
import Providers from "@/store/provider";
import { BusinessContextProvider } from "@/components/layout/business-context";
import GlobalErpHeader from "@/components/layout/global-erp-header";
import GlobalRouteGuard from "@/components/auth/global-route-guard";
import GlobalLoader from "@/components/feedback/global-loader";
import GlobalUppercaseInput from "@/components/feedback/global-uppercase-input";
import GlobalToasterWrapper from "@/components/feedback/global-toaster-wrapper";
import ErrorBoundary from "@/components/feedback/error-boundary";
import RegionErrorBoundary from "@/components/feedback/region-error-boundary";
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

const removeExtensionInjectedNodesScript = `
(function () {
  var removeInjectedNodes = function () {
    document.getElementById("GOOGLE_INPUT_CHEXT_FLAG")?.remove();
  };
  removeInjectedNodes();
  if (typeof MutationObserver === "undefined" || !document.body) {
    return;
  }
  var observer = new MutationObserver(removeInjectedNodes);
  observer.observe(document.body, { childList: true });
  window.addEventListener("load", function () {
    removeInjectedNodes();
    observer.disconnect();
  }, { once: true });
})();
`;

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
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: removeExtensionInjectedNodesScript }} />
        <Providers>
          <GlobalLoader />
          <GlobalUppercaseInput />
          {/* Guards the shell itself. `app/error.tsx` only wraps the page below
              this layout, so without this a throw in the header or the
              business-context provider would escalate to global-error.tsx and
              blank the whole application. */}
          <ErrorBoundary>
            <GlobalRouteGuard>
              <BusinessContextProvider>
                <div className="erp-app-shell">
                  {/* Scoped separately: a broken header must not cost the user
                      the screen they are working in. The fallback lives inside
                      RegionErrorBoundary because this file is a Server
                      Component and cannot hand a function to a client one. */}
                  <RegionErrorBoundary title="The navigation bar failed to load">
                    <GlobalErpHeader />
                  </RegionErrorBoundary>
                  <div className="erp-app-content">{children}</div>
                </div>
              </BusinessContextProvider>
            </GlobalRouteGuard>
          </ErrorBoundary>
          <GlobalToasterWrapper />
        </Providers>
      </body>
    </html>
  );
}
