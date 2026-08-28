/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Painel de Inconsistências e Validação Topológica
 * 
 * Apresenta em tempo real erros impeditivos e avisos geométricos:
 * - Autointerseções de limites
 * - Polígonos não fechados / menos de 3 vértices
 * - Vazios internos fora do perímetro
 * - Vértices duplicados ou colineares
 * - Discrepâncias de sistema de referência
 */

import React from 'react';
import { GeometryValidationResult, GeometryValidationIssue } from '../../types/propertyGeometry';
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';

interface GeometryValidationIssuesProps {
  validationResult: GeometryValidationResult;
  onSelectParcel?: (parcelId: string) => void;
  onSelectVertex?: (vertexId: string) => void;
}

export const GeometryValidationIssues: React.FC<GeometryValidationIssuesProps> = ({
  validationResult,
  onSelectParcel,
  onSelectVertex,
}) => {
  const { isValid, hasErrors, hasWarnings, issues } = validationResult;

  if (isValid && issues.length === 0) {
    return (
      <div className="flex items-center gap-3 p-3.5 bg-[#78C89A]/20 border border-[#78C89A]/40 rounded-xl text-xs font-semibold text-[#0B3D2E]">
        <CheckCircle2 className="w-5 h-5 text-[#0B3D2E] shrink-0" />
        <div>
          <span className="font-bold">Topologia Válida:</span> Nenhum erro estrutural detectado nos polígonos e anéis perimetrais.
        </div>
      </div>
    );
  }

  return (
    <div id="agrocore-validation-issues-panel" className="space-y-2">
      {hasErrors && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-900">
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>Erros Estruturais Detectados (Correção Necessária):</span>
          </div>
          <ul className="space-y-1 pl-6 list-disc">
            {issues
              .filter((i) => i.severity === 'error')
              .map((issue, idx) => (
                <li key={idx} className="leading-relaxed">
                  <span className="font-semibold">{issue.message}</span>
                  {issue.affectedVertexIds && issue.affectedVertexIds.length > 0 && (
                    <span className="text-[11px] text-rose-700 ml-1">
                      (Vértices afetados: {issue.affectedVertexIds.length})
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      {hasWarnings && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Avisos e Recomendações Técnicas:</span>
          </div>
          <ul className="space-y-1 pl-6 list-disc">
            {issues
              .filter((i) => i.severity === 'warning')
              .map((issue, idx) => (
                <li key={idx} className="leading-relaxed">
                  <span>{issue.message}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};
