/**
 * WeMeThere — web app controller.
 *
 * Feature parity with the iOS app: events created without scanning anything,
 * connections grouped under the event where you met, swipe to move or delete,
 * a personal QR code whose scan records the connection for both sides, and a
 * seeded default event. On top of that the web app adds accounts, so the data
 * lives in MongoDB rather than on one device.
 */

import { api, setToken, getToken, ApiError, readExchangeCode } from './js/api.js';
import {
  openSheet,
  closeAllSheets,
  alert as showAlert,
  confirmDestructive,
  toast,
  icon,
  escapeHtml,
  attachRowActions,
  closeOpenRows,
} from './js/ui.js';
import { openScanner } from './js/scanner.js';

const state = {
  user: null,
  events: [],
  feedbackLinkedInUrl: 'https://www.linkedin.com/in/shubhamgupta08/',
  expanded: new Set(),
  loading: false,
};

const dom = {
  auth: document.getElementById('auth-screen'),
  app: document.getElementById('app-screen'),
  authForm: document.getElementById('auth-form'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authSubmit: document.getElementById('auth-submit'),
  authError: document.getElementById('auth-error'),
  authHelp: document.getElementById('auth-help'),
  authSwitchText: document.getElementById('auth-switch-text'),
  authSwitchBtn: document.getElementById('auth-switch-btn'),
  eventList: document.getElementById('event-list'),
  swipeHint: document.getElementById('swipe-hint'),
  navbar: document.getElementById('navbar'),
  refreshBtn: document.getElementById('refresh-btn'),
};

/* ------------------------------ expanded set ------------------------------ */

const EXPANDED_KEY = 'wemethere.expanded';

function loadExpanded() {
  try {
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY) || '[]');
    if (Array.isArray(stored)) state.expanded = new Set(stored);
  } catch {
    /* fine — everything just starts collapsed */
  }
}

function saveExpanded() {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...state.expanded]));
  } catch {
    /* ignore */
  }
}

/* ------------------------------ authentication ---------------------------- */

let authMode = 'login';

function renderAuthMode() {
  const isLogin = authMode === 'login';
  dom.authSubmit.textContent = isLogin ? 'Sign In' : 'Create Account';
  dom.authPassword.autocomplete = isLogin ? 'current-password' : 'new-password';
  dom.authHelp.textContent = isLogin
    ? 'Your connections sync to every device you sign in on.'
    : 'Pick a password of at least 8 characters.';
  dom.authSwitchText.textContent = isLogin ? 'New here?' : 'Already have an account?';
  dom.authSwitchBtn.textContent = isLogin ? 'Create an account' : 'Sign in';
  dom.authError.classList.add('hidden');
}

dom.authSwitchBtn.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  renderAuthMode();
});

dom.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value;

  dom.authError.classList.add('hidden');
  setBusy(dom.authSubmit, true, authMode === 'login' ? 'Sign In' : 'Create Account');

  try {
    const result = authMode === 'login' ? await api.login(email, password) : await api.signup(email, password);
    setToken(result.token);
    state.user = result.user;
    dom.authPassword.value = '';
    await enterApp();
  } catch (err) {
    dom.authError.textContent = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
    dom.authError.classList.remove('hidden');
  } finally {
    setBusy(dom.authSubmit, false, authMode === 'login' ? 'Sign In' : 'Create Account');
  }
});

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.innerHTML = busy ? '<span class="spinner"></span>' : escapeHtml(label);
}

function signOut() {
  setToken(null);
  state.user = null;
  state.events = [];
  closeAllSheets();
  dom.app.classList.add('hidden');
  dom.auth.classList.remove('hidden');
  renderAuthMode();
}

/* -------------------------------- rendering ------------------------------- */

function render() {
  if (state.events.length === 0) {
    dom.eventList.innerHTML = `
      <div class="empty-state">
        ${icon('qr', { size: 52, width: 1.4 })}
        <h2>No events yet</h2>
        <p>Tap + to add the event you are at, then start scanning.</p>
      </div>`;
    dom.swipeHint.classList.add('hidden');
    return;
  }

  dom.eventList.innerHTML = '';
  for (const event of state.events) {
    dom.eventList.appendChild(renderEventCard(event));
  }
  dom.swipeHint.classList.remove('hidden');
}

