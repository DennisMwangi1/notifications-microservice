/**
 * Centralized theme configuration for the Admin UI.
 * Beautiful, modern color palette featuring deep indigos and slate grays,
 * designed for a premium, professional experience.
 */

export const theme = {
  // ─── Brand Identity ───────────────────────────────
  brandName: 'Nucleus',
  tagline: 'Notification Engine',
  description: 'Multi-tenant notification infrastructure for modern applications.',

  // ─── Color Palette ────────────────────────────────
  primary: {
    light: 'bg-indigo-50 text-indigo-600',
    base: 'bg-indigo-600 text-white',
    hover: 'hover:bg-indigo-700',
    border: 'border-indigo-200',
    glow: 'shadow-indigo-500/25',
    activeNav: 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/20',
  },

  // ─── Sidebar ──────────────────────────────────────
  sidebar: {
    bg: 'bg-slate-900',
    borderColor: 'border-slate-800',
    textColor: 'text-slate-400',
    hoverBg: 'hover:bg-slate-800/50',
    hoverText: 'hover:text-slate-200',
  },

  // ─── Semantic Colors (for alerts/status) ──────────
  semantic: {
    success: {
      light: 'emerald-50',
      base: 'emerald-500',
      text: 'emerald-600',
      border: 'emerald-200',
    },
    warning: {
      light: 'amber-50',
      base: 'amber-500',
      text: 'amber-600',
      border: 'amber-200',
    },
    danger: {
      light: 'rose-50',
      base: 'rose-500',
      text: 'rose-600',
      border: 'rose-200',
    },
    info: {
      light: 'sky-50',
      base: 'sky-500',
      text: 'sky-600',
      border: 'sky-200',
    },
  },

  // ─── Navigation Items ─────────────────────────────
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
