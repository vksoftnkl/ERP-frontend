import type { Metadata } from "next";
import "./globals.css";
import "@/styles/library/index.scss";
import Providers from "@/store/provider";
import GlobalErpHeader from "@/components/layout/global-erp-header";

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
      <body>
        <Providers>
          <GlobalErpHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
