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
  console.error('TTS client init failed:', e.message);
}

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64, chatHistory, uni, mimeType } = req.body;
    
    if (!audioBase64 || audioBase64.length < 100) {
      return res.status(400).json({ error: 'ההקלטה ריקה או קצרה מדי. דבר לפחות 3 שניות.' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    if (audioBuffer.length < 3000) {
      return res.status(400).json({ error: 'ההקלטה קצרה מדי. דבר לפחות 3 שניות ונסה שוב.' });
    }

    // 1. תמלול (Deepgram Nova-2)
    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ error: 'מפתח Deepgram לא מוגדר בשרת.' });
    }

    const contentType = mimeType || 'audio/webm';

    const sttRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: { 
        'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY,
        'Content-Type': contentType
      },
      body: audioBuffer
    });
    
    if (!sttRes.ok) {
      const errText = await sttRes.text();
      console.error('Deepgram error:', sttRes.status, errText);
      return res.status(400).json({ error: 'שגיאה בתמלול. קוד: ' + sttRes.status });
    }

    const sttData = await sttRes.json();
    const userSpeech = sttData.results?.channels[0]?.alternatives[0]?.transcript || '';
    
    if (!userSpeech || userSpeech.trim().length < 2) {
      return res.status(400).json({ error: 'לא הצלחתי לתמלל. ודא שדיברת בקול ברור לפחות 3 שניות.' });
    }

    // 2. הלוחש (Claude Haiku 4.5)
    let whisper = '[שאל שאלת המשך]';
    
    if (process.env.CLAUDE_API_KEY) {
      try {
        const whispererSystem = 'אתה פסיכולוג קליני ופרופילאי התנהגותי (HEXACO) מאחורי מראת צד בראיון קבלה לרפואה (' + uni + '). '
          + 'זהה התחמקויות, סיסמאות ריקות, תשובות משוננות, האשמת אחרים, חוסר אמפתיה, פטרנליזם, חוסר עקביות. '
          + 'ספק למראיין הוראה אחת, קצרה וחדה (עד 15 מילים). '
          + 'פורמט: החזר רק הוראה בתוך [סוגריים מרובעים].';

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: whispererSystem,
            messages: [{ role: 'user', content: 'תשובת המועמד: ' + userSpeech }]
          })
        });
        
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          whisper = claudeData.content[0].text;
        } else {
          console.error('Claude error:', claudeRes.status);
        }
      } catch(e) {
        console.error('Claude whisper failed:', e.message);
      }
    }

    // 3. מרטין המראיין (Gemini 3.1 Pro)
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'מפתח Gemini לא מוגדר.' });
    }

    let uniStyle = '';
    if (uni.includes('בן-גוריון')) uniStyle = 'בן-גוריון: סגנון חברתי, בודק אידיאולוגיה, זיקה לנגב ולפריפריה, מחויבות לקהילה ולאוכלוסיות מוחלשות.';
    else if (uni.includes('צפת')) uniStyle = 'בר-אילן/צפת: חופר ומעמיק בביוגרפיה, מחפש כנות עמוקה, התמודדות עם משברים, עניין בפריפריה. בודק: מוחצנות, נועם הליכות, מצפוניות, יציבות, פתיחות.';
    else if (uni.includes('חיפה')) uniStyle = 'חיפה: בוחן מוטיבציה אותנטית, תקשורת, אחריות, התאמה קלינית. שואל על הכרת מערכת הבריאות.';
    else if (uni.includes('אריאל')) uniStyle = 'אריאל: מחפש בשלות, ניסיון חיים, אחריות, תקשורת ועבודת צוות.';
    else uniStyle = 'מו"ר/מרק"ם: סגנון ענייני, מהיר, דילמות אתיות, אמפתיה, עבודת צוות, יציבות רגשית. תחנות 10 דקות.';

    const interviewerSystem = 'אתה מראיין בכיר בוועדות קבלה לרפואה בישראל. סימולציה קולית חיה.\n'
      + 'כללי ברזל:\n'
      + '1. תשובות קצרות ומדוברות (עד 2 משפטים). לעולם לא רשימות או מספור.\n'
      + '2. אל תיתן משוב או ציון תוך כדי. רק שאל והעמק.\n'
      + '3. אם שטחי, דרוש דוגמה ספציפית.\n'
      + '4. אם מאשים אחרים, שאל: ומה היה החלק שלך?\n'
      + '5. אחרי 3-4 שאלות על אותו נושא, עבור בטבעיות.\n'
      + '6. מדי פעם זרוק דילמה אתית.\n'
      + 'מסלול: ' + uniStyle + '\n'
      + 'הנחיה מהלוחש: בסוף הקלט הוראה ב[סוגריים] מהפסיכולוג. שלב בטבעיות בלי לחשוף.';

    const geminiContents = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(function(m) {
        geminiContents.push({
          role: m.role === 'martin' ? 'model' : 'user',
          parts: [{ text: m.text }]
        });
      });
    }
    geminiContents.push({
      role: 'user',
      parts: [{ text: userSpeech + '\n\nהוראת הלוחש: ' + whisper }]
    });

    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=' + process.env.GEMINI_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: interviewerSystem }] },
        contents: geminiContents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errText);
      return res.status(500).json({ error: 'שגיאה ביצירת תשובת מרטין. קוד: ' + geminiRes.status });
    }

    const geminiData = await geminiRes.json();
    const martinText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!martinText) {
      return res.status(500).json({ error: 'מרטין לא הצליח לענות. נסה שוב.' });
    }

    // 4. יצירת אודיו (Google Cloud TTS) - עם fallback
    let audioBase64Output = null;
    
    if (ttsClient) {
      try {
        const [ttsResponse] = await ttsClient.synthesizeSpeech({
          input: { text: martinText },
          voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
        });
        audioBase64Output = ttsResponse.audioContent.toString('base64');
      } catch(e) {
        console.error('TTS failed:', e.message);
        // audioBase64Output stays null - client will use browser SpeechSynthesis as fallback
      }
    } else {
      console.warn('TTS client not available - client will use browser fallback');
    }

    res.status(200).json({
      userText: userSpeech,
      martinText: martinText,
      audioBase64: audioBase64Output,
      whisper: whisper
    });
  } catch (error) {
    console.error('Martin voice error:', error);
    res.status(500).json({ error: 'שגיאה כללית: ' + error.message });
  }
}