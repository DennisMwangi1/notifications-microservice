import Link from 'next/link';

export default function RoutingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Tenant Template Routing Is Handled In Tenant Space
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          The platform console no longer owns notification-template routing or override authoring. Those decisions are made through tenant-owned template publishing flows.
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-base text-slate-600">
          Operators can still investigate tenant behavior from tenant governance screens, but template authoring and runtime content selection now stay fully inside the tenant console.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/tenants" className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
            Open Tenants
          </Link>
          <Link href="/templates" className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">
            View Template Notice
          </Link>
        </div>
      </div>
    </div>
  );
}
