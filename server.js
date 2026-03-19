const express = require('express');
const path = require('path');
const fs = require('fs');

// Node 22 has fetch built-in — no node-fetch needed
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SVG App Icons (PWA) ──
const iconSVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size*0.2}" fill="#2d7a87"/>
  <rect x="${size*0.12}" y="${size*0.12}" width="${size*0.76}" height="${size*0.76}" rx="${size*0.13}" fill="#4a9ba8"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="${size*0.42}">🏥</text>
</svg>`;

app.get('/icon-192.png', (req, res) => { res.setHeader('Content-Type','image/svg+xml'); res.send(iconSVG(192)); });
app.get('/icon-512.png', (req, res) => { res.setHeader('Content-Type','image/svg+xml'); res.send(iconSVG(512)); });

// ── Claude API helper ──
async function callClaude(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 1200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.error?.message || 'Anthropic API error');
  }

  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').trim();
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

// ── Care Plan ──
app.post('/api/generate', async (req, res) => {
  const { diagnosis } = req.body;
  if (!diagnosis || typeof diagnosis !== 'string') {
    return res.status(400).json({ error: 'diagnosis is required' });
  }

  const prompt = `You are an expert clinical nursing educator. A user entered: "${diagnosis}".
This may be a NANDA-I nursing diagnosis OR a medical diagnosis. If medical, generate the nursing care plan for it.
Respond ONLY with valid JSON — no markdown, no backticks, no extra text:
{
  "relatedTo": "etiology/related factors",
  "evidencedBy": ["sign 1", "sign 2", "sign 3", "sign 4"],
  "goals": ["SMART goal 1", "SMART goal 2", "SMART goal 3"],
  "interventions": [
    { "action": "action 1", "rationale": "rationale 1" },
    { "action": "action 2", "rationale": "rationale 2" },
    { "action": "action 3", "rationale": "rationale 3" },
    { "action": "action 4", "rationale": "rationale 4" },
    { "action": "action 5", "rationale": "rationale 5" },
    { "action": "action 6", "rationale": "rationale 6" }
  ],
  "evaluation": "evaluation criteria",
  "priority": "high",
  "_diagnosisType": "nursing"
}
priority must be high/medium/low. _diagnosisType must be nursing or medical. Replace ALL placeholder text with real clinical content.`;

  try {
    const plan = await callClaude(prompt, 1200);
    return res.json({ plan });
  } catch (err) {
    console.error('Generate error:', err.message);
    return res.status(500).json({ error: 'Failed to generate care plan.' });
  }
});

// ── Drug Profile ──
app.post('/api/drug', async (req, res) => {
  const { drug } = req.body;
  if (!drug || typeof drug !== 'string') {
    return res.status(400).json({ error: 'drug name is required' });
  }

  const prompt = `You are a clinical pharmacology expert. Generate a complete drug reference profile for: "${drug}".
Respond ONLY with valid JSON — no markdown, no backticks, no extra text:
{
  "name": "brand name",
  "genericName": "generic name",
  "drugClass": "drug class",
  "dose": "dose range",
  "dosage": "frequency and schedule",
  "route": "routes of administration",
  "indications": ["indication 1", "indication 2", "indication 3"],
  "modeOfAction": "detailed mechanism of action",
  "sideEffects": ["effect 1", "effect 2", "effect 3", "effect 4", "effect 5"],
  "contraindications": ["contra 1", "contra 2", "contra 3"],
  "nursingConsiderations": ["consideration 1", "consideration 2", "consideration 3", "consideration 4", "consideration 5", "consideration 6"],
  "adverseEffects": ["adverse 1", "adverse 2", "adverse 3"]
}
Replace ALL placeholder text with real accurate clinical content for ${drug}.`;

  try {
    const drugData = await callClaude(prompt, 1500);
    return res.json({ drug: drugData });
  } catch (err) {
    console.error('Drug error:', err.message);
    return res.status(500).json({ error: 'Failed to generate drug profile.' });
  }
});

// ── Fallback: inject SW registration + serve index.html ──
app.get('*', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading app');
    const swScript = `<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(r) { console.log('SW registered:', r.scope); })
      .catch(function(e) { console.log('SW failed:', e); });
  });
}
</script>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(data.replace('</body>', swScript + '\n</body>'));
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NurseCare AI running on port ${PORT}`));
