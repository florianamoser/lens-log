import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      const announceWaitingUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(new CustomEvent('lens-log-update-available', { detail: registration.waiting }));
        }
      };
      const watchInstallingWorker = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') announceWaitingUpdate();
        });
      };
      registration.addEventListener('updatefound', watchInstallingWorker);
      announceWaitingUpdate();

      const checkForUpdate = async () => {
        try {
          await registration.update();
          announceWaitingUpdate();
        } catch (error) {
          console.warn('[update] service-worker check failed:', error);
        }
      };
      void checkForUpdate();
      window.addEventListener('focus', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
      });
    } catch (error) {
      console.error('[update] service-worker registration failed:', error);
    }
  });
}
