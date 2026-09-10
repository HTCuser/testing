const routes = [];
let onNavigate = () => {};

export function register(pattern, handler) {
  const segments = pattern.split('/').filter(Boolean);
  routes.push({ pattern, segments, handler });
}

export function setNavigationHook(fn) { onNavigate = fn; }

export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, queryString] = raw.split('?');
  return {
    path: path || '/',
    segments: path.split('/').filter(Boolean),
    query: Object.fromEntries(new URLSearchParams(queryString || '')),
  };
}

export function match(location) {
  for (const route of routes) {
    if (route.segments.length !== location.segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i += 1) {
      const spec = route.segments[i];
      const value = location.segments[i];
      if (spec.startsWith(':')) params[spec.slice(1)] = decodeURIComponent(value);
      else if (spec !== value) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export function navigate(path, query) {
  let target = path.startsWith('#') ? path.slice(1) : path;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, v);
    });
    const qs = params.toString();
    if (qs) target += `?${qs}`;
  }
  if (window.location.hash === `#${target}`) resolve();
  else window.location.hash = target;
}

export function resolve() {
  const location = parseHash();
  const found = match(location);
  onNavigate(location, found);
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
