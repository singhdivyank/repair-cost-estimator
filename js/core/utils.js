export function makeId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

export function formatCurrency(n) {
  const value = Number.isFinite(n) ? n : 0;
  return '$' + Math.round(value).toLocaleString('en-US');
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function nowIso() {
  return new Date().toISOString();
}
