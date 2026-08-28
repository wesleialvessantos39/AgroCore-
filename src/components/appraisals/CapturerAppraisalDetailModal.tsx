/**
 * Modal de Visualização Sanitizada de Laudo para o Captador
 * OE-004.002 — AgroCore
 *
 * Proteção de sigilo técnico pericial: exibe apenas metadados de andamento operacional,
 * protocolo, cliente, imóvel e estágio negocial, sem expor cálculos periciais ou amostras.
 */

import React, { useEffect, useState } from 'react';
import { ShieldCheck, X, Calendar, User, Building2, CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppraisals } from '../../appraisals/useAppraisals';
import { AppraisalCapturerProjection } from '../../types/appraisal';
import { useClients } from '../../clients/useClients';
import { useProperties } from '../../properties/useProperties';
import { getClientDisplayName } from '../../clients/clientHelpers';
import { getAppraisalStatusLabel } from '../../appraisals/appraisalStateMachine';

interface CapturerAppraisalDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly appraisalId: string | null;
}

export function CapturerAppraisalDetailModal({
  isOpen,
  onClose,
  appraisalId,
}: CapturerAppraisalDetailModalProps) {
  const { getAppraisalCapturerProjection } = useAppraisals();
  const { clients } = useClients();
  const { properties } = useProperties();

  const [projection, setProjection] = useState<AppraisalCapturerProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && appraisalId) {
      loadProjection();
    }
  }, [isOpen, appraisalId]);

  const loadProjection = async () => {
    if (!appraisalId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAppraisalCapturerProjection(appraisalId);
      if (!data) {
        setError('Não foi possível carregar a projeção do laudo ou acesso não autorizado.');
      } else {
        setProjection(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar detalhes do laudo.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const client = projection ? clients.find((c) => c.id === projection.clientId) : null;
  const property = projection ? properties.find((p) => p.id === projection.propertyId) : null;

  return (
    <div
      id="capturer-appraisal-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B3D2E]/60 backdrop-blur-xs p-4"
    >
      <div
        id="capturer-appraisal-modal-container"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#0B3D2E]/20 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0B3D2E] text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#78C89A]" />
            <h2 className="text-lg font-bold">Status do Laudo (Visão Captador)</h2>
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
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[#0B3D2E]">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[#0B3D2E] bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#0B3D2E]" />
              <span>{error}</span>
            </div>
          ) : projection ? (
            <>
              {/* Protocolo e Estágio */}
              <div className="p-4 rounded-xl bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#0B3D2E]/60 tracking-wider">
                    Protocolo Operacional
                  </span>
                  <div className="text-sm font-bold text-[#0B3D2E]">{projection.protocol}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#0B3D2E] text-white">
                  <Clock className="w-3.5 h-3.5 text-[#78C89A]" />
                  {getAppraisalStatusLabel(projection.status)}
                </span>
              </div>

              {/* Informações Comerciais */}
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[#0B3D2E]/10 bg-white">
                  <User className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#0B3D2E]">Cliente</div>
                    <div className="text-[#0B3D2E]/80">{client ? getClientDisplayName(client) : projection.clientId}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[#0B3D2E]/10 bg-white">
                  <Building2 className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#0B3D2E]">Imóvel Avaliado</div>
                    <div className="text-[#0B3D2E]/80">
                      {property ? `${property.name} (${property.city}/${property.state})` : projection.propertyId}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-[#0B3D2E]/10 bg-white">
                  <Calendar className="w-4 h-4 text-[#0B3D2E] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[#0B3D2E]">Data de Início da Elaboração</div>
                    <div className="text-[#0B3D2E]/80">
                      {new Date(projection.operationalDates.createdAt).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Nota de Governança Pericial */}
              <div className="p-3 rounded-lg bg-[#0B3D2E]/5 border border-[#0B3D2E]/10 text-[11px] text-[#0B3D2E]/70 leading-relaxed">
                <span className="font-semibold text-[#0B3D2E]">Sigilo Técnico Pericial: </span>
                Os cálculos de avaliação, inferências estatísticas e relatórios metodológicos internos são restritos à equipe técnica pericial até a emissão homologada do laudo.
              </div>
            </>
          ) : null}
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
