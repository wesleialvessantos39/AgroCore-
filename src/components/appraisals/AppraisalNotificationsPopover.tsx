/**
 * Componente de Central de Notificações Operacionais de Laudos
 * Módulo 004 — AgroCore
 */

import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Clock, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { useAppraisalNotifications } from '../../hooks/useAppraisalNotifications';
import { AppraisalOperationalNotification } from '../../types/appraisal';

export function AppraisalNotificationsPopover() {
  const { notifications, unreadCount, markAsRead, refreshNotifications } = useAppraisalNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      refreshNotifications();
    }
    setIsOpen(!isOpen);
  };

  const getIcon = (type: AppraisalOperationalNotification['type']) => {
    switch (type) {
      case 'new_request_in_queue':
        return <Clock className="w-4 h-4 text-[#0B3D2E]" />;
      case 'request_assigned':
      case 'request_reassigned':
        return <FileText className="w-4 h-4 text-[#0B3D2E]" />;
      case 'request_converted':
      case 'direct_appraisal_started':
        return <CheckCircle2 className="w-4 h-4 text-[#78C89A]" />;
      default:
        return <AlertCircle className="w-4 h-4 text-[#0B3D2E]" />;
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef} id="appraisal-notifications-container">
      <button
        type="button"
        id="appraisal-notifications-toggle"
        onClick={handleToggle}
        className="relative p-2 rounded-lg text-[#0B3D2E] hover:bg-[#0B3D2E]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[#78C89A]"
        aria-label="Notificações operacionais"
        title="Notificações Operacionais"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            id="appraisal-notifications-badge"
            className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-[#0B3D2E] border border-white rounded-full"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="appraisal-notifications-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#0B3D2E]/20 rounded-xl shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-[#0B3D2E] text-white">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#78C89A]" />
              <h3 className="font-semibold text-sm">Notificações Operacionais</h3>
            </div>
            {unreadCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">
                {unreadCount} não lida{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#0B3D2E]/10">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-[#0B3D2E]/60 text-sm">
                Nenhuma notificação registrada até o momento.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  id={`notification-item-${notif.id}`}
                  className={`p-3 transition-colors ${
                    notif.readAt ? 'bg-white' : 'bg-[#0B3D2E]/5 font-medium'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 p-1 rounded bg-[#0B3D2E]/10">
                        {getIcon(notif.type)}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-[#0B3D2E] leading-tight">
                          {notif.title}
                        </h4>
                        <p className="text-xs text-[#0B3D2E]/80 mt-1 leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="text-[10px] text-[#0B3D2E]/50 mt-1 block">
                          {new Date(notif.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    {!notif.readAt && (
                      <button
                        type="button"
                        id={`mark-read-${notif.id}`}
                        onClick={() => markAsRead(notif.id)}
                        className="p-1 rounded text-[#0B3D2E]/60 hover:text-[#0B3D2E] hover:bg-[#0B3D2E]/10 transition-colors"
                        title="Marcar como lida"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
