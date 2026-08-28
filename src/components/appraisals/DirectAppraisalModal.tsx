/**
 * Modal de Início Direto de Laudo de Avaliação (Iniciativa Técnica)
 * Módulo 004 — AgroCore
 */

import React, { useState } from 'react';
import { PlusCircle, X, AlertCircle, FileCheck, RefreshCw } from 'lucide-react';
import { useAppraisals } from '../../appraisals/useAppraisals';
import { useClients } from '../../clients/useClients';
import { useProperties } from '../../properties/useProperties';
import { getClientDisplayName, getClientDocumentFormatted } from '../../clients/clientHelpers';

interface DirectAppraisalModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
}

export function DirectAppraisalModal({
  isOpen,
  onClose,
  onSuccess,
}: DirectAppraisalModalProps) {
  const { startDirectAppraisal } = useAppraisals();
  const { clients } = useClients();
  const { properties } = useProperties();

  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [propertyId, setPropertyId] = useState('');
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('Determinação de Valor de Mercado');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProperties = properties.filter((p) => {
    if (!clientId) return false;
    return p.clientLinks && p.clientLinks.some((link) => link.clientId === clientId);
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !propertyId || !purpose.trim()) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await startDirectAppraisal({
        clientId,
        propertyId,
        title: title.trim() || `Laudo Direto — ${purpose.trim()}`,
        purpose: purpose.trim(),
        notes: notes.trim() || undefined,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar laudo direto.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="direct-appraisal-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/60 backdrop-blur-xs p-4"
    >
      <div
        id="direct-appraisal-modal-container"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#0B3D2E]/20 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3D2E] text-white">
          <div className="flex items-center gap-2.5">
            <PlusCircle className="w-5 h-5 text-[#78C89A]" />
            <h2 className="text-lg font-bold">Iniciar Laudo Direto</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-[#0B3D2E] bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#0B3D2E]" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Cliente Cadastrado *
            </label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setPropertyId('');
              }}
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
              required
            >
              <option value="">Selecione o cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {getClientDisplayName(c)} ({getClientDocumentFormatted(c)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Imóvel Vinculado *
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              disabled={!clientId || filteredProperties.length === 0}
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A] disabled:opacity-50"
              required
            >
              <option value="">
                {!clientId
                  ? 'Selecione um cliente primeiro...'
                  : filteredProperties.length === 0
                  ? 'Nenhum imóvel vinculado a este cliente'
                  : 'Selecione o imóvel...'}
              </option>
              {filteredProperties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.propertyType === 'rural' ? 'Rural' : 'Urbano'} ({p.city}/{p.state})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Título do Laudo (Opcional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Laudo Pericial — Fazenda Boa Vista"
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Finalidade da Avaliação *
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ex: Garantia Bancária, Partilha, Alienação Fiduciária"
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Observações Iniciais
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notas técnicas preliminares..."
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#0B3D2E]/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#0B3D2E]/80 hover:text-[#0B3D2E]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <FileCheck className="w-3.5 h-3.5 text-[#78C89A]" />
                  Iniciar Elaboração do Laudo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
