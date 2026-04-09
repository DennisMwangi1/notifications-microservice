import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { theme } from '../lib/theme-config';
import { ErrorBoundary } from '../lib/error-boundary';
import { AuthProvider } from '../lib/auth-provider';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en" className="bg-slate-50">
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased min-h-screen flex`}>
        <AuthProvider>
          {/* Sidebar */}
          <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shadow-xl z-10 text-slate-300">
            <div className="p-6 border-b border-slate-800/60">
              <h1 className={`text-2xl font-black bg-gradient-to-br ${theme.sidebar.logoGradient} bg-clip-text text-transparent drop-shadow-sm`}>
                {theme.brandName}
              </h1>
              <p className="text-[10px] text-slate-500 mt-1.5 uppercase tracking-widest font-bold">{theme.tagline}</p>
            </div>

            <nav className="flex-1 px-4 space-y-2 mt-6">
              <Link href="/" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-blue-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>
                </span>
                Dashboard
              </Link>
              <Link href="/tenants" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-indigo-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                </span>
                Tenants &amp; Projects
              </Link>
              <Link href="/templates" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-emerald-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                </span>
                Global Templates
              </Link>
              <Link href="/templates/playground" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-violet-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>
                </span>
                Template Playground
              </Link>
              <Link href="/routing" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-fuchsia-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 12.838c-.066.214-.1.437-.1.661z" /></svg>
                </span>
                Routing Matrix
              </Link>
              <Link href="/logs" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-orange-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </span>
                Monitoring &amp; Logs
              </Link>
              <Link href="/providers" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-cyan-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                </span>
                Integrations
              </Link>
              <Link href="/dlq" className="flex items-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all group">
                <span className="w-5 h-5 mr-3 text-slate-500 group-hover:text-rose-400 transition-colors">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                </span>
                Dead Letter Queue
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-8 lg:p-12">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </div>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
