import { LockOutlined, WarningFilled } from '@ant-design/icons';
import { Checkbox, Flex, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useMemo, useState } from 'react';
import {
  PERMISSION_MODULES,
  dependentsOf,
  expandImplied,
  getPermission,
  moduleActionColumns,
} from '@core/rbac/catalog';

/**
 * The permission matrix: rows are resources grouped by module, columns are
 * actions.
 *
 * Two behaviours keep roles coherent:
 *  - ticking anything implies `view` on the same resource (an "edit" without
 *    "view" is a role that cannot open the page it can change);
 *  - unticking `view` also unticks everything that depended on it, instead of
 *    leaving dead permissions behind.
 */
export default function PermissionMatrix({ value = [], onChange, disabled, compareWith }) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const compare = useMemo(() => (compareWith ? new Set(compareWith) : null), [compareWith]);

  const toggle = (key, checked) => {
    const next = new Set(selected);
    if (checked) {
      for (const k of expandImplied([...next, key])) next.add(k);
    } else {
      next.delete(key);
      for (const dep of dependentsOf(key)) next.delete(dep);
    }
    onChange(Array.from(next));
  };

  const toggleResource = (moduleKey, resourceKey, checked) => {
    const keys = Object.values(ALL_BY_RESOURCE(moduleKey, resourceKey));
    const next = new Set(selected);
    if (checked) for (const k of expandImplied(keys)) next.add(k);
    else for (const k of keys) next.delete(k);
    onChange(Array.from(next));
  };

  const toggleModule = (moduleKey, checked) => {
    const mod = PERMISSION_MODULES.find((m) => m.key === moduleKey);
    const keys = mod.resources.flatMap((r) => r.actions.map((a) => `${moduleKey}.${r.key}.${a.action}`));
    const next = new Set(selected);
    if (checked) for (const k of expandImplied(keys)) next.add(k);
    else for (const k of keys) next.delete(k);
    onChange(Array.from(next));
  };

  const modules = useMemo(() => {
    const term = search.trim().toLowerCase();
    return PERMISSION_MODULES.map((mod) => {
      const resources = mod.resources.filter((res) => {
        if (!term) return true;
        return (
          mod.label.toLowerCase().includes(term) ||
          res.label.toLowerCase().includes(term) ||
          res.actions.some((a) => `${mod.key}.${res.key}.${a.action}`.includes(term) || a.label.toLowerCase().includes(term))
        );
      });
      return { ...mod, resources };
    }).filter((m) => m.resources.length);
  }, [search]);

  return (
    <Flex vertical gap={12}>
      <Input.Search
        allowClear
        placeholder="Search a module, resource or permission key"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 420 }}
      />

      {modules.map((mod) => {
        const actions = moduleActionColumns(mod.key);
        const allKeys = mod.resources.flatMap((r) => r.actions.map((a) => `${mod.key}.${r.key}.${a.action}`));
        const heldCount = allKeys.filter((k) => selected.has(k)).length;

        return (
          <div key={mod.key}>
            <Flex align="center" justify="space-between" style={{ marginBottom: 6 }}>
              <Space size={8}>
                <Checkbox
                  disabled={disabled}
                  checked={heldCount === allKeys.length}
                  indeterminate={heldCount > 0 && heldCount < allKeys.length}
                  onChange={(e) => toggleModule(mod.key, e.target.checked)}
                >
                  <Typography.Text strong>{mod.label}</Typography.Text>
                </Checkbox>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {heldCount}/{allKeys.length}
                </Typography.Text>
              </Space>
            </Flex>

            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={mod.resources.map((r) => ({ key: r.key, ...r }))}
              scroll={{ x: 'max-content' }}
              columns={[
                {
                  title: 'Resource',
                  dataIndex: 'label',
                  width: 240,
                  fixed: 'left',
                  render: (label, res) => {
                    const keys = res.actions.map((a) => `${mod.key}.${res.key}.${a.action}`);
                    const held = keys.filter((k) => selected.has(k)).length;
                    return (
                      <Checkbox
                        disabled={disabled}
                        checked={held === keys.length}
                        indeterminate={held > 0 && held < keys.length}
                        onChange={(e) => toggleResource(mod.key, res.key, e.target.checked)}
                      >
                        <Typography.Text style={{ fontSize: 13 }}>{label}</Typography.Text>
                      </Checkbox>
                    );
                  },
                },
                ...actions.map((action) => ({
                  title: (
                    <Typography.Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{action.label}</Typography.Text>
                  ),
                  key: action.action,
                  align: 'center',
                  width: 108,
                  render: (_v, res) => {
                    const actionDef = res.actions.find((a) => a.action === action.action);
                    if (!actionDef) return <Typography.Text type="secondary">—</Typography.Text>;

                    const key = `${mod.key}.${res.key}.${actionDef.action}`;
                    const perm = getPermission(key);
                    const checked = selected.has(key);
                    const differs = compare && compare.has(key) !== checked;

                    return (
                      <Tooltip
                        title={
                          <Space direction="vertical" size={0}>
                            <span className="mono">{key}</span>
                            {perm?.sensitive && <span>Sensitive action</span>}
                            {perm?.mc && <span>Goes through maker-checker</span>}
                            {differs && <span>Differs from the compared role</span>}
                          </Space>
                        }
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: differs ? '1px 5px' : 0,
                            borderRadius: 4,
                            background: differs ? 'var(--ant-color-warning-bg)' : undefined,
                          }}
                        >
                          <Checkbox
                            disabled={disabled}
                            checked={checked}
                            onChange={(e) => toggle(key, e.target.checked)}
                            aria-label={key}
                          />
                          {perm?.sensitive && (
                            <WarningFilled style={{ fontSize: 9, color: 'var(--ant-color-warning)' }} />
                          )}
                          {perm?.mc && <LockOutlined style={{ fontSize: 9, opacity: 0.5 }} />}
                        </span>
                      </Tooltip>
                    );
                  },
                })),
              ]}
            />
          </div>
        );
      })}

      <Space size={12} wrap>
        <Tag bordered={false} icon={<WarningFilled style={{ color: 'var(--ant-color-warning)' }} />}>
          Sensitive
        </Tag>
        <Tag bordered={false} icon={<LockOutlined />}>
          Needs a second approver
        </Tag>
      </Space>
    </Flex>
  );
}

function ALL_BY_RESOURCE(moduleKey, resourceKey) {
  const mod = PERMISSION_MODULES.find((m) => m.key === moduleKey);
  const res = mod?.resources.find((r) => r.key === resourceKey);
  return (res?.actions ?? []).map((a) => `${moduleKey}.${resourceKey}.${a.action}`);
}
