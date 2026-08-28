import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ProposalList } from '../proposals/components/ProposalList';
import {
  ROUTES,
  getProposalDetailPath,
  getProposalEditPath,
} from '../routes/paths';

export const ProposalsPage: React.FC = () => {
  const navigate = useNavigate();

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
      <ProposalList
        onNewProposal={handleNewProposal}
        onEditProposal={handleEditProposal}
        onViewProposal={handleViewProposal}
      />
    </div>
  );
};
