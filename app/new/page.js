'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { parseFile } from '../../lib/clientParser';
import { extractClauses, compareClauses } from '../../lib/diffUtils';
import { saveComparison } from '../../lib/storage';

const STEPS = ['파일 선택', '문서 파싱', '비교 분석', '완료'];

function FileZone({ file, setFile, inputRef, label }) {
  const [dragging, setDragging] = useState(false);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, [setFile]);

  return (
    <div
      className={`flex-1 border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer select-none transition-all duration-200 ${
        file
          ? 'border-blue-400 bg-blue-50'
          : dragging
          ? 'border-blue-400 bg-blue-50 scale-[1.02]'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
      }`}
      onDrop={onDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.xlsx,.xls"
        onChange={(e) => e.target.files[0] && setFile(e.target.files[0])}
      />
      {file ? (
        <div>
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">📄</div>
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
          <p className="text-xs text-gray-400 mt-0.5">드래그하거나 클릭하여 선택</p>
        </div>
      )}
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
  const oldRef = useRef();
  const newRef = useRef();

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
              <h2 className="text-sm font-semibold text-gray-700 mb-4">문서 업로드</h2>
              <div className="flex gap-4 items-center">
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">이전 버전</span>
                  <FileZone file={oldFile} setFile={setOldFile} inputRef={oldRef} label="이전 버전 문서" />
                </div>
                <div className="flex-shrink-0 text-2xl text-gray-300 mt-4">→</div>
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
