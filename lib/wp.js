// Shared HTTP clients for WP REST.
// - `core`  → authenticated with Application Password (Basic auth). Hits /wp/v2/* and /wp/v2/<custom>.
// - `mcp`   → authenticated with shared secret. Hits /wp-backend-mcp/v1/* (companion MU-plugin).

import axios from 'axios';

const baseURL = () => (process.env.WP_URL || '').replace(/\/$/, '');

function basicAuthHeader() {
  const user = process.env.WP_USER || '';
  const pass = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

export const core = axios.create({
  // baseURL set per-call to support core+custom namespaces
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true, // we'll format errors uniformly
});

export const mcp = axios.create({
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true,
});

// Generic core REST helper. `path` is e.g. '/wp/v2/posts' or '/wp/v2/pages/123'.
export async function coreRequest(method, path, { params, data, headers, responseType } = {}) {
  const url = `${baseURL()}/wp-json${path}`;
  const res = await core.request({
    method,
    url,
    params,
    data,
    responseType,
    headers: {
      Authorization: basicAuthHeader(),
      ...(headers || {}),
    },
  });
  return formatResponse(res);
}

// MU-plugin route helper. `path` is e.g. '/wp-backend-mcp/v1/plugins/install'.
export async function mcpRequest(method, path, { params, data } = {}) {
  const url = `${baseURL()}/wp-json${path}`;
  const res = await mcp.request({
    method,
    url,
    params,
    data,
    headers: {
      'X-WP-MCP-Key': process.env.WP_BACKEND_MCP_KEY || '',
    },
  });
  return formatResponse(res);
}

function formatResponse(res) {
  if (res.status >= 200 && res.status < 300) {
    return { ok: true, status: res.status, data: res.data };
  }
  return {
    ok: false,
    status: res.status,
    error: typeof res.data === 'object' ? res.data : { message: String(res.data) },
  };
}

export function asToolResult(payload) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  };
}
