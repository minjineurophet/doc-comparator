'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ── PdfPage ────────────────────────────────────────────────────────────────────

function PdfPage({ pageNum, pdfRef }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const pdf = pdfRef.current;
      if (!pdf) return;

      const page = await pdf.getPage(pageNum);
      if (cancelled) {
        page.cleanup();
        return;
      }

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) {
        page.cleanup();
        return;
      }

      const containerWidth = (canvas.parentElement?.clientWidth ?? 600) - 32;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth > 0 ? containerWidth / baseViewport.width : 1;
      const scaledViewport = page.getViewport({ scale });

      const dpr = window.devicePixelRatio || 1;
      canvas.width = scaledViewport.width * dpr;
      canvas.height = scaledViewport.height * dpr;
      canvas.style.width = scaledViewport.width + 'px';
      canvas.style.height = scaledViewport.height + 'px';

      setDimensions({ w: scaledViewport.width, h: scaledViewport.height });

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);

      renderTaskRef.current = page.render({
        canvasContext: ctx,
        viewport: scaledViewport,
      });

      try {
        await renderTaskRef.current.promise;
      } catch (err) {
        if (err?.name === 'RenderingCancelledException') return;
        throw err;
      }

      if (cancelled) {
        page.cleanup();
        return;
      }

      // Clear previous text layer children
      while (textLayerDiv.firstChild) {
        textLayerDiv.removeChild(textLayerDiv.firstChild);
      }

      const textContent = await page.getTextContent();
      if (cancelled) {
        page.cleanup();
        return;
      }

      const textLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: scaledViewport,
      });

      await textLayer.render();

      page.cleanup();
    }

    renderPage().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') {
        console.error(`PdfPage ${pageNum} render error:`, err);
      }
    });

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pageNum, pdfRef]);

  return (
    <div
      data-page={pageNum}
      className="relative mx-auto shadow-sm rounded overflow-hidden bg-white pdf-page"
      style={{ width: dimensions.w || 'auto', height: dimensions.h || 'auto', minHeight: 100 }}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" />
      <div
        ref={textLayerRef}
        className="pdfjs-text-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          userSelect: 'text',
          cursor: 'text',
          color: 'transparent',
          lineHeight: 1,
        }}
      />
    </div>
  );
}

// ── PdfViewer ──────────────────────────────────────────────────────────────────

export default function PdfViewer({ documentId, registerApi }) {
  const containerRef = useRef(null);
  const pdfRef = useRef(null);
  const pageTextsRef = useRef([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState(0);

  const search = useCallback((tokens) => {
    const container = containerRef.current;
    if (!container || !tokens?.length) return;

    for (const token of tokens) {
      const lower = token.toLowerCase();
      const pageIndex = pageTextsRef.current.findIndex((text) =>
        text.toLowerCase().includes(lower)
      );
      if (pageIndex === -1) continue;

      const pageNum = pageIndex + 1;
      const pageEl = container.querySelector(`[data-page="${pageNum}"]`);
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight matching spans for 2 seconds
        const spans = pageEl.querySelectorAll('.pdfjs-text-layer span');
        for (const span of spans) {
          if (span.textContent.toLowerCase().includes(lower)) {
            const original = span.style.backgroundColor;
            span.style.backgroundColor = '#fef08a';
            setTimeout(() => {
              span.style.backgroundColor = original;
            }, 2000);
          }
        }
      }
      break;
    }
  }, []);

  useEffect(() => {
    if (registerApi) registerApi({ search });
  }, [registerApi, search]);

  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;
    setLoading(true);
    setError('');
    setNumPages(0);
    pageTextsRef.current = [];

    const loadingTask = pdfjs.getDocument({
      url: `/api/documents/${documentId}/content`,
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
    });

    loadingTask.promise
      .then(async (pdf) => {
        if (cancelled) {
          pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        const total = pdf.numPages;
        setNumPages(total);
        setLoading(false);

        // Extract text for each page
        for (let i = 1; i <= total; i++) {
          if (cancelled) break;
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const text = textContent.items
              .map((item) => item.str)
              .join(' ');
            pageTextsRef.current[i - 1] = text;
            page.cleanup();
          } catch {
            pageTextsRef.current[i - 1] = '';
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'PDF를 불러오지 못했습니다.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (pdfRef.current) {
        pdfRef.current.destroy();
        pdfRef.current = null;
      }
    };
  }, [documentId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-700 pdf-viewer-error-container">
        <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-5 pdf-viewer-error">
          <p className="font-semibold pdf-viewer-error-title">뷰어를 시작할 수 없습니다.</p>
          <p className="mt-2 whitespace-pre-wrap pdf-viewer-error-message">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div id="pdf-viewer-loading" className="flex h-full items-center justify-center text-sm text-gray-400 pdf-viewer-loading">
        PDF를 불러오는 중...
      </div>
    );
  }

  return (
    <div id="pdf-viewer-container" ref={containerRef} className="h-full overflow-y-auto bg-gray-100 p-4 space-y-4 pdf-viewer">
      {Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={i + 1} pageNum={i + 1} pdfRef={pdfRef} />
      ))}
    </div>
  );
}
