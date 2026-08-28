import fs from 'fs';
import path from 'path';

console.log('=== TESTE DE IDENTIDADE VISUAL AGROCORE — MÓDULO 004 (OE-004.001-R4) ===\n');

const appraisalFiles = [
  'src/appraisals/theme.ts',
  'src/pages/AppraisalsPage.tsx',
  'src/pages/AppraisalRequestsPage.tsx',
  'src/components/appraisals/AppraisalHomogenizationTable.tsx',
  'src/components/appraisals/AppraisalImprovementsEditor.tsx',
  'src/components/appraisals/AppraisalIssuancePanel.tsx',
  'src/components/appraisals/AppraisalDossierWorkspace.tsx',
  'src/components/appraisals/DirectAppraisalModal.tsx',
  'src/components/appraisals/CapturerAppraisalDetailModal.tsx',
  'src/components/appraisals/AppraisalNotificationsPopover.tsx',
];

let allPassed = true;

// Padrões estritamente proibidos na identidade AgroCore (OE-004.001-R4)
const prohibitedPatterns = [
  { name: "Classes 'dark:' residuais", regex: /dark:[a-zA-Z0-9_\-\/]+/g },
  { name: "Família 'slate-*'", regex: /(bg|text|border|ring|placeholder|divide)-slate-[0-9]+/g },
  { name: "Família 'gray-*'", regex: /(bg|text|border|ring|placeholder|divide)-gray-[0-9]+/g },
  { name: "Família 'zinc-*'", regex: /(bg|text|border|ring|placeholder|divide)-zinc-[0-9]+/g },
  { name: "Família 'neutral-*'", regex: /(bg|text|border|ring|placeholder|divide)-neutral-[0-9]+/g },
  { name: "Família 'stone-*'", regex: /(bg|text|border|ring|placeholder|divide)-stone-[0-9]+/g },
  { name: "Família 'rose-*'", regex: /(bg|text|border|ring|placeholder|divide)-rose-[0-9]+/g },
  { name: "Família 'red-*'", regex: /(bg|text|border|ring|placeholder|divide)-red-[0-9]+/g },
  { name: "Família 'amber-*'", regex: /(bg|text|border|ring|placeholder|divide)-amber-[0-9]+/g },
  { name: "Família 'yellow-*'", regex: /(bg|text|border|ring|placeholder|divide)-yellow-[0-9]+/g },
  { name: "Família 'emerald-*'", regex: /(bg|text|border|ring|placeholder|divide)-emerald-[0-9]+/g },
  { name: "Família 'blue-*'", regex: /(bg|text|border|ring|placeholder|divide)-blue-[0-9]+/g },
  { name: "Família 'indigo-*'", regex: /(bg|text|border|ring|placeholder|divide)-indigo-[0-9]+/g },
  { name: "Família 'violet-*'", regex: /(bg|text|border|ring|placeholder|divide)-violet-[0-9]+/g },
  { name: "Família 'purple-*'", regex: /(bg|text|border|ring|placeholder|divide)-purple-[0-9]+/g },
  { name: "Família 'sky-*'", regex: /(bg|text|border|ring|placeholder|divide)-sky-[0-9]+/g },
  { name: "Família 'cyan-*'", regex: /(bg|text|border|ring|placeholder|divide)-cyan-[0-9]+/g },
  { name: "Overlay 'bg-black/*'", regex: /bg-black(\/[0-9]+)?/g },
  { name: "Texto 'text-black'", regex: /text-black/g },
];

for (const relPath of appraisalFiles) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Arquivo não encontrado: ${relPath}`);
    allPassed = false;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  console.log(`Verificando arquivo: ${relPath}`);

  let fileHasError = false;

  for (const { name, regex } of prohibitedPatterns) {
    const matches = content.match(regex) || [];
    if (matches.length > 0) {
      console.error(`  ❌ Encontradas ${matches.length} ocorrências de ${name}:`, matches.slice(0, 5));
      allPassed = false;
      fileHasError = true;
    }
  }

  if (!fileHasError) {
    console.log(`  ✅ Purga total de classes proibidas aprovada.`);
  }

  // Verificar presença da cor oficial AgroCore (#0B3D2E ou import do APPRAISAL_THEME)
  const hasOfficialPalette = content.includes('#0B3D2E') || content.includes('APPRAISAL_THEME');
  if (!hasOfficialPalette) {
    console.warn(`  ⚠️ Aviso: Paleta oficial AgroCore não encontrada explicitamente em ${relPath}`);
  } else {
    console.log(`  ✅ Utiliza os padrões oficiais AgroCore (#0B3D2E / APPRAISAL_THEME).`);
  }

  console.log('');
}

if (!allPassed) {
  console.error('❌ Falha na validação de tema visual do Módulo 004 (OE-004.001-R1)!');
  process.exit(1);
} else {
  console.log('✅ HOMOLOGAÇÃO VISUAL CONCLUÍDA: TODAS AS TELAS DO MÓDULO 004 EM CONFORMIDADE TOTAL COM A IDENTIDADE AGROCORE!');
  process.exit(0);
}
