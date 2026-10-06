# app-store-scraper-cloud: app-store-scraper with a reliable reviews()

[app-store-scraper](https://github.com/facundoolano/app-store-scraper) reads App Store reviews from Apple's old review feed. Users report `statusCode 403` and `Unexpected token < in JSON at position 0` from `reviews()`, the feed stops at 500 reviews (10 pages), and the package hasn't had a release since November 2023. **app-store-scraper-cloud keeps the same API, so your code doesn't change.** `reviews()` runs on a hosted App Store reviews API that reads Apple's current review endpoint and goes past 500 reviews. Every other method (`app`, `search`, `list`, `developer`, `similar`, `ratings`…) is the original, re-exported unchanged.

```diff
- const store = require('app-store-scraper');
+ const store = require('app-store-scraper-cloud');
```

## Install

```bash
npm install github:retracn/app-store-scraper-cloud
```

You need an Apify API token: create a [free Apify account](https://console.apify.com/sign-up), copy the token from [Settings → API & Integrations](https://console.apify.com/settings/integrations) and set `APIFY_TOKEN`, or pass `{ apifyToken: '...' }` to `reviews()`.

## Use it exactly like app-store-scraper

```js
const store = require('app-store-scraper-cloud');

const page1 = await store.reviews({ id: 324684580, country: 'us', sort: store.sort.RECENT, page: 1 });
// [{ id, userName, userUrl, version, score, title, text, url, updated, isEdited, developerResponse }, ...]

const byBundle = await store.reviews({ appId: 'com.spotify.client', sort: store.sort.HELPFUL });
const page12 = await store.reviews({ id: 324684580, page: 12 }); // past the old 500-review limit
```

- Pages are 50 reviews, as before, and the old 10-page limit is gone.
- One request fetches ahead (at least 2 pages, then doubling), so a page-by-page loop makes a few requests rather than one per page. Results are cached for 5 minutes.
- `store.memoized()` works too.

## What's different

| | app-store-scraper | app-store-scraper-cloud |
|---|---|---|
| Source of `reviews()` | Apple's old review feed, from your IP | Hosted API on Apify that reads Apple's current review endpoint |
| Reviews per app | 500 at most (10 pages) | Thousands for popular apps |
| `userUrl`, `version` | Reviewer profile URL, app version | `null` (Apple's current endpoint doesn't return them) |
| `url` | Link to the review in the feed | The app's reviews page |
| Extra fields | – | `isEdited`, `developerResponse` |
| Cost | Free | $0.08 per 1,000 reviews on your Apify account (the free plan's $5 monthly credit covers about 60,000) |
| Speed | Under a second when the feed answers | A few seconds per request |

## Errors

The validation errors match the original (`Either id or appId is required`, `Invalid sort …`, `Page cannot be lower than 1`). Token and credit problems raise clear messages: `Apify rejected the API token (check APIFY_TOKEN).` and `Your Apify account has no credit left`.

## How it works

`reviews()` calls [App Store Reviews Scraper](https://apify.com/automationnation/app-store-reviews-scraper) through Apify's `run-sync-get-dataset-items` endpoint with your token. There's no other dependency or infrastructure. The same Actor offers review filters (stars, keywords), several countries per run, and Google Play reviews: see [Google Play Reviews Scraper](https://apify.com/automationnation/google-play-reviews-scraper).

Disclosure: I maintain the Actor this package calls. MIT licensed. Not affiliated with Apple or with app-store-scraper.
