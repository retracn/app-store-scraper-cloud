'use strict';
// Drop-in replacement for app-store-scraper: every method and constant is re-exported unchanged,
// except reviews(). The original reads Apple's old review feed, which can answer 403 or HTML
// ("Unexpected token <") and stops at 500 reviews; this one runs through a hosted App Store reviews
// API on Apify instead. Set APIFY_TOKEN (free account: https://console.apify.com/sign-up).
const original = require('app-store-scraper');
const reviews = require('./lib/reviews');

function memoized (opts) {
  return Object.assign(original.memoized(opts), { reviews });
}

module.exports = Object.assign({}, original, { reviews, memoized });
