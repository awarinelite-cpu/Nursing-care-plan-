const express = require('express');
const path = require('path');

let fetchFn;
(async () => {
  const { default: fetch } = await import('node-fetch');
  fetchFn = fetch;
})();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SVG App Icons (PWA) ──
const iconSVG = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size*0.2}" fill="#2d7a87"/>
  <rect x="${size*0.12}" y="${size*0.12}" width="${size*0.76}" height="${size*0.76}" rx="${size*0.13}" fill="#4a9ba8"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="${size*0.42}">🏥</text>
</svg>`;

app.get('/icon-192.png', (req, res) => { res.setHeader('Content-Type','image/svg+xml'); res.send(iconSVG(192)); });
app.get('/icon-512.png', (req, res) => { res.setHeader('Content-Type','image/svg+xml'); res.send(iconSVG(512)); });
app.get('/screenshot.png', (req, res) => {
  res.setHeader('Content-Type','image/svg+xml');
  res.send(`<svg width="390" height="844" xmlns="http://www.w3.org/2000/svg"><rect width="390" height="844" fill="#2d7a87"/><text x="195" y="422" text-anchor="middle" fill="white" font-size="28" font-family="Arial" font-weight="bold">NurseCare AI</text></svg>`);
});

// ── Claude API helper ──
async function callClaude(prompt, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const response = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:maxTokens||1200, messages:[{role:'user',content:prompt}] })
  });
  if (!response.ok) { const e = await response.json(); throw new Error(e.error?.message||'API error'); }
  const data = await response.json();
  const raw = data.content.map(b=>b.text||'').join('').trim();
  return JSON.parse(raw.replace(/```json|```/g,'').trim());
}

// ── Care Plan ──
app.post('/api/generate', async (req, res) => {
  const { diagnosis } = req.body;
  if (!diagnosis || typeof diagnosis !== 'string') return res.status(400).json({ error:'diagnosis is required' });
  const prompt = `You are an expert clinical nursing educator. A user entered: "${diagnosis}".
This may be a NANDA-I nursing diagnosis OR a medical diagnosis. If medical, generate the nursing care plan for it.
Respond ONLY with valid JSON — no markdown, no backticks:
{"relatedTo":"etiology","evidencedBy":["s1","s2","s3","s4"],"goals":["g1","g2","g3"],"interventions":[{"action":"a1","rationale":"r1"},{"action":"a2","rationale":"r2"},{"action":"a3","rationale":"r3"},{"action":"a4","rationale":"r4"},{"action":"a5","rationale":"r5"},{"action":"a6","rationale":"r6"}],"evaluation":"criteria","priority":"high","_diagnosisType":"nursing"}
priority=high/medium/low, _diagnosisType=nursing/medical. Replace all placeholder values with real clinical content.`;
  try { return res.json({ plan: await callClaude(prompt, 1200) }); }
  catch(err) { console.error('Generate error:',err.message); return res.status(500).json({ error:'Failed to generate care plan.' }); }
});

// ── Drug Profile ──
app.post('/api/drug', async (req, res) => {
  const { drug } = req.body;
  if (!drug || typeof drug !== 'string') return res.status(400).json({ error:'drug name is required' });
  const prompt = `You are a clinical pharmacology expert. Generate a complete drug profile for: "${drug}".
Respond ONLY with valid JSON — no markdown, no backticks:
{"name":"brand","genericName":"generic","drugClass":"class","dose":"dose","dosage":"schedule","route":"routes","indications":["i1","i2","i3"],"modeOfAction":"mechanism","sideEffects":["s1","s2","s3","s4","s5"],"contraindications":["c1","c2","c3"],"nursingConsiderations":["n1","n2","n3","n4","n5","n6"],"adverseEffects":["a1","a2","a3"]}
Replace all placeholder values with real clinical content for ${drug}.`;
  try { return res.json({ drug: await callClaude(prompt, 1500) }); }
  catch(err) { console.error('Drug error:',err.message); return res.status(500).json({ error:'Failed to generate drug profile.' }); }
});

// Fallback — inject SW registration script into HTML
app.get('*', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error');
    const swScript = `<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(r){ console.log('SW registered:', r.scope); })
      .catch(function(e){ console.log('SW failed:', e); });
  });
}
</script>`;
    const html = data.replace('</body>', swScript + '</body>');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NurseCare AI running on port ${PORT}`));
