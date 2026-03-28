export default function handler(req, res) {
  res.status(200).json({
    FIREBASE: process.env.FIREBASE_API_KEY || "",
    GEMINI: process.env.Gemini_API_KEY || "",
    CLAUDE: process.env.CLAUDE_API_KEY || "",
    GPT: process.env.GPT_API_KEY || ""
  });
}