import { useContext } from 'react';
import { ScheduleContext } from './ScheduleContext';

export function useSchedule() {
  const context = useContext(ScheduleContext);
  if (!context) {
    throw new Error(
      'useSchedule deve ser usado dentro de ScheduleProvider.'
    );
  }
  return context;
}
