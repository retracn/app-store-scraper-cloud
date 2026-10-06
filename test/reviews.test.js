'use strict';
const test = require('node:test');
const assert = require('node:assert');

const calls = [];
function row (i) {
  return { reviewId: String(10000 + i), rating: (i % 5) + 1, title: `t${i}`, text: `text ${i}`, date: '2026-10-01T10:00:00.000Z', userName: `u${i}`, appVersion: null, isEdited: i === 0, replyText: i === 1 ? 'Thanks!' : null, replyDate: null, reviewUrl: null };
}
global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).startsWith('https://itunes.apple.com/lookup')) {
    const found = String(url).includes('bundleId=com.spotify.client');
    return { ok: true, status: 200, json: async () => ({ results: found ? [{ trackId: 324684580 }] : [] }) };
  }
  const auth = init.headers && init.headers.Authorization;
  if (auth !== 'Bearer good-token') return { ok: false, status: 401, text: async () => 'bad token', json: async () => ({}) };
  const body = JSON.parse(init.body);
  const n = Math.min(body.maxReviewsPerApp, 120); // this app has 120 reviews
  return { ok: true, status: 201, json: async () => Array.from({ length: n }, (_, i) => row(i)) };
};

const store = require('..');

test('re-exports the original API with reviews replaced', () => {
  const original = require('app-store-scraper');
  for (const k of ['app', 'search', 'list', 'developer', 'similar', 'ratings', 'suggest', 'collection', 'category', 'sort']) {
    assert.ok(k in store, `missing ${k}`);
    if (k !== 'reviews') assert.strictEqual(store[k], original[k]);
  }
  assert.notStrictEqual(store.reviews, original.reviews);
  assert.strictEqual(store.memoized().reviews, store.reviews);
});

test('reviews() returns the original shape and pages of 50 from one run', async () => {
  process.env.APIFY_TOKEN = 'good-token';
  calls.length = 0;
  const page2 = await store.reviews({ id: 553834731, country: 'gb', page: 2 });
  assert.strictEqual(page2.length, 50);
  assert.deepStrictEqual(Object.keys(page2[0]).slice(0, 9), ['id', 'userName', 'userUrl', 'version', 'score', 'title', 'text', 'url', 'updated']);
  assert.strictEqual(page2[0].id, '10050');
  assert.strictEqual(page2[0].url, 'https://apps.apple.com/gb/app/id553834731?see-all=reviews');
  const apify = calls.filter((c) => c.url.includes('/run-sync-get-dataset-items'));
  assert.strictEqual(apify.length, 1);
  assert.deepStrictEqual(JSON.parse(apify[0].init.body), { apps: ['553834731'], countries: ['gb'], sort: 'newest', maxReviewsPerApp: 100, includeAppDetails: false });
  assert.strictEqual(page2.length, 50);
  const page1 = await store.reviews({ id: 553834731, country: 'gb', page: 1 });
  assert.strictEqual(page1[0].id, '10000');
  assert.strictEqual(page1[0].isEdited, true);
  assert.deepStrictEqual(page1[1].developerResponse, { text: 'Thanks!', date: null });
  assert.strictEqual(calls.filter((c) => c.url.includes('/run-sync-get-dataset-items')).length, 1, 'page 1 comes from the cache');
});

test('pages past 10 work (no 500-review cap) and the end of the list is empty', async () => {
  const p3 = await store.reviews({ id: 1, page: 3 });
  assert.strictEqual(p3.length, 20);
  const p12 = await store.reviews({ id: 1, page: 12 });
  assert.deepStrictEqual(p12, []);
});

test('appId (bundle id) is resolved, sort maps to the API', async () => {
  calls.length = 0;
  await store.reviews({ appId: 'com.spotify.client', sort: store.sort.HELPFUL });
  assert.ok(calls[0].url.startsWith('https://itunes.apple.com/lookup?bundleId=com.spotify.client&country=us'));
  const body = JSON.parse(calls[1].init.body);
  assert.strictEqual(body.apps[0], '324684580');
  assert.strictEqual(body.sort, 'relevant');
  await assert.rejects(store.reviews({ appId: 'com.nope.app' }), /App not found/);
});

test('validation and token errors', async () => {
  await assert.rejects(async () => store.reviews({}), /Either id or appId is required/);
  await assert.rejects(async () => store.reviews({ id: 1, sort: 'bogus' }), /Invalid sort/);
  await assert.rejects(async () => store.reviews({ id: 1, page: -1 }), /Page cannot be lower than 1/);
  await assert.rejects(store.reviews({ id: 999, apifyToken: 'bad' }), /rejected the API token/);
  delete process.env.APIFY_TOKEN;
  await assert.rejects(store.reviews({ id: 998 }), /No Apify API token/);
});

test('a page-by-page loop fetches ahead instead of one run per page', async () => {
  process.env.APIFY_TOKEN = 'good-token';
  calls.length = 0;
  for (let page = 1; page <= 3; page++) await store.reviews({ id: 4242, page });
  const sizes = calls.filter((c) => c.url.includes('/run-sync-get-dataset-items')).map((c) => JSON.parse(c.init.body).maxReviewsPerApp);
  assert.deepStrictEqual(sizes, [100, 200], 'pages 1-2 from the first run, page 3 from a doubled run');
});
