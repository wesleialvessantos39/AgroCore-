/**
 * Registro Centralizado e Desacoplado de Limpeza de Sessão / Domínio
 * AgroCore — Plataforma de Gestão Cadastral e Territorial
 *
 * Princípio Arquitetural:
 * A camada de autenticação e ciclo de vida de sessão não deve importar gateways
 * de preview diretamente nem acoplar-se às implementações concretas dos domínios.
 * Módulos, contextos e gateways registram callbacks de limpeza idempotentes.
 * Ao encerrar a sessão (logout manual, expiração por inatividade, troca de usuário),
 * a função `executeDomainSessionCleanup()` executa todas as limpezas de forma segura,
 * sem uso de `localStorage.clear()` ou `sessionStorage.clear()`.
 */

export type DomainCleanupHandler = () => void | Promise<void>;

const cleanupHandlers = new Set<DomainCleanupHandler>();

/**
 * Registra um callback para ser executado durante o encerramento da sessão ou troca de usuário.
 * Retorna uma função de desregistro para uso em useEffect ou teardown.
 */
export function registerDomainCleanup(handler: DomainCleanupHandler): () => void {
  cleanupHandlers.add(handler);
  return () => {
    cleanupHandlers.delete(handler);
  };
}

/**
 * Executa todas as limpezas registradas de maneira sequencial e protegida.
 * Falhas em um manipulador não impedem a execução dos demais.
 */
export async function executeDomainSessionCleanup(): Promise<void> {
  const handlers = Array.from(cleanupHandlers);
  for (const handler of handlers) {
    try {
      await handler();
    } catch {
      // Falha isolada é contida sem vazar exceções
    }
  }
}

/**
 * Retorna a contagem atual de manipuladores de limpeza registrados (útil para auditoria e testes).
 */
export function getRegisteredDomainCleanupCount(): number {
  return cleanupHandlers.size;
}

