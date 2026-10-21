import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Badge, Button, Card, Flex, Segmented, Space, Table, Tabs, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useThemeStore } from '@app/theme/themeStore';
import { Can } from '@core/rbac/Can';
import useBreakpoint from '@shared/hooks/useBreakpoint';
import { glossify } from '@shared/utils/glossify';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import BulkActionBar from './BulkActionBar';
import ColumnChooser from './ColumnChooser';
import MobileCardList from './MobileCardList';
import { clearPrefs, loadPrefs, resolveColumns, savePrefs } from './columnPrefs';
import { estimateColumnWidth, formatNumber, sortOrderFor, sorterToSort, tabsFromFacets } from './helpers';

/**
 * The list primitive every module builds on.
 *
 * Everything that defines the result set — page, sort, filters, tab — lives in
 * the URL via `tableState`; this component never filters or sorts locally,
 * which keeps it honest about what the server has to support.
 */
export default function DataTable({
  tableId,
  columns,
  rows = [],
  meta,
  loading,
  error,
  onRetry,
  tableState,
  rowKey = 'id',
  onRowClick,
  tabs,
  facetField = 'status',
  selection,
  bulkActions = [],
  toolbarLeft,
  toolbarRight,
  onExport,
  exportPerm,
  emptyProps,
  mobileCard,
  virtual = false,
  scrollX,
}) {
  const { isMobile, columnPriorityCutoff } = useBreakpoint();
  const density = useThemeStore((s) => s.density);
  const setDensity = useThemeStore((s) => s.setDensity);

  const [prefs, setPrefs] = useState(() => loadPrefs(tableId));
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);

  useEffect(() => {
    // Clearing the selection when the result set changes avoids acting on rows
    // the user can no longer see.
    setSelectedKeys([]);
    setAllMatchingSelected(false);
  }, [tableState?.queryParams]);

  const updatePrefs = (next) => {
    setPrefs(next);
    savePrefs(tableId, next);
  };

  const visibleColumns = useMemo(
    () => resolveColumns({ columns, prefs, priorityCutoff: columnPriorityCutoff }),
    [columns, prefs, columnPriorityCutoff],
  );

  const antColumns = useMemo(
    () =>
      visibleColumns.map((c) => ({
        ...c,
        // Width is estimated from the original plain-string title; the
        // abbreviation tooltip is layered on after, for display only.
        width: estimateColumnWidth(c),
        title: glossify(c.title),
        sortOrder: c.sorter ? sortOrderFor(tableState?.sort, c.key ?? c.dataIndex) : undefined,
        sorter: c.sorter ? true : undefined,
        showSorterTooltip: false,
      })),
    [visibleColumns, tableState?.sort],
  );

  const tabItems = useMemo(
    () => (tabs ? tabsFromFacets({ tabs, facets: meta?.facets, facetField }) : null),
    [tabs, meta?.facets, facetField],
  );

  const total = meta?.total ?? rows.length;

  if (error) {
    return (
      <Card variant="borderless">
        <ErrorState error={error} onRetry={onRetry} title="Could not load this list" />
      </Card>
    );
  }

  const emptyNode = (
    <EmptyState
      variant={tableState?.hasFilters ? 'filtered' : 'empty'}
      onClearFilters={tableState?.clearFilters}
      {...emptyProps}
    />
  );

  const rowSelection = selection
    ? {
        selectedRowKeys: selectedKeys,
        preserveSelectedRowKeys: false,
        onChange: (keys) => {
          setSelectedKeys(keys);
          setAllMatchingSelected(false);
        },
        getCheckboxProps: selection.getCheckboxProps,
      }
    : undefined;

  return (
    <div>
      {tabItems && (
        <Tabs
          activeKey={tableState?.tab ?? 'all'}
          onChange={(key) => tableState?.setTab(key === 'all' ? null : key)}
          items={tabItems.map((t) => ({
            key: t.key,
            label: (
              <Space size={6}>
                {t.label}
                <Badge
                  count={t.count ?? 0}
                  showZero
                  overflowCount={99999}
                  color={t.key === (tableState?.tab ?? 'all') ? undefined : 'var(--ant-color-fill-quaternary)'}
                  style={{
                    color: t.key === (tableState?.tab ?? 'all') ? undefined : 'var(--ant-color-text-secondary)',
                    boxShadow: 'none',
                  }}
                />
              </Space>
            ),
          }))}
          style={{ marginBottom: 4 }}
        />
      )}

      <Flex justify="space-between" align="center" gap={8} wrap style={{ marginBottom: 10 }}>
        <Space size={8} wrap>
          {toolbarLeft}
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {loading ? 'Loading…' : `${formatNumber(total)} ${total === 1 ? 'record' : 'records'}`}
          </Typography.Text>
        </Space>

        <Space size={8} wrap>
          {toolbarRight}
          {!isMobile && (
            <Segmented
              size="small"
              value={density}
              onChange={setDensity}
              options={[
                { label: 'Compact', value: 'small' },
                { label: 'Default', value: 'middle' },
                { label: 'Roomy', value: 'large' },
              ]}
            />
          )}
          {onRetry && (
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={onRetry} aria-label="Refresh list" />
            </Tooltip>
          )}
          {onExport && (
            <Can perm={exportPerm} disable reason="You do not have permission to export this data">
              <Tooltip title="Export these results">
                <Button icon={<DownloadOutlined />} onClick={onExport} aria-label="Export results">
                  {isMobile ? null : 'Export'}
                </Button>
              </Tooltip>
            </Can>
          )}
          {!isMobile && (
            <ColumnChooser
              columns={columns}
              prefs={prefs}
              onChange={updatePrefs}
              onReset={() => {
                clearPrefs(tableId);
                setPrefs(null);
              }}
            />
          )}
        </Space>
      </Flex>

      {selection && (
        <BulkActionBar
          selectedCount={allMatchingSelected ? total : selectedKeys.length}
          totalMatching={total}
          allMatchingSelected={allMatchingSelected}
          onSelectAllMatching={() => setAllMatchingSelected(true)}
          onClear={() => {
            setSelectedKeys([]);
            setAllMatchingSelected(false);
          }}
          actions={bulkActions.map((a) => ({
            ...a,
            onClick: (ctx) =>
              a.onClick({
                ...ctx,
                selectedKeys,
                selectedRows: rows.filter((r) => selectedKeys.includes(r[rowKey])),
                total,
              }),
          }))}
        />
      )}

      {isMobile && mobileCard ? (
        <MobileCardList
          rows={rows}
          rowKey={rowKey}
          loading={loading}
          render={mobileCard}
          onRowClick={onRowClick}
          empty={emptyNode}
          page={tableState?.page}
          pageSize={tableState?.pageSize}
          total={total}
          onPageChange={tableState?.setPage}
        />
      ) : (
        <Table
          size={density}
          columns={antColumns}
          dataSource={rows}
          rowKey={rowKey}
          loading={loading}
          rowSelection={rowSelection}
          virtual={virtual}
          scroll={{ x: scrollX ?? 'max-content', ...(virtual ? { y: 560 } : {}) }}
          sticky
          locale={{ emptyText: loading ? ' ' : emptyNode }}
          onRow={
            onRowClick
              ? (record) => ({
                  onClick: () => onRowClick(record),
                  style: { cursor: 'pointer' },
                })
              : undefined
          }
          onChange={(pagination, _filters, sorter) => {
            const nextSort = sorterToSort(sorter, tableState?.sort);
            if (nextSort !== tableState?.sort) tableState?.setSort(nextSort);
          }}
          pagination={{
            current: tableState?.page ?? 1,
            pageSize: tableState?.pageSize ?? 25,
            total,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100, 200],
            showTotal: (t, range) => `${range[0]}–${range[1]} of ${formatNumber(t)}`,
            onChange: (page, pageSize) => tableState?.setPage(page, pageSize),
            size: 'default',
          }}
        />
      )}
    </div>
  );
}
