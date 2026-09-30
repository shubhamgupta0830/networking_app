'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');
const { seedDefaults } = require('../lib/store');

const router = express.Router();

// The login and signup endpoints are public, so cap attempts per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(email, password) {
  if (!email || !EMAIL_PATTERN.test(email)) {
    return 'Please enter a valid email address.';
  }
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 200) {
    return 'Password is too long.';
  }
  return null;
}

router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const problem = validateCredentials(email, password);
    if (problem) return res.status(400).json({ error: problem });

    if (await User.exists({ email })) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await User.create({ email, passwordHash });
    } catch (err) {
      // Lost a race against another signup with the same address.
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'An account with that email already exists.' });
      }
      throw err;
    }

    await seedDefaults(user._id);

    return res.status(201).json({ token: signToken(user), user: user.toPublicJSON() });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });
    // Same message either way, so the response cannot be used to test which
    // addresses have accounts.
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    return res.json({ token: signToken(user), user: user.toPublicJSON() });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

router.post('/change-password', requireAuth, authLimiter, async (req, res, next) => {
  try {
    const current = String(req.body.currentPassword || '');
    const next_ = String(req.body.newPassword || '');
    if (next_.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (!(await bcrypt.compare(current, req.user.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    req.user.passwordHash = await bcrypt.hash(next_, 12);
    await req.user.save();
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
