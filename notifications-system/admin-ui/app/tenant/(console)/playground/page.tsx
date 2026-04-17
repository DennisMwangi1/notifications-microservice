'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type * as Monaco from 'monaco-editor';
import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { tenantApiFetch } from '../../../../lib/api';
import {
  analyzeTemplateVariables,
  parseSampleData,
  type TemplateVariableAnalysis,
} from '../../../../lib/template-analysis';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
});

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
        <mj-button background-color="#171717" color="#ffffff" font-size="14px" font-weight="600" border-radius="8px" padding-top="24px" href="{{action_url}}" font-family="Inter, sans-serif">
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

const DEFAULT_PUSH = `{"title":"Order Confirmed","body":"Hi {{name}}, your order {{orderId}} has been confirmed!","data":{"orderId":"{{orderId}}"}}`;

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
    user: {
      profile: {
        firstName: 'Jane',
        loyaltyTier: 'Gold',
      },
    },
  },
  null,
  2,
);

const channelDefaults: Record<'EMAIL' | 'SMS' | 'PUSH', string> = {
  EMAIL: DEFAULT_MJML,
  SMS: DEFAULT_SMS,
  PUSH: DEFAULT_PUSH,
};

const emptyAnalysis: TemplateVariableAnalysis = {
  availableVariables: [],
  referencedVariables: [],
  missingVariables: [],
  unusedVariables: [],
  syntaxErrors: [],
};

type InspectorTab = 'missing' | 'referenced' | 'available' | 'unused';

interface PreviewPayload {
  html: string | null;
  subject: string | null;
  warnings: string[];
  referenced_variables: string[];
  missing_variables: string[];
  unused_variables: string[];
}

interface TemplateLibraryEntry {
  id: string;
  name: string;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line: string | null;
  content_body: string;
  sample_data: Record<string, unknown>;
}

interface RuntimeTemplate {
  template_id: string;
  version: number;
  channel_type: 'EMAIL' | 'SMS' | 'PUSH';
  subject_line: string | null;
  content_body: string;
  is_active: boolean;
  event_type: string;
  target_ws_channel: string | null;
  created_at: string | null;
}

function createHandlebarsSuggestions(
  monaco: typeof Monaco,
  availableVariablesRef: MutableRefObject<string[]>,
) {
  const buildSuggestions = (
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
  ): Monaco.languages.CompletionList => {
    const linePrefix = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });
    const match = linePrefix.match(/\{\{\s*([a-zA-Z0-9_.]*)$/);

    if (!match) {
      return { suggestions: [] };
    }

    const typedPrefix = match[1] ?? '';
    const startColumn = position.column - typedPrefix.length;
    const range = new monaco.Range(
      position.lineNumber,
      startColumn,
      position.lineNumber,
      position.column,
    );

    return {
      suggestions: availableVariablesRef.current
        .filter(
          (variablePath) =>
            !typedPrefix || variablePath.startsWith(typedPrefix),
        )
        .map((variablePath) => ({
          label: variablePath,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: variablePath,
          range,
          detail: 'Sample data variable',
        })),
    };
  };

  return [
    monaco.languages.registerCompletionItemProvider('html', {
      triggerCharacters: ['{', '.'],
      provideCompletionItems: (model, position) =>
        buildSuggestions(model, position),
    }),
    monaco.languages.registerCompletionItemProvider('plaintext', {
      triggerCharacters: ['{', '.'],
      provideCompletionItems: (model, position) =>
        buildSuggestions(model, position),
    }),
  ];
}

