import type { ReactNode } from 'react';

interface PanelProps {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Panel({ id, title, description, children, className = '' }: PanelProps) {
  const headingId = id ? `${id}-title` : `panel-title-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs flex flex-col ${className}`}
    >
      <div className="border-b border-[#E2E8F0] pb-3.5 mb-4">
        <h2
          id={headingId}
          className="text-base sm:text-lg font-bold text-[#0B3D2E] tracking-tight"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs sm:text-sm text-[#475569] leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </section>
  );
}
