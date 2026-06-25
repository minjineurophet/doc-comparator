'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getComparison, updateGapSummary } from '../../lib/storage';
import {
  generateGapSummary,
  isProxyConfigured,
  downloadSummaryMarkdown,
  GAP_TYPES,
  GAP_TYPE_META,
} from '../../lib/gapAnalysis';

const STATUS = {
  added:    { label: '추가', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  modified: { label: '수정', dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  removed:  { label: '삭제', dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200' },
};

function DiffView({ clause }) {
  if (!clause) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3">
      <span className="text-5xl">←</span>
      <p className="text-sm">왼쪽에서 조항을 선택하세요</p>
    </div>
  );

  const { status, oldContent, newContent, diff, title, oldTitle } = clause;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-gray-400">{clause.id}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS[status]?.badge}`}>
          {STATUS[status]?.label}
        </span>
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>
      {oldTitle && oldTitle !== title && (
        <p className="text-xs text-gray-400 mb-4 line-through">{oldTitle}</p>
      )}

      {status === 'added' && (
        <div className="grid grid-cols-2 gap-4 mt-5">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 mb-3">이전 버전</p>
            <p className="text-xs text-gray-400 italic">항목 없음</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-5">
            <p className="text-xs font-semibold text-emerald-600 mb-3">새 버전</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{newContent || '(내용 없음)'}</p>
          </div>
        </div>
      )}

      {status === 'removed' && (
        <div className="grid grid-cols-2 gap-4 mt-5">
          <div className="rounded-xl bg-red-50 border border-red-100 p-5">
            <p className="text-xs font-semibold text-red-600 mb-3">이전 버전</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{oldContent || '(내용 없음)'}</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-5">
            <p className="text-xs font-semibold text-gray-400 mb-3">새 버전</p>
            <p className="text-xs text-gray-400 italic">항목 없음</p>
          </div>
        </div>
      )}

      {status === 'modified' && diff && (
        <div className="mt-5">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">인라인 차이 표시</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {diff.map((part, i) => {
                if (part.removed) return <span key={i} className="bg-red-100 text-red-700 line-through rounded px-0.5">{part.value}</span>;
                if (part.added) return <span key={i} className="bg-emerald-100 text-emerald-700 rounded px-0.5">{part.value}</span>;
                return <span key={i} className="text-gray-700">{part.value}</span>;
              })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-red-50 border border-red-100 p-5">
              <p className="text-xs font-semibold text-red-500 mb-3">이전 버전</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{oldContent || '(내용 없음)'}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-5">
              <p className="text-xs font-semibold text-emerald-600 mb-3">새 버전</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{newContent || '(내용 없음)'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_BADGE = {
  red:     'bg-red-50 text-red-700 border-red-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  gray:    'bg-gray-50 text-gray-600 border-gray-200',
  blue:    'bg-blue-50 text-blue-700 border-blue-200',
};
const PRIORITY_BADGE = {
  상: 'bg-red-100 text-red-700',
  중: 'bg-amber-100 text-amber-700',
  하: 'bg-gray-100 text-gray-500',
};

function typeBadge(type) {
  return TYPE_BADGE[GAP_TYPE_META[type]?.color] || TYPE_BADGE.gray;
}

function GapPanel({ summary, busy, error, onGenerate, onDownload, onJump }) {
  if (!isProxyConfigured()) {
    return (
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
        <p className="text-xs text-gray-400">
          ⓘ 갭 분석 요약은 사내 Claude 프록시 설정 후 사용할 수 있습니다 (<span className="font-mono">NEXT_PUBLIC_GAP_PROXY_URL</span>).
        </p>
      </div>
    );
  }

  return (
    <section className="bg-white border-b border-gray-200 flex-shrink-0">
      <div className="px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-gray-800">🧠 갭 분석 요약</span>
          {summary?.oneLine && (
            <span className="text-xs text-gray-500 truncate">{summary.oneLine}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {summary && (
            <button
              onClick={onDownload}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
            >
              MD 다운로드
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={busy}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? '분석 중…' : summary ? '재생성' : '요약 생성'}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-5 pb-3">
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠ {error}</p>
        </div>
      )}

      {summary && !busy && (
        <div className="px-5 pb-4 max-h-[38vh] overflow-y-auto">
          {/* 한눈에 보기 */}
          {summary.overview?.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-gray-400 text-left border-b border-gray-100">
                    <th className="py-1.5 pr-3 font-semibold">조항</th>
                    <th className="py-1.5 pr-3 font-semibold">핵심 변경</th>
                    <th className="py-1.5 pr-3 font-semibold">유형</th>
                    <th className="py-1.5 font-semibold">우선</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.overview.map((o, i) => (
                    <tr
                      key={i}
                      onClick={() => onJump(o.clauseId)}
                      className="border-b border-gray-50 hover:bg-blue-50/50 cursor-pointer align-top"
                    >
                      <td className="py-1.5 pr-3 font-mono text-blue-600 whitespace-nowrap">{o.clauseId}</td>
                      <td className="py-1.5 pr-3 text-gray-700">
                        <span className="text-gray-400">{o.section}</span>
                        {o.section ? ' — ' : ''}{o.change}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span className={`px-1.5 py-0.5 rounded border font-semibold ${typeBadge(o.type)}`}>{o.type}</span>
                      </td>
                      <td className="py-1.5">
                        <span className={`px-1.5 py-0.5 rounded font-semibold ${PRIORITY_BADGE[o.priority] || ''}`}>{o.priority}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 유형별 그룹 */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {GAP_TYPES.filter((t) => summary.groups?.[t]?.length).map((t) => (
              <div key={t} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs font-bold mb-1.5">
                  <span className={`px-1.5 py-0.5 rounded border ${typeBadge(t)}`}>{t}</span>
                  <span className="ml-1 text-gray-400">({summary.groups[t].length})</span>
                </p>
                <ul className="space-y-1">
                  {summary.groups[t].map((it, i) => (
                    <li key={i} className="text-xs text-gray-600 leading-relaxed">
                      <button onClick={() => onJump(it.clauseId)} className="font-mono text-blue-600 hover:underline">[{it.clauseId}]</button>{' '}
                      {it.summary}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* 의사결정 필요 */}
          {summary.decisions?.length > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-xs font-bold text-blue-700 mb-1.5">의사결정 필요</p>
              <ul className="space-y-1">
                {summary.decisions.map((d, i) => (
                  <li key={i} className="text-xs text-gray-700 leading-relaxed">• {d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [cmp, setCmp] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // 갭 분석 요약 상태
  const [gap, setGap] = useState(null);
  const [gapBusy, setGapBusy] = useState(false);
  const [gapError, setGapError] = useState(null);

  useEffect(() => {
    if (!id) return;
    const data = getComparison(id);
    setCmp(data);
    if (data?.diffs?.length) setSelected(data.diffs[0]);
    setGap(data?.gapSummary || null);
    setGapError(null);
  }, [id]);

  const handleGenerateGap = async () => {
    if (!cmp) return;
    setGapBusy(true);
    setGapError(null);
    try {
      const summary = await generateGapSummary(cmp);
      setGap(summary);
      updateGapSummary(id, summary);
    } catch (e) {
      setGapError(e.message);
    } finally {
      setGapBusy(false);
    }
  };

  const jumpToClause = (clauseId) => {
    if (!cmp || !clauseId) return;
    const target = cmp.diffs.find((d) => d.id === clauseId);
    if (!target) return;
    setFilter('all');
    setSearch('');
    setSelected(target);
  };

  const filtered = useMemo(() => {
    if (!cmp) return [];
    return cmp.diffs.filter(d => {
      const fOk = filter === 'all' || d.status === filter;
      const sOk = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search);
      return fOk && sOk;
    });
  }, [cmp, filter, search]);

  const exportCSV = () => {
    if (!cmp) return;
    const rows = [['조항 ID', '제목', '상태', '이전 내용', '새 내용']];
    cmp.diffs.forEach(d => rows.push([d.id, d.title, STATUS[d.status]?.label || d.status, d.oldContent || '', d.newContent || '']));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${cmp.name}.csv`;
    a.click();
  };

  if (!id || !cmp) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{!id ? '잘못된 접근입니다' : '비교 결과를 찾을 수 없습니다'}</p>
          <Link href="/" className="text-blue-600 hover:underline text-sm">← 홈으로</Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'all',      label: '전체', count: cmp.diffs.length },
    { key: 'added',    label: '추가', count: cmp.stats.added },
    { key: 'modified', label: '수정', count: cmp.stats.modified },
    { key: 'removed',  label: '삭제', count: cmp.stats.removed },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm flex-shrink-0 z-10">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="text-gray-400 hover:text-gray-700 flex-shrink-0 text-lg">←</Link>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">{cmp.name}</h1>
              <p className="text-xs text-gray-400 truncate">{cmp.oldFileName} → {cmp.newFileName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">+{cmp.stats.added}</span>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-bold border border-amber-200">~{cmp.stats.modified}</span>
            <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-bold border border-red-200">-{cmp.stats.removed}</span>
            <button onClick={exportCSV} className="ml-2 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors">
              CSV 내보내기
            </button>
          </div>
        </div>
      </header>

      <GapPanel
        summary={gap}
        busy={gapBusy}
        error={gapError}
        onGenerate={handleGenerateGap}
        onDownload={() => downloadSummaryMarkdown(gap, cmp)}
        onJump={jumpToClause}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="조항 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex border-b border-gray-100">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  filter === t.key ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}<span className="ml-0.5 opacity-60">({t.count})</span>
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-5 text-xs text-gray-400 text-center">결과 없음</p>
            ) : (
              filtered.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selected?.id === d.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS[d.status]?.dot}`} />
                    <span className="text-xs font-mono text-gray-400">{d.id}</span>
                    <span className={`ml-auto text-xs px-1.5 py-px rounded border font-semibold ${STATUS[d.status]?.badge}`}>
                      {STATUS[d.status]?.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2 pl-3 leading-relaxed">{d.title}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          <DiffView clause={selected} />
        </main>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-gray-400">로딩 중...</div>}>
      <CompareContent />
    </Suspense>
  );
}
