/**
 * Hook para Notificações Operacionais de Laudos de Avaliação
 * Módulo 004 — AgroCore
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useOrganization } from '../organization/useOrganization';
import { getAppraisalNotificationsGateway } from '../appraisals/notificationsGatewayFactory';
import { AppraisalOperationalNotification } from '../types/appraisal';

export function useAppraisalNotifications() {
  const { session } = useAuth();
  const { activeOrganization } = useOrganization();
  const [notifications, setNotifications] = useState<readonly AppraisalOperationalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!activeOrganization?.id || !session?.user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      setLoading(true);
      const gateway = getAppraisalNotificationsGateway();
      const items = await gateway.listNotifications(
        activeOrganization.id,
        session.user.id,
        session.organizationRole
      );
      setNotifications(items);
      const unread = items.filter((n) => !n.readAt).length;
      setUnreadCount(unread);
    } catch {
      // Falha silenciosa em background
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?.id, session?.user?.id, session?.organizationRole]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!activeOrganization?.id) return;
      try {
        const gateway = getAppraisalNotificationsGateway();
        await gateway.markAsRead(activeOrganization.id, notificationId);
        setNotifications((prev) =>
          prev.map((item) =>
            item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // Tolerância
      }
    },
    [activeOrganization?.id]
  );

  return {
    notifications,
    unreadCount,
    loading,
    refreshNotifications: loadNotifications,
    markAsRead,
  };
}
