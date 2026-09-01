import type {
  DocumentReference,
  DocumentVersionComparableField,
  DocumentVersionMetadataChange,
} from '../types/documents';

const FIELD_LABELS: Readonly<Record<DocumentVersionComparableField, string>> = Object.freeze({
  displayName: 'Nome do documento',
  mimeType: 'Formato',
  fileSizeBytes: 'Tamanho do arquivo',
  issuedOn: 'Data de emissão',
  expiresOn: 'Data de validade',
  notes: 'Observação do documento',
});

const COMPARABLE_FIELDS: readonly DocumentVersionComparableField[] = Object.freeze([
  'displayName',
  'mimeType',
  'fileSizeBytes',
  'issuedOn',
  'expiresOn',
  'notes',
]);

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function displayValue(
  reference: DocumentReference,
  field: DocumentVersionComparableField
): string {
  const value = reference[field];
  if (field === 'fileSizeBytes') {
    return typeof value === 'number' ? formatBytes(value) : 'Não informado';
  }
  if (value === undefined || value === null || value === '') return 'Não informado';
  return String(value);
}

/**
 * Compara somente metadados autorizados. Caminho privado, checksum, conteúdo e
 * identificadores internos nunca integram a projeção apresentada ao usuário.
 */
export function compareDocumentVersionMetadata(
  previous: DocumentReference,
  current: DocumentReference
): readonly DocumentVersionMetadataChange[] {
  if (
    previous.organizationId !== current.organizationId ||
    previous.logicalDocumentId !== current.logicalDocumentId
  ) {
    return [];
  }

  return COMPARABLE_FIELDS.flatMap((field) => {
    const previousValue = displayValue(previous, field);
    const currentValue = displayValue(current, field);
    return previousValue === currentValue
      ? []
      : [{ field, label: FIELD_LABELS[field], previousValue, currentValue }];
  });
}

export function sortDocumentVersionHistory(
  versions: readonly DocumentReference[]
): readonly DocumentReference[] {
  return [...versions].sort(
    (left, right) =>
      right.versionNumber - left.versionNumber ||
      right.createdAt.localeCompare(left.createdAt) ||
      left.id.localeCompare(right.id)
  );
}
