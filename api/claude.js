export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) {
    console.error('CLAUDE_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured. Add it in Vercel Settings > Environment Variables.' });
  }

  // Log key prefix for debugging (safe - only first 8 chars)
  console.log('Claude API key starts with:', KEY.substring(0, 8) + '...');

  var body = req.body;
  if (!body.prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  var models = ['claude-opus-4-6', 'claude-sonnet-4-20250514'];

  for (var i = 0; i < models.length; i++) {
    try {
      console.log('Trying Claude model:', models[i]);
      
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
          messages: [{ role: 'user', content: body.prompt }]
        })
      });

      var data = await response.json();

      console.log('Claude', models[i], 'response status:', response.status);

      if (response.ok && data.content && data.content.length > 0) {
        console.log('Claude', models[i], 'SUCCESS');
        return res.status(200).json(data);
      }

      // Log the error
      var errMsg = data.error ? (typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)) : 'Unknown error';
      console.error('Claude', models[i], 'failed:', response.status, errMsg);
      
    } catch (e) {
      console.error('Claude', models[i], 'exception:', e.message);
    }
  }

  return res.status(500).json({ error: 'Claude API failed for all models. Verify CLAUDE_API_KEY is correct in Vercel.' });
}
