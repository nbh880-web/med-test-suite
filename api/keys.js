export default function handler(req, res) {
  // Return API keys to frontend
  // Names must match EXACTLY what's in Vercel Environment Variables
  res.status(200).json({
    CLAUDE: process.env.CLAUDE_API_KEY || null,
    GEMINI: process.env.GEMINI_API_KEY || null,
    FIREBASE: process.env.FIREBASE_API_KEY || null,
    GPT: process.env.GPT_API_KEY || null
  });
}
