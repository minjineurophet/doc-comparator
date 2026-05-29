/**
 * Client-side export utilities.
 * Converts comparison diff data to Word, Excel, or PDF (print).
 */

import { extractClauses } from '@/lib/diffUtils';
import { getClauseEdit } from '@/lib/storage';

function stripClauseHeading(text, clauseNumber) {
  const lines = String(text || '').split('\n');
  const firstLine = lines[0]?.trim();
  if (!firstLine) return '';

  const match = firstLine.match(/^(?:#{1,6}\s+)?(P\d+|\d+(?:\.\d+){0,4})\s+\S/);
  if (match?.[1] === clauseNumber) {
    return lines.slice(1).join('\n').trim();
  }

  return lines.join('\n').trim();
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function isTableSeparatorRow(cells) {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function markdownToRuns(text, TextRun) {
  const source = String(text || '');
  if (!source) return [new TextRun({ text: '' })];

  const runs = [];
  const tokenRegex = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;

  for (const match of source.matchAll(tokenRegex)) {
    const [token] = match;
    const start = match.index ?? 0;

    if (start > lastIndex) {
      runs.push(new TextRun({ text: source.slice(lastIndex, start) }));
    }

    if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Courier New' }));
    }

    lastIndex = start + token.length;
  }

  if (lastIndex < source.length) {
    runs.push(new TextRun({ text: source.slice(lastIndex) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text: source })];
}

function flushTableBuffer(tableBuffer, { Paragraph, Table, TableRow, TableCell, TextRun }) {
  if (tableBuffer.length === 0) return [];

  const parsedRows = tableBuffer
    .map(splitTableRow)
    .filter(Boolean);
  const dataRows = parsedRows.filter(cells => !isTableSeparatorRow(cells));

  if (dataRows.length === 0) return [];

  return [
    new Table({
      rows: dataRows.map(cells => new TableRow({
        children: cells.map(cellText => new TableCell({
          children: [new Paragraph({ children: markdownToRuns(cellText, TextRun) })],
        })),
      })),
    }),
  ];
}

function markdownToDocxChildren(markdown, docx) {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell } = docx;
  const lines = String(markdown || '').split('\n');
  const children = [];
  let tableBuffer = [];

  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    children.push(...flushTableBuffer(tableBuffer, { Paragraph, Table, TableRow, TableCell, TextRun }));
    tableBuffer = [];
  };

  for (const line of lines) {
    const raw = line.trim();

    if (/^\|.+\|$/.test(raw)) {
      tableBuffer.push(raw);
      continue;
    }

    flushTable();

    if (!raw) {
      children.push(new Paragraph({ text: '' }));
      continue;
    }

    if (/^[-*_]{3,}$/.test(raw)) {
      continue;
    }

    const headingMatch = raw.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const headingMap = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      children.push(new Paragraph({
        heading: headingMap[headingMatch[1].length],
        children: markdownToRuns(headingMatch[2], TextRun),
      }));
      continue;
    }

    const orderedListMatch = raw.match(/^(\d+)\.\s+(.*)$/);
    if (orderedListMatch) {
      children.push(new Paragraph({
        indent: { left: 360 },
        children: [
          new TextRun({ text: `${orderedListMatch[1]}. ` }),
          ...markdownToRuns(orderedListMatch[2], TextRun),
        ],
      }));
      continue;
    }

    const bulletListMatch = raw.match(/^[-*+]\s+(.*)$/);
    if (bulletListMatch) {
      children.push(new Paragraph({
        indent: { left: 360 },
        children: [
          new TextRun({ text: '• ' }),
          ...markdownToRuns(bulletListMatch[1], TextRun),
        ],
      }));
      continue;
    }

    children.push(new Paragraph({ children: markdownToRuns(raw, TextRun) }));
  }

  flushTable();
  return children;
}

function resolveDiffContent(comparison, diff, side) {
  const edited = getClauseEdit(comparison, diff.clauseNumber, side);
  const source = edited ?? diff[side] ?? '';
  return stripClauseHeading(source, diff.clauseNumber);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeName(str) {
  return str.replace(/[/\\:*?"<>|]/g, '-');
}

/** Main entry — auto-selects format from comparison.document2Format */
export async function exportComparison(comparison, overrideFormat) {
  const fmt = overrideFormat || comparison.document2Format || comparison.document1Format || 'docx';
  const name = safeName(comparison.name);
  switch (fmt) {
    case 'docx': return exportToDocx(comparison, name);
    case 'xlsx': return exportToXlsx(comparison, name);
    case 'pdf':  return exportToPdf(comparison, name);
    default:     return exportToDocx(comparison, name);
  }
}

/* ── Word (.docx) ─────────────────────────────────────────── */
export async function buildComparisonDocxBuffer(comparison) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell } = await import('docx');
  const docx = { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell };
  const children = [
    new Paragraph({ children: [new TextRun({ text: comparison.name, bold: true, size: 40 })] }),
    new Paragraph({ children: [new TextRun({ text: `${comparison.document1Filename} → ${comparison.document2Filename}`, color: '666666', size: 20 })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ children: [
      new TextRun({ text: `+${comparison.stats.added} Added  `, color: '166534' }),
      new TextRun({ text: `~${comparison.stats.modified} Modified  `, color: '713f12' }),
      new TextRun({ text: `-${comparison.stats.removed} Removed`, color: '991b1b' }),
    ]}),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Changes', heading: HeadingLevel.HEADING_1 }),
  ];

  for (const diff of comparison.diffs) {
    const typeLabel = { added: '[ADDED]', modified: '[MODIFIED]', removed: '[REMOVED]' }[diff.changeType];
    const beforeContent = resolveDiffContent(comparison, diff, 'before');
    const afterContent = resolveDiffContent(comparison, diff, 'after');

    children.push(
      new Paragraph({ text: `${diff.clauseNumber} ${diff.title} ${typeLabel}`, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: diff.summary, italics: true, color: '555555' })] }),
    );
    if (diff.before || getClauseEdit(comparison, diff.clauseNumber, 'before')) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Before:', bold: true, color: 'ef4444' })] }),
        ...markdownToDocxChildren(beforeContent, docx),
      );
    }
    if (diff.after || getClauseEdit(comparison, diff.clauseNumber, 'after')) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'After:', bold: true, color: '22c55e' })] }),
        ...markdownToDocxChildren(afterContent, docx),
      );
    }
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function buildEditedDocumentDocxBuffer(comparison) {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer, Table, TableRow, TableCell } = await import('docx');
  const docx = { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell };
  const baseMarkdown = comparison.document2Markdown || '';
  const clauses = extractClauses(baseMarkdown);

  const editedChildren = clauses.length > 0
    ? clauses.flatMap((clause, index) => {
        const content = getClauseEdit(comparison, clause.number, 'after') ?? clause.content ?? '';
        const children = markdownToDocxChildren(content, docx);
        if (index < clauses.length - 1) {
          children.push(new Paragraph({ text: '' }));
        }
        return children;
      })
    : markdownToDocxChildren(baseMarkdown, docx);

  if (editedChildren.length === 0) {
    throw new Error('편집본으로 내보낼 문서 내용이 없습니다.');
  }

  const children = [
    new Paragraph({ children: [new TextRun({ text: `${comparison.document2Filename || comparison.name} (Edited)`, bold: true, size: 40 })] }),
    new Paragraph({ children: [new TextRun({ text: `Source: ${comparison.document2Filename || '-'}`, color: '666666', size: 20 })] }),
    new Paragraph({ text: '' }),
    ...editedChildren,
  ];

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

