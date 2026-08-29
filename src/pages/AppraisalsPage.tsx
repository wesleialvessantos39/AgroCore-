/**
 * Página Principal de Laudos de Avaliação
 * Módulo 004 — Laudos de Avaliação de Imóveis Rurais e Urbanos
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Filter,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileCheck,
  Building2,
  User,
  MapPin,
  RefreshCw,
  Eye,
  PlusCircle,
} from 'lucide-react';
import { useAppraisals } from '../appraisals/useAppraisals';
import { useAuthorization } from '../authorization/useAuthorization';
import { useProperties } from '../properties/useProperties';
import { useClients } from '../clients/useClients';
import { getClientDisplayName } from '../clients/clientHelpers';
import { getAppraisalStatusLabel } from '../appraisals/appraisalStateMachine';
import { AppraisalOrigin, AppraisalStatus } from '../types/appraisal';
import { DirectAppraisalModal } from '../components/appraisals/DirectAppraisalModal';
import { CapturerAppraisalDetailModal } from '../components/appraisals/CapturerAppraisalDetailModal';
import { AppraisalNotificationsPopover } from '../components/appraisals/AppraisalNotificationsPopover';
import { AppraisalDossierWorkspace } from '../components/appraisals/AppraisalDossierWorkspace';
import { useAuth } from '../auth/useAuth';
import { Appraisal } from '../types/appraisal';

const VALID_APPRAISAL_STATUSES: readonly AppraisalStatus[] = [
  'draft',
  'data_collection',
  'visit_to_schedule',
  'visit_scheduled',
  'fieldwork',
  'analysis',
  'awaiting_information',
  'review',
  'ready_to_issue',
  'issued',
  'superseded',
  'cancelled',
];

function parseAppraisalStatusFilter(value: string): AppraisalStatus | 'all' {
  if (value === 'all') return 'all';
  const found = VALID_APPRAISAL_STATUSES.find((s) => s === value);
  return found || 'all';
}

function parsePropertyTypeFilter(value: string): 'rural' | 'urban' | 'all' {
  if (value === 'rural' || value === 'urban' || value === 'all') {
    return value;
  }
  return 'all';
}

export function AppraisalsPage() {
  const {
    appraisals,
    status,
    error,
    appraisalsFilters,
    setAppraisalsFilters,
    refreshAppraisals,
    getAppraisalById,
    getTechnicalDossier,
    saveTechnicalDossier,
    listMarketSamples,
    saveMarketSample,
    deleteMarketSample,
    getCalculationSection,
    saveCalculationSection,
    getNormativeSection,
    saveNormativeSection,
    listIssuedVersions,
    issueAppraisalVersion,
  } = useAppraisals();

  const { session } = useAuth();
  const { can, effectiveRole } = useAuthorization();
  const { properties } = useProperties();
  const { clients } = useClients();

  const { appraisalId: routeAppraisalId } = useParams<{ appraisalId?: string }>();
  const navigate = useNavigate();

  const isCapturer = effectiveRole === 'capturer';
  const canStartDirect =
    can('appraisals:create') ||
    effectiveRole === 'project_designer' ||
    effectiveRole === 'manager' ||
    effectiveRole === 'owner';

  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [capturerDetailId, setCapturerDetailId] = useState<string | null>(null);
  const [activeDossierAppraisal, setActiveDossierAppraisal] = useState<Appraisal | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState(false);

  useEffect(() => {
    if (routeAppraisalId && !activeDossierAppraisal) {
      handleOpenDossier(routeAppraisalId);
    }
  }, [routeAppraisalId]);

  const handleOpenDossier = async (appraisalId: string) => {
    setIsLoadingDossier(true);
    try {
      const fullAppraisal = await getAppraisalById(appraisalId);
      if (fullAppraisal) {
        setActiveDossierAppraisal(fullAppraisal);
      }
    } catch (err) {
      console.error('Falha ao abrir laudo para edição:', err);
    } finally {
      setIsLoadingDossier(false);
    }
  };

  if (activeDossierAppraisal) {
    return (
      <AppraisalDossierWorkspace
        appraisal={activeDossierAppraisal}
        onBack={() => {
          setActiveDossierAppraisal(null);
          if (routeAppraisalId) {
            navigate('/laudos');
          }
          refreshAppraisals();
        }}
        currentUserId={session?.user?.id || 'system'}
        currentUserRole={effectiveRole}
        getTechnicalDossier={getTechnicalDossier}
        saveTechnicalDossier={saveTechnicalDossier}
        listMarketSamples={listMarketSamples}
        saveMarketSample={saveMarketSample}
        deleteMarketSample={deleteMarketSample}
        getCalculationSection={getCalculationSection}
        saveCalculationSection={saveCalculationSection}
        getNormativeSection={getNormativeSection}
        saveNormativeSection={saveNormativeSection}
        listIssuedVersions={listIssuedVersions}
        issueAppraisalVersion={issueAppraisalVersion}
      />
    );
  }

  const getStatusBadge = (appStatus: AppraisalStatus) => {
    switch (appStatus) {
      case 'draft':
      case 'data_collection':
      case 'analysis':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E] border border-[#0B3D2E]/20">
            <Clock className="w-3.5 h-3.5 text-[#0B3D2E]" />
            {getAppraisalStatusLabel(appStatus)}
          </span>
        );
      case 'ready_to_issue':
      case 'issued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E] text-white border border-[#0B3D2E]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#78C89A]" />
            {getAppraisalStatusLabel(appStatus)}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/10 text-[#0B3D2E]/70 border border-[#0B3D2E]/25">
            <XCircle className="w-3.5 h-3.5 text-[#0B3D2E]/60" />
            {getAppraisalStatusLabel(appStatus)}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0B3D2E]/5 text-[#0B3D2E]">
            {getAppraisalStatusLabel(appStatus)}
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
    <div className="space-y-6" id="appraisals-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#0B3D2E]" />
            <h1 className="text-2xl font-bold text-[#0B3D2E]">
              {isCapturer ? 'Laudos em Andamento (Carteira)' : 'Laudos de Avaliação'}
            </h1>
          </div>
          <p className="text-sm text-[#0B3D2E]/70 mt-1">
            {isCapturer
              ? 'Acompanhe a elaboração pericial dos laudos vinculados aos seus clientes.'
              : 'Gerencie elaboração pericial, conformidade normativa NBR 14653 e emissão.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AppraisalNotificationsPopover />

          <button
            type="button"
            onClick={() => refreshAppraisals()}
            className="p-2.5 text-[#0B3D2E] bg-white border border-[#0B3D2E]/20 rounded-xl hover:bg-[#0B3D2E]/5 transition-colors focus:ring-2 focus:ring-[#78C89A]"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} />
          </button>

          {canStartDirect && !isCapturer && (
            <button
              type="button"
              id="start-direct-appraisal-btn"
              onClick={() => setIsDirectModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-xs"
            >
              <PlusCircle className="w-4 h-4 text-[#78C89A]" />
              Iniciar Laudo Direto
            </button>
          )}
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B3D2E]/40" />
            <input
              type="text"
              placeholder="Buscar por título ou finalidade..."
              value={appraisalsFilters.search || ''}
              onChange={(e) => setAppraisalsFilters({ search: e.target.value })}
              className="w-full pl-9 pr-4 py-2 text-xs border border-[#0B3D2E]/20 rounded-xl focus:ring-2 focus:ring-[#78C89A] bg-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[#0B3D2E]/60 shrink-0" />
            <select
              value={appraisalsFilters.status || 'all'}
              onChange={(e) =>
                setAppraisalsFilters({
                  status: parseAppraisalStatusFilter(e.target.value),
                })
              }
              className="w-full sm:w-auto px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-xl bg-white focus:ring-2 focus:ring-[#78C89A]"
            >
              <option value="all">Todos os Status</option>
              <option value="draft">Rascunho</option>
              <option value="data_collection">Coleta de Dados</option>
              <option value="fieldwork">Vistoria de Campo</option>
              <option value="analysis">Análise e Inferência</option>
              <option value="ready_to_issue">Pronto para Emissão</option>
              <option value="issued">Emitido</option>
              <option value="cancelled">Cancelado</option>
            </select>

            <select
              value={appraisalsFilters.propertyType || 'all'}
              onChange={(e) =>
                setAppraisalsFilters({
                  propertyType: parsePropertyTypeFilter(e.target.value),
                })
              }
              className="w-full sm:w-auto px-3 py-2 text-xs border border-[#0B3D2E]/20 rounded-xl bg-white focus:ring-2 focus:ring-[#78C89A]"
            >
              <option value="all">Todos os Tipos</option>
              <option value="rural">Rural</option>
              <option value="urban">Urbano</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Laudos */}
      {status === 'loading' && appraisals.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-[#0B3D2E]">
          <RefreshCw className="w-8 h-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-3">
          <AlertCircle className="w-8 h-8 text-[#0B3D2E]/70 mx-auto" />
          <h3 className="text-sm font-bold text-[#0B3D2E]">Falha ao carregar laudos</h3>
          <p className="text-xs text-[#0B3D2E]/70 max-w-md mx-auto">{error}</p>
        </div>
      ) : appraisals.length === 0 ? (
        <div className="p-12 text-center bg-white border border-[#0B3D2E]/15 rounded-2xl space-y-4">
          <FileText className="w-10 h-10 text-[#0B3D2E]/40 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-[#0B3D2E]">Nenhum laudo registrado</h3>
            <p className="text-xs text-[#0B3D2E]/60 mt-1 max-w-sm mx-auto">
              {isCapturer
                ? 'Nenhum laudo em elaboração para a sua carteira comercial no momento.'
                : 'Inicie um laudo direto ou converta uma solicitação da fila operacional.'}
            </p>
          </div>
          {canStartDirect && !isCapturer && (
            <button
              type="button"
              onClick={() => setIsDirectModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors"
            >
              <PlusCircle className="w-4 h-4 text-[#78C89A]" />
              Iniciar Laudo Direto
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appraisals.map((app) => (
            <div
              key={app.id}
              id={`appraisal-card-${app.id}`}
              className="p-5 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-xs hover:border-[#0B3D2E]/30 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#0B3D2E]/60">
                    {app.origin === 'capturer_request' ? 'Origem: Solicitação Captador' : 'Iniciativa Técnica Direta'}
                  </span>
                  {getStatusBadge(app.status)}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#0B3D2E] leading-snug line-clamp-1">{app.title}</h3>
                  <p className="text-xs text-[#0B3D2E]/70 mt-0.5 line-clamp-1">Finalidade: {app.purpose}</p>
                </div>

                <div className="space-y-1.5 text-xs text-[#0B3D2E]/80 pt-2 border-t border-[#0B3D2E]/10">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#0B3D2E]/60 shrink-0" />
                    <span className="truncate">{getClientName(app.clientId)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-[#0B3D2E]/60 shrink-0" />
                    <span className="truncate">{getPropertyName(app.propertyId)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#0B3D2E]/10 flex items-center justify-between">
                <span className="text-[11px] text-[#0B3D2E]/60">
                  {new Date(app.createdAt).toLocaleDateString('pt-BR')}
                </span>

                {isCapturer ? (
                  <button
                    type="button"
                    onClick={() => setCapturerDetailId(app.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B3D2E] bg-[#0B3D2E]/10 rounded-xl hover:bg-[#0B3D2E]/20 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Status Operacional
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenDossier(app.id)}
                      disabled={isLoadingDossier}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#0B3D2E] rounded-xl hover:bg-[#0B3D2E]/90 transition-colors shadow-2xs cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#78C89A]" />
                      Dossiê Técnico
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      <DirectAppraisalModal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
        onSuccess={() => refreshAppraisals()}
      />

      <CapturerAppraisalDetailModal
        isOpen={!!capturerDetailId}
        onClose={() => setCapturerDetailId(null)}
        appraisalId={capturerDetailId}
      />
    </div>
  );
}
