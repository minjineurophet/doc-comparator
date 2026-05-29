import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { getStoredDocument, getStoredDocumentPath } from '@/lib/documentStorage';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const doc = await getStoredDocument(id);

    if (!doc) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (doc.fileType !== 'docx') {
      return NextResponse.json(
        { error: 'DOCX 파일만 HTML 변환을 지원합니다.' },
        { status: 400 }
      );
    }

    const buffer = await readFile(getStoredDocumentPath(doc));
    const mammoth = (await import('mammoth')).default;
    const { value: rawHtml } = await mammoth.convertToHtml({ buffer });

    const clean = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'colgroup',
        'col',
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'width', 'height'],
        a: ['href', 'target', 'rel'],
        table: ['border', 'cellpadding', 'cellspacing'],
        td: ['colspan', 'rowspan', 'valign'],
        th: ['colspan', 'rowspan', 'valign'],
      },
    });

    return NextResponse.json({ html: clean });
  } catch (error) {
    console.error('[html/route] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
