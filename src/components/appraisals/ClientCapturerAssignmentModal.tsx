/**
 * Modal de Gestão de Vínculo Cliente-Captador
 * Módulo 002 & Módulo 004 — AgroCore
 */

import React, { useState, useEffect } from 'react';
import { UserCheck, X, AlertCircle, RefreshCw, UserX, ArrowRightLeft } from 'lucide-react';
import { useCapturerAssignment } from '../../hooks/useCapturerAssignment';
import { useOrganizationMembers } from '../../hooks/useOrganizationMembers';
import { ClientCapturerAssignment } from '../../types/clientCapturerAssignment';

interface ClientCapturerAssignmentModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly clientId: string;
  readonly clientName: string;
  readonly onAssignmentChanged?: () => void;
}

export function ClientCapturerAssignmentModal({
  isOpen,
  onClose,
  clientId,
  clientName,
  onAssignmentChanged,
}: ClientCapturerAssignmentModalProps) {
  const {
    getActiveAssignment,
    listAssignmentsByClient,
    assignCapturer,
    transferCapturer,
    terminateAssignment,
  } = useCapturerAssignment();
  const { members } = useOrganizationMembers();

  const [activeAssignment, setActiveAssignment] = useState<ClientCapturerAssignment | null>(null);
  const [history, setHistory] = useState<readonly ClientCapturerAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<'view' | 'assign' | 'transfer' | 'terminate'>('view');
  const [selectedCapturerId, setSelectedCapturerId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Filtrar membros ativos que possuem o papel estrito de captador comercial
  const capturerMembers = members.filter(
    (m) => m.isActive && m.organizationRole === 'capturer'
  );

  useEffect(() => {
    if (isOpen && clientId) {
      loadData();
    }
  }, [isOpen, clientId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const active = await getActiveAssignment(clientId);
      const list = await listAssignmentsByClient(clientId);
      setActiveAssignment(active);
      setHistory(list);
      setActionType('view');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados do captador.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCapturerId) {
      setError('Selecione um captador.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (actionType === 'assign') {
        await assignCapturer({
          clientId,
          capturerUserId: selectedCapturerId,
          isPrimary: true,
        });
      } else if (actionType === 'transfer') {
        if (!reason.trim()) {
          setError('Informe o motivo da transferência.');
          setSubmitting(false);
          return;
        }
        await transferCapturer({
          clientId,
          newCapturerUserId: selectedCapturerId,
          transferReason: reason.trim(),
        });
      }
      await loadData();
      if (onAssignmentChanged) onAssignmentChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na operação de atribuição.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminate = async () => {
    if (!activeAssignment) return;
    setSubmitting(true);
    setError(null);
    try {
      await terminateAssignment({
        clientId,
        assignmentId: activeAssignment.id,
        reason: reason.trim() || undefined,
      });
      await loadData();
      if (onAssignmentChanged) onAssignmentChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao encerrar vínculo.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const getMemberName = (userId: string) => {
    const m = members.find((item) => item.userId === userId);
    return m ? `${m.name} (${m.email})` : userId;
  };

  return (
    <div
      id="capturer-assignment-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        id="capturer-assignment-modal-container"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#0B3D2E]/20 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3D2E] text-white">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-[#78C89A]" />
            <h2 className="text-lg font-bold">Vínculo Comercial do Captador</h2>
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
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div className="bg-[#0B3D2E]/5 rounded-xl p-4 border border-[#0B3D2E]/10">
            <span className="text-xs text-[#0B3D2E]/70 font-semibold block">Cliente Selecionado</span>
            <span className="text-sm font-bold text-[#0B3D2E]">{clientName}</span>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-xs text-[#0B3D2E] bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#0B3D2E]" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8 text-[#0B3D2E]">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {/* Vínculo Ativo Atual */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3D2E]/80">
                  Captador Atualmente Vinculado
                </h3>
                {activeAssignment ? (
                  <div className="p-4 rounded-xl border border-[#0B3D2E]/20 bg-white shadow-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm text-[#0B3D2E]">
                          {getMemberName(activeAssignment.capturerUserId)}
                        </div>
                        <div className="text-xs text-[#0B3D2E]/60 mt-0.5">
                          Vinculado em: {new Date(activeAssignment.startedAt).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#0B3D2E] text-white">
                        Ativo
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[#0B3D2E]/10">
                      <button
                        type="button"
                        onClick={() => {
                          setActionType('transfer');
                          setSelectedCapturerId('');
                          setReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] bg-[#0B3D2E]/10 rounded-lg hover:bg-[#0B3D2E]/20 transition-colors"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Transferir Carteira
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActionType('terminate');
                          setReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] bg-[#0B3D2E]/10 rounded-lg hover:bg-[#0B3D2E]/20 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Encerrar Vínculo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-[#0B3D2E]/30 bg-white text-center">
                    <p className="text-xs text-[#0B3D2E]/70 mb-3">
                      Este cliente não possui captador ativo no momento.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActionType('assign');
                        setSelectedCapturerId(capturerMembers[0]?.userId || '');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-lg hover:bg-[#0B3D2E]/90 transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#78C89A]" />
                      Atribuir Captador
                    </button>
                  </div>
                )}
              </div>

              {/* Formulários de Ação (Atribuir / Transferir / Encerrar) */}
              {(actionType === 'assign' || actionType === 'transfer') && (
                <form onSubmit={handleAssign} className="p-4 rounded-xl border border-[#0B3D2E]/30 bg-[#0B3D2E]/5 space-y-4">
                  <h4 className="text-xs font-bold text-[#0B3D2E]">
                    {actionType === 'assign' ? 'Novo Vínculo de Captador' : 'Transferência de Carteira Comercial'}
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                      Selecionar Captador
                    </label>
                    <select
                      value={selectedCapturerId}
                      onChange={(e) => setSelectedCapturerId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
                      required
                    >
                      <option value="">Selecione um profissional...</option>
                      {capturerMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  {actionType === 'transfer' && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                        Motivo da Transferência
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ex: Reorganização regional de carteira"
                        className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white focus:ring-2 focus:ring-[#78C89A]"
                        required
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionType('view')}
                      className="px-3 py-1.5 text-xs text-[#0B3D2E]/70 hover:text-[#0B3D2E]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-lg hover:bg-[#0B3D2E]/90 disabled:opacity-50"
                    >
                      {submitting ? 'Salvando...' : 'Confirmar Vínculo'}
                    </button>
                  </div>
                </form>
              )}

              {actionType === 'terminate' && (
                <div className="p-4 rounded-xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/5 space-y-3">
                  <h4 className="text-xs font-bold text-[#0B3D2E]">Confirmar Encerramento de Vínculo</h4>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B3D2E] mb-1">
                      Motivo do Encerramento (opcional)
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex: Fim do contrato comercial"
                      className="w-full px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-lg bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActionType('view')}
                      className="px-3 py-1.5 text-xs text-[#0B3D2E]/70 hover:text-[#0B3D2E]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleTerminate}
                      disabled={submitting}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-lg hover:bg-[#0B3D2E]/90 disabled:opacity-50"
                    >
                      {submitting ? 'Encerrando...' : 'Encerrar Vínculo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Histórico */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B3D2E]/80">
                    Histórico de Vínculos
                  </h3>
                  <div className="divide-y divide-[#0B3D2E]/10 border border-[#0B3D2E]/15 rounded-xl overflow-hidden bg-white text-xs">
                    {history.map((item) => (
                      <div key={item.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-[#0B3D2E]">
                            {getMemberName(item.capturerUserId)}
                          </div>
                          <div className="text-[11px] text-[#0B3D2E]/60">
                            {new Date(item.startedAt).toLocaleDateString('pt-BR')}
                            {item.endedAt ? ` até ${new Date(item.endedAt).toLocaleDateString('pt-BR')}` : ' (Atual)'}
                          </div>
                          {item.transferReason && (
                            <div className="text-[10px] text-[#0B3D2E]/70 italic mt-0.5">
                              Motivo: {item.transferReason}
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'active'
                              ? 'bg-[#0B3D2E] text-white'
                              : 'bg-[#0B3D2E]/10 text-[#0B3D2E]/60'
                          }`}
                        >
                          {item.status === 'active' ? 'Ativo' : 'Encerrado'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0B3D2E]/5 border-t border-[#0B3D2E]/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#0B3D2E] bg-white border border-[#0B3D2E]/20 rounded-xl hover:bg-[#0B3D2E]/5 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
