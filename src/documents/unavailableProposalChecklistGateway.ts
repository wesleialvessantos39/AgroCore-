import { DocumentDomainError } from '../types/documents';
import type {
  ProposalChecklistTemplate,
  ProposalDocumentChecklist,
} from '../types/proposalChecklists';
import type {
  ApplyProposalChecklistRecord,
  ConfigureProposalChecklistTemplateRecord,
  ProposalChecklistGateway,
  TransitionProposalChecklistItemRecord,
} from './proposalChecklistGateway';

function unavailable(): never {
  throw new DocumentDomainError(
    'SERVICE_UNAVAILABLE',
    'Os checklists documentais estão indisponíveis até a infraestrutura segura ser conectada.'
  );
}

export class UnavailableProposalChecklistGateway implements ProposalChecklistGateway {
  async listCurrentTemplates(): Promise<readonly ProposalChecklistTemplate[]> {
    return unavailable();
  }

  async listTemplateHistory(): Promise<readonly ProposalChecklistTemplate[]> {
    return unavailable();
  }

  async getTemplateByVersionId(): Promise<ProposalChecklistTemplate | null> {
    return unavailable();
  }

  async configureTemplate(
    _input: ConfigureProposalChecklistTemplateRecord
  ): Promise<ProposalChecklistTemplate> {
    return unavailable();
  }

  async listChecklists(): Promise<readonly ProposalDocumentChecklist[]> {
    return unavailable();
  }

  async getChecklistById(): Promise<ProposalDocumentChecklist | null> {
    return unavailable();
  }

  async applyChecklist(
    _input: ApplyProposalChecklistRecord
  ): Promise<ProposalDocumentChecklist> {
    return unavailable();
  }

  async transitionItem(
    _input: TransitionProposalChecklistItemRecord
  ): Promise<ProposalDocumentChecklist> {
    return unavailable();
  }
}
