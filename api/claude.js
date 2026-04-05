// Edge Runtime = 30 second timeout (instead of 10s for serverless)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  const KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) {
    return new Response(JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    if (!body.prompt) {
      return new Response(JSON.stringify({ error: 'No prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Try Opus 4.6 first, fallback to Sonnet 4
    const models = ['claude-opus-4-6', 'claude-sonnet-4-20250514'];

    for (let i = 0; i < models.length; i++) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
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

        const data = await response.json();

        if (response.ok && data.content && data.content.length > 0) {
          return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        console.warn('Claude ' + models[i] + ' failed:', response.status);
      } catch (e) {
        console.warn('Claude ' + models[i] + ' error:', e.message);
      }
    }

    return new Response(JSON.stringify({ error: 'Claude failed for all models' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
