"use client";

import dynamic from "next/dynamic";

const GlobalToaster = dynamic(() => import("./global-toaster"), {
  ssr: false,
});

export default function GlobalToasterWrapper() {
  return <GlobalToaster />;
}
