import textToSpeech from '@google-cloud/text-to-speech';

let ttsClient = null;
try {
  ttsClient = new textToSpeech.TextToSpeechClient({ 
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }
  });
} catch(e) {}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'No' });
  
  try {
    var text = req.body.text;
    if (!text || !ttsClient) {
      return res.status(400).json({ audioBase64: null });
    }

    var [response] = await ttsClient.synthesizeSpeech({
      input: { text: text },
      voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
    });

    res.status(200).json({ audioBase64: response.audioContent.toString('base64') });
  } catch (e) {
    console.error('TTS error:', e.message);
    res.status(200).json({ audioBase64: null });
  }
}