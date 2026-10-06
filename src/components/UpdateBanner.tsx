// src/components/UpdateBanner.tsx
// "A new version is ready" banner. The service worker caches the app for
// offline use, which also means a phone can keep running an old build long
// after a deploy (field tests were read against the wrong bundle more than
// once). Updates are installed in the background and wait; this banner asks
// before switching, so a reload never lands in the middle of an unsaved edit.
//
// Checks for a new version every 30 minutes and whenever the app comes back to
// the foreground. Tapping the build stamp in the StatusBar checks immediately
// (dispatches CHECK_UPDATE_EVENT).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

export const CHECK_UPDATE_EVENT = 'app:check-update';

const CHECK_EVERY_MS = 30 * 60 * 1000;

export default function UpdateBanner() {
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      regRef.current = registration;
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined);
      }, CHECK_EVERY_MS);
    },
    onRegisterError(error) {
      console.warn('Service worker registration failed:', error);
    },
  });

  // A new version found later should show the banner again even if an
  // earlier one was put off with "Later".
  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  // Coming back to the app (unlocking the phone, switching tabs) is when a
  // stale build matters most, so check then too.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        regRef.current?.update().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const flash = useCallback((text: string) => {
    setStatus(text);
    window.setTimeout(() => setStatus((s) => (s === text ? null : s)), 4000);
  }, []);

  // Manual check from the build stamp.
  useEffect(() => {
    const onCheck = async () => {
      const reg = regRef.current;
      if (!reg) {
        flash('Updates are not available in this window.');
        return;
      }
      if (!navigator.onLine) {
        flash('Offline — connect to check for updates.');
        return;
      }
      setStatus('Checking for updates…');
      try {
        await reg.update();
      } catch {
        flash('Could not reach the server to check for updates.');
        return;
      }
      if (reg.waiting) {
        setStatus(null);
        setDismissed(false);
      } else if (reg.installing) {
        flash('Downloading the new version…');
      } else {
        flash(`You are on the latest version (${__BUILD_ID__}).`);
      }
    };
    window.addEventListener(CHECK_UPDATE_EVENT, onCheck);
    return () => window.removeEventListener(CHECK_UPDATE_EVENT, onCheck);
  }, [flash]);

  const update = async () => {
    setUpdating(true);
    // Activates the waiting version and reloads the page into it.
    await updateServiceWorker(true);
  };

  if (needRefresh && !dismissed) {
    return (
      <div className="fixed top-0 inset-x-0 z-[70] safe-area-top bg-indigo-700 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <RefreshCw className={`w-4 h-4 shrink-0 ${updating ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0 text-sm leading-tight">
            <span className="font-semibold">A new version is ready.</span>{' '}
            <span className="opacity-80">Save any changes first; updating reloads the page.</span>
          </div>
          <button
            onClick={update}
            disabled={updating}
            className="px-3 py-1.5 bg-white text-indigo-700 rounded-md text-sm font-semibold hover:bg-indigo-50 disabled:opacity-70 whitespace-nowrap"
          >
            {updating ? 'Updating…' : 'Update now'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            disabled={updating}
            className="p-1 rounded hover:bg-indigo-600"
            aria-label="Later"
            title="Later"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (status) {
    return (
      <div className="fixed top-2 inset-x-0 z-[70] flex justify-center pointer-events-none safe-area-top">
        <div className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-full shadow-lg">{status}</div>
      </div>
    );
  }

  return null;
}
