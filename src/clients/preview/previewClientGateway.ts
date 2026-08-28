import {
  Client,
  ClientGateway,
  ClientListPage,
  ClientListQuery,
  CreateClientInput,
  UpdateClientInput,
} from '../../types/client';
import {
  normalizeDigits,
  normalizeSearchTerm,
} from '../validators';

/**
 * PreviewClientGateway
 *
 * Implementação em memória exclusiva para o ambiente de desenvolvimento.
 * - Armazenamento temporário estritamente volátil (Map em memória).
 * - Sem persistência em localStorage, sessionStorage ou IndexedDB.
 * - Inicia com coleção vazia (sem dados de exemplo ou registros pré-carregados).
 * - Isolamento rígido por organizationId.
 * - Validação autoritativa de unicidade de CPF/CNPJ por organização.
 */
export class PreviewClientGateway implements ClientGateway {
  // Coleção volátil em memória separada por organizationId
  private readonly clientsByOrganization: Map<string, Client[]> = new Map();

  /**
   * Limpa integralmente a memória volátil (utilizado no logout ou reinício de sessão).
   * Implementa o contrato canônico clearAllSessionData().
   */
  clearAllSessionData(): void {
    this.clientsByOrganization.clear();
  }

  /**
   * Alias de compatibilidade para clearAllSessionData.
   */
  clearTemporaryData(): void {
    this.clearAllSessionData();
  }

  /**
   * Obtém o documento normalizado do cliente (CPF ou CNPJ)
   */
  private getClientDocumentDigits(client: Client | CreateClientInput | UpdateClientInput): string {
    if (client.personType === 'individual') {
      return normalizeDigits(client.cpf);
    }
    return normalizeDigits(client.cnpj);
  }