export default function TenantPlaygroundPage() {
  const searchParams = useSearchParams();
  const [channelType, setChannelType] = useState<'EMAIL' | 'SMS' | 'PUSH'>(
    'EMAIL',
  );
  const [contentBody, setContentBody] = useState(DEFAULT_MJML);
  const [subjectLine, setSubjectLine] = useState(
    'Order Confirmed - {{orderId}}',
  );
  const [eventType, setEventType] = useState('');
  const [targetWsChannel, setTargetWsChannel] = useState('');
  const [sampleData, setSampleData] = useState(DEFAULT_SAMPLE_DATA);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [libraryName, setLibraryName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<
    TemplateLibraryEntry[]
  >([]);
  const [loadedTemplate, setLoadedTemplate] = useState<RuntimeTemplate | null>(
    null,
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [parsedSampleData, setParsedSampleData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [liveAnalysis, setLiveAnalysis] =
    useState<TemplateVariableAnalysis>(emptyAnalysis);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(true);
  const [showSampleDataPanel, setShowSampleDataPanel] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('missing');
  const [inspectorQuery, setInspectorQuery] = useState('');
  const sampleEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const monacoRef = useRef<typeof Monaco | null>(null);
  const completionDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const availableVariablesRef = useRef<string[]>([]);

  useEffect(() => {
    const result = parseSampleData(sampleData);
    setParsedSampleData(result.parsed);
    setJsonError(result.error);
  }, [sampleData]);

  useEffect(() => {
    if (!parsedSampleData) {
      setLiveAnalysis(emptyAnalysis);
      availableVariablesRef.current = [];
      return;
    }

    const nextAnalysis = analyzeTemplateVariables(
      contentBody,
      parsedSampleData,
      subjectLine,
    );
    setLiveAnalysis(nextAnalysis);
    availableVariablesRef.current = nextAnalysis.availableVariables;
  }, [contentBody, parsedSampleData, subjectLine]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = sampleEditorRef.current?.getModel();

    if (!monaco || !model) {
      return;
    }

    const markers = jsonError
      ? [
          {
            severity: monaco.MarkerSeverity.Error,
            message: jsonError,
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: 1,
          },
        ]
      : [];

    monaco.editor.setModelMarkers(model, 'playground-json-shape', markers);
  }, [jsonError]);

  useEffect(() => {
    let ignore = false;

    const fetchLibrary = async () => {
      const response = await tenantApiFetch<TemplateLibraryEntry[]>(
        '/api/v1/tenant/template-library',
      );

      if (!ignore && response.success) {
        setTemplateLibrary(response.data || []);
      }
    };

    void fetchLibrary();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const libraryId = searchParams.get('libraryId');
    const templateId = searchParams.get('templateId');

    if (templateId || !libraryId || templateLibrary.length === 0) {
      return;
    }

    const entry = templateLibrary.find((item) => item.id === libraryId);
    if (!entry) {
      return;
    }

    setChannelType(entry.channel_type);
    setSubjectLine(entry.subject_line || '');
    setContentBody(entry.content_body);
    setSampleData(JSON.stringify(entry.sample_data, null, 2));
    setLibraryName(entry.name);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setWarnings([]);
    setError(null);
    setSaveMessage(`Loaded "${entry.name}" from your template library.`);
    setSaveError(null);
    setPublishError(null);
  }, [searchParams, templateLibrary]);

  useEffect(() => {
    const templateId = searchParams.get('templateId');
    const requestedVersion = searchParams.get('version');

    if (!templateId) {
      setLoadedTemplate(null);
      return;
    }

    let ignore = false;

    const loadTemplate = async () => {
      const response = await tenantApiFetch<RuntimeTemplate[]>(
        `/api/v1/tenant/templates/${templateId}/versions`,
      );

      if (!response.success || !response.data) {
        if (!ignore) {
          setPublishError(response.message || 'Unable to load runtime template.');
          setLoadedTemplate(null);
        }
        return;
      }

      const selectedTemplate =
        response.data.find(
          (template) =>
            template.version === Number.parseInt(requestedVersion || '', 10),
        ) || response.data[0];

      if (!selectedTemplate || ignore) {
        return;
      }

      setLoadedTemplate(selectedTemplate);
      setChannelType(selectedTemplate.channel_type);
      setSubjectLine(selectedTemplate.subject_line || '');
      setContentBody(selectedTemplate.content_body);
      setEventType(selectedTemplate.event_type);
      setTargetWsChannel(selectedTemplate.target_ws_channel || '');
      setPreviewHtml(null);
      setPreviewSubject(null);
      setWarnings([]);
      setError(null);
      setLibraryName('');
      setSaveMessage(null);
      setSaveError(null);
      setPublishMessage(
        `Loaded runtime template ${selectedTemplate.event_type} v${selectedTemplate.version}.`,
      );
      setPublishError(null);
    };

    void loadTemplate();

    return () => {
      ignore = true;
    };
  }, [searchParams]);

  useEffect(
    () => () => {
      completionDisposablesRef.current.forEach((disposable) =>
        disposable.dispose(),
      );
      completionDisposablesRef.current = [];
    },
    [],
  );

  const handleChannelChange = (channel: 'EMAIL' | 'SMS' | 'PUSH') => {
    setChannelType(channel);
    setContentBody(channelDefaults[channel]);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setWarnings([]);
    setError(null);
    setSaveMessage(null);
    setSaveError(null);
    setPublishMessage(null);
    setPublishError(null);
    if (channel !== 'PUSH') {
      setTargetWsChannel('');
    }
  };

  const handleTemplateEditorMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    monacoRef.current = monaco;

    if (completionDisposablesRef.current.length === 0) {
      completionDisposablesRef.current = createHandlebarsSuggestions(
        monaco,
        availableVariablesRef,
      );
    }

    editor.updateOptions({ glyphMargin: false });
  };

  const handleSampleEditorMount = (
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    sampleEditorRef.current = editor;
    monacoRef.current = monaco;
  };

  const handleRender = async () => {
    if (!parsedSampleData) {
      setError(jsonError || 'Sample data must be a valid JSON object.');
      return;
    }

    setLoading(true);
    setError(null);
    setWarnings([]);
    setPublishMessage(null);

    const response = await tenantApiFetch<PreviewPayload>(
      '/api/v1/tenant/templates/preview',
      {
        method: 'POST',
        body: JSON.stringify({
          content_body: contentBody,
          channel_type: channelType,
          subject_line: subjectLine || undefined,
          sample_data: parsedSampleData,
        }),
      },
    );

    if (response.success && response.data) {
      setPreviewHtml(response.data.html);
      setPreviewSubject(response.data.subject);
      setWarnings(response.data.warnings || []);
    } else {
      setError(response.message || 'Preview failed');
      setWarnings(response.data?.warnings || []);
    }

    setLoading(false);
  };

  const handleSaveTemplate = async () => {
    if (!libraryName.trim()) {
      setSaveError('Library name is required before saving.');
      setSaveMessage(null);
      return;
    }

    if (!parsedSampleData) {
      setSaveError(jsonError || 'Sample data must be a valid JSON object.');
      setSaveMessage(null);
      return;
    }

    setSaveLoading(true);
    setSaveError(null);
    setSaveMessage(null);

    const response = await tenantApiFetch<TemplateLibraryEntry>(
      '/api/v1/tenant/template-library',
      {
        method: 'POST',
        body: JSON.stringify({
          name: libraryName.trim(),
          channel_type: channelType,
          subject_line: channelType === 'PUSH' ? null : subjectLine || null,
          content_body: contentBody,
          sample_data: parsedSampleData,
        }),
      },
    );

    if (response.success && response.data) {
      setTemplateLibrary((currentEntries) => [
        response.data as TemplateLibraryEntry,
        ...currentEntries,
      ]);
      setSaveMessage(
        `Saved "${response.data.name}" to the reusable template library.`,
      );
      setLibraryName('');
    } else {
      setSaveError(response.message || 'Failed to save template.');
    }

    setSaveLoading(false);
  };

  const handlePublishTemplate = async () => {
    if (!eventType.trim()) {
      setPublishError('Event trigger is required before publishing.');
      setPublishMessage(null);
      return;
    }

    setPublishLoading(true);
    setPublishError(null);
    setPublishMessage(null);

    const response = await tenantApiFetch('/api/v1/tenant/templates', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType.trim(),
        channel_type: channelType,
        subject_line: channelType === 'PUSH' ? null : subjectLine || null,
        content_body: contentBody,
        target_ws_channel:
          channelType === 'PUSH' && targetWsChannel.trim()
            ? targetWsChannel.trim()
            : null,
      }),
    });

    if (response.success) {
      setPublishMessage(
        `Published a live ${channelType.toLowerCase()} template for ${eventType.trim()}.`,
      );
    } else {
      setPublishError(response.message || 'Failed to publish template.');
    }

    setPublishLoading(false);
  };

  const handleDeactivateLoadedTemplate = async () => {
    if (!loadedTemplate?.is_active) {
      return;
    }

    const confirmed = window.confirm(
      `Deactivate ${loadedTemplate.event_type} v${loadedTemplate.version}? New notifications will stop using this live version.`,
    );

    if (!confirmed) {
      return;
    }

    setPublishLoading(true);
    setPublishError(null);
    setPublishMessage(null);

    const response = await tenantApiFetch(
      `/api/v1/tenant/templates/${loadedTemplate.template_id}/version/${loadedTemplate.version}/deactivate`,
      {
        method: 'PUT',
      },
    );

    if (response.success) {
      setLoadedTemplate((current) =>
        current ? { ...current, is_active: false } : current,
      );
      setPublishMessage(
        `Deactivated ${loadedTemplate.event_type} v${loadedTemplate.version}.`,
      );
    } else {
      setPublishError(response.message || 'Failed to deactivate template.');
    }

    setPublishLoading(false);
  };

  const isJsonValid = !!parsedSampleData && !jsonError;
  const diagnostics = liveAnalysis;
  const cardShell =
    'rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_20px_70px_-40px_rgba(15,23,42,0.28)]';
  const cardHeader =
    'flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6';
  const cardBody = 'p-5 sm:p-6';
  const sectionLabel =
    'block text-[11px] uppercase tracking-[0.22em] font-bold text-slate-500';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    lineNumbersMinChars: 3,
    padding: { top: 12, bottom: 12 },
  };
  const channelLabel =
    channelType === 'EMAIL'
      ? 'MJML + Handlebars Template'
      : channelType === 'SMS'
        ? 'Text Template'
        : 'Push Template';
  const inspectorItemsByTab: Record<InspectorTab, string[]> = {
    missing: diagnostics.missingVariables,
    referenced: diagnostics.referencedVariables,
    available: diagnostics.availableVariables,
    unused: diagnostics.unusedVariables,
  };
  const inspectorLabels: Record<InspectorTab, string> = {
    missing: 'Missing',
    referenced: 'Referenced',
    available: 'Available',
    unused: 'Unused',
  };
  const inspectorDescriptions: Record<InspectorTab, string> = {
    missing: 'Variables used in the template but not present in sample data.',
    referenced:
      'Every Handlebars variable currently referenced in the template or subject.',
    available:
      'Paths discovered from the current JSON payload for autocomplete and validation.',
    unused:
      'Leaf-level payload fields that are currently not used by the template.',
  };
  const filteredInspectorItems = inspectorItemsByTab[inspectorTab].filter(
    (item) => item.toLowerCase().includes(inspectorQuery.trim().toLowerCase()),
  );
  const previewFrameHeight = viewMode === 'mobile' ? '720px' : '800px';

  return (
    <div className="mx-auto max-w-[1760px] space-y-6 pb-32 animate-in fade-in duration-500">
      <section className={`${cardShell} overflow-hidden`}>
        <div className="bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_42%,#ffffff_100%)] px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md">
              <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
                Template Playground
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Use the playground to iterate on MJML and Handlebars, inspect
                variable coverage, and publish live tenant templates once the
                content is ready.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:min-w-[980px]">
              <input
                type="text"
                value={libraryName}
                onChange={(event) => setLibraryName(event.target.value)}
                placeholder="Reusable template name"
                className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              <input
                type="text"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                placeholder="Runtime event trigger"
                className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                onClick={handleSaveTemplate}
                disabled={saveLoading || !isJsonValid || !libraryName.trim()}
                className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                  saveLoading || !isJsonValid || !libraryName.trim()
                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {saveLoading ? 'Saving...' : 'Save To Library'}
              </button>
              <button
                onClick={handleRender}
                disabled={loading || !isJsonValid}
                className={`rounded-2xl px-6 py-3 text-sm font-semibold transition ${
                  loading || !isJsonValid
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                    : 'bg-indigo-500 text-white hover:bg-indigo-400'
                }`}
              >
                {loading ? 'Rendering...' : 'Render Preview'}
              </button>
            </div>
          </div>

          {loadedTemplate && (
            <div className="mt-5 rounded-[1.7rem] border border-slate-200/80 bg-white/90 p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                    Runtime Template Context
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-900">
                      {loadedTemplate.event_type}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                      v{loadedTemplate.version}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                        loadedTemplate.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {loadedTemplate.is_active ? 'Live' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    You are editing a live runtime template. Publishing from
                    here creates the next version for this event and channel.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/tenant/templates"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Back To Templates
                  </Link>
                  <button
                    onClick={handleDeactivateLoadedTemplate}
                    disabled={publishLoading || !loadedTemplate.is_active}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      publishLoading || !loadedTemplate.is_active
                        ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                        : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {publishLoading && loadedTemplate.is_active
                      ? 'Updating...'
                      : 'Deactivate Loaded Version'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/tenant/templates"
                className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                Open Templates
              </Link>
              <Link
                href="/tenant/template-library"
                className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                Open Library
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 2xl:ml-auto 2xl:justify-end">
              <div className="inline-flex rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm">
                {(['EMAIL', 'SMS', 'PUSH'] as const).map((channel) => (
                  <button
                    key={channel}
                    onClick={() => handleChannelChange(channel)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] transition ${
                      channelType === channel
                        ? channel === 'EMAIL'
                          ? 'bg-sky-50 text-sky-700'
                          : channel === 'SMS'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {channel}
                  </button>
                ))}
              </div>

              <button
                onClick={handlePublishTemplate}
                disabled={publishLoading || !eventType.trim()}
                className={`rounded-2xl px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                  publishLoading || !eventType.trim()
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {publishLoading ? 'Publishing...' : 'Publish Live Template'}
              </button>

              <button
                onClick={() => setShowDiagnosticsPanel((current) => !current)}
                className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                {showDiagnosticsPanel ? 'Hide Diagnostics' : 'Show Diagnostics'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {(error || saveError || saveMessage || publishError || publishMessage) && (
        <section className="grid gap-3">
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              {error}
            </div>
          )}
          {saveError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {saveError}
            </div>
          )}
          {publishError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {publishError}
            </div>
          )}
          {saveMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {saveMessage}
            </div>
          )}
          {publishMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {publishMessage}
            </div>
          )}
        </section>
      )}

      <div
        className={`grid grid-cols-1 gap-6 ${
          showDiagnosticsPanel
            ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.78fr)_minmax(360px,0.95fr)]'
            : 'xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]'
        }`}
      >
        <section className={`${cardShell} order-1 overflow-hidden`}>
          <div className={cardHeader}>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">
              Editor Workspace
            </h3>
          </div>

          <div className={`${cardBody} space-y-5`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className={sectionLabel}>Runtime Event Trigger</label>
                <input
                  type="text"
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value)}
                  placeholder="e.g. order.confirmed"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-800 shadow-sm outline-none transition focus:border-indigo-500/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {channelType === 'PUSH' ? (
                <div className="space-y-2">
                  <label className={sectionLabel}>WebSocket Namespace</label>
                  <input
                    type="text"
                    value={targetWsChannel}
                    onChange={(event) => setTargetWsChannel(event.target.value)}
                    placeholder="e.g. customer_alerts"
                    className="w-full rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-3 text-sm font-mono text-amber-800 shadow-sm outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className={sectionLabel}>Publishing Flow</label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Save reusable content to the library, or publish a live
                    template directly for this tenant event.
                  </div>
                </div>
              )}
            </div>

            {channelType === 'EMAIL' && (
              <div className="space-y-2">
                <label className={sectionLabel}>Subject Line</label>
                <input
                  type="text"
                  value={subjectLine}
                  onChange={(event) => setSubjectLine(event.target.value)}
                  placeholder="e.g. Your invoice for {{orderId}}"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono text-slate-800 shadow-sm outline-none transition focus:border-indigo-500/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <label className={sectionLabel}>{channelLabel}</label>
                  <p className="mt-1 text-xs text-slate-500">
                    Type <span className="font-mono text-slate-700">{'{{'}</span> to
                    trigger variable suggestions from the current sample
                    payload.
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  {diagnostics.referencedVariables.length} referenced
                </div>
              </div>
              <div className="overflow-hidden rounded-[1.5rem] border border-neutral-900 shadow-sm">
                <MonacoEditor
                  height="560px"
                  language={channelType === 'EMAIL' ? 'html' : 'plaintext'}
                  theme="vs-dark"
                  value={contentBody}
                  onChange={(value) => setContentBody(value || '')}
                  onMount={handleTemplateEditorMount}
                  options={editorOptions}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-slate-50/60">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                <div>
                  <p className={sectionLabel}>Sample Data</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Keep JSON close to the editor, but collapse it when you want
                    more room for template work.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] ${
                      jsonError
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {jsonError ? 'Needs Fixing' : 'Valid'}
                  </span>
                  <button
                    onClick={() =>
                      setShowSampleDataPanel((current) => !current)
                    }
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  >
                    {showSampleDataPanel ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>

              {showSampleDataPanel ? (
                <div className="space-y-3 px-4 py-4">
                  <div className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm">
                    <MonacoEditor
                      height="260px"
                      language="json"
                      theme="vs"
                      value={sampleData}
                      onChange={(value) => setSampleData(value || '')}
                      onMount={handleSampleEditorMount}
                      options={editorOptions}
                    />
                  </div>
                  {jsonError ? (
                    <p className="text-sm font-medium text-rose-600">
                      {jsonError}
                    </p>
                  ) : (
                    <p className="text-xs font-medium text-emerald-600">
                      Sample JSON is valid and exposes{' '}
                      {diagnostics.availableVariables.length} variable path
                      {diagnostics.availableVariables.length === 1
                        ? ''
                        : 's'}{' '}
                      for autocomplete.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-slate-600">
                  <p>
                    {jsonError
                      ? 'JSON has validation errors and needs attention before rendering.'
                      : `JSON is valid with ${diagnostics.availableVariables.length} available variable path${diagnostics.availableVariables.length === 1 ? '' : 's'}.`}
                  </p>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                    {sampleData.split('\n').length} lines
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {showDiagnosticsPanel && (
          <aside className="order-3 xl:order-2 xl:sticky xl:top-6 xl:self-start">
            <section className={cardShell}>
              <div className={cardHeader}>
                <div>
                  <p className={sectionLabel}>Diagnostics</p>
                </div>
              </div>

              <div className={`${cardBody} space-y-5`}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(inspectorItemsByTab) as InspectorTab[]).map(
                      (tab) => (
                        <button
                          key={tab}
                          onClick={() => setInspectorTab(tab)}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                            inspectorTab === tab
                              ? tab === 'missing'
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-300 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                          }`}
                        >
                          {inspectorLabels[tab]} ({inspectorItemsByTab[tab].length})
                        </button>
                      ),
                    )}
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      value={inspectorQuery}
                      onChange={(event) =>
                        setInspectorQuery(event.target.value)
                      }
                      placeholder={`Search ${inspectorLabels[inspectorTab].toLowerCase()} variables`}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-500/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <p className="text-xs leading-5 text-slate-500">
                      {inspectorDescriptions[inspectorTab]}
                    </p>
                  </div>

                  <div
                    className={`rounded-[1.4rem] border p-4 ${
                      inspectorTab === 'missing'
                        ? 'border-amber-200 bg-amber-50/70'
                        : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    {filteredInspectorItems.length > 0 ? (
                      <div className="flex max-h-[320px] flex-wrap gap-2 overflow-y-auto pr-1">
                        {filteredInspectorItems.map((item) => (
                          <span
                            key={item}
                            className={`rounded-full border bg-white px-2.5 py-1 text-[11px] font-mono ${
                              inspectorTab === 'missing'
                                ? 'border-amber-200 text-amber-700'
                                : 'border-slate-200 text-slate-700'
                            }`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {inspectorQuery.trim()
                          ? `No ${inspectorLabels[inspectorTab].toLowerCase()} variables match that search.`
                          : inspectorTab === 'missing'
                            ? 'No missing variables detected. The sample payload currently covers everything referenced.'
                            : `No ${inspectorLabels[inspectorTab].toLowerCase()} variables to show yet.`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div
                    className={`rounded-[1.4rem] border p-4 ${
                      diagnostics.syntaxErrors.length > 0
                        ? 'border-rose-200 bg-rose-50'
                        : 'border-emerald-200 bg-emerald-50'
                    }`}
                  >
                    <p
                      className={`mb-3 text-[10px] font-bold uppercase tracking-[0.22em] ${
                        diagnostics.syntaxErrors.length > 0
                          ? 'text-rose-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      Handlebars Syntax Health
                    </p>
                    {diagnostics.syntaxErrors.length > 0 ? (
                      <div className="space-y-2">
                        {diagnostics.syntaxErrors.map((syntaxError) => (
                          <p
                            key={syntaxError}
                            className="text-xs font-mono whitespace-pre-wrap text-rose-700"
                          >
                            {syntaxError}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700">
                        No Handlebars syntax issues detected.
                      </p>
                    )}
                  </div>

                  {warnings.length > 0 && (
                    <div className="rounded-[1.4rem] border border-amber-200 bg-amber-50 p-4">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">
                        Render Warnings
                      </p>
                      <div className="space-y-2">
                        {warnings.map((warning, index) => (
                          <p
                            key={index}
                            className="text-xs font-mono whitespace-pre-wrap text-amber-700"
                          >
                            {warning}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                          Library Entries
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Load reusable content into this workspace.
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                        {templateLibrary.length} saved
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {templateLibrary.slice(0, 5).map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => {
                            setChannelType(entry.channel_type);
                            setSubjectLine(entry.subject_line || '');
                            setContentBody(entry.content_body);
                            setSampleData(JSON.stringify(entry.sample_data, null, 2));
                            setLibraryName(entry.name);
                            setPreviewHtml(null);
                            setPreviewSubject(null);
                            setWarnings([]);
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                            {entry.channel_type}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {entry.name}
                          </p>
                        </button>
                      ))}
                      {templateLibrary.length === 0 && (
                        <p className="text-sm text-slate-500">
                          No reusable library entries have been saved yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        )}

        <aside
          className={`${showDiagnosticsPanel ? 'order-2 xl:order-3' : 'order-2'} xl:sticky xl:top-6 xl:self-start`}
        >
          <section className={`${cardShell} overflow-hidden`}>
            <div className={cardHeader}>
              <div>
                <p className={sectionLabel}>Preview</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  Rendered Output
                </h3>
              </div>
              {channelType === 'EMAIL' && (
                <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                  <button
                    onClick={() => setViewMode('desktop')}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition ${
                      viewMode === 'desktop'
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    onClick={() => setViewMode('mobile')}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition ${
                      viewMode === 'mobile'
                        ? 'bg-white text-slate-700 shadow-sm'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Mobile
                  </button>
                </div>
              )}
            </div>

            <div className={`${cardBody} space-y-4`}>
              {previewSubject && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Subject
                  </p>
                  <p className="text-sm font-semibold text-slate-800">
                    {previewSubject}
                  </p>
                </div>
              )}

              {channelType === 'EMAIL' ? (
                <div
                  className={`overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm transition-all duration-300 ${
                    viewMode === 'mobile' ? 'mx-auto max-w-[390px]' : 'w-full'
                  }`}
                >
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full border-0"
                      style={{ height: previewFrameHeight }}
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex h-[520px] flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
                      <svg
                        className="h-16 w-16"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={0.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 12.838c-.066.214-.1.437-.1.661z"
                        />
                      </svg>
                      <p className="text-sm font-medium text-slate-500">
                        Render the template to see the email output.
                      </p>
                      <p className="text-xs text-slate-400">
                        The preview column stays pinned so changes are easier to
                        evaluate while you edit.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                  {previewHtml ? (
                    <div className="min-h-[420px] p-6">
                      {channelType === 'SMS' ? (
                        <div className="mx-auto max-w-sm">
                          <div className="rounded-2xl rounded-bl-md bg-emerald-500 px-5 py-3.5 text-sm leading-relaxed text-white shadow-sm">
                            {previewHtml}
                          </div>
                          <p className="ml-1 mt-2 text-[10px] text-slate-400">
                            Preview only
                          </p>
                        </div>
                      ) : (
                        <div className="mx-auto max-w-sm rounded-2xl border border-slate-100 bg-slate-50/70 p-4 shadow-sm">
                          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-800">
                            {previewHtml}
                          </pre>
                          <p className="mt-3 text-[10px] text-slate-400">
                            Preview only
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-[420px] flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
                      <svg
                        className="h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={0.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                        />
                      </svg>
                      <p className="text-sm font-medium text-slate-500">
                        Render the template to preview the{' '}
                        {channelType.toLowerCase()} output.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
