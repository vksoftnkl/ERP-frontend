import { Suspense } from "react";
import RecordHistoryPage from "@/features/masters/record-history/page";

export default function RecordHistoryRoute() {
  return (
    <Suspense fallback={null}>
      <RecordHistoryPage />
    </Suspense>
  );
}
