'use strict';

const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

// One event per name per person, so "Add New Event" with an existing name is a
// no-op rather than a duplicate row.
eventSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Event', eventSchema);
