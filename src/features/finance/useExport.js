import { App } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { financeApi } from './api/finance.api';

/**
 * Queues an export of the list the user is looking at, filters included.
 *
 * Finance exports run to lakhs of rows in production, so they are jobs rather
 * than downloads — the message says where the file will turn up, because a
 * button that appears to do nothing is worse than no button.
 */
export default function useExport(dataset) {
  const { message } = App.useApp();

  const run = useMutation({
    mutationFn: (filters) => financeApi.exportDataset(dataset, filters),
    onSuccess: () => message.success('Export started. It will appear in the Export Center when ready.'),
    onError: (e) => message.error(e.message),
  });

  return (filters) => run.mutate(filters ?? null);
}
