import { ReloadOutlined } from '@ant-design/icons';
import { App, Button, Modal, Typography } from 'antd';
import { useState } from 'react';
import { api } from '@core/api/axiosInstance';
import { IS_MOCK } from '@core/config/env';

/**
 * Recovery hatch on the sign-in screen.
 *
 * The dev toolbar lives inside the authenticated shell, so if the saved demo
 * data ever stops matching the seeded credentials there is otherwise no way
 * back in without opening browser DevTools. This is that way back.
 */
export default function ResetDemoDataLink() {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);

  if (!IS_MOCK) return null;

  const reset = async () => {
    setBusy(true);
    try {
      await api.post('/dev/reset', {});
      message.success('Demo data rebuilt. Reloading…');
      setTimeout(() => window.location.reload(), 500);
    } catch {
      // The mock server itself may be the thing that is broken, so fall back
      // to clearing storage directly rather than leaving the user stuck.
      try {
        indexedDB.deleteDatabase('arise-admin-mock');
        message.success('Saved demo data cleared. Reloading…');
        setTimeout(() => window.location.reload(), 500);
      } catch {
        message.error('Could not reset. Clear this site’s data in your browser and reload.');
        setBusy(false);
      }
    }
  };

  return (
    <Button
      type="link"
      size="small"
      icon={<ReloadOutlined />}
      loading={busy}
      style={{ padding: 0, height: 'auto', fontSize: 12 }}
      onClick={() =>
        Modal.confirm({
          title: 'Rebuild the demo data?',
          content: (
            <Typography.Text type="secondary">
              Every seeded record is recreated and anything you changed in this mock environment is
              discarded. Use this if the sign-in credentials stop working after an update.
            </Typography.Text>
          ),
          okText: 'Rebuild demo data',
          onOk: reset,
        })
      }
    >
      Sign-in not working? Rebuild the demo data
    </Button>
  );
}
