import { useContext } from 'react';
import { FieldVisitsContext, type FieldVisitsContextValue } from './FieldVisitsContext';

export function useFieldVisits(): FieldVisitsContextValue {
  const context = useContext(FieldVisitsContext);
  if (!context) {
    throw new Error('useFieldVisits deve ser utilizado dentro de FieldVisitsProvider.');
  }
  return context;
}
