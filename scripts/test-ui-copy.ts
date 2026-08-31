/**
 * Barreira global contra identificadores internos de execução na interface.
 * Comentários técnicos permanecem permitidos; textos e atributos renderizáveis não.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const INTERNAL_ORDER_PATTERN = /\bOE\s*[-‐‑–—]\s*\d{3}(?:[.\-‐‑–—]\d{3})?/iu;
const INTERNAL_TECHNICAL_COPY_PATTERNS = [
  /\bchecksum\b/iu,
  /\bsha-?256\b/iu,
  /\bsnapshot(?:s)?\b/iu,
  /\bpayload\b/iu,
  /\bgateway\b/iu,
  /\bidempot(?:ente|ência|ency)?\b/iu,
  /\bidor\b/iu,
  /\bmultitenan(?:t|cy)?\b/iu,
  /\bmetadad(?:o|os)\b/iu,
  /\bcan[oô]nic(?:o|a|os|as)\b/iu,
  /\bbytes?\b/iu,
] as const;
const sourceRoot = path.resolve('src');
const violations: string[] = [];

function listTsxFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsxFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolute] : [];
  });
}

function inspectFile(filePath: string): void {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const inspect = (node: ts.Node): void => {
    let candidate: string | null = null;
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      candidate = node.text;
    }
    if (
      candidate &&
      (INTERNAL_ORDER_PATTERN.test(candidate) ||
        INTERNAL_TECHNICAL_COPY_PATTERNS.some((pattern) => pattern.test(candidate)))
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push(`${path.relative(process.cwd(), filePath)}:${position.line + 1}`);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(sourceFile);
}

for (const filePath of listTsxFiles(sourceRoot)) inspectFile(filePath);

if (violations.length > 0) {
  console.error('Identificadores ou termos internos encontrados em textos da interface:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('✅ Interface sem códigos de ordem ou termos internos de implementação.');
