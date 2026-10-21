import { Outlet } from 'react-router-dom';
import { useBootstrapSession } from '@core/auth/useBootstrapSession';
import FullPageSpinner from '@shared/components/FullPageSpinner';

/**
 * Sits above every route so the stored session is exchanged for a live one
 * before any guard decides where to send the user. Without this, a reload on
 * a deep link would bounce to /login and lose the destination.
 */
export default function SessionBootstrap() {
  const status = useBootstrapSession();

  if (status === 'loading') {
    return (
      <div style={{ height: '100vh' }}>
        <FullPageSpinner label="Starting Arise Admin…" />
      </div>
    );
  }

  return <Outlet />;
}
