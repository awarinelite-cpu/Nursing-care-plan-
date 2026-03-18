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

  const prompt = `You are an expert clinical nursing educator. A user has entered this diagnosis: "${diagnosis}".

This may be either a NANDA-I nursing diagnosis (e.g. "Acute Pain", "Risk for Infection") OR a medical diagnosis (e.g. "Pneumonia", "Diabetes Mellitus", "Hypertension", "Myocardial Infarction").

If it is a MEDICAL diagnosis, generate the most appropriate NURSING care plan for that condition — identifying the primary nursing diagnosis, related factors, signs/symptoms, and evidence-based interventions a nurse would implement for this medical condition.

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
  "priority": "high",
  "_diagnosisType": "nursing"
}

Rules:
- "priority" must be exactly one of: "high", "medium", or "low"
- "_diagnosisType" must be "nursing" if it's a NANDA-I nursing diagnosis, or "medical" if it's a medical/clinical diagnosis
- All fields are required`;

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


// ── Drug Profile AI Endpoint ──
app.post('/api/drug', async (req, res) => {
  const { drug } = req.body;
  if (!drug || typeof drug !== 'string') return res.status(400).json({ error: 'drug name is required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const prompt = `You are a clinical pharmacology expert. Generate a complete drug reference profile for: "${drug}".

Respond ONLY with a valid JSON object — no markdown, no backticks, no preamble. Use this exact structure:
{
  "name": "Brand/common name",
  "genericName": "Full generic name",
  "drugClass": "Drug class / pharmacological category",
  "dose": "Typical dose range e.g. 500 mg",
  "dosage": "Frequency and schedule e.g. Twice daily with meals",
  "route": "Route(s) of administration e.g. Oral (PO), IV",
  "indications": ["indication 1", "indication 2", "indication 3"],
  "modeOfAction": "Detailed mechanism of action paragraph",
  "sideEffects": ["side effect 1", "side effect 2", "side effect 3"],
  "contraindications": ["contraindication 1", "contraindication 2"],
  "nursingConsiderations": ["consideration 1", "consideration 2", "consideration 3", "consideration 4", "consideration 5"],
  "adverseEffects": ["adverse effect 1", "adverse effect 2", "adverse effect 3"]
}
All fields are required. Be accurate and clinically precise.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    });
    if (!response.ok) throw new Error('Anthropic API error');
    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const drugData = JSON.parse(clean);
    return res.json({ drug: drugData });
  } catch (err) {
    console.error('Drug API error:', err.message);
    return res.status(500).json({ error: 'Failed to generate drug profile.' });
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
