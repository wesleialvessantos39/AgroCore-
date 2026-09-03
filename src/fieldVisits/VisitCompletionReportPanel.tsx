import React, { useEffect, useMemo, useState } from 'react';
import { FileCheck2, History, Plus, Printer, Trash2 } from 'lucide-react';
import type { TechnicalVisit } from '../types/technicalVisit';
import type {
  TechnicalVisitPendingCategory,
  TechnicalVisitPendingItem,
  TechnicalVisitReport,
} from '../types/technicalVisitReport';
import { useFieldVisits } from './useFieldVisits';
import { FIELD_VISIT_THEME } from './theme';

const CATEGORY_LABEL: Readonly<Record<TechnicalVisitPendingCategory, string>> = {
  documentation: 'Documentação',
  property_registry: 'Cadastro do imóvel',
  evidence: 'Evidências',
  technical: 'Questão técnica',
  other: 'Outra',
};

function createPendingItem(): TechnicalVisitPendingItem {
  const fallback = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id: globalThis.crypto?.randomUUID?.() ?? fallback,
    category: 'other',
    description: '',
  };
}

interface VisitCompletionReportPanelProps {
  readonly visit: TechnicalVisit;
  readonly canAccess: boolean;
  readonly canComplete: boolean;
  readonly completionReady: boolean;
  readonly canRevise: boolean;
}

