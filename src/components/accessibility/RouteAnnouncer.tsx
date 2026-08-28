import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getRouteMetadata } from '../../routes/routeMetadata';

export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const metadata = getRouteMetadata(pathname);
    setAnnouncement(`Navegou para: ${metadata.announcementTitle}`);
  }, [pathname]);

  return (
    <div
      id="agrocore-route-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
