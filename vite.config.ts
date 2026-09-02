import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

function stripPreviewPlugin(isProduction: boolean) {
  return {
    name: 'strip-preview-for-production',
    enforce: 'pre' as const,
    resolveId(id: string, importer?: string) {
      if (!isProduction) return null;

      const normalizedTarget = (importer && (id.startsWith('.') || id.startsWith('/')))
        ? path.resolve(path.dirname(importer), id).replace(/\\/g, '/')
        : id.replace(/\\/g, '/');

      const lowerTarget = normalizedTarget.toLowerCase();
      const lowerId = id.toLowerCase();

      // Intercepta gatewayFactory relativo ou absoluto
      if (
        lowerTarget.includes('gatewayfactory') ||
        lowerTarget.includes('requestgatewayfactory') ||
        lowerId.includes('gatewayfactory') ||
        lowerId.includes('requestgatewayfactory')
      ) {
        if (
          normalizedTarget.includes('/clients/capturerAssignmentGatewayFactory') ||
          id.includes('capturerAssignmentGatewayFactory') ||
          (importer && importer.includes('/clients/') && id === './capturerAssignmentGatewayFactory')
        ) {
          return '\0virtual:production-capturer-assignment-gateway-factory';
        }
        if (
          normalizedTarget.includes('/appraisals/notificationsGatewayFactory') ||
          id.includes('notificationsGatewayFactory') ||
          (importer && importer.includes('/appraisals/') && id === './notificationsGatewayFactory')
        ) {
          return '\0virtual:production-appraisal-notifications-gateway-factory';
        }
        if (
          normalizedTarget.includes('/technicalProfessionals/gatewayFactory') ||
          id.includes('/technicalProfessionals/gatewayFactory') ||
          id.includes('technicalProfessionals')
        ) {
          return '\0virtual:production-tech-professionals-gateway-factory';
        }
        if (
          normalizedTarget.includes('/appraisals/requestGatewayFactory') ||
          normalizedTarget.includes('requestGatewayFactory') ||
          id.includes('requestGatewayFactory')
        ) {
          return '\0virtual:production-appraisal-requests-gateway-factory';
        }
        if (
          normalizedTarget.includes('/appraisals/gatewayFactory') ||
          (id.includes('appraisals') && id.includes('gatewayFactory')) ||
          (importer && importer.includes('/appraisals/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-appraisals-gateway-factory';
        }
        if (
          normalizedTarget.includes('/proposals/gatewayFactory') ||
          id.includes('/proposals/gatewayFactory') ||
          (importer && importer.includes('/proposals/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-proposals-gateway-factory';
        }
        if (
          normalizedTarget.includes('/documents/documentComplianceGatewayFactory') ||
          id.includes('/documents/documentComplianceGatewayFactory') ||
          (importer && importer.includes('/documents/') && id === './documentComplianceGatewayFactory')
        ) {
          return '\0virtual:production-document-compliance-gateway-factory';
        }
        if (
          normalizedTarget.includes('/documents/proposalChecklistGatewayFactory') ||
          id.includes('/documents/proposalChecklistGatewayFactory') ||
          (importer && importer.includes('/documents/') && id === './proposalChecklistGatewayFactory')
        ) {
          return '\0virtual:production-proposal-checklists-gateway-factory';
        }
        if (
          normalizedTarget.includes('/documents/documentGatewayFactory') ||
          id.includes('/documents/documentGatewayFactory') ||
          (importer && importer.includes('/documents/') && id === './documentGatewayFactory')
        ) {
          return '\0virtual:production-documents-gateway-factory';
        }
        if (
          normalizedTarget.includes('/properties/geometry/geometryGatewayFactory') ||
          normalizedTarget.includes('geometryGatewayFactory') ||
          id.includes('geometryGatewayFactory')
        ) {
          return '\0virtual:production-property-geometry-gateway-factory';
        }
        if (
          normalizedTarget.includes('/properties/gatewayFactory') ||
          id.includes('/properties/gatewayFactory') ||
          (importer && importer.includes('/properties/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-properties-gateway-factory';
        }
        if (
          normalizedTarget.includes('/clients/gatewayFactory') ||
          id.includes('/clients/gatewayFactory') ||
          (importer && importer.includes('/clients/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-clients-gateway-factory';
        }
        if (
          normalizedTarget.includes('/organization/gatewayFactory') ||
          id.includes('/organization/gatewayFactory') ||
          (importer && importer.includes('/organization/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-org-gateway-factory';
        }
        if (
          normalizedTarget.includes('/auth/organizationMembersGatewayFactory') ||
          id.includes('organizationMembersGatewayFactory') ||
          (importer && importer.includes('/auth/') && id === './organizationMembersGatewayFactory')
        ) {
          return '\0virtual:production-org-members-gateway-factory';
        }
        if (
          normalizedTarget.includes('/auth/gatewayFactory') ||
          id.includes('/auth/gatewayFactory') ||
          (importer && importer.includes('/auth/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-auth-gateway-factory';
        }
        if (
          normalizedTarget.includes('/fieldVisits/gatewayFactory') ||
          id.includes('/fieldVisits/gatewayFactory') ||
          (importer && importer.includes('/fieldVisits/') && id === './gatewayFactory')
        ) {
          return '\0virtual:production-field-visits-gateway-factory';
        }
      }

      // Em produção, intercepta qualquer import de preview e retorna stubs vazios
      if (
        /[\\/]src[\\/]auth[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]organization[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]clients[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]properties[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]appraisals[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]proposals[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]documents[\\/]preview[\\/]/.test(id) ||
        /[\\/]src[\\/]technicalProfessionals[\\/]preview[\\/]/.test(id) ||
        id.includes('/auth/preview') ||
        id.includes('/organization/preview') ||
        id.includes('/clients/preview') ||
        id.includes('/properties/preview') ||
        id.includes('/appraisals/preview') ||
        id.includes('/proposals/preview') ||
        id.includes('/documents/preview') ||
        id.includes('/technicalProfessionals/preview') ||
        id.includes('./preview/')
      ) {
        return '\0virtual:production-preview-stub';
      }

      return null;
    },
    load(id: string) {
      if (id === '\0virtual:production-auth-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseAuthGateway } from '/src/auth/supabaseAuthGateway.ts';
          import { UnavailableAuthGateway } from '/src/auth/unavailableGateway.ts';
          export async function createAuthGateway() {
            const supabase = getSupabaseClient();
            return supabase ? new SupabaseAuthGateway(supabase) : new UnavailableAuthGateway();
          }
        `;
      }

      if (id === '\0virtual:production-org-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseOrganizationGateway } from '/src/organization/supabaseOrganizationGateway.ts';
          import { UnavailableOrganizationGateway } from '/src/organization/unavailableGateway.ts';
          export async function createOrganizationGateway() {
            const supabase = getSupabaseClient();
            return supabase
              ? new SupabaseOrganizationGateway(supabase)
              : new UnavailableOrganizationGateway();
          }
        `;
      }

      if (id === '\0virtual:production-org-members-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseOrganizationMembersGateway } from '/src/auth/supabaseOrganizationMembersGateway.ts';
          import { UnavailableOrganizationMembersGateway } from '/src/auth/unavailableOrganizationMembersGateway.ts';
          let activeGateway = null;
          export function getOrganizationMembersGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseOrganizationMembersGateway(supabase)
              : new UnavailableOrganizationMembersGateway();
            return activeGateway;
          }
          export function setOrganizationMembersGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-clients-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseClientGateway } from '/src/clients/supabaseClientGateway.ts';
          import { UnavailableClientGateway } from '/src/clients/unavailableGateway.ts';
          let activeGateway = null;
          export function getClientGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseClientGateway(supabase)
              : new UnavailableClientGateway();
            return activeGateway;
          }
          export function setClientGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-properties-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabasePropertyGateway } from '/src/properties/supabasePropertyGateway.ts';
          import { UnavailablePropertyGateway } from '/src/properties/unavailableGateway.ts';
          let activeGateway = null;
          export function getPropertyGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabasePropertyGateway(supabase)
              : new UnavailablePropertyGateway();
            return activeGateway;
          }
          export function setPropertyGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-property-geometry-gateway-factory') {
        return `
          import { UnavailablePropertyGeometryGateway } from '/src/properties/geometry/unavailableGeometryGateway.ts';
          export function getPropertyGeometryGateway() {
            return new UnavailablePropertyGeometryGateway();
          }
          export function setPropertyGeometryGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-appraisals-gateway-factory') {
        return `
          import { UnavailableAppraisalGateway } from '/src/appraisals/unavailableGateway.ts';
          export function getAppraisalGateway() {
            return new UnavailableAppraisalGateway();
          }
          export function setAppraisalGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-appraisal-requests-gateway-factory') {
        return `
          import { UnavailableAppraisalRequestGateway } from '/src/appraisals/unavailableRequestGateway.ts';
          export function getAppraisalRequestGateway() {
            return new UnavailableAppraisalRequestGateway();
          }
          export function setAppraisalRequestGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-tech-professionals-gateway-factory') {
        return `
          import { UnavailableTechnicalProfessionalGateway } from '/src/technicalProfessionals/unavailableGateway.ts';
          export function getTechnicalProfessionalGateway() {
            return new UnavailableTechnicalProfessionalGateway();
          }
          export function setTechnicalProfessionalGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-capturer-assignment-gateway-factory') {
        return `
          import { UnavailableClientCapturerAssignmentGateway } from '/src/clients/unavailableCapturerAssignmentGateway.ts';
          export function getClientCapturerAssignmentGateway() {
            return new UnavailableClientCapturerAssignmentGateway();
          }
          export function setClientCapturerAssignmentGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-appraisal-notifications-gateway-factory') {
        return `
          import { UnavailableAppraisalNotificationsGateway } from '/src/appraisals/unavailableNotificationsGateway.ts';
          export function getAppraisalNotificationsGateway() {
            return new UnavailableAppraisalNotificationsGateway();
          }
          export function setAppraisalNotificationsGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-proposals-gateway-factory') {
        return `
          import { UnavailableProposalGateway } from '/src/proposals/unavailableGateway.ts';
          export function getProposalGateway() {
            return new UnavailableProposalGateway();
          }
          export function setProposalGatewayForTesting() {}
        `;
      }

      if (id === '\0virtual:production-documents-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseDocumentReferenceGateway } from '/src/documents/supabaseDocumentReferenceGateway.ts';
          import { UnavailableDocumentReferenceGateway } from '/src/documents/unavailableDocumentReferenceGateway.ts';
          let activeGateway = null;
          export function getDocumentReferenceGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseDocumentReferenceGateway(supabase)
              : new UnavailableDocumentReferenceGateway();
            return activeGateway;
          }
          export function setDocumentReferenceGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-proposal-checklists-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseProposalChecklistGateway } from '/src/documents/supabaseProposalChecklistGateway.ts';
          import { UnavailableProposalChecklistGateway } from '/src/documents/unavailableProposalChecklistGateway.ts';
          let activeGateway = null;
          export function getProposalChecklistGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseProposalChecklistGateway(supabase)
              : new UnavailableProposalChecklistGateway();
            return activeGateway;
          }
          export function setProposalChecklistGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-document-compliance-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseDocumentComplianceGateway } from '/src/documents/supabaseDocumentComplianceGateway.ts';
          import { UnavailableDocumentComplianceGateway } from '/src/documents/unavailableDocumentComplianceGateway.ts';
          let activeGateway = null;
          export function getDocumentComplianceGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseDocumentComplianceGateway(supabase)
              : new UnavailableDocumentComplianceGateway();
            return activeGateway;
          }
          export function setDocumentComplianceGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-field-visits-gateway-factory') {
        return `
          import { getSupabaseClient } from '/src/infrastructure/supabaseClient.ts';
          import { SupabaseTechnicalVisitGateway } from '/src/fieldVisits/supabaseTechnicalVisitGateway.ts';
          import { UnavailableTechnicalVisitGateway } from '/src/fieldVisits/unavailableGateway.ts';
          let activeGateway = null;
          export function getTechnicalVisitGateway() {
            if (activeGateway) return activeGateway;
            const supabase = getSupabaseClient();
            activeGateway = supabase
              ? new SupabaseTechnicalVisitGateway(supabase)
              : new UnavailableTechnicalVisitGateway();
            return activeGateway;
          }
          export function setTechnicalVisitGatewayForTesting(gateway) {
            activeGateway = gateway ?? null;
          }
        `;
      }

      if (id === '\0virtual:production-preview-stub') {
        return `
          export default function EmptyStub() { return null; }
          export const PreviewBadge = () => null;
          export function createPreviewRecoverySession() { return false; }
          export function isPreviewRecoverySessionValid() { return false; }
          export function clearPreviewRecoverySession() {}
          export function savePreviewActivity() { return false; }
          export function getPreviewActivity() { return null; }
          export function clearPreviewActivity() {}
          export function validateActivityRecord() { return false; }
          export function clearAllPreviewState() {}
          export const PREVIEW_STORAGE_KEYS = { SESSION: '', ACTIVITY: '', RECOVERY_FLOW: '', ORG_CONTEXT: '', ORG_PREFERENCE: '' };
          export const PREVIEW_ACTIVITY_STORAGE_KEY = '';
          export const PREVIEW_SESSION_STORAGE_KEY = '';
          export const PREVIEW_RECOVERY_STORAGE_KEY = '';
          export class StubGateway {
            async loadContext() { return { status: 'unavailable', activeOrganization: null, activeMembership: null, availableMemberships: [] }; }
            async listMemberships() { return []; }
            async selectOrganization() { return false; }
            async configureInitialOrganization() { return false; }
            async clearPreference() {}
          }
        `;
      }

      return null;
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const isProduction = command === 'build' || mode === 'production';

  return {
    plugins: [
      stripPreviewPlugin(isProduction),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
