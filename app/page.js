'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listComparisons, deleteComparison } from '@/lib/storage';

export default function Home() {
  const [comparisons, setComparisons] = useState([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setComparisons(listComparisons());
  }, []);

  const handleDelete = (id) => {
    deleteComparison(id);
    setComparisons(listComparisons());
  };

  return (
    <div id="page-home" className="min-h-screen bg-gray-50">
      <header id="header-home" className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 id="app-title" className="text-xl font-semibold text-gray-900">Doc Comparator</h1>
            <p className="text-sm text-gray-500 mt-0.5 app-subtitle">문서 버전 비교 및 변경 검색</p>
          </div>
          <Link
            id="btn-new-comparison-header"
            href="/new"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            새 비교 생성
          </Link>
        </div>
      </header>

      <main id="main-home" className="max-w-4xl mx-auto px-6 py-8">
        {!mounted ? null : comparisons.length === 0 ? (
          <div id="empty-state" className="text-center py-24">
            <div className="text-5xl mb-4 empty-state-icon">📄</div>
            <h2 id="empty-state-title" className="text-lg font-medium text-gray-700 mb-2">비교 내역이 없습니다</h2>
            <p id="empty-state-desc" className="text-gray-400 text-sm mb-6">두 버전의 문서를 업로드하여 변경사항을 비교하고 원문을 뷰어로 열어보세요.</p>
            <Link
              id="btn-new-comparison-empty"
              href="/new"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              새 비교 생성
            </Link>
          </div>
        ) : (
          <div id="comparisons-list" className="space-y-3">
            {comparisons.map((comp) => (
              <div
                key={comp.id}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between comparison-card"
              >
                <div className="comparison-card-body">
                  <h3 className="font-medium text-gray-900 comparison-card-title">{comp.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5 comparison-card-meta">
                    {comp.document1Filename} → {comp.document2Filename}
                    {' · '}
                    {new Date(comp.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                  <div className="flex gap-1.5 mt-2.5 comparison-card-stats">
                    {comp.stats.added > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 stat-badge stat-badge--added">
                        +{comp.stats.added} Added
                      </span>
                    )}
                    {comp.stats.modified > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 stat-badge stat-badge--modified">
                        ~{comp.stats.modified} Modified
                      </span>
                    )}
                    {comp.stats.removed > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 stat-badge stat-badge--removed">
                        -{comp.stats.removed} Removed
                      </span>
                    )}
                    {comp.stats.total === 0 && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 stat-badge stat-badge--unchanged">
                        변경 없음
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4 comparison-card-actions">
                  <Link
                    href={`/compare/${comp.id}`}
                    className="px-4 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors btn-view-comparison"
                  >
                    보기
                  </Link>
                  <button
                    onClick={() => handleDelete(comp.id)}
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors btn-delete-comparison"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
