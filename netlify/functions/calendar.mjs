// ═══════════════════════════════════════════════════════════════
// RTC — Live economic calendar (Netlify Function)
// ---------------------------------------------------------------
// The app fetches /.netlify/functions/calendar on the check-in page.
// This proxies the ForexFactory weekly calendar feed server-side
// (the feed blocks browser CORS requests), slims it down, and caches
// it so we never hammer the upstream or slow the page down.
//
// Contract with index.html (do not break):
//   returns JSON array of { title, country, date, impact, forecast, previous }
//   - date:    ISO string with timezone offset (client renders local time)
//   - impact:  "High" | "Medium" | "Low" | "Holiday"
//   - country: "USD" etc — client filters to USD/ALL
// On ANY failure: non-200 → the client silently keeps its built-in
// fallback template. Never return a 200 with malformed data.
// ═══════════════════════════════════════════════════════════════

const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — calendar data doesn't move fast

// Module-scope cache survives between warm invocations of the function.
let cache = { at: 0, body: null };

export default async () => {
  const now = Date.now();

  // Serve from warm cache when fresh
  if (cache.body && now - cache.at < CACHE_TTL_MS) {
    return respond(cache.body, 'HIT');
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const r = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'revenge-trader-club-calendar/1.0' }
    });
    clearTimeout(timer);
    if (!r.ok) throw new Error('upstream ' + r.status);

    const raw = await r.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('empty feed');

    // Slim + sanitize: only the fields the app uses, only sane values.
    const events = raw
      .filter((ev) => ev && ev.title && ev.date)
      .map((ev) => ({
        title:    String(ev.title).slice(0, 120),
        country:  String(ev.country || '').slice(0, 8),
        date:     String(ev.date).slice(0, 40),
        impact:   ['High', 'Medium', 'Low', 'Holiday'].includes(ev.impact) ? ev.impact : 'Low',
        forecast: ev.forecast ? String(ev.forecast).slice(0, 24) : '',
        previous: ev.previous ? String(ev.previous).slice(0, 24) : ''
      }));

    if (!events.length) throw new Error('no usable events');

    const body = JSON.stringify(events);
    cache = { at: now, body };
    return respond(body, 'MISS');
  } catch (err) {
    // Stale cache beats no data — serve it up to 6 hours old on upstream failure
    if (cache.body && now - cache.at < 6 * 60 * 60 * 1000) {
      return respond(cache.body, 'STALE');
    }
    return new Response(JSON.stringify({ error: 'calendar unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function respond(body, cacheState) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Browser caches 5 min, Netlify CDN 15 min — page loads never wait twice
      'Cache-Control': 'public, max-age=300, s-maxage=900',
      'X-RTC-Cache': cacheState
    }
  });
}