  /**
   * Consulta paginada, filtrada e ordenada de clientes de uma organização.
   *
   * Ordem de processamento autoritativa:
   * 1. Selecionar somente a organização solicitada.
   * 2. Aplicar busca por nome completo, razão social, nome fantasia, CPF ou CNPJ.
   * 3. Aplicar filtro de tipo de pessoa (individual / legal_entity / all).
   * 4. Aplicar filtro de situação (active / inactive / all).
   * 5. Aplicar ordenação respeitando o idioma pt-BR e desempate determinístico.
   * 6. Calcular o total de registros encontrados.
   * 7. Aplicar paginação com corte seguro.
   * 8. Retornar a página solicitada com os metadados calculados.
   */
  async listClients(
    query: ClientListQuery,
    signal?: AbortSignal
  ): Promise<ClientListPage> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { organizationId } = query;
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      throw new Error('organizationId é obrigatório para consultar clientes da organização.');
    }

    // 1. Selecionar somente a organização solicitada
    const orgClients = this.clientsByOrganization.get(organizationId) || [];
    let filtered = [...orgClients];

    // 2. Aplicar busca
    if (query.searchTerm && query.searchTerm.trim().length > 0) {
      const rawTerm = query.searchTerm.slice(0, 100).trim();
      const normalizedTextTerm = normalizeSearchTerm(rawTerm);
      const isDocumentSearch = /^[\d.\-/ ]+$/.test(rawTerm);
      const digitsTerm = isDocumentSearch ? normalizeDigits(rawTerm) : '';

      filtered = filtered.filter((client) => {
        if (client.personType === 'individual') {
          const normalizedName = normalizeSearchTerm(client.name);
          const cpfDigits = normalizeDigits(client.cpf);
          const matchesName = normalizedName.includes(normalizedTextTerm);
          const matchesCpf = isDocumentSearch && digitsTerm.length > 0 && cpfDigits.includes(digitsTerm);
          return matchesName || matchesCpf;
        } else {
          const normalizedCompanyName = normalizeSearchTerm(client.companyName);
          const normalizedTradeName = normalizeSearchTerm(client.tradeName || '');
          const cnpjDigits = normalizeDigits(client.cnpj);
          const matchesCompanyName = normalizedCompanyName.includes(normalizedTextTerm);
          const matchesTradeName =
            normalizedTradeName.length > 0 && normalizedTradeName.includes(normalizedTextTerm);
          const matchesCnpj = isDocumentSearch && digitsTerm.length > 0 && cnpjDigits.includes(digitsTerm);
          return matchesCompanyName || matchesTradeName || matchesCnpj;
        }
      });
    }

    // 3. Aplicar filtro de tipo
    if (query.personType && query.personType !== 'all') {
      filtered = filtered.filter((c) => c.personType === query.personType);
    }

    // 4. Aplicar filtro de situação
    if (query.status && query.status !== 'all') {
      filtered = filtered.filter((c) => c.status === query.status);
    }

    // 5. Aplicar ordenação
    const sortOption = query.sort || 'name_asc';
    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

    const sorted = [...filtered].sort((a, b) => {
      if (sortOption === 'name_asc') {
        const nameA = a.personType === 'individual' ? a.name : a.companyName;
        const nameB = b.personType === 'individual' ? b.name : b.companyName;
        const cmp = collator.compare(nameA, nameB);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      }
      if (sortOption === 'name_desc') {
        const nameA = a.personType === 'individual' ? a.name : a.companyName;
        const nameB = b.personType === 'individual' ? b.name : b.companyName;
        const cmp = collator.compare(nameB, nameA);
        if (cmp !== 0) return cmp;
        return b.id.localeCompare(a.id);
      }
      if (sortOption === 'created_at_desc') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeB !== timeA) return timeB - timeA;
        return b.id.localeCompare(a.id);
      }
      if (sortOption === 'created_at_asc') {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      }
      return 0;
    });

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // 6. Calcular o total
    const total = sorted.length;
    const requestedSize = Number(query.pageSize);
    const pageSize = [10, 25, 50].includes(requestedSize) ? requestedSize : 10;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const requestedPage = Number(query.page);
    const safePage = Math.max(1, Math.min(isNaN(requestedPage) ? 1 : requestedPage, totalPages));

    // 7. Aplicar paginação
    const startIndex = (safePage - 1) * pageSize;
    const paginatedClients = total === 0 ? [] : sorted.slice(startIndex, startIndex + pageSize);

    // 8. Retornar somente a página solicitada
    return {
      items: JSON.parse(JSON.stringify(paginatedClients)),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getClientById(
    organizationId: string,
    clientId: string
  ): Promise<Client | null> {
    if (!organizationId || !clientId) {
      return null;
    }

    const orgClients = this.clientsByOrganization.get(organizationId) || [];
    const found = orgClients.find((c) => c.id === clientId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async createClient(
    organizationId: string,
    input: CreateClientInput
  ): Promise<Client> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim().length === 0) {
      throw new Error('organizationId é obrigatório para cadastrar cliente.');
    }

    const orgClients = this.clientsByOrganization.get(organizationId) || [];

    // Verificação autoritativa de unicidade de documento na organização
    const targetDoc = this.getClientDocumentDigits(input);
    const isDuplicate = orgClients.some((c) => this.getClientDocumentDigits(c) === targetDoc);

    if (isDuplicate) {
      throw new Error('Já existe um cliente com este documento nesta organização.');
    }

    const now = new Date().toISOString();
    const generatedId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const newClient: Client = {
      ...input,
      id: generatedId,
      organizationId,
      createdAt: now,
      updatedAt: now,
    } as Client;

    orgClients.push(newClient);
    this.clientsByOrganization.set(organizationId, orgClients);

    return JSON.parse(JSON.stringify(newClient));
  }

  async updateClient(
    organizationId: string,
    clientId: string,
    input: UpdateClientInput
  ): Promise<Client> {
    if (!organizationId || !clientId) {
      throw new Error('organizationId e clientId são obrigatórios para atualizar cliente.');
    }

    const orgClients = this.clientsByOrganization.get(organizationId) || [];
    const index = orgClients.findIndex((c) => c.id === clientId);

    if (index === -1) {
      throw new Error('Cliente não encontrado nesta organização.');
    }

    const existing = orgClients[index];

    // Impedimento de troca do tipo de pessoa na edição
    if (input.personType !== existing.personType) {
      throw new Error('Não é permitido alterar o tipo de pessoa (PF/PJ) de um cliente existente.');
    }

    // Verificação autoritativa de duplicidade de documento na organização (desconsiderando o próprio)
    const targetDoc = this.getClientDocumentDigits(input);
    const isDuplicate = orgClients.some(
      (c) => c.id !== clientId && this.getClientDocumentDigits(c) === targetDoc
    );

    if (isDuplicate) {
      throw new Error('Já existe um cliente com este documento nesta organização.');
    }

    const now = new Date().toISOString();

    const updatedClient: Client = {
      ...existing,
      ...input,
      id: existing.id,
      organizationId: existing.organizationId,
      createdAt: existing.createdAt,
      updatedAt: now,
    } as Client;

    orgClients[index] = updatedClient;
    this.clientsByOrganization.set(organizationId, orgClients);

    return JSON.parse(JSON.stringify(updatedClient));
  }
}
