/**
 * Implementação em Memória do Gateway de Notificações Operacionais
 * Ambiente de Preview / Desenvolvimento — AgroCore
 */

import { AppraisalOperationalNotification } from '../../types/appraisal';
import { AppraisalNotificationsGateway } from '../notificationsGateway';

export class PreviewAppraisalNotificationsGateway implements AppraisalNotificationsGateway {
  private readonly store = new Map<string, AppraisalOperationalNotification[]>();

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `notif_${crypto.randomUUID()}`;
    }
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async listNotifications(
    organizationId: string,
    recipientUserId?: string,
    recipientRole?: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalOperationalNotification[]> {
    if (signal?.aborted) {
      throw new DOMException('Operação cancelada', 'AbortError');
    }
    if (!organizationId) return [];

    const orgItems = this.store.get(organizationId) || [];
    const filtered = orgItems.filter((item) => {
      if (recipientUserId && item.recipientUserId === recipientUserId) {
        return true;
      }
      if (recipientRole && item.recipientRole === recipientRole) {
        return true;
      }
      if (!recipientUserId && !recipientRole) {
        return true;
      }
      return false;
    });

    return Object.freeze(
      [...filtered].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
  }

  async markAsRead(
    organizationId: string,
    notificationId: string
  ): Promise<AppraisalOperationalNotification> {
    if (!organizationId || !notificationId) {
      throw new Error('Organização e identificador da notificação são obrigatórios.');
    }

    const orgItems = this.store.get(organizationId) || [];
    const targetIndex = orgItems.findIndex((item) => item.id === notificationId);

    if (targetIndex === -1) {
      throw new Error(`Notificação ${notificationId} não localizada.`);
    }

    const target = orgItems[targetIndex];
    if (target.readAt) {
      return Object.freeze({ ...target });
    }

    const updated: AppraisalOperationalNotification = Object.freeze({
      ...target,
      readAt: new Date().toISOString(),
    });

    const updatedList = [...orgItems];
    updatedList[targetIndex] = updated;
    this.store.set(organizationId, updatedList);

    return updated;
  }

  async dispatchNotification(
    organizationId: string,
    input: Omit<AppraisalOperationalNotification, 'id' | 'createdAt' | 'organizationId'>
  ): Promise<AppraisalOperationalNotification> {
    if (!organizationId) {
      throw new Error('Organização obrigatória para despacho de notificação.');
    }

    const orgItems = this.store.get(organizationId) || [];
    const newNotification: AppraisalOperationalNotification = Object.freeze({
      id: this.generateId(),
      organizationId,
      recipientUserId: input.recipientUserId,
      recipientRole: input.recipientRole,
      type: input.type,
      clientId: input.clientId,
      propertyId: input.propertyId,
      appraisalId: input.appraisalId,
      appraisalRequestId: input.appraisalRequestId,
      title: input.title,
      message: input.message,
      correlationId: input.correlationId || `corr_${Date.now()}`,
      createdAt: new Date().toISOString(),
      readAt: undefined,
    });

    this.store.set(organizationId, [newNotification, ...orgItems]);
    return newNotification;
  }

  async getUnreadCount(
    organizationId: string,
    recipientUserId?: string,
    recipientRole?: string
  ): Promise<number> {
    if (!organizationId) return 0;
    const items = await this.listNotifications(organizationId, recipientUserId, recipientRole);
    return items.filter((item) => !item.readAt).length;
  }

  clearAllSessionData(): void {
    this.store.clear();
  }
}