function renderEventCard(event) {
  const isExpanded = state.expanded.has(event.id);
  const card = document.createElement('section');
  card.className = `event-card${isExpanded ? ' is-expanded' : ''}`;

  const header = document.createElement('div');
  header.className = 'row event-header';
  header.dataset.actionTitle = event.name;
  header.innerHTML = `
    <button class="row-content" type="button">
      <span class="event-title">${escapeHtml(event.name)}</span>
      <span class="event-count">${event.connections.length}</span>
      <span class="chevron">${icon('chevron', { size: 13, width: 2.6 })}</span>
    </button>`;

  header.querySelector('.row-content').addEventListener('click', () => {
    closeOpenRows();
    if (state.expanded.has(event.id)) state.expanded.delete(event.id);
    else state.expanded.add(event.id);
    saveExpanded();
    render();
  });

  attachRowActions(header, [
    {
      label: 'Rename',
      iconName: 'pencil',
      style: 'move',
      onSelect: () => promptRenameEvent(event),
    },
    {
      label: 'Delete',
      iconName: 'trash',
      style: 'delete',
      onSelect: () => promptDeleteEvent(event),
    },
  ]);
  card.appendChild(header);

  if (!isExpanded) return card;

  for (const connection of event.connections) {
    card.appendChild(renderConnectionRow(event, connection));
  }

  const add = document.createElement('div');
  add.className = 'row add-connect';
  add.innerHTML = `
    <button class="row-content" type="button">
      ${icon('scan', { size: 20 })}<span>Add New Connect</span>
    </button>`;
  add.querySelector('.row-content').addEventListener('click', () => startScan(event));
  card.appendChild(add);

  return card;
}

function renderConnectionRow(event, connection) {
  const row = document.createElement('div');
  row.className = 'row connection-row';
  row.dataset.actionTitle = 'Connection';
  row.dataset.actionMessage = connection.linkedInUrl;
  row.innerHTML = `
    <button class="row-content" type="button">
      <span class="connection-link">${escapeHtml(prettyUrl(connection.linkedInUrl))}</span>
      ${connection.source === 'exchange' ? '<span class="badge">Swap</span>' : ''}
    </button>`;

  row.querySelector('.row-content').addEventListener('click', () => {
    window.open(connection.linkedInUrl, '_blank', 'noopener');
  });

  attachRowActions(row, [
    {
      label: 'Move',
      iconName: 'folder',
      style: 'move',
      onSelect: () => openMoveSheet(event, connection),
    },
    {
      label: 'Delete',
      iconName: 'trash',
      style: 'delete',
      onSelect: () => promptDeleteConnection(connection),
    },
  ]);

  return row;
}

/** Trims a LinkedIn URL down to the part worth reading in a list row. */
function prettyUrl(url) {
  return String(url)
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

/* ------------------------------ data plumbing ----------------------------- */

async function refresh({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  dom.refreshBtn.classList.add('is-spinning');
  try {
    const data = await api.state();
    state.user = data.user;
    state.events = data.events;
    state.feedbackLinkedInUrl = data.feedbackLinkedInUrl || state.feedbackLinkedInUrl;
    render();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      signOut();
      return;
    }
    if (!silent) toast(err.message);
  } finally {
    state.loading = false;
    dom.refreshBtn.classList.remove('is-spinning');
  }
}

async function enterApp() {
  dom.auth.classList.add('hidden');
  dom.app.classList.remove('hidden');
  await refresh();
}

/* --------------------------------- events -------------------------------- */

function openAddEventSheet() {
  const sheet = openSheet({
    title: 'New Event',
    leading: { label: 'Cancel' },
    trailing: { label: 'Confirm', onClick: submit },
    body: `
      <label class="form-label" for="new-event-name">Enter event name</label>
      <div class="field-group">
        <input class="field" id="new-event-name" type="text" placeholder="Event name" autocomplete="off" maxlength="120">
      </div>
      <p class="help-text">No QR code needed — add the event now and scan people as you meet them.</p>
      <p class="form-error hidden" data-error></p>`,
  });

  const input = sheet.el.querySelector('#new-event-name');
  const error = sheet.el.querySelector('[data-error]');
  setTimeout(() => input.focus(), 350);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit(sheet);
  });

  async function submit(handle) {
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Please enter event name.';
      error.classList.remove('hidden');
      return;
    }
    try {
      const { event } = await api.createEvent(name);
      handle.close();
      state.expanded.add(event.id);
      saveExpanded();
      await refresh();
      toast(`"${name}" added.`);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}

