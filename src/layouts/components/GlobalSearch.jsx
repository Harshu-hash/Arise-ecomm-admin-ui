import { SearchOutlined } from '@ant-design/icons';
import { Empty, Input, Modal, Spin, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@core/api/axiosInstance';
import { qk } from '@core/api/queryClient';
import useBreakpoint from '@shared/hooks/useBreakpoint';

/**
 * Command palette (Ctrl/⌘ K). It recognises typed identifiers — ORD-, SEL-,
 * AWB, a 10-digit phone, a GSTIN — and offers the direct jump first, because
 * pasting an ID from a ticket is the most common way anyone arrives here.
 */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { isMobile } = useBreakpoint();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: qk.globalSearch(term),
    queryFn: () => api.get('/search', { q: term }).then((r) => r.data),
    enabled: open && term.trim().length >= 2,
    staleTime: 20_000,
  });

  const flat = useMemo(() => {
    const out = [];
    if (data?.typed) {
      out.push({
        id: 'typed',
        label: `Open ${data.typed.label} ${term.toUpperCase()}`,
        sublabel: data.typed.link,
        link: data.typed.link,
        group: 'Direct match',
      });
    }
    for (const g of data?.groups ?? []) {
      for (const item of g.items) out.push({ ...item, group: g.label });
    }
    return out;
  }, [data, term]);

  useEffect(() => setCursor(0), [flat.length]);

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    setTerm('');
    navigate(item.link);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[cursor]);
    }
  };

  let lastGroup = null;

  return (
    <>
      <Input
        readOnly
        onClick={() => setOpen(true)}
        prefix={<SearchOutlined style={{ opacity: 0.45 }} />}
        suffix={
          !isMobile && (
            <Tag bordered={false} style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>
              Ctrl K
            </Tag>
          )
        }
        placeholder={isMobile ? 'Search' : 'Search orders, sellers, products…'}
        style={{ width: isMobile ? 140 : 340, cursor: 'pointer' }}
        aria-label="Open global search"
      />

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        destroyOnHidden
        width={620}
        styles={{ body: { padding: 0 } }}
        style={{ top: 72 }}
      >
        <Input
          autoFocus
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ opacity: 0.45 }} />}
          suffix={isFetching ? <Spin size="small" /> : null}
          placeholder="Search an order ID, seller, product, ticket — or a page"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          style={{ padding: '12px 16px' }}
        />
        <div style={{ borderTop: '1px solid var(--ant-color-border-secondary)', maxHeight: 420, overflowY: 'auto' }}>
          {term.trim().length < 2 ? (
            <div style={{ padding: 20 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Type at least two characters. Paste an ID like{' '}
                <Typography.Text code>ORD-84920</Typography.Text> or{' '}
                <Typography.Text code>SEL-0031</Typography.Text> to jump straight to it.
              </Typography.Text>
            </div>
          ) : flat.length === 0 && !isFetching ? (
            <Empty description="No matches" style={{ padding: 28 }} />
          ) : (
            flat.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={`${item.group}-${item.id}`}>
                  {header && (
                    <div style={{ padding: '8px 16px 2px' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {header}
                      </Typography.Text>
                    </div>
                  )}
                  {/* Keyboard navigation lives on the search input (arrows +
                      Enter) so focus never leaves the field while typing; this
                      row also answers Enter and Space directly for anyone who
                      tabs into it. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        go(item);
                      }
                    }}
                    style={{
                      padding: '7px 16px',
                      cursor: 'pointer',
                      background: i === cursor ? 'var(--ant-color-primary-bg)' : 'transparent',
                    }}
                  >
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {item.label}
                    </Typography.Text>
                    {item.sublabel && (
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {item.sublabel}
                        </Typography.Text>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </>
  );
}
