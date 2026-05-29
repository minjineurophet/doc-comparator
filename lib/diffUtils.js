/**
 * Extract numbered clauses from plain text or Docling-generated Markdown.
 * Handles patterns like: "4.1  Title", "4.1.2 Title", "## 4.1 Title", "### 4.1.2 Title"
 */
export function extractClauses(text) {
  const lines = text.split('\n');
  const clauses = [];
  let current = null;

  // Detect whether input is Markdown (Docling output) or plain text
  const hasMarkdownHeadings = lines.some(l => /^#{1,6}\s+\d/.test(l));

  // Markdown heading with clause number: ## 4.1 Title  or  # 4 Title
  const mdHeadingRegex = /^#{1,6}\s+(\d+(?:\.\d+){0,4})\s+(.*)/;
  // Plain-text clause number: 4.1  Title
  const plainClauseRegex = /^(\d+(?:\.\d+){0,4})\s{1,8}([^\n]{2,})/;

  const activeRegex = hasMarkdownHeadings ? mdHeadingRegex : plainClauseRegex;

  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;

    const match = raw.match(activeRegex);
    if (match) {
      if (current) clauses.push(current);
      current = {
        number: match[1],
        title: match[2].trim().slice(0, 120),
        content: raw,
      };
    } else if (current) {
      // Skip standalone markdown decorators
      if (/^[-*_]{3,}$/.test(raw)) continue;
      current.content += '\n' + raw;
    }
  }
  if (current) clauses.push(current);

  // Fallback: paragraph-based splitting if no numbered clauses found
  if (clauses.length < 3) {
    return text
      .split(/\n{2,}/)
      .filter(c => c.trim().length > 30)
      .map((chunk, i) => ({
        number: `P${i + 1}`,
        title: chunk.trim().split('\n')[0].slice(0, 100),
        content: chunk.trim(),
      }));
  }

  return clauses;
}

/**
 * Compare two clause arrays and return structured diffs.
 */
export function compareClauses(oldClauses, newClauses) {
  const oldMap = new Map(oldClauses.map(c => [c.number, c]));
  const newMap = new Map(newClauses.map(c => [c.number, c]));
  const allNumbers = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort(sortClauseNumbers);

  const diffs = [];
  for (const num of allNumbers) {
    const old = oldMap.get(num);
    const nw = newMap.get(num);

    if (!old) {
      diffs.push({
        clauseNumber: num,
        title: nw.title,
        changeType: 'added',
        before: '',
        after: nw.content,
        summary: `Clause ${num} is newly added.`,
      });
    } else if (!nw) {
      diffs.push({
        clauseNumber: num,
        title: old.title,
        changeType: 'removed',
        before: old.content,
        after: '',
        summary: `Clause ${num} has been removed.`,
      });
    } else if (old.content.trim() !== nw.content.trim()) {
      diffs.push({
        clauseNumber: num,
        title: nw.title,
        changeType: 'modified',
        before: old.content,
        after: nw.content,
        summary: `Clause ${num} has been modified.`,
      });
    }
  }

  return diffs;
}

function sortClauseNumbers(a, b) {
  if (a.startsWith('P') || b.startsWith('P')) return a.localeCompare(b);
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const d = (ap[i] ?? 0) - (bp[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
