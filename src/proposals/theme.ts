/**
 * TOKENS VISUAIS OFICIAIS AGROCORE — MÓDULO 005 (PROPOSTAS DE CRÉDITO E SERVIÇOS)
 * Paleta estrita:
 * - Verde-escuro institucional: #0B3D2E
 * - Verde-claro institucional: #78C89A
 * - Branco: #FFFFFF
 * - Tints e opacidades estritamente derivados dessa paleta
 *
 * Proibição total de famílias slate, gray, zinc, neutral, stone, black e classes dark:*
 * Proibição total de classes rose-*, red-*, amber-*, yellow-*, emerald-*, blue-*, etc.
 */

export const PROPOSAL_THEME = {
  // Superfícies
  surface: 'bg-white',
  surfaceCard: 'bg-white',
  surfaceSoft: 'bg-[#78C89A]/10',
  surfaceMuted: 'bg-[#0B3D2E]/5',
  surfaceBadge: 'bg-[#0B3D2E]/10',
  surfaceHover: 'hover:bg-[#78C89A]/15',
  surfaceActive: 'bg-[#78C89A]/20',

  // Textos
  textPrimary: 'text-[#0B3D2E]',
  textSecondary: 'text-[#0B3D2E]/70',
  textMuted: 'text-[#0B3D2E]/50',
  textInverse: 'text-white',

  // Bordas
  border: 'border-[#0B3D2E]/15',
  borderSoft: 'border-[#78C89A]/30',
  borderStrong: 'border-[#0B3D2E]',
  borderHover: 'hover:border-[#0B3D2E]/40',

  // Controles / Inputs
  input:
    'w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] placeholder-[#0B3D2E]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors',
  inputDisabled:
    'w-full px-3 py-2.5 text-sm bg-[#78C89A]/10 border border-[#0B3D2E]/10 rounded-xl text-[#0B3D2E]/40 cursor-not-allowed',
  select:
    'w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors',
  textarea:
    'w-full px-3 py-2.5 text-sm bg-white border border-[#0B3D2E]/20 rounded-xl text-[#0B3D2E] placeholder-[#0B3D2E]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E] transition-colors',

  // Botões
  btnPrimary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B3D2E] hover:bg-[#0B3D2E]/90 focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-xl shadow-xs transition-colors min-h-[44px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B3D2E] bg-white border border-[#0B3D2E] hover:bg-[#78C89A]/15 focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-xl shadow-2xs transition-colors min-h-[44px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  btnSecondarySmall:
    'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] bg-white border border-[#0B3D2E]/40 hover:bg-[#78C89A]/15 focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-lg transition-colors min-h-[44px] cursor-pointer disabled:opacity-50',
  btnMutedSmall:
    'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3D2E]/70 bg-transparent hover:bg-[#0B3D2E]/10 focus:outline-none focus:ring-2 focus:ring-[#78C89A] rounded-lg transition-colors min-h-[44px] cursor-pointer',

  // Modais e Overlays
  modalOverlay: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B3D2E]/60 backdrop-blur-xs',
  modalContent:
    'bg-white border border-[#0B3D2E]/20 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 text-[#0B3D2E]',

  // Focus ring
  focusRing: 'focus:outline-none focus:ring-2 focus:ring-[#78C89A] focus:border-[#0B3D2E]',
};
