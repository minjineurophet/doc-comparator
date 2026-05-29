'use client';

import dynamic from 'next/dynamic';

function ViewerLoading({ text }) {
  return (
    <div className="h-full flex items-center justify-center viewer-loading">
      <span className="text-sm text-gray-500 viewer-loading-text">{text}</span>
    </div>
  );
}

const PdfViewer = dynamic(() => import('./PdfViewer'), {
  ssr: false,
  loading: () => <ViewerLoading text="PDF 뷰어를 불러오는 중..." />,
});

const DocxViewer = dynamic(() => import('./DocxViewer'), {
  ssr: false,
  loading: () => <ViewerLoading text="문서를 불러오는 중..." />,
});

export default function DocumentViewer({ documentId, fileType, filename, registerApi }) {
  if (!documentId) {
    return (
      <div id="document-viewer-empty" className="h-full flex items-center justify-center">
        <span className="text-gray-400 document-viewer-empty-msg">문서가 없습니다.</span>
      </div>
    );
  }

  if (fileType === 'pdf') {
    return <PdfViewer documentId={documentId} registerApi={registerApi} />;
  }

  if (fileType === 'docx') {
    return <DocxViewer documentId={documentId} registerApi={registerApi} />;
  }

  return (
    <div id="document-viewer-unsupported" className="h-full flex items-center justify-center">
      <span className="text-gray-400 document-viewer-unsupported-msg">
        이 형식({fileType || '알 수 없음'})은 미리보기를 지원하지 않습니다.
      </span>
    </div>
  );
}
