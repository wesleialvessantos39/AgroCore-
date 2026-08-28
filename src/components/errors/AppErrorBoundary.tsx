import React, { type ReactNode, type ErrorInfo } from 'react';
import { Logo } from '../Logo';
import { RefreshCw, Home, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Tratamento silencioso e seguro de exceções de renderização.
    // Nunca expor detalhes técnicos, nomes de arquivos ou stack trace para a interface do usuário.
    if (typeof document !== 'undefined') {
      document.title = 'Não foi possível carregar | AgroCore';
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleGoHome = (): void => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div 
          id="agrocore-error-boundary-screen" 
          className="min-h-screen flex flex-col justify-between bg-[#F8FAF9] text-[#0F172A] w-full"
        >
          {/* Header Mínimo de Recuperação */}
          <header className="w-full bg-[#0B3D2E] text-white border-b border-[#07261D] py-4 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <Logo variant="on-dark" size="md" />
            </div>
          </header>

          {/* Conteúdo Principal de Falha Segura */}
          <main 
            id="main-content"
            tabIndex={-1}
            className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 flex flex-col items-center justify-center text-center outline-none"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#EFF5F2] border border-[#D1DED7] flex items-center justify-center text-[#0B3D2E] mb-6 shadow-sm">
              <AlertCircle className="w-8 h-8 text-[#0B3D2E]" aria-hidden="true" />
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[#0B3D2E] mb-4">
              Não foi possível carregar esta página
            </h1>

            <p className="text-sm sm:text-base text-[#334155] leading-relaxed max-w-lg mb-8">
              Ocorreu uma instabilidade inesperada ao processar sua solicitação. Nossos mecanismos de segurança isolaram a ocorrência para proteger seus dados e garantir a estabilidade da plataforma.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
              <Button
                id="error-boundary-retry-button"
                variant="primary"
                size="md"
                onClick={this.handleRetry}
                className="w-full sm:w-auto"
              >
                <RefreshCw className="w-4 h-4 text-[#78C89A]" aria-hidden="true" />
                <span>Tentar novamente</span>
              </Button>

              <Button
                id="error-boundary-home-button"
                variant="secondary"
                size="md"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto"
              >
                <Home className="w-4 h-4 text-[#0B3D2E]" aria-hidden="true" />
                <span>Voltar ao início</span>
              </Button>
            </div>
          </main>

          {/* Rodapé Seguro */}
          <footer className="w-full bg-[#07261D] text-slate-400 border-t border-[#0B3D2E] py-6 text-center text-xs">
            <p>&copy; {new Date().getFullYear()} AgroCore. Todos os direitos reservados.</p>
          </footer>
        </div>
      );
    }

    return this.props.children;
  }
}
