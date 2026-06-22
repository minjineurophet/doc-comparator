'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getComparisons, deleteComparison } from '../lib/storage';

export default function HomePage() {
  const [comparisons, setComparisons] = useState([]);

  useEffect(() => { setComparisons(getComparisons()); }, []);

  const handleDelete = (id) => {
    if (!confirm('이 비교 결과를 삭제하시겠습니까?')) return;
    deleteComparison(id);
    setComparisons(getComparisons());
  };

  const fmtDate = (s) =>
    new Date(s).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-none">Doc Comparator</h1>
              <p className="text-xs text-gray-400 mt-0.5">문서 버전 비교 도구</p>
            </div>
          </div>
          <Link
            href="/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-sm"
          >
            + 새 비교 만들기
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {comparisons.length === 0 ? (
          <div className="text-center py-28">
            <div className="text-6xl mb-5">🔍</div>
            <h2 className="text-2xl font-bold text-gray-700 mb-2">비교 결과가 없습니다</h2>
            <p className="text-gray-500 mb-8">두 문서를 업로드하여 변경 사항을 자동으로 추출해 보세요</p>
            <Link
              href="/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md"
            >
              시작하기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 font-medium">비교 기록 ({comparisons.length}개)</p>
            {comparisons.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 truncate mb-0.5">{c.name}</h3>
                    <p className="text-xs text-gray-400 mb-3">{fmtDate(c.createdAt)}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4 font-medium">
                      <span className="bg-gray-100 px-2 py-0.5 rounded truncate max-w-[160px]">{c.oldFileName}</span>
                      <span className="text-gray-300 flex-shrink-0">→</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded truncate max-w-[160px]">{c.newFileName}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.stats.added > 0 && (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-200">
                          +{c.stats.added} 추가
                        </span>
                      )}
                      {c.stats.modified > 0 && (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                          ~{c.stats.modified} 수정
                        </span>
                      )}
                      {c.stats.removed > 0 && (
                        <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full text-xs font-semibold border border-red-200">
                          -{c.stats.removed} 삭제
                        </span>
                      )}
                      {!c.stats.added && !c.stats.modified && !c.stats.removed && (
                        <span className="px-2.5 py-1 bg-gray-50 text-gray-500 rounded-full text-xs font-semibold border border-gray-200">
                          변경 없음
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link
                      href={`/compare?id=${c.id}`}
                      className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-semibold"
                    >
                      보기
                    </Link>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="px-4 py-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-semibold"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
