import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@app/App';
import './styles/global.css';

async function boot() {
  // Compared against the raw env literal, not the IS_MOCK helper: Vite inlines
  // `import.meta.env.VITE_API_MODE` at build time, so in a live build this
  // becomes `if ("live" === "mock")` and the whole branch — the mock server,
  // faker and every seed file — is dropped from the bundle.
  if (import.meta.env.VITE_API_MODE === 'mock') {
    const { startMockServer } = await import('@mocks/browser');
    await startMockServer();
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();
