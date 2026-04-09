/**
 * Centralized theme configuration for the Admin UI.
 * Organizations can customize their branding by modifying this file.
 * This acts as the single source of truth for all visual branding.
 */

export const theme = {
  // ─── Brand Identity ───────────────────────────────
  brandName: 'Nucleus',
  tagline: 'Notification Engine',
  description: 'Multi-tenant notification infrastructure for modern applications.',

  // ─── Sidebar ──────────────────────────────────────
  sidebar: {
    bg: 'bg-slate-950',
    borderColor: 'border-slate-800',
    textColor: 'text-slate-300',
    logoGradient: 'from-cyan-400 via-blue-500 to-purple-600',
  },

  // ─── Accent Colors ────────────────────────────────
  accent: {
    primary: {
      light: 'indigo-50',
      base: 'indigo-500',
      hover: 'indigo-100',
      border: 'indigo-200',
      text: 'indigo-600',
    },
    success: {
      light: 'emerald-50',
      base: 'emerald-500',
      hover: 'emerald-100',
      border: 'emerald-200',
      text: 'emerald-600',
    },
    info: {
      light: 'sky-50',
      base: 'sky-500',
      hover: 'sky-100',
      border: 'sky-200',
      text: 'sky-600',
    },
    warning: {
      light: 'amber-50',
      base: 'amber-500',
      hover: 'amber-100',
      border: 'amber-200',
      text: 'amber-600',
    },
    danger: {
      light: 'rose-50',
      base: 'rose-500',
      hover: 'rose-100',
      border: 'rose-200',
      text: 'rose-600',
    },
  },

  // ─── Navigation Items ─────────────────────────────
  // Customizable nav labels if organizations want to rename sections
  nav: {
    dashboard: 'Dashboard',
    tenants: 'Tenants & Projects',
    templates: 'Global Templates',
    routing: 'Routing Matrix',
    logs: 'Monitoring & Logs',
    providers: 'Integrations',
    dlq: 'Dead Letter Queue',
  },
} as const;

export type Theme = typeof theme;
