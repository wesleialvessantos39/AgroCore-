import {
  LayoutDashboard,
  Users,
  MapPin,
  FileText,
  FileCheck,
  ClipboardList,
  FolderArchive,
  User,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../routes/paths';
import { Permission } from '../types/authorization';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  requiredPermission?: Permission | readonly Permission[];
}

export interface SecondaryAction {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export const SYSTEM_NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'nav-item-overview',
    label: 'Visão geral',
    path: ROUTES.SYSTEM,
    icon: LayoutDashboard,
    requiredPermission: ['platform:view_overview', 'organization:view_overview'] as const,
  },
  {
    id: 'nav-item-clients',
    label: 'Clientes',
    path: ROUTES.CLIENTS,
    icon: Users,
    requiredPermission: 'clients:view',
  },
  {
    id: 'nav-item-properties',
    label: 'Imóveis',
    path: ROUTES.PROPERTIES,
    icon: MapPin,
    requiredPermission: 'properties:view',
  },
  {
    id: 'nav-item-appraisals',
    label: 'Laudos de Avaliação',
    path: ROUTES.APPRAISALS,
    icon: FileText,
    requiredPermission: 'appraisals:view',
  },
  {
    id: 'nav-item-appraisal-requests',
    label: 'Solicitações de Laudo',
    path: ROUTES.APPRAISAL_REQUESTS,
    icon: FileCheck,
    requiredPermission: ['appraisal_requests:view_related', 'appraisal_requests:view_queue'] as const,
  },
  {
    id: 'nav-item-proposals',
    label: 'Propostas',
    path: ROUTES.PROPOSALS,
    icon: ClipboardList,
    requiredPermission: 'proposals:view',
  },
  {
    id: 'nav-item-documents',
    label: 'Documentos',
    path: ROUTES.DOCUMENTS,
    icon: FolderArchive,
    requiredPermission: 'documents:view',
  },
  {
    id: 'nav-item-my-account',
    label: 'Minha conta',
    path: ROUTES.MY_ACCOUNT,
    icon: User,
    requiredPermission: 'personal_account:view_profile',
  },
] as const;

export const SYSTEM_SECONDARY_ACTIONS: readonly SecondaryAction[] = [
  {
    id: 'action-back-to-site',
    label: 'Voltar ao site',
    path: ROUTES.PRESENTATION,
    icon: Globe,
  },
] as const;
