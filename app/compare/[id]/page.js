'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { diffWords } from 'diff';
import { applyClauseEdit, getClauseEdit, getComparison, saveComparison } from '@/lib/storage';
import { exportComparison, exportEditedDocument } from '@/lib/exportDoc';
import { extractClauses } from '@/lib/diffUtils';
import { requestGapSummary, downloadSummaryMarkdown, GAP_TYPES, GAP_TYPE_META } from '@/lib/gapAnalysis';

import DocumentViewer from '@/components/DocumentViewer';

// ── Constants ─────────────────────────────────────────────────────────────────

const FORMAT_META = {
  pdf:  { label: 'PDF',   icon: '📄' },
  docx: { label: 'Word',  icon: '📝' },
  xlsx: { label: 'Excel', icon: '📊' },
};

const VIEW_MODES = [
  { key: 'text', label: '텍스트 비교' },
  { key: 'viewer', label: '뷰어 비교' },
];

const CHANGE_TYPE_STYLE = {
  added:     { sidebar: 'border-l-green-400 text-green-700 bg-green-50',  badge: 'bg-green-100 text-green-700',  blockLeft: 'bg-gray-50 border-l-gray-200 opacity-50', blockRight: 'bg-green-50 border-l-green-400' },
  removed:   { sidebar: 'border-l-red-400 text-red-600 bg-red-50',       badge: 'bg-red-100 text-red-600',      blockLeft: 'bg-red-50 border-l-red-400',              blockRight: 'bg-gray-50 border-l-gray-200 opacity-50' },
  modified:  { sidebar: 'border-l-amber-400 text-amber-700 bg-amber-50', badge: 'bg-amber-100 text-amber-700',  blockLeft: 'bg-amber-50 border-l-amber-400',          blockRight: 'bg-amber-50 border-l-amber-400' },
  unchanged: { sidebar: '', badge: '', blockLeft: 'border-l-transparent', blockRight: 'border-l-transparent' },
};

