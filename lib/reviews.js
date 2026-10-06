'use strict';
const { sort: SORT } = require('app-store-scraper/lib/constants');

const ACTOR = 'automationnation~app-store-reviews-scraper';
const PAGE_SIZE = 50;
const cache = new Map();

function api () {
  return `${(process.env.APIFY_API_BASE_URL || 'https://api.apify.com').replace(/\/+$/, '')}/v2`;
}

function validate (opts) {
  if (!opts.id && !opts.appId) throw Error('Either id or appId is required');
  if (opts.sort && !Object.values(SORT).includes(opts.sort)) throw new Error('Invalid sort ' + opts.sort);
  if (opts.page && opts.page < 1) throw new Error('Page cannot be lower than 1');
}

async function resolveId (opts) {
  if (opts.id) return String(opts.id);
  const res = await fetch(`https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(opts.appId)}&country=${opts.country}`);
  const data = await res.json();
  if (!data.results || !data.results.length) {
    const err = new Error('App not found (404)');
    err.status = 404;
    throw err;
  }
  return String(data.results[0].trackId);
}

async function fetchReviews (id, country, sort, count, token) {
  const res = await fetch(`${api()}/acts/${ACTOR}/run-sync-get-dataset-items?timeout=300&clean=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'app-store-scraper-cloud' },
    body: JSON.stringify({ apps: [id], countries: [country], sort, maxReviewsPerApp: count, includeAppDetails: false })
  });
  if (res.status === 401) throw new Error('Apify rejected the API token (check APIFY_TOKEN).');
  if (res.status === 402) throw new Error('Your Apify account has no credit left: https://console.apify.com/billing');
  if (!res.ok) throw new Error(`The reviews request failed: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((r) => r.reviewId);
}

// Same shape as app-store-scraper's reviews(), plus isEdited and developerResponse.
function clean (r, id, country) {
  return {
    id: String(r.reviewId),
    userName: r.userName,
    userUrl: null,
    version: r.appVersion || null,
    score: Number(r.rating),
    title: r.title,
    text: r.text,
    url: r.reviewUrl || `https://apps.apple.com/${country}/app/id${id}?see-all=reviews`,
    updated: r.date,
    isEdited: Boolean(r.isEdited),
    developerResponse: r.replyText ? { text: r.replyText, date: r.replyDate || null } : null
  };
}

async function reviews (opts) {
  opts = Object.assign({}, opts);
  validate(opts);
  opts.sort = opts.sort || SORT.RECENT;
  opts.page = opts.page || 1;
  opts.country = opts.country || 'us';
  const token = opts.apifyToken || process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('No Apify API token: set APIFY_TOKEN or pass { apifyToken }. Free account: https://console.apify.com/sign-up, token: https://console.apify.com/settings/integrations');
  }
  const id = await resolveId(opts);
  const sort = opts.sort === SORT.HELPFUL ? 'relevant' : 'newest';
  const need = opts.page * PAGE_SIZE;
  const key = `${id}|${opts.country}|${sort}`;
  let entry = cache.get(key);
  // One run fetches every review up to the requested page; earlier pages then come from the cache.
  const fresh = entry && Date.now() - entry.at < 5 * 60 * 1000;
  if (!fresh || (entry.requested < need && !entry.complete)) {
    // Fetch ahead (at least 2 pages, doubling) so a page-by-page loop needs a few runs, not one per page.
    const target = Math.max(need, fresh ? entry.requested * 2 : 2 * PAGE_SIZE);
    const rows = await fetchReviews(id, opts.country, sort, target, token);
    entry = { requested: target, complete: rows.length < target, rows: rows.map((r) => clean(r, id, opts.country)), at: Date.now() };
    cache.set(key, entry);
  }
  return entry.rows.slice((opts.page - 1) * PAGE_SIZE, need);
}

reviews._cache = cache;
module.exports = reviews;
