// Browser-side document parser (no server required)

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'docx' || ext === 'doc') return parseDOCX(file);
  if (ext === 'pdf') return parsePDF(file);
  if (ext === 'xlsx' || ext === 'xls') return parseXLSX(file);
  return file.text();
}

async function parseDOCX(file) {
  const mammoth = (await import('mammoth')).default;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/doc-comparator/pdf.worker.min.mjs';
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}

async function parseXLSX(file) {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  return wb.SheetNames
    .map(name => XLSX.utils.sheet_to_txt(wb.Sheets[name]))
    .join('\n\n');
}
