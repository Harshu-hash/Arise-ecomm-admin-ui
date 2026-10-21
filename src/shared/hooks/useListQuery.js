import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@core/api/axiosInstance';

/**
 * Standard list fetch for DataTable.
 *
 * `keepPreviousData` is what stops the table blanking out between pages — the
 * old rows stay visible, dimmed, while the next page loads.
 */
export default function useListQuery({ queryKey, url, params, enabled = true, staleTime = 15_000 }) {
  const query = useQuery({
    queryKey,
    queryFn: () => api.get(url, params),
    placeholderData: keepPreviousData,
    enabled,
    staleTime,
  });

  return {
    rows: query.data?.data ?? [],
    meta: query.data?.meta ?? null,
    loading: query.isLoading,
    fetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
