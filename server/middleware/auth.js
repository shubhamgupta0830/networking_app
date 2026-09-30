'use strict';

const jwt = require('jsonwebtoken');
const { jwtSecret, tokenTtl } = require('../config');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, jwtSecret, { expiresIn: tokenTtl });
}

async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

module.exports = { signToken, requireAuth };
