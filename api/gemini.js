export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // תופס את המפתח בכל מקרה, בלי קשר לאיך שכתבת אותו ב-Vercel
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_KEY;
  const { prompt, system } = req.body;

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is missing in Vercel Environment Variables.' });
  }

  try {
    // חובה להשתמש במחרוזת הזו מול ה-API של גוגל
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    });

    const data = await response.json();
    
    // אם גוגל החזירה שגיאה (למשל מפתח שגוי או מודל לא תקין)
    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }
    
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to Google API: ' + error.message });
  }
}