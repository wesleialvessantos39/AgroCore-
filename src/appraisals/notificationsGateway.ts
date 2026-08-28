/**
 * Contrato do Gateway de Notificações Operacionais de Laudos
 * Módulo 004 — AgroCore
 */

import { AppraisalOperationalNotification } from '../types/appraisal';

export interface AppraisalNotificationsGateway {
  listNotifications(
    organizationId: string,
    recipientUserId?: string,
    recipientRole?: string,
    signal?: AbortSignal
  ): Promise<readonly AppraisalOperationalNotification[]>;

  markAsRead(
    organizationId: string,
    notificationId: string
  ): Promise<AppraisalOperationalNotification>;

  dispatchNotification(
    organizationId: string,
    input: Omit<AppraisalOperationalNotification, 'id' | 'createdAt' | 'organizationId'>
  ): Promise<AppraisalOperationalNotification>;

  getUnreadCount(
    organizationId: string,
    recipientUserId?: string,
    recipientRole?: string
  ): Promise<number>;

  clearAllSessionData?(): void;
}
