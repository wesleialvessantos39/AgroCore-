import { readFileSync } from 'node:fs';

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const clientConfiguration = readFileSync(
  new URL('../src/infrastructure/supabaseClient.ts', import.meta.url),
  'utf8'
);
const viteTypes = readFileSync(new URL('../src/vite-env.d.ts', import.meta.url), 'utf8');

const assignments = example
  .split(/\r?\n/)
  .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line.trim()));

if (assignments.length > 0) {
  throw new Error('O arquivo de exemplo não pode solicitar variáveis ao ambiente de pré-visualização.');
}

const promptTriggerNames = /\b(?:GEMINI_API_KEY|APP_URL|VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY)\b/;
if (promptTriggerNames.test([example, clientConfiguration, viteTypes].join('\n'))) {
  throw new Error('Nomes que acionam solicitação de chaves não podem ficar expostos no preview.');
}

if (/\bVITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|API_KEY)\b/.test(example)) {
  throw new Error('Variável sensível não pode ser declarada para o cliente web.');
}

if (/\$\{\{\s*secrets\./.test(workflow)) {
  throw new Error('O AgroCore CI deve executar a homologação sem depender de segredos.');
}

console.log('Contrato de ambiente aprovado: desenvolvimento e CI não solicitam chaves.');
