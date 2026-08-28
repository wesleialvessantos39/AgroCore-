import React from 'react';
import { Navigate } from 'react-router-dom';
import { Permission } from '../types/authorization';
import { useAuthorization } from './useAuthorization';
import { RouteLoadingScreen } from '../components/feedback/RouteLoadingScreen';
import { ROUTES } from '../routes/paths';

export interface RequirePermissionProps {
  permission: Permission | readonly Permission[];
  requireAll?: boolean;
  redirectTo?: string;
  children: React.ReactNode;
}

export function RequirePermission({
  permission,
  requireAll = false,
  redirectTo = ROUTES.ACCESS_DENIED,
  children,
}: RequirePermissionProps) {
  const { can, canAll, canAny, isLoading } = useAuthorization();

  if (isLoading) {
    return <RouteLoadingScreen />;
  }

  let hasAccess = false;
  if (Array.isArray(permission)) {
    hasAccess = requireAll ? canAll(permission) : canAny(permission);
  } else {
    hasAccess = can(permission as Permission);
  }

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
