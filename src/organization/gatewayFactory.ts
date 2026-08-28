import { OrganizationGateway } from '../types/organization';
import { UnavailableOrganizationGateway } from './unavailableGateway';

export async function createOrganizationGateway(): Promise<OrganizationGateway> {
  if (import.meta.env.DEV) {
    const { PreviewOrganizationGateway } = await import('./preview/previewGateway');
    return new PreviewOrganizationGateway();
  }
  return new UnavailableOrganizationGateway();
}
