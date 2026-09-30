'use strict';

const Event = require('../models/Event');
const Connection = require('../models/Connection');
const { defaultEventName, feedbackLinkedInUrl } = require('../config');

/**
 * Finds an event by name for a person, creating it if absent. Concurrent calls
 * are safe: the unique (userId, name) index turns the loser of a race into a
 * duplicate-key error, which is then resolved by re-reading the winner's row.
 */
async function ensureEvent(userId, name) {
  const trimmed = String(name || '').trim() || defaultEventName;
  const existing = await Event.findOne({ userId, name: trimmed });
  if (existing) return existing;
  try {
    return await Event.create({ userId, name: trimmed });
  } catch (err) {
    if (err && err.code === 11000) {
      return Event.findOne({ userId, name: trimmed });
    }
    throw err;
  }
}

/**
 * Gives a fresh account a non-empty list and a visible route to the author,
 * mirroring the default event the iOS app seeds.
 */
async function seedDefaults(userId) {
  const event = await ensureEvent(userId, defaultEventName);
  const already = await Connection.findOne({ userId, eventId: event._id, linkedInUrl: feedbackLinkedInUrl });
  if (!already) {
    await Connection.create({
      userId,
      eventId: event._id,
      linkedInUrl: feedbackLinkedInUrl,
      source: 'seed',
    });
  }
  return event;
}

/**
 * The whole screen in one payload: every event with its connections, ordered
 * so the event with the most recent activity comes first. Events with no
 * connections fall back to their own creation time.
 */
async function buildState(userId) {
  const [events, connections] = await Promise.all([
    Event.find({ userId }).lean(),
    Connection.find({ userId }).sort({ createdAt: 1 }).lean(),
  ]);

  const byEvent = new Map(events.map((event) => [event._id.toString(), []]));
  for (const connection of connections) {
    const bucket = byEvent.get(connection.eventId.toString());
    // Skip orphans left by a partially-failed event delete.
    if (bucket) bucket.push(connection);
  }

  return events
    .map((event) => {
      const own = byEvent.get(event._id.toString()) || [];
      const latest = own.reduce(
        (max, connection) => Math.max(max, new Date(connection.createdAt).getTime()),
        new Date(event.createdAt).getTime()
      );
      return {
        id: event._id.toString(),
        name: event.name,
        createdAt: event.createdAt,
        lastActivityAt: new Date(latest).toISOString(),
        connections: own
          .slice()
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map((connection) => ({
            id: connection._id.toString(),
            linkedInUrl: connection.linkedInUrl,
            source: connection.source,
            createdAt: connection.createdAt,
          })),
      };
    })
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
}

module.exports = { ensureEvent, seedDefaults, buildState };
