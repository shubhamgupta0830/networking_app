'use strict';

const express = require('express');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

const User = require('../models/User');
const Event = require('../models/Event');
const Connection = require('../models/Connection');
const { requireAuth } = require('../middleware/auth');
const { ensureEvent, buildState } = require('../lib/store');
const { normalizeUrl, buildQrPayload, readExchangeCode, stripExchangeCode } = require('../lib/links');
const { defaultEventName, feedbackLinkedInUrl } = require('../config');

const router = express.Router();
router.use(requireAuth);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id));

/** Everything the main screen needs, in one round trip. */
router.get('/state', async (req, res, next) => {
  try {
    res.json({
      user: req.user.toPublicJSON(),
      feedbackLinkedInUrl,
      events: await buildState(req.user._id),
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------- events --------------------------------- */

router.post('/events', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter an event name.' });
    if (name.length > 120) return res.status(400).json({ error: 'That event name is too long.' });

    const existing = await Event.findOne({ userId: req.user._id, name });
    if (existing) {
      return res.status(409).json({ error: `You already have an event called "${name}".` });
    }

    const event = await ensureEvent(req.user._id, name);
    res.status(201).json({ event: { id: event._id.toString(), name: event.name } });
  } catch (err) {
    next(err);
  }
});

router.patch('/events/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Event not found.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please enter an event name.' });

    const event = await Event.findOne({ _id: req.params.id, userId: req.user._id });
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    if (name !== event.name && (await Event.exists({ userId: req.user._id, name }))) {
      return res.status(409).json({ error: `You already have an event called "${name}".` });
    }

    const previousName = event.name;
    event.name = name;
    await event.save();

    // Keep the "incoming scans land here" pointer aimed at the renamed event.
    if (req.user.currentEventName === previousName) {
      req.user.currentEventName = name;
      await req.user.save();
    }

    res.json({ event: { id: event._id.toString(), name: event.name } });
  } catch (err) {
    next(err);
  }
});

