/**
 * Full-screen QR scanner. Wraps html5-qrcode, which works in iOS Safari where
 * the native BarcodeDetector API is unavailable.
 *
 * Camera access needs a secure context, so over plain HTTP (other than
 * localhost) there is nothing to fall back to but typing the link by hand —
 * which the sheet also offers whenever the camera cannot start.
 */

import { openSheet, escapeHtml, toast } from './ui.js';

const READER_ID = 'qr-reader';

function scannerMarkup(subtitle) {
  return `
    <div class="scanner-shell">
      <div class="scanner-bar">
        <button class="nav-btn is-text" data-scan-cancel>Stop Scan</button>
        <span class="scanner-bar-title">Scan QR Code</span>
        <button class="nav-btn is-text" data-scan-manual>Type it</button>
      </div>
      <div id="${READER_ID}"></div>
      <div class="scanner-reticle" data-scan-reticle></div>
      <p class="scanner-hint" data-scan-hint>${escapeHtml(subtitle)}</p>
      <div class="scanner-fallback hidden" data-scan-fallback>
        <p data-scan-fallback-text>Enter the LinkedIn URL from the code.</p>
        <input class="field" type="url" inputmode="url" placeholder="https://www.linkedin.com/in/..."
               autocapitalize="none" autocorrect="off" spellcheck="false" data-scan-input>
        <button class="btn" data-scan-submit>Use this link</button>
      </div>
    </div>`;
}

/**
 * Opens the scanner. `onDecode(text)` is called once, with the scanner already
 * stopped and the sheet closed, so the caller is free to present the next step.
 */
export function openScanner({ eventName, onDecode }) {
  const subtitle = eventName
    ? `Point the camera at a QR code to add to "${eventName}"`
    : 'Point the camera at a LinkedIn or WeMeThere QR code';

  let instance = null;
  let stopped = false;
  let handled = false;

  const sheet = openSheet({
    fullscreen: true,
    dismissible: false,
    body: scannerMarkup(subtitle),
    onClose: () => stop(),
  });

  const el = (selector) => sheet.el.querySelector(selector);
  const fallback = el('[data-scan-fallback]');

  async function stop() {
    stopped = true;
    if (!instance) return;
    const current = instance;
    instance = null;
    try {
      await current.stop();
      current.clear();
    } catch {
      /* already stopped, or never started */
    }
  }

  function finish(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || handled) return;
    handled = true;
    stop().finally(() => {
      sheet.close();
      onDecode(trimmed);
    });
  }

  function showFallback(message) {
    el('[data-scan-reticle]').classList.add('hidden');
    el('[data-scan-hint]').classList.add('hidden');
    fallback.classList.remove('hidden');
    if (message) el('[data-scan-fallback-text]').textContent = message;
    el('[data-scan-input]').focus();
  }

  el('[data-scan-cancel]').addEventListener('click', () => sheet.close());
  el('[data-scan-manual]').addEventListener('click', () => showFallback());
  el('[data-scan-submit]').addEventListener('click', () => {
    const value = el('[data-scan-input]').value.trim();
    if (!value) {
      toast('Enter a link first.');
      return;
    }
    finish(value);
  });
  el('[data-scan-input]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') el('[data-scan-submit]').click();
  });

  (async () => {
    if (!window.Html5Qrcode) {
      showFallback('The scanner could not load. Enter the LinkedIn URL instead.');
      return;
    }
    if (!window.isSecureContext) {
      showFallback('The camera needs a secure (https) connection. Enter the LinkedIn URL instead.');
      return;
    }

    try {
      instance = new window.Html5Qrcode(READER_ID, { verbose: false });
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => finish(decodedText),
        () => {
          /* per-frame "no code found" — expected, and far too noisy to log */
        }
      );
      // The sheet may have been dismissed while the camera was warming up.
      if (stopped) stop();
    } catch (err) {
      console.warn('Scanner failed to start', err);
      const denied = /permission|NotAllowed|denied/i.test(String(err?.message || err));
      showFallback(
        denied
          ? 'Camera access was blocked. Allow it in your browser settings, or enter the LinkedIn URL below.'
          : 'No camera was available. Enter the LinkedIn URL instead.'
      );
    }
  })();

  return sheet;
}
