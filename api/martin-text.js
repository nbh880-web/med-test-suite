import textToSpeech from '@google-cloud/text-to-speech';

let ttsClient = null;
try {
  ttsClient = new textToSpeech.TextToSpeechClient({ 
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    }
  });
} catch(e) {
  console.error('TTS init failed:', e.message);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userText, chatHistory, uni } = req.body;
    
    if (!userText || userText.trim().length < 2) {
      return res.status(400).json({ error: 'לא התקבל טקסט.' });
    }

    // 1. הלוחש (Claude Haiku 4.5)
    let whisper = '[שאל שאלת המשך]';
    
    if (process.env.CLAUDE_API_KEY) {
      try {
        const wSys = 'אתה פסיכולוג קליני (HEXACO) מאחורי מראת צד בראיון קבלה לרפואה (' + uni + '). '
          + 'זהה התחמקויות, סיסמאות, האשמת אחרים, חוסר אמפתיה, פטרנליזם, חוסר עקביות. '
          + 'הוראה אחת, עד 15 מילים. פורמט: [סוגריים מרובעים].';

        const cRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: wSys,
            messages: [{ role: 'user', content: 'תשובת המועמד: ' + userText }]
          })
        });
        
        if (cRes.ok) {
          const cData = await cRes.json();
          whisper = cData.content[0].text;
        }
      } catch(e) {
        console.error('Claude whisper failed:', e.message);
      }
    }

    // 2. מרטין (Gemini 3.1 Pro)
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'מפתח Gemini חסר.' });
    }

    let uniStyle = '';
    if (uni.includes('בן-גוריון')) uniStyle = 'בן-גוריון: חברתי, אידיאולוגיה, פריפריה, קהילה.';
    else if (uni.includes('צפת')) uniStyle = 'צפת: ביוגרפיה עמוקה, כנות, משברים, פריפריה. 5 ממדים.';
    else if (uni.includes('חיפה')) uniStyle = 'חיפה: מוטיבציה, תקשורת, אחריות, קליניקה.';
    else if (uni.includes('אריאל')) uniStyle = 'אריאל: בשלות, ניסיון, תקשורת, צוות.';
    else uniStyle = 'מו"ר/מרק"ם: ענייני, דילמות, אמפתיה, צוות. 10 דקות.';

    const mSys = 'אתה מראיין בכיר בוועדות קבלה לרפואה. סימולציה קולית.\n'
      + '1. עד 2 משפטים. בלי רשימות.\n'
      + '2. בלי משוב או ציון.\n'
      + '3. אם שטחי - דרוש דוגמה.\n'
      + '4. אם מאשים - שאל: ומה החלק שלך?\n'
      + '5. אחרי 3-4 שאלות - עבור נושא.\n'
      + '6. מדי פעם - דילמה אתית.\n'
      + 'מסלול: ' + uniStyle + '\n'
      + 'הנחיית לוחש ב[סוגריים] - שלב בטבעיות.';

    const contents = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(function(m) {
        contents.push({
          role: m.role === 'martin' ? 'model' : 'user',
          parts: [{ text: m.text }]
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userText + '\n\nהוראת הלוחש: ' + whisper }]
    });

    const gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=' + process.env.GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: mSys }] },
        contents: contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    });

    if (!gRes.ok) {
      return res.status(500).json({ error: 'שגיאה ב-Gemini. קוד: ' + gRes.status });
    }

    const gData = await gRes.json();
    const martinText = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!martinText) {
      return res.status(500).json({ error: 'מרטין לא הצליח לענות.' });
    }

    // 3. TTS (עם fallback)
    let audioBase64 = null;
    
    if (ttsClient) {
      try {
        const [ttsRes] = await ttsClient.synthesizeSpeech({
          input: { text: martinText },
          voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
        });
        audioBase64 = ttsRes.audioContent.toString('base64');
      } catch(e) {
        console.error('TTS failed:', e.message);
      }
    }

    res.status(200).json({
      martinText: martinText,
      audioBase64: audioBase64,
      whisper: whisper
    });
  } catch (error) {
    console.error('Martin text error:', error);
    res.status(500).json({ error: error.message });
  }
}