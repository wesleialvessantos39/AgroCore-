import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { ProposalList } from '../proposals/components/ProposalList';
import {
  ROUTES,
  getProposalDetailPath,
  getProposalEditPath,
} from '../routes/paths';
import { useAuthorization } from '../authorization/useAuthorization';
import { PROPOSAL_THEME } from '../proposals/theme';

export const ProposalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { can } = useAuthorization();

  const handleNewProposal = () => {
    navigate(ROUTES.PROPOSALS_NEW);
  };

  const handleEditProposal = (proposalId: string) => {
    navigate(getProposalEditPath(proposalId));
  };

  const handleViewProposal = (proposalId: string) => {
    navigate(getProposalDetailPath(proposalId));
  };

  return (
    <div className="space-y-6" id="page-proposals">
      {can('proposals:view_commercial_tracking') && (
        <div className="flex justify-end">
          <button type="button" className={PROPOSAL_THEME.btnSecondary} onClick={() => navigate(ROUTES.PROPOSALS_TRACKING)}>
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Acompanhamento comercial
          </button>
        </div>
      )}
      <ProposalList
        onNewProposal={handleNewProposal}
        onEditProposal={handleEditProposal}
        onViewProposal={handleViewProposal}
      />
    </div>
  );
};
