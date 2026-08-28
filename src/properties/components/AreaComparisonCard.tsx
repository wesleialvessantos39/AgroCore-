/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Cartão de Métricas Geodésicas e Comparativo Cadastral de Áreas
 * 
 * Apresenta:
 * - Área calculada pela geometria vetorial interna (ha e m²)
 * - Perímetro percorrido (km e m)
 * - Comparação cruzada com Área Declarada, CAR, SNCR e Matrículas
 * - Análise de divergência e tolerância técnica
 */

import React from 'react';
import { PropertyAreaComparison } from '../../types/propertyGeometry';
import { Calculator, AlertTriangle, CheckCircle2, Info, ArrowRightLeft } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';

interface AreaComparisonCardProps {
  totalMetrics: {
    totalAreaSquareMeters: number;
    totalAreaHectares: number;
    totalPerimeterMeters: number;
    totalPerimeterKilometers: number;
    totalVertexCount: number;
    totalVoidCount: number;
    totalParcelCount: number;
  };
  areaComparison: PropertyAreaComparison;
}

export const AreaComparisonCard: React.FC<AreaComparisonCardProps> = ({
  totalMetrics,
  areaComparison,
}) => {
  const getDiscrepancyBadge = (level: string) => {
    switch (level) {
      case 'none':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#78C89A]/30 text-[#0B3D2E]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Convergência Alta (&lt; 0.5%)
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#78C89A]/20 text-[#0B3D2E]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Divergência Baixa (0.5% - 2%)
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            Divergência Moderada (2% - 5%)
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            Divergência Crítica (&gt; 5%)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#0B3D2E]/10 text-[#0B3D2E]">
            <Info className="w-3.5 h-3.5" />
            Não Informado
          </span>
        );
    }
  };

  return (
    <div id="agrocore-area-comparison-card" className="space-y-4">
      {/* Bloco de Métricas Geodésicas Calculadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-2xs">
          <div className="text-[11px] font-bold text-[#0B3D2E]/70 uppercase tracking-wider">
            Área Calculada (ha)
          </div>
          <div className="text-2xl font-black text-[#0B3D2E] mt-1">
            {totalMetrics.totalAreaHectares.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            <span className="text-xs font-bold text-[#0B3D2E]/60 ml-1">ha</span>
          </div>
          <div className="text-[11px] text-[#0B3D2E]/70 mt-0.5">
            {totalMetrics.totalAreaSquareMeters.toLocaleString('pt-BR')} m²
          </div>
        </div>

        <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-2xs">
          <div className="text-[11px] font-bold text-[#0B3D2E]/70 uppercase tracking-wider">
            Perímetro Total
          </div>
          <div className="text-2xl font-black text-[#0B3D2E] mt-1">
            {totalMetrics.totalPerimeterKilometers.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span className="text-xs font-bold text-[#0B3D2E]/60 ml-1">km</span>
          </div>
          <div className="text-[11px] text-[#0B3D2E]/70 mt-0.5">
            {totalMetrics.totalPerimeterMeters.toLocaleString('pt-BR')} metros
          </div>
        </div>

        <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-2xs">
          <div className="text-[11px] font-bold text-[#0B3D2E]/70 uppercase tracking-wider">
            Total de Glebas
          </div>
          <div className="text-2xl font-black text-[#0B3D2E] mt-1">
            {totalMetrics.totalParcelCount}
            <span className="text-xs font-bold text-[#0B3D2E]/60 ml-1">gleba(s)</span>
          </div>
          <div className="text-[11px] text-[#0B3D2E]/70 mt-0.5">
            {totalMetrics.totalVoidCount} vazio(s) interno(s)
          </div>
        </div>

        <div className="p-4 bg-white border border-[#0B3D2E]/15 rounded-2xl shadow-2xs">
          <div className="text-[11px] font-bold text-[#0B3D2E]/70 uppercase tracking-wider">
            Vértices Totais
          </div>
          <div className="text-2xl font-black text-[#0B3D2E] mt-1">
            {totalMetrics.totalVertexCount}
            <span className="text-xs font-bold text-[#0B3D2E]/60 ml-1">pontos</span>
          </div>
          <div className="text-[11px] text-[#0B3D2E]/70 mt-0.5">
            SIRGAS2000 / GRS80
          </div>
        </div>
      </div>

      {/* Tabela de Comparação com Fontes Documentais Cadastradas */}
      <div className="border border-[#0B3D2E]/15 rounded-2xl bg-white p-4 space-y-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#0B3D2E]/10 pb-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#78C89A]" />
            <h4 className="text-sm font-bold text-[#0B3D2E]">
              Confrontação com Fontes Documentais Cadastradas
            </h4>
          </div>
          {getDiscrepancyBadge(areaComparison.summary.overallDiscrepancyLevel)}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#0B3D2E]/5 text-[#0B3D2E] font-bold border-b border-[#0B3D2E]/10">
                <th className="py-2.5 px-3">Fonte Documental Cadastrada</th>
                <th className="py-2.5 px-3">Área Informada no Documento</th>
                <th className="py-2.5 px-3">Área Geométrica Calculada</th>
                <th className="py-2.5 px-3">Divergência Calculada</th>
                <th className="py-2.5 px-3">Diferença (%)</th>
                <th className="py-2.5 px-3">Convergência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B3D2E]/10 text-[#0B3D2E]">
              {areaComparison.sources.map((item, idx) => (
                <tr key={idx} className="hover:bg-[#78C89A]/10 transition-colors">
                  <td className="py-2.5 px-3 font-semibold">{item.sourceName}</td>
                  <td className="py-2.5 px-3">
                    {item.areaHectares !== undefined
                      ? `${item.areaHectares.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha`
                      : 'Não cadastrado'}
                  </td>
                  <td className="py-2.5 px-3 font-bold">
                    {areaComparison.calculatedAreaHectares.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                  </td>
                  <td className="py-2.5 px-3">
                    {item.differenceHectares !== undefined ? (
                      <span
                        className={
                          item.differenceHectares > 0
                            ? 'text-[#0B3D2E]'
                            : 'text-amber-800'
                        }
                      >
                        {item.differenceHectares > 0 ? '+' : ''}
                        {item.differenceHectares.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {item.differencePercentage !== undefined ? (
                      <span className="font-bold">
                        {item.differencePercentage > 0 ? '+' : ''}
                        {item.differencePercentage.toFixed(2)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3">{getDiscrepancyBadge(item.discrepancyLevel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Nota técnica sobre comparativo documental */}
        <div className="text-[11px] text-[#0B3D2E]/80 bg-[#0B3D2E]/5 p-3 rounded-xl leading-relaxed">
          <strong>Aviso sobre Fontes Documentais:</strong> Os valores comparados provêm exclusivamente de dados informados no cadastro do imóvel (documento não verificado externamente). O sistema não realiza consulta nem validação automatizada junto a bancos de dados oficiais externos (CAR, SIGEF, SNCR ou Cartórios). Variações entre a geometria calculada e os documentos podem decorrer de métodos de medição históricos ou projeções cartográficas.
        </div>
      </div>
    </div>
  );
};
