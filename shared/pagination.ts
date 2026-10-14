export const PAGE_SIZE = 20;
export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
export function paginationFor(total: number, requestedPage: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  return { page, pageSize: PAGE_SIZE, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}
