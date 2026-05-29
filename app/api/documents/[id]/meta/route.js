import { NextResponse } from 'next/server';
import { getStoredDocument } from '@/lib/documentStorage';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const doc = await getStoredDocument(id);

    if (!doc) {
      return NextResponse.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ filename: doc.filename, fileType: doc.fileType });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
