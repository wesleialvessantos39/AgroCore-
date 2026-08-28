import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header id="agrocore-page-header" className="border-b border-[#E2E8F0] pb-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0B3D2E]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm sm:text-base text-[#475569] leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    </header>
  );
}
