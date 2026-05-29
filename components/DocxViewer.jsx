'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export default function DocxViewer({ documentId, registerApi }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const search = useCallback((tokens) => {
    // Remove previous highlights
    containerRef.current?.querySelectorAll('mark[data-viewer-search]').forEach((m) => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });

    // Highlight each token (stop after first match per token)
    for (const token of tokens) {
      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT
      );

      let node;
      while ((node = walker.nextNode())) {
        const idx = node.nodeValue.toLowerCase().indexOf(token.toLowerCase());
        if (idx !== -1) {
          try {
            const range = document.createRange();
            range.setStart(node, idx);
            range.setEnd(node, idx + token.length);

            const mark = document.createElement('mark');
            mark.dataset.viewerSearch = 'true';
            mark.style.backgroundColor = '#fef08a';
            range.surroundContents(mark);
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch {
            // skip if the range spans multiple nodes
          }
          break; // stop after first match for this token
        }
      }
    }
  }, []);

  // Register API
  useEffect(() => {
    if (registerApi) registerApi({ search });
  }, [registerApi, search]);

  // Load HTML on documentId change
  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setHtml('');

    fetch(`/api/documents/${documentId}/html`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setHtml(data.html);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full docx-viewer-error-container">
        <div id="docx-viewer-error" className="bg-red-50 border border-red-300 text-red-700 rounded-lg px-6 py-4 text-sm docx-viewer-error">
          {error}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="docx-viewer-loading" className="flex items-center justify-center h-full text-gray-500 text-sm docx-viewer-loading">
        문서를 불러오는 중...
      </div>
    );
  }

  return (
    <div id="docx-viewer-container" className="h-full overflow-y-auto bg-white docx-viewer">
      <div
        id="docx-viewer-content"
        ref={containerRef}
        className="docx-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
