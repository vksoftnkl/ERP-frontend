import type { Metadata } from "next";
import ThemeToggle from "@/components/ui/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Client | Operations Platform",
  description: "Landing page and login experience for ERP Client.",
};

const themeInitScript = `
(() => {
  try {
    const storageKey = "erp-client-theme";
    const stored = localStorage.getItem(storageKey);
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme =
      stored === "light" || stored === "dark"
        ? stored
        : systemDark
          ? "dark"
          : "light";

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
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
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
