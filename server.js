const express = require('express');
const path = require('path');

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

// ── Drugs by Indication ──
app.post('/api/drugs-by-indication', async (req, res) => {
  const { indication } = req.body;
  if (!indication) return res.status(400).json({ error: 'indication required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const prompt = `You are a clinical pharmacist. List 8 important drugs commonly used for: "${indication}".

Respond ONLY with valid JSON — no markdown, no backticks:
{
  "drugs": [
    {
      "name": "Brand name",
      "genericName": "Generic name",
      "drugClass": "Drug class",
      "whyUsed": "One simple sentence explaining why this drug is used for ${indication}"
    }
  ]
}
Return exactly 8 drugs. Use simple plain language a student nurse can understand. Replace all placeholders with real drug names.`;

  try {
    const data = await callClaude(prompt, 1000);
    return res.json(data);
  } catch (err) {
    console.error('Indication search error:', err.message);
    return res.status(500).json({ error: 'Failed to find drugs.' });
  }
});

// ── Drug Search (multiple results) ──
app.post('/api/search-drugs', async (req, res) => {
  const { query, count = 15, offset = 0 } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const prompt = `You are a clinical pharmacist. A user searched for: "${query}".

This could be a drug name, drug class, or a medical condition/indication.

List ${count} different drugs related to this search (starting from result number ${offset + 1}).
Include a variety — different drug classes, brand names and generic names.

Respond ONLY with valid JSON — no markdown, no backticks:
{
  "drugs": [
    {
      "name": "Drug brand/common name",
      "genericName": "Generic name",
      "drugClass": "Drug class",
      "whyUsed": "One simple sentence: why this drug is used for ${query}"
    }
  ]
}
Return exactly ${count} drugs. All must be real, clinically accurate drugs. No duplicates. Replace all placeholder text.`;

  try {
    const data = await callClaude(prompt, 2000);
    return res.json(data);
  } catch (err) {
    console.error('Drug search error:', err.message);
    return res.status(500).json({ error: 'Search failed.' });
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
  "modeOfAction": "explain in simple everyday language how this drug works in the body — as if explaining to a student nurse (avoid complex biochemistry terms)",
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

// ── Fallback: serve index.html ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NurseCare AI running on port ${PORT}`));

// ════════════════════════════════════════════════════
// ADMIN + PAYMENT + PRODUCT CODE ENDPOINTS
// ════════════════════════════════════════════════════

const ADMIN_EMAIL = 'mynote0416@gmail.com';
const MONNIFY_SECRET = process.env.MONNIFY_SECRET_KEY || '';
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY || '';
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE || '';
const MONNIFY_BASE = 'https://api.monnify.com';

// ── Firebase Admin SDK (server-side) ──
let admin, adminDb;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'nurses-vault',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
  }
  adminDb = admin.firestore();
} catch(e) { console.log('Firebase Admin not configured:', e.message); }

function requireAdmin(req, res) {
  if (req.headers['x-user-email'] !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Admin only' });
    return false;
  }
  return true;
}

