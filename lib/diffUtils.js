import { diffWords } from 'diff';

export function extractClauses(text) {
  if (!text || !text.trim()) return [];

  const lines = text.split('\n');
  const clauses = [];
  // Match numbered clauses: 1, 1.2, 1.2.3 ...
  const clausePattern = /^(\d+(?:\.\d+)*)\s+(.+)/;

  let current = null;
  let content = [];

  for (const line of lines) {
    const match = line.trim().match(clausePattern);
    if (match) {
      if (current) {
        clauses.push({ id: current.id, title: current.title, content: content.join('\n').trim() });
      }
      current = { id: match[1], title: match[2].trim() };
      content = [];
    } else if (current) {
      content.push(line);
    }
  }
  if (current) {
    clauses.push({ id: current.id, title: current.title, content: content.join('\n').trim() });
  }

  // Fallback: paragraph-based segmentation
  if (clauses.length === 0) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    return paragraphs.slice(0, 200).map((p, i) => ({
      id: `p${i + 1}`,
      title: p.trim().split('\n')[0].slice(0, 100) || `단락 ${i + 1}`,
      content: p.trim(),
    }));
  }

  return clauses;
}

export function compareClauses(oldClauses, newClauses) {
  const oldMap = new Map(oldClauses.map(c => [c.id, c]));
  const newMap = new Map(newClauses.map(c => [c.id, c]));
  const results = [];

  for (const [id, nc] of newMap) {
    const oc = oldMap.get(id);
    if (!oc) {
      results.push({ id, title: nc.title, status: 'added', oldContent: '', newContent: nc.content, diff: null });
    } else if (oc.content !== nc.content || oc.title !== nc.title) {
      results.push({
        id,
        title: nc.title,
        oldTitle: oc.title,
        status: 'modified',
        oldContent: oc.content,
        newContent: nc.content,
        diff: diffWords(oc.content || '', nc.content || ''),
      });
    }
  }

  for (const [id, oc] of oldMap) {
    if (!newMap.has(id)) {
      results.push({ id, title: oc.title, status: 'removed', oldContent: oc.content, newContent: '', diff: null });
    }
  }

  results.sort((a, b) => {
    const ap = a.id.replace(/^p/, '').split('.').map(n => parseInt(n, 10) || 0);
    const bp = b.id.replace(/^p/, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
      const d = (ap[i] || 0) - (bp[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  });

  return results;
}
