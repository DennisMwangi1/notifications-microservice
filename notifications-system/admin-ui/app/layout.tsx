import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { theme } from '../lib/theme-config';
const runtimeConfig = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
};

export const metadata: Metadata = {
  title: `${theme.brandName} | ${theme.tagline}`,
  description: theme.description,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <Script
          id="runtime-config"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig).replace(/</g, '\\u003c')};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
