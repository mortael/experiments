/**
 * Sonovix — Backend Server
 * Modular Node.js/Express API. Swap `BRAND_CONFIG` to rebrand for any company.
 *
 * Routes:
 *   GET  /api/brand      → brand metadata (name, tagline, theme colours)
 *   GET  /api/features   → feature cards list
 *   GET  /api/stats      → headline statistics
 *   POST /api/contact    → contact-form submission handler
 */

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));          // serve index.html and static assets

// ─── Brand Configuration ────────────────────────────────────────────────────
// Swap this object to adapt the template for a different company.
const BRAND_CONFIG = {
  name: 'Sonovix',
  tagline: 'Shape the Sound of Tomorrow',
  description:
    'Next-generation audio intelligence platform for creators, engineers, and enterprises.',
  primaryColor: '#7c3aed',     // violet-700
  accentColor: '#06b6d4',      // cyan-500
  logoInitial: 'S',
  socialLinks: {
    twitter: 'https://twitter.com/sonovix',
    github: 'https://github.com/sonovix',
    linkedin: 'https://linkedin.com/company/sonovix',
  },
};

// ─── Feature Data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    id: 1,
    icon: '🎛️',
    title: 'AI Audio Engine',
    description:
      'Real-time neural processing transforms raw audio into crystal-clear, spatially-aware sound.',
  },
  {
    id: 2,
    icon: '⚡',
    title: 'Ultra-Low Latency',
    description:
      'Sub-millisecond pipeline built on Rust and WebAssembly delivers live performance without compromise.',
  },
  {
    id: 3,
    icon: '🌐',
    title: 'Edge Deployment',
    description:
      'One-click distribution to 200+ global edge nodes — your users hear perfection, everywhere.',
  },
  {
    id: 4,
    icon: '🔒',
    title: 'Enterprise Security',
    description:
      'End-to-end encryption, SOC 2 Type II compliance, and zero-trust architecture by default.',
  },
  {
    id: 5,
    icon: '🧩',
    title: 'Plugin Ecosystem',
    description:
      '500+ community plugins. Build your own with our open SDK and ship in minutes.',
  },
  {
    id: 6,
    icon: '📊',
    title: 'Analytics Dashboard',
    description:
      'Deep insights into listener behaviour, quality metrics, and infrastructure health.',
  },
];

// ─── Stats Data ──────────────────────────────────────────────────────────────
const STATS = [
  { id: 1, value: '10M+', label: 'Active Users' },
  { id: 2, value: '0.3ms', label: 'Avg. Latency' },
  { id: 3, value: '99.99%', label: 'Uptime SLA' },
  { id: 4, value: '500+', label: 'Integrations' },
];

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /api/brand */
app.get('/api/brand', (_req, res) => {
  res.json({ success: true, data: BRAND_CONFIG });
});

/** GET /api/features */
app.get('/api/features', (_req, res) => {
  res.json({ success: true, data: FEATURES });
});

/** GET /api/stats */
app.get('/api/stats', (_req, res) => {
  res.json({ success: true, data: STATS });
});

/**
 * POST /api/contact
 * Expects JSON body: { name, email, message }
 * In production, wire this to an email service or CRM.
 */
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body ?? {};

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'name, email, and message are required.' });
  }

  // TODO: replace with real email/CRM integration
  console.log(`📬 Contact form submission from ${name} <${email}>:\n${message}\n`);

  res.json({ success: true, message: 'Thanks for reaching out! We\'ll get back to you shortly.' });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`🚀 Sonovix server running → http://localhost:${PORT}`);
});
