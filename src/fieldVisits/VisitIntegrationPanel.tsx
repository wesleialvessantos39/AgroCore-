import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Link2, Loader2, RefreshCw, Truck } from 'lucide-react';
import type { TechnicalVisit } from '../types/technicalVisit';
import type {
  TechnicalVisitIntegrationDomain,
  TechnicalVisitIntegrationEvent,
  TechnicalVisitIntegrationLink,
  TechnicalVisitIntegrationSnapshot,
} from '../types/technicalVisitIntegration';
import { useFieldVisits } from './useFieldVisits';
import { FIELD_VISIT_THEME } from './theme';

const DOMAIN_LABEL: Readonly<Record<TechnicalVisitIntegrationDomain, string>> = {
  calendar: 'Agenda',
  proposal: 'Proposta',
  fleet: 'Frota',
};

const EVENT_LABEL: Readonly<Record<TechnicalVisitIntegrationEvent['eventType'], string>> = {
  'calendar.visit_sync_requested': 'Agenda sincronizada para atualização',
  'calendar.visit_release_requested': 'Agenda liberada após encerramento',
  'proposal.visit_linked': 'Proposta vinculada à visita',
  'proposal.visit_relinked': 'Vínculo da proposta atualizado',
  'proposal.visit_unlinked': 'Vínculo anterior da proposta encerrado',
  'proposal.visit_status_changed': 'Andamento da visita enviado à proposta',
  'fleet.visit_sync_requested': 'Referência logística atualizada',
  'fleet.visit_release_requested': 'Referência logística liberada após encerramento',
};

function iconFor(domain: TechnicalVisitIntegrationDomain) {
  if (domain === 'calendar') {
    return <CalendarDays className="h-4 w-4" aria-hidden="true" />;
  }
  if (domain === 'fleet') {
    return <Truck className="h-4 w-4" aria-hidden="true" />;
  }
  return <Link2 className="h-4 w-4" aria-hidden="true" />;
}

function linkMessage(
  domain: TechnicalVisitIntegrationDomain,
  link: TechnicalVisitIntegrationLink | undefined,
  visit: TechnicalVisit
): string {
  if (!link) {
    if (domain === 'proposal' && !visit.proposalId) {
      return 'Esta visita não possui proposta vinculada.';
    }
    return 'Vínculo operacional ainda não disponível.';
  }

  if (domain === 'calendar') {
    return link.status === 'active'
      ? 'A programação da visita está disponível para sincronização com a agenda.'
      : 'A programação foi liberada após o encerramento da visita.';
  }

  if (domain === 'fleet') {
    return link.status === 'active'
      ? 'A visita possui uma referência logística estável para uso pela gestão de frota.'
      : 'A referência logística foi liberada após o encerramento da visita.';
  }

  return link.status === 'active'
    ? 'A visita está vinculada à proposta selecionada.'
    : 'O vínculo anterior com a proposta foi encerrado.';
}

export interface VisitIntegrationPanelProps {
  readonly visit: TechnicalVisit;
  readonly canAccess: boolean;
}

export function VisitIntegrationPanel({
  visit,
  canAccess,
}: VisitIntegrationPanelProps) {
  const { getIntegrationSnapshot } = useFieldVisits();
  const [snapshot, setSnapshot] =
    useState<TechnicalVisitIntegrationSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canAccess) {
      setSnapshot(null);
      setErrorMessage(null);
      return;
    }

    let active = true;
    setLoading(true);
    setErrorMessage(null);

    void getIntegrationSnapshot(visit.id)
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(null);
        setErrorMessage(
          'Não foi possível consultar as integrações operacionais desta visita.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canAccess, getIntegrationSnapshot, visit.id, visit.version]);

  const linksByDomain = useMemo(() => {
    const map = new Map<TechnicalVisitIntegrationDomain, TechnicalVisitIntegrationLink>();
    for (const link of snapshot?.links ?? []) {
      map.set(link.targetDomain, link);
    }
    return map;
  }, [snapshot]);

  const latestByDomain = useMemo(() => {
    const map = new Map<TechnicalVisitIntegrationDomain, TechnicalVisitIntegrationEvent>();
    for (const event of snapshot?.events ?? []) {
      if (!map.has(event.targetDomain)) map.set(event.targetDomain, event);
    }
    return map;
  }, [snapshot]);

  if (!canAccess) return null;

  return (
    <section
      className={FIELD_VISIT_THEME.surfaceSoft + ' mt-4 p-4 sm:p-5'}
      aria-label="Integrações operacionais da visita"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#0B3D2E]">Integrações operacionais</h3>
          <p className="mt-1 text-sm text-[#0B3D2E]/70">
            Vínculos estáveis usados para manter agenda, proposta e logística alinhadas à visita.
          </p>
        </div>
        {loading && (
          <span className="inline-flex items-center gap-2 text-sm text-[#0B3D2E]/70" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Atualizando
          </span>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="mt-3 text-sm font-medium text-[#0B3D2E]">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(['calendar', 'proposal', 'fleet'] as const).map((domain) => {
          const link = linksByDomain.get(domain);
          const latest = latestByDomain.get(domain);
          return (
            <div key={domain} className={FIELD_VISIT_THEME.surface + ' p-4'}>
              <div className="flex items-center gap-2 font-semibold text-[#0B3D2E]">
                {iconFor(domain)}
                <span>{DOMAIN_LABEL[domain]}</span>
              </div>
              <p className="mt-2 text-sm text-[#0B3D2E]/75">
                {linkMessage(domain, link, visit)}
              </p>
              {link && (
                <dl className="mt-3 space-y-1 text-xs text-[#0B3D2E]/70">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>Situação</dt>
                    <dd className="font-medium text-[#0B3D2E]">
                      {link.status === 'active' ? 'Ativo' : 'Liberado'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>Versão de origem</dt>
                    <dd className="font-medium text-[#0B3D2E]">{link.sourceVersion}</dd>
                  </div>
                </dl>
              )}
              {latest && (
                <p className="mt-3 border-t border-[#78C89A]/50 pt-3 text-xs text-[#0B3D2E]/70">
                  <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {EVENT_LABEL[latest.eventType]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
