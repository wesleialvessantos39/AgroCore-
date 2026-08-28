import React from 'react';
import { Permission } from '../types/authorization';
import { useAuthorization } from './useAuthorization';

export interface PermissionGateProps {
  permission: Permission | readonly Permission[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  permission,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can, canAll, canAny } = useAuthorization();

  let hasAccess = false;
  if (Array.isArray(permission)) {
    hasAccess = requireAll ? canAll(permission) : canAny(permission);
  } else {
    hasAccess = can(permission as Permission);
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
