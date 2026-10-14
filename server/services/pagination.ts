import { paginationFor, type Pagination } from '../../shared/pagination.js';

/** Opt-in paging keeps existing dropdown/export consumers backward compatible. */
export function requestedPage(query: Record<string, unknown>, key = 'page'): number | undefined {
  const raw = query[key];
  if (raw === undefined) return undefined;
  if ((typeof raw !== 'string' && typeof raw !== 'number') || !/^[1-9]\d*$/.test(String(raw)) || !Number.isSafeInteger(Number(raw))) {
    throw new PaginationError('INVALID_PAGINATION');
  }
  if (query.pageSize !== undefined && String(query.pageSize) !== '20') throw new PaginationError('INVALID_PAGE_SIZE');
  return Number(raw);
}

type PageResult<T> = { records: T[]; pagination?: Pagination };
export class PaginationError extends Error {}
type PageModel = { find: (filter: any) => any; countDocuments: (filter: any) => PromiseLike<number> };
export async function mongoPage<T = any>(model: PageModel, filter: any, sort: Record<string, 1 | -1>, page?: number, legacyLimit?: number): Promise<PageResult<T>> {
  const query = model.find(filter).sort(sort);
  if (page === undefined) return { records: await (legacyLimit ? query.limit(legacyLimit) : query) };
  const pagination = paginationFor(await model.countDocuments(filter), page);
  return { records: await query.skip((pagination.page - 1) * pagination.pageSize).limit(pagination.pageSize), pagination };
}
export function memoryPage<T>(records: T[], page?: number, legacyLimit?: number): PageResult<T> {
  if (page === undefined) return { records: legacyLimit ? records.slice(0, legacyLimit) : records };
  const pagination = paginationFor(records.length, page);
  return { records: records.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize), pagination };
}
