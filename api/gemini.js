export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // תמיכה בשני סוגי הכתיבה ב-Vercel
  const apiKey = process.env.Gemini_API_KEY || process.env.GEMINI_API_KEY;
  const { prompt, system } = req.body;

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key missing in Vercel' });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        }
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to Gemini', details: error.message });
  }
}