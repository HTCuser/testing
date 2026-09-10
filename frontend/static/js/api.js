const BASE = '';

async function request(method, path, { json, form, query } = {}) {
  let url = BASE + path;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, v);
    });
    const qs = params.toString();
    if (qs) url += '?' + qs;
  }

  const options = { method, headers: {} };
  if (json !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(json);
  } else if (form) {
    options.body = form;
  }

  const res = await fetch(url, options);
  if (res.status === 204) return null;

  const raw = await res.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!res.ok) {
    const detail = data && typeof data === 'object' ? data.detail : data;
    throw new Error(formatDetail(detail) || `Lỗi ${res.status}`);
  }
  return data;
}

function formatDetail(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
  }
  return JSON.stringify(detail);
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, json) => request('POST', path, { json }),
  put: (path, json) => request('PUT', path, { json }),
  del: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),

  stats: () => request('GET', '/api/stats'),
  config: () => request('GET', '/api/config'),
  reindexAll: () => request('POST', '/api/reindex'),

  ask: (payload) => request('POST', '/api/ask', { json: payload }),
  search: (query) => request('GET', '/api/search', { query }),

  documents: (query) => request('GET', '/api/documents', { query }),
  document: (id) => request('GET', `/api/documents/${id}`),
  documentText: (id) => request('GET', `/api/documents/${id}/text`),
  categories: () => request('GET', '/api/documents/categories'),

  equipmentList: (query) => request('GET', '/api/equipment', { query }),
  equipment: (id) => request('GET', `/api/equipment/${id}`),

  procedures: (query) => request('GET', '/api/procedures', { query }),
  procedure: (id) => request('GET', `/api/procedures/${id}`),

  incidents: (query) => request('GET', '/api/incidents', { query }),
  incident: (id) => request('GET', `/api/incidents/${id}`),
  incidentMeta: () => request('GET', '/api/incidents/meta'),

  forms: (query) => request('GET', '/api/forms', { query }),
  form: (id) => request('GET', `/api/forms/${id}`),
};
