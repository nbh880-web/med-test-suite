export default function handler(req, res) {
  res.status(200).json({
    GEMINI: process.env.GEMINI_API_KEY || null,
    CLAUDE: process.env.CLAUDE_API_KEY || null,
    GPT: process.env.GPT_API_KEY || null,
    FIREBASE: process.env.FIREBASE_API_KEY || null
  });
}