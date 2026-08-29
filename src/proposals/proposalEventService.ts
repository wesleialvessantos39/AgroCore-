/**
 * MÓDULO 005 — SISTEMA DE EVENTOS E NOTIFICAÇÕES EM MEMÓRIA
 * AgroCore
 */

import { ProposalId, ProposalStatus } from '../types/proposals';

export type ProposalEventType =
  | 'proposal.submitted'
  | 'proposal.review.assigned'
  | 'proposal.review.reassigned'
  | 'proposal.review.started'
  | 'proposal.changes_requested'
  | 'proposal.resubmitted'
  | 'proposal.approved'
  | 'proposal.rejected'
  | 'proposal.presented'
  | 'proposal.accepted'
  | 'proposal.declined'
  | 'proposal.expired'
  | 'proposal.cancelled';

export interface ProposalDomainEvent {
  readonly id: string;
  readonly type: ProposalEventType;
  readonly organizationId: string;
  readonly proposalId: ProposalId;
  readonly proposalNumber: string;
  readonly status: ProposalStatus;
  readonly versionNumber: number;
  readonly actorUserId: string;
  readonly correlationId: string;
  readonly timestamp: string; // ISO
  readonly payload: Record<string, unknown>;
}

export interface ProposalNotification {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly proposalId: ProposalId;
  readonly proposalNumber: string;
  readonly type: ProposalEventType;
  readonly title: string;
  readonly message: string;
  readonly read: boolean;
  readonly createdAt: string; // ISO
}

class ProposalEventBus {
  private static instance: ProposalEventBus;
  private readonly events: ProposalDomainEvent[] = [];
  private readonly notifications: ProposalNotification[] = [];
  private readonly listeners: ((event: ProposalDomainEvent) => void)[] = [];

  private constructor() {}

  public static getInstance(): ProposalEventBus {
    if (!ProposalEventBus.instance) {
      ProposalEventBus.instance = new ProposalEventBus();
    }
    return ProposalEventBus.instance;
  }

  public emit(event: ProposalDomainEvent): void {
    this.events.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Erro ao processar listener de evento de proposta:', err);
      }
    }
  }

  public addNotification(notification: Omit<ProposalNotification, 'id' | 'read'>): ProposalNotification {
    const newNotif: ProposalNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      read: false,
    };
    this.notifications.push(newNotif);
    return newNotif;
  }

  public getNotificationsForUser(
    organizationId: string,
    recipientUserId: string
  ): readonly ProposalNotification[] {
    return this.notifications
      .filter(
        (n) => n.organizationId === organizationId && n.recipientUserId === recipientUserId
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getNotifications(
    organizationId: string,
    recipientUserId: string
  ): readonly ProposalNotification[] {
    return this.getNotificationsForUser(organizationId, recipientUserId);
  }

  public markNotificationAsRead(organizationId: string, notificationId: string): boolean {
    const idx = this.notifications.findIndex(
      (n) => n.organizationId === organizationId && n.id === notificationId
    );
    if (idx !== -1) {
      const current = this.notifications[idx];
      this.notifications[idx] = { ...current, read: true };
      return true;
    }
    return false;
  }

  public subscribe(listener: (event: ProposalDomainEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public getEventsForProposal(organizationId: string, proposalId: ProposalId): readonly ProposalDomainEvent[] {
    return this.events.filter(
      (e) => e.organizationId === organizationId && e.proposalId === proposalId
    );
  }

  public clear(): void {
    this.events.length = 0;
    this.notifications.length = 0;
    this.listeners.length = 0;
  }

  public clearAll(): void {
    this.clear();
  }
}

export const proposalEventBus = ProposalEventBus.getInstance();
