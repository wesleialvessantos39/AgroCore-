/**
 * Implementação Indisponível do Gateway de Notificações de Laudos
 * Utilizada em produção enquanto o serviço em nuvem não estiver integrado.
 */

import { AppraisalOperationalNotification } from '../types/appraisal';
import { AppraisalNotificationsGateway } from './notificationsGateway';

export class UnavailableAppraisalNotificationsGateway implements AppraisalNotificationsGateway {
  async listNotifications(): Promise<readonly AppraisalOperationalNotification[]> {
    throw new Error('Serviço de notificações indisponível em produção.');
  }

  async markAsRead(): Promise<AppraisalOperationalNotification> {
    throw new Error('Serviço de notificações indisponível em produção.');
  }

  async dispatchNotification(): Promise<AppraisalOperationalNotification> {
    throw new Error('Serviço de notificações indisponível em produção.');
  }

  async getUnreadCount(): Promise<number> {
    return 0;
  }
}
