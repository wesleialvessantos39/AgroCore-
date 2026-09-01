import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { GuestRoute } from '../components/auth/GuestRoute';
import { OrganizationGate } from '../organization/OrganizationGate';
import { RequirePermission } from '../authorization/RequirePermission';
import { RouteLoadingScreen } from '../components/feedback/RouteLoadingScreen';
import { ROUTES } from './paths';
import { getRouteMetadata } from './routeMetadata';

// Divisão de código real (Code-Splitting) por rota usando React.lazy
const SignInPage = lazy(() =>
  import('../pages/SignInPage').then((module) => ({
    default: module.SignInPage,
  }))
);

const PasswordRecoveryPage = lazy(() =>
  import('../pages/PasswordRecoveryPage').then((module) => ({
    default: module.PasswordRecoveryPage,
  }))
);

const PasswordResetPage = lazy(() =>
  import('../pages/PasswordResetPage').then((module) => ({
    default: module.PasswordResetPage,
  }))
);

const AccessDeniedPage = lazy(() =>
  import('../pages/AccessDeniedPage').then((module) => ({
    default: module.AccessDeniedPage,
  }))
);

const InstitutionalPage = lazy(() =>
  import('../pages/InstitutionalPage').then((module) => ({
    default: module.InstitutionalPage,
  }))
);

const OverviewPage = lazy(() =>
  import('../pages/OverviewPage').then((module) => ({
    default: module.OverviewPage,
  }))
);

const ClientsPage = lazy(() =>
  import('../pages/ClientsPage').then((module) => ({
    default: module.ClientsPage,
  }))
);

const ClientCreatePage = lazy(() =>
  import('../pages/ClientCreatePage').then((module) => ({
    default: module.ClientCreatePage,
  }))
);

const ClientEditPage = lazy(() =>
  import('../pages/ClientEditPage').then((module) => ({
    default: module.ClientEditPage,
  }))
);

const PropertiesPage = lazy(() =>
  import('../pages/PropertiesPage').then((module) => ({
    default: module.PropertiesPage,
  }))
);

const PropertyCreatePage = lazy(() =>
  import('../pages/PropertyCreatePage').then((module) => ({
    default: module.PropertyCreatePage,
  }))
);

const PropertyEditPage = lazy(() =>
  import('../pages/PropertyEditPage').then((module) => ({
    default: module.PropertyEditPage,
  }))
);

const PropertyGeometryPage = lazy(() =>
  import('../pages/PropertyGeometryPage').then((module) => ({
    default: module.PropertyGeometryPage,
  }))
);

const AppraisalsPage = lazy(() =>
  import('../pages/AppraisalsPage').then((module) => ({
    default: module.AppraisalsPage,
  }))
);

const AppraisalRequestsPage = lazy(() =>
  import('../pages/AppraisalRequestsPage').then((module) => ({
    default: module.AppraisalRequestsPage,
  }))
);

const ProposalsPage = lazy(() =>
  import('../pages/ProposalsPage').then((module) => ({
    default: module.ProposalsPage,
  }))
);

const ProposalCreatePage = lazy(() =>
  import('../pages/ProposalCreatePage').then((module) => ({
    default: module.ProposalCreatePage,
  }))
);

const ProposalEditPage = lazy(() =>
  import('../pages/ProposalEditPage').then((module) => ({
    default: module.ProposalEditPage,
  }))
);

const ProposalDetailPage = lazy(() =>
  import('../pages/ProposalDetailPage').then((module) => ({
    default: module.ProposalDetailPage,
  }))
);

const ProposalQueuePage = lazy(() =>
  import('../pages/ProposalQueuePage').then((module) => ({ default: module.ProposalQueuePage }))
);

const ProposalReviewPage = lazy(() =>
  import('../pages/ProposalReviewPage').then((module) => ({ default: module.ProposalReviewPage }))
);

const ProposalHistoryPage = lazy(() =>
  import('../pages/ProposalHistoryPage').then((module) => ({ default: module.ProposalHistoryPage }))
);

const ProposalDocumentPage = lazy(() =>
  import('../pages/ProposalDocumentPage').then((module) => ({ default: module.ProposalDocumentPage }))
);

const ProposalTrackingPage = lazy(() =>
  import('../pages/ProposalTrackingPage').then((module) => ({ default: module.ProposalTrackingPage }))
);

const ProposalHandoffPage = lazy(() =>
  import('../pages/ProposalHandoffPage').then((module) => ({ default: module.ProposalHandoffPage }))
);

const ProposalHandoffQueuePage = lazy(() =>
  import('../pages/ProposalHandoffQueuePage').then((module) => ({ default: module.ProposalHandoffQueuePage }))
);

