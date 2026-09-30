'use strict';

require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// In production a missing secret would silently fall back to a value an
// attacker could guess, so refuse to boot instead.
if (!process.env.JWT_SECRET && isProduction) {
  console.error('JWT_SECRET is not set. Refusing to start in production.');
  process.exit(1);
}

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  tokenTtl: '180d',

  // Seeded into every new account so the list is never empty, and so there
  // is always a visible way to reach the author. Matches the iOS app.
  defaultEventName: 'WeMeThere',
  feedbackLinkedInUrl: 'https://www.linkedin.com/in/shubhamgupta08/',

  // Query parameter carrying the exchange code, appended to the person's
  // real LinkedIn URL. A generic QR scanner just opens the LinkedIn profile
  // and ignores the unknown parameter; this app looks for it and performs a
  // mutual exchange instead.
  exchangeParam: 'wemethere',
};
