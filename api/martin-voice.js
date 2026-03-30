import textToSpeech from '@google-cloud/text-to-speech';

const ttsClient = new textToSpeech.TextToSpeechClient({ 
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  }
});

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64, chatHistory, uni } = req.body;
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // 1. תמלול (Deepgram Nova-2)
    const sttRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}` },
      body: audioBuffer
    });
    const sttData = await sttRes.json();
    const userSpeech = sttData.results?.channels[0]?.alternatives[0]?.transcript || '';
    if (!userSpeech) return res.status(400).json({ error: "לא שמעתי, נסה שוב." });

    // 2. הלוחש (Claude Haiku 4.5 - מהיר וזול לניתוח קצר)
    const whispererSystem = `
אתה פסיכולוג קליני ופרופילאי התנהגותי (מבוסס מודל HEXACO) היושב מאחורי מראת צד בראיון קבלה לרפואה (${uni}). 
תפקידך לזהות התחמקויות, סיסמאות ריקות, או תשובות משוננות.
משימה: ספק למראיין הוראה אחת בלבד, קצרה וחדה (עד 15 מילים), כיצד לאתגר את המועמד בשאלה הבאה.
טריגרים: ענווה ויושרה (HEXACO), רפלקציה (מה למד?), שבלוניות ("פרפקציוניסט"), האשמת אחרים, חוסר אמפתיה.
זהה גם: פטרנליזם, הימנעות מאחריות, תשובות כלליות ללא דוגמה ספציפית, חוסר עקביות.
פורמט: החזר רק הוראה בתוך [סוגריים מרובעים].
`;

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
        messages: [{ role: 'user', content: `תשובת המועמד: ${userSpeech}` }]
      })
    });
    const claudeData = await claudeRes.json();
    const whisper = claudeData.content[0].text;

    // 3. מרטין המראיין (Gemini 3.1 Pro - החכם ביותר)
    let uniStyle = "";
    if (uni.includes('בן-גוריון')) uniStyle = "בן-גוריון: סגנון חברתי, בודק אידיאולוגיה, זיקה לנגב ולפריפריה, ומחויבות לקהילה. דגש על רפואה קהילתית ואוכלוסיות מוחלשות.";
    else if (uni.includes('צפת')) uniStyle = "בר-אילן/צפת: חופר ומעמיק בביוגרפיה, מחפש כנות עמוקה, התמודדות עם משברים, ועניין בפריפריה. בודק 5 ממדים: מוחצנות, נועם הליכות, מצפוניות, יציבות רגשית, פתיחות.";
    else if (uni.includes('חיפה')) uniStyle = "חיפה: בוחן מוטיבציה אותנטית, תקשורת, אחריות, והתאמה לעבודה קלינית. שואל על הכרת מערכת הבריאות.";
    else if (uni.includes('אריאל')) uniStyle = "אריאל: מחפש בשלות, ניסיון חיים, אחריות, כישורי תקשורת ועבודה בצוות.";
    else uniStyle = "מו\"ר/מרק\"ם: סגנון ענייני, מהיר, מתמקד בדילמות אתיות, אמפתיה, עבודת צוות, ויציבות רגשית. תחנות של 10 דקות.";

    const interviewerSystem = `
אתה מראיין בכיר בוועדות הקבלה לרפואה בישראל. אתה מבצע סימולציה קולית חיה.
חוקי ברזל לקול:
1. תשובות קצרות ומדוברות (עד 2 משפטים). לעולם אל תשתמש ברשימות, כוכביות או מספור.
2. אל תיתן משוב או ציון תוך כדי הראיון. רק שאל והעמק.
3. אם המועמד נותן תשובה שטחית, דרוש דוגמה ספציפית.
4. אם המועמד מאשים אחרים, שאל: "ומה היה החלק שלך בזה?"
5. אחרי 3-4 שאלות על אותו נושא, עבור לנושא חדש בטבעיות.
6. מדי פעם זרוק דילמה אתית לא צפויה.
זיהוי מסלול: ${uniStyle}
הנחיה מהלוחש: בסוף הקלט תקבל הוראה בתוך [סוגריים מרובעים] מהפסיכולוג בחדר. שלב אותה באופן טבעי בשאלה הבאה בלי לחשוף שקיבלת אותה.
`;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: interviewerSystem }] },
        contents: [
          ...chatHistory.map(m => ({ role: m.role === 'martin' ? 'model' : 'user', parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: `${userSpeech}\n\nהוראת הלוחש: ${whisper}` }] }
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
      })
    });
    const geminiData = await geminiRes.json();
    const martinText = geminiData.candidates[0].content.parts[0].text;

    // 4. יצירת אודיו (Google Cloud TTS)
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: martinText },
      voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
    });

    res.status(200).json({
      userText: userSpeech,
      martinText: martinText,
      audioBase64: ttsResponse.audioContent.toString('base64'),
      whisper: whisper
    });
  } catch (error) {
    console.error('Martin API error:', error);
    res.status(500).json({ error: error.message });
  }
}