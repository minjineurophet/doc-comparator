const INDEX_KEY = 'doc-comparator-index';
const PREFIX = 'doc-comparator-item-';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); } catch { return []; }
}

export function saveComparison(data) {
  const id = genId();
  const meta = {
    id,
    name: data.name,
    oldFileName: data.oldFileName,
    newFileName: data.newFileName,
    stats: data.stats,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(PREFIX + id, JSON.stringify({ ...meta, diffs: data.diffs }));
  const index = readIndex();
  index.unshift(meta);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  return id;
}

export function getComparisons() {
  return readIndex();
}

export function getComparison(id) {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function deleteComparison(id) {
  localStorage.removeItem(PREFIX + id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter(c => c.id !== id)));
}
