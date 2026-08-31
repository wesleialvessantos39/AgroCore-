import { BrowserRouter } from 'react-router-dom';
import { AppErrorBoundary } from './components/errors/AppErrorBoundary';
import { SkipToContent } from './components/layout/SkipToContent';
import { ConnectivityNotice } from './components/feedback/ConnectivityNotice';
import { RouteAnnouncer } from './components/accessibility/RouteAnnouncer';
import { UpdateNotice } from './components/feedback/UpdateNotice';
import { AuthProvider } from './auth/AuthContext';
import { OrganizationProvider } from './organization/OrganizationContext';
import { AuthorizationProvider } from './authorization/AuthorizationContext';
import { ClientsProvider } from './clients/ClientsContext';
import { PropertiesProvider } from './properties/PropertiesContext';
import { TechnicalProfessionalProvider } from './technicalProfessionals/TechnicalProfessionalContext';
import { AppraisalsProvider } from './appraisals/AppraisalsContext';
import { ProposalsProvider } from './proposals/ProposalsContext';
import { DocumentsProvider } from './documents/DocumentsContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <OrganizationProvider>
            <AuthorizationProvider>
              <ClientsProvider>
                <PropertiesProvider>
                  <TechnicalProfessionalProvider>
                    <AppraisalsProvider>
                      <ProposalsProvider>
                        <DocumentsProvider>
                          <ConnectivityNotice />
                          <UpdateNotice />
                          <RouteAnnouncer />
                          <SkipToContent />
                          <AppRoutes />
                        </DocumentsProvider>
                      </ProposalsProvider>
                    </AppraisalsProvider>
                  </TechnicalProfessionalProvider>
                </PropertiesProvider>
              </ClientsProvider>
            </AuthorizationProvider>
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
