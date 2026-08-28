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

  // Variantes visuais com tokens estritos AgroCore (#0B3D2E, #78C89A, white)
  const getBadgeStyle = () => {
    switch (status) {
      case 'draft':
        return 'bg-[#0B3D2E]/10 text-[#0B3D2E] border-[#0B3D2E]/20 font-medium';
      case 'submitted':
        return 'bg-[#78C89A]/20 text-[#0B3D2E] border-[#78C89A]/50 font-semibold';
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
