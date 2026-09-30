'use strict';

const mongoose = require('mongoose');
const { mongoUri } = require('./config');

/**
 * Pulls the database name out of a connection string, i.e. the path segment
 * between the host and the query string. Returns null when the URI omits it
 * (`...mongodb.net/?retryWrites=true`), which is common for the strings the
 * Atlas dashboard hands out. Done with a regex rather than `new URL()`
 * because credentials in the URI can contain characters URL parsing rejects.
 */
function databaseNameFrom(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]+)/.exec(uri);
  if (!match) return null;
  return decodeURIComponent(match[1]) || null;
}

async function connect() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000,
    // Without an explicit name, a URI with no database in its path would put
    // every collection in "test".
    dbName: databaseNameFrom(mongoUri) || 'wemethere',
  });
  console.log('MongoDB connected to database:', mongoose.connection.name);
  return mongoose.connection;
}

module.exports = { connect, databaseNameFrom };
