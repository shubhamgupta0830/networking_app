'use strict';

const { exchangeParam } = require('../config');

/**
 * Guarantees an "https://" scheme so a QR payload is an openable link for a
 * generic scanner rather than inert text (e.g. someone typing
 * "linkedin.com/in/name" with no scheme).
 */
function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Appends the exchange code to a LinkedIn URL to build the QR payload. */
function buildQrPayload(linkedInUrl, publicCode) {
  const base = normalizeUrl(linkedInUrl);
  try {
    const url = new URL(base);
    url.searchParams.set(exchangeParam, publicCode);
    return url.toString();
  } catch {
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}${exchangeParam}=${encodeURIComponent(publicCode)}`;
  }
}

/**
 * Reads the exchange code out of scanned text. Returns null for a plain
 * LinkedIn QR code, which the caller then confirms by hand instead.
 */
function readExchangeCode(decodedText) {
  try {
    const url = new URL(String(decodedText).trim());
    return url.searchParams.get(exchangeParam) || null;
  } catch {
    return null;
  }
}

/** Strips the exchange code so a stored connection is a clean profile link. */
function stripExchangeCode(urlString) {
  try {
    const url = new URL(normalizeUrl(urlString));
    url.searchParams.delete(exchangeParam);
    return url.toString().replace(/\?$/, '');
  } catch {
    return normalizeUrl(urlString);
  }
}

module.exports = { normalizeUrl, buildQrPayload, readExchangeCode, stripExchangeCode };
