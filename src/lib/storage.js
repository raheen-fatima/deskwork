export function lsGet(k, fallback) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function lsSet(k, v) {
  localStorage.setItem(k, v);
}

export function lsDel(k) {
  try {
    localStorage.removeItem(k);
  } catch (e) {}
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
