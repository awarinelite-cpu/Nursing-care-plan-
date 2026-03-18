const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve the HTML file
app.use(express.static(path.join(__dirname, 'public')));

// ── AI Proxy Endpoint ──
app.post('/api/generate', async (req, res) => {
  const { diagnosis } = req.body;

  if (!diagnosis || typeof diagnosis !== 'string') {
    return res.status(400).json({ error: 'diagnosis is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const prompt = `You are an expert clinical nursing educator. Generate a complete NANDA-I compliant nursing care plan for the diagnosis: "${diagnosis}".

Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text. Use this exact structure:
{
  "relatedTo": "string describing etiology/related factors",
  "evidencedBy": ["sign or symptom 1", "sign or symptom 2", "sign or symptom 3", "sign or symptom 4"],
  "goals": [
    "SMART goal 1 with measurable timeframe",
    "SMART goal 2 with measurable timeframe",
    "SMART goal 3 with measurable timeframe"
  ],
  "interventions": [
    { "action": "specific nursing action 1", "rationale": "evidence-based rationale 1" },
    { "action": "specific nursing action 2", "rationale": "evidence-based rationale 2" },
    { "action": "specific nursing action 3", "rationale": "evidence-based rationale 3" },
    { "action": "specific nursing action 4", "rationale": "evidence-based rationale 4" },
    { "action": "specific nursing action 5", "rationale": "evidence-based rationale 5" },
    { "action": "specific nursing action 6", "rationale": "evidence-based rationale 6" }
  ],
  "evaluation": "string describing expected outcomes and evaluation criteria",
  "priority": "high"
}

The "priority" field must be exactly one of: "high", "medium", or "low".`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error('Anthropic API error:', errData);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const plan = JSON.parse(clean);

    return res.json({ plan });

  } catch (err) {
    console.error('Server error:', err.message);
    return res.status(500).json({ error: 'Failed to generate care plan. Please try again.' });
  }
});

// Fallback — serve index.html for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NurseCare AI running on port ${PORT}`);
});
