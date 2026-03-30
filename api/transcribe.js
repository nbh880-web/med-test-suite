export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64, mimeType } = req.body;
    
    if (!audioBase64) {
      return res.status(400).json({ error: 'לא התקבל קובץ מהמכשיר' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // התיקון: שינינו את המודל ל-nova-3 לפי הבקשה המפורשת של דיפגראם
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=he', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': mimeType || 'audio/mp4'
      },
      body: audioBuffer
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(400).json({ error: errText });
    }

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    res.status(200).json({ transcript });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}