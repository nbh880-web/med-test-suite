export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = [];
    for await (const chunk of req) {
      data.push(chunk);
    }
    const audioBuffer = Buffer.concat(data);

    // אנחנו לוקחים את הפורמט המדויק שהמכשיר (אייפון/מחשב) יצר
    const clientContentType = req.headers['content-type'] || 'audio/webm';

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': clientContentType // זה מה שיסדר את שגיאה 400 באייפון!
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Deepgram error:', errorData);
      return res.status(response.status).json({ error: 'Deepgram API error', details: errorData });
    }

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    res.status(200).json({ transcript });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}