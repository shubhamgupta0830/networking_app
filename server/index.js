'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');

const config = require('./config');
const { connect } = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const app = express();

// Render terminates TLS upstream; without this, rate limiting sees one IP for
// everybody and `req.secure` is always false.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '32kb' }));

const publicDir = path.join(__dirname, '..', 'public');

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.use(
  express.static(publicDir, {
    // index.html and the worker must not be served stale, or a deploy would
    // leave clients pinned to the previous build.
    setHeaders(res, filePath) {
      const name = path.basename(filePath);
      if (name === 'index.html' || name === 'service-worker.js') {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.(png|svg|webmanifest|ico)$/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Single-page app: any other GET renders the shell and the client routes it.
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

async function main() {
  await connect();
  app.listen(config.port, () => {
    console.log(`WeMeThere listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
