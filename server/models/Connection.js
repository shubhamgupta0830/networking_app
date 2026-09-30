'use strict';

const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    linkedInUrl: { type: String, required: true, trim: true },

    /**
     * How the connection was recorded:
     *  - `exchange`: a mutual scan between two accounts of this app
     *  - `scan`: a plain LinkedIn QR code, confirmed by hand
     *  - `seed`: created with the account
     */
    source: { type: String, enum: ['exchange', 'scan', 'seed'], default: 'scan' },
  },
  { timestamps: true }
);

connectionSchema.index({ userId: 1, eventId: 1, createdAt: -1 });

module.exports = mongoose.model('Connection', connectionSchema);
