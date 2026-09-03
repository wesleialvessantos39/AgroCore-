import { useEffect, useState } from 'react';
import {
  readFieldConnectivity,
  type FieldConnectivityState,
} from './fieldDevice';

function readCurrentState(): FieldConnectivityState {
  if (typeof navigator === 'undefined') return 'unknown';
  return readFieldConnectivity(navigator);
}

export function useFieldConnectivity(): FieldConnectivityState {
  const [state, setState] = useState<FieldConnectivityState>(readCurrentState);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => setState(readCurrentState());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return state;
}
