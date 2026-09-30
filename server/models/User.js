'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },

    /** The person's own LinkedIn URL, handed out by their QR code. */
    linkedInUrl: { type: String, default: null },

    /**
     * Published inside this person's QR code. Separate from `_id` on purpose:
     * anyone who scans the code learns this value, so it must not be the key
     * that authorises writes to the account.
     */
    publicCode: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomUUID(),
    },

    /**
     * The event this person last opened the scanner from. When somebody else
     * scans their code, the resulting connection lands in this event on their
     * side. Falls back to the default event when unset.
     */
    currentEventName: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    linkedInUrl: this.linkedInUrl,
    publicCode: this.publicCode,
    currentEventName: this.currentEventName,
  };
};

module.exports = mongoose.model('User', userSchema);
