// src/analytics.js
export default {
  async scheduled(event, env, ctx) {
    // 1️⃣ List all metric keys (prefix "post:")
    const list = await env.POST_METRICS.list({ prefix: 'post:' });
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Structure: { platform -> hour -> { count, engagementSum, ctrSum, typeCounts } }
    const stats = {};

    for (const key of list.keys) {
      const raw = await env.POST_METRICS.get(key.name);
      if (!raw) continue;
      const metric = JSON.parse(raw);
      const ts = new Date(metric.utc_ts).getTime();
      if (ts < thirtyDaysAgo) continue; // ignore old data

      const platform = metric.platform;
      const date = new Date(metric.utc_ts);
      const hour = date.getUTCHours();

      if (!stats[platform]) stats[platform] = {};
      if (!stats[platform][hour]) {
        stats[platform][hour] = { count: 0, engagementSum: 0, ctrSum: 0, typeCounts: {} };
      }
      const bucket = stats[platform][hour];
      bucket.count += 1;
      bucket.engagementSum += metric.engagementRate || 0;
      bucket.ctrSum += metric.ctr || 0;

      const type = metric.type;
      bucket.typeCounts[type] = (bucket.typeCounts[type] || 0) + (metric.engagementRate || 0);
    }

    // 2️⃣ Build profile per platform
    for (const platform of Object.keys(stats)) {
      const hourBuckets = stats[platform];
      // Convert to array for sorting
      const sorted = Object.entries(hourBuckets)
        .map(([hourStr, data]) => {
          const hour = parseInt(hourStr, 10);
          const avgEng = data.engagementSum / data.count;
          const avgCtr = data.ctrSum / data.count;
          // Determine best type for this hour based on engagement sum
          const bestType = Object.entries(data.typeCounts).reduce((best, [type, sum]) =>
            sum > (best.sum || 0) ? { type, sum } : best,
            {});
          return { hour, avgEng, avgCtr, bestType: bestType.type };
        })
        .sort((a, b) => b.avgEng - a.avgEng);

      const topHours = sorted.slice(0, 3).map(h => `${h.hour}`);
      const bestOverall = sorted.reduce((best, cur) => (cur.avgEng > (best.avgEng || 0) ? cur : best), {});

      const profile = {
        topHours,
        bestType: bestOverall.bestType || null,
        avgEngagement: bestOverall.avgEng || 0,
      };

      await env.POST_METRICS.put(`schedule:profile:${platform}`, JSON.stringify(profile));
    }

    // Log completion (visible in Workers logs)
    console.log('Analytics run completed at', new Date().toISOString());
  },
};
