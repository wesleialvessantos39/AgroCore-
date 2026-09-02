import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  Link2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorization } from '../authorization/useAuthorization';
import { useDocuments } from '../documents/DocumentsContext';
import { DOCUMENT_THEME } from '../documents/theme';
import { useOrganization } from '../organization/useOrganization';
import type { DocumentAlertSeverity } from '../types/documentCompliance';
import { DOCUMENT_CATEGORY_LABELS } from '../types/documents';

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const DATE_ONLY = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

const SEVERITY_LABEL: Readonly<Record<DocumentAlertSeverity, string>> = Object.freeze({
  warning: 'Atenção',
  critical: 'Prazo crítico',
  expired: 'Vencido',
});

function formatDateTime(value: string): string {
  return DATE_TIME.format(new Date(value));
}

function formatDate(value: string): string {
  return DATE_ONLY.format(new Date(`${value}T00:00:00.000Z`));
}

function statusLabel(status: string): string {
  if (status === 'active') return 'Ativo';
  if (status === 'revoked') return 'Revogado';
  if (status === 'expired') return 'Expirado';
  if (status === 'exhausted') return 'Limite atingido';
  if (status === 'completed') return 'Concluída';
  if (status === 'failed') return 'Não concluída';
  return 'Preparando';
}

export function DocumentCompliancePage() {
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const { can } = useAuthorization();
  const {
    complianceStatus,
    complianceDashboard: loadedComplianceDashboard,
    complianceErrorMessage,
    refreshComplianceDashboard,
    configureDocumentAlertPolicy,
    createDocumentShare,
    revokeDocumentShare,
    exportDocuments,
  } = useDocuments();
  const [warningDays, setWarningDays] = useState('30');
  const [criticalDays, setCriticalDays] = useState('7');
  const [shareDocumentId, setShareDocumentId] = useState('');
  const [shareMinutes, setShareMinutes] = useState('60');
  const [shareAccesses, setShareAccesses] = useState('1');
  const [sharePurpose, setSharePurpose] = useState('Envio para análise externa');
  const [createdLink, setCreatedLink] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<ReadonlySet<string>>(new Set());
  const [exportPurpose, setExportPurpose] = useState('Dossiê documental selecionado');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<'policy' | 'share' | 'export' | string | null>(null);
  const createdLinkRef = useRef(createdLink);
  createdLinkRef.current = createdLink;
  const exportAbort = useRef<AbortController | null>(null);
  const operationSequence = useRef(0);
  const operationInFlight = useRef(false);

  const activeOrganizationId = activeOrganization?.id ?? null;
  const complianceDashboard =
    loadedComplianceDashboard?.policy.organizationId === activeOrganizationId
      ? loadedComplianceDashboard
      : null;
  const policyVersion = complianceDashboard?.policy.versionNumber ?? 0;
  const policyWarningDays = complianceDashboard?.policy.warningDays;
  const policyCriticalDays = complianceDashboard?.policy.criticalDays;
  const operationContextKey = `${activeOrganizationId ?? ''}:${session?.user.id ?? ''}`;
  const activeOperationContextKey = useRef(operationContextKey);
  activeOperationContextKey.current = operationContextKey;
  useEffect(() => {
    if (policyWarningDays === undefined || policyCriticalDays === undefined) return;
    setWarningDays(String(policyWarningDays));
    setCriticalDays(String(policyCriticalDays));
  }, [policyVersion, policyWarningDays, policyCriticalDays]);

  useEffect(() => () => {
    operationSequence.current += 1;
    operationInFlight.current = false;
    exportAbort.current?.abort();
  }, []);

  useEffect(() => {
    setCreatedLink('');
    setShareDocumentId('');
    setSelectedDocuments(new Set());
    setMessage(null);
    setWorking(null);
    operationSequence.current += 1;
    operationInFlight.current = false;
    exportAbort.current?.abort();
    exportAbort.current = null;
  }, [activeOrganizationId, session?.user.id]);

  const beginOperation = (operation: 'policy' | 'share' | 'export' | string): number | null => {
    if (operationInFlight.current) return null;
    operationInFlight.current = true;
    const sequence = ++operationSequence.current;
    setWorking(operation);
    setMessage(null);
    return sequence;
  };

  const finishOperation = (sequence: number, contextKey: string): boolean => {
    if (
      sequence !== operationSequence.current ||
      contextKey !== activeOperationContextKey.current
    ) return false;
    operationInFlight.current = false;
    setWorking(null);
    return true;
  };

  const usableDocuments = useMemo(
    () => {
      const currentUtcDate = new Date().toISOString().slice(0, 10);
      return (complianceDashboard?.availableDocuments ?? []).filter(
        (document) =>
          document.isCurrent &&
          document.status === 'active' &&
          document.storageState === 'stored' &&
          (!document.expiresOn || document.expiresOn >= currentUtcDate)
      );
    },
    [complianceDashboard]
  );

  const submitPolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    const sequence = beginOperation('policy');
    if (sequence === null) return;
    const contextKey = activeOperationContextKey.current;
    const result = await configureDocumentAlertPolicy({
      warningDays: Number(warningDays),
      criticalDays: Number(criticalDays),
      expectedVersion: policyVersion,
    });
    if (!finishOperation(sequence, contextKey)) return;
    setMessage(result.success ? 'Janelas de alerta atualizadas.' : result.error ?? 'Não foi possível atualizar os alertas.');
  };

  const submitShare = async (event: React.FormEvent) => {
    event.preventDefault();
    const sequence = beginOperation('share');
    if (sequence === null) return;
    const contextKey = activeOperationContextKey.current;
    setCreatedLink('');
    const result = await createDocumentShare({
      documentId: shareDocumentId,
      expiresInMinutes: Number(shareMinutes),
      maxAccesses: Number(shareAccesses),
      purpose: sharePurpose,
    });
    if (!finishOperation(sequence, contextKey)) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'Não foi possível criar o acesso temporário.');
      return;
    }
    setCreatedLink(`${window.location.origin}${result.data.sharePath}`);
    setMessage('Acesso temporário criado. Copie-o agora; ele não será mostrado novamente.');
  };

  const revoke = async (shareId: string, accessCount: number) => {
    const sequence = beginOperation(shareId);
    if (sequence === null) return;
    const contextKey = activeOperationContextKey.current;
    const result = await revokeDocumentShare({
      shareId,
      expectedAccessCount: accessCount,
      reason: 'Acesso encerrado pelo responsável',
    });
    if (!finishOperation(sequence, contextKey)) return;
    setMessage(result.success ? 'Acesso temporário revogado.' : result.error ?? 'Não foi possível revogar o acesso.');
  };

  const toggleDocument = (documentId: string) => {
    setSelectedDocuments((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else if (next.size < 20) next.add(documentId);
      return next;
    });
  };

  const copyCreatedLink = async () => {
    const link = createdLink;
    const contextKey = activeOperationContextKey.current;
    try {
      await navigator.clipboard.writeText(link);
      if (contextKey === activeOperationContextKey.current && link === createdLinkRef.current) {
        setMessage('Acesso copiado.');
      }
    } catch {
      if (contextKey === activeOperationContextKey.current && link === createdLinkRef.current) {
        setMessage('Selecione e copie o endereço exibido.');
      }
    }
  };

  const submitExport = async (event: React.FormEvent) => {
    event.preventDefault();
    const sequence = beginOperation('export');
    if (sequence === null) return;
    const contextKey = activeOperationContextKey.current;
    const controller = new AbortController();
    exportAbort.current = controller;
    const result = await exportDocuments(
      { documentIds: [...selectedDocuments], purpose: exportPurpose },
      controller.signal
    );
    if (
      sequence !== operationSequence.current ||
      contextKey !== activeOperationContextKey.current
    ) return;
    if (exportAbort.current === controller) exportAbort.current = null;
    if (!finishOperation(sequence, contextKey)) return;
    if (!result.success || !result.data) {
      setMessage(result.error ?? 'Não foi possível concluir a exportação.');
      return;
    }
    const url = URL.createObjectURL(result.data.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.data.fileName;
    anchor.rel = 'noopener';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setSelectedDocuments(new Set());
    setMessage('Exportação concluída e registrada no histórico.');
  };

  if (complianceStatus === 'loading' && !complianceDashboard) {
    return (
      <div className={`${DOCUMENT_THEME.surfaceSoft} p-8 text-center`} role="status">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#0B3D2E]" aria-hidden="true" />
        <p className="mt-3 text-sm text-[#0B3D2E]">Carregando validades e saídas…</p>
      </div>
    );
  }

  if (!complianceDashboard) {
    return (
      <div className={`${DOCUMENT_THEME.surfaceSoft} p-6`} role="alert">
        <p className="font-semibold text-[#0B3D2E]">Não foi possível abrir esta área.</p>
        <p className="mt-1 text-sm text-[#0B3D2E]/70">{complianceErrorMessage ?? 'Serviço indisponível.'}</p>
        <button type="button" className={`${DOCUMENT_THEME.buttonSecondary} mt-4`} onClick={() => void refreshComplianceDashboard()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div id="page-document-compliance" className={DOCUMENT_THEME.page}>
      <header className="flex flex-col gap-4 border-b border-[#0B3D2E]/15 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0B3D2E] sm:text-3xl">Validades e saídas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#0B3D2E]/70 sm:text-base">
            Acompanhe vencimentos e libere arquivos somente pelo tempo e pelo alcance necessários.
          </p>
        </div>
        <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void refreshComplianceDashboard()} disabled={complianceStatus === 'loading'}>
          <RefreshCw className={`h-4 w-4 ${complianceStatus === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
          Atualizar
        </button>
      </header>

      {message && <div className={`${DOCUMENT_THEME.surfaceSoft} p-4 text-sm font-semibold`} role="status" aria-live="polite">{message}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de validade">
        {[
          { label: 'Avisos', value: complianceDashboard.totals.warnings, Icon: CalendarClock },
          { label: 'Críticos', value: complianceDashboard.totals.critical, Icon: AlertTriangle },
          { label: 'Vencidos', value: complianceDashboard.totals.expired, Icon: Ban },
          { label: 'Acessos ativos', value: complianceDashboard.totals.activeShares, Icon: Link2 },
        ].map(({ label, value, Icon }) => (
          <article key={label} className={`${DOCUMENT_THEME.surface} p-4`}>
            <Icon className="h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <p className="mt-3 text-2xl font-bold text-[#0B3D2E]">{value}</p>
            <p className="text-sm text-[#0B3D2E]/65">{label}</p>
          </article>
        ))}
      </section>

      {can('documents:manage_validity') && (
        <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="validity-policy-title">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0B3D2E]" aria-hidden="true" />
            <div>
              <h2 id="validity-policy-title" className="text-lg font-bold text-[#0B3D2E]">Janelas de alerta</h2>
              <p className="mt-1 text-sm text-[#0B3D2E]/65">A janela crítica deve ficar dentro do aviso antecipado.</p>
            </div>
          </div>
          <form className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submitPolicy}>
            <label className="block text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Avisar com antecedência</span>
              <input className={DOCUMENT_THEME.input} type="number" min="1" max="3650" value={warningDays} onChange={(event) => setWarningDays(event.target.value)} required />
            </label>
            <label className="block text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Considerar crítico em</span>
              <input className={DOCUMENT_THEME.input} type="number" min="0" max="365" value={criticalDays} onChange={(event) => setCriticalDays(event.target.value)} required />
            </label>
            <button className={DOCUMENT_THEME.buttonPrimary} type="submit" disabled={working !== null}>
              {working === 'policy' ? 'Salvando…' : 'Salvar janelas'}
            </button>
          </form>
        </section>
      )}

      <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="validity-alerts-title">
        <h2 id="validity-alerts-title" className="text-lg font-bold text-[#0B3D2E]">Documentos que exigem atenção</h2>
        {complianceDashboard.alerts.length === 0 ? (
          <p className="mt-4 text-sm text-[#0B3D2E]/65">Nenhum vencimento entrou na janela configurada.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#0B3D2E]/10">
            {complianceDashboard.alerts.map((alert) => (
              <li key={alert.document.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-[#0B3D2E]">{alert.document.displayName}</p>
                  <p className="text-sm text-[#0B3D2E]/65">{DOCUMENT_CATEGORY_LABELS[alert.document.category]} · validade {formatDate(alert.document.expiresOn!)}</p>
                </div>
                <span className={DOCUMENT_THEME.badge}>
                  {SEVERITY_LABEL[alert.severity]} · {alert.daysRemaining < 0 ? `${Math.abs(alert.daysRemaining)} dia(s) atrás` : `${alert.daysRemaining} dia(s)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can('documents:share') && (
        <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="share-document-title">
          <h2 id="share-document-title" className="text-lg font-bold text-[#0B3D2E]">Criar acesso temporário</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/65">O acesso vale para um único arquivo, pode ser revogado e nunca ultrapassa a validade do documento.</p>
          <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={submitShare}>
            <label className="block text-sm font-semibold text-[#0B3D2E] lg:col-span-2">
              <span className="mb-1.5 block">Documento</span>
              <select className={DOCUMENT_THEME.input} value={shareDocumentId} onChange={(event) => setShareDocumentId(event.target.value)} required>
                <option value="">Selecione</option>
                {usableDocuments.map((document) => <option key={document.id} value={document.id}>{document.displayName}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Duração em minutos</span>
              <input className={DOCUMENT_THEME.input} type="number" min="5" max="10080" value={shareMinutes} onChange={(event) => setShareMinutes(event.target.value)} required />
            </label>
            <label className="block text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Quantidade de acessos</span>
              <input className={DOCUMENT_THEME.input} type="number" min="1" max="20" value={shareAccesses} onChange={(event) => setShareAccesses(event.target.value)} required />
            </label>
            <label className="block text-sm font-semibold text-[#0B3D2E] lg:col-span-2">
              <span className="mb-1.5 block">Finalidade</span>
              <input className={DOCUMENT_THEME.input} maxLength={240} value={sharePurpose} onChange={(event) => setSharePurpose(event.target.value)} required />
            </label>
            <button className={`${DOCUMENT_THEME.buttonPrimary} lg:col-span-2`} type="submit" disabled={working !== null || usableDocuments.length === 0}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {working === 'share' ? 'Criando…' : 'Criar acesso'}
            </button>
          </form>
          {createdLink && (
            <div className={`${DOCUMENT_THEME.surfaceSoft} mt-4 p-4`}>
              <label className="block text-sm font-semibold text-[#0B3D2E]">
                <span className="mb-1.5 block">Copie antes de sair desta tela</span>
                <span className="flex flex-col gap-2 sm:flex-row">
                  <input className={DOCUMENT_THEME.input} readOnly value={createdLink} />
                  <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void copyCreatedLink()}>
                    <Copy className="h-4 w-4" aria-hidden="true" /> Copiar
                  </button>
                </span>
              </label>
            </div>
          )}
        </section>
      )}

      <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="active-shares-title">
        <h2 id="active-shares-title" className="text-lg font-bold text-[#0B3D2E]">Histórico de acessos temporários</h2>
        {complianceDashboard.shares.length === 0 ? (
          <p className="mt-4 text-sm text-[#0B3D2E]/65">Nenhum acesso temporário registrado.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#0B3D2E]/10">
            {complianceDashboard.shares.map((share) => {
              const mayRevoke = can('documents:share') && share.status === 'active' && (
                can('documents:manage_validity') || share.createdByUserId === session?.user.id
              );
              return (
                <li key={share.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold text-[#0B3D2E]">{share.documentDisplayName}</p>
                    <p className="mt-1 text-sm text-[#0B3D2E]/65">{share.purpose} · até {formatDateTime(share.expiresAt)} · {share.accessCount}/{share.maxAccesses} acesso(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={DOCUMENT_THEME.badge}>{statusLabel(share.status)}</span>
                    {mayRevoke && <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => void revoke(share.id, share.accessCount)} disabled={working !== null}>{working === share.id ? 'Revogando…' : 'Revogar'}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {can('documents:export') && (
        <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="batch-export-title">
          <h2 id="batch-export-title" className="text-lg font-bold text-[#0B3D2E]">Exportação selecionada</h2>
          <p className="mt-1 text-sm text-[#0B3D2E]/65">Escolha até 20 arquivos. Somente os itens marcados entrarão no pacote e no histórico.</p>
          <form className="mt-4" onSubmit={submitExport}>
            <fieldset>
              <legend className="text-sm font-semibold text-[#0B3D2E]">Documentos autorizados</legend>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {usableDocuments.map((document) => (
                  <label key={document.id} className={`${DOCUMENT_THEME.surfaceSoft} flex min-h-[52px] cursor-pointer items-center gap-3 p-3 text-sm text-[#0B3D2E]`}>
                    <input type="checkbox" checked={selectedDocuments.has(document.id)} onChange={() => toggleDocument(document.id)} />
                    <span><strong className="block">{document.displayName}</strong><span className="text-[#0B3D2E]/65">{DOCUMENT_CATEGORY_LABELS[document.category]}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 block text-sm font-semibold text-[#0B3D2E]">
              <span className="mb-1.5 block">Finalidade da exportação</span>
              <input className={DOCUMENT_THEME.input} maxLength={240} value={exportPurpose} onChange={(event) => setExportPurpose(event.target.value)} required />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className={DOCUMENT_THEME.buttonPrimary} disabled={working !== null || selectedDocuments.size === 0}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {working === 'export' ? 'Preparando…' : `Exportar ${selectedDocuments.size || ''}`}
              </button>
              {working === 'export' && <button type="button" className={DOCUMENT_THEME.buttonSecondary} onClick={() => exportAbort.current?.abort()}>Cancelar</button>}
            </div>
          </form>
        </section>
      )}

      <section className={`${DOCUMENT_THEME.surface} p-5`} aria-labelledby="export-history-title">
        <h2 id="export-history-title" className="text-lg font-bold text-[#0B3D2E]">Histórico de exportações</h2>
        {complianceDashboard.exports.length === 0 ? (
          <p className="mt-4 text-sm text-[#0B3D2E]/65">Nenhuma exportação registrada.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#0B3D2E]/10">
            {complianceDashboard.exports.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-semibold text-[#0B3D2E]">{item.purpose}</p>
                  <p className="text-sm text-[#0B3D2E]/65">{item.documentCount} documento(s) · {formatDateTime(item.requestedAt)} · {item.requestedByDisplayName}</p>
                </div>
                <span className={DOCUMENT_THEME.badge}>{item.status === 'completed' ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : <FileArchive className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}{statusLabel(item.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
