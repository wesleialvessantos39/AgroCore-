import fs from 'node:fs';

const TARGETS = [
  'src/pages/DocumentsPage.tsx',
  'src/pages/DocumentReferenceCreatePage.tsx',
  'src/pages/DocumentReferenceDetailPage.tsx',
  'src/pages/DocumentGovernancePage.tsx',
  'src/pages/DocumentRequirementCreatePage.tsx',
  'src/pages/ProposalChecklistsPage.tsx',
  'src/pages/DocumentCompliancePage.tsx',
  'src/pages/SharedDocumentPage.tsx',
];

const FORBIDDEN_COPY = [
  { pattern: /can[oô]nic/giu, label: 'linguagem interna sobre origem canônica' },
  { pattern: /metadad/giu, label: 'termo técnico metadado' },
  { pattern: /checksum/giu, label: 'termo técnico checksum' },
  { pattern: /sha-?256/giu, label: 'algoritmo de integridade' },
  { pattern: /\bbytes?\b/giu, label: 'unidade técnica de armazenamento' },
  { pattern: /\bentidade(?:s)?\b/giu, label: 'termo técnico entidade' },
  { pattern: /\bpayload\b/giu, label: 'termo técnico payload' },
  { pattern: /\bgateway\b/giu, label: 'termo técnico gateway' },
  { pattern: /\bidempot(?:ente|ência|ency)?\b/giu, label: 'termo técnico de idempotência' },
  { pattern: /\bidor\b/giu, label: 'sigla interna de segurança' },
  { pattern: /multitenan/giu, label: 'termo técnico multitenant' },
  { pattern: /\bOE[-‑–—]?\d{3}/gu, label: 'código interno de ordem' },
];

let violations = 0;

console.log('Auditando a linguagem pública das telas de documentos...');

for (const file of TARGETS) {
  const source = fs.readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN_COPY) {
    rule.pattern.lastIndex = 0;
    const matches = [...source.matchAll(rule.pattern)];
    for (const match of matches) {
      const line = source.slice(0, match.index).split('\n').length;
      console.error(`[TEXTO] ${file}:${line} contém ${rule.label}: ${JSON.stringify(match[0])}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  console.error(`❌ As telas de documentos contêm ${violations} ocorrência(s) de linguagem interna.`);
  process.exit(1);
}

console.log('✅ As telas de documentos usam linguagem clara e não expõem termos internos.');
