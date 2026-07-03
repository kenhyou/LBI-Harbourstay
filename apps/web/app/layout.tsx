import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Harbourstay',
  description: 'OTA short-stay accommodation & tour booking platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
