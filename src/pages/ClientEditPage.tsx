import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserCheck, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { useClients } from '../clients/useClients';
import { ClientForm } from '../clients/components/ClientForm';
import { Client, ClientFormValues } from '../types/client';
import { formValuesToUpdateInput } from '../clients/validators';
import { ROUTES } from '../routes/paths';
import { Button } from '../components/ui/Button';

export function ClientEditPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { getClientById, updateClient } = useClients();

  const [isLoading, setIsLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadClientData() {
      if (!clientId) {
        setIsLoading(false);
        setLoadError('Identificador do cliente não informado.');
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const found = await getClientById(clientId);
        if (!isMounted) return;

        if (!found) {
          setLoadError('Cliente não encontrado ou não pertence a esta organização.');
        } else {
          setClient(found);
        }
      } catch (error) {
        if (!isMounted) return;
        setLoadError('Não foi possível carregar os dados do cliente no momento.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadClientData();

    return () => {
      isMounted = false;
    };
  }, [clientId, getClientById]);

  const handleSubmit = async (values: ClientFormValues) => {
    if (!clientId) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const input = formValuesToUpdateInput(values);
      const result = await updateClient(clientId, input);

      if (result.success === false) {
        setServerError(result.error);
        return;
      }

      navigate(ROUTES.CLIENTS);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao atualizar cliente.';
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(ROUTES.CLIENTS);
  };

  if (isLoading) {
    return (
      <div
        id="client-edit-loading"
        className="min-h-[360px] flex flex-col items-center justify-center p-8 text-center space-y-4"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-8 h-8 text-[#0B3D2E] animate-spin" aria-hidden="true" />
        <p className="text-sm font-medium text-[#475569]">Carregando dados do cliente...</p>
      </div>
    );
  }

  if (loadError || !client) {
    return (
      <div
        id="client-edit-not-found"
        className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-red-200 shadow-xs text-center space-y-5"
        role="alert"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-slate-900">Cliente não localizado</h1>
          <p className="text-sm text-slate-600">
            {loadError || 'O registro do cliente solicitado não foi encontrado nesta organização.'}
          </p>
        </div>
        <div className="pt-2">
          <Button
            id="btn-return-to-clients"
            type="button"
            variant="primary"
            size="md"
            onClick={handleCancel}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Voltar para Clientes</span>
          </Button>
        </div>
      </div>
    );
  }

  const clientDisplayName =
    client.personType === 'individual' ? client.name : client.companyName;

  return (
    <div id="page-client-edit" className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0B3D2E] uppercase tracking-wider mb-1">
            <span>Módulo 002</span>
            <span>•</span>
            <span>Clientes e Produtores Rurais</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <UserCheck className="w-6 h-6 text-[#0B3D2E]" aria-hidden="true" />
            <span>Editar Cliente: {clientDisplayName}</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] mt-1">
            Atualize as informações cadastrais, de contato, endereço e situação do cliente.
          </p>
        </div>
      </div>

      {/* Formulário Reutilizável */}
      <ClientForm
        mode="edit"
        initialClient={client}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        serverError={serverError}
      />
    </div>
  );
}
