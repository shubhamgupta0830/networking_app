/** Thin wrapper over the JSON API, carrying the bearer token. */

const TOKEN_KEY = 'wemethere.token';

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {
  // Private browsing can refuse storage entirely; the session then lasts
  // only as long as the page.
}

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload || {};
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0);
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    throw new ApiError(payload.error || 'Something went wrong. Please try again.', response.status, payload);
  }
  return payload;
}

export const api = {
  signup: (email, password) => request('POST', '/auth/signup', { email, password }),
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('POST', '/auth/change-password', { currentPassword, newPassword }),

  state: () => request('GET', '/state'),

  createEvent: (name) => request('POST', '/events', { name }),
  renameEvent: (id, name) => request('PATCH', `/events/${id}`, { name }),
  deleteEvent: (id) => request('DELETE', `/events/${id}`),
  setCurrentEvent: (name) => request('PUT', '/events/current', { name }),

  addConnection: (eventId, linkedInUrl) =>
    request('POST', `/events/${eventId}/connections`, { linkedInUrl }),
  moveConnection: (id, eventId) => request('PATCH', `/connections/${id}`, { eventId }),
  deleteConnection: (id) => request('DELETE', `/connections/${id}`),

  saveProfile: (linkedInUrl) => request('PUT', '/profile', { linkedInUrl }),
  qr: () => request('GET', '/profile/qr'),

  exchange: (publicCode, eventId) => request('POST', '/exchange', { publicCode, eventId }),
};

/** Mirrors the server's exchange-code parameter so the client can pre-detect. */
export const EXCHANGE_PARAM = 'wemethere';

export function readExchangeCode(decodedText) {
  try {
    return new URL(String(decodedText).trim()).searchParams.get(EXCHANGE_PARAM);
  } catch {
    return null;
  }
}
