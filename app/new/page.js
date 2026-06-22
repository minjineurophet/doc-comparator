'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseFile } from '../../lib/clientParser';
import { extractClauses, compareClauses } from '../../lib/diffUtils';
import { saveComparison } from '../../lib/storage';

const STEPS = ['파일 선택', '문서 파싱', '비교 분석', '완료'];

function fileIcon(file) {
  if (!file) return '📁';
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📕';
  if (ext === 'docx' || ext === 'doc') return '📘';
  if (ext === 'xlsx' || ext === 'xls') return '📗';
  return '📄';
}

function FileZone({ file, setFile, inputRef, label, highlight }) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragDepth.current--;
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, [setFile]);

  const active = dragging || highlight;

  return (
    <div
      className={`flex-1 border-2 border-dashed rounded-2xl text-center cursor-pointer select-none transition-all duration-200 ${
        file && !active
          ? 'border-blue-400 bg-blue-50 p-6'
          : active
          ? 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg p-6'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50 p-8'
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.xlsx,.xls"
        onChange={(e) => e.target.files[0] && setFile(e.target.files[0])}
      />

      {active && !file ? (
        // drag-over empty state
        <div className="py-4">
          <div className="text-5xl mb-3 animate-bounce">⬇️</div>
          <p className="font-bold text-blue-600 text-sm">여기에 놓으세요</p>
        </div>
      ) : file ? (
        <div>
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">
            {fileIcon(file)}
          </div>
          <p className="font-bold text-gray-800 text-sm truncate px-2">{file.name}</p>
          <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
          <button
            className="mt-3 text-xs text-red-500 hover:text-red-700 underline"
            onClick={(e) => { e.stopPropagation(); setFile(null); }}
          >
            제거
          </button>
        </div>
      ) : (
        <div>
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">📁</div>
          <p className="font-semibold text-gray-700 text-sm mb-1">{label}</p>
          <p className="text-xs text-gray-400">PDF · DOCX · XLSX</p>
          <p className="text-xs text-blue-400 mt-1.5 font-medium">드래그 또는 클릭하여 선택</p>
        </div>
      )}
    </div>
  );
}

// Full-page drag overlay — shown when user drags a file anywhere on the window
function DragOverlay({ onDropOld, onDropNew, oldFile, newFile, onClose }) {
  const [target, setTarget] = useState(null); // 'old' | 'new'

  const makeZoneProps = (side, setFile) => ({
    onDragEnter: (e) => { e.preventDefault(); setTarget(side); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTarget(null); },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) setFile(f);
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()} // prevent browser default on background
    >
      {/* Old file zone — left half */}
      <div
        {...makeZoneProps('old', onDropOld)}
        className={`flex-1 flex flex-col items-center justify-center gap-4 transition-all duration-150 ${
          target === 'old' ? 'bg-blue-500/30' : 'bg-white/5'
        }`}
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all duration-150 ${
          target === 'old' ? 'bg-blue-400 scale-110' : 'bg-white/20'
        }`}>
          {oldFile ? fileIcon(oldFile) : '📄'}
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-bold mb-1">이전 버전</p>
          {oldFile
            ? <p className="text-blue-200 text-xs">{oldFile.name} (교체됨)</p>
            : <p className="text-white/60 text-xs">파일을 이쪽에 놓으세요</p>
          }
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-white/20 my-16" />

      {/* New file zone — right half */}
      <div
        {...makeZoneProps('new', onDropNew)}
        className={`flex-1 flex flex-col items-center justify-center gap-4 transition-all duration-150 ${
          target === 'new' ? 'bg-emerald-500/30' : 'bg-white/5'
        }`}
      >
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all duration-150 ${
          target === 'new' ? 'bg-emerald-400 scale-110' : 'bg-white/20'
        }`}>
          {newFile ? fileIcon(newFile) : '📄'}
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-bold mb-1">새 버전</p>
          {newFile
            ? <p className="text-emerald-200 text-xs">{newFile.name} (교체됨)</p>
            : <p className="text-white/60 text-xs">파일을 이쪽에 놓으세요</p>
          }
        </div>
      </div>

      {/* Escape hint */}
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

export default function NewPage() {
  const router = useRouter();
  const [oldFile, setOldFile] = useState(null);
  const [newFile, setNewFile] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [pageOverlay, setPageOverlay] = useState(false);
  const oldRef = useRef();
  const newRef = useRef();
  const dragDepth = useRef(0);

  // Detect file drag entering the page → show full-screen overlay
  useEffect(() => {
    const onEnter = (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
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

  const handleCompare = async () => {
    if (!oldFile || !newFile) return;
    setBusy(true);
    setError(null);
    setStep(1);
    try {
      const [oldText, newText] = await Promise.all([parseFile(oldFile), parseFile(newFile)]);
      setStep(2);
      const diffs = compareClauses(extractClauses(oldText), extractClauses(newText));
      setStep(3);
      const stats = {
        added: diffs.filter(d => d.status === 'added').length,
        modified: diffs.filter(d => d.status === 'modified').length,
        removed: diffs.filter(d => d.status === 'removed').length,
      };
      const id = saveComparison({
        name: name.trim() || `${oldFile.name} → ${newFile.name}`,
        oldFileName: oldFile.name,
        newFileName: newFile.name,
        diffs,
        stats,
      });
      router.push(`/compare?id=${id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setStep(0);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Full-page drag overlay */}
      {pageOverlay && !busy && (
        <DragOverlay
          onDropOld={setOldFile}
          onDropNew={setNewFile}
          oldFile={oldFile}
          newFile={newFile}
          onClose={() => { dragDepth.current = 0; setPageOverlay(false); }}
        />
      )}

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-700 text-lg font-medium transition-colors">←</Link>
          <h1 className="text-lg font-bold text-gray-900">새 비교 만들기</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {busy ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
            <div className="text-5xl mb-6">⚙️</div>
            <h2 className="text-xl font-bold text-gray-800 mb-10">문서를 처리하는 중...</h2>
            <div className="flex items-center justify-center mb-10">
              {STEPS.map((s, i) => (
                <div key={i} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      i < step ? 'bg-blue-600 text-white' :
                      i === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {i < step ? '✓' : i + 1}
                    </div>
                    <span className={`text-xs mt-1.5 font-medium ${i <= step ? 'text-blue-600' : 'text-gray-400'}`}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-14 h-0.5 -mt-5 transition-all ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-400">브라우저에서 직접 파싱 중입니다...</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">비교 이름 (선택)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: IEC 62366 v2.0 → v2.1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700">문서 업로드</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                  파일을 페이지에 드래그하면 바로 업로드
                </span>
              </div>
              <div className="flex gap-4 items-stretch">
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">이전 버전</span>
                  <FileZone file={oldFile} setFile={setOldFile} inputRef={oldRef} label="이전 버전 문서" />
                </div>
                <div className="flex-shrink-0 flex items-center text-2xl text-gray-200">→</div>
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">새 버전</span>
                  <FileZone file={newFile} setFile={setNewFile} inputRef={newRef} label="새 버전 문서" />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
                <p className="text-sm text-red-700 font-medium">⚠ {error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleCompare}
                disabled={!oldFile || !newFile}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold shadow-md text-sm"
              >
                비교 시작 →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