export const VisitCompletionReportPanel: React.FC<VisitCompletionReportPanelProps> = ({
  visit,
  canAccess,
  canComplete,
  completionReady,
  canRevise,
}) => {
  const {
    completeVisit,
    getLatestReport,
    getReportVersions,
    reviseReport,
  } = useFieldVisits();

  const [report, setReport] = useState<TechnicalVisitReport | null>(null);
  const [versions, setVersions] = useState<readonly TechnicalVisitReport[]>([]);
  const [summary, setSummary] = useState('');
  const [pendingItems, setPendingItems] = useState<readonly TechnicalVisitPendingItem[]>([]);
  const [revisionReason, setRevisionReason] = useState('');
  const [editingRevision, setEditingRevision] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canLoadReport = canAccess && visit.status === 'completed';

  useEffect(() => {
    let active = true;
    if (!canLoadReport) {
      setReport(null);
      setVersions([]);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setErrorMessage(null);
    void Promise.all([
      getLatestReport(visit.id),
      getReportVersions(visit.id),
    ])
      .then(([latest, allVersions]) => {
        if (!active) return;
        setReport(latest);
        setVersions(allVersions);
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o relatório final.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canLoadReport, getLatestReport, getReportVersions, visit.id]);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const updatePendingItem = (
    id: string,
    patch: Partial<Pick<TechnicalVisitPendingItem, 'category' | 'description'>>
  ) => {
    setPendingItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const addPendingItem = () => {
    setPendingItems((current) => [...current, createPendingItem()]);
  };

  const removePendingItem = (id: string) => {
    setPendingItems((current) => current.filter((item) => item.id !== id));
  };

  const beginRevision = () => {
    if (!report) return;
    setSummary(report.summary);
    setPendingItems(report.pendingItems.map((item) => ({ ...item })));
    setRevisionReason('');
    setEditingRevision(true);
    setErrorMessage(null);
  };

  const submitCompletion = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await completeVisit(visit.id, {
        expectedVersion: visit.version,
        summary,
        pendingItems,
      });
      setReport(result.report);
      setVersions([result.report]);
      setSummary('');
      setPendingItems([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a visita e gerar o relatório.'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!report) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const next = await reviseReport(visit.id, {
        expectedReportVersion: report.version,
        summary,
        pendingItems,
        reason: revisionReason,
      });
      setReport(next);
      setVersions(await getReportVersions(visit.id));
      setEditingRevision(false);
      setRevisionReason('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar a nova versão do relatório.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (!canAccess) return null;

  return (
    <section
      aria-labelledby={`visit-report-title-${visit.id}`}
      className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-4 sm:p-5'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id={`visit-report-title-${visit.id}`}
            className="flex items-center gap-2 font-semibold text-[#0B3D2E]"
          >
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            Conclusão e relatório
          </h3>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            O relatório final preserva uma fotografia versionada do registro de campo.
          </p>
        </div>
        {report && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={() => setShowHistory((value) => !value)}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Versões
            </button>
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div role="alert" className="mt-3 text-sm font-medium text-[#0B3D2E]">
          {errorMessage}
        </div>
      )}

      {visit.status === 'in_progress' && canComplete && (
        <form onSubmit={submitCompletion} className="mt-4 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Resumo final da visita</span>
            <textarea
              required
              minLength={10}
              maxLength={5000}
              className={FIELD_VISIT_THEME.textarea}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Registre a conclusão técnica e os principais achados da visita."
            />
          </label>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Pendências registradas</p>
                <p className="text-xs text-[#0B3D2E]/65">
                  Pendências ficam no relatório; tarefas e integrações serão tratadas nas ordens próprias.
                </p>
              </div>
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonSecondary}
                onClick={addPendingItem}
                disabled={pendingItems.length >= 50}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adicionar pendência
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-xl border border-[#0B3D2E]/15 bg-white p-3 md:grid-cols-[180px_1fr_auto]"
                >
                  <label className="space-y-1 text-xs font-medium">
                    <span>Categoria</span>
                    <select
                      className={FIELD_VISIT_THEME.input}
                      value={item.category}
                      onChange={(event) =>
                        updatePendingItem(item.id, {
                          category: event.target.value as TechnicalVisitPendingCategory,
                        })
                      }
                    >
                      {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span>Descrição</span>
                    <input
                      required
                      minLength={3}
                      maxLength={1000}
                      className={FIELD_VISIT_THEME.input}
                      value={item.description}
                      onChange={(event) =>
                        updatePendingItem(item.id, { description: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={FIELD_VISIT_THEME.buttonSecondary + ' self-end'}
                    onClick={() => removePendingItem(item.id)}
                    aria-label="Remover pendência"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {pendingItems.length === 0 && (
                <p className="text-sm text-[#0B3D2E]/65">Nenhuma pendência informada.</p>
              )}
            </div>
          </div>

          {!completionReady && (
            <p role="status" className="text-sm font-medium text-[#0B3D2E]">
              Envie o formulário de campo antes de concluir e emitir o relatório.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              className={FIELD_VISIT_THEME.buttonPrimary}
              disabled={busy || !completionReady}
              title={
                completionReady
                  ? 'Concluir visita e emitir a primeira versão do relatório'
                  : 'Envie o formulário de campo antes de concluir'
              }
            >
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              Concluir e gerar relatório
            </button>
          </div>
        </form>
      )}

      {visit.status === 'in_progress' && !canComplete && (
        <p className="mt-4 text-sm text-[#0B3D2E]/70">
          A conclusão e a emissão da primeira versão são exclusivas do responsável pela visita.
        </p>
      )}

      {visit.status === 'completed' && loading && (
        <p className="mt-4 text-sm" aria-live="polite">Carregando relatório final...</p>
      )}

      {visit.status === 'completed' && !loading && report && !editingRevision && (
        <div className="mt-4" data-visit-final-report>
          <div className="flex flex-wrap items-center gap-2">
            <span className={FIELD_VISIT_THEME.badge}>Versão {report.version}</span>
            <span className="text-xs text-[#0B3D2E]/65">
              Emitida em {new Date(report.issuedAt).toLocaleString('pt-BR')}
            </span>
          </div>
          <h4 className="mt-4 text-sm font-semibold">Resumo final</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm">{report.summary}</p>

          <h4 className="mt-4 text-sm font-semibold">Pendências</h4>
          {report.pendingItems.length === 0 ? (
            <p className="mt-1 text-sm text-[#0B3D2E]/65">Sem pendências registradas.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {report.pendingItems.map((item) => (
                <li key={item.id} className="rounded-lg border border-[#0B3D2E]/15 bg-white p-3">
                  <span className="font-medium">{CATEGORY_LABEL[item.category]}:</span>{' '}
                  {item.description}
                </li>
              ))}
            </ul>
          )}

          {canRevise && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={FIELD_VISIT_THEME.buttonSecondary}
                onClick={beginRevision}
              >
                Criar nova versão
              </button>
            </div>
          )}
        </div>
      )}

      {visit.status === 'completed' && !loading && !report && !errorMessage && (
        <p role="alert" className="mt-4 text-sm font-medium">
          A visita está concluída, mas nenhuma versão autorizada do relatório foi localizada.
        </p>
      )}

      {report && showHistory && (
        <div className="mt-4 border-t border-[#0B3D2E]/15 pt-4">
          <h4 className="text-sm font-semibold">Histórico de versões</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {sortedVersions.map((version) => (
              <li key={version.id} className="flex flex-wrap justify-between gap-2">
                <span>Versão {version.version}</span>
                <span className="text-[#0B3D2E]/65">
                  {new Date(version.issuedAt).toLocaleString('pt-BR')}
                  {version.revisionReason ? ` · ${version.revisionReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && editingRevision && (
        <form onSubmit={submitRevision} className="mt-4 space-y-4 border-t border-[#0B3D2E]/15 pt-4">
          <h4 className="font-semibold">Nova versão do relatório</h4>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Motivo da revisão</span>
            <input
              required
              minLength={3}
              maxLength={500}
              className={FIELD_VISIT_THEME.input}
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Resumo final</span>
            <textarea
              required
              minLength={10}
              maxLength={5000}
              className={FIELD_VISIT_THEME.textarea}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <div className="space-y-3">
            {pendingItems.map((item) => (
              <div key={item.id} className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                <select
                  className={FIELD_VISIT_THEME.input}
                  value={item.category}
                  onChange={(event) =>
                    updatePendingItem(item.id, {
                      category: event.target.value as TechnicalVisitPendingCategory,
                    })
                  }
                >
                  {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  required
                  minLength={3}
                  maxLength={1000}
                  className={FIELD_VISIT_THEME.input}
                  value={item.description}
                  onChange={(event) =>
                    updatePendingItem(item.id, { description: event.target.value })
                  }
                />
                <button
                  type="button"
                  className={FIELD_VISIT_THEME.buttonSecondary}
                  onClick={() => removePendingItem(item.id)}
                  aria-label="Remover pendência"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={addPendingItem}
              disabled={pendingItems.length >= 50}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar pendência
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={FIELD_VISIT_THEME.buttonSecondary}
              onClick={() => setEditingRevision(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={FIELD_VISIT_THEME.buttonPrimary}
              disabled={busy}
            >
              Gerar nova versão
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
