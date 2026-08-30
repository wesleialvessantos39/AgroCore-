import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthorization } from '../authorization/useAuthorization';
import { PROPOSAL_THEME } from '../proposals/theme';
import { useProposals } from '../proposals/useProposals';
import {
  PROPOSAL_CATEGORY_LABELS,
  PROPOSAL_TYPE_LABELS,
  formatCentsToBRL,
} from '../proposals/validators';
import { getProposalDetailPath } from '../routes';
import { Proposal, ProposalCommercialDocument } from '../types/proposals';

function formatIssuedAt(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export const ProposalDocumentPage: React.FC = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { can } = useAuthorization();
  const {
    getProposalById,
    getProposalDocuments,
    issueProposalDocument,
  } = useProposals();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [document, setDocument] = useState<ProposalCommercialDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!proposalId) {
      setError('Identificador da proposta ausente.');
      setIsLoading(false);
      return;
    }
    setError(null);
    const loadedProposal = await getProposalById(proposalId);
    if (!loadedProposal) {
      setError('Proposta não encontrada ou não autorizada.');
      setIsLoading(false);
      return;
    }
    const documents = await getProposalDocuments(proposalId);
    setProposal(loadedProposal);
    setDocument(documents[0] ?? null);
    setIsLoading(false);
  }, [getProposalById, getProposalDocuments, proposalId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    load().catch((loadError: unknown) => {
      if (active) {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar documento.');
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  const handleIssue = async () => {
    if (!proposal) return;
    setIsIssuing(true);
    setError(null);
    const result = await issueProposalDocument(proposal.id);
    setIsIssuing(false);
    if (!result.success) {
      setError(result.error || 'Falha ao emitir documento comercial.');
      return;
    }
    await load();
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#0B3D2E]/15 bg-white p-8 text-center text-[#0B3D2E]">
        Carregando documento comercial...
      </div>
    );
  }

  if (!proposal) {
    return (
      <div role="alert" className="rounded-2xl border border-[#0B3D2E]/20 bg-white p-6 text-[#0B3D2E]">
        {error || 'Proposta indisponível.'}
      </div>
    );
  }

  if (!document) {
    const mayIssue = can('proposals:issue_document') && proposal.status === 'approved';
    return (
      <section className="space-y-4 rounded-2xl border border-[#0B3D2E]/15 bg-white p-6 text-[#0B3D2E]">
        <button
          type="button"
          onClick={() => navigate(getProposalDetailPath(proposal.id))}
          className={PROPOSAL_THEME.btnMutedSmall}
        >
          ← Voltar para a proposta
        </button>
        <h1 className="text-xl font-bold">Documento comercial ainda não emitido</h1>
        <p className="max-w-2xl text-sm text-[#0B3D2E]/70">
          O documento somente pode ser gerado a partir da versão aprovada e permanecerá imutável.
        </p>
        {error && <p role="alert" aria-live="assertive" className="text-sm font-semibold">{error}</p>}
        {mayIssue && (
          <button
            type="button"
            onClick={handleIssue}
            disabled={isIssuing}
            className={PROPOSAL_THEME.btnPrimary}
          >
            {isIssuing ? 'Emitindo documento...' : 'Emitir documento comercial'}
          </button>
        )}
      </section>
    );
  }

  const content = document.content;
  return (
    <div className="space-y-4 text-[#0B3D2E]" id="page-proposal-document">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={() => navigate(getProposalDetailPath(proposal.id))}
          className={PROPOSAL_THEME.btnSecondary}
        >
          ← Voltar para a proposta
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className={PROPOSAL_THEME.btnPrimary}
        >
          Imprimir ou salvar como PDF
        </button>
      </div>

      <p className="print:hidden rounded-xl border border-[#78C89A]/50 bg-[#78C89A]/15 p-3 text-xs" role="note">
        A exportação usa a impressão segura do navegador. O arquivo resultante não contém assinatura digital
        e não substitui contrato ou aprovação da instituição financeira.
      </p>

      <article
        aria-label={`Documento comercial ${document.documentNumber}`}
        className="mx-auto min-h-[297mm] w-full max-w-[210mm] space-y-8 bg-white p-6 shadow-lg print:min-h-0 print:max-w-none print:p-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0B3D2E] pb-5">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">
              <span className="text-[#0B3D2E]">Agro</span><span className="text-[#78C89A]">Core</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider">Documento comercial de proposta</p>
          </div>
          <dl className="text-right text-xs">
            <dt className="font-semibold">Documento</dt>
            <dd>{document.documentNumber}</dd>
            <dt className="mt-2 font-semibold">Emitido em</dt>
            <dd>{formatIssuedAt(document.issuedAt)} UTC</dd>
          </dl>
        </header>

        <section aria-labelledby="proposal-document-identification" className="space-y-3">
          <h1 id="proposal-document-identification" className="text-xl font-bold">{content.title}</h1>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Proposta</dt><dd>{content.proposalNumber}</dd></div>
            <div><dt className="font-semibold">Versão aprovada</dt><dd>{document.sourceVersionNumber}</dd></div>
            <div><dt className="font-semibold">Tipo</dt><dd>{PROPOSAL_TYPE_LABELS[content.proposalType]}</dd></div>
            <div><dt className="font-semibold">Categoria</dt><dd>{PROPOSAL_CATEGORY_LABELS[content.category]}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="proposal-document-client" className="space-y-3 border-t border-[#0B3D2E]/15 pt-5">
          <h2 id="proposal-document-client" className="text-base font-bold">Cliente e referência territorial</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Cliente</dt><dd>{content.client.name}</dd></div>
            <div>
              <dt className="font-semibold">Imóvel</dt>
              <dd>{content.property ? `${content.property.name}${content.property.city ? ` — ${content.property.city}/${content.property.state ?? ''}` : ''}` : 'Não vinculado'}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="proposal-document-financial" className="space-y-3 border-t border-[#0B3D2E]/15 pt-5">
          <h2 id="proposal-document-financial" className="text-base font-bold">Condições estimadas</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Valor estimado</dt><dd className="text-lg font-bold">{content.estimatedValue.formattedBRL}</dd></div>
            <div><dt className="font-semibold">Prazo de validade</dt><dd>{content.validityDays} dias após a apresentação registrada</dd></div>
            {content.calculationSummary.financingTermMonths && (
              <div><dt className="font-semibold">Prazo estimado</dt><dd>{content.calculationSummary.financingTermMonths} meses</dd></div>
            )}
            {content.calculationSummary.gracePeriodMonths !== undefined && (
              <div><dt className="font-semibold">Carência estimada</dt><dd>{content.calculationSummary.gracePeriodMonths} meses</dd></div>
            )}
            {content.calculationSummary.interestRateAnnualPercentage !== undefined && (
              <div><dt className="font-semibold">Taxa anual estimada</dt><dd>{content.calculationSummary.interestRateAnnualPercentage.toLocaleString('pt-BR')}%</dd></div>
            )}
            {content.calculationSummary.installmentEstimatedCents !== undefined && (
              <div><dt className="font-semibold">Parcela estimada</dt><dd>{formatCentsToBRL(content.calculationSummary.installmentEstimatedCents)}</dd></div>
            )}
          </dl>
        </section>

        <section aria-labelledby="proposal-document-integrity" className="space-y-2 border-t border-[#0B3D2E]/15 pt-5 text-xs">
          <h2 id="proposal-document-integrity" className="text-sm font-bold">Integridade técnica</h2>
          <p>SHA-256 do documento:</p>
          <code className="block break-all rounded-lg bg-[#0B3D2E]/5 p-2">{document.checksumSha256}</code>
          <p>SHA-256 do snapshot de origem:</p>
          <code className="block break-all rounded-lg bg-[#0B3D2E]/5 p-2">{document.sourceChecksumSha256}</code>
        </section>

        <footer className="border-t border-[#0B3D2E] pt-4 text-xs leading-relaxed">
          <strong>Aviso:</strong> {content.disclaimerText}
        </footer>
      </article>
    </div>
  );
};
