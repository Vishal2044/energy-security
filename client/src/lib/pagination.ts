import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currentApiSession, getData } from './api';
import { PAGE_SIZE, type Pagination } from '../../../shared/pagination';
export type Paginated<T> = T & { pagination?: Pagination };

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}
export function usePageQuery<T>(key: readonly unknown[], url: string, filters: Record<string, string | number | undefined> = {}, enabled = true) {
  const scope = JSON.stringify([key, url, filters, currentApiSession()]);
  const [state, setState] = useState({ scope, page: 1 });
  const page = state.scope === scope ? state.page : 1;
  const query = useQuery({
    queryKey: [...key, { scope, page }],
    queryFn: ({ signal }) => getData<Paginated<T>>(url, { ...filters, page, pageSize: PAGE_SIZE }, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: (previous, previousQuery) => {
      const previousScope = previousQuery?.queryKey[previousQuery.queryKey.length - 1] as { scope?: string } | undefined;
      return previousScope?.scope === scope ? previous : undefined;
    },
  });
  // Deletions can reduce the last page. Use the server's clamped page immediately.
  const currentPage = query.isPlaceholderData ? page : query.data?.pagination?.page ?? page;
  const pagination = query.data?.pagination;
  return { ...query, page: currentPage, pagination, startIndex: ((pagination?.page ?? page) - 1) * PAGE_SIZE, setPage: (next: number) => setState({ scope, page: Math.max(1, next) }), pagingBusy: query.isFetching && query.isPlaceholderData };
}
