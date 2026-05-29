import { readFile } from 'node:fs/promises';
import { getStoredDocument, getStoredDocumentPath } from '@/lib/documentStorage';

export const runtime = 'nodejs';

function contentDisposition(filename, asAttachment = false) {
  const dispositionType = asAttachment ? 'attachment' : 'inline';
  return `${dispositionType}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const document = await getStoredDocument(id);

  if (!document) {
    return new Response('Not found', { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const shouldDownload = searchParams.get('download') === '1';
  const body = await readFile(getStoredDocumentPath(document));
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': contentDisposition(document.filename, shouldDownload),
      'Content-Length': String(body.byteLength),
      'Content-Type': document.mimeType || 'application/octet-stream',
    },
  });
}
