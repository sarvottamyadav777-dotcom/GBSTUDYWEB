import { useEffect, useState } from 'react';
import { Link, RouterProvider, useLocation } from './lib/router';
import { api, isAdminRouteUnlocked, type PublicBootstrapResponse } from './lib/api';
import { HomePage } from './pages/HomePage';
import { OwnerPage } from './pages/OwnerPage';
import { SoonPage } from './pages/SoonPage';
import { AppEmbedPage } from './pages/AppEmbedPage';
import { AdminPage } from './pages/AdminPage';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { pathname } = useLocation();
  const [bootstrapData, setBootstrapData] = useState<PublicBootstrapResponse | null>(null);

  useEffect(() => {
    api
      .getBootstrap()
      .then((res) => setBootstrapData(res))
      .catch(() => undefined);
  }, [pathname]);

  if (pathname === '/' || pathname === '') {
    return <HomePage initialData={bootstrapData} />;
  }
  if (pathname === '/owner') {
    return <OwnerPage initialData={bootstrapData} />;
  }
  if (pathname === '/soon') {
    return <SoonPage initialData={bootstrapData} />;
  }
  if (pathname === '/admin') {
    return isAdminRouteUnlocked() ? <AdminPage /> : <NotFoundPage />;
  }
  if (pathname.startsWith('/app/')) {
    const appId = decodeURIComponent(pathname.slice('/app/'.length).split('/')[0] || '');
    return appId ? <AppEmbedPage appId={appId} /> : <NotFoundPage />;
  }
  return <NotFoundPage />;
}

export default function App() {
  return (
    <RouterProvider>
      <AppRoutes />
    </RouterProvider>
  );
}
