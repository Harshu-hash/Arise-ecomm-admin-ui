import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '@core/api/errors';
import EntitySelect from '@shared/components/EntitySelect';
import { adsApi } from '../api/ads.api';

/** Create a campaign on a seller's behalf — only that seller's own live, in-stock products can be promoted. */
export default function CampaignFormModal({ open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [sellerId, setSellerId] = useState(null);

  const products = useQuery({
    queryKey: ['ads', 'sellerProducts', sellerId],
    queryFn: () => adsApi.sellerProducts(sellerId),
    enabled: Boolean(sellerId),
  });

  const create = useMutation({
    mutationFn: (payload) => adsApi.createCampaign(payload),
    onSuccess: () => { message.success('Campaign created as a draft'); onSaved(); },
    onError: (e) => {
      if (e instanceof ApiError && e.fieldErrors) {
        form.setFields(Object.entries(e.fieldErrors).map(([name, errors]) => ({ name, errors: [errors] })));
        return;
      }
      message.error(e.message);
    },
  });

  const submit = async () => {
    const v = await form.validateFields();
    create.mutate({
      sellerId,
      name: v.name,
      dailyBudgetPaise: Math.round(v.dailyBudgetRupees * 100),
      totalBudgetPaise: Math.round(v.totalBudgetRupees * 100),
      biddingType: v.biddingType,
      defaultBidPaise: v.biddingType === 'MANUAL_CPC' ? Math.round((v.defaultBidRupees ?? 1) * 100) : undefined,
      productIds: v.productIds,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title="New ad campaign"
      okText="Create draft"
      okButtonProps={{ loading: create.isPending }}
      destroyOnHidden
      afterOpenChange={(opened) => {
        if (opened) { form.resetFields(); setSellerId(null); }
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ biddingType: 'AUTOMATIC' }}>
        <Form.Item label="Advertiser (seller)" required>
          <EntitySelect entity="seller" value={sellerId} onChange={(v) => { setSellerId(v); form.setFieldValue('productIds', undefined); }} placeholder="Search sellers" />
        </Form.Item>

        <Form.Item name="name" label="Campaign name" rules={[{ required: true, message: 'Required.' }]}>
          <Input placeholder="Diwali Sponsored Products" />
        </Form.Item>

        <Form.Item
          name="productIds"
          label="Products to promote"
          rules={[{ required: true, message: 'Choose at least one product.' }]}
          extra={sellerId ? undefined : 'Choose an advertiser first.'}
        >
          <Select
            mode="multiple"
            disabled={!sellerId}
            loading={products.isLoading}
            options={products.data?.data ?? []}
            placeholder="This seller's own live, in-stock products"
          />
        </Form.Item>

        <Form.Item name="biddingType" label="Targeting">
          <Select options={[{ value: 'AUTOMATIC', label: 'Automatic targeting' }, { value: 'MANUAL_CPC', label: 'Manual keywords, CPC bidding' }]} />
        </Form.Item>

        <Form.Item name="dailyBudgetRupees" label="Daily budget (₹)" rules={[{ required: true, message: 'Required.' }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="totalBudgetRupees" label="Total budget (₹)" rules={[{ required: true, message: 'Required.' }]} extra="Must be at least the daily budget.">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
