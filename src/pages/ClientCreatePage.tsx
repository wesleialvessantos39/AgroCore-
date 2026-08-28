import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { useClients } from '../clients/useClients';
import { ClientForm } from '../clients/components/ClientForm';
import { ClientFormValues } from '../types/client';
import { formValuesToCreateInput } from '../clients/validators';
import { ROUTES } from '../routes/paths';

export function ClientCreatePage() {
  const navigate = useNavigate();
  const { createClient } = useClients();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (values: ClientFormValues) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const input = formValuesToCreateInput(values);
      const result = await createClient(input);

      if (result.success === false) {
        setServerError(result.error);
        return;
      }

      navigate(ROUTES.CLIENTS);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao cadastrar cliente.';
      setServerError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate(ROUTES.CLIENTS);
  };

  return (
    <div id="page-client-create" className="space-y-6">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0B3D2E] uppercase tracking-wider mb-1">
            <span>Módulo 002</span>
            <span>•</span>
            <span>Clientes e Produtores Rurais</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <UserPlus className="w-6 h-6 text-[#0B3D2E]" aria-hidden="true" />
            <span>Cadastrar Cliente ou Produtor Rural</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] mt-1">
            Preencha os dados cadastrais do produtor autônomo ou pessoa jurídica para acompanhamento.
          </p>
        </div>
      </div>

      {/* Formulário Reutilizável */}
      <ClientForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        serverError={serverError}
      />
    </div>
  );
}
