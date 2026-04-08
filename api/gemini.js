export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  var body = req.body;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is missing.' });
  }
  var reqBody = JSON.stringify({
    system_instruction: { parts: [{ text: body.system }] },
    contents: [{ parts: [{ text: body.prompt }] }],
    generationConfig: { temperature: 0.3 }
  });

  // Model chain: 3.1 Pro best, 2.0 Flash fast fallback
  // NOTE: 2.5 Flash removed - it's a "thinking" model that takes 30-60s and causes timeout
  var models = ['gemini-3.1-pro-preview', 'gemini-2.0-flash'];

  for (var i = 0; i < models.length; i++) {
    try {
      var response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: reqBody
      });
      var data = await response.json();
      if (response.ok && !data.error && data.candidates && data.candidates.length > 0) {
        return res.status(200).json(data);
      }
      console.warn('Gemini ' + models[i] + ' failed:', response.status, data.error?.message || '');
    } catch (e) {
      console.warn('Gemini ' + models[i] + ' exception:', e.message);
    }
  }

  return res.status(500).json({ error: 'All Gemini models failed.' });
}
