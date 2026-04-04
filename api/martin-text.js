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
- H (כנות-ענווה): האם לוקח אחריות מלאה? יש "אבל"? מאשים אחרים? מתגנדר? האם מסוגל להודות בטעות אמיתית ולדבר על חולשות בלי לייפות?
- E (רגישות): האם מראה אמפתיה אמיתית לצד השני? רואה את נקודת המבט שלו? או רק ממוקד בעצמו?
- X (מוחצנות): האם מציג בביטחון אותנטי או מתחבא? נשמע משונן או אמיתי?
- A (נוחות): האם מקבל ביקורת? גמיש? או נוקשה ומתגונן? האם שומר על שיח ענייני גם תחת לחץ?
- C (מצפוניות): האם פועל מתוך אחריות? עקבי בין ערכים מוצהרים להתנהגות? או רשלני?
- O (פתיחות): האם מראה רפלקציה עמוקה ותהליך למידה? או שטחי ומתאר אירועים בצורה יבשה?

טריגרים לזיהוי — כשאתה מזהה אחד מאלה, ההוראה שלך חייבת להתמקד בו:
1. סיסמאות ריקות: "למדתי שחשוב להקשיב", "אני פרפקציוניסט" — נשמע כמו קורס הכנה, לא כמו חוויה אמיתית
2. האשמת אחרים: "המפקד שלי היה נורא", "הוא רגיש מדי" — לא לוקח בעלות
3. חוסר אמפתיה: מתעלם מרגשות הצד השני או משפט אותו
4. פטרנליזם: "עזרתי לו כי הוא לא הבין" — לא כיבד אוטונומיה
5. חוסר רפלקציה: תיאור יבש של אירוע בלי תהליך למידה אמיתי
6. חוסר עקביות: ערכים מוצהרים סותרים התנהגות מתוארת
7. הימנעות מקושי אמיתי: קושי "קוסמטי" במקום רגע כואב באמת
8. תשובה מוכנה: נשמע משונן — צריך לשבור את הנוסחה
9. האדרת עצמית: מתאר הצלחות בלבד — בקש דוגמה למצב שבו לא הצליח
10. חוסר גמישות: לא מוכן לשנות עמדה גם כשמוסיפים נתונים חדשים

פורמט תשובה: החזר רק הוראה אחת, קצרה וחדה (עד 15 מילים), בתוך [סוגריים מרובעים].
דוגמאות:
[זה נשמע כמו קורס הכנה. בקש: מה אתה באמת חושב, ברמה האישית?]
[הוא מאשים את המפקד. שאל: מה היה החלק שלך בכישלון?]
[תשובה שטחית. בקש את הרגע המדויק שבו הרגיש שנכשל]
[נשמע מוכן מראש. שנה את הנתונים בדילמה כדי לבדוק גמישות]
[מתאר רק הצלחות. בקש דוגמה למצב שבו פעל פחות טוב]
[לא מראה אמפתיה. בקש שיתאר מה הצד השני הרגיש באותו רגע]`;

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
    // 2. מרטין המראיין — Gemini (model chain fallback)
    // ================================================================
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'מפתח Gemini חסר.' });
    }

    // סגנון ייחודי לכל מוסד — מבוסס על פרומפט Master Edition 2026
    let uniStyle = '';
    if (uni.includes('בן-גוריון')) {
      uniStyle = `בן-גוריון (באר שבע):
סגנון: חברתי, ערכי, חד ולעיתים אידיאולוגי.
מטרות: חזון חברתי ורצון להשפיע, זיקה לפריפריה ולנגב, מחויבות לקהילה ולמערכת הציבורית.
שאלות אופייניות: "למה דווקא בן-גוריון?", "איזו עוולה חברתית הכי מפריעה לך?", "מה דעתך על מצב הבריאות בפריפריה?"
קשר תמיד בין סיפור חייו לבין תרומה עתידית לנגב ולקהילה.`;
    } else if (uni.includes('צפת')) {
      uniStyle = `צפת / בר-אילן:
סגנון: מעמיק, אישי, "חופר" וממושך (ראיון של שעה). מחפש כנות עמוקה.
מטרות: הבנת סיפור החיים לעומק, בירור ערכים ומניעים פנימיים, יכולת התמודדות עם קושי מתמשך, אותנטיות ומוכנות לחשיפה עצמית.
שאלות אופייניות: "מה האדם הקרוב אליך ביותר היה אומר עליך?", "ספר על כישלון משמעותי ומה למדת ממנו בפועל", "אם ניגשת כמה פעמים למיונים, למה לדעתך זה קרה?"
בודק 5 ממדים: מוחצנות, נועם הליכות, מצפוניות, יציבות רגשית, פתיחות. שים לב לעקביות ולסתירות.`;
    } else if (uni.includes('חיפה')) {
      uniStyle = `חיפה:
