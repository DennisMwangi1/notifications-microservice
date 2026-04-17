import Link from 'next/link';

export default function ProvidersPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Provider Management Moved
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Provider credentials are tenant-owned resources and are no longer managed from a top-level platform screen.
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-base text-slate-600">
          Use the tenant governance surface to review a tenant, inspect provider posture, and intervene from an explicit tenant context when needed.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/tenants" className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
            Open Tenants
          </Link>
          <Link href="/audit" className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">
            Review Audit Trail
          </Link>
        </div>
      </div>
    </div>
  );
}