async function exportToDocx(comparison, name) {
  const buf = await buildComparisonDocxBuffer(comparison);
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    `${name}-diff.docx`,
  );
}

export async function exportEditedDocument(comparison, name) {
  const filenameBase = safeName(name || comparison.document2Filename || comparison.name || 'comparison');
  const buf = await buildEditedDocumentDocxBuffer(comparison);
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    `${filenameBase}-edited.docx`,
  );
}

/* ── Excel (.xlsx) ────────────────────────────────────────── */
async function exportToXlsx(comparison, name) {
  const xlsx = await import('xlsx');

  // Diff sheet
  const diffRows = comparison.diffs.map(d => ({
    'Clause': d.clauseNumber,
    'Change Type': d.changeType,
    'Title': d.title,
    'Summary': d.summary,
    'Before': d.before,
    'After': d.after,
  }));
  const wsDiff = xlsx.utils.json_to_sheet(diffRows);
  wsDiff['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 50 }, { wch: 60 }, { wch: 60 }];

  // Summary sheet
  const summaryRows = [
    { Item: 'Comparison Name', Value: comparison.name },
    { Item: 'Document 1', Value: comparison.document1Filename },
    { Item: 'Document 2', Value: comparison.document2Filename },
    { Item: 'Date', Value: new Date(comparison.createdAt).toLocaleDateString('ko-KR') },
    { Item: 'Total Diffs', Value: comparison.stats.total },
    { Item: 'Added', Value: comparison.stats.added },
    { Item: 'Modified', Value: comparison.stats.modified },
    { Item: 'Removed', Value: comparison.stats.removed },
  ];
  const wsSummary = xlsx.utils.json_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 60 }];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary');
  xlsx.utils.book_append_sheet(wb, wsDiff, 'Diffs');

  const buf = xlsx.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${name}-diff.xlsx`,
  );
}

/* ── PDF (print-to-PDF via browser) ──────────────────────── */
function exportToPdf(comparison) {
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>${comparison.name}</title>
<style>
  body{font-family:'Malgun Gothic',Arial,sans-serif;font-size:11pt;margin:15mm;color:#111}
  h1{font-size:18pt;border-bottom:2px solid #333;padding-bottom:6px}
  h2{font-size:12pt;margin-top:24px;margin-bottom:4px}
  .meta{color:#666;font-size:10pt;margin-bottom:12px}
  .stats{display:flex;gap:10px;margin:10px 0 16px}
  .badge{padding:2px 10px;border-radius:20px;font-size:9pt;font-weight:600}
  .added{background:#dcfce7;color:#166534}.modified{background:#fef9c3;color:#713f12}.removed{background:#fee2e2;color:#991b1b}
  .summary{color:#555;font-style:italic;margin:4px 0 8px;font-size:10pt}
  .block{border-left:3px solid #ccc;padding:6px 10px;margin:6px 0;background:#fafafa;font-size:9pt}
  .block.before{border-color:#ef4444;background:#fff5f5}
  .block.after{border-color:#22c55e;background:#f0fdf4}
  pre{white-space:pre-wrap;word-break:break-all;margin:4px 0}
  .label{font-weight:700;font-size:9pt;margin-bottom:4px}
  hr{border:none;border-top:1px solid #ddd;margin:16px 0}
  @media print{@page{margin:15mm}}
</style></head><body>
<h1>${comparison.name}</h1>
<p class="meta">${comparison.document1Filename} → ${comparison.document2Filename}&nbsp;&nbsp;·&nbsp;&nbsp;${new Date(comparison.createdAt).toLocaleDateString('ko-KR')}</p>
<div class="stats">
  <span class="badge added">+${comparison.stats.added} Added</span>
  <span class="badge modified">~${comparison.stats.modified} Modified</span>
  <span class="badge removed">-${comparison.stats.removed} Removed</span>
</div>
<hr>
${comparison.diffs.map(d => `
<h2>${d.clauseNumber} &mdash; ${d.title} &nbsp;<span class="badge ${d.changeType}">${d.changeType}</span></h2>
<p class="summary">${d.summary}</p>
${d.before ? `<div class="block before"><div class="label">Before</div><pre>${d.before.replace(/</g,'&lt;')}</pre></div>` : ''}
${d.after  ? `<div class="block after"><div class="label">After</div><pre>${d.after.replace(/</g,'&lt;')}</pre></div>` : ''}
`).join('<hr>')}
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) win.addEventListener('load', () => win.print());
}
