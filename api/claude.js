export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured in Vercel' });
  }

  var body = req.body;
  var models = ['claude-opus-4-6', 'claude-sonnet-4-20250514'];

  for (var i = 0; i < models.length; i++) {
    try {
      var response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: models[i],
          max_tokens: 2000,
          system: body.system || '',
          messages: [{ role: 'user', content: body.prompt || '' }]
        })
      });

      var data = await response.json();

      // Check if Claude returned successfully
      if (response.ok && data.content && data.content.length > 0) {
        return res.status(200).json(data);
      }

      // Log error and try next model
      var errMsg = data.error ? (data.error.message || JSON.stringify(data.error)) : 'Unknown error';
      console.warn('Claude ' + models[i] + ' failed:', response.status, errMsg);
    } catch (e) {
      console.warn('Claude ' + models[i] + ' exception:', e.message);
    }
  }

  // All models failed
  return res.status(500).json({ error: 'Claude API failed. Check CLAUDE_API_KEY in Vercel.' });
}