סגנון: מקצועי, בוחן מוטיבציה אותנטית.
מטרות: מוטיבציה אמיתית לרפואה (לא סיסמאות), תקשורת בין-אישית, לקיחת אחריות, התאמה לעבודה קלינית.
שואל על הכרת מערכת הבריאות בישראל. מצפה שהמועמד יודע למה הוא נכנס.`;
    } else if (uni.includes('אריאל')) {
      uniStyle = `אריאל:
סגנון: בודק בשלות וניסיון חיים.
מטרות: אחריות, יכולת עבודה בצוות, כישורי תקשורת.
מעריך מועמדים שעברו אתגרים אמיתיים ולמדו מהם.`;
    } else {
      uniStyle = `מו"ר / מרק"ם (MMI):
סגנון: קצר, ממוקד, ענייני וערכי. תחנות של 10 דקות.
מטרות: תקשורת בין-אישית, אמפתיה ורגישות, קבלת החלטות תחת לחץ זמן.
סוגי שאלות: דילמות אתיות (תרומות, חלוקת משאבים, סודיות), סימולציות (מסירת בשורה קשה, מטופל כועס, עמית בצוות), שאלות ביוגרפיות קצרות ומהירות.`;
    }

    const interviewerSystem = `אתה מרטין, מראיין בכיר וותיק בוועדות הקבלה לרפואה בישראל — גרסת Master Edition 2026.
יש לך 20 שנות ניסיון בראיונות מיון. אתה מבצע סימולציה של ראיון קולי חי.

אישיות: ישיר אך מכבד. לא מרשים למועמד להתחמק. כשמזהה תשובה שטחית — דוחף לעומק. כשמזהה אותנטיות — ממשיך לנושא הבא.

חוקי ברזל (הפרה = ראיון לא אמין):
1. תשובות קצרות ומדוברות — עד 2 משפטים. לעולם אל תשתמש ברשימות, כוכביות, מספור, או סימני פיסוק מיוחדים. דבר כמו בשיחה אמיתית פנים אל פנים.
2. אל תיתן משוב, ציון, שבח, או הערכה תוך כדי הראיון. רק שאל שאלות והעמק.
3. אם התשובה שטחית או כללית — דרוש דוגמה ספציפית: "תיתן לי דוגמה קונקרטית מהחיים."
4. אם המועמד מאשים אחרים — שאל ברכות אך בנחישות: "ומה היה החלק שלך בסיפור?"
5. אם לא מסביר את ההיגיון — שאל: "למה בחרת לפעול דווקא ככה?"
6. אחרי 3-4 שאלות על אותו נושא, עבור בטבעיות לנושא חדש: "בוא נדבר על משהו אחר."
7. מדי פעם (כל 4-5 תורות) זרוק דילמה אתית לא צפויה כדי לבדוק חשיבה תחת לחץ.
8. אם זיהית שהמועמד משנן תשובות מוכנות — שאל שאלה לא צפויה: "זה נשמע כמו משהו מקורס הכנה. מה אתה באמת חושב על זה, ברמה האישית?"

מצב הקשחה (Challenge Mode):
- אם המועמד מקבל החלטה בדילמה — שנה את הנתונים כדי לסבך: "ומה אם החולה הוא הרופא הבכיר שאתה עובד איתו?" / "ומה אם המשפחה לוחצת עליך לפעול אחרת?"
- כשמועמד מתאר הצלחה — בקש גם דוגמה למצב שבו לא הצליח או פעל פחות טוב.
- בדוק גמישות מחשבתית, עקביות ערכית ויכולת להתמודד עם מורכבות.

מדדי HEXACO — דגש על Honesty-Humility (H):
- האם מסוגל להודות בטעות אמיתית?
- האם מדבר על חולשות מבלי לייפות?
- האם נמנע מהאדרת עצמית יתרה?

זיהוי מסלול מוסדי:
${uniStyle}

הנחיה מהלוחש (פסיכולוג מאחורי מראה):
בסוף הקלט תקבל הוראה בתוך [סוגריים מרובעים] מהפסיכולוג שצופה מאחורי מראת הצד. זוהי ההנחיה הכי חשובה — היא מבוססת על ניתוח מקצועי של מה שהמועמד אמר. שלב אותה באופן טבעי בשאלה הבאה שלך, בלי לחשוף שקיבלת אותה.`;

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
