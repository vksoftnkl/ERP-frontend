import type { Metadata } from "next";
import "./globals.css";
import "@/styles/library/index.scss";
import "react-toastify/dist/ReactToastify.css";
import Providers from "@/store/provider";
import { BusinessContextProvider } from "@/components/layout/business-context";
import GlobalErpHeader from "@/components/layout/global-erp-header";
import GlobalRouteGuard from "@/components/auth/global-route-guard";
import MenuAccessGuard from "@/components/auth/menu-access-guard";
import GlobalLoader from "@/components/feedback/global-loader";
import GlobalTextCapitalization from "@/components/feedback/global-text-capitalization";
import SessionAppSettings from "@/components/layout/session-app-settings";
import GlobalToasterWrapper from "@/components/feedback/global-toaster-wrapper";
import ErrorBoundary from "@/components/feedback/error-boundary";
import UiScaleController from "@/components/layout/ui-scale-controller";
import { uiScaleBootstrapScript } from "@/lib/ui-scale";
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sizes the whole interface to the screen before anything is
            painted. Must stay first in <head> and must stay blocking:
            deferring it would show one frame of unscaled UI. */}
        <script dangerouslySetInnerHTML={{ __html: uiScaleBootstrapScript() }} />
        {enableFigmaCapture ? (
          <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async />
        ) : null}
      </head>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: removeExtensionInjectedNodesScript }} />
        <Providers>
          <UiScaleController />
          <GlobalLoader />
          {/* The settings this session resolved to, and the one that rewrites
              what is typed into every name field. Both sit above the routes:
              the mode must be the same in the first field touched after a
              sign-in as in the last. */}
          <SessionAppSettings />
          <GlobalTextCapitalization />
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
                  <div className="erp-app-content">
                    {/* Menu permissions gate the route itself: a screen the
                        user's menu does not carry is refused here rather than
                        rendered and then argued with by the API. */}
                    <MenuAccessGuard>{children}</MenuAccessGuard>
                  </div>
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