// ── Verify Payment (Monnify) ──
app.post('/api/verify-payment', async (req, res) => {
  const { reference, plan, userId } = req.body;
  if (!reference || !userId) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Get Monnify access token
    const credentials = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET}`).toString('base64');
    const tokenResp = await fetch(`${MONNIFY_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' }
    });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.responseBody?.accessToken;
    if (!accessToken) throw new Error('Could not get Monnify token');

    // Verify transaction
    const encodedRef = encodeURIComponent(reference);
    const verifyResp = await fetch(`${MONNIFY_BASE}/api/v2/transactions/${encodedRef}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const verifyData = await verifyResp.json();
    const txStatus = verifyData.responseBody?.paymentStatus;

    if (txStatus !== 'PAID') {
      console.log('Monnify tx not paid:', txStatus);
      return res.json({ success: false, status: txStatus });
    }

    const expiresAt = plan === '6months'
      ? new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    if (adminDb) {
      await adminDb.collection('users').doc(userId).set({ plan, expiresAt }, { merge: true });
      await adminDb.collection('payments').add({
        userId,
        email: verifyData.responseBody?.customer?.email || '',
        amount: verifyData.responseBody?.amountPaid || 0,
        plan, reference,
        paidAt: new Date().toISOString(),
        status: 'success',
        provider: 'monnify'
      });
    }
    return res.json({ success: true, plan, expiresAt });
  } catch(e) {
    console.error('Monnify verify error:', e.message);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// ── Redeem Product Code ──
app.post('/api/redeem-code', async (req, res) => {
  const { code, userId, email } = req.body;
  if (!code || !userId) return res.status(400).json({ error: 'Missing fields' });
  if (!adminDb) return res.status(503).json({ error: 'Service unavailable' });
  try {
    const snap = await adminDb.collection('productCodes').where('code','==',code).where('used','==',false).get();
    if (snap.empty) return res.json({ success: false, error: 'Invalid or already used code.' });
    const codeDoc = snap.docs[0];
    const codeData = codeDoc.data();
    const plan = codeData.plan;
    const expiresAt = plan === '6months'
      ? new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await codeDoc.ref.update({ used: true, usedBy: userId, usedByEmail: email, usedAt: new Date().toISOString() });
    await adminDb.collection('users').doc(userId).set({ plan, expiresAt }, { merge: true });
    return res.json({ success: true, plan, expiresAt });
  } catch(e) {
    console.error('Code redeem error:', e);
    return res.status(500).json({ error: 'Redemption failed.' });
  }
});

// ── Admin: Stats + Users ──
app.get('/api/admin/stats', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!adminDb) return res.json({ totalUsers:0, paidUsers:0, revenue:0, expired:0, users:[] });
  try {
    const snap = await adminDb.collection('users').get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const paid = users.filter(u => u.plan === 'lifetime' || u.plan === '6months');
    const expired = users.filter(u => u.plan === 'expired');
    const paymentsSnap = await adminDb.collection('payments').get();
    const revenue = paymentsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0) / 100;
    return res.json({ totalUsers: users.length, paidUsers: paid.length, expired: expired.length, revenue, users });
  } catch(e) { return res.status(500).json({ error: e.message }); }
});

// ── Admin: Generate Product Codes ──
app.post('/api/admin/generate-codes', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { plan, quantity } = req.body;
  if (!adminDb) return res.status(503).json({ error: 'Firebase not configured' });
  const codes = [];
  for (let i = 0; i < Math.min(quantity || 1, 100); i++) {
    const code = 'NC-' + plan.toUpperCase().slice(0,2) + '-' +
      Math.random().toString(36).substr(2,4).toUpperCase() + '-' +
      Math.random().toString(36).substr(2,4).toUpperCase();
    await adminDb.collection('productCodes').add({ code, plan, used: false, createdAt: new Date().toISOString() });
    codes.push(code);
  }
  return res.json({ codes });
});

// ── Admin: List Codes ──
app.get('/api/admin/codes', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!adminDb) return res.json({ codes: [] });
  const snap = await adminDb.collection('productCodes').orderBy('createdAt','desc').get();
  return res.json({ codes: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
});

// ── Admin: Payments ──
app.get('/api/admin/payments', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!adminDb) return res.json({ payments: [] });
  const snap = await adminDb.collection('payments').orderBy('paidAt','desc').get();
  return res.json({ payments: snap.docs.map(d => d.data()) });
});

// ── Admin: Grant Access ──
app.post('/api/admin/grant-access', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { userId, plan } = req.body;
  if (!adminDb) return res.status(503).json({ error: 'Firebase not configured' });
  const expiresAt = plan === '6months'
    ? new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  await adminDb.collection('users').doc(userId).set({ plan, expiresAt }, { merge: true });
  return res.json({ success: true });
});
