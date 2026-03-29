import textToSpeech from '@google-cloud/text-to-speech';

const ttsClient = new textToSpeech.TextToSpeechClient({ 
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  }
});

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64, chatHistory, uni } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'No audio provided' });

    const audioBuffer = Buffer.from(audioBase64, 'base64');

    const sttRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: audioBuffer
    });
    const sttData = await sttRes.json();
    const userSpeech = sttData.results?.channels[0]?.alternatives[0]?.transcript || '';

    if (!userSpeech) return res.status(400).json({ error: "לא שמעתי, נסה שוב." });

    const systemInstruction = `
אתה מראיין בכיר בוועדות הקבלה לרפואה בישראל (${uni}).
חוקי ברזל:
1. התשובות שלך חייבות להיות קצרות ומדוברות (עד 2 משפטים). אין להשתמש ברשימות.
2. תן למועמד לדבר, אל תיתן משוב תוך כדי הראיון.
3. הלוחש: עליך לזהות התחמקויות, סיסמאות ריקות או חוסר ענווה (HEXACO). אם עולה כזה, אתגר את המועמד בשאלה הבאה.
`;

    const contents = chatHistory.map(msg => ({
      role: msg.role === 'martin' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userSpeech }] });

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: contents,
        generationConfig: { temperature: 0.6 }
      })
    });
    const geminiData = await geminiRes.json();
    const martinText = geminiData.candidates[0].content.parts[0].text;

    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: martinText },
      voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
    });

    res.status(200).json({
      userText: userSpeech,
      martinText: martinText,
      audioBase64: ttsResponse.audioContent.toString('base64')
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}