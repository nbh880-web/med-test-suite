import textToSpeech from '@google-cloud/text-to-speech';

// משיכת המפתחות בצורה בטוחה (נשק יום הדין)
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

    // 1. פענוח האודיו
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // 2. תמלול דרך Deepgram (תומך בכל הפורמטים, כולל אייפון)
    const sttRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`
      },
      body: audioBuffer
    });
    
    const sttData = await sttRes.json();
    if (sttData.err_code) {
        return res.status(400).json({ error: `Deepgram Error: ${sttData.err_msg}` });
    }

    const userSpeech = sttData.results?.channels[0]?.alternatives[0]?.transcript || '';
    if (!userSpeech) return res.status(400).json({ error: "לא שמעתי, נסה שוב." });

    // 3. הגדרת ה"מוח" לפי סוג האוניברסיטה
    let systemInstruction = "";

    if (uni.includes('בן-גוריון')) {
      systemInstruction = `
אתה מראיין בכיר בוועדת הקבלה לרפואה של אוניברסיטת בן-גוריון. הראיון הוא אישי, ביוגרפי, עמוק וחודרני.
חוקי ברזל:
1. התשובות שלך חייבות להיות קצרות, ממוקדות ומדוברות (עד 2-3 משפטים). בלי רשימות ממוספרות.
2. המטרה שלך היא "לקלף" את המועמד: שאל על חולשות אמיתיות, כישלונות כואבים, ואירועים מעצבי חיים. אל תסתפק בתשובות בנאליות.
3. הלוחש (פנימי): חפש ענווה, כנות ורפלקציה עצמית (מודל HEXACO). אם המועמד עונה בסיסמאות ("אני פרפקציוניסט"), קטע אותו בעדינות ואתגר אותו לתת דוגמה אמיתית וחשופה.
`;
    } else if (uni.includes('צפת') || uni.includes('בר-אילן')) {
      systemInstruction = `
אתה מראיין בכיר בוועדת הקבלה לרפואה של הפקולטה בצפת (בר-אילן). הראיון בוחן התאמה לחזון הפקולטה ולעבודת שטח.
חוקי ברזל:
1. התשובות שלך חייבות להיות קצרות ומדוברות (עד 2-3 משפטים). שפה טבעית וזורמת.
2. המיקוד: רפואה בפריפריה, מודעות חברתית, יכולת עבודה בצוות תחת לחץ, והכלה של אוכלוסיות מגוונות. 
3. הלוחש (פנימי): נסה להבין האם המועמד באמת מבין את המשמעות של עבודה בפריפריה או שהוא רק זורק סיסמאות. שאל שאלות המשך שדורשות מודעות חברתית וראייה מערכתית.
`;
    } else {
      // ברירת מחדל: מו"ר / מרק"ם
      systemInstruction = `
אתה מראיין במבחני מו"ר ומרק"ם לקבלה לרפואה. הראיון בוחן דילמות אתיות, מוסר, אמפתיה ותקשורת בין-אישית.
חוקי ברזל:
1. התשובות שלך חייבות להיות קצרות, מדויקות ובשפת דיבור (עד 2 משפטים). אין להשתמש ברשימות.
2. הצג דילמות מוסריות, קונפליקטים מול קולגות או מטופלים, ובחן את היכולת של המועמד לראות את שני צידי המטבע.
3. הלוחש (פנימי): בדוק אם המועמד שיפוטי, קיצוני בתגובותיו או חסר אמפתיה. אם הוא ממהר לשפוט, אתגר אותו ("ואם המטופל היה מסרב לקבל את הטיפול בגלל אמונה דתית, מה היית עושה?").
`;
    }
    
    // 4. בניית היסטוריית השיחה ושליחה ל-Gemini
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

    // 5. הקראת התשובה דרך גוגל TTS (קול ישראלי Wavenet-B)
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: martinText },
      voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 }
    });

    // 6. שליחת התוצאות חזרה ל-Frontend
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