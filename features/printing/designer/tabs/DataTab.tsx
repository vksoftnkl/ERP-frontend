"use client";

/**
 * DATA tab -- where the rows come from, what the operator is asked, and what the
 * render already knows.
 *
 * Three sections, all of which send something:
 *
 *   Datasets   versions[0].datasets[]
 *   Query      the selected row's ptdSql
 *   Prompts    versions[0].ptvParams
 *
 * There used to be a fourth -- a read-only note listing the six CONTEXT
 * parameters, whose whole job was to stop an author declaring one as a prompt.
 * The refusal it was warning about is gone: `ptv_params` is now the whole
 * declaration, context or not, so the note had nothing left to protect and the
 * names it listed are documented on the Prompts grid where they are typed.
 */

import { useState } from "react";

import DatasetGrid from "../components/DatasetGrid";
import PromptsGrid from "../components/PromptsGrid";
import SqlEditor from "../components/SqlEditor";
import type { DesignerController } from "../useDesigner";

export default function DataTab({ designer }: { designer: DesignerController }) {
  const { draft, editable, patchWorking, setDatasets, workingStored } = designer;
  const [selected, setSelected] = useState<number | null>(null);

  /*
   * The dataset numbers that are already frozen: those on the PUBLISHED
   * revision. `ptdDatasetNo` is the binding a band points at, so once a number
   * has shipped it cannot be reused for something else -- the honest move is a
   * new draft, which is what the grid's tooltip says.
   */
  const publishedNumbers = new Set<number>(
    draft.history
      .filter((version) => version.ptvId === draft.publishedRevId)
      .flatMap((version) => (version.datasets ?? []).map((dataset) => dataset.ptdDatasetNo)),
  );

  const row = selected !== null ? draft.working.datasets[selected] : undefined;

  /*
   * `ptdSqlNorm` is what every guard actually reads, and it only exists once the
   * server has stored the row. Matching by ptdId rather than by index: the grid
   * can be reordered, and the index would then point at another row's residue.
   */
  const storedNorm =
    row?.ptdId !== undefined
      ? ((workingStored?.datasets ?? []).find((dataset) => dataset.ptdId === row.ptdId)
          ?.ptdSqlNorm ?? null)
      : null;

  const revLabel = workingStored ? `rev ${workingStored.ptvRevNo}` : "this draft";

  return (
    <>
      <DatasetGrid
        datasets={draft.working.datasets}
        readOnly={!editable}
        publishedNumbers={publishedNumbers}
        selectedIndex={selected}
        revLabel={revLabel}
        onSelect={setSelected}
        onChange={setDatasets}
      />

      {row && row.ptdSourceKind === "SQL" && selected !== null ? (
        <SqlEditor
          sql={row.ptdSql ?? ""}
          datasetNo={row.ptdDatasetNo}
          datasetName={row.ptdName}
          requiresCompany={row.ptdRequiresCompany ?? true}
          sqlNorm={storedNorm}
          readOnly={!editable}
          onChange={(next) =>
            setDatasets((current) =>
              current.map((entry, index) =>
                index === selected ? { ...entry, ptdSql: next } : entry,
              ),
            )
          }
          onRequiresCompanyChange={(next) =>
            setDatasets((current) =>
              current.map((entry, index) =>
                index === selected ? { ...entry, ptdRequiresCompany: next } : entry,
              ),
            )
          }
        />
      ) : null}

      <PromptsGrid
        params={draft.working.ptvParams}
        datasets={draft.working.datasets}
        readOnly={!editable}
        onChange={(next) => patchWorking({ ptvParams: next })}
      />
    </>
  );
}
