import { useQuery } from '@tanstack/react-query';
import { marketingApi } from './api/marketing.api';

/** Live member count while a segment rule is being built, debounce-free since it's a cheap in-memory scan. */
export default function useSegmentPreview(rule, enabled) {
  return useQuery({
    queryKey: ['marketing', 'segmentPreview', rule],
    queryFn: () => marketingApi.previewSegment(rule),
    enabled,
    staleTime: 2000,
  });
}