function getSidebarItemClass(changeType, isSelected) {
  if (isSelected) {
    return 'bg-blue-50 border-l-blue-500';
  }

  if (changeType === 'unchanged') {
    return 'border-l-transparent hover:bg-gray-50';
  }

  return `${CHANGE_TYPE_STYLE[changeType]?.sidebar ?? ''} hover:brightness-95`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text, query, keyPrefix = 'highlight') {
  const source = String(text ?? '');
  const keyword = query.trim();

  if (!keyword) {
    return source;
  }

  const parts = source.split(new RegExp(`(${escapeRegExp(keyword)})`, 'ig'));

  return parts.map((part, index) => (
    index % 2 === 1 ? (
      <mark
        key={`${keyPrefix}-${index}`}
        className="rounded bg-yellow-200 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : part
  ));
}

function buildSearchPreview(text, query, radius = 36) {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  const keyword = query.trim();

  if (!source || !keyword) {
    return '';
  }

  const lowerSource = source.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const matchIndex = lowerSource.indexOf(lowerKeyword);

  if (matchIndex === -1) {
    return '';
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(source.length, matchIndex + keyword.length + radius);

  return `${start > 0 ? '...' : ''}${source.slice(start, end).trim()}${end < source.length ? '...' : ''}`;
}

// ── Diff renderers ─────────────────────────────────────────────────────────────

function LeftDiff({ before, after, highlightQuery }) {
  const parts = useMemo(() => diffWords(before || '', after || ''), [before, after]);
  return (
    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono break-words text-gray-700">
      {parts.filter(p => !p.added).map((p, i) => (
        <span key={i} className={p.removed ? 'bg-red-100 text-red-700 line-through decoration-red-400' : ''}>
          {highlightMatches(p.value, highlightQuery, `left-${i}`)}
        </span>
      ))}
    </pre>
  );
}

function RightDiff({ before, after, highlightQuery }) {
  const parts = useMemo(() => diffWords(before || '', after || ''), [before, after]);
  return (
    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono break-words text-gray-700">
      {parts.filter(p => !p.removed).map((p, i) => (
        <span key={i} className={p.added ? 'bg-green-100 text-green-800' : ''}>
          {highlightMatches(p.value, highlightQuery, `right-${i}`)}
        </span>
      ))}
    </pre>
  );
}

// ── Clause block ──────────────────────────────────────────────────────────────

function ClauseBlock({ clause, side, isSelected, onSelect, highlightQuery }) {
  const { changeType, number, title, leftContent, rightContent } = clause;
  const content = side === 'left' ? leftContent : rightContent;
  const isDiff = changeType !== 'unchanged';
  const isEmpty = isDiff && !content;
  const style = CHANGE_TYPE_STYLE[changeType];
  const blockStyle = side === 'left' ? style.blockLeft : style.blockRight;

  return (
    <div
      id={`${side}-${number}`}
      onClick={() => onSelect(number)}
      className={`mb-1.5 rounded-r border-l-4 p-3 transition-colors
        ${blockStyle}
        ${isSelected ? 'ring-2 ring-inset ring-blue-400' : ''}
        cursor-pointer hover:brightness-95
      `}
    >
      <div className="clause-block-header flex items-center gap-2 mb-1 min-w-0">
        <span className="clause-block-number text-[11px] font-mono font-bold text-gray-500 flex-shrink-0">
          {highlightMatches(number, highlightQuery, `${side}-${number}-number`)}
        </span>
        <span className="clause-block-title text-[11px] text-gray-600 font-medium truncate flex-1">
          {highlightMatches(title, highlightQuery, `${side}-${number}-title`)}
        </span>
        {isDiff && (
          <span className={`clause-block-badge flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${style.badge}`}>
            {changeType}
          </span>
        )}
      </div>
      {isEmpty ? (
        <div className="clause-block-empty text-[11px] text-gray-300 italic py-1">— 해당 내용 없음 —</div>
      ) : changeType === 'modified' ? (
        side === 'left'
          ? <LeftDiff before={leftContent} after={rightContent} highlightQuery={highlightQuery} />
          : <RightDiff before={leftContent} after={rightContent} highlightQuery={highlightQuery} />
      ) : (
        <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono break-words text-gray-700">
          {highlightMatches(content, highlightQuery, `${side}-${number}-content`)}
        </pre>
      )}
    </div>
  );
}

// ── Sort helper ───────────────────────────────────────────────────────────────

function sortClauseNums(a, b) {
  if (a.startsWith('P') || b.startsWith('P')) return a.localeCompare(b);
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const d = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function getEditedAfterContent(comparison, clauseNumber, fallback = '') {
  return getClauseEdit(comparison, clauseNumber, 'after') ?? fallback;
}

function canEditClause(clause) {
  return Boolean(clause) && clause.changeType !== 'removed';
}

// ── Build merged clause list from stored markdown + diffs ─────────────────────

function buildViewClauses(comparison) {
  const dm = new Map(comparison.diffs.map(d => [d.clauseNumber, d]));

  if (comparison.document1Markdown || comparison.document2Markdown) {
    const document1Clauses = extractClauses(comparison.document1Markdown || '');
    const document2Clauses = extractClauses(comparison.document2Markdown || '');

    const clauseMap = new Map();
    document1Clauses.forEach(c =>
      clauseMap.set(c.number, {
        number: c.number,
        title: c.title,
        leftContent: c.content,
        rightContent: '',
        originalLeftContent: c.content,
        originalRightContent: '',
        changeType: 'unchanged',
      })
    );
    document2Clauses.forEach(c => {
      const editedRightContent = getEditedAfterContent(comparison, c.number, c.content);
      if (clauseMap.has(c.number)) {
        clauseMap.get(c.number).rightContent = editedRightContent;
        clauseMap.get(c.number).originalRightContent = c.content;
      } else {
        clauseMap.set(c.number, {
          number: c.number,
          title: c.title,
          leftContent: '',
          rightContent: editedRightContent,
          originalLeftContent: '',
          originalRightContent: c.content,
          changeType: 'unchanged',
        });
      }
    });

    // Apply diff types + exact before/after content from comparison time
    dm.forEach((d, num) => {
      const entry = clauseMap.get(num) ?? { number: num, title: d.title };
      const originalLeftContent = d.before || entry.originalLeftContent || '';
      const originalRightContent = d.after || entry.originalRightContent || '';
      clauseMap.set(num, {
        ...entry,
        leftContent: originalLeftContent,
        rightContent: getEditedAfterContent(comparison, num, originalRightContent),
        originalLeftContent,
        originalRightContent,
        changeType: d.changeType,
      });
    });

    return [...clauseMap.values()].sort((a, b) => sortClauseNums(a.number, b.number));
  }

  // Fallback: diffs only (no full markdown stored)
  return comparison.diffs.map(d => ({
    number: d.clauseNumber,
    title: d.title,
    leftContent: d.before || '',
    rightContent: getEditedAfterContent(comparison, d.clauseNumber, d.after || ''),
    originalLeftContent: d.before || '',
    originalRightContent: d.after || '',
    changeType: d.changeType,
  })).sort((a, b) => sortClauseNums(a.number, b.number));
}

function normalizeSearchToken(value) {
  return (value || '')
    .replace(/[#*`~]/g, ' ')
    .replace(/[()[\]{}<>:;.,!?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildViewerSearchTokens(diff) {
  const firstLine = (diff.after || diff.before || '').split('\n')[0] || '';
  const base = [
    `${diff.clauseNumber} ${diff.title}`,
    diff.title,
    firstLine.slice(0, 120),
  ];

  const synonymPairs = [
    ['usability', '사용적합성'],
    ['engineering', '엔지니어링'],
    ['process', '프로세스'],
    ['evaluation', '평가'],
    ['test', '시험'],
    ['scope', '적용범위'],
    ['purpose', '목적'],
    ['definition', '정의'],
    ['hazard', '위해'],
    ['risk', '위험'],
  ];

  const expanded = [];
  for (const raw of base) {
    const normalized = normalizeSearchToken(raw);
    if (!normalized) continue;
    expanded.push(normalized);

    const lowered = normalized.toLowerCase();
    for (const [en, ko] of synonymPairs) {
      if (lowered.includes(en)) {
        expanded.push(normalized.replace(new RegExp(en, 'ig'), ko));
      }
      if (normalized.includes(ko)) {
        expanded.push(normalized.replace(new RegExp(ko, 'g'), en));
      }
    }

    // Also try without clause number prefix (e.g., "1 Purpose" -> "Purpose")
    expanded.push(normalized.replace(/^\d+(?:\.\d+)*\s+/, '').trim());
  }

  return [...new Set(expanded.filter(Boolean))].slice(0, 10);
}

function buildViewerSearchTarget(clause) {
  if (!clause) return null;

  return {
    clauseNumber: clause.number,
    title: clause.title,
    before: clause.leftContent,
    after: clause.rightContent,
  };
}

function EmbeddedViewerPane({ documentId, fileType, filename, accentClassName, label, onRegisterApi }) {
  return (
    <div className="embedded-viewer-pane flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`embedded-viewer-header flex-shrink-0 border-b px-4 py-2.5 ${accentClassName} flex items-center gap-2`}>
        <span className={`embedded-viewer-label text-xs font-bold px-2 py-0.5 rounded ${label === '1' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          문서 {label}
        </span>
        <span className="embedded-viewer-filename min-w-0 truncate text-xs text-gray-600">{filename}</span>
        <Link
          href={`/viewer/${documentId}`}
          target="_blank"
          rel="noreferrer"
          className="embedded-viewer-source-link text-[11px] font-medium text-blue-600 hover:text-blue-700"
        >
          원문 보기
        </Link>
      </div>
      <div className="embedded-viewer-content flex-1 min-h-0">
        <DocumentViewer
          documentId={documentId}
          fileType={fileType}
          filename={filename}
          registerApi={onRegisterApi}
        />
      </div>
    </div>
  );
}

// ── Gap analysis summary panel ──────────────────────────────────────────────

const GAP_TYPE_BADGE = {
  red:    'bg-red-50 text-red-700 border-red-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  gray:   'bg-gray-50 text-gray-600 border-gray-200',
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
};
const GAP_PRIORITY_BADGE = {
  상: 'bg-red-100 text-red-700',
  중: 'bg-amber-100 text-amber-700',
  하: 'bg-gray-100 text-gray-500',
};
function gapTypeBadge(type) {
  return GAP_TYPE_BADGE[GAP_TYPE_META[type]?.color] || GAP_TYPE_BADGE.gray;
}

function GapSettingsForm() {
  const [form, setForm] = useState({ apiKey: '', proxyUrl: '', model: '' });
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/gap-config');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '설정을 불러오지 못했습니다.');
      setMeta(data);
      setForm((f) => ({ ...f, proxyUrl: data.proxyUrl || '', model: data.model || '' }));
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message });
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const save = useCallback(async (payload) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/gap-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '설정 저장에 실패했습니다.');
      setMeta(data);
      setForm((f) => ({ ...f, apiKey: '', proxyUrl: data.proxyUrl || '', model: data.model || '' }));
      setSaveMsg({ ok: true, text: '저장되었습니다. 요약 생성/재생성을 다시 실행하세요.' });
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message });
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSave = () => {
    // apiKey 는 입력했을 때만 전송(빈칸 = 기존 키 유지). proxyUrl/model 은 '' 로 클리어 가능.
    const payload = { proxyUrl: form.proxyUrl, model: form.model };
    if (form.apiKey.trim()) payload.apiKey = form.apiKey;
    save(payload);
  };

  const inputCls = 'w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div id="gap-settings-form" className="border-t border-gray-100 bg-gray-50 px-4 py-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label htmlFor="gap-api-key" className="block mb-1 text-xs font-semibold text-gray-600">API 키</label>
          <input
            id="gap-api-key"
            type="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder={meta?.hasApiKey ? `저장된 키: ****${meta.apiKeyLast4} (변경 시에만 입력)` : '예: sk-ant-…'}
            className={inputCls}
          />
          {meta?.hasApiKey && (
            <button
              type="button"
              onClick={() => save({ apiKey: '' })}
              disabled={saving}
              className="mt-1 text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
            >
              저장된 키 삭제
            </button>
          )}
        </div>
        <div>
          <label htmlFor="gap-proxy-url" className="block mb-1 text-xs font-semibold text-gray-600">프록시 URL</label>
          <input
            id="gap-proxy-url"
            type="text"
            value={form.proxyUrl}
            onChange={(e) => setForm((f) => ({ ...f, proxyUrl: e.target.value }))}
            placeholder="예: https://llm-gateway.example.com"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-gray-400">프록시와 API 키가 모두 있으면 프록시가 우선합니다.</p>
        </div>
        <div>
          <label htmlFor="gap-model" className="block mb-1 text-xs font-semibold text-gray-600">모델 (선택)</label>
          <input
            id="gap-model"
            type="text"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="claude-sonnet-4-6"
            className={inputCls}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          id="gap-settings-save"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? '저장 중…' : '설정 저장'}
        </button>
        {saveMsg && (
          <p className={`text-xs ${saveMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{saveMsg.text}</p>
        )}
      </div>
    </div>
  );
}

function GapAnalysisPanel({ summary, busy, error, onGenerate, onDownload, onJump, onClose }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div id="gap-analysis-panel" className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-800">🧠 갭 분석 요약</span>
          {summary?.oneLine && <span className="text-xs text-gray-500 truncate">{summary.oneLine}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            id="gap-settings-toggle"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="LLM 설정"
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${settingsOpen ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            ⚙ 설정
          </button>
          {summary && (
            <button
              type="button"
              onClick={onDownload}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
            >
              MD 다운로드
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? 'LLM 분석 중…' : summary ? '재생성' : '요약 생성'}
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" aria-label="닫기">×</button>
        </div>
      </div>

      {settingsOpen && <GapSettingsForm />}

      {error && (
        <div className="px-4 pb-2.5">
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            ⚠ {error.message}
            {error.code === 'NOT_CONFIGURED' && !settingsOpen && (
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="ml-2 font-semibold text-blue-600 hover:underline"
              >
                ⚙ 설정 열기
              </button>
            )}
          </p>
        </div>
      )}

      {summary && !busy && (
        <div className="px-4 pb-3 max-h-[38vh] overflow-y-auto">
          {summary.overview?.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 pr-3 font-semibold">조항</th>
                    <th className="py-1.5 pr-3 font-semibold">핵심 변경</th>
                    <th className="py-1.5 pr-3 font-semibold">유형</th>
                    <th className="py-1.5 font-semibold">우선</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.overview.map((o, i) => (
                    <tr key={i} onClick={() => onJump(o.clauseId)} className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer align-top">
                      <td className="py-1.5 pr-3 font-mono text-blue-600 whitespace-nowrap">{o.clauseId}</td>
                      <td className="py-1.5 pr-3 text-gray-700"><span className="text-gray-400">{o.section}</span>{o.section ? ' — ' : ''}{o.change}</td>
                      <td className="py-1.5 pr-3"><span className={`px-1.5 py-0.5 rounded border font-semibold ${gapTypeBadge(o.type)}`}>{o.type}</span></td>
                      <td className="py-1.5"><span className={`px-1.5 py-0.5 rounded font-semibold ${GAP_PRIORITY_BADGE[o.priority] || ''}`}>{o.priority}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {GAP_TYPES.filter((t) => summary.groups?.[t]?.length).map((t) => (
              <div key={t} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-1.5 text-xs font-bold">
                  <span className={`px-1.5 py-0.5 rounded border ${gapTypeBadge(t)}`}>{t}</span>
                  <span className="ml-1 text-gray-400">({summary.groups[t].length})</span>
                </p>
                <ul className="space-y-1">
                  {summary.groups[t].map((it, i) => (
                    <li key={i} className="text-xs leading-relaxed text-gray-600">
                      <button type="button" onClick={() => onJump(it.clauseId)} className="font-mono text-blue-600 hover:underline">[{it.clauseId}]</button>{' '}
                      {it.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {summary.decisions?.length > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="mb-1.5 text-xs font-bold text-blue-700">의사결정 필요</p>
              <ul className="space-y-1">
                {summary.decisions.map((d, i) => (
                  <li key={i} className="text-xs leading-relaxed text-gray-700">• {d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DiffView() {
  const { id } = useParams();
  const [comparison, setComparison] = useState(null);
  const [mode, setMode] = useState('text');
  const [sidebarMode, setSidebarMode] = useState('diff');
  const [selectedClause, setSelectedClause] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [viewerUnavailableMsg, setViewerUnavailableMsg] = useState('');
  const [mounted, setMounted] = useState(false);

  // Gap analysis summary
  const [gapOpen, setGapOpen] = useState(false);
  const [gap, setGap] = useState(null);
  const [gapBusy, setGapBusy] = useState(false);
  const [gapError, setGapError] = useState(null);

  const leftRef  = useRef(null);
  const rightRef = useRef(null);
  const isSyncing = useRef(false);
  const viewerApisRef = useRef({});
  const pendingSaveRef = useRef(null);
  const latestComparisonRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const data = getComparison(id);
    if (data) {
      setComparison(data);
      if (data.diffs?.length > 0) setSelectedClause(data.diffs[0].clauseNumber);
      setGap(data.gapSummary || null);
    }
  }, [id]);

  // Auto-reparse / diff-remap: handle two stale-cache scenarios:
  //   A) markdown still uses P-fallback → re-fetch parsed markdown from server
  //   B) markdown already has real numbers but diffs still have P-numbers
  //      (can happen if the page was visited before this fix was deployed)
  useEffect(() => {
    if (!comparison) return;

    const hasOnlyPNumbers = (markdown) => {
      if (!markdown) return false;
      const clauses = extractClauses(markdown);
      return clauses.length > 0 && clauses.every(c => /^P\d+$/.test(c.number));
    };

    const diffsHavePNumbers =
      comparison.diffs?.length > 0 &&
      comparison.diffs.every(d => /^P\d+$/.test(d.clauseNumber));

    const doc1NeedsReparse = hasOnlyPNumbers(comparison.document1Markdown) && !!comparison.document1Id;
    const doc2NeedsReparse = hasOnlyPNumbers(comparison.document2Markdown) && !!comparison.document2Id;

    // Nothing to do
    if (!doc1NeedsReparse && !doc2NeedsReparse && !diffsHavePNumbers) return;

    const reparseDoc = async (docId) => {
      const res = await fetch(`/api/parse-document?documentId=${docId}`);
      if (!res.ok) return null;
      return res.json();
    };

    (async () => {
      const [r1, r2] = await Promise.all([
        doc1NeedsReparse ? reparseDoc(comparison.document1Id) : Promise.resolve(null),
        doc2NeedsReparse ? reparseDoc(comparison.document2Id) : Promise.resolve(null),
      ]);

      const updates = {};
      if (r1?.markdown) updates.document1Markdown = r1.markdown;
      if (r2?.markdown) updates.document2Markdown = r2.markdown;

      const updated = { ...comparison, ...updates };

      // Remap P-numbered diffs to real clause numbers so Diff 인덱스 and
      // viewer search both work with the freshly-parsed heading hierarchy.
      // This runs whether markdown was just re-fetched OR was already real-numbered
      // (scenario B: markdown reparsed in a prior visit, diffs not yet remapped).
      if (diffsHavePNumbers) {
        const realClauses1 = extractClauses(updated.document1Markdown || '');
        const realClauses2 = extractClauses(updated.document2Markdown || '');

        // title (lowercase) → real clause number
        const titleToNum = new Map();
        [...realClauses1, ...realClauses2].forEach(c => {
          const key = c.title.toLowerCase().trim();
          if (!titleToNum.has(key)) titleToNum.set(key, c.number);
        });

        // Merged, sorted real clause list for positional fallback
        const allReal = [...realClauses1];
        realClauses2.forEach(c => {
          if (!allReal.some(r => r.number === c.number)) allReal.push(c);
        });
        allReal.sort((a, b) => sortClauseNums(a.number, b.number));

        if (allReal.length > 0) {
          updated.diffs = updated.diffs.map(d => {
            // 1) Title match
            const byTitle = titleToNum.get(d.title.toLowerCase().trim());
            if (byTitle) return { ...d, clauseNumber: byTitle };
            // 2) Positional: P1 → index 0, P2 → index 1, ...
            const pIdx = parseInt(d.clauseNumber.replace('P', ''), 10) - 1;
            const fallback = allReal[pIdx];
            if (fallback) return { ...d, clauseNumber: fallback.number };
            return d;
          });
        }
      }

      if (Object.keys(updates).length === 0 && !diffsHavePNumbers) return;
      saveComparison(updated);
      setComparison(updated);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison?.id]);

  useEffect(() => {
    latestComparisonRef.current = comparison;
  }, [comparison]);

  useEffect(() => {
    if (mode === 'viewer' && !(comparison?.document1Id && comparison?.document2Id)) {
      setMode('text');
    }
  }, [mode, comparison]);

  const flushPendingSave = useCallback((nextComparison, { updateState = true } = {}) => {
    const target = nextComparison ?? latestComparisonRef.current;
    if (!target || !pendingSaveRef.current) return;

    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
    saveComparison(target);
    if (updateState) {
      setIsSavingEdit(false);
    }
  }, []);

  const scheduleSave = useCallback((nextComparison) => {
    latestComparisonRef.current = nextComparison;
    setIsSavingEdit(true);
    if (pendingSaveRef.current) {
      clearTimeout(pendingSaveRef.current);
    }
    pendingSaveRef.current = setTimeout(() => {
      saveComparison(latestComparisonRef.current);
      pendingSaveRef.current = null;
      setIsSavingEdit(false);
    }, 400);
  }, []);

  useEffect(() => () => {
    flushPendingSave(undefined, { updateState: false });
  }, [flushPendingSave]);

  useEffect(() => {
    if (mode === 'viewer') {
      flushPendingSave();
    }
  }, [flushPendingSave, mode]);

  const viewClauses = useMemo(
    () => (comparison ? buildViewClauses(comparison) : []),
    [comparison]
  );

  const selectedViewClause = useMemo(
    () => viewClauses.find((clause) => clause.number === selectedClause) ?? null,
    [selectedClause, viewClauses]
  );

  const hasEditedSelectedClause = useMemo(
    () => Boolean(comparison && selectedViewClause && getClauseEdit(comparison, selectedViewClause.number, 'after') !== null),
    [comparison, selectedViewClause]
  );

  useEffect(() => {
    if (!selectedViewClause || !canEditClause(selectedViewClause)) {
      setEditorContent('');
      return;
    }

    setEditorContent(selectedViewClause.rightContent || '');
  }, [selectedViewClause]);

  const filteredDiffs = useMemo(() => {
    if (!comparison) return [];
    const q = search.trim().toLowerCase();
    return comparison.diffs.flatMap((d) => {
      const editedAfter = getEditedAfterContent(comparison, d.clauseNumber, d.after || '');
      if (filter !== 'all' && d.changeType !== filter) return [];
      const matchesClause = d.clauseNumber.toLowerCase().includes(q);
      const matchesTitle = d.title.toLowerCase().includes(q);
      const matchesBefore = (d.before || '').toLowerCase().includes(q);
      const matchesAfter = editedAfter.toLowerCase().includes(q);

      if (q && !(matchesClause || matchesTitle || matchesBefore || matchesAfter)) {
        return [];
      }

      return [{
        ...d,
        after: editedAfter,
        previewText: q
          ? buildSearchPreview(matchesAfter ? editedAfter : d.before, search)
          : '',
      }];
    });
  }, [comparison, search, filter]);

  const documentIndexItems = useMemo(() => {
    if (!comparison) return [];

    const diffMap = new Map(comparison.diffs.map(d => [d.clauseNumber, d.changeType]));
    const q = search.trim().toLowerCase();

    return viewClauses
      .flatMap((item) => {
        const matchesNumber = item.number.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesContent = (item.rightContent || item.leftContent || '').toLowerCase().includes(q);

        if (q && !(matchesNumber || matchesTitle || matchesContent)) {
          return [];
        }

        return [{
          clauseNumber: item.number,
          title: item.title,
          changeType: diffMap.get(item.number) || 'unchanged',
          previewText: q ? buildSearchPreview(item.rightContent || item.leftContent || '', search) : '',
        }];
      })
      .sort((a, b) => sortClauseNums(a.clauseNumber, b.clauseNumber));
  }, [comparison, search, viewClauses]);

  const sidebarItems = sidebarMode === 'diff' ? filteredDiffs : documentIndexItems;
  const viewerSearchTargets = useMemo(
    () => new Map(viewClauses.map((clause) => [clause.number, buildViewerSearchTarget(clause)])),
    [viewClauses]
  );

  const focusEmbeddedViewers = useCallback((num) => {
    if (mode !== 'viewer' || !comparison) return;
    const diff = comparison.diffs.find(d => d.clauseNumber === num);
    // Fallback to viewClauses-derived target when diff not found (e.g. unchanged clause)
    const searchTarget = diff || viewerSearchTargets.get(num);
    if (!searchTarget) return;
    const tokens = buildViewerSearchTokens(searchTarget);
    [comparison.document1Id, comparison.document2Id].filter(Boolean).forEach(docId => {
      viewerApisRef.current[docId]?.search(tokens);
    });
  }, [comparison, mode, viewerSearchTargets]);

  const jumpToClause = useCallback((num) => {
    setSelectedClause(num);
    (['left', 'right']).forEach(side => {
      const el = document.getElementById(`${side}-${num}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    focusEmbeddedViewers(num);
  }, [focusEmbeddedViewers]);

  const downloadOriginalDocument = useCallback((documentId, filename) => {
    if (!documentId) return;

    const url = new URL(`/api/documents/${documentId}/content`, window.location.origin);
    url.searchParams.set('download', '1');

    const anchor = document.createElement('a');
    anchor.href = url.toString();
    anchor.download = filename || '';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);

  const handleSwitchToViewer = useCallback(async () => {
    if (!comparison?.document1Id || !comparison?.document2Id) return;
    setViewerUnavailableMsg('');
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/documents/${comparison.document1Id}/meta`),
        fetch(`/api/documents/${comparison.document2Id}/meta`),
      ]);

      const missing1 = r1.status === 404;
      const missing2 = r2.status === 404;
      const serverErr = (!r1.ok && !missing1) || (!r2.ok && !missing2);

      if (missing1 || missing2) {
        const which = missing1 && missing2 ? '두 문서 모두' : missing1 ? '문서 1이' : '문서 2가';
        setViewerUnavailableMsg(
          `${which} 서버에서 찾을 수 없습니다. 서버가 재시작되었거나 파일이 삭제되었을 수 있습니다. 새 비교를 생성해 주세요.`
        );
        return;
      }
      if (serverErr) {
        setViewerUnavailableMsg('서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setMode('viewer');
    } catch {
      setViewerUnavailableMsg('서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, [comparison]);

  const handleToggleEditor = useCallback(() => {
    setMode('text');
    setIsEditorOpen((open) => {
      const willOpen = !open;
      if (open) {
        // Closing: flush pending edits
        flushPendingSave();
        return willOpen;
      }

      // Opening: initialize editor draft. Prefer any saved/edited clause content,
      // fall back to the original clause content from 문서2, and finally to the
      // full document2 markdown when no clause content exists.
      if (willOpen) {
        if (selectedViewClause && canEditClause(selectedViewClause)) {
          const initial = getEditedAfterContent(
            comparison,
            selectedViewClause.number,
            selectedViewClause.originalRightContent ?? ''
          ) || (comparison?.document2Markdown ?? '');
          setEditorContent(initial);
        } else if (comparison?.document2Markdown) {
          setEditorContent(comparison.document2Markdown);
        }
      }

      return willOpen;
    });
  }, [flushPendingSave]);

  const handleEditorChange = useCallback((event) => {
    if (!comparison || !selectedViewClause || !canEditClause(selectedViewClause)) {
      return;
    }

    const nextContent = event.target.value;
    const nextComparison = applyClauseEdit(
      comparison,
      selectedViewClause.number,
      'after',
      nextContent,
      selectedViewClause.originalRightContent ?? ''
    );

    setEditorContent(nextContent);
    setComparison(nextComparison);
    scheduleSave(nextComparison);
  }, [comparison, scheduleSave, selectedViewClause]);

  const handleResetEdit = useCallback(() => {
    if (!comparison || !selectedViewClause || !canEditClause(selectedViewClause)) {
      return;
    }

    const originalContent = selectedViewClause.originalRightContent ?? '';
    const nextComparison = applyClauseEdit(
      comparison,
      selectedViewClause.number,
      'after',
      originalContent,
      originalContent
    );

    setEditorContent(originalContent);
    setComparison(nextComparison);
    scheduleSave(nextComparison);
  }, [comparison, scheduleSave, selectedViewClause]);

  const handleExportReport = useCallback(async () => {
    flushPendingSave();
    setExporting(true);
    try {
      await exportComparison(latestComparisonRef.current ?? comparison, 'docx');
    } catch (e) {
      alert('내보내기 실패: ' + e.message);
    } finally {
      setExporting(false);
    }
  }, [comparison, flushPendingSave]);

  const handleExportEdited = useCallback(async () => {
    flushPendingSave();
    setExporting(true);
    try {
      await exportEditedDocument(latestComparisonRef.current ?? comparison, comparison.name || 'comparison');
    } catch (e) {
      alert('편집본 내보내기 실패: ' + e.message);
    } finally {
      setExporting(false);
    }
  }, [comparison, flushPendingSave]);

  const handleGenerateGap = useCallback(async () => {
    const cmp = latestComparisonRef.current ?? comparison;
    if (!cmp) return;
    setGapOpen(true);
    setGapBusy(true);
    setGapError(null);
    try {
      const summary = await requestGapSummary(cmp);
      setGap(summary);
      const updated = { ...cmp, gapSummary: summary };
      saveComparison(updated);
      setComparison(updated);
    } catch (e) {
      setGapError({
        code: e.code,
        message: e.code === 'NOT_CONFIGURED'
          ? '갭 분석 LLM이 설정되지 않았습니다. ⚙ 설정에서 API 키 또는 프록시 URL을 입력하세요.'
          : e.message,
      });
    } finally {
      setGapBusy(false);
    }
  }, [comparison]);

  const handleDownloadGap = useCallback(() => {
    if (gap) downloadSummaryMarkdown(gap, latestComparisonRef.current ?? comparison);
  }, [gap, comparison]);

  if (!mounted) {
    return (
      <div id="compare-loading" className="flex items-center justify-center h-screen text-sm text-gray-400">
        불러오는 중...
      </div>
    );
  }

  if (!comparison) {
    return (
      <div id="compare-not-found" className="flex items-center justify-center h-screen text-sm text-gray-500 gap-2">
        비교 데이터를 찾을 수 없습니다.
        <Link href="/" className="text-blue-600 underline">홈으로</Link>
      </div>
    );
  }

  const { stats } = comparison;
  const hasViewerDocs = Boolean(comparison.document1Id && comparison.document2Id);
  const hasEditableDocument = Boolean(comparison.document2Markdown || viewClauses.some(clause => clause.originalRightContent));

  return (
    <div id="page-compare" className="flex flex-col h-screen bg-white overflow-hidden">

      {/* ── Header ── */}
      <header id="header-compare" className="flex-shrink-0 border-b border-gray-200 px-5 py-3 flex items-center justify-between bg-white z-10">
        <div id="header-compare-left" className="flex items-center gap-3 min-w-0">
          <Link id="link-back-list" href="/" className="text-sm text-gray-400 hover:text-gray-600 flex-shrink-0">← 목록</Link>
          <h1 id="compare-title" className="font-semibold text-gray-900 truncate text-sm">{comparison.name}</h1>
        </div>
        <div id="header-compare-right" className="flex items-center gap-2 flex-shrink-0 ml-4">
          <div id="view-mode-switcher" className="ml-1 flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            {VIEW_MODES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === 'viewer') {
                    handleSwitchToViewer();
                  } else {
                    setMode(item.key);
                    setViewerUnavailableMsg('');
                  }
                }}
                disabled={item.key === 'viewer' && !hasViewerDocs}
                className={`view-mode-btn rounded-md px-2.5 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40
                  ${mode === item.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            id="btn-open-editor"
            type="button"
            onClick={handleToggleEditor}
            disabled={!hasEditableDocument}
            className={`ml-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isEditorOpen
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isEditorOpen ? 'Edit 닫기' : 'Edit 열기'}
          </button>
          <div className="relative ml-1">
            <button
              id="btn-export"
              type="button"
              onClick={handleExportEdited}
              disabled={exporting || !hasEditableDocument}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {exporting
                ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                : <span>📤</span>
              }
              {exporting ? '생성 중...' : '편집본 다운로드'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div id="toolbar-compare" className="flex-shrink-0 border-b border-gray-100 px-4 py-2 flex items-center gap-2 bg-gray-50">
        {/* Type filter */}
        {[
          { key: 'all',      label: `전체 ${stats.total}`,  cls: 'bg-gray-800 text-white' },
          { key: 'added',    label: `추가 +${stats.added}`,  cls: 'bg-green-600 text-white' },
          { key: 'modified', label: `수정 ~${stats.modified}`, cls: 'bg-amber-500 text-white' },
          { key: 'removed',  label: `삭제 -${stats.removed}`, cls: 'bg-red-600 text-white' },
        ].map(({ key, label, cls }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setSelectedClause(null); }}
            className={`filter-btn px-2.5 py-1 text-xs font-medium rounded-md transition-colors
              ${filter === key ? cls : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
          >
            {label}
          </button>
        ))}

        {/* Search */}
        <div id="search-wrapper" className="relative ml-2">
          <span className="search-icon absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[11px] pointer-events-none">🔍</span>
          <input
            id="input-search"
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelectedClause(null); }}
            placeholder="키워드 검색..."
            className="pl-7 pr-6 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44 bg-white"
          />
          {search && (
            <button id="btn-clear-search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
          )}
        </div>

        {/* Gap analysis toggle */}
        <button
          id="btn-toggle-gap"
          type="button"
          onClick={() => (gap ? setGapOpen((o) => !o) : handleGenerateGap())}
          className={`ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors
            ${gapOpen ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
        >
          🧠 갭 분석 요약
        </button>
      </div>

      {gapOpen && (
        <GapAnalysisPanel
          summary={gap}
          busy={gapBusy}
          error={gapError}
          onGenerate={handleGenerateGap}
          onDownload={handleDownloadGap}
          onJump={jumpToClause}
          onClose={() => setGapOpen(false)}
        />
      )}
      {mode === 'viewer' && (
        <div id="hint-viewer-mode" className="flex-shrink-0 border-b border-gray-100 bg-indigo-50/60 px-4 py-1.5 text-[11px] text-indigo-700">
          사이드바 항목을 클릭하면 좌/우 뷰어에서 해당 조항 제목으로 위치 검색을 시도합니다.
        </div>
      )}
      {viewerUnavailableMsg && (
        <div id="viewer-unavailable-banner" className="flex-shrink-0 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-[11px] text-yellow-800 flex items-center justify-between gap-2">
          <span>⚠️ {viewerUnavailableMsg}</span>
          <button type="button" onClick={() => setViewerUnavailableMsg('')} className="flex-shrink-0 text-yellow-600 hover:text-yellow-900 font-bold leading-none">×</button>
        </div>
      )}

      {/* ── Main: sidebar + split viewer ── */}
      <div id="layout-compare-main" className="flex flex-1 min-h-0">

        {/* Sidebar: change list */}
        <aside id="sidebar-compare" className="w-60 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-white">
          <div id="sidebar-tabs" className="flex-shrink-0 border-b border-gray-200">
            <div className="flex text-[11px]">
              {[
                { key: 'diff', label: 'Diff 인덱스' },
                { key: 'document', label: '문서 인덱스' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSidebarMode(item.key)}
                  className={`sidebar-tab flex-1 px-3 py-2.5 font-medium transition-colors border-b-2
                    ${sidebarMode === item.key
                      ? 'border-blue-500 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div id="sidebar-items-list" className="flex-1 overflow-y-auto">
            {sidebarItems.length === 0 ? (
              <div id="sidebar-empty-state" className="p-4 text-center text-xs text-gray-400">
                {search ? `"${search}" 결과 없음` : (sidebarMode === 'diff' ? '변경된 항목 없음' : '문서 인덱스 없음')}
              </div>
            ) : sidebarItems.map(d => {
              const isSelected = d.clauseNumber === selectedClause;
              const s = CHANGE_TYPE_STYLE[d.changeType];
              const isChanged = d.changeType !== 'unchanged';
              return (
                <button
                  key={d.clauseNumber}
                  onClick={() => jumpToClause(d.clauseNumber)}
                  className={`sidebar-item w-full text-left px-3 py-2.5 border-b border-gray-100 border-l-4 transition-colors
                    ${getSidebarItemClass(d.changeType, isSelected)}
                  `}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="sidebar-item-clause-number text-[11px] font-mono font-bold text-gray-700">
                      {highlightMatches(d.clauseNumber, search, `sidebar-${d.clauseNumber}-number`)}
                    </span>
                    {isChanged && (
                      <span className={`sidebar-item-badge text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.badge}`}>{d.changeType}</span>
                    )}
                  </div>
                  <p className="sidebar-item-title text-[11px] text-gray-500 leading-snug line-clamp-2">
                    {highlightMatches(d.title, search, `sidebar-${d.clauseNumber}-title`)}
                  </p>
                  {search.trim() && d.previewText && (
                    <p className="sidebar-item-preview mt-1 text-[10px] text-gray-400 leading-snug line-clamp-2">
                      {highlightMatches(d.previewText, search, `sidebar-${d.clauseNumber}-preview`)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Split viewer */}
        <div id="split-viewer" className="flex flex-1 min-w-0 min-h-0 bg-gray-50">
          {mode === 'text' ? (
            <>
              {/* Left panel — OLD */}
              <div id="panel-left" className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-white">
                <div id="panel-left-header" className="flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-red-50 flex items-center gap-2">
                  <span id="panel-left-label" className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">문서 1</span>
                  <span id="panel-left-filename" className="text-xs text-gray-500 truncate">{comparison.document1Filename}</span>
                  {comparison.document1Id && (
                    <Link
                      id="panel-left-source-link"
                      href={`/viewer/${comparison.document1Id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      원문 보기
                    </Link>
                  )}
                  <span id="panel-left-format" className="ml-auto text-[10px] text-gray-400">{FORMAT_META[comparison.document1Format]?.label}</span>
                </div>
                <div id="panel-left-scroll" ref={leftRef} className="flex-1 overflow-y-auto px-3 py-3">
                  {viewClauses.map(c => (
                    <ClauseBlock
                      key={c.number}
                      clause={c}
                      side="left"
                      isSelected={selectedClause === c.number}
                      onSelect={jumpToClause}
                      highlightQuery={search}
                    />
                  ))}
                </div>
              </div>

              {/* Right panel — NEW */}
              <div id="panel-right" className={`flex flex-col flex-1 min-w-0 bg-white ${isEditorOpen ? 'border-r border-gray-200' : ''}`}>
                <div id="panel-right-header" className="flex-shrink-0 px-4 py-2 border-b border-gray-200 bg-green-50 flex items-center gap-2">
                  <span id="panel-right-label" className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">문서 2</span>
                  <span id="panel-right-filename" className="text-xs text-gray-500 truncate">{comparison.document2Filename}</span>
                  {comparison.document2Id && (
                    <Link
                      id="panel-right-source-link"
                      href={`/viewer/${comparison.document2Id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      원문 보기
                    </Link>
                  )}
                  <span id="panel-right-format" className="ml-auto text-[10px] text-gray-400">{FORMAT_META[comparison.document2Format]?.label}</span>
                </div>
                <div id="panel-right-scroll" ref={rightRef} className="flex-1 overflow-y-auto px-3 py-3">
                  {viewClauses.map(c => (
                    <ClauseBlock
                      key={c.number}
                      clause={c}
                      side="right"
                      isSelected={selectedClause === c.number}
                      onSelect={jumpToClause}
                      highlightQuery={search}
                    />
                  ))}
                </div>
              </div>
              {isEditorOpen && (
                <div id="panel-edit" className="flex w-[28rem] max-w-[40vw] min-w-[22rem] flex-col bg-white">
                  <div id="panel-edit-header" className="flex items-center gap-2 border-b border-gray-200 bg-blue-50 px-4 py-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">Edit</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-700">
                        {selectedViewClause ? `${selectedViewClause.number} ${selectedViewClause.title}` : '조항을 선택하세요'}
                      </p>
                      <p className="text-[11px] text-gray-500">문서 2 기준 편집본이 자동 저장됩니다.</p>
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {isSavingEdit ? '자동 저장 중...' : '자동 저장'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {!selectedViewClause ? (
                      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-xs text-gray-500">
                        좌측 인덱스나 비교 패널에서 조항을 선택하면 여기서 문서 2 기준으로 편집할 수 있습니다.
                      </div>
                    ) : !canEditClause(selectedViewClause) ? (
                      <div className="space-y-3">
                        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
                          삭제된 조항은 문서 2에 존재하지 않아 편집 대상에서 제외됩니다.
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                          <p className="mb-2 text-[11px] font-semibold text-gray-600">문서 1 원문</p>
                          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700">
                            {selectedViewClause.leftContent || '—'}
                          </pre>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                          <span>
                            상태: <strong className="font-semibold text-gray-700">{selectedViewClause.changeType}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={handleResetEdit}
                            disabled={!hasEditedSelectedClause}
                            className="rounded border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            원문으로 복원
                          </button>
                        </div>
                        <textarea
                          id="textarea-edit-clause"
                          value={editorContent}
                          onChange={handleEditorChange}
                          spellCheck={false}
                          className="h-[28rem] w-full rounded-xl border border-gray-200 px-3 py-3 font-mono text-xs leading-relaxed text-gray-700 outline-none ring-0 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                          <p className="mb-2 text-[11px] font-semibold text-gray-600">원본 문서 2 내용</p>
                          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-gray-500">
                            {selectedViewClause.originalRightContent || '—'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div id="viewer-left-wrapper" className="flex flex-col flex-1 min-w-0 border-r border-gray-200 p-3">
                <EmbeddedViewerPane
                  documentId={comparison.document1Id}
                  fileType={comparison.document1Format}
                  filename={comparison.document1Filename}
                  accentClassName="bg-red-50"
                  label="1"
                  onRegisterApi={(api) => { viewerApisRef.current[comparison.document1Id] = api; }}
                />
              </div>
              <div id="viewer-right-wrapper" className="flex flex-col flex-1 min-w-0 p-3">
                <EmbeddedViewerPane
                  documentId={comparison.document2Id}
                  fileType={comparison.document2Format}
                  filename={comparison.document2Filename}
                  accentClassName="bg-green-50"
                  label="2"
                  onRegisterApi={(api) => { viewerApisRef.current[comparison.document2Id] = api; }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
