"use client";

export default function RouteLoader() {
  return (
    <main className="erp-route-loader" role="status" aria-label="Loading">
      <div className="erp-route-loader__spinner" aria-hidden="true" />
      <span className="erp-route-loader__label">Loading</span>
    </main>
  );
}
