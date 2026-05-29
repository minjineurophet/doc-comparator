import { NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    return NextResponse.json({ text: result.text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
