import type { LucideIcon } from 'lucide-react';

interface SummaryCardProps {
  id?: string;
  title: string;
  description: string;
  icon: LucideIcon;
  emptyText?: string;
}

export function SummaryCard({
  id,
  title,
  description,
  icon: Icon,
  emptyText = 'Ainda sem dados',
}: SummaryCardProps) {
  const cardId = id || `summary-card-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div
      id={cardId}
      className="bg-white rounded-2xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs flex flex-col justify-between gap-4 select-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] shrink-0 shadow-2xs"
            aria-hidden="true"
          >
            <Icon className="w-5 h-5 text-[#0B3D2E]" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A] tracking-tight leading-snug">
            {title}
          </h3>
        </div>

        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] shrink-0"
        >
          {emptyText}
        </span>
      </div>

      <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">
        {description}
      </p>
    </div>
  );
}
