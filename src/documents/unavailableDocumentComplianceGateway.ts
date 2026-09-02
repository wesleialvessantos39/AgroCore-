import type {
  DocumentAlertPolicy,
  DocumentExportAudit,
  DocumentShareGrant,
  RedeemedDocumentShare,
} from '../types/documentCompliance';
import { DocumentDomainError } from '../types/documents';
import type {
  CompleteDocumentExportRecord,
  ConfigureDocumentAlertPolicyRecord,
  CreateDocumentExportRecord,
  CreateDocumentShareRecord,
  DocumentComplianceGateway,
  FailDocumentExportRecord,
  RevokeDocumentShareRecord,
} from './documentComplianceGateway';

function unavailable(): never {
  throw new DocumentDomainError(
    'SERVICE_UNAVAILABLE',
    'Validades e saídas documentais estão indisponíveis até a infraestrutura segura ser conectada.'
  );
}

export class UnavailableDocumentComplianceGateway implements DocumentComplianceGateway {
  async getAlertPolicy(): Promise<DocumentAlertPolicy | null> { return unavailable(); }
  async configureAlertPolicy(_input: ConfigureDocumentAlertPolicyRecord): Promise<DocumentAlertPolicy> { return unavailable(); }
  async listShares(): Promise<readonly DocumentShareGrant[]> { return unavailable(); }
  async createShare(_input: CreateDocumentShareRecord): Promise<DocumentShareGrant> { return unavailable(); }
  async revokeShare(_input: RevokeDocumentShareRecord): Promise<DocumentShareGrant> { return unavailable(); }
  async redeemShareToken(): Promise<RedeemedDocumentShare> { return unavailable(); }
  async listExports(): Promise<readonly DocumentExportAudit[]> { return unavailable(); }
  async createExport(_input: CreateDocumentExportRecord): Promise<DocumentExportAudit> { return unavailable(); }
  async completeExport(_input: CompleteDocumentExportRecord): Promise<DocumentExportAudit> { return unavailable(); }
  async failExport(_input: FailDocumentExportRecord): Promise<DocumentExportAudit> { return unavailable(); }
}
