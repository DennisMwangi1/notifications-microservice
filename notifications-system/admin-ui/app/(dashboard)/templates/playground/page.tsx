import Link from 'next/link';

export default function TemplatePlaygroundPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div className="border-b border-slate-100 pb-6">
        <h2 className="text-4xl font-black tracking-tight text-slate-900">
          Playground Moved To Tenant Console
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Template experimentation, previewing, and publishing are tenant-scoped activities and no longer belong in the platform operator workflow.
        </p>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-sm">
        <p className="text-base text-slate-600">
          Use the tenant playground to test variables, preview content, save library entries, and publish live templates for the owning tenant.
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
