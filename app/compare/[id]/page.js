'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { diffWords } from 'diff';
import { applyClauseEdit, getClauseEdit, getComparison, saveComparison } from '@/lib/storage';
import { exportComparison, exportEditedDocument } from '@/lib/exportDoc';
import { extractClauses } from '@/lib/diffUtils';

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

      </div>
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
