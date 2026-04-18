import type { HTMLAttributes, ReactNode } from 'react';

type ClassValue = string | false | null | undefined;

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'indigo';

export function cx(...classes: ClassValue[]) {
  return classes.filter(Boolean).join(' ');
}

const badgeToneClasses: Record<BadgeTone, string> = {
  default: 'border-slate-200 bg-slate-100 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

export const controlInputClassName =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/20';

export const controlTextareaClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/20';

export const primaryButtonClassName =
  'inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';

export const dangerButtonClassName =
  'inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60';

export function StatusBadge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
        badgeToneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  chips,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  chips?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 lg:text-[2rem]">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
          {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

export function Surface({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  headerClassName,
}: HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section
      className={cx(
        'rounded-2xl border border-slate-200 bg-white shadow-sm',
        className,
      )}
    >
      {(title || description || action) && (
        <div
          className={cx(
            'flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-start md:justify-between',
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
        </div>
      )}
      <div className={cx('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: BadgeTone;
}) {
  const toneDotClass: Record<BadgeTone, string> = {
    default: 'bg-slate-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    indigo: 'bg-indigo-500',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <span className={cx('mt-1 h-2.5 w-2.5 rounded-full', toneDotClass[tone])} />
      </div>
      {detail ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
      ) : null}
    </div>
  );
}

export function KeyValueGrid({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <dl
      className={cx(
        'grid gap-x-4 gap-y-3',
        columns === 2 && 'md:grid-cols-2',
        columns === 3 && 'md:grid-cols-3',
        columns === 4 && 'md:grid-cols-2 xl:grid-cols-4',
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
        >
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-2 text-sm font-medium leading-6 text-slate-800">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({
  value,
  emptyLabel = 'No data available.',
  className,
}: {
  value: unknown;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <pre
      className={cx(
        'overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-200',
        className,
      )}
    >
      {value ? JSON.stringify(value, null, 2) : emptyLabel}
    </pre>
  );
}

export function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}
