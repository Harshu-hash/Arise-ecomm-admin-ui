import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { seedAll } from './seed';
import { clearSnapshot, restoreIfPresent, saveSnapshot } from './persistence';

export const worker = setupWorker(...handlers);

/**
 * Boots the mock backend: restore the persisted database if there is one,
 * otherwise seed a fresh one, then start intercepting.
 */
export async function startMockServer() {
  const restored = await restoreIfPresent();
  if (!restored) {
    seedAll();
    await saveSnapshot();
  }

  await worker.start({
    onUnhandledRequest: (req, print) => {
      // Vite's own asset and HMR traffic must pass through silently.
      const url = new URL(req.url);
      if (!url.pathname.startsWith('/api/')) return;
      print.warning();
    },
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });

  return { restored };
}

/** Dev toolbar: wipe everything and rebuild from the seed. */
export async function resetMockData() {
  await clearSnapshot();
  seedAll();
  await saveSnapshot();
}
