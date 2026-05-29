'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import DocumentViewer from '@/components/DocumentViewer';

export default function ViewerPage() {
  const { documentId } = useParams();
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      try {
        setMetaError('');
        setMeta(null);
        const res = await fetch(`/api/documents/${documentId}/meta`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `문서 정보를 불러오지 못했습니다 (${res.status})`);
        }
        if (!cancelled) {
          setMeta(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setMetaError(loadError.message);
        }
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div id="page-viewer" className="h-screen bg-gray-100">
      <header id="header-viewer" className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-5">
        <div id="viewer-title-group" className="min-w-0">
          <p id="viewer-label" className="text-xs font-medium uppercase tracking-wide text-gray-400">문서 뷰어</p>
          <h1 id="viewer-filename" className="truncate text-sm font-semibold text-gray-900">
            {meta?.filename || '문서 뷰어'}
          </h1>
        </div>
        <Link id="link-back-home" href="/" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          목록으로
        </Link>
      </header>

      <main id="main-viewer" className="h-[calc(100vh-4rem)] p-4">
        {metaError ? (
          <div id="viewer-error-container" className="flex h-full items-center justify-center">
            <div id="viewer-error" className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm">
              <p className="font-semibold viewer-error-title">뷰어를 시작할 수 없습니다.</p>
              <p className="mt-2 whitespace-pre-wrap viewer-error-message">{metaError}</p>
            </div>
          </div>
        ) : !meta ? (
          <div id="viewer-loading" className="flex h-full items-center justify-center text-sm text-gray-500">
            뷰어 설정을 불러오는 중...
          </div>
        ) : (
          <div id="viewer-document-container" className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <DocumentViewer documentId={documentId} fileType={meta.fileType} filename={meta.filename} />
          </div>
        )}
      </main>
    </div>
  );
}
