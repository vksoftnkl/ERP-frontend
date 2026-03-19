export type ListMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export type ApiSuccessResponse<TData, TMeta = Record<string, unknown>> = {
  success: true;
  message: string;
  data: TData;
  meta?: TMeta;
};
