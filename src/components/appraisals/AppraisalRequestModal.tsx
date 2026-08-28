/**
 * Modal de Criação de Solicitação de Laudo pelo Captador / Operador
 * Módulo 004 — AgroCore
 */

import React, { useState } from 'react';
import { Send, X, AlertCircle, Plus, Trash2, FileText, Calendar } from 'lucide-react';
import { useAppraisals } from '../../appraisals/useAppraisals';
import { useClients } from '../../clients/useClients';
import { useProperties } from '../../properties/useProperties';
import { getClientDisplayName, getClientDocumentFormatted } from '../../clients/clientHelpers';
import { AppraisalDocumentReference } from '../../types/appraisal';

interface AppraisalRequestModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSuccess?: () => void;
  readonly defaultClientId?: string;
  readonly defaultPropertyId?: string;
}

export function AppraisalRequestModal({
  isOpen,
  onClose,
  onSuccess,
  defaultClientId,
  defaultPropertyId,
}: AppraisalRequestModalProps) {
  const { createRequest } = useAppraisals();
  const { clients } = useClients();
  const { properties } = useProperties();

  const [clientId, setClientId] = useState(defaultClientId || (clients[0]?.id || ''));
  const [propertyId, setPropertyId] = useState(defaultPropertyId || '');
  const [purpose, setPurpose] = useState('Garantia Bancária / Financiamento Rural');
  const [desiredDeadline, setDesiredDeadline] = useState('');
  const [notes, setNotes] = useState('');
  const [docs, setDocs] = useState<Array<{ displayName: string; category: AppraisalDocumentReference['category'] }>>([]);
  const [newDocName, setNewDocName] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<AppraisalDocumentReference['category']>('registration_certificate');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtrar imóveis vinculados ao cliente
  const filteredProperties = properties.filter((p) => {
    if (!clientId) return false;
    return p.clientLinks && p.clientLinks.some((link) => link.clientId === clientId);
  });

  if (!isOpen) return null;

  const handleAddDoc = () => {
    if (!newDocName.trim()) return;
    setDocs([...docs, { displayName: newDocName.trim(), category: newDocCategory }]);
    setNewDocName('');
  };

  const handleRemoveDoc = (index: number) => {
    setDocs(docs.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !propertyId || !purpose.trim()) {
      setError('Preencha o cliente, o imóvel vinculado e a finalidade da avaliação.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const documentReferences: AppraisalDocumentReference[] = docs.map((d, i) => ({
        id: `doc_initial_${i}`,
        organizationId: '',
        sourceEntity: 'appraisal_request',
        sourceEntityId: '',
        category: d.category,
        version: 1,
        displayName: d.displayName,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        authorUserId: '',
        createdAt: new Date().toISOString(),
        accessStatus: 'available',
      }));

      await createRequest({
        clientId,
        propertyId,
        purpose: purpose.trim(),
        desiredDeadline: desiredDeadline || undefined,
        notes: notes.trim() || undefined,
        documentReferences,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cadastrar solicitação de laudo.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="appraisal-request-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        id="appraisal-request-modal-container"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#0B3D2E]/20 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3D2E] text-white">
          <div className="flex items-center gap-2.5">
            <Send className="w-5 h-5 text-[#78C89A]" />
            <h2 className="text-lg font-bold">Nova Solicitação de Laudo</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
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
              Finalidade da Avaliação *
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ex: Financiamento Rural, Garantia Bancária, Partilha"
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Prazo Desejado (Opcional)
            </label>
            <input
              type="date"
              value={desiredDeadline}
              onChange={(e) => setDesiredDeadline(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Observações Comerciais e Requisitos
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Descreva detalhes adicionais ou instruções do produtor..."
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
            />
          </div>

          {/* Anexos Iniciais de Referência */}
          <div className="pt-2 border-t border-[#0B3D2E]/10 space-y-2">
            <label className="block text-xs font-bold text-[#0B3D2E]">
              Documentos Preliminares de Referência
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Ex: Matrícula Atualizada 12345.pdf"
                className="flex-1 px-3 py-1.5 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white"
              />
              <select
                value={newDocCategory}
                onChange={(e) => setNewDocCategory(e.target.value as AppraisalDocumentReference['category'])}
                className="px-2 py-1.5 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white"
              >
                <option value="registration_certificate">Matrícula</option>
                <option value="car_receipt">Recibo CAR</option>
                <option value="topography_map">Topografia</option>
                <option value="photo_report">Relatório de Fotos</option>
                <option value="art_rrt">ART/RRT</option>
                <option value="other">Outros</option>
              </select>
              <button
                type="button"
                onClick={handleAddDoc}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0B3D2E] rounded-lg hover:bg-[#0B3D2E]/90"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {docs.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {docs.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[#0B3D2E]" />
                      <span className="font-medium text-[#0B3D2E]">{doc.displayName}</span>
                      <span className="text-[10px] text-[#0B3D2E]/60 uppercase">({doc.category})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(idx)}
                      className="text-[#0B3D2E]/70 hover:text-[#0B3D2E] p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              <Send className="w-3.5 h-3.5 text-[#78C89A]" />
              {submitting ? 'Enviando...' : 'Enviar para Fila Operacional'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
