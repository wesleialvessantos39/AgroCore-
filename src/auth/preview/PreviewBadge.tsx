interface PreviewBadgeProps {
  variant?: 'dark' | 'light';
}

export function PreviewBadge({ variant = 'dark' }: PreviewBadgeProps) {
  if (variant === 'light') {
    return (
      <span className="text-[11px] font-semibold text-[#0B3D2E] bg-[#EFF5F2] px-2.5 py-1 rounded-full border border-[#D1DED7]">
        Modo de acompanhamento
      </span>
    );
  }

  return (
    <span className="inline-block text-[10px] font-semibold text-[#78C89A] bg-[#0B3D2E] px-2 py-0.5 rounded border border-[#78C89A]/30">
      Modo de acompanhamento
    </span>
  );
}

export default PreviewBadge;
