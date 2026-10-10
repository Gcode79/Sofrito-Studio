import { timingSafeEqual } from 'node:crypto';
import analytics from './analytics.js';
const respond = (body, status = 200) => Response.json(body, { status });
function authorized(request, env) {
  if (!env.SCHEDULER_KEY) return false;
  const actual = new TextEncoder().encode(request.headers.get('authorization') || '');
  const expected = new TextEncoder().encode(`Bearer ${env.SCHEDULER_KEY}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function publishDue(env, now = new Date()) {
  if (!env.DB) return respond({ error: 'Publication database is not configured' }, 503);
  const calendar = JSON.parse(await env.POST_METRICS.get('calendar') || '[]');
  if (!Array.isArray(calendar)) return respond({ error: 'Invalid calendar' }, 503);
  const due = calendar.filter(post => {
    const at = Date.parse(post.scheduledUtc || post.date);
    return typeof post.id === 'string' && post.id && post.approved === true &&
      post.status === 'pending' && Number.isFinite(at) && at <= now.getTime();
  }).sort((a, b) => Date.parse(a.scheduledUtc || a.date) - Date.parse(b.scheduledUtc || b.date));
  for (const post of due) {
    // Other adapters were placeholders and must not report successful publication.
    if (!['twitter', 'facebook'].includes(post.platform)) continue;
    const token = env[`${post.platform.toUpperCase()}_TOKEN`];
    if (!token) continue;
    const claim = await env.DB.prepare(
      `INSERT INTO publications (id, claimed_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING`
    ).bind(post.id, now.toISOString()).run();
    if (!claim.meta?.changes) continue;
    const twitter = post.platform === 'twitter';
    try {
      const response = await fetch(twitter ? 'https://api.twitter.com/2/tweets' : 'https://graph.facebook.com/v23.0/me/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [twitter ? 'text' : 'message']: `${post.copy || ''} ${post.utm || ''}`.trim() }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      const providerId = twitter ? result.data?.id : result.id;
      if (!response.ok || !providerId) throw new Error('Publication not confirmed');
      await env.DB.prepare(`UPDATE publications SET status = 'sent', provider_id = ?, completed_at = ? WHERE id = ?`)
        .bind(providerId, new Date().toISOString(), post.id).run();
      await env.POST_METRICS.put(`post:${post.platform}:${providerId}`, JSON.stringify({
        platform: post.platform, postId: providerId, utc_ts: now.toISOString(), type: post.type,
        impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, ctr: 0,
      }));
      return respond({ id: post.id, status: 'sent' });
    } catch {
      // Retain the claim even after a timeout or persistence failure. Retrying
      // a provider without idempotency support can publish the same post twice.
      return respond({ id: post.id, status: 'reconciliation_required' }, 502);
    }
  }
  return respond({ status: 'no_due_posts' });
}
export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return respond({ error: 'unauthorized' }, 401);
    if (new URL(request.url).pathname !== '/run') return respond({ error: 'not_found' }, 404);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    return publishDue(env);
  },
  async scheduled(event, env, ctx) {
    if (event.cron === '0 2 * * *') await analytics.scheduled(event, env, ctx);
    else await publishDue(env);
  },
};
