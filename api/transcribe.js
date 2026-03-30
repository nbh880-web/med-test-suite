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

    // אנחנו מכריחים את Deepgram לקבל את הקובץ בלי קשר לשם הפורמט שהאייפון המציא
    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/*' 
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errData = await response.text();
      return res.status(response.status).json({ error: `Deepgram Error ${response.status}`, details: errData });
    }

    const result = await response.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    res.status(200).json({ transcript });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}