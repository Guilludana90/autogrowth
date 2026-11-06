import type { Metadata, Viewport } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { AppProvider } from '@/lib/state/AppContext';
import './globals.css';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

export const metadata: Metadata = {
  title: 'AutoGrowth OS',
  description: 'CRM automotriz: leads, pipeline e inteligencia de campañas.',
  icons: { icon: '/autogrowth-logo.png' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0f0e17', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR" className={`${sans.variable} ${display.variable}`}>
      <body>
        <AppProvider>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </AppProvider>
      </body>
    </html>
  );
}
