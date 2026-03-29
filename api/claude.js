export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured in Vercel env vars' });
  }

  try {
    var body = req.body;
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: body.system || '',
        messages: [{ role: 'user', content: body.prompt || '' }]
      })
    });

    var data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}