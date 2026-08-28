import { useState, useEffect, useCallback, useRef } from 'react';

export interface ServiceWorkerState {
  hasUpdate: boolean;
  updateServiceWorker: () => void;
  dismissUpdate: () => void;
}

export function useServiceWorker(): ServiceWorkerState {
  const [hasUpdate, setHasUpdate] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    // 1. O Service Worker NUNCA é registrado em ambiente de desenvolvimento
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) {
      return;
    }

    let isMounted = true;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        if (!isMounted) return;

        // Se já existir um Service Worker em espera (waiting)
        if (registration.waiting) {
          waitingWorkerRef.current = registration.waiting;
          setHasUpdate(true);
        }

        // Monitora novas versões detectadas durante a sessão
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // Nova versão instalada e pronta para assumir
                waitingWorkerRef.current = installingWorker;
                if (isMounted) {
                  setHasUpdate(true);
                }
              }
            }
          });
        });
      })
      .catch(() => {
        // Falhas silenciosas de registro (ex: ambientes restritos de iframe)
      });

    // Listener para controllerchange: garante apenas UM recarregamento seguro
    const handleControllerChange = () => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const updateServiceWorker = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setHasUpdate(false);
  }, []);

  return {
    hasUpdate,
    updateServiceWorker,
    dismissUpdate,
  };
}
