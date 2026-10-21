import { CloudUploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { App, Alert, Button, Flex, Select, Steps, Table, Tag, Typography, Upload } from 'antd';
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

/**
 * Generic bulk-import flow (plan §10): download a template → upload a file
 * → map columns → preview row-level validation → commit.
 *
 * Deliberately not here: category-driven templates for creating new
 * products, and a reachability check on image URLs — see the plan's Phase 8
 * decisions for why. Everything else runs for real: the template is a real
 * CSV, the upload is parsed client-side with the same library that builds
 * it, and every row is validated before anything reaches the server.
 */
export default function ImportWizard({ jobType, columns, sampleRows, validateRow, onCommit, committing }) {
  const { message } = App.useApp();
  const [step, setStep] = useState(0);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [rawRows, setRawRows] = useState([]);
  const [importValidOnly, setImportValidOnly] = useState(true);

  const required = columns.filter((c) => c.required);

  function downloadTemplate() {
    const sheet = XLSX.utils.json_to_sheet(sampleRows ?? [Object.fromEntries(columns.map((c) => [c.key, '']))]);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobType.toLowerCase()}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!rows.length) {
      message.error('That file has no data rows.');
      return false;
    }
    const detected = Object.keys(rows[0]);
    setHeaders(detected);
    // Best-effort auto-map: an exact (case-insensitive) header match.
    const auto = Object.fromEntries(
      columns.map((c) => [c.key, detected.find((h) => h.trim().toLowerCase() === c.key.toLowerCase()) ?? null]),
    );
    setMapping(auto);
    setRawRows(rows);
    setStep(1);
    return false;
  }

  const mappedRows = useMemo(
    () => rawRows.map((r) => Object.fromEntries(columns.map((c) => [c.key, mapping[c.key] ? r[mapping[c.key]] : undefined]))),
    [rawRows, mapping, columns],
  );

  const validated = useMemo(
    () => mappedRows.map((row, i) => ({ ...row, _row: i + 2, _errors: validateRow(row) })),
    [mappedRows, validateRow],
  );
  const validRows = validated.filter((r) => !r._errors.length);
  const invalidRows = validated.filter((r) => r._errors.length);
  const mappingComplete = required.every((c) => mapping[c.key]);

  function downloadErrorReport() {
    const sheet = XLSX.utils.json_to_sheet(invalidRows.map((r) => ({ row: r._row, errors: r._errors.join('; '), ...r })));
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jobType.toLowerCase()}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Flex vertical gap={16}>
      <Steps
        size="small"
        current={step}
        items={[{ title: 'Template & upload' }, { title: 'Map columns' }, { title: 'Validate & commit' }]}
      />

      {step === 0 && (
        <Flex vertical gap={12} align="flex-start">
          <Typography.Text type="secondary">
            Download the template, fill it in, then upload it below. Columns marked * are required.
          </Typography.Text>
          <Table
            size="small" pagination={false} rowKey="key"
            dataSource={columns}
            columns={[
              { key: 'key', title: 'Column', dataIndex: 'key' },
              { key: 'required', title: '', dataIndex: 'required', render: (v) => (v ? <Tag color="red" style={{ marginInlineEnd: 0 }}>required</Tag> : null) },
            ]}
            style={{ width: '100%', maxWidth: 420 }}
          />
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Download template (.csv)</Button>
          <Upload.Dragger accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={handleUpload} style={{ width: '100%', maxWidth: 420 }}>
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p>Click or drag your filled-in file here</p>
          </Upload.Dragger>
        </Flex>
      )}

      {step === 1 && (
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">{rawRows.length} row(s) detected. Match each required column to a column in your file.</Typography.Text>
          <Table
            size="small" pagination={false} rowKey="key"
            dataSource={columns}
            columns={[
              { key: 'key', title: 'Required column', dataIndex: 'key', render: (v, row) => <span>{v}{row.required && ' *'}</span> },
              {
                key: 'map', title: 'Your file\'s column', render: (_v, row) => (
                  <Select
                    style={{ width: 220 }} allowClear placeholder="Not mapped"
                    value={mapping[row.key] ?? undefined}
                    options={headers.map((h) => ({ value: h, label: h }))}
                    onChange={(v) => setMapping((prev) => ({ ...prev, [row.key]: v ?? null }))}
                  />
                ),
              },
            ]}
          />
          <Flex gap={8}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button type="primary" disabled={!mappingComplete} onClick={() => setStep(2)}>Next: validate</Button>
          </Flex>
        </Flex>
      )}

      {step === 2 && (
        <Flex vertical gap={12}>
          <Flex gap={16}>
            <Alert type={invalidRows.length ? 'warning' : 'success'} showIcon message={`${validRows.length} valid, ${invalidRows.length} with errors`} style={{ flex: 1 }} />
          </Flex>
          <Table
            size="small" pagination={{ pageSize: 10, size: 'small' }} rowKey="_row"
            dataSource={validated}
            columns={[
              { key: '_row', title: 'Row', dataIndex: '_row', width: 60 },
              ...columns.map((c) => ({ key: c.key, title: c.key, dataIndex: c.key })),
              {
                key: '_errors', title: 'Status', dataIndex: '_errors',
                render: (errs) => (errs.length ? <Typography.Text type="danger" style={{ fontSize: 12 }}>{errs.join('; ')}</Typography.Text> : <Tag color="green" style={{ marginInlineEnd: 0 }}>OK</Tag>),
              },
            ]}
          />
          {invalidRows.length > 0 && (
            <Flex align="center" gap={8}>
              <input type="checkbox" id="validOnly" checked={importValidOnly} onChange={(e) => setImportValidOnly(e.target.checked)} />
              <label htmlFor="validOnly"><Typography.Text style={{ fontSize: 13 }}>Import valid rows only (skip the {invalidRows.length} row(s) with errors)</Typography.Text></label>
              <Button size="small" onClick={downloadErrorReport}>Download error report</Button>
            </Flex>
          )}
          <Flex gap={8}>
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button
              type="primary" loading={committing}
              disabled={invalidRows.length > 0 && !importValidOnly}
              onClick={() => onCommit(importValidOnly ? validRows : validated, importValidOnly)}
            >
              Commit import
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
