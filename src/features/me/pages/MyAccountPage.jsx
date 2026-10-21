import { App, Col, Flex, Row } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { qk, queryClient } from '@core/api/queryClient';
import { authApi } from '@core/auth/authApi';
import { useSessionStore } from '@core/auth/sessionStore';
import { useCurrentUser } from '@core/rbac/useCan';
import PageHeader from '@shared/components/PageHeader';
import BackupCodesModal from '../components/BackupCodesModal';
import { NotificationsCard, ProfileCard, SecurityCard } from '../components/ProfileCards';
import SessionsCard from '../components/SessionsCard';

export default function MyAccountPage() {
  const user = useCurrentUser();
  const patchUser = useSessionStore((s) => s.patchUser);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [newCodes, setNewCodes] = useState(null);

  const sessions = useQuery({
    queryKey: qk.mySessions,
    queryFn: () => authApi.mySessions(),
  });

  const revoke = useMutation({
    mutationFn: (id) => authApi.revokeMySession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.mySessions });
      message.success('That device has been signed out');
    },
    onError: (e) => message.error(e.message),
  });

  const prefs = useMutation({
    mutationFn: (payload) => authApi.updatePreferences(payload),
    onSuccess: (data) => {
      patchUser(data);
      message.success('Preferences saved');
    },
    onError: (e) => message.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: () => authApi.regenerateBackupCodes(),
    onSuccess: (data) => setNewCodes(data.codes),
    onError: (e) => message.error(e.message),
  });

  return (
    <Flex vertical gap={16}>
      <PageHeader
        title="My account"
        breadcrumbs={[{ label: 'My account' }]}
        subtitle="Your access, your devices and your security settings."
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <ProfileCard user={user} />
          <NotificationsCard
            user={user}
            saving={prefs.isPending}
            onChange={(patch) => prefs.mutate(patch)}
          />
        </Col>

        <Col xs={24} lg={14}>
          <SecurityCard
            user={user}
            regenerating={regenerate.isPending}
            onChangePassword={() => navigate('/change-password')}
            onRegenerateCodes={() => regenerate.mutate()}
          />
          <SessionsCard
            sessions={sessions.data}
            loading={sessions.isLoading}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending}
            revokingId={revoke.variables}
          />
        </Col>
      </Row>

      <BackupCodesModal codes={newCodes} onClose={() => setNewCodes(null)} />
    </Flex>
  );
}
