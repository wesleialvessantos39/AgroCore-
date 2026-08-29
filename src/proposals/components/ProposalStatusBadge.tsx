import React from 'react';
import { ProposalStatus } from '../../types/proposals';
import { PROPOSAL_STATUS_LABELS } from '../validators';

interface ProposalStatusBadgeProps {
  status: ProposalStatus;
  className?: string;
}

export const ProposalStatusBadge: React.FC<ProposalStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  const label = PROPOSAL_STATUS_LABELS[status] || status;

  // Variantes visuais com tokens estritos AgroCore (#0B3D2E, #78C89A, white, tons derivados)
  const getBadgeStyle = () => {
    switch (status) {
      case 'draft':
        return 'bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20 font-medium';
      case 'submitted':
        return 'bg-[#78C89A]/20 text-[#0B3D2E] border-[#78C89A]/50 font-semibold';
      case 'under_review':
        return 'bg-[#0B3D2E]/15 text-[#0B3D2E] border-[#0B3D2E]/30 font-semibold';
      case 'changes_requested':
        return 'bg-[#78C89A]/30 text-[#0B3D2E] border-[#78C89A]/70 font-semibold';
      case 'approved':
        return 'bg-[#78C89A]/40 text-[#0B3D2E] border-[#78C89A] font-bold';
      case 'presented':
        return 'bg-[#78C89A]/15 text-[#0B3D2E] border-[#78C89A]/40 font-semibold';
      case 'accepted':
        return 'bg-[#0B3D2E] text-white border-[#0B3D2E] font-bold shadow-xs';
      case 'declined':
        return 'bg-[#0B3D2E]/10 text-[#0B3D2E]/80 border-[#0B3D2E]/25 font-medium';
      case 'rejected':
        return 'bg-[#0B3D2E]/20 text-[#0B3D2E] border-[#0B3D2E]/40 font-bold';
      case 'expired':
        return 'bg-[#0B3D2E]/15 text-[#0B3D2E]/70 border-[#0B3D2E]/25 italic';
      case 'cancelled':
        return 'bg-[#0B3D2E]/5 text-[#0B3D2E]/50 border-[#0B3D2E]/10 line-through';
      default:
        return 'bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs rounded-full border whitespace-nowrap ${getBadgeStyle()} ${className}`}
      id={`proposal-status-${status}`}
    >
      {label}
    </span>
  );
};
