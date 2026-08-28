import fs from 'fs';
import path from 'path';

console.log('=== TESTE DE IDENTIDADE VISUAL AGROCORE — MÓDULO 003 (OE-003.002-R2) ===\n');

const propertyFiles = [
  'src/properties/components/PropertyForm.tsx',
  'src/properties/components/PropertyClientSelector.tsx',
  'src/properties/components/AreaComparisonCard.tsx',
  'src/properties/components/BoundarySegmentsEditor.tsx',
  'src/properties/components/GeometryValidationIssues.tsx',
  'src/properties/components/InnerVoidsEditor.tsx',
  'src/properties/components/PropertyGeometryViewer.tsx',
  'src/properties/components/ReorganizeVerticesModal.tsx',
  'src/properties/components/VertexEditor.tsx',
  'src/pages/PropertiesPage.tsx',
  'src/pages/PropertyCreatePage.tsx',
  'src/pages/PropertyEditPage.tsx',
  'src/pages/PropertyGeometryPage.tsx',
];

let allPassed = true;

// Padrões estritamente proibidos na identidade AgroCore
const prohibitedPatterns = [
  { name: "Classes 'dark:' residuais", regex: /dark:[a-zA-Z0-9_\-\/]+/g },
  { name: "Família 'slate-*'", regex: /(bg|text|border|ring|placeholder|divide)-slate-[0-9]+/g },
  { name: "Família 'gray-*'", regex: /(bg|text|border|ring|placeholder|divide)-gray-[0-9]+/g },
  { name: "Família 'zinc-*'", regex: /(bg|text|border|ring|placeholder|divide)-zinc-[0-9]+/g },
  { name: "Família 'neutral-*'", regex: /(bg|text|border|ring|placeholder|divide)-neutral-[0-9]+/g },
  { name: "Família 'stone-*'", regex: /(bg|text|border|ring|placeholder|divide)-stone-[0-9]+/g },
  { name: "Overlay 'bg-black/*'", regex: /bg-black(\/[0-9]+)?/g },
  { name: "Texto 'text-black'", regex: /text-black/g },
];

for (const relPath of propertyFiles) {
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

  // Verificar presença da cor oficial AgroCore (#0B3D2E ou import do PROPERTY_THEME)
  const hasOfficialPalette = content.includes('#0B3D2E') || content.includes('PROPERTY_THEME');
  if (!hasOfficialPalette) {
    console.warn(`  ⚠️ Aviso: Paleta oficial AgroCore não encontrada explicitamente em ${relPath}`);
  } else {
    console.log(`  ✅ Utiliza os padrões oficiais AgroCore (#0B3D2E / PROPERTY_THEME).`);
  }

  console.log('');
}

if (!allPassed) {
  console.error('❌ Falha na validação de tema visual do Módulo 003 (OE-003.002-R2)!');
  process.exit(1);
} else {
  console.log('✅ HOMOLOGAÇÃO VISUAL CONCLUÍDA: TODAS AS TELAS DO MÓDULO 003 EM CONFORMIDADE TOTAL COM A IDENTIDADE AGROCORE!');
  process.exit(0);
}
