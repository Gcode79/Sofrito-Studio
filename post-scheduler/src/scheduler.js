// src/scheduler.js
export default {
  async fetch(request, env, ctx) {
    // 1️⃣ Load the content calendar from KV (key "calendar")
    const calendarRaw = await env.POST_METRICS.get('calendar');
    if (!calendarRaw) {
      return new Response('Calendar not found in KV', { status: 500 });
    }
    const calendar = JSON.parse(calendarRaw);

    // 2️⃣ Find the next pending post (date >= now, status pending)
    const now = new Date();
    const next = calendar.find(p => p.status === 'pending' && new Date(p.date) >= now);
    if (!next) {
      return new Response('No pending posts', { status: 200 });
    }

    // 3️⃣ Load schedule profile for the platform (if exists)
    const profileRaw = await env.POST_METRICS.get(`schedule:profile:${next.platform}`);
    let profile = null;
    if (profileRaw) {
      profile = JSON.parse(profileRaw);
    }

    // 4️⃣ Adjust hour to a top‑hour from the profile (if we have one)
    if (profile && profile.topHours && profile.topHours.length) {
      const postDate = new Date(next.date);
      const nowHour = now.getUTCHours();
      // Convert stored topHours (strings like "9", "13") to numbers
      const topHours = profile.topHours.map(h => parseInt(h, 10));
      // Choose the first top hour that is still ahead today, otherwise the first of tomorrow
      const chosenHour = topHours.find(h => h > nowHour) ?? topHours[0];
      postDate.setUTCHours(chosenHour, 0, 0, 0);
      next.scheduledUtc = postDate.toISOString();
    } else {
      // No profile yet – schedule at midnight UTC of the given date
      next.scheduledUtc = new Date(next.date + 'T00:00:00Z').toISOString();
    }

    // 5️⃣ Build the API request for the selected platform
    let apiUrl, method = 'POST', body;
    const token = env[`${next.platform.toUpperCase()}_TOKEN`]; // e.g., env.TWITTER_TOKEN
    if (!token) {
      return new Response(`Missing token for platform ${next.platform}`, { status: 500 });
    }

    switch (next.platform) {
      case 'twitter':
        apiUrl = 'https://api.twitter.com/2/tweets';
        body = JSON.stringify({
          text: `${next.copy} ${next.utm}`,
          // If you have uploaded media IDs, add them here: "media": {"media_ids": ["123"]}
        });
        break;
      case 'instagram':
        // Instagram Graph API requires a two‑step upload; this is a placeholder.
        apiUrl = 'https://graph.facebook.com/v15.0/IG_USER_ID/media';
        body = JSON.stringify({
          image_url: next.assetUrl,
          caption: `${next.copy} ${next.utm}`,
        });
        break;
      case 'linkedin':
        apiUrl = 'https://api.linkedin.com/v2/ugcPosts';
        body = JSON.stringify({
          author: 'urn:li:person:YOUR_PERSON_ID',
          lifecycleState: 'PUBLISHED',
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: `${next.copy} ${next.utm}` },
              shareMediaCategory: next.type === 'image' ? 'IMAGE' : 'NONE',
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": 'PUBLIC' },
        });
        break;
      case 'facebook':
        apiUrl = 'https://graph.facebook.com/v15.0/me/feed';
        body = JSON.stringify({
          message: `${next.copy} ${next.utm}`,
          // For images you would use the "attached_media" field after uploading.
        });
        break;
      case 'tiktok':
        // TikTok API is more involved; placeholder URL.
        apiUrl = 'https://open-api.tiktok.com/v1/post/publish/';
        body = JSON.stringify({
          text: `${next.copy} ${next.utm}`,
          // media handling omitted for brevity.
        });
        break;
      default:
        return new Response(`Unsupported platform ${next.platform}`, { status: 400 });
    }

    // 6️⃣ Perform the HTTP request to the platform
    const resp = await fetch(apiUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });
    const result = await resp.json();

    // 7️⃣ Store metrics (initially zeros) and update calendar status
    const metricKey = `post:${next.platform}:${result.id ?? next.id}`;
    const metric = {
      platform: next.platform,
      postId: result.id ?? next.id,
      utc_ts: next.scheduledUtc,
      type: next.type,
      impressions: 0,
      clicks: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      engagementRate: 0,
      ctr: 0,
    };
    await env.POST_METRICS.put(metricKey, JSON.stringify(metric));

    if (resp.ok) {
      next.status = 'sent';
      next.postId = result.id ?? next.id;
    } else {
      next.retryCount = (next.retryCount || 0) + 1;
      if (next.retryCount > 3) {
        next.status = 'failed';
        // Send alert via Slack webhook if configured
        if (env.SLACK_WEBHOOK_URL) {
          await fetch(env.SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `❗️ Post failed on ${next.platform}: ${JSON.stringify(result)}` }),
          });
        }
      }
    }

    // 8️⃣ Write the updated calendar back to KV
    await env.POST_METRICS.put('calendar', JSON.stringify(calendar));

    // 9️⃣ Return a concise response for debugging
    return new Response(JSON.stringify({
      scheduledUtc: next.scheduledUtc,
      status: next.status,
      platform: next.platform,
      result,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
