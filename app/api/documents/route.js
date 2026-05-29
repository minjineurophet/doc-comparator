import { NextResponse } from 'next/server';
import { saveUploadedDocument } from '@/lib/documentStorage';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const document = await saveUploadedDocument(file);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    const status = error.message?.includes('지원하지 않는 파일 형식') ? 400 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
