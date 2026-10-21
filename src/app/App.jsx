import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '@core/api/queryClient';
import { buildTheme } from './theme/antdTheme';
import { LIGHT, DARK } from './theme/tokens';
import { useThemeEffect } from './theme/themeStore';
import { router } from './router';

export default function App() {
  const mode = useThemeEffect();
  const tokens = mode === 'dark' ? DARK : LIGHT;

  return (
    <ConfigProvider
      locale={enUS}
      theme={buildTheme(mode)}
      // Indian grouping for every <Statistic>, so KPI tiles match MoneyText.
      form={{ validateMessages: { required: 'This field is required' } }}
    >
      <AntApp
        style={{ height: '100%' }}
        notification={{ placement: 'bottomRight', duration: 4 }}
        message={{ duration: 3, maxCount: 3 }}
      >
        <div style={{ '--arise-focus': tokens.colorPrimary, height: '100%' }}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