const ProposalRenewalPage = lazy(() =>
  import('../pages/ProposalRenewalPage').then((module) => ({ default: module.ProposalRenewalPage }))
);

const DocumentsPage = lazy(() =>
  import('../pages/DocumentsPage').then((module) => ({ default: module.DocumentsPage }))
);

const DocumentReferenceCreatePage = lazy(() =>
  import('../pages/DocumentReferenceCreatePage').then((module) => ({ default: module.DocumentReferenceCreatePage }))
);

const DocumentGovernancePage = lazy(() =>
  import('../pages/DocumentGovernancePage').then((module) => ({ default: module.DocumentGovernancePage }))
);

const DocumentRequirementCreatePage = lazy(() =>
  import('../pages/DocumentRequirementCreatePage').then((module) => ({ default: module.DocumentRequirementCreatePage }))
);

const DocumentReferenceDetailPage = lazy(() =>
  import('../pages/DocumentReferenceDetailPage').then((module) => ({ default: module.DocumentReferenceDetailPage }))
);

const MyAccountPage = lazy(() =>
  import('../pages/MyAccountPage').then((module) => ({
    default: module.MyAccountPage,
  }))
);

const ConfigureOrganizationPage = lazy(() =>
  import('../pages/ConfigureOrganizationPage').then((module) => ({
    default: module.ConfigureOrganizationPage,
  }))
);

const SelectOrganizationPage = lazy(() =>
  import('../pages/SelectOrganizationPage').then((module) => ({
    default: module.SelectOrganizationPage,
  }))
);

const PendingAccessPage = lazy(() =>
  import('../pages/PendingAccessPage').then((module) => ({
    default: module.PendingAccessPage,
  }))
);

const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  }))
);

function ScrollAndFocusManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // 1. Atualização centralizada e síncrona do título da página
    const metadata = getRouteMetadata(pathname);
    document.title = metadata.documentTitle;

    // 2. Tratamento de âncora (ex: #agrocore-beneficios)
    if (hash) {
      const element = document.getElementById(hash.replace('#', ''));
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
        element.focus({ preventScroll: true });
        return;
      }
    }

    // 3. Mudança de rota padrão: rolar para o topo e direcionar foco para o conteúdo principal
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.focus({ preventScroll: true });
    }
  }, [pathname, hash]);

  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollAndFocusManager />
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>
          {/* Rota Principal do Sistema / Apresentação Institucional */}
          <Route path={ROUTES.HOME} element={<InstitutionalPage />} />

          {/* Rotas Públicas Exclusivas para Visitantes (Autenticados são direcionados) */}
          <Route
            path={ROUTES.SIGN_IN}
            element={
              <GuestRoute>
                <SignInPage />
              </GuestRoute>
            }
          />

          <Route
            path={ROUTES.RECOVER_ACCESS}
            element={
              <GuestRoute>
                <PasswordRecoveryPage />
              </GuestRoute>
            }
          />

          <Route
            path={ROUTES.RESET_PASSWORD}
            element={
              <GuestRoute>
                <PasswordResetPage />
              </GuestRoute>
            }
          />

          {/* Rota de Acesso Negado */}
          <Route path={ROUTES.ACCESS_DENIED} element={<AccessDeniedPage />} />

          {/* Rotas Autenticadas de Transição e Contexto Organizacional */}
          <Route
            path={ROUTES.CONFIG_ORGANIZATION}
            element={
              <ProtectedRoute>
                <ConfigureOrganizationPage />
              </ProtectedRoute>
            }
          />

          <Route
            path={ROUTES.SELECT_ORGANIZATION}
            element={
              <ProtectedRoute>
                <SelectOrganizationPage />
              </ProtectedRoute>
            }
          />

          <Route
            path={ROUTES.PENDING_ACCESS}
            element={
              <ProtectedRoute>
                <PendingAccessPage />
              </ProtectedRoute>
            }
          />

          {/* Rota Protegida da Área Interna do Sistema com AppShell, Guarda Organizacional e Permissão */}
          <Route
            path={ROUTES.SYSTEM}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission
                    permission={['platform:view_overview', 'organization:view_overview']}
                  >
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
          </Route>

          {/* Rota Clientes Integrada ao AppShell e Permissão */}
          <Route
            path={ROUTES.CLIENTS}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="clients:view">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<ClientsPage />} />
            <Route
              path="novo"
              element={
                <RequirePermission permission="clients:create">
                  <ClientCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path="pendencias"
              element={
                <RequirePermission permission="documents:view_requirements">
                  <DocumentGovernancePage />
                </RequirePermission>
              }
            />
            <Route
              path="pendencias/nova"
              element={
                <RequirePermission permission="documents:manage_requirements">
                  <DocumentRequirementCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path=":clientId/editar"
              element={
                <RequirePermission permission="clients:edit">
                  <ClientEditPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Rota Imóveis Integrada ao AppShell e Permissão */}
          <Route
            path={ROUTES.PROPERTIES}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="properties:view">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<PropertiesPage />} />
            <Route
              path="novo"
              element={
                <RequirePermission permission="properties:create">
                  <PropertyCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path=":propertyId/editar"
              element={
                <RequirePermission permission="properties:edit">
                  <PropertyEditPage />
                </RequirePermission>
              }
            />
            <Route
              path=":propertyId/georreferenciamento"
              element={
                <RequirePermission permission="properties:geospatial:view">
                  <PropertyGeometryPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Rota Laudos de Avaliação (Módulo 004) */}
          <Route
            path={ROUTES.APPRAISALS}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="appraisals:view">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<AppraisalsPage />} />
            <Route
              path=":appraisalId"
              element={
                <RequirePermission permission="appraisals:view">
                  <AppraisalsPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Rota Solicitações de Laudo (Módulo 004) */}
          <Route
            path={ROUTES.APPRAISAL_REQUESTS}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission
                    permission={['appraisal_requests:view_related', 'appraisal_requests:view_queue']}
                  >
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<AppraisalRequestsPage />} />
            <Route
              path="nova"
              element={
                <RequirePermission permission="appraisal_requests:create">
                  <AppraisalRequestsPage initialAction="create" />
                </RequirePermission>
              }
            />
            <Route
              path=":requestId"
              element={
                <RequirePermission
                  permission={['appraisal_requests:view_related', 'appraisal_requests:view_queue']}
                >
                  <AppraisalRequestsPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Rota Propostas de Crédito e Serviços (Módulo 005) */}
          <Route
            path={ROUTES.PROPOSALS}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="proposals:view">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<ProposalsPage />} />
            <Route
              path="fila"
              element={
                <RequirePermission permission="proposals:assign_review">
                  <ProposalQueuePage />
                </RequirePermission>
              }
            />
            <Route
              path="acompanhamento"
              element={
                <RequirePermission permission="proposals:view_commercial_tracking">
                  <ProposalTrackingPage />
                </RequirePermission>
              }
            />
            <Route
              path="encaminhamentos"
              element={
                <RequirePermission permission="proposals:view_handoff_queue">
                  <ProposalHandoffQueuePage />
                </RequirePermission>
              }
            />
            <Route
              path="novo"
              element={
                <RequirePermission permission="proposals:create">
                  <ProposalCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/editar"
              element={
                <RequirePermission permission="proposals:edit_draft">
                  <ProposalEditPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/revisao"
              element={
                <RequirePermission permission={['proposals:view_assigned', 'proposals:review']} requireAll>
                  <ProposalReviewPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/historico"
              element={
                <RequirePermission permission={['proposals:view', 'proposals:view_related', 'proposals:view_assigned']}>
                  <ProposalHistoryPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/documento"
              element={
                <RequirePermission permission="proposals:view_document">
                  <ProposalDocumentPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/encaminhamento"
              element={
                <RequirePermission permission="proposals:view_handoff">
                  <ProposalHandoffPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId/renovar"
              element={
                <RequirePermission permission="proposals:renew">
                  <ProposalRenewalPage />
                </RequirePermission>
              }
            />
            <Route
              path=":proposalId"
              element={
                <RequirePermission permission={['proposals:view', 'proposals:view_related', 'proposals:view_assigned']}>
                  <ProposalDetailPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Gestão Documental Referencial (Módulo 006) */}
          <Route
            path={ROUTES.DOCUMENTS}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="documents:view">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<DocumentsPage />} />
            <Route
              path="novo"
              element={
                <RequirePermission permission="documents:upload">
                  <DocumentReferenceCreatePage />
                </RequirePermission>
              }
            />
            <Route
              path=":documentId"
              element={
                <RequirePermission permission="documents:view">
                  <DocumentReferenceDetailPage />
                </RequirePermission>
              }
            />
          </Route>

          {/* Rota Minha Conta Integrada ao AppShell e Permissão */}
          <Route
            path={ROUTES.MY_ACCOUNT}
            element={
              <ProtectedRoute>
                <OrganizationGate>
                  <RequirePermission permission="personal_account:view_profile">
                    <AppShell />
                  </RequirePermission>
                </OrganizationGate>
              </ProtectedRoute>
            }
          >
            <Route index element={<MyAccountPage />} />
          </Route>

          {/* Rota da Apresentação Institucional */}
          <Route path={ROUTES.PRESENTATION} element={<InstitutionalPage />} />

          {/* Rota Curinga de Página Não Encontrada */}
          <Route path={ROUTES.NOT_FOUND} element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
