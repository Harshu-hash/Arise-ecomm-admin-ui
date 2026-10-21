import { Select, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';

/**
 * Async searchable select over a server-side entity (sellers, categories,
 * brands, warehouses, …). Catalogs here run to thousands of rows, so options
 * are always fetched by search term rather than loaded up front.
 */
export default function EntitySelect({
  entity,
  value,
  onChange,
  multiple = false,
  placeholder,
  style,
  disabled,
  level,
  parentId,
  limit = 20,
}) {
  const [term, setTerm] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: qk.lookups.entity(entity, `${term}|${level ?? ''}|${parentId ?? ''}`),
    queryFn: () =>
      api
        .get(`/lookups/${entity}`, { q: term, limit, ...(level ? { level } : {}), ...(parentId ? { parentId } : {}) })
        .then((r) => r.data),
    staleTime: 60_000,
  });

  // Selected values may not be in the current search results, so resolve their
  // labels separately — otherwise an edit form shows raw IDs.
  const selectedIds = useMemo(
    () => (Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const { data: resolved } = useQuery({
    queryKey: qk.lookups.entity(entity, `ids:${selectedIds.join(',')}`),
    queryFn: () => api.get(`/lookups/${entity}`, { ids: selectedIds.join(',') }).then((r) => r.data),
    enabled: selectedIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const options = useMemo(() => {
    const map = new Map();
    for (const o of resolved ?? []) map.set(o.value, o);
    for (const o of data ?? []) map.set(o.value, o);
    return Array.from(map.values()).map((o) => ({
      value: o.value,
      label: o.label,
      sublabel: o.sublabel,
    }));
  }, [data, resolved]);

  return (
    <Select
      style={style}
      disabled={disabled}
      mode={multiple ? 'multiple' : undefined}
      maxTagCount="responsive"
      allowClear
      showSearch
      filterOption={false}
      placeholder={placeholder}
      value={multiple ? selectedIds : (value ?? undefined)}
      onSearch={setTerm}
      onChange={(v) => onChange(multiple ? (v?.length ? v : undefined) : (v ?? undefined))}
      notFoundContent={isFetching ? <Spin size="small" /> : 'No matches'}
      options={options}
      optionRender={(option) => (
        <div>
          <div>{option.data.label}</div>
          {option.data.sublabel && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {option.data.sublabel}
            </Typography.Text>
          )}
        </div>
      )}
    />
  );
}
