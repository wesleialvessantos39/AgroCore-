import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  id?: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({
  id,
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const emptyStateId = id || `empty-state-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div
      id={emptyStateId}
      className="flex-1 flex flex-col items-center justify-center text-center p-6 sm:p-8 min-h-[180px] select-none"
    >
      <div
        className="w-12 h-12 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] mb-3.5 shadow-2xs"
        aria-hidden="true"
      >
        <Icon className="w-6 h-6 text-[#0B3D2E]" />
      </div>

      <h3 className="text-sm sm:text-base font-bold text-[#0B3D2E] mb-1">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-[#475569] max-w-sm mx-auto leading-relaxed">
        {description}
      </p>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
