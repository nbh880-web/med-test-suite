export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (!process.env.DEEPGRAM_API_KEY) {
    return res.status(500).json({ error: 'DEEPGRAM_API_KEY not configured' });
  }

  try {
    // Read raw body - compatible with Vercel serverless
    const audioBuffer = await new Promise(function(resolve, reject) {
      var chunks = [];
      req.on('data', function(chunk) { chunks.push(chunk); });
      req.on('end', function() { resolve(Buffer.concat(chunks)); });
      req.on('error', function(err) { reject(err); });
    });

    if (!audioBuffer || audioBuffer.length < 1000) {
      return res.status(400).json({ error: 'Audio too short', transcript: '' });
    }

    // Send to Deepgram - let it auto-detect format
    var contentType = req.headers['content-type'] || 'audio/webm';
    
    // iOS Safari sends audio/mp4, Chrome sends audio/webm
    // Deepgram handles both, but we clean up the content type
    if (contentType.includes('mp4')) contentType = 'audio/mp4';
    else if (contentType.includes('webm')) contentType = 'audio/webm';
    else if (contentType.includes('ogg')) contentType = 'audio/ogg';
    else contentType = 'audio/webm';

    var response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=he&mip_opt_out=true', {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY,
        'Content-Type': 'application/octet-stream', // הפתרון הסופי לבעיית הפורמטים
      },
      body: audioBuffer,
    });
    
    if (!response.ok) {
      var errBody = '';
      try { errBody = await response.text(); } catch(e) {}
      console.error('Deepgram error:', response.status, errBody);
      return res.status(response.status).json({ error: 'Deepgram error: ' + response.status, details: errBody, transcript: '' });
    }

    var result = await response.json();
    var transcript = (result.results && result.results.channels && result.results.channels[0] && result.results.channels[0].alternatives && result.results.channels[0].alternatives[0] && result.results.channels[0].alternatives[0].transcript) || '';
    
    res.status(200).json({ transcript: transcript });
  } catch (error) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: error.message, transcript: '' });
  }
}