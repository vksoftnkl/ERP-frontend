"use client";

/** `/print-designer/[templateId]` — open an existing template. */

import { useParams } from "next/navigation";
import DesignerShell from "@/features/print-designer/components/DesignerShell";
import styles from "@/features/print-designer/components/designer.module.scss";

export default function PrintDesignerPage() {
  const params = useParams<{ templateId: string | string[] }>();
  const raw = params?.templateId;
  const templateId = Array.isArray(raw) ? raw[0] : raw;

  if (!templateId) {
    return (
      <div className={styles.page}>
        <div className={styles.centerState}>
          <h1>No template selected</h1>
          <p>Open a template from Settings → Print templates.</p>
        </div>
      </div>
    );
  }

  return <DesignerShell mode="EDIT" templateId={templateId} />;
}