function promptRenameEvent(event) {
  const sheet = openSheet({
    title: 'Rename Event',
    leading: { label: 'Cancel' },
    trailing: { label: 'Save', onClick: submit },
    body: `
      <label class="form-label" for="rename-event">Event name</label>
      <div class="field-group">
        <input class="field" id="rename-event" type="text" maxlength="120" value="${escapeHtml(event.name)}">
      </div>
      <p class="form-error hidden" data-error></p>`,
  });

  const input = sheet.el.querySelector('#rename-event');
  const error = sheet.el.querySelector('[data-error]');
  setTimeout(() => input.select(), 350);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit(sheet);
  });

  async function submit(handle) {
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Please enter event name.';
      error.classList.remove('hidden');
      return;
    }
    if (name === event.name) {
      handle.close();
      return;
    }
    try {
      await api.renameEvent(event.id, name);
      handle.close();
      await refresh();
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}

async function promptDeleteEvent(event) {
  const confirmed = await confirmDestructive({
    title: 'Delete this event?',
    message: `This will also delete all connections under "${event.name}".`,
  });
  if (!confirmed) return;
  try {
    await api.deleteEvent(event.id);
    state.expanded.delete(event.id);
    saveExpanded();
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

/* ------------------------------- connections ------------------------------ */

async function promptDeleteConnection(connection) {
  const confirmed = await confirmDestructive({
    title: 'Delete this connection?',
    message: connection.linkedInUrl,
  });
  if (!confirmed) return;
  try {
    await api.deleteConnection(connection.id);
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

function openMoveSheet(currentEvent, connection) {
  const options = [...state.events].sort((a, b) => a.name.localeCompare(b.name));
  const sheet = openSheet({
    title: 'Move Connection',
    leading: { label: 'Cancel' },
    body: `
      <p class="help-text" style="margin-top:0">${escapeHtml(prettyUrl(connection.linkedInUrl))}</p>
      <div class="option-list">
        ${options
          .map(
            (event) => `
          <button class="option" data-event-id="${event.id}" ${event.id === currentEvent.id ? 'disabled' : ''}>
            <span class="option-name">${escapeHtml(event.name)}</span>
            ${event.id === currentEvent.id ? icon('check', { size: 18, width: 2.4 }) : ''}
          </button>`
          )
          .join('')}
      </div>`,
  });

  sheet.el.querySelectorAll('.option[data-event-id]').forEach((button) => {
    if (button.disabled) return;
    button.addEventListener('click', async () => {
      sheet.close();
      try {
        await api.moveConnection(connection.id, button.dataset.eventId);
        await refresh();
        toast('Connection moved.');
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

/* --------------------------------- scanning ------------------------------- */

/**
 * Starts a scan for a given event. The event is also recorded server-side as
 * this account's "current event", so that if the *other* person scans instead,
 * their exchange lands in the same event on this side.
 */
function startScan(event) {
  closeOpenRows();
  api.setCurrentEvent(event.name).catch(() => {
    /* best effort — the scan this device performs carries its own event */
  });

  openScanner({
    eventName: event.name,
    onDecode: (decodedText) => handleScan(event, decodedText),
  });
}

async function handleScan(event, decodedText) {
  const code = readExchangeCode(decodedText);

  // A WeMeThere code: exchange straight away, no confirmation step — the
  // whole point is that one scan settles both sides.
  if (code) {
    try {
      const result = await api.exchange(code, event.id);
      await refresh();
      await showAlert({
        title: 'Connected',
        message: result.alreadyConnected
          ? `You were already connected to ${prettyUrl(result.linkedInUrl)} in "${result.eventName}".`
          : result.reciprocated
            ? `${prettyUrl(result.linkedInUrl)} was added to "${result.eventName}", and your LinkedIn was saved to their list too.`
            : `${prettyUrl(result.linkedInUrl)} was added to "${result.eventName}". We could not add yours on their side — ask them to scan your code too.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.payload.code === 'PROFILE_INCOMPLETE') {
        const openSetup = await showAlert({
          title: 'Set up your QR code',
          message: 'Add your own LinkedIn URL first, so the other person gets yours back.',
          actions: [
            { label: 'Not now', value: false },
            { label: 'Set it up', style: 'bold', value: true },
          ],
        });
        if (openSetup) openMyQrSheet();
        return;
      }
      await showAlert({ title: 'Exchange failed', message: err.message });
    }
    return;
  }

  // Anything else is treated as a plain LinkedIn QR code and confirmed first,
  // since a stray code could be anything.
  openConfirmSheet(event, decodedText);
}

function openConfirmSheet(event, linkedInUrl) {
  const sheet = openSheet({
    title: 'Confirm User',
    leading: { label: 'Cancel' },
    trailing: { label: 'Confirm', onClick: submit },
    body: `
      <label class="form-label">LinkedIn URL</label>
      <div class="field-group">
        <input class="field" type="url" value="${escapeHtml(linkedInUrl)}" data-url
               autocapitalize="none" autocorrect="off" spellcheck="false">
      </div>
      <p class="help-text">Adding to "${escapeHtml(event.name)}". Edit the link if it scanned wrong.</p>
      <p class="form-error hidden" data-error></p>`,
  });

  const input = sheet.el.querySelector('[data-url]');
  const error = sheet.el.querySelector('[data-error]');

  async function submit(handle) {
    const value = input.value.trim();
    if (!value) {
      error.textContent = 'Please enter a LinkedIn URL.';
      error.classList.remove('hidden');
      return;
    }
    try {
      await api.addConnection(event.id, value);
      handle.close();
      state.expanded.add(event.id);
      saveExpanded();
      await refresh();
      toast(`Added to "${event.name}".`);
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    }
  }
}

/* -------------------------------- my qr code ------------------------------ */

const QR_CACHE_KEY = 'wemethere.qr';

function cacheQr(payload, svg) {
  try {
    localStorage.setItem(QR_CACHE_KEY, JSON.stringify({ payload, svg }));
  } catch {
    /* ignore */
  }
}

function cachedQr() {
  try {
    return JSON.parse(localStorage.getItem(QR_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

/**
 * Shows the personal QR code, or the form to set the LinkedIn URL behind it.
 * The code itself never changes when the URL is edited, so a code already
 * shared or printed keeps resolving to the current profile.
 */
function openMyQrSheet({ startEditing = false } = {}) {
  const sheet = openSheet({
    title: 'My QR Code',
    leading: { label: 'Close' },
    body: '<div data-qr-root></div>',
  });

  const root = sheet.el.querySelector('[data-qr-root]');
  let editing = startEditing || !state.user?.linkedInUrl;

  async function paint() {
    if (editing) {
      root.innerHTML = `
        <label class="form-label" for="qr-url">Your LinkedIn URL</label>
        <div class="field-group">
          <input class="field" id="qr-url" type="url" inputmode="url" placeholder="https://www.linkedin.com/in/..."
                 autocapitalize="none" autocorrect="off" spellcheck="false"
                 value="${escapeHtml(state.user?.linkedInUrl || '')}">
        </div>
        <p class="help-text">This is what other people receive when they scan your code. Editing it later keeps the same QR code working.</p>
        <p class="form-error hidden" data-error></p>
        <div class="btn-stack">
          <button class="btn" data-save>Save</button>
          ${state.user?.linkedInUrl ? '<button class="btn is-plain" data-cancel-edit>Cancel</button>' : ''}
        </div>`;

      const input = root.querySelector('#qr-url');
      const error = root.querySelector('[data-error]');
      const save = root.querySelector('[data-save]');
      setTimeout(() => input.focus(), 350);

      const submit = async () => {
        const value = input.value.trim();
        if (!value) {
          error.textContent = 'Please enter your LinkedIn URL.';
          error.classList.remove('hidden');
          return;
        }
        setBusy(save, true, 'Save');
        try {
          const result = await api.saveProfile(value);
          state.user = result.user;
          editing = false;
          await paint();
          toast('Your QR code is ready.');
        } catch (err) {
          error.textContent = err.message;
          error.classList.remove('hidden');
        } finally {
          setBusy(save, false, 'Save');
        }
      };

      save.addEventListener('click', submit);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
      });
      root.querySelector('[data-cancel-edit]')?.addEventListener('click', async () => {
        editing = false;
        await paint();
      });
      return;
    }

    const cached = cachedQr();
    root.innerHTML = `
      <div class="qr-stage">
        <div class="qr-frame" data-qr-frame>${cached?.svg || ''}</div>
        <p class="qr-url">${escapeHtml(prettyUrl(state.user.linkedInUrl))}</p>
        <p class="qr-caption">Anyone who scans this in WeMeThere swaps LinkedIn URLs with you automatically. Scanned with any other app, it just opens your profile.</p>
      </div>
      <div class="btn-stack" style="margin-top:18px">
        <button class="btn is-secondary" data-share>Share link</button>
        <button class="btn is-plain" data-edit>Edit LinkedIn URL</button>
      </div>`;

    const frame = root.querySelector('[data-qr-frame]');
    let payload = cached?.payload || null;

    try {
      const result = await api.qr();
      payload = result.payload;
      frame.innerHTML = result.svg;
      cacheQr(result.payload, result.svg);
    } catch (err) {
      if (!cached) {
        frame.innerHTML = `<p style="font-size:13px;color:#666;padding:20px">${escapeHtml(err.message)}</p>`;
      }
    }

    root.querySelector('[data-edit]').addEventListener('click', async () => {
      editing = true;
      await paint();
    });

    root.querySelector('[data-share]').addEventListener('click', async () => {
      if (!payload) return;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'My WeMeThere code', url: payload });
        } else {
          await navigator.clipboard.writeText(payload);
          toast('Link copied.');
        }
      } catch {
        /* the person cancelled the share sheet */
      }
    });
  }

  paint();
}

/* --------------------------------- account -------------------------------- */

function openAccountSheet() {
  const sheet = openSheet({
    title: 'Account',
    leading: { label: 'Close' },
    body: `
      <label class="form-label">Signed in as</label>
      <div class="field-group">
        <div class="field" style="color:var(--label-secondary)">${escapeHtml(state.user?.email || '')}</div>
      </div>
      <label class="form-label">Change password</label>
      <div class="field-group">
        <input class="field" type="password" placeholder="Current password" autocomplete="current-password" data-current>
        <input class="field" type="password" placeholder="New password" autocomplete="new-password" data-new>
      </div>
      <p class="form-error hidden" data-error></p>
      <div class="btn-stack">
        <button class="btn is-secondary" data-change>Update Password</button>
        <button class="btn is-destructive" data-signout>Sign Out</button>
      </div>`,
  });

  const error = sheet.el.querySelector('[data-error]');
  const change = sheet.el.querySelector('[data-change]');

  change.addEventListener('click', async () => {
    const current = sheet.el.querySelector('[data-current]').value;
    const next = sheet.el.querySelector('[data-new]').value;
    if (!current || !next) {
      error.textContent = 'Fill in both password fields.';
      error.classList.remove('hidden');
      return;
    }
    setBusy(change, true, 'Update Password');
    try {
      await api.changePassword(current, next);
      sheet.close();
      toast('Password updated.');
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
    } finally {
      setBusy(change, false, 'Update Password');
    }
  });

  sheet.el.querySelector('[data-signout]').addEventListener('click', async () => {
    const confirmed = await confirmDestructive({
      title: 'Sign out?',
      message: 'Your connections stay saved to your account.',
      confirmLabel: 'Sign Out',
    });
    if (confirmed) {
      sheet.close();
      signOut();
    }
  });
}

function openInfoSheet() {
  openSheet({
    title: 'About WeMeThere',
    leading: { label: 'Close' },
    body: `
      <p class="help-text" style="margin-top:0;font-size:15px">
        Add the event you are at, then scan the people you meet. If they use WeMeThere too, one scan saves
        the connection for both of you — they do not need to scan you back.
      </p>
      <label class="form-label">For feedback, contact</label>
      <div class="option-list">
        <a class="option" href="${escapeHtml(state.feedbackLinkedInUrl)}" target="_blank" rel="noopener">
          <span class="option-name">${escapeHtml(prettyUrl(state.feedbackLinkedInUrl))}</span>
          ${icon('chevron', { size: 14, width: 2.4 })}
        </a>
      </div>`,
  });
}

/* ------------------------------- wiring & boot ----------------------------- */

document.getElementById('add-event-btn').addEventListener('click', openAddEventSheet);
document.getElementById('my-qr-btn').addEventListener('click', () => openMyQrSheet());
document.getElementById('account-btn').addEventListener('click', openAccountSheet);
document.getElementById('info-btn').addEventListener('click', openInfoSheet);
dom.refreshBtn.addEventListener('click', () => refresh());

// Coming back to the app is the moment an exchange somebody else initiated is
// most likely to be waiting, so re-read the list.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user) refresh({ silent: true });
});

window.addEventListener(
  'scroll',
  () => {
    dom.navbar.classList.toggle('is-scrolled', window.scrollY > 10);
  },
  { passive: true }
);

async function boot() {
  loadExpanded();
  renderAuthMode();

  if (!getToken()) {
    dom.auth.classList.remove('hidden');
    return;
  }

  try {
    const { user } = await api.me();
    state.user = user;
    await enterApp();
  } catch {
    setToken(null);
    dom.auth.classList.remove('hidden');
  }
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}
