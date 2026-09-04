/**
 * Compatibilidade temporária do Módulo 004.
 *
 * A UI independente de notificações de Laudos foi desativada na OE-008.005
 * para que exista uma única Central de Notificações in-app no AppShell.
 * Os contratos/eventos do domínio de Laudos permanecem preservados até que
 * sua persistência canônica real seja integrada à central, sem promover dados
 * de preview ou criar uma segunda fonte de verdade.
 */
export function AppraisalNotificationsPopover() {
  return null;
}
