/**
 * AgroCore - Módulo 003: Gestão Territorial e Imóveis
 * Modal de Reorganização e Orientação Técnica de Vértices
 * 
 * Reorganiza o anel externo para o padrão técnico de referência:
 * - Sentido horário (Clockwise)
 * - Ponto de início: Vértice mais ao Norte (com desempate pelo mais a Oeste)
 * - Renumeração sequencial dos vértices e atualização dos segmentos de limite
 */

import React from 'react';
import { GeoVertex } from '../../types/propertyGeometry';
import { Compass, Check, AlertCircle } from 'lucide-react';
import { PROPERTY_THEME } from '../theme';
import { organizeVerticesForTechnicalReference } from '../geometry/coordinateEngine';

interface ReorganizeVerticesModalProps {
  isOpen: boolean;
  vertices: GeoVertex[];
  onClose: () => void;
  onConfirm: () => void;
}

export const ReorganizeVerticesModal: React.FC<ReorganizeVerticesModalProps> = ({
  isOpen,
  vertices,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const reorganized = organizeVerticesForTechnicalReference(vertices);
  const firstOriginal = vertices[0];
  const firstReorganized = reorganized[0];

  return (
    <div className={PROPERTY_THEME.modalOverlay}>
      <div className={`${PROPERTY_THEME.modalContent} max-w-lg`}>
        <div className="flex items-center justify-between border-b border-[#0B3D2E]/15 pb-3">
          <h3 className="text-base font-bold text-[#0B3D2E] flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#78C89A]" />
            <span>Padronização Técnica de Vértices</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#0B3D2E]/60 hover:text-[#0B3D2E] text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs text-[#0B3D2E]/80">
          <p className="leading-relaxed">
            Esta operação reordena automaticamente os vértices da gleba ativa conforme as convenções cartográficas e cadastrais brasileiras:
          </p>

          <ul className="space-y-1.5 pl-5 list-disc font-medium text-[#0B3D2E]">
            <li>
              <strong>Ponto Inicial (V-01):</strong> Fixado no vértice situado mais ao Norte geográfico (maior latitude).
            </li>
            <li>
              <strong>Orientação do Perímetro:</strong> Sentido horário contínuo (Clockwise).
            </li>
            <li>
              <strong>Confrontações:</strong> Os segmentos de divisa serão ajustados para refletir a nova sequência.
            </li>
          </ul>

          {firstOriginal && firstReorganized && (
            <div className="p-3 bg-[#78C89A]/10 border border-[#0B3D2E]/15 rounded-xl space-y-1 text-[11px]">
              <div>
                <strong>Vértice Inicial Atual:</strong> {firstOriginal.code || `V-${firstOriginal.order}`} (Lat: {firstOriginal.coordinate.latitude.toFixed(5)}°)
              </div>
              <div>
                <strong>Novo Vértice Inicial (Mais ao Norte):</strong> {firstReorganized.code || `V-${firstReorganized.order}`} (Lat: {firstReorganized.coordinate.latitude.toFixed(5)}°)
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#0B3D2E]/10">
          <button
            type="button"
            onClick={onClose}
            className={PROPERTY_THEME.btnSecondarySmall}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={PROPERTY_THEME.btnPrimary}
          >
            <Check className="w-4 h-4" />
            <span>Aplicar Reorganização</span>
          </button>
        </div>
      </div>
    </div>
  );
};
