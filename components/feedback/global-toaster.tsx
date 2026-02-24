"use client";

import { ToastContainer } from "react-toastify";

export default function GlobalToaster() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      closeOnClick
      pauseOnHover
      pauseOnFocusLoss
      draggable
      newestOnTop
      theme="colored"
    />
  );
}
