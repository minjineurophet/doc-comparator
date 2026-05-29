const STORAGE_KEY = 'doc_comparisons';

const COMPARISON_FIELD_ALIASES = [
  ['document1Filename', 'oldFilename', ''],
  ['document1Format', 'oldFormat', null],
  ['document1Id', 'oldDocumentId', null],
  ['document1Markdown', 'oldMarkdown', ''],
  ['document2Filename', 'newFilename', ''],
  ['document2Format', 'newFormat', null],
  ['document2Id', 'newDocumentId', null],
  ['document2Markdown', 'newMarkdown', ''],
];

function normalizeComparison(comparison) {
  if (!comparison || typeof comparison !== 'object') {
    return { normalized: null, changed: false };
  }

  let changed = false;
  const normalized = { ...comparison };

  for (const [nextKey, legacyKey, fallbackValue] of COMPARISON_FIELD_ALIASES) {
    const nextValue = comparison[nextKey];
    const legacyValue = comparison[legacyKey];
    const resolvedValue = nextValue ?? legacyValue ?? fallbackValue;

    if (normalized[nextKey] !== resolvedValue) {
      normalized[nextKey] = resolvedValue;
      changed = true;
    }

    if (legacyKey in normalized) {
      delete normalized[legacyKey];
      changed = true;
    }
  }

  return { normalized, changed };
}

function persistComparisons(comparisons) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(comparisons));
}

export function listComparisons() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const comparisons = Array.isArray(raw) ? raw : [];
    let changed = !Array.isArray(raw);

    const normalizedList = comparisons.flatMap((comparison) => {
      const { normalized, changed: comparisonChanged } = normalizeComparison(comparison);
      changed ||= comparisonChanged;
      return normalized ? [normalized] : [];
    });

    if (changed) {
      persistComparisons(normalizedList);
    }

    return normalizedList;
  } catch {
    return [];
  }
}

export function getComparison(id) {
  return listComparisons().find(c => c.id === id) ?? null;
}

export function saveComparison(comparison) {
  const list = listComparisons();
  const { normalized } = normalizeComparison(comparison);
  if (!normalized) return;

  const idx = list.findIndex(c => c.id === normalized.id);
  if (idx >= 0) list[idx] = normalized;
  else list.unshift(normalized);
  persistComparisons(list);
}

export function applyClauseEdit(comparison, clauseNumber, side, content, sourceContent = null) {
  if (!comparison || typeof comparison !== 'object') {
    return comparison;
  }

  const normalizedContent = typeof content === 'string' ? content : '';
  const nextEdits = { ...(comparison.edits ?? {}) };
  const clauseEdits = { ...(nextEdits[clauseNumber] ?? {}) };

  if (sourceContent !== null && normalizedContent === sourceContent) {
    delete clauseEdits[side];
  } else {
    clauseEdits[side] = normalizedContent;
  }

  if (Object.keys(clauseEdits).length === 0) {
    delete nextEdits[clauseNumber];
  } else {
    nextEdits[clauseNumber] = clauseEdits;
  }

  if (Object.keys(nextEdits).length === 0) {
    const { edits, ...rest } = comparison;
    return rest;
  }

  return {
    ...comparison,
    edits: nextEdits,
  };
}

export function saveClauseEdit(comparisonId, clauseNumber, side, content) {
  const list = listComparisons();
  const idx = list.findIndex(c => c.id === comparisonId);
  if (idx === -1) return;

  const comparison = list[idx];
  list[idx] = applyClauseEdit(comparison, clauseNumber, side, content);

  persistComparisons(list);
}

export function getClauseEdit(comparison, clauseNumber, side) {
  return comparison?.edits?.[clauseNumber]?.[side] ?? null;
}

export function deleteComparison(id) {
  const list = listComparisons().filter(c => c.id !== id);
  persistComparisons(list);
}
