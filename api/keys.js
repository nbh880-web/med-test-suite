export default function handler(req, res) {
  res.status(200).json({
    FIREBASE: process.env.FIREBASE_API_KEY || "",
    // Vercel לפעמים הופך הכל לאותיות גדולות, אז הוספתי את שתי האפשרויות כדי שנהיה מכוסים:
    GEMINI: process.env.Gemini_API_KEY || process.env.GEMINI_API_KEY || "",
    CLAUDE: process.env.CLAUDE_API_KEY || "",
    // הכנה לעתיד, כשתוסיף את המפתח הזה לכספת זה פשוט יתחיל לעבוד:
    GPT: process.env.GPT_API_KEY || "" 
  });
}