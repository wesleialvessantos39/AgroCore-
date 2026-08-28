import { useContext } from 'react';
import { AuthorizationContext, AuthorizationContextValue } from './AuthorizationContext';

export function useAuthorization(): AuthorizationContextValue {
  const context = useContext(AuthorizationContext);
  if (!context) {
    throw new Error('useAuthorization deve ser utilizado dentro de um AuthorizationProvider.');
  }
  return context;
}
