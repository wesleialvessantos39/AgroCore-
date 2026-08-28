import { AuthGateway } from '../types/auth';
import { UnavailableAuthGateway } from './unavailableGateway';

export async function createAuthGateway(): Promise<AuthGateway> {
  if (import.meta.env.DEV) {
    const { PreviewAuthGateway } = await import('./preview/previewGateway');
    return new PreviewAuthGateway();
  }
  return new UnavailableAuthGateway();
}
