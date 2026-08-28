/**
 * Modal de Triagem e Atribuição Técnica da Fila de Solicitações
 * Módulo 004 — AgroCore
 */

import React, { useState } from 'react';
import { UserCheck, X, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppraisals } from '../../appraisals/useAppraisals';
import { useOrganizationMembers } from '../../hooks/useOrganizationMembers';
import { AppraisalRequest } from '../../types/appraisal';

interface AppraisalRequestTriageModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly request: AppraisalRequest | null;
  readonly onSuccess?: () => void;
}

export function AppraisalRequestTriageModal({
  isOpen,
  onClose,
  request,
  onSuccess,
}: AppraisalRequestTriageModalProps) {
  const { assignAppraisalRequest } = useAppraisals();
  const { members } = useOrganizationMembers();

  const [selectedDesignerId, setSelectedDesignerId] = useState(request?.assignedToUserId || '');
  const [transferReason, setTransferReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !request) return null;

  // Filtrar profissionais aptos para atribuição técnica (projetistas, administradores, donos)
  const technicalMembers = members.filter(
    (m) =>
      m.isActive &&
      (m.organizationRole === 'project_designer' ||
        m.organizationRole === 'manager' ||
        m.organizationRole === 'owner')
  );

  const isReassignment = !!request.assignedToUserId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesignerId) {
      setError('Selecione um profissional para assumir a responsabilidade técnica.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await assignAppraisalRequest({
        requestId: request.id,
        designerUserId: selectedDesignerId,
        transferReason: isReassignment ? transferReason.trim() || undefined : undefined,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na atribuição técnica da solicitação.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="appraisal-request-triage-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        id="appraisal-request-triage-container"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#0B3D2E]/20 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3D2E] text-white">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-[#78C89A]" />
            <h2 className="text-lg font-bold">
              {isReassignment ? 'Reatribuir Responsável Técnico' : 'Atribuição Técnica'}
            </h2>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-[#0B3D2E]/5 rounded-xl p-3 border border-[#0B3D2E]/10 space-y-1 text-xs">
            <div>
              <span className="font-semibold text-[#0B3D2E]/70">Finalidade: </span>
              <span className="font-bold text-[#0B3D2E]">{request.purpose}</span>
            </div>
            <div>
              <span className="font-semibold text-[#0B3D2E]/70">Solicitado por: </span>
              <span className="text-[#0B3D2E]">{request.requestedByUserId}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-[#0B3D2E] bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#0B3D2E]" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
              Responsável Técnico (Projetista) *
            </label>
            <select
              value={selectedDesignerId}
              onChange={(e) => setSelectedDesignerId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
              required
            >
              <option value="">Selecione o profissional...</option>
              {technicalMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.email}) — {m.organizationRole}
                </option>
              ))}
            </select>
          </div>

          {isReassignment && (
            <div>
              <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                Motivo da Reatribuição (opcional)
              </label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Ex: Redistribuição de carga de trabalho"
                className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
              />
            </div>
          )}

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
                  Atribuindo...
                </>
              ) : (
                'Confirmar Atribuição'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