router.delete('/events/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Event not found.' });
    const event = await Event.findOne({ _id: req.params.id, userId: req.user._id });
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // Connections first: an orphaned connection would be invisible and
    // undeletable, whereas an event that briefly outlives its connections is
    // merely shown as empty.
    await Connection.deleteMany({ userId: req.user._id, eventId: event._id });
    await event.deleteOne();

    if (req.user.currentEventName === event.name) {
      req.user.currentEventName = null;
      await req.user.save();
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Marks the event that incoming scans of this person's own QR code should land
 * in. Best-effort on the client's side: the scan it performs itself carries its
 * own event name regardless.
 */
router.put('/events/current', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Please provide an event name.' });
    req.user.currentEventName = name;
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- connections ------------------------------- */

router.post('/events/:id/connections', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Event not found.' });
    const event = await Event.findOne({ _id: req.params.id, userId: req.user._id });
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const linkedInUrl = stripExchangeCode(req.body.linkedInUrl);
    if (!linkedInUrl || linkedInUrl === 'https://') {
      return res.status(400).json({ error: 'That QR code did not contain a link.' });
    }

    const connection = await Connection.create({
      userId: req.user._id,
      eventId: event._id,
      linkedInUrl,
      source: 'scan',
    });

    res.status(201).json({
      connection: {
        id: connection._id.toString(),
        linkedInUrl: connection.linkedInUrl,
        createdAt: connection.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/connections/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Connection not found.' });
    const connection = await Connection.findOne({ _id: req.params.id, userId: req.user._id });
    if (!connection) return res.status(404).json({ error: 'Connection not found.' });

    if (req.body.eventId !== undefined) {
      if (!isValidId(req.body.eventId)) return res.status(404).json({ error: 'Event not found.' });
      const target = await Event.findOne({ _id: req.body.eventId, userId: req.user._id });
      if (!target) return res.status(404).json({ error: 'Event not found.' });
      connection.eventId = target._id;
    }

    if (req.body.linkedInUrl !== undefined) {
      const url = normalizeUrl(req.body.linkedInUrl);
      if (!url) return res.status(400).json({ error: 'Please enter a LinkedIn URL.' });
      connection.linkedInUrl = url;
    }

    await connection.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/connections/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Connection not found.' });
    const result = await Connection.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Connection not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------- profile --------------------------------- */

/**
 * Creates or edits the person's own LinkedIn URL. The public code is never
 * regenerated, so a QR code shared or printed earlier keeps working and keeps
 * resolving to the current URL.
 */
router.put('/profile', async (req, res, next) => {
  try {
    const linkedInUrl = normalizeUrl(req.body.linkedInUrl);
    if (!linkedInUrl || linkedInUrl === 'https://') {
      return res.status(400).json({ error: 'Please enter your LinkedIn URL.' });
    }
    req.user.linkedInUrl = stripExchangeCode(linkedInUrl);
    await req.user.save();
    res.json({ user: req.user.toPublicJSON(), qrPayload: qrPayloadFor(req.user) });
  } catch (err) {
    next(err);
  }
});

function qrPayloadFor(user) {
  if (!user.linkedInUrl) return null;
  return buildQrPayload(user.linkedInUrl, user.publicCode);
}

router.get('/profile/qr', async (req, res, next) => {
  try {
    const payload = qrPayloadFor(req.user);
    if (!payload) return res.status(409).json({ error: 'Set your LinkedIn URL first.' });

    const svg = await QRCode.toString(payload, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    res.json({ payload, svg });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------- exchange -------------------------------- */

/**
 * The mutual swap. Scanning somebody's code records the connection on both
 * sides at once: their LinkedIn lands in the scanner's chosen event, and the
 * scanner's LinkedIn lands in whichever event the scanned person last opened.
 * The scanned person needs no action and need not even have the app open.
 */
router.post('/exchange', async (req, res, next) => {
  try {
    const rawCode = String(req.body.publicCode || '').trim();
    // Accept either a bare code or the full scanned URL.
    const publicCode = readExchangeCode(rawCode) || rawCode;
    const eventId = req.body.eventId;

    if (!publicCode) return res.status(400).json({ error: 'That is not a WeMeThere QR code.' });
    if (!req.user.linkedInUrl) {
      return res.status(409).json({
        error: 'Set up your own QR code first, so there is something to give back.',
        code: 'PROFILE_INCOMPLETE',
      });
    }
    if (!isValidId(eventId)) return res.status(404).json({ error: 'Event not found.' });

    const myEvent = await Event.findOne({ _id: eventId, userId: req.user._id });
    if (!myEvent) return res.status(404).json({ error: 'Event not found.' });

    const other = await User.findOne({ publicCode });
    if (!other) {
      return res.status(404).json({ error: 'That QR code is not registered with WeMeThere.' });
    }
    if (other._id.equals(req.user._id)) {
      return res.status(400).json({ error: 'That is your own QR code.' });
    }
    if (!other.linkedInUrl) {
      return res.status(409).json({ error: 'That person has not finished setting up their profile yet.' });
    }

    // My side.
    const mine = await Connection.findOne({
      userId: req.user._id,
      eventId: myEvent._id,
      linkedInUrl: other.linkedInUrl,
    });
    if (!mine) {
      await Connection.create({
        userId: req.user._id,
        eventId: myEvent._id,
        linkedInUrl: other.linkedInUrl,
        source: 'exchange',
      });
    }

    // Their side. A failure here must not lose the scanner's own connection,
    // which is already saved, so it is reported without rolling anything back.
    let reciprocated = true;
    try {
      const theirEvent = await ensureEvent(other._id, other.currentEventName || defaultEventName);
      const theirs = await Connection.findOne({
        userId: other._id,
        eventId: theirEvent._id,
        linkedInUrl: req.user.linkedInUrl,
      });
      if (!theirs) {
        await Connection.create({
          userId: other._id,
          eventId: theirEvent._id,
          linkedInUrl: req.user.linkedInUrl,
          source: 'exchange',
        });
      }
    } catch (err) {
      console.error('Exchange: reciprocal write failed', err);
      reciprocated = false;
    }

    res.status(201).json({
      linkedInUrl: other.linkedInUrl,
      eventName: myEvent.name,
      alreadyConnected: Boolean(mine),
      reciprocated,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
