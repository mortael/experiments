/**
 * Sonovix — Frontend Application
 * ─────────────────────────────────────────────────────────────────────────────
 * Architecture:
 *   1. BrandConfig  — single source of truth for brand tokens (swap to rebrand)
 *   2. ParticleField — canvas-based floating particle background
 *   3. ScrollReveal  — IntersectionObserver-driven reveal animations
 *   4. NavScroll     — transparent→frosted-glass nav on scroll
 *   5. ContactForm   — async form submission to /api/contact
 *   6. Counters      — animated count-up for stats
 *   7. WaveformBars  — CSS-animated waveform with staggered timing
 *   8. init()        — orchestrates everything on DOMContentLoaded
 */

'use strict';

// ─── 1. Brand Configuration ───────────────────────────────────────────────────
// Swap this object (or fetch it from /api/brand) to adapt the template for
// any company without touching markup or styles.
const BrandConfig = {
  name: 'Sonovix',
  tagline: 'Shape the Sound of Tomorrow',
  primaryColor: '#7c3aed',
  accentColor: '#06b6d4',
  particleColor: '124, 58, 237',   // RGB for rgba()
  particleCount: 80,
  particleSpeed: 0.4,
};

// Apply CSS variables programmatically so BrandConfig is truly the one source.
function applyBrandTokens(config) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', config.primaryColor);
  root.style.setProperty('--brand-accent',  config.accentColor);
}

// ─── 2. Particle Field ────────────────────────────────────────────────────────
class ParticleField {
  constructor(canvasId, config) {
    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas?.getContext('2d');
    this.config  = config;
    this.particles = [];
    this.raf = null;

    if (!this.canvas) return;

    this._resize();
    this._seed();
    this._loop();

    window.addEventListener('resize', () => {
      this._resize();
      this._seed();
    });
  }

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _seed() {
    const { particleCount, particleColor, particleSpeed } = this.config;
    this.particles = Array.from({ length: particleCount }, () => ({
      x:    Math.random() * this.canvas.width,
      y:    Math.random() * this.canvas.height,
      r:    Math.random() * 1.8 + 0.4,
      dx:   (Math.random() - 0.5) * particleSpeed,
      dy:   (Math.random() - 0.5) * particleSpeed,
      alpha: Math.random() * 0.5 + 0.1,
      color: particleColor,
    }));
  }

  _draw() {
    const { ctx, canvas, particles } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, i) => {
      // Move
      p.x += p.dx;
      p.y += p.dy;

      // Wrap around edges
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width)  p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.fill();

      // Draw connection lines to nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const q    = particles[j];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < 120) {
          const lineAlpha = (1 - dist / 120) * 0.12;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${p.color}, ${lineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    });
  }

  _loop() {
    this._draw();
    this.raf = requestAnimationFrame(() => this._loop());
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }
}

// ─── 3. Scroll Reveal ─────────────────────────────────────────────────────────
function initScrollReveal() {
  const targets = document.querySelectorAll('.card, .bento__item, .stats__item');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  targets.forEach((el) => observer.observe(el));
}

// ─── 4. Nav Scroll Effect ─────────────────────────────────────────────────────
function initNavScroll() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const update = () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 20);
  };

  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ─── 5. Contact Form ──────────────────────────────────────────────────────────
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('form-status');
    const submit = form.querySelector('[type="submit"]');

    const data = {
      name:    form.elements['name'].value.trim(),
      email:   form.elements['email'].value.trim(),
      message: form.elements['message'].value.trim(),
    };

    submit.disabled = true;
    submit.textContent = 'Sending…';
    status.className = 'form__status';
    status.style.display = 'none';

    try {
      const res  = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      const json = await res.json();

      if (json.success) {
        status.className   = 'form__status form__status--success';
        status.textContent = json.message;
        form.reset();
      } else {
        throw new Error(json.error ?? 'Unknown error');
      }
    } catch (err) {
      status.className   = 'form__status form__status--error';
      status.textContent = `Something went wrong: ${err.message}`;
    } finally {
      status.style.display = '';
      submit.disabled  = false;
      submit.textContent = 'Send Message';
    }
  });
}

// ─── 6. Animated Counters ─────────────────────────────────────────────────────
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el     = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix ?? '';
        const prefix = el.dataset.prefix ?? '';
        const duration = 1600;
        const start  = performance.now();

        const tick = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          // ease-out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const value  = target * eased;
          el.textContent = prefix + (Number.isInteger(target)
            ? Math.floor(value).toLocaleString()
            : value.toFixed(2)) + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
        observer.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((el) => observer.observe(el));
}

// ─── 7. Waveform Bars ─────────────────────────────────────────────────────────
function initWaveform() {
  const container = document.querySelector('.waveform');
  if (!container) return;

  const BAR_COUNT = 28;
  container.innerHTML = '';

  Array.from({ length: BAR_COUNT }).forEach((_, i) => {
    const bar = document.createElement('div');
    bar.className = 'waveform__bar';
    // Stagger animation delay and height variation
    const delay    = (i * 60) % 800;
    const duration = 600 + Math.sin(i) * 300;
    bar.style.setProperty('--d', `${duration}ms`);
    bar.style.animationDelay = `${delay}ms`;
    container.appendChild(bar);
  });
}

// ─── 8. Hero CTA email capture ────────────────────────────────────────────────
function initHeroCTA() {
  const form = document.getElementById('hero-waitlist-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input  = form.querySelector('input[type="email"]');
    const btn    = form.querySelector('button');
    const email  = input.value.trim();
    if (!email) return;

    // Simulate submission (wire to /api/contact or marketing service)
    btn.textContent = '✓ You\'re on the list!';
    btn.disabled = true;
    input.disabled = true;
    input.value = email;
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyBrandTokens(BrandConfig);
  new ParticleField('particle-canvas', BrandConfig);
  initScrollReveal();
  initNavScroll();
  initContactForm();
  initCounters();
  initWaveform();
  initHeroCTA();
});
