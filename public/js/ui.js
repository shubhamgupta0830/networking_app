/**
 * UI primitives shaped after their UIKit counterparts: sheets that slide up
 * from the bottom, centred alerts, a transient toast, and swipe-to-reveal row
 * actions.
 */

const scrim = document.getElementById('scrim');
const sheetHost = document.getElementById('sheet-host');
const alertHost = document.getElementById('alert-host');
const toastEl = document.getElementById('toast');

const ICONS = {
  trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.9 12.4A1.8 1.8 0 0 0 9.2 21h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z"/>',
  pencil: '<path d="M16.5 4.5l3 3L9 18l-4 1 1-4z"/>',
  scan:
    '<path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"/><path d="M7.5 12h9"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  chevron: '<path d="M8.5 4.5l7 7.5-7 7.5"/>',
  qr:
    '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4"/>',
};

/** Builds an inline SVG glyph. */
export function icon(name, { size = 20, width = 1.9 } = {}) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Escapes text for interpolation into markup. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

/* --------------------------------- toast --------------------------------- */

let toastTimer;

export function toast(message, { duration = 2600 } = {}) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('is-open');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), duration);
}

/* --------------------------------- sheets -------------------------------- */

const sheetStack = [];

function syncScrim() {
  if (sheetStack.length > 0) {
    scrim.classList.remove('hidden');
    requestAnimationFrame(() => scrim.classList.add('is-open'));
    document.body.style.overflow = 'hidden';
  } else {
    scrim.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => {
      if (sheetStack.length === 0) scrim.classList.add('hidden');
    }, 300);
  }
}

/**
 * Presents a modal sheet. `body` is markup; the returned handle exposes the
 * sheet element so the caller can wire up its own controls, and `close()`.
 */
export function openSheet({
  title = '',
  body = '',
  leading = null,
  trailing = null,
  fullscreen = false,
  onClose = null,
  dismissible = true,
} = {}) {
  const el = document.createElement('div');
  el.className = `sheet${fullscreen ? ' is-fullscreen' : ''}`;

  const bar = fullscreen
    ? ''
    : `<div class="sheet-bar">
         <button class="nav-btn is-text" data-sheet-leading ${leading ? '' : 'style="visibility:hidden"'}>${escapeHtml(leading?.label ?? '')}</button>
         <span class="sheet-title">${escapeHtml(title)}</span>
         <button class="nav-btn is-text is-bold" data-sheet-trailing ${trailing ? '' : 'style="visibility:hidden"'}>${escapeHtml(trailing?.label ?? '')}</button>
       </div>`;

  el.innerHTML = `${bar}<div class="sheet-body">${body}</div>`;
  sheetHost.appendChild(el);

  const handle = {
    el,
    body: el.querySelector('.sheet-body'),
    close() {
      const index = sheetStack.indexOf(handle);
      if (index === -1) return;
      sheetStack.splice(index, 1);
      el.classList.remove('is-open');
      syncScrim();
      setTimeout(() => el.remove(), 360);
      if (onClose) onClose();
    },
  };

  el.querySelector('[data-sheet-leading]')?.addEventListener('click', () => {
    if (leading?.onClick) leading.onClick(handle);
    else handle.close();
  });
  el.querySelector('[data-sheet-trailing]')?.addEventListener('click', () => {
    trailing?.onClick?.(handle);
  });

  handle.dismissible = dismissible;
  sheetStack.push(handle);
  syncScrim();
  requestAnimationFrame(() => el.classList.add('is-open'));
  return handle;
}

export function closeAllSheets() {
  [...sheetStack].reverse().forEach((sheet) => sheet.close());
}

scrim.addEventListener('click', () => {
  const top = sheetStack[sheetStack.length - 1];
  if (top?.dismissible) top.close();
});

/* --------------------------------- alerts -------------------------------- */

/**
 * A centred alert. `actions` are `{ label, style, value }`; resolves with the
 * chosen action's `value`, or null if dismissed by the scrim.
 */
