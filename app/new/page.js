'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { extractClauses, compareClauses } from '@/lib/diffUtils';
import { saveComparison } from '@/lib/storage';

const FORMAT_META = {
  pdf:  { label: 'PDF',   icon: '📄', color: 'text-red-600 bg-red-50 border-red-200' },
  docx: { label: 'Word',  icon: '📝', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  xlsx: { label: 'Excel', icon: '📊', color: 'text-green-600 bg-green-50 border-green-200' },
};

function detectFormat(file) {
  if (!file) return null;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  return null;
}

function UploadZone({ label, sublabel, file, onSelect }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const format = detectFormat(file);
  const meta = format ? FORMAT_META[format] : null;

  const onDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current--;
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onSelect(f);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`upload-zone w-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-colors cursor-pointer
        ${dragging
          ? 'border-blue-500 bg-blue-100'
          : file
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/60'
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls"
        className="upload-zone-input hidden"
        onChange={e => onSelect(e.target.files?.[0] ?? null)}
      />
      {dragging ? (
        <>
          <span className="text-3xl mb-3">⬇️</span>
          <span className="text-sm font-semibold text-blue-600">여기에 놓으세요</span>
        </>
      ) : (
        <>
          <span className="upload-zone-icon text-3xl mb-3">{file ? (meta?.icon ?? '✅') : '📁'}</span>
          <span className="upload-zone-label text-sm font-semibold text-gray-700">{label}</span>
          <span className="upload-zone-sublabel text-xs text-gray-400 mt-1">{sublabel}</span>
          {file && meta && (
            <span className={`upload-zone-format-badge text-[11px] font-semibold mt-2 px-2 py-0.5 rounded border ${meta.color}`}>
              {meta.label}
            </span>
          )}
          {file && (
            <span className="upload-zone-filename text-xs text-blue-600 font-medium mt-1 truncate max-w-[200px]">
              {file.name}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// Full-page drag overlay — appears when a file is dragged anywhere onto the window.
// Splits the screen into 문서 1 (left) / 문서 2 (right) drop targets.
function DragOverlay({ onDropDoc1, onDropDoc2, doc1File, doc2File, onClose }) {
  const [target, setTarget] = useState(null); // 'doc1' | 'doc2'

  const makeZoneProps = (side, onDrop) => ({
    onDragEnter: (e) => { e.preventDefault(); setTarget(side); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTarget(null); },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) onDrop(f);
      onClose();
    },
  });

  return (
    <div
      id="drag-overlay"
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        {...makeZoneProps('doc1', onDropDoc1)}
        className={`flex-1 flex flex-col items-center justify-center gap-4 transition-all duration-150 ${target === 'doc1' ? 'bg-red-500/30' : 'bg-white/5'}`}
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all duration-150 ${target === 'doc1' ? 'bg-red-400 scale-110' : 'bg-white/20'}`}>
          {doc1File ? (FORMAT_META[detectFormat(doc1File)]?.icon ?? '📄') : '📄'}
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-bold mb-1">문서 1</p>
          {doc1File
            ? <p className="text-red-200 text-xs">{doc1File.name} (교체됨)</p>
            : <p className="text-white/60 text-xs">파일을 이쪽에 놓으세요</p>}
        </div>
      </div>

      <div className="w-px bg-white/20 my-16" />

      <div
        {...makeZoneProps('doc2', onDropDoc2)}
        className={`flex-1 flex flex-col items-center justify-center gap-4 transition-all duration-150 ${target === 'doc2' ? 'bg-green-500/30' : 'bg-white/5'}`}
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all duration-150 ${target === 'doc2' ? 'bg-green-400 scale-110' : 'bg-white/20'}`}>
          {doc2File ? (FORMAT_META[detectFormat(doc2File)]?.icon ?? '📄') : '📄'}
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-bold mb-1">문서 2</p>
          {doc2File
            ? <p className="text-green-200 text-xs">{doc2File.name} (교체됨)</p>
            : <p className="text-white/60 text-xs">파일을 이쪽에 놓으세요</p>}
        </div>
      </div>

      <button
        className="absolute top-4 right-4 text-white/50 hover:text-white text-sm"
        onClick={onClose}
        onDragOver={(e) => e.stopPropagation()}
      >
        ESC로 닫기
      </button>
    </div>
  );
}

async function parseDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/parse-document', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `파싱 실패 (${res.status})`);
  }
  const { text, markdown, format } = await res.json();
  if (!text && !markdown) throw new Error('텍스트를 추출할 수 없습니다.');
  return { text, markdown, format };
}

async function storeDocument(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/documents', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `문서 저장 실패 (${res.status})`);
  }
  const { document } = await res.json();
  return document;
}

const STEPS = [
  { key: 'idle',           label: null },
  { key: 'parsing-old',   label: (fmt) => `문서 1 (${FORMAT_META[fmt]?.label ?? fmt}) 파싱 중...` },
  { key: 'md-old',        label: () => '문서 1 → Markdown 변환 중...' },
  { key: 'parsing-new',   label: (fmt) => `문서 2 (${FORMAT_META[fmt]?.label ?? fmt}) 파싱 중...` },
  { key: 'md-new',        label: () => '문서 2 → Markdown 변환 중...' },
  { key: 'comparing',     label: () => 'Clause 비교 중...' },
  { key: 'storing-documents', label: () => '원본 문서 저장 중...' },
  { key: 'done',          label: () => '완료! 이동 중...' },
];

export default function NewComparison() {
  const router = useRouter();
  const [document1File, setDocument1File] = useState(null);
  const [document2File, setDocument2File] = useState(null);
  const [name, setName] = useState('');
  const [step, setStep] = useState('idle');
  const [stepFmt, setStepFmt] = useState('');
  const [error, setError] = useState('');
  const [pageOverlay, setPageOverlay] = useState(false);
  const dragDepth = useRef(0);

  const isProcessing = step !== 'idle' && step !== 'error';
  const canStart = !!document1File && !!document2File && !isProcessing;

  // Full-page drag detection → show split overlay when a file enters the window.
  useEffect(() => {
    const onEnter = (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragDepth.current++;
      setPageOverlay(true);
    };
    const onLeave = () => {
      dragDepth.current--;
      if (dragDepth.current <= 0) { dragDepth.current = 0; setPageOverlay(false); }
    };
    const onDrop = () => { dragDepth.current = 0; setPageOverlay(false); };
    const onOver = (e) => e.preventDefault();
    const onKey = (e) => { if (e.key === 'Escape') { dragDepth.current = 0; setPageOverlay(false); } };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onOver);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const closeOverlay = useCallback(() => { dragDepth.current = 0; setPageOverlay(false); }, []);

  const currentLabel = STEPS.find(s => s.key === step)?.label?.(stepFmt) ?? null;

  const handleStart = async () => {
    const compName = name.trim() || `${document1File.name} vs ${document2File.name}`;
    setError('');

    try {
      // Parse document 1
      setStep('parsing-old'); setStepFmt(detectFormat(document1File) ?? '');
      const document1Result = await parseDocument(document1File);

      setStep('md-old');
      // markdown already returned from API — brief UI beat
      await new Promise(r => setTimeout(r, 300));

      // Parse document 2
      setStep('parsing-new'); setStepFmt(detectFormat(document2File) ?? '');
      const document2Result = await parseDocument(document2File);

      setStep('md-new');
      await new Promise(r => setTimeout(r, 300));

      // Compare
      setStep('comparing');
      const document1Clauses = extractClauses(document1Result.markdown || document1Result.text);
      const document2Clauses = extractClauses(document2Result.markdown || document2Result.text);
      const diffs = compareClauses(document1Clauses, document2Clauses);

      const stats = diffs.reduce(
        (acc, d) => { acc[d.changeType]++; acc.total++; return acc; },
        { total: 0, added: 0, modified: 0, removed: 0 }
      );

      setStep('storing-documents');
      const document1 = await storeDocument(document1File);
      const document2 = await storeDocument(document2File);

      const id = crypto.randomUUID();
      saveComparison({
        id,
        name: compName,
        createdAt: new Date().toISOString(),
        document1Filename: document1File.name,
        document1Format: document1Result.format,
        document1Id: document1.id,
        document1Markdown: document1Result.markdown || document1Result.text || '',
        document2Filename: document2File.name,
        document2Format: document2Result.format,
        document2Id: document2.id,
        document2Markdown: document2Result.markdown || document2Result.text || '',
        diffs,
        stats,
      });

      setStep('done');
      router.push(`/compare/${id}`);
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  return (
    <div id="page-new" className="min-h-screen bg-gray-50">
      {pageOverlay && !isProcessing && (
        <DragOverlay
          onDropDoc1={setDocument1File}
          onDropDoc2={setDocument2File}
          doc1File={document1File}
          doc2File={document2File}
          onClose={closeOverlay}
        />
      )}

      <header id="header-new" className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link id="link-back-home" href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">←</Link>
          <h1 id="title-new" className="text-xl font-semibold text-gray-900">새 비교 생성</h1>
        </div>
      </header>

      <main id="main-new" className="max-w-2xl mx-auto px-6 py-10">
        <div id="form-new-comparison" className="bg-white rounded-2xl border border-gray-200 p-8 space-y-6">
          {/* Name */}
          <div id="field-comparison-name">
            <label id="label-comparison-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              비교 이름 <span className="text-gray-400 font-normal">(선택)</span>
            </label>
            <input
              id="input-comparison-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: IEC 62366-1 2015 vs 2023"
              disabled={isProcessing}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Supported formats notice */}
          <div id="formats-notice" className="flex items-center gap-2 text-xs text-gray-500">
            <span>지원 형식:</span>
            {Object.entries(FORMAT_META).filter(([k]) => k !== 'xlsx').map(([k, v]) => (
              <span key={k} className={`px-2 py-0.5 rounded border font-medium ${v.color}`}>
                {v.icon} {v.label}
              </span>
            ))}
          </div>

          {/* Upload zones */}
          <div id="upload-grid" className="grid grid-cols-2 gap-4">
            <UploadZone label="문서 1" sublabel="첫 번째 문서" file={document1File} onSelect={setDocument1File} />
            <UploadZone label="문서 2" sublabel="두 번째 문서" file={document2File} onSelect={setDocument2File} />
          </div>

          {/* Conversion pipeline visualization */}
          {(document1File || document2File) && !isProcessing && (
            <div id="pipeline-visualization" className="flex items-center justify-center gap-2 text-xs text-gray-400 py-2">
              <span className="px-2 py-1 rounded bg-gray-100">
                {detectFormat(document1File) ? FORMAT_META[detectFormat(document1File)].label : '—'}
              </span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-600 font-medium border border-indigo-200">Markdown</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-gray-100">Diff</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-gray-100">
                {detectFormat(document2File) ? FORMAT_META[detectFormat(document2File)].label : '—'}
              </span>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div id="progress-indicator" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <div className="progress-spinner w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="progress-label text-sm text-blue-700 font-medium">{currentLabel}</span>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div id="error-message" className="p-4 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700 flex items-start justify-between gap-3">
              <span>{error}</span>
              <button id="btn-retry" onClick={() => setStep('idle')} className="text-red-500 underline flex-shrink-0">다시 시도</button>
            </div>
          )}

          <button
            id="btn-start-comparison"
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            비교 시작
          </button>
        </div>
      </main>
    </div>
  );
}
