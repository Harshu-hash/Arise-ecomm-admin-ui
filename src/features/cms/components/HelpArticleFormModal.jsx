import { App, Form, Input, Modal } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { cmsApi } from '../api/cms.api';

export default function HelpArticleFormModal({ category, article, open, onClose, onSaved }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (article) form.setFieldsValue({ question: article.question, answer: article.answer });
  }, [open, article, form]);

  const create = useMutation({
    mutationFn: (payload) => cmsApi.createHelpArticle(payload),
    onSuccess: () => { message.success('Article added'); onSaved(); },
    onError: (e) => message.error(e.message),
  });
  const update = useMutation({
    mutationFn: (payload) => cmsApi.updateHelpArticle(article.id, payload),
    onSuccess: () => { message.success('Saved'); onSaved(); },
    onError: (e) => message.error(e.message),
  });

  const submit = async () => {
    const v = await form.validateFields();
    if (article) update.mutate(v);
    else create.mutate({ ...v, categoryId: category.id });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      title={article ? 'Edit article' : `New article in ${category?.title}`}
      okText="Save"
      okButtonProps={{ loading: create.isPending || update.isPending }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="Question" rules={[{ required: true, message: 'Required.' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="answer" label="Answer" rules={[{ required: true, message: 'Required.' }]}>
          <Input.TextArea rows={5} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
