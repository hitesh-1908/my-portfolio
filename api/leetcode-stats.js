/**
 * Serverless API Route: /api/leetcode-stats
 * Fetches live statistics from LeetCode's public GraphQL endpoint.
 * Features 30-minute in-memory caching and graceful fallback.
 */

const LEETCODE_USERNAME = 'Hitesh_Bhattad';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cachedData = {
  timestamp: 0,
  data: {
    username: LEETCODE_USERNAME,
    totalSolved: 23,
    easySolved: 19,
    mediumSolved: 4,
    hardSolved: 0,
    streak: 6,
    totalActiveDays: 15,
    platforms: [
      { name: 'LeetCode', active: true, solved: 23, url: `https://leetcode.com/u/${LEETCODE_USERNAME}/` },
      { name: 'GeeksforGeeks', active: false, statusText: 'Coming soon', solved: 0, url: 'https://www.geeksforgeeks.org/' }
    ]
  }
};

export default async function handler(req, res) {
  // Enable CORS
  if (res && res.setHeader) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  }

  if (req && req.method === 'OPTIONS') {
    if (res && res.status) return res.status(200).end();
    return;
  }

  const now = Date.now();
  if (now - cachedData.timestamp < CACHE_TTL_MS && cachedData.data) {
    if (res && res.json) return res.status(200).json({ source: 'cache', ...cachedData.data });
    return cachedData.data;
  }

  const graphqlQuery = {
    query: `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
              submissions
            }
          }
          userCalendar {
            activeYears
            streak
            totalActiveDays
            submissionCalendar
          }
        }
      }
    `,
    variables: { username: LEETCODE_USERNAME }
  };

  try {
    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com/'
      },
      body: JSON.stringify(graphqlQuery)
    });

    if (!response.ok) {
      throw new Error(`LeetCode GraphQL error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const user = result?.data?.matchedUser;

    if (!user) {
      throw new Error('Matched user not found in LeetCode response');
    }

    const acStats = user.submitStatsGlobal?.acSubmissionNum || [];
    const allStat = acStats.find(s => s.difficulty === 'All') || { count: 0 };
    const easyStat = acStats.find(s => s.difficulty === 'Easy') || { count: 0 };
    const mediumStat = acStats.find(s => s.difficulty === 'Medium') || { count: 0 };
    const hardStat = acStats.find(s => s.difficulty === 'Hard') || { count: 0 };

    const calendar = user.userCalendar || {};
    const streak = calendar.streak || 0;
    const totalActiveDays = calendar.totalActiveDays || 0;

    const payload = {
      username: user.username || LEETCODE_USERNAME,
      totalSolved: allStat.count,
      easySolved: easyStat.count,
      mediumSolved: mediumStat.count,
      hardSolved: hardStat.count,
      streak: streak,
      totalActiveDays: totalActiveDays,
      platforms: [
        { name: 'LeetCode', active: true, solved: allStat.count, url: `https://leetcode.com/u/${LEETCODE_USERNAME}/` },
        { name: 'GeeksforGeeks', active: false, statusText: 'Coming soon', solved: 0, url: 'https://www.geeksforgeeks.org/' }
      ]
    };

    cachedData = {
      timestamp: now,
      data: payload
    };

    if (res && res.json) {
      return res.status(200).json({ source: 'live', ...payload });
    }
    return payload;
  } catch (err) {
    console.error('Failed to fetch live LeetCode stats:', err.message);
    if (res && res.json) {
      return res.status(200).json({ source: 'fallback', ...cachedData.data });
    }
    return cachedData.data;
  }
}
