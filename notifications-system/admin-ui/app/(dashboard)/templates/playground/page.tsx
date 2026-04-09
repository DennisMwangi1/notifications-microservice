'use client';

import { useState, useCallback } from 'react';
import { API_URL } from '../../../../lib/api';
import { authHeaders } from '../../../../lib/auth';

const DEFAULT_MJML = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="40px 30px" border-radius="12px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#0f172a" font-family="Inter, sans-serif">
          Hello {{name}} 👋
        </mj-text>
        <mj-text font-size="14px" color="#64748b" line-height="1.6" font-family="Inter, sans-serif" padding-top="16px">
          Your order <strong>{{orderId}}</strong> for <strong>{{amount}}</strong> has been confirmed and is being processed.
        </mj-text>
        <mj-button background-color="#4f46e5" color="#ffffff" font-size="14px" font-weight="600" border-radius="8px" padding-top="24px" href="{{action_url}}" font-family="Inter, sans-serif">
          Track Your Order
        </mj-button>
        <mj-divider border-color="#e2e8f0" padding-top="24px" />
        <mj-text font-size="11px" color="#94a3b8" font-family="Inter, sans-serif" padding-top="12px">
          If you have questions, contact us at {{support_email}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

const DEFAULT_SMS = `Hi {{name}}, your order {{orderId}} ({{amount}}) is confirmed! Track at {{action_url}}`;

const DEFAULT_PUSH = `{"title": "Order Confirmed", "body": "Hi {{name}}, your order {{orderId}} has been confirmed!", "data": {"orderId": "{{orderId}}"}}`;

const DEFAULT_SAMPLE_DATA = JSON.stringify(
    {
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        userId: 'usr_abc123',
        orderId: 'ORD-2025-0042',
        amount: '$149.99',
        company: 'Acme Corp',
        action_url: 'https://example.com/track',
        timestamp: new Date().toISOString(),
        support_email: 'support@example.com',
    },
    null,
    2
);

const channelDefaults: Record<string, string> = {
    EMAIL: DEFAULT_MJML,
    SMS: DEFAULT_SMS,
    PUSH: DEFAULT_PUSH,
};

export default function TemplatePlaygroundPage() {
    const [channelType, setChannelType] = useState<'EMAIL' | 'SMS' | 'PUSH'>('EMAIL');
    const [contentBody, setContentBody] = useState(DEFAULT_MJML);
    const [subjectLine, setSubjectLine] = useState('Order Confirmed — {{orderId}}');
    const [sampleData, setSampleData] = useState(DEFAULT_SAMPLE_DATA);
    const [previewHtml, setPreviewHtml] = useState<string | null>(null);
    const [previewSubject, setPreviewSubject] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

    const handleChannelChange = (channel: 'EMAIL' | 'SMS' | 'PUSH') => {
        setChannelType(channel);
        setContentBody(channelDefaults[channel]);
        setPreviewHtml(null);
        setPreviewSubject(null);
        setWarnings([]);
        setError(null);
    };

    const handleRender = useCallback(async () => {
        setLoading(true);
        setError(null);
        setWarnings([]);

        try {
            let parsedSampleData: Record<string, unknown> = {};
            try {
                parsedSampleData = JSON.parse(sampleData);
            } catch {
                setError('Invalid JSON in sample data');
                setLoading(false);
                return;
            }

            const res = await fetch(`${API_URL}/api/v1/admin/templates/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    content_body: contentBody,
                    channel_type: channelType,
                    subject_line: subjectLine || undefined,
                    sample_data: parsedSampleData,
                }),
            });

            const json = await res.json();

            if (json.success && json.data) {
                setPreviewHtml(json.data.html);
                setPreviewSubject(json.data.subject);
                setWarnings(json.data.warnings || []);
            } else {
                setError(json.message || 'Preview failed');
                if (json.data?.warnings) setWarnings(json.data.warnings);
            }
        } catch {
            setError('Failed to connect to preview API');
        } finally {
            setLoading(false);
        }
    }, [contentBody, channelType, subjectLine, sampleData]);

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-200 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900 mb-1 flex items-center gap-3">
                        Template Playground
                        <span className="text-xs font-bold uppercase tracking-wider bg-violet-100 text-violet-600 px-2.5 py-1 rounded-lg border border-violet-200">Live Preview</span>
                    </h2>
                    <p className="text-sm text-slate-500">
                        Write MJML + Handlebars templates and preview rendered output in real-time.
                    </p>
                </div>
                <button
                    onClick={handleRender}
                    disabled={loading}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm ${loading
                            ? 'bg-violet-400 text-white cursor-wait'
                            : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white hover:shadow-violet-500/25 hover:shadow-lg'
                        }`}
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Rendering...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                            </svg>
                            Render Preview
                        </span>
                    )}
                </button>
            </div>

            {/* Channel Selector */}
            <div className="flex gap-3">
                {(['EMAIL', 'SMS', 'PUSH'] as const).map((ch) => (
                    <button
                        key={ch}
                        onClick={() => handleChannelChange(ch)}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border ${channelType === ch
                                ? ch === 'EMAIL'
                                    ? 'bg-sky-50 text-sky-600 border-sky-200 ring-2 ring-sky-500/10'
                                    : ch === 'SMS'
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 ring-2 ring-emerald-500/10'
                                        : 'bg-amber-50 text-amber-600 border-amber-200 ring-2 ring-amber-500/10'
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                            }`}
                    >
                        {ch}
                    </button>
                ))}
            </div>

            {/* Warnings / Errors */}
            {error && (
                <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    {error}
                </div>
            )}
            {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm space-y-1 animate-in fade-in duration-200">
                    <p className="font-bold text-xs uppercase tracking-wider text-amber-600 mb-1">MJML Warnings</p>
                    {warnings.map((w, i) => (
                        <p key={i} className="text-xs font-mono">{w}</p>
                    ))}
                </div>
            )}

            {/* Split Editor + Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Editor Panel */}
                <div className="space-y-4">
                    {/* Subject Line (EMAIL only) */}
                    {channelType === 'EMAIL' && (
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">Subject Line</label>
                            <input
                                type="text"
                                value={subjectLine}
                                onChange={(e) => setSubjectLine(e.target.value)}
                                placeholder="e.g. Your invoice for {{orderId}}"
                                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm placeholder-slate-400"
                            />
                        </div>
                    )}

                    {/* Template Body */}
                    <div>
                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2">
                            {channelType === 'EMAIL' ? 'MJML + Handlebars Template' : channelType === 'SMS' ? 'Text Template' : 'Push JSON Template'}
                        </label>
                        <textarea
                            value={contentBody}
                            onChange={(e) => setContentBody(e.target.value)}
                            rows={18}
                            spellCheck={false}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-4 text-sm font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 shadow-inner whitespace-pre custom-scrollbar leading-relaxed selection:bg-violet-500/30"
                        />
                    </div>

                    {/* Sample Data */}
                    <div>
                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500 mb-2 flex items-center gap-2">
                            Sample Data (JSON)
                            <span className="text-[9px] text-slate-400 normal-case tracking-normal font-medium">Used to fill Handlebars variables</span>
                        </label>
                        <textarea
                            value={sampleData}
                            onChange={(e) => setSampleData(e.target.value)}
                            rows={8}
                            spellCheck={false}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-4 text-sm font-mono text-indigo-700 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm whitespace-pre custom-scrollbar leading-relaxed"
                        />
                    </div>
                </div>

                {/* Preview Panel */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="block text-xs uppercase tracking-wider font-bold text-slate-500">
                            Rendered Preview
                        </label>
                        {channelType === 'EMAIL' && (
                            <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                <button
                                    onClick={() => setViewMode('desktop')}
                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all ${viewMode === 'desktop' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                >
                                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" />
                                    </svg>
                                    Desktop
                                </button>
                                <button
                                    onClick={() => setViewMode('mobile')}
                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all ${viewMode === 'mobile' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                >
                                    <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                                    </svg>
                                    Mobile
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Subject Preview */}
                    {previewSubject && (
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">Subject</p>
                            <p className="text-sm font-semibold text-slate-800">{previewSubject}</p>
                        </div>
                    )}

                    {/* HTML Preview */}
                    {channelType === 'EMAIL' ? (
                        <div
                            className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 ${viewMode === 'mobile' ? 'max-w-[375px] mx-auto' : 'w-full'
                                }`}
                        >
                            {previewHtml ? (
                                <iframe
                                    srcDoc={previewHtml}
                                    className="w-full border-0"
                                    style={{ minHeight: '600px' }}
                                    title="Email Preview"
                                    sandbox="allow-same-origin"
                                />
                            ) : (
                                <div className="h-96 flex flex-col items-center justify-center text-slate-300 gap-3">
                                    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" strokeWidth={0.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 12.838c-.066.214-.1.437-.1.661z" />
                                    </svg>
                                    <p className="text-sm font-medium">Click &quot;Render Preview&quot; to see your email</p>
                                    <p className="text-xs text-slate-300">MJML → HTML compilation happens server-side</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* SMS / Push Preview */
                        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                            {previewHtml ? (
                                <div className="p-6">
                                    {channelType === 'SMS' ? (
                                        /* SMS bubble */
                                        <div className="max-w-sm mx-auto">
                                            <div className="bg-emerald-500 text-white px-5 py-3.5 rounded-2xl rounded-bl-md text-sm leading-relaxed shadow-sm">
                                                {previewHtml}
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-2 ml-1">Preview · Not actually sent</p>
                                        </div>
                                    ) : (
                                        /* Push notification card */
                                        <div className="max-w-sm mx-auto bg-slate-50 rounded-2xl border border-slate-200 p-4 shadow-sm">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1">
                                                    <pre className="text-sm text-slate-800 font-mono whitespace-pre-wrap leading-relaxed">{previewHtml}</pre>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-3">Preview · Not actually sent</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-48 flex flex-col items-center justify-center text-slate-300 gap-3">
                                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={0.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                    </svg>
                                    <p className="text-sm font-medium">Click &quot;Render Preview&quot; to see your {channelType.toLowerCase()} message</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