export function alert({ title = '', message = '', actions = [{ label: 'OK', value: true }] } = {}) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'alert-scrim';
    const stacked = actions.length > 2;

    host.innerHTML = `
      <div class="alert" role="alertdialog" aria-modal="true">
        <div class="alert-body">
          ${title ? `<p class="alert-title">${escapeHtml(title)}</p>` : ''}
          ${message ? `<p class="alert-message">${escapeHtml(message)}</p>` : ''}
        </div>
        <div class="alert-actions${stacked ? ' is-stacked' : ''}">
          ${actions
            .map(
              (action, index) =>
                `<button class="alert-btn${action.style === 'destructive' ? ' is-destructive' : ''}${
                  action.style === 'bold' ? ' is-bold' : ''
                }" data-index="${index}">${escapeHtml(action.label)}</button>`
            )
            .join('')}
        </div>
      </div>`;

    alertHost.appendChild(host);
    requestAnimationFrame(() => host.classList.add('is-open'));

    const finish = (value) => {
      host.classList.remove('is-open');
      setTimeout(() => host.remove(), 220);
      resolve(value);
    };

    host.querySelectorAll('.alert-btn').forEach((button) => {
      button.addEventListener('click', () => finish(actions[Number(button.dataset.index)].value ?? null));
    });
    host.addEventListener('click', (event) => {
      if (event.target === host) finish(null);
    });
  });
}

/** Yes/no alert with the affirmative styled as destructive. */
export function confirmDestructive({ title, message, confirmLabel = 'Delete' }) {
  return alert({
    title,
    message,
    actions: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, style: 'destructive', value: true },
    ],
  }).then(Boolean);
}

/* ---------------------------- swipe row actions --------------------------- */

const openRows = new Set();

export function closeOpenRows() {
  openRows.forEach((close) => close());
  openRows.clear();
}

/**
 * Adds swipe-to-reveal actions to a row. Works with touch and with a mouse
 * drag; a right-click or long press opens the same actions as an alert, which
 * keeps them reachable without a gesture.
 *
 * @param {HTMLElement} row      the `.row` wrapper
 * @param {Array} actions        `{ label, iconName, style, onSelect }`
 */
export function attachRowActions(row, actions) {
  if (!actions.length) return;

  const content = row.querySelector('.row-content');
  const tray = document.createElement('div');
  tray.className = 'row-actions';
  tray.innerHTML = actions
    .map(
      (action, index) =>
        `<button class="row-action is-${action.style || 'delete'}" data-index="${index}">
           ${icon(action.iconName, { size: 19 })}<span>${escapeHtml(action.label)}</span>
         </button>`
    )
    .join('');
  row.insertBefore(tray, content);

  tray.querySelectorAll('.row-action').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      close();
      actions[Number(button.dataset.index)].onSelect();
    });
  });

  const trayWidth = () => tray.offsetWidth || actions.length * 78;
  let startX = 0;
  let startY = 0;
  let offset = 0;
  let dragging = false;
  let decided = false;
  let pointerId = null;

  function setOffset(value) {
    offset = value;
    content.style.transform = value ? `translateX(${-value}px)` : '';
  }

  function close() {
    content.classList.remove('is-dragging');
    setOffset(0);
    openRows.delete(close);
  }

  function open() {
    content.classList.remove('is-dragging');
    setOffset(trayWidth());
    openRows.add(close);
  }

  content.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    decided = false;
  });

  content.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!decided) {
      // Let the page scroll unless the gesture is clearly horizontal.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        dragging = false;
        return;
      }
      if (Math.abs(dx) < 8) return;
      decided = true;
      content.classList.add('is-dragging');
      try {
        content.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      // Opening one row closes any other, as in a UIKit table view.
      openRows.forEach((other) => other !== close && other());
    }

    const base = openRows.has(close) ? trayWidth() : 0;
    // Rubber-bands past the tray width instead of tracking one-to-one.
    let next = base - dx;
    if (next < 0) next /= 4;
    if (next > trayWidth()) next = trayWidth() + (next - trayWidth()) / 4;
    setOffset(Math.max(0, next));
    event.preventDefault();
  });

  function release(event) {
    if (!dragging || (event && event.pointerId !== pointerId)) return;
    dragging = false;
    if (!decided) return;
    if (offset > trayWidth() / 2) open();
    else close();
  }

  content.addEventListener('pointerup', release);
  content.addEventListener('pointercancel', release);

  // Suppress the tap that ends a swipe, so revealing actions never also
  // activates the row. This lives on the parent in capture phase: a listener on
  // `content` itself would run *after* the row's own click handler, which is
  // registered first. Clicks on the action buttons are left alone.
  row.addEventListener(
    'click',
    (event) => {
      if (!event.target.closest('.row-content')) return;

      // A drag with a mouse still emits a click on release. That click is the
      // tail of the gesture, not a tap, so swallow it and leave the actions
      // showing. (A touch swipe past the slop threshold emits no click at all,
      // in which case this simply never runs.)
      if (decided) {
        decided = false;
        event.stopPropagation();
        event.preventDefault();
        return;
      }

      // A real tap while the actions are showing closes them instead of
      // activating the row, as a UIKit table view does.
      if (offset > 0) {
        event.stopPropagation();
        event.preventDefault();
        close();
      }
    },
    true
  );

  content.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    close();
    const chosen = await alert({
      title: row.dataset.actionTitle || 'Actions',
      message: row.dataset.actionMessage || '',
      actions: [
        ...actions.map((action, index) => ({
          label: action.label,
          style: action.style === 'delete' ? 'destructive' : undefined,
          value: index,
        })),
        { label: 'Cancel', value: null },
      ],
    });
    if (chosen !== null) actions[chosen].onSelect();
  });
}

document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.row')) closeOpenRows();
});
