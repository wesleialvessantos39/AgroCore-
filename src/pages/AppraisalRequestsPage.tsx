/**
 * Página de Solicitações de Laudo e Fila Operacional
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Suporta:
 * 1. Cadastro de solicitações pelo Captador
 * 2. Fila Operacional com filtros e busca
 * 3. Triagem e Atribuição Técnica a Projetistas
 * 4. Conversão Atômica em Laudo de Avaliação em Elaboração
 * 5. Visualização segura e rastreabilidade
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileCheck,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
  RefreshCw,
  Send,
  UserCheck,
  Building2,
  User,
  Calendar,
  FileText,
  Eye,
} from 'lucide-react';
import { useAppraisals } from '../appraisals/useAppraisals';
import { useAuthorization } from '../authorization/useAuthorization';
import { useProperties } from '../properties/useProperties';
import { useClients } from '../clients/useClients';
import { getClientDisplayName } from '../clients/clientHelpers';
import { getAppraisalRequestStatusLabel } from '../appraisals/appraisalRequestStateMachine';
import { AppraisalRequest, AppraisalRequestStatus } from '../types/appraisal';
import { AppraisalRequestModal } from '../components/appraisals/AppraisalRequestModal';
import { AppraisalRequestTriageModal } from '../components/appraisals/AppraisalRequestTriageModal';
import { CapturerAppraisalDetailModal } from '../components/appraisals/CapturerAppraisalDetailModal';
import { AppraisalNotificationsPopover } from '../components/appraisals/AppraisalNotificationsPopover';

const VALID_REQUEST_STATUSES: readonly AppraisalRequestStatus[] = [
  'submitted',
  'received',
  'awaiting_assignment',
  'assigned',
  'awaiting_documents',
  'accepted',
  'declined',
  'converted',
  'cancelled',
  'completed',
];

function parseAppraisalRequestStatusFilter(value: string): AppraisalRequestStatus | 'all' {
  if (value === 'all') return 'all';
  const found = VALID_REQUEST_STATUSES.find((s) => s === value);
  return found || 'all';
}

export interface AppraisalRequestsPageProps {
  readonly initialAction?: 'create';
}

export function AppraisalRequestsPage({ initialAction }: AppraisalRequestsPageProps = {}) {
  const {
    requests,
    status,
    error,
    requestsFilters,
    setRequestsFilters,
    refreshRequests,
    convertRequestToAppraisal,
  } = useAppraisals();

  const { requestId: routeRequestId } = useParams<{ requestId?: string }>();
  const navigate = useNavigate();

  const { can, effectiveRole } = useAuthorization();
  const { properties } = useProperties();
  const { clients } = useClients();

  const isCapturer = effectiveRole === 'capturer';
  const canCreateRequest = can('appraisal_requests:create') || isCapturer;
  const canTriage = can('appraisal_requests:assign') || effectiveRole === 'owner' || effectiveRole === 'manager';
  const canConvert = can('appraisals:create') || effectiveRole === 'project_designer' || effectiveRole === 'manager' || effectiveRole === 'owner';

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialAction === 'create');
  const [triageRequest, setTriageRequest] = useState<AppraisalRequest | null>(null);
  const [viewingAppraisalId, setViewingAppraisalId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (initialAction === 'create') {
      setIsCreateModalOpen(true);
    }
  }, [initialAction]);

  useEffect(() => {
    if (routeRequestId && requests.length > 0) {
      const match = requests.find((r) => r.id === routeRequestId);
      if (match) {
        setTriageRequest(match);
      }
    }
  }, [routeRequestId, requests]);

  const handleConvert = async (requestId: string) => {
    setConvertingId(requestId);
    setActionError(null);
    try {
      await convertRequestToAppraisal({
        requestId,
      });
      await refreshRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao converter solicitação em laudo.';
      setActionError(msg);
    } finally {
      setConvertingId(null);
    }
  };

  const getStatusBadge = (requestStatus: AppraisalRequestStatus) => {
    switch (requestStatus) {
      case 'submitted':
      case 'awaiting_assignment':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20">
            <Clock className="w-3.5 h-3.5 text-[#0B3D2E]" />
            {getAppraisalRequestStatusLabel(requestStatus)}
          </span>
        );
      case 'assigned':
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#78C89A]/20 text-[#0B3D2E] border border-[#78C89A]/40">
            <UserCheck className="w-3.5 h-3.5 text-[#0B3D2E]" />
            {getAppraisalRequestStatusLabel(requestStatus)}
          </span>
        );
      case 'converted':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E] text-white border border-[#0B3D2E]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#78C89A]" />
            {getAppraisalRequestStatusLabel(requestStatus)}
          </span>
        );
      case 'declined':
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E]/70 border border-[#0B3D2E]/25">
            <XCircle className="w-3.5 h-3.5 text-[#0B3D2E]/60" />
            {getAppraisalRequestStatusLabel(requestStatus)}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/5 text-[#0B3D2E]">
            {getAppraisalRequestStatusLabel(requestStatus)}
          </span>
        );
    }
  };

  const getClientName = (clientId: string) => {
    const c = clients.find((item) => item.id === clientId);
    return c ? getClientDisplayName(c) : clientId;
  };

  const getPropertyName = (propertyId: string) => {
    const p = properties.find((item) => item.id === propertyId);
    return p ? `${p.name} (${p.city}/${p.state})` : propertyId;
  };

  return (
    <div className="space-y-6" id="appraisal-requests-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[#0B3D2E]" />
            <h1 className="text-2xl font-bold text-[#0B3D2E]">
              {isCapturer ? 'Minhas Solicitações de Laudos' : 'Fila Operacional de Solicitações'}
            </h1>
          </div>
          <p className="text-sm text-[#0B3D2E]/70 mt-1">
            {isCapturer
              ? 'Acompanhe as solicitações cadastradas e o andamento técnico pericial.'
              : 'Gerencie a triagem, atribuição de responsáveis técnicos e conversão em laudos.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AppraisalNotificationsPopover />

          <button
            type="button"
            onClick={() => refreshRequests()}
            className="p-2.5 text-[#0B3D2E] bg-white border border-[#0B3D2E]/20 rounded-xl hover:bg-[#0B3D2E]/5 transition-colors focus:ring-2 focus:ring-[#78C89A]"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
          </button>

          {canCreateRequest && (
            <button
              type="button"
              id="new-appraisal-request-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4 text-[#78C89A]" />
              Nova Solicitação
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 p-3 text-xs text-[#0B3D2E] bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0 text-[#0B3D2E]" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filtros e Busca */}
      <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B3D2E]/40" />
            <input
              type="text"
              placeholder="Buscar por finalidade ou notas..."
              value={requestsFilters.search || ''}
              onChange={(e) => setRequestsFilters({ search: e.target.value })}
              className="w-full pl-9 pr-4 py-2 text-xs border border-[#0B3D2E]/20 rounded-xl focus:ring-2 focus:ring-[#78C89A] bg-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[#0B3D2E]/60 shrink-0" />
            <select
              value={requestsFilters.status || 'all'}
              onChange={(e) =>
                setRequestsFilters({
                  status: parseAppraisalRequestStatusFilter(e.target.value),
                })
              }
              className="w-full sm:w-auto px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-xl bg-white focus:ring-2 focus:ring-[#78C89A]"
            >
              <option value="all">Todos os Status</option>
              <option value="submitted">Submetida</option>
              <option value="assigned">Atribuída / Triada</option>
              <option value="accepted">Aceita</option>
              <option value="converted">Convertida em Laudo</option>
              <option value="declined">Recusada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Solicitações */}
      {status === 'loading' && requests.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-[#0B3D2E]">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
          <AlertCircle className="w-8 h-8 text-[#0B3D2E]/70 mx-auto" />
          <h3 className="text-sm font-bold text-[#0B3D2E]">Falha ao carregar solicitações</h3>
          <p className="text-xs text-[#0B3D2E]/70 max-w-md mx-auto">{error}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-12 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-4">
          <FileCheck className="w-10 h-10 text-[#0B3D2E]/40 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-[#0B3D2E]">Nenhuma solicitação encontrada</h3>
            <p className="text-xs text-[#0B3D2E]/60 mt-1 max-w-sm mx-auto">
              {isCapturer
                ? 'Você ainda não cadastrou solicitações de laudo para os seus clientes vinculados.'
                : 'A fila operacional está limpa no momento.'}
            </p>
          </div>
          {canCreateRequest && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors"
            >
              <Plus className="w-4 h-4 text-[#78C89A]" />
              Cadastrar Nova Solicitação
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              id={`request-item-${req.id}`}
              className="p-5 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-xs hover:border-[#0B3D2E]/30 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#0B3D2E]">{req.purpose}</span>
                    {getStatusBadge(req.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#0B3D2E]/70 flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#0B3D2E]" />
                      {getClientName(req.clientId)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#0B3D2E]" />
                      {getPropertyName(req.propertyId)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#0B3D2E]" />
                      {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Ações por Perfil */}
                <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                  {/* Visualização de Laudo Convertido */}
                  {req.resultingAppraisalId && (
                    <button
                      type="button"
                      onClick={() => setViewingAppraisalId(req.resultingAppraisalId || null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B3D2E] bg-[#0B3D2E]/10 rounded-xl hover:bg-[#0B3D2E]/20 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Visualizar Laudo
                    </button>
                  )}

                  {/* Triagem / Atribuição (Gestores / Admins) */}
                  {canTriage && req.status !== 'converted' && req.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setTriageRequest(req)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B3D2E] bg-white border border-[#0B3D2E]/20 rounded-xl hover:bg-[#0B3D2E]/5 transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#78C89A]" />
                      {req.assignedToUserId ? 'Reatribuir RT' : 'Atribuir RT'}
                    </button>
                  )}

                  {/* Conversão Atômica em Laudo (Projetista / Gestor) */}
                  {canConvert &&
                    (req.status === 'assigned' || req.status === 'accepted' || req.status === 'submitted') && (
                      <button
                        type="button"
                        disabled={convertingId === req.id}
                        onClick={() => handleConvert(req.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors disabled:opacity-50"
                      >
                        {convertingId === req.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Iniciando...
                          </>
                        ) : (
                          <>
                            <ArrowRightCircle className="w-3.5 h-3.5 text-[#78C89A]" />
                            Iniciar Laudo
                          </>
                        )}
                      </button>
                    )}
                </div>
              </div>

              {/* Detalhes Adicionais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#0B3D2E]/10 text-xs">
                <div>
                  <span className="font-semibold text-[#0B3D2E]/70 block">Responsável Técnico:</span>
                  <span className="text-[#0B3D2E] font-medium">
                    {req.assignedToUserId ? req.assignedToUserId : 'Aguardando atribuição na fila'}
                  </span>
                </div>
                {req.notes && (
                  <div>
                    <span className="font-semibold text-[#0B3D2E]/70 block">Observações:</span>
                    <span className="text-[#0B3D2E]/80">{req.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      <AppraisalRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          if (initialAction === 'create') {
            navigate('/solicitacoes-de-laudo');
          }
        }}
        onSuccess={() => {
          if (initialAction === 'create') {
            navigate('/solicitacoes-de-laudo');
          }
          refreshRequests();
        }}
      />

      <AppraisalRequestTriageModal
        isOpen={!!triageRequest}
        onClose={() => {
          setTriageRequest(null);
          if (routeRequestId) {
            navigate('/solicitacoes-de-laudo');
          }
        }}
        request={triageRequest}
        onSuccess={() => {
          if (routeRequestId) {
            navigate('/solicitacoes-de-laudo');
          }
          refreshRequests();
        }}
      />

      <CapturerAppraisalDetailModal
        isOpen={!!viewingAppraisalId}
        onClose={() => setViewingAppraisalId(null)}
        appraisalId={viewingAppraisalId}
      />
    </div>
  );
}
