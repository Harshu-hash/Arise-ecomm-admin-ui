import { LockOutlined } from '@ant-design/icons';
import { Button, Result, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getPermission } from '@core/rbac/catalog';
import { useCurrentUser } from '@core/rbac/useCan';

/**
 * The 403 surface. It names the missing permission on purpose: an admin who
 * hits this needs to know what to ask their Super Admin for, and the keys are
 * not secret.
 */
export default function NoAccess({ required = [], title = 'You do not have access to this page' }) {
  const navigate = useNavigate();
  const user = useCurrentUser();

  return (
    <Result
      icon={<LockOutlined />}
      status="403"
      title={title}
      subTitle={
        <Space direction="vertical" size={10} style={{ maxWidth: 520 }}>
          <Typography.Text type="secondary">
            Your roles ({user?.roleNames?.join(', ') || 'none'}) do not include the permission this
            page needs.
          </Typography.Text>
          {required.length > 0 && (
            <Space size={[6, 6]} wrap>
              <Typography.Text type="secondary">Required:</Typography.Text>
              {required.map((key) => (
                <Tag key={key} className="mono">
                  {getPermission(key)
                    ? `${getPermission(key).moduleLabel} › ${getPermission(key).resourceLabel} › ${getPermission(key).actionLabel}`
                    : key}
                </Tag>
              ))}
            </Space>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button type="primary" onClick={() => navigate('/')}>
            Back to dashboard
          </Button>
          <Button onClick={() => navigate(-1)}>Go back</Button>
        </Space>
      }
    />
  );
}
