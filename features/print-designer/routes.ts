/** Route constants shared by the list page, the designer and every entry point. */

export const PRINT_TEMPLATES_ROUTE = "/settings/print-templates";

export const printDesignerRoute = (templateId: string): string =>
  `/print-designer/${templateId}`;

export type NewTemplateParams = {
  docType?: string;
  paper?: string;
  mode?: string;
  name?: string;
};

export function newPrintDesignerRoute(params: NewTemplateParams = {}): string {
  const query = new URLSearchParams();
  if (params.docType) {
    query.set("docType", params.docType);
  }
  if (params.paper) {
    query.set("paper", params.paper);
  }
  if (params.mode) {
    query.set("mode", params.mode);
  }
  if (params.name) {
    query.set("name", params.name);
  }
  const suffix = query.toString();
  return suffix ? `/print-designer/new?${suffix}` : "/print-designer/new";
}
