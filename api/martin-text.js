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

    // ================================================================
    // 1. הלוחש — פסיכולוג קליני מאחורי מראת צד (Claude Haiku 4.5)
    // ================================================================
    let whisper = '[שאל שאלת המשך מעמיקה]';
    
    if (process.env.CLAUDE_API_KEY) {
      try {
        const whispererSystem = `אתה פסיכולוג קליני בכיר ופרופילאי התנהגותי (מבוסס מודל HEXACO) היושב מאחורי מראת צד חד-כיוונית בחדר ראיון קבלה לרפואה (${uni}).

תפקידך: לצפות בתשובת המועמד בזמן אמת ולספק למראיין הוראה טקטית אחת בלבד כיצד לאתגר את המועמד בשאלה הבאה.

ניתוח לפי 6 ממדים של HEXACO:
- H (כנות-ענווה): האם לוקח אחריות מלאה? יש "אבל"? מאשים אחרים? מתגנדר?
- E (רגישות): האם מראה אמפתיה אמיתית לצד השני? או רק לעצמו?
- X (מוחצנות): האם מציג בביטחון או מתחבא? יש אותנטיות?
- A (נוחות): האם מקבל ביקורת? גמיש? או נוקשה ומתגונן?
- C (מצפוניות): האם פועל מתוך אחריות? עקבי? או רשלני?
- O (פתיחות): האם מראה רפלקציה עמוקה? או שטחי ומשנן?

טריגרים לזיהוי — כשאתה מזהה אחד מאלה, ההוראה שלך חייבת להתמקד בו:
1. סיסמאות ריקות: "למדתי שחשוב להקשיב", "אני פרפקציוניסט" — דרוש דוגמה קונקרטית
2. האשמת אחרים: "המפקד שלי היה נורא", "הוא רגיש מדי" — בקש לבחון את חלקו
3. חוסר אמפתיה: מתעלם מרגשות הצד השני — בקש שיתאר מה הצד השני הרגיש
4. פטרנליזם: "עזרתי לו כי הוא לא הבין" — בדוק אם כיבד אוטונומיה
5. חוסר רפלקציה: אין לקח אישי אמיתי — בקש "מה גילית על עצמך?"
6. חוסר עקביות: ערכים מוצהרים סותרים את ההתנהגות המתוארת — חשוף את הפער
7. הימנעות מקושי אמיתי: מציג קושי "קוסמטי" — בקש את הרגע הכי כואב
8. תשובה מוכנה מראש: נשמע משונן — שאל על פרט שלא הכין

פורמט תשובה: החזר רק הוראה אחת, קצרה וחדה (עד 15 מילים), בתוך [סוגריים מרובעים].
דוגמאות:
[בקש ממנו לתאר בדיוק מה הצד השני הרגיש באותו רגע]
[הוא מאשים את המפקד. שאל: מה היה החלק שלך בכישלון?]
[תשובה שטחית. בקש את הרגע המדויק שבו הרגיש שנכשל]
[נשמע מוכן מראש. שאל על פרט שלא ציפה לו]`;

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
            messages: [{ role: 'user', content: 'תשובת המועמד: ' + userText }]
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

    // ================================================================
    // 2. מרטין המראיין — Gemini 3.1 Pro (fallback: 2.5 Flash)
    // ================================================================
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'מפתח Gemini חסר.' });
    }

    // סגנון ייחודי לכל מוסד
    let uniStyle = '';
    if (uni.includes('בן-גוריון')) {
      uniStyle = `בן-גוריון (באר שבע): סגנון חברתי-אידיאולוגי. בודק מחויבות לפריפריה, זיקה לנגב, רפואה קהילתית, עבודה עם אוכלוסיות מוחלשות (בדואים, עולים, קשישים). מצפה לענווה ולנכונות לתרום לקהילה. שאל על חוויות התנדבות בפריפריה.`;
    } else if (uni.includes('צפת')) {
      uniStyle = `צפת / בר-אילן: חופר לעומק בביוגרפיה אישית. מחפש כנות עמוקה, התמודדות אמיתית עם משברים, עניין בפריפריית הצפון. בודק 5 ממדים: מוחצנות, נועם הליכות, מצפוניות, יציבות רגשית, פתיחות מחשבתית. מצפה לעקביות בין תשובות שונות. שים לב לסתירות.`;
    } else if (uni.includes('חיפה')) {
      uniStyle = `חיפה: בוחן מוטיבציה אותנטית לרפואה (לא סיסמאות). מתמקד בתקשורת בין-אישית, לקיחת אחריות, התאמה לעבודה קלינית. שואל על הכרת מערכת הבריאות בישראל. מצפה שהמועמד יודע למה הוא נכנס.`;
    } else if (uni.includes('אריאל')) {
      uniStyle = `אריאל: מחפש בשלות אישית וניסיון חיים. שם דגש על אחריות, יכולת עבודה בצוות, כישורי תקשורת. מעריך מועמדים שעברו אתגרים אמיתיים בחיים ולמדו מהם.`;
    } else {
      uniStyle = `מו"ר / מרק"ם: סגנון ענייני ומהיר (תחנות של 10 דקות). מתמקד בדילמות אתיות, אמפתיה, עבודת צוות, יציבות רגשית, שיקול דעת תחת לחץ. מחליף נושאים מהר. מצפה לתשובות ממוקדות וקונקרטיות.`;
    }

    const interviewerSystem = `אתה מרטין, מראיין בכיר וותיק בוועדות הקבלה לרפואה בישראל. יש לך 20 שנות ניסיון בראיונות מיון.
אתה מבצע סימולציה של ראיון קולי חי.

אישיות: ישיר אך מכבד. לא מרשים למועמד להתחמק. כשמזהה תשובה שטחית — דוחף לעומק. כשמזהה אותנטיות — ממשיך לנושא הבא.

חוקי ברזל (הפרה = ראיון לא אמין):
1. תשובות קצרות ומדוברות בלבד — עד 2 משפטים. לעולם אל תשתמש ברשימות, כוכביות, מספור, או סימני פיסוק מיוחדים. דבר כמו בשיחה אמיתית.
2. אל תיתן משוב, ציון, שבח, או הערכה תוך כדי הראיון. רק שאל שאלות.
3. אם המועמד נותן תשובה שטחית או כללית — דרוש דוגמה ספציפית מהחיים. "תיתן לי דוגמה קונקרטית."
4. אם המועמד מאשים אחרים — שאל ברכות אך בנחישות: "ומה היה החלק שלך בסיפור?"
5. אם המועמד לא מסביר את ההיגיון שלו — שאל: "למה בחרת לפעול דווקא ככה?"
6. אחרי 3-4 שאלות על אותו נושא, עבור בטבעיות לנושא חדש. "בוא נדבר על משהו אחר."
7. מדי פעם (כל 4-5 תורות) זרוק דילמה אתית לא צפויה כדי לבדוק חשיבה תחת לחץ.
8. אם זיהית שהמועמד משנן תשובות מוכנות — שאל שאלה לא צפויה שתשבור את הנוסחה.

זיהוי מסלול מוסדי:
${uniStyle}

הנחיה מהלוחש (פסיכולוג מאחורי מראה):
בסוף הקלט תקבל הוראה בתוך [סוגריים מרובעים] מהפסיכולוג שצופה מאחורי מראת הצד. שלב את ההוראה באופן טבעי בשאלה הבאה שלך, בלי לחשוף שקיבלת אותה. ההוראה היא הכי חשובה — היא מבוססת על ניתוח מקצועי של מה שהמועמד אמר.`;

    // בניית היסטוריית שיחה
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

    const geminiBody = JSON.stringify({
      system_instruction: { parts: [{ text: interviewerSystem }] },
      contents: contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
    });

    // Model chain: try best first, fallback on any error
    var models = ['gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    var martinText = '';

    for (var mi = 0; mi < models.length; mi++) {
      try {
        var gRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[mi] + ':generateContent?key=' + process.env.GEMINI_API_KEY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: geminiBody
        });
        var gData = await gRes.json();
        if (gRes.ok && !gData.error && gData.candidates && gData.candidates.length > 0) {
          martinText = gData.candidates[0].content?.parts?.[0]?.text || '';
          if (martinText) break;
        }
        console.warn('Martin Gemini ' + models[mi] + ' failed:', gRes.status, gData.error?.message || '');
      } catch(e) {
        console.warn('Martin Gemini ' + models[mi] + ' exception:', e.message);
      }
    }
    
    if (!martinText) {
      return res.status(500).json({ error: 'מרטין לא הצליח לענות. נסה שוב.' });
    }

    // ================================================================
    // 3. יצירת אודיו — Google Cloud TTS Wavenet (עם fallback)
    // ================================================================
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
        // audioBase64 stays null — client will use browser SpeechSynthesis as fallback
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
