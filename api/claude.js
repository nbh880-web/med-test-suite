export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
  }

  try {
    var body = req.body;

    // Sonnet 4 - fast (3-5 seconds), fits in Vercel 10s timeout
    // Opus 4.6 needs 15-30 seconds = too slow for Vercel Hobby
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: body.system || '',
        messages: [{ role: 'user', content: body.prompt || '' }]
      })
    });

    var data = await response.json();

    if (response.ok && data.content && data.content.length > 0) {
      return res.status(200).json(data);
    }

    var errMsg = data.error ? (typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)) : 'Unknown';
    return res.status(500).json({ error: errMsg });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
