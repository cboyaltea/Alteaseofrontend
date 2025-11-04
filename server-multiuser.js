// ╔═══════════════════════════════════════════════════════════════════╗
// ║                                                                   ║
// ║          🚀 SEO PLATFORM BACKEND - MULTI-USER API                ║
// ║                                                                   ║
// ║     Multi-Utilisateur, Multi-Site, Multi-Langue                  ║
// ║                                                                   ║
// ╚═══════════════════════════════════════════════════════════════════╝

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// ✨ SEO Rules Schema Import - COMMENTÉ car les modèles sont définis dans ce fichier
// const { SEORule, SEORulePerformance } = require('./seo-rules-schema');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

// CRITICAL: Very permissive CORS configuration to fix all CORS issues
const corsOptions = {
  origin: '*', // Allow all origins
  credentials: false, // Set to false when using wildcard origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Additional CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-Request-Id');
  res.header('Access-Control-Max-Age', '86400');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════
// 📁 STATIC FILES & PUBLIC DIRECTORY
// ═══════════════════════════════════════════════════════════════════

// Créer le dossier public s'il n'existe pas (utile pour Railway)
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  console.log('📁 Creating public directory...');
  fs.mkdirSync(publicDir, { recursive: true });
}

// Middleware pour servir les fichiers statiques
app.use('/public', express.static(publicDir, {
  maxAge: '1h', // Cache pour 1 heure
  etag: true,
  lastModified: true
}));

// Route principale pour le pixel SEO
app.get('/seo-pixel.js', (req, res) => {
  const pixelPath = path.join(publicDir, 'seo-pixel.js');
  
  // Vérifier si le fichier existe
  if (!fs.existsSync(pixelPath)) {
    console.error('❌ SEO Pixel file not found:', pixelPath);
    return res.status(404).json({ 
      error: 'SEO Pixel not found',
      message: 'Please ensure seo-pixel.js is in the public/ directory',
      expectedPath: pixelPath
    });
  }
  
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 heure
  res.setHeader('Access-Control-Allow-Origin', '*'); // CORS explicite
  res.sendFile(pixelPath);
  
  console.log('✅ SEO Pixel served to:', req.ip);
});

// Health check pour le pixel
app.get('/pixel-health', (req, res) => {
  const pixelPath = path.join(publicDir, 'seo-pixel.js');
  const exists = fs.existsSync(pixelPath);
  
  res.json({
    status: exists ? 'ok' : 'error',
    pixelAvailable: exists,
    publicDir: publicDir,
    pixelPath: pixelPath,
    timestamp: new Date().toISOString()
  });
});

console.log('📁 Static files configured');
console.log('   → /public/* → public/ directory');
console.log('   → /seo-pixel.js → public/seo-pixel.js');
console.log('   → /pixel-health → Check pixel availability');

// ═══════════════════════════════════════════════════════════════════
// ANTHROPIC CLAUDE AI INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ═══════════════════════════════════════════════════════════════════
// MONGODB SCHEMAS
// ═══════════════════════════════════════════════════════════════════

// Organization Schema
const organizationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  plan: { 
    type: String, 
    enum: ['free', 'starter', 'professional', 'enterprise'], 
    default: 'free' 
  },
  createdAt: { type: Date, default: Date.now },
  settings: {
    defaultLanguage: { type: String, default: 'en' },
    allowedLanguages: { type: [String], default: ['en', 'fr', 'es', 'de'] },
    maxSites: { type: Number, default: 5 },
    maxUsers: { type: Number, default: 3 }
  }
});

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  role: { 
    type: String, 
    enum: ['admin', 'user', 'viewer'], 
    default: 'user' 
  },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

// Website Schema
const websiteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  language: { 
    type: String, 
    required: true, 
    enum: ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'zh', 'ja', 'ar'],
    default: 'en'
  },
  siteId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  settings: {
    autoOptimize: { type: Boolean, default: true },
    trackingEnabled: { type: Boolean, default: true }
  },
  stats: {
    pagesAnalyzed: { type: Number, default: 0 },
    contentGenerated: { type: Number, default: 0 },
    lastAnalyzed: { type: Date }
  }
});

// Content Schema
const contentSchema = new mongoose.Schema({
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  type: { 
    type: String, 
    enum: ['blog-post', 'product-description', 'meta-tags', 'faq', 'landing-page', 'social-media'],
    required: true 
  },
  language: { type: String, required: true },
  topic: { type: String, required: true },
  keywords: [String],
  content: { type: String, required: true },
  metadata: {
    wordCount: Number,
    readingTime: Number,
    seoScore: Number
  },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Analytics Schema
const analyticsSchema = new mongoose.Schema({
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  timestamp: { type: Date, default: Date.now },
  pageUrl: { type: String, required: true },
  event: {
    type: { type: String, required: true }, // pageview, click, scroll, etc.
    data: mongoose.Schema.Types.Mixed
  },
  userAgent: String,
  referrer: String,
  language: String
});

// ═══════════════════════════════════════════════════════════════════
// SEO ANALYSIS SCHEMA - NEW
// ═══════════════════════════════════════════════════════════════════

const seoAnalysisSchema = new mongoose.Schema({
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  url: { type: String, required: true },
  path: String,
  timestamp: { type: Date, default: Date.now },
  data: mongoose.Schema.Types.Mixed,
  score: {
    overall: Number,
    meta: Number,
    content: Number,
    structure: Number,
    performance: Number,
    mobile: Number
  },
  issues: [{
    severity: String,
    category: String,
    message: String,
    fix: String
  }],
  recommendations: [{
    title: String,
    description: String,
    priority: String,
    implementation: String,
    expectedImpact: String
  }]
});

// ═══════════════════════════════════════════════════════════════════
// SEO RULES SCHEMA - NEW
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// SEO RULES SCHEMA - COMPLETE VERSION (Integrated from seo-rules-schema.js)
// ═══════════════════════════════════════════════════════════════════

const seoRuleSchema = new mongoose.Schema({
  // ─────────────────────────────────────────────────────────────────
  // 📌 IDENTIFICATION & OWNERSHIP
  // ─────────────────────────────────────────────────────────────────
  websiteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Website', 
    required: true,
    index: true 
  },
  organizationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true,
    index: true 
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 🎯 CIBLAGE DE LA RÈGLE
  // ─────────────────────────────────────────────────────────────────
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  description: { 
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Conditions d'application de la règle
  targeting: {
    // Type de matching pour l'URL
    matchType: {
      type: String,
      enum: [
        'exact',        // URL exacte : /products/shoes
        'contains',     // Contient : /products/*
        'starts_with',  // Commence par : /blog/*
        'ends_with',    // Se termine par : *.html
        'regex',        // Expression régulière avancée
        'all'          // Toutes les pages du site
      ],
      required: true,
      default: 'exact'
    },
    
    // Pattern d'URL à matcher
    urlPattern: {
      type: String,
      required: true,
      trim: true
    },
    
    // Langues ciblées (optionnel, si vide = toutes les langues)
    languages: [{
      type: String,
      enum: ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'zh', 'ja', 'ar']
    }],
    
    // Devices ciblés (optionnel, si vide = tous les devices)
    devices: [{
      type: String,
      enum: ['desktop', 'mobile', 'tablet']
    }],
    
    // Conditions additionnelles (optionnel)
    conditions: {
      // Paramètres d'URL requis
      queryParams: [{
        key: String,
        value: String,
        operator: {
          type: String,
          enum: ['equals', 'contains', 'exists'],
          default: 'equals'
        }
      }],
      
      // Heure de la journée (pour A/B testing temporel)
      timeRange: {
        start: String, // Format HH:MM
        end: String    // Format HH:MM
      },
      
      // Jours de la semaine
      daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6 // 0 = Dimanche, 6 = Samedi
      }]
    }
  },
  
  // ─────────────────────────────────────────────────────────────────
  // ✏️ MODIFICATIONS SEO À APPLIQUER
  // ─────────────────────────────────────────────────────────────────
  modifications: {
    // Modification du TITLE
    title: {
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: [
          'replace',      // Remplacer complètement
          'prepend',      // Ajouter au début
          'append',       // Ajouter à la fin
          'template'      // Utiliser un template avec variables
        ],
        default: 'replace'
      },
      value: String,
      template: String,    // Ex: "{original} | {brand} - {year}"
      maxLength: { type: Number, default: 60 }
    },
    
    // Modification de la META DESCRIPTION
    metaDescription: {
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: ['replace', 'prepend', 'append', 'template'],
        default: 'replace'
      },
      value: String,
      template: String,
      maxLength: { type: Number, default: 160 }
    },
    
    // Modification des META KEYWORDS (legacy mais parfois utile)
    metaKeywords: {
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: ['replace', 'add', 'remove'],
        default: 'replace'
      },
      keywords: [String]
    },
    
    // Modification du H1
    h1: {
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: [
          'replace',           // Remplacer le premier H1
          'replace_all',       // Remplacer tous les H1
          'prepend',          // Ajouter avant
          'append',           // Ajouter après
          'inject_if_missing' // Créer si absent
        ],
        default: 'replace'
      },
      value: String,
      selector: String,  // Sélecteur CSS optionnel pour cibler un H1 spécifique
      position: {        // Position si injection
        type: String,
        enum: ['start_of_body', 'after_header', 'before_main', 'custom'],
        default: 'start_of_body'
      },
      customSelector: String // Sélecteur pour position custom
    },
    
    // Modification des H2/H3/etc
    headings: [{
      level: {
        type: Number,
        min: 2,
        max: 6,
        required: true
      },
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: ['replace', 'prepend', 'append', 'inject'],
        default: 'replace'
      },
      selector: String,  // Sélecteur CSS pour cibler des headings spécifiques
      value: String
    }],
    
    // META Tags Open Graph (Facebook)
    openGraph: {
      enabled: { type: Boolean, default: false },
      tags: [{
        property: {
          type: String,
          enum: [
            'og:title',
            'og:description',
            'og:image',
            'og:url',
            'og:type',
            'og:site_name',
            'og:locale'
          ],
          required: true
        },
        content: { type: String, required: true }
      }]
    },
    
    // META Tags Twitter Card
    twitterCard: {
      enabled: { type: Boolean, default: false },
      tags: [{
        name: {
          type: String,
          enum: [
            'twitter:card',
            'twitter:title',
            'twitter:description',
            'twitter:image',
            'twitter:site',
            'twitter:creator'
          ],
          required: true
        },
        content: { type: String, required: true }
      }]
    },
    
    // Canonical URL
    canonical: {
      enabled: { type: Boolean, default: false },
      action: {
        type: String,
        enum: ['set', 'remove', 'update'],
        default: 'set'
      },
      url: String,
      useCurrentUrl: { type: Boolean, default: false }
    },
    
    // Robots Meta Tag
    robots: {
      enabled: { type: Boolean, default: false },
      directives: [{
        type: String,
        enum: [
          'index',
          'noindex',
          'follow',
          'nofollow',
          'noarchive',
          'nosnippet',
          'noimageindex',
          'notranslate'
        ]
      }]
    },
    
    // Hreflang (pour le multi-langue)
    hreflang: {
      enabled: { type: Boolean, default: false },
      alternates: [{
        lang: {
          type: String,
          required: true
        },
        url: {
          type: String,
          required: true
        }
      }]
    },
    
    // Schema.org JSON-LD
    structuredData: {
      enabled: { type: Boolean, default: false },
      schemas: [{
        type: {
          type: String,
          enum: [
            'Article',
            'Product',
            'LocalBusiness',
            'Organization',
            'WebPage',
            'BreadcrumbList',
            'FAQPage',
            'Review',
            'Event',
            'Recipe'
          ],
          required: true
        },
        data: mongoose.Schema.Types.Mixed // JSON Schema.org
      }]
    },
    
    // Injection de contenu SEO additionnel
    contentInjection: {
      enabled: { type: Boolean, default: false },
      blocks: [{
        position: {
          type: String,
          enum: [
            'before_h1',
            'after_h1',
            'before_content',
            'after_content',
            'footer',
            'sidebar',
            'custom'
          ],
          required: true
        },
        customSelector: String, // Pour position custom
        insertMethod: {
          type: String,
          enum: ['prepend', 'append', 'replace', 'before', 'after'],
          default: 'append'
        },
        html: String,           // HTML à injecter
        cssClass: String,       // Classes CSS optionnelles
        hideFromUsers: { type: Boolean, default: false } // Caché visuellement (SEO only)
      }]
    },
    
    // Modification d'attributs ALT des images
    imageAlt: {
      enabled: { type: Boolean, default: false },
      rules: [{
        selector: String,    // Sélecteur CSS pour cibler des images
        action: {
          type: String,
          enum: ['set', 'append', 'prepend', 'template'],
          default: 'set'
        },
        value: String,
        template: String     // Ex: "{filename} - {brand}"
      }]
    },
    
    // Modification des liens internes
    internalLinks: {
      enabled: { type: Boolean, default: false },
      rules: [{
        selector: String,    // Sélecteur CSS
        action: {
          type: String,
          enum: ['add_title', 'modify_anchor', 'add_nofollow', 'add_attributes'],
          default: 'add_title'
        },
        titleTemplate: String,
        anchorTemplate: String,
        attributes: mongoose.Schema.Types.Mixed
      }]
    }
  },
  
  // ─────────────────────────────────────────────────────────────────
  // ⚙️ CONFIGURATION & ÉTAT
  // ─────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['active', 'inactive', 'draft', 'testing'],
    default: 'draft'
  },
  
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // A/B Testing
  abTesting: {
    enabled: { type: Boolean, default: false },
    variants: [{
      name: String,
      percentage: { type: Number, min: 0, max: 100 }, // % de trafic
      modifications: mongoose.Schema.Types.Mixed // Même structure que modifications
    }],
    goalMetric: {
      type: String,
      enum: ['ctr', 'bounce_rate', 'time_on_page', 'conversions'],
      default: 'ctr'
    }
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 📊 STATISTIQUES & PERFORMANCE
  // ─────────────────────────────────────────────────────────────────
  stats: {
    impressions: { type: Number, default: 0 },      // Nombre de fois appliquée
    lastApplied: { type: Date },
    performance: {
      avgLoadTime: Number,                          // Temps moyen d'exécution
      errors: { type: Number, default: 0 },        // Nombre d'erreurs
      successRate: { type: Number, default: 100 }  // % de succès
    }
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 🕐 PLANIFICATION
  // ─────────────────────────────────────────────────────────────────
  schedule: {
    enabled: { type: Boolean, default: false },
    startDate: Date,
    endDate: Date,
    timezone: { type: String, default: 'UTC' }
  },
  
  // ─────────────────────────────────────────────────────────────────
  // 📝 MÉTADONNÉES
  // ─────────────────────────────────────────────────────────────────
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Notes internes
  notes: String,
  
  // Tags pour organisation
  tags: [String]
});

// ═══════════════════════════════════════════════════════════════════
// INDEXES POUR PERFORMANCE
// ═══════════════════════════════════════════════════════════════════

seoRuleSchema.index({ websiteId: 1, status: 1 });
seoRuleSchema.index({ organizationId: 1 });
seoRuleSchema.index({ 'targeting.urlPattern': 1 });
seoRuleSchema.index({ priority: -1 });
seoRuleSchema.index({ status: 1, priority: -1 });

// ═══════════════════════════════════════════════════════════════════
// MÉTHODES DU SCHÉMA
// ═══════════════════════════════════════════════════════════════════

// Vérifier si la règle correspond à une URL donnée
seoRuleSchema.methods.matchesUrl = function(url, options = {}) {
  const { matchType, urlPattern } = this.targeting;
  
  // Nettoyer l'URL
  const cleanUrl = url.split('?')[0].split('#')[0];
  
  switch (matchType) {
    case 'exact':
      return cleanUrl === urlPattern;
    
    case 'contains':
      return cleanUrl.includes(urlPattern.replace('*', ''));
    
    case 'starts_with':
      return cleanUrl.startsWith(urlPattern.replace('*', ''));
    
    case 'ends_with':
      return cleanUrl.endsWith(urlPattern.replace('*', ''));
    
    case 'regex':
      try {
        const regex = new RegExp(urlPattern);
        return regex.test(cleanUrl);
      } catch (e) {
        console.error('Invalid regex pattern:', urlPattern);
        return false;
      }
    
    case 'all':
      return true;
    
    default:
      return false;
  }
};

// Vérifier si la règle est active maintenant
seoRuleSchema.methods.isActiveNow = function() {
  if (this.status !== 'active') return false;
  
  if (this.schedule.enabled) {
    const now = new Date();
    if (this.schedule.startDate && now < this.schedule.startDate) return false;
    if (this.schedule.endDate && now > this.schedule.endDate) return false;
  }
  
  return true;
};

// Incrémenter les statistiques
seoRuleSchema.methods.recordImpression = async function() {
  this.stats.impressions += 1;
  this.stats.lastApplied = new Date();
  await this.save();
};

// Mettre à jour la date de modification
seoRuleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// ═══════════════════════════════════════════════════════════════════
// MÉTHODES STATIQUES
// ═══════════════════════════════════════════════════════════════════

// Récupérer toutes les règles actives pour un site web et une URL
seoRuleSchema.statics.getActiveRulesForUrl = async function(websiteId, url, options = {}) {
  const rules = await this.find({
    websiteId,
    status: 'active'
  }).sort({ priority: -1 }); // Trier par priorité décroissante
  
  // Filtrer les règles qui matchent l'URL
  const matchingRules = rules.filter(rule => {
    if (!rule.matchesUrl(url, options)) return false;
    if (!rule.isActiveNow()) return false;
    
    // Vérifier les conditions de langue
    if (rule.targeting.languages && rule.targeting.languages.length > 0) {
      if (options.language && !rule.targeting.languages.includes(options.language)) {
        return false;
      }
    }
    
    // Vérifier les conditions de device
    if (rule.targeting.devices && rule.targeting.devices.length > 0) {
      if (options.device && !rule.targeting.devices.includes(options.device)) {
        return false;
      }
    }
    
    return true;
  });
  
  return matchingRules;
};

// ═══════════════════════════════════════════════════════════════════
// SCHEMA DE TRACKING DES PERFORMANCES
// ═══════════════════════════════════════════════════════════════════

const seoRulePerformanceSchema = new mongoose.Schema({
  ruleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SEORule', 
    required: true,
    index: true 
  },
  websiteId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Website', 
    required: true 
  },
  date: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  
  // Métriques
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  ctr: { type: Number, default: 0 },
  avgPosition: { type: Number },
  bounceRate: { type: Number },
  avgTimeOnPage: { type: Number },
  conversions: { type: Number, default: 0 },
  
  // Performance technique
  avgLoadTime: { type: Number },
  errors: { type: Number, default: 0 },
  
  // Métadonnées
  url: String,
  variant: String // Pour A/B testing
});

seoRulePerformanceSchema.index({ ruleId: 1, date: -1 });
seoRulePerformanceSchema.index({ websiteId: 1, date: -1 });

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════
// CREATE MONGOOSE MODELS
// ═══════════════════════════════════════════════════════════════════

const Organization = mongoose.model('Organization', organizationSchema);
const User = mongoose.model('User', userSchema);
const Website = mongoose.model('Website', websiteSchema);
const Content = mongoose.model('Content', contentSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);
const SEOAnalysis = mongoose.model('SEOAnalysis', seoAnalysisSchema);
const SEORule = mongoose.model('SEORule', seoRuleSchema);
const SEORulePerformance = mongoose.model('SEORulePerformance', seoRulePerformanceSchema);


// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Role-based authorization middleware
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

// Generate unique site ID
const generateSiteId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `site_${timestamp}_${random}`;
};

// Calculate reading time
const calculateReadingTime = (text) => {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

// Calculate basic SEO score (old function - kept for compatibility)
const calculateBasicSEOScore = (content, keywords) => {
  let score = 50;
  const lowerContent = content.toLowerCase();
  keywords.forEach(keyword => {
    if (lowerContent.includes(keyword.toLowerCase())) {
      score += 10;
    }
  });
  const wordCount = content.split(/\s+/).length;
  if (wordCount > 300) score += 10;
  if (wordCount > 600) score += 10;
  return Math.min(score, 100);
};

// ═══════════════════════════════════════════════════════════════════
// NEW SEO ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

// Calculate detailed SEO score from page data
function calculateDetailedSEOScore(data) {
  const scores = {
    meta: 0,
    content: 0,
    structure: 0,
    performance: 0,
    mobile: 0,
    overall: 0
  };
  
  // ────────────────────────────────────────────────────────────────
  // META SCORE (0-100)
  // ────────────────────────────────────────────────────────────────
  
  let metaScore = 0;
  
  if (data.meta?.title) {
    metaScore += 10;
    if (data.meta.title.length >= 30 && data.meta.title.length <= 60) {
      metaScore += 10;
    }
  }
  
  if (data.meta?.description) {
    metaScore += 10;
    if (data.meta.description.length >= 120 && data.meta.description.length <= 160) {
      metaScore += 10;
    }
  }
  
  if (data.meta?.canonical) metaScore += 10;
  if (data.meta?.ogTitle) metaScore += 5;
  if (data.meta?.ogDescription) metaScore += 5;
  if (data.meta?.ogImage) metaScore += 10;
  if (data.meta?.robots) metaScore += 10;
  if (data.meta?.twitterCard) metaScore += 10;
  if (data.mobile?.hasViewport) metaScore += 10;
  
  scores.meta = Math.min(metaScore, 100);
  
  // ────────────────────────────────────────────────────────────────
  // CONTENT SCORE (0-100)
  // ────────────────────────────────────────────────────────────────
  
  let contentScore = 0;
  
  if (data.content?.wordCount >= 300) {
    contentScore += 15;
    if (data.content.wordCount >= 600) {
      contentScore += 15;
    }
  }
  
  if (data.content?.paragraphs >= 3) contentScore += 10;
  if (data.content?.paragraphs >= 5) contentScore += 10;
  if (data.content?.lists > 0) contentScore += 10;
  if (data.content?.hasSchema) contentScore += 20;
  
  const imagesWithAlt = data.structure?.images?.filter(img => img.hasAlt).length || 0;
  const imagesTotal = data.structure?.images?.length || 0;
  if (imagesTotal > 0) {
    contentScore += Math.min((imagesWithAlt / imagesTotal) * 20, 20);
  }
  
  scores.content = Math.min(contentScore, 100);
  
  // ────────────────────────────────────────────────────────────────
  // STRUCTURE SCORE (0-100)
  // ────────────────────────────────────────────────────────────────
  
  let structureScore = 0;
  
  if (data.structure?.h1?.length === 1) {
    structureScore += 20;
    if (data.structure.h1[0].length >= 20 && data.structure.h1[0].length <= 70) {
      structureScore += 20;
    }
  }
  
  if (data.structure?.h2?.length > 0) {
    structureScore += 10;
    if (data.structure.h2.length >= 3) {
      structureScore += 10;
    }
  }
  
  if (data.structure?.links?.internal >= 3) {
    structureScore += 10;
    if (data.structure.links.internal >= 5) {
      structureScore += 10;
    }
  }
  
  if (data.structure?.links?.external > 0) structureScore += 10;
  if (data.structure?.images?.length > 0) structureScore += 10;
  
  scores.structure = Math.min(structureScore, 100);
  
  // ────────────────────────────────────────────────────────────────
  // PERFORMANCE SCORE (0-100)
  // ────────────────────────────────────────────────────────────────
  
  let perfScore = 0;
  
  if (data.performance?.loadTime) {
    if (data.performance.loadTime < 1000) {
      perfScore += 60;
    } else if (data.performance.loadTime < 2000) {
      perfScore += 45;
    } else if (data.performance.loadTime < 3000) {
      perfScore += 30;
    } else if (data.performance.loadTime < 5000) {
      perfScore += 15;
    }
  }
  
  if (data.performance?.domReady) {
    if (data.performance.domReady < 800) {
      perfScore += 40;
    } else if (data.performance.domReady < 1500) {
      perfScore += 30;
    } else if (data.performance.domReady < 2500) {
      perfScore += 20;
    } else if (data.performance.domReady < 4000) {
      perfScore += 10;
    }
  }
  
  scores.performance = Math.min(perfScore, 100);
  
  // ────────────────────────────────────────────────────────────────
  // MOBILE SCORE (0-100)
  // ────────────────────────────────────────────────────────────────
  
  let mobileScore = 0;
  
  if (data.mobile?.hasViewport) {
    mobileScore += 50;
  }
  
  if (data.mobile?.viewportContent?.includes('width=device-width')) {
    mobileScore += 30;
  }
  
  if (data.mobile?.responsive === 'mobile' || data.mobile?.responsive === 'tablet') {
    mobileScore += 20;
  }
  
  scores.mobile = Math.min(mobileScore, 100);
  
  // ────────────────────────────────────────────────────────────────
  // OVERALL SCORE (Weighted average)
  // ────────────────────────────────────────────────────────────────
  
  scores.overall = Math.round(
    (scores.meta * 0.25) +
    (scores.content * 0.25) +
    (scores.structure * 0.20) +
    (scores.performance * 0.15) +
    (scores.mobile * 0.15)
  );
  
  return scores;
}

// Detect SEO issues from page data
function detectSEOIssues(data) {
  const issues = [];
  
  // Critical issues
  if (!data.meta?.title) {
    issues.push({
      severity: 'critical',
      category: 'meta',
      message: 'Balise <title> manquante',
      fix: 'Ajouter une balise <title> unique et descriptive (30-60 caractères)'
    });
  }
  
  if (data.meta?.title && (data.meta.title.length < 30 || data.meta.title.length > 60)) {
    issues.push({
      severity: 'warning',
      category: 'meta',
      message: `Title de ${data.meta.title.length} caractères (recommandé: 30-60)`,
      fix: 'Ajuster la longueur du title pour un affichage optimal dans Google'
    });
  }
  
  if (!data.meta?.description) {
    issues.push({
      severity: 'critical',
      category: 'meta',
      message: 'Meta description manquante',
      fix: 'Ajouter une meta description accrocheuse (120-160 caractères)'
    });
  }
  
  if (data.meta?.description && (data.meta.description.length < 120 || data.meta.description.length > 160)) {
    issues.push({
      severity: 'warning',
      category: 'meta',
      message: `Meta description de ${data.meta.description.length} caractères (recommandé: 120-160)`,
      fix: 'Ajuster la longueur de la meta description'
    });
  }
  
  if (!data.structure?.h1 || data.structure.h1.length === 0) {
    issues.push({
      severity: 'critical',
      category: 'structure',
      message: 'Aucune balise <h1> trouvée',
      fix: 'Ajouter une balise <h1> unique contenant le titre principal de la page'
    });
  } else if (data.structure.h1.length > 1) {
    issues.push({
      severity: 'warning',
      category: 'structure',
      message: `${data.structure.h1.length} balises <h1> trouvées (recommandé: 1 seule)`,
      fix: 'Garder une seule balise <h1> et convertir les autres en <h2>'
    });
  }
  
  if (!data.mobile?.hasViewport) {
    issues.push({
      severity: 'critical',
      category: 'mobile',
      message: 'Meta viewport manquante - site non mobile-friendly',
      fix: 'Ajouter <meta name="viewport" content="width=device-width, initial-scale=1">'
    });
  }
  
  const imagesWithoutAlt = data.structure?.images?.filter(img => !img.hasAlt).length || 0;
  if (imagesWithoutAlt > 0) {
    issues.push({
      severity: 'warning',
      category: 'accessibility',
      message: `${imagesWithoutAlt} image(s) sans attribut alt`,
      fix: 'Ajouter des descriptions alt à toutes les images'
    });
  }
  
  if (!data.meta?.canonical) {
    issues.push({
      severity: 'warning',
      category: 'meta',
      message: 'Pas de balise canonical',
      fix: 'Ajouter une balise canonical pour éviter le duplicate content'
    });
  }
  
  if (data.content?.wordCount < 300) {
    issues.push({
      severity: 'warning',
      category: 'content',
      message: `Contenu court (${data.content.wordCount} mots, recommandé: 300+)`,
      fix: 'Enrichir le contenu avec au moins 300 mots'
    });
  }
  
  if (!data.structure?.h2 || data.structure.h2.length === 0) {
    issues.push({
      severity: 'warning',
      category: 'structure',
      message: 'Aucune balise <h2> trouvée',
      fix: 'Structurer le contenu avec des sous-titres <h2>'
    });
  }
  
  if (data.performance?.loadTime > 3000) {
    issues.push({
      severity: 'warning',
      category: 'performance',
      message: `Temps de chargement lent (${Math.round(data.performance.loadTime / 1000)}s)`,
      fix: 'Optimiser les images, minifier CSS/JS, utiliser un CDN'
    });
  }
  
  if (!data.meta?.ogTitle || !data.meta?.ogDescription || !data.meta?.ogImage) {
    issues.push({
      severity: 'info',
      category: 'social',
      message: 'Métadonnées Open Graph incomplètes',
      fix: 'Ajouter og:title, og:description et og:image pour un meilleur partage sur les réseaux sociaux'
    });
  }
  
  if (!data.content?.hasSchema) {
    issues.push({
      severity: 'info',
      category: 'structured-data',
      message: 'Pas de Schema.org détecté',
      fix: 'Ajouter des données structurées JSON-LD pour les rich snippets'
    });
  }
  
  return issues;
}

// Generate AI recommendations using Claude
async function generateAIRecommendations(data, scores, issues) {
  try {
    const prompt = `Tu es un expert SEO. Analyse ces données de page web et fournis des recommandations concrètes et actionnables.

DONNÉES DE LA PAGE:
URL: ${data.page?.url || 'N/A'}

MÉTADONNÉES:
- Title: ${data.meta?.title || 'MANQUANT'} (${data.meta?.title?.length || 0} caractères)
- Description: ${data.meta?.description || 'MANQUANT'} (${data.meta?.description?.length || 0} caractères)
- Canonical: ${data.meta?.canonical || 'MANQUANT'}
- Open Graph: ${data.meta?.ogTitle ? 'Oui' : 'Non'}

STRUCTURE:
- H1: ${data.structure?.h1?.length || 0} (${data.structure?.h1?.map(h => h.text).join(', ') || 'aucun'})
- H2: ${data.structure?.h2?.length || 0}
- Images: ${data.structure?.images?.length || 0} (${data.structure?.images?.filter(i => i.hasAlt).length || 0} avec ALT)
- Liens internes: ${data.structure?.links?.internal || 0}
- Liens externes: ${data.structure?.links?.external || 0}

CONTENU:
- Nombre de mots: ${data.content?.wordCount || 0}
- Paragraphes: ${data.content?.paragraphs || 0}
- Schema.org: ${data.content?.hasSchema ? 'Oui' : 'Non'}

SCORES SEO:
- Global: ${scores.overall}/100
- Meta: ${scores.meta}/100
- Contenu: ${scores.content}/100
- Structure: ${scores.structure}/100
- Performance: ${scores.performance}/100
- Mobile: ${scores.mobile}/100

PROBLÈMES DÉTECTÉS:
${issues.map(i => `- [${i.severity.toUpperCase()}] ${i.message}`).join('\n')}

Fournis 5-7 recommandations prioritaires au format JSON:
{
  "recommendations": [
    {
      "title": "Titre court et actionnable",
      "description": "Explication détaillée du problème et de son impact",
      "priority": "high|medium|low",
      "implementation": "Code exact ou étapes précises pour corriger",
      "expectedImpact": "Gain SEO attendu"
    }
  ]
}

Focus sur les actions qui auront le plus d'impact sur le référencement.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.recommendations || [];
    }
    
    return [];
    
  } catch (error) {
    console.error('❌ AI Recommendations error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════

// Register new user and organization
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, organizationName } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName || !organizationName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create organization
    const organization = new Organization({
      name: organizationName
    });
    await organization.save();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      organizationId: organization._id,
      role: 'admin' // First user is admin
    });
    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, organizationId: organization._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      organization: {
        id: organization._id,
        name: organization.name
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Get organization
    const organization = await Organization.findById(user.organizationId);

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, organizationId: user.organizationId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      organization: {
        id: organization._id,
        name: organization.name,
        plan: organization.plan
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    
    res.json({
      user: {
        id: req.user._id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role
      },
      organization: {
        id: organization._id,
        name: organization.name,
        plan: organization.plan
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - WEBSITES
// ═══════════════════════════════════════════════════════════════════

// Get all websites for organization
app.get('/api/websites', authenticateToken, async (req, res) => {
  try {
    const { language } = req.query;
    
    const query = { organizationId: req.user.organizationId };
    if (language) {
      query.language = language;
    }

    const websites = await Website.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      websites
    });
  } catch (error) {
    console.error('Get websites error:', error);
    res.status(500).json({ error: 'Failed to fetch websites' });
  }
});


// ═══════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS - Auto SEO Analysis
// ═══════════════════════════════════════════════════════════════════


async function fetchAndAnalyzePage(url) {
  try {
    console.log('📡 Fetching page:', url);
    
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'AlteaSEO-Bot/1.0 (Initial Site Analysis)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      validateStatus: (status) => status < 500
    });
    
    if (response.status >= 400) {
      throw new Error(`Page returned HTTP ${response.status}`);
    }
    
    const html = response.data;
    const $ = cheerio.load(html);
    const urlObj = new URL(url);
    
    console.log('✅ Page fetched, extracting data...');
    
    return extractPageDataFromHTML($, url, urlObj);
    
  } catch (error) {
    console.error('Error fetching page:', error.message);
    throw new Error(`Failed to fetch page: ${error.message}`);
  }
}

async function createAutoRule(issue, pageData, website, analysisId) {
  try {
    let ruleData = null;
    
    console.log(`🔍 Processing issue: ${issue.message} (${issue.category})`);
    
    switch (issue.category) {
      case 'meta':
        if (issue.message.toLowerCase().includes('title')) {
          ruleData = createTitleRule(issue, pageData, website);
        } else if (issue.message.toLowerCase().includes('description')) {
          ruleData = createDescriptionRule(issue, pageData, website);
        } else if (issue.message.toLowerCase().includes('canonical')) {
          ruleData = createCanonicalRule(issue, pageData, website);
        }
        break;
        
      case 'structure':
        if (issue.message.toLowerCase().includes('h1')) {
          ruleData = createH1Rule(issue, pageData, website);
        }
        break;
        
      case 'mobile':
        if (issue.message.toLowerCase().includes('viewport')) {
          ruleData = createViewportRule(issue, pageData, website);
        }
        break;
        
      case 'accessibility':
        if (issue.message.toLowerCase().includes('alt')) {
          ruleData = createAltRule(issue, pageData, website);
        }
        break;
    }
    
    if (!ruleData) {
      console.log(`⏭️  No rule template for: ${issue.message}`);
      return null;
    }
    
    const rule = new SEORule({
      ...ruleData,
      websiteId: website._id,
      organizationId: website.organizationId,
      createdBy: 'auto-analysis',
      sourceAnalysisId: analysisId,
      status: 'draft',
      isActive: false,
      autoGenerated: true,
      createdAt: new Date()
    });
    
    await rule.save();
    console.log(`✅ Auto-rule created: ${rule.name} (ID: ${rule._id})`);
    
    return {
      id: rule._id,
      name: rule.name,
      type: rule.ruleType,
      status: rule.status
    };
    
  } catch (error) {
    console.error('Error creating auto-rule:', error);
    return null;
  }
}

function createTitleRule(issue, pageData, website) {
  const currentTitle = pageData.meta?.title || '';
  const siteName = website.name;
  
  let suggestedTitle = currentTitle;
  
  if (!currentTitle || currentTitle.trim() === '') {
    suggestedTitle = `${siteName} - Accueil`;
  } else if (currentTitle.length < 30) {
    suggestedTitle = `${currentTitle} | ${siteName}`;
  } else if (currentTitle.length > 60) {
    suggestedTitle = currentTitle.substring(0, 57) + '...';
  }
  
  if (suggestedTitle.length < 30) {
    const domain = new URL(website.url).hostname;
    suggestedTitle = `${suggestedTitle} - ${domain}`;
  }
  
  console.log(`📝 Title rule: "${currentTitle}" → "${suggestedTitle}"`);
  
  return {
    name: '🏷️ [AUTO] Correction: Meta Title',
    description: `Titre optimisé automatiquement (${suggestedTitle.length} caractères). Problème: ${issue.message}`,
    ruleType: 'meta_title',
    priority: 'high',
    conditions: [{
      type: 'url_pattern',
      operator: 'equals',
      value: website.url
    }],
    actions: [{
      type: 'set_meta_title',
      value: suggestedTitle,
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

function createDescriptionRule(issue, pageData, website) {
  const currentDescription = pageData.meta?.description || '';
  const siteName = website.name;
  const domain = new URL(website.url).hostname;
  
  let suggestedDescription = currentDescription;
  
  if (!currentDescription || currentDescription.trim() === '') {
    suggestedDescription = `Découvrez ${siteName}. Visitez ${domain} pour en savoir plus. [Personnalisez cette description pour un meilleur SEO - 120-160 caractères recommandés]`;
  } else if (currentDescription.length < 120) {
    suggestedDescription = `${currentDescription} Découvrez plus sur ${siteName}.`;
  } else if (currentDescription.length > 160) {
    suggestedDescription = currentDescription.substring(0, 157) + '...';
  }
  
  console.log(`📝 Description rule: ${suggestedDescription.length} caractères`);
  
  return {
    name: '📝 [AUTO] Correction: Meta Description',
    description: `Description optimisée (${suggestedDescription.length} caractères). Problème: ${issue.message}`,
    ruleType: 'meta_description',
    priority: 'high',
    conditions: [{
      type: 'url_pattern',
      operator: 'equals',
      value: website.url
    }],
    actions: [{
      type: 'set_meta_description',
      value: suggestedDescription,
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

function createH1Rule(issue, pageData, website) {
  const currentH1s = pageData.structure?.h1 || [];
  const siteName = website.name;
  
  let suggestedH1;
  let action;
  
  if (currentH1s.length === 0) {
    suggestedH1 = siteName;
    action = 'add_h1';
  } else if (currentH1s.length > 1) {
    suggestedH1 = currentH1s[0].text;
    action = 'keep_first_h1_only';
  } else {
    const h1 = currentH1s[0].text;
    if (h1.length < 20) {
      suggestedH1 = `${h1} - ${siteName}`;
      action = 'replace_h1';
    } else if (h1.length > 70) {
      suggestedH1 = h1.substring(0, 67) + '...';
      action = 'replace_h1';
    } else {
      suggestedH1 = h1;
      action = 'keep_h1';
    }
  }
  
  console.log(`📝 H1 rule: ${action.toUpperCase()} "${suggestedH1}"`);
  
  return {
    name: '🎯 [AUTO] Correction: Balise H1',
    description: `H1 optimisé (${suggestedH1.length} caractères). Problème: ${issue.message}`,
    ruleType: 'heading_h1',
    priority: 'high',
    conditions: [{
      type: 'url_pattern',
      operator: 'equals',
      value: website.url
    }],
    actions: [{
      type: action,
      value: suggestedH1,
      selector: 'h1:first',
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

function createCanonicalRule(issue, pageData, website) {
  return {
    name: '🔗 [AUTO] Correction: Canonical URL',
    description: `Ajout automatique de la balise canonical. Problème: ${issue.message}`,
    ruleType: 'canonical',
    priority: 'medium',
    conditions: [{
      type: 'all_pages',
      operator: 'always',
      value: true
    }],
    actions: [{
      type: 'add_canonical',
      value: '{{current_url}}',
      dynamicValue: true,
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

function createViewportRule(issue, pageData, website) {
  return {
    name: '📱 [AUTO] Correction: Meta Viewport',
    description: `Ajout viewport pour responsive design. Problème: ${issue.message}`,
    ruleType: 'meta_viewport',
    priority: 'high',
    conditions: [{
      type: 'all_pages',
      operator: 'always',
      value: true
    }],
    actions: [{
      type: 'add_meta_viewport',
      value: 'width=device-width, initial-scale=1',
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

function createAltRule(issue, pageData, website) {
  const imagesWithoutAlt = pageData.structure?.images?.filter(img => !img.hasAlt) || [];
  
  return {
    name: '🖼️ [AUTO] Correction: Alt text images',
    description: `Ajout automatique d'attributs alt pour ${imagesWithoutAlt.length} image(s). Problème: ${issue.message}`,
    ruleType: 'image_alt',
    priority: 'medium',
    conditions: [{
      type: 'element_exists',
      operator: 'selector',
      value: 'img:not([alt])'
    }],
    actions: [{
      type: 'add_image_alt',
      mode: 'auto_generate',
      fallback: 'Image',
      reason: `Auto-generated: ${issue.fix}`
    }],
    isActive: false,
    autoGenerated: true
  };
}

console.log('✅ Auto-analysis helper functions loaded');


// Create website
app.post('/api/websites', authenticateToken, authorizeRole('admin', 'user'), async (req, res) => {
  try {
    const { name, url, language } = req.body;

    
    if (!name || !url || !language) {
      return res.status(400).json({ error: 'Name, URL, and language are required' });
    }

    let urlObj;
    try {
      urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return res.status(400).json({ error: 'URL must use HTTP or HTTPS protocol' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const organization = await Organization.findById(req.user.organizationId);
    const websiteCount = await Website.countDocuments({ organizationId: req.user.organizationId });
    
    if (websiteCount >= organization.settings.maxSites) {
      return res.status(403).json({ 
        error: `Maximum number of websites (${organization.settings.maxSites}) reached. Please upgrade your plan.` 
      });
    }

    console.log('🌐 Creating new website:', name, url);

    
    const website = new Website({
      name,
      url,
      language,
      organizationId: req.user.organizationId,
      siteId: generateSiteId()
    });
    await website.save();
    
    console.log('✅ Website created:', website._id);

    
    let analysisResult = null;
    let autoRulesCreated = [];
    
    try {
      console.log('🔍 Starting automatic SEO analysis for:', url);
      
      const pageData = await fetchAndAnalyzePage(url);
      
      const scores = calculateDetailedSEOScore(pageData);
      console.log(`📊 Scores calculated - Overall: ${scores.overall}/100`);
      
      const issues = detectSEOIssues(pageData);
      console.log(`⚠️  ${issues.length} issues detected`);
      
      let recommendations = [];
      try {
        recommendations = await generateAIRecommendations(pageData, scores, issues);
        console.log(`✅ Generated ${recommendations.length} AI recommendations`);
      } catch (error) {
        console.warn('⚠️  AI recommendations failed:', error.message);
      }
      
      const analysis = await SEOAnalysis.create({
        websiteId: website._id,
        organizationId: website.organizationId,
        url,
        path: '/',
        timestamp: new Date(),
        data: pageData,
        score: scores,
        issues,
        recommendations
      });
      
      console.log('✅ Initial SEO analysis saved:', analysis._id);
      
      
      const criticalIssues = issues.filter(i => i.severity === 'critical');
      console.log(`🔧 Creating auto-rules for ${criticalIssues.length} critical issues`);
      
      for (const issue of criticalIssues) {
        try {
          const rule = await createAutoRule(issue, pageData, website, analysis._id);
          if (rule) {
            autoRulesCreated.push(rule);
          }
        } catch (error) {
          console.error('Error creating auto-rule:', error);
        }
      }
      
      console.log(`✅ Created ${autoRulesCreated.length} automatic rules`);
      
      analysisResult = {
        analysisId: analysis._id,
        score: scores,
        issuesCount: issues.length,
        criticalIssuesCount: criticalIssues.length,
        rulesCreated: autoRulesCreated.length,
        recommendations: recommendations.slice(0, 5) // Top 5
      };
      
    } catch (error) {
      console.error('⚠️  Auto-analysis failed:', error);
      console.error('Stack:', error.stack);
    }

    
    res.status(201).json({
      success: true,
      website,
      analysis: analysisResult,
      message: analysisResult 
        ? `Site créé avec succès! Score SEO: ${analysisResult.score.overall}/100. ${autoRulesCreated.length} règle(s) créée(s) automatiquement.`
        : 'Site créé avec succès!'
    });
    
  } catch (error) {
    console.error('❌ Create website error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create website',
      message: error.message 
    });
  }
});



// Get single website
app.get('/api/websites/:id', authenticateToken, async (req, res) => {
  try {
    const website = await Website.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    res.json({
      success: true,
      website
    });
  } catch (error) {
    console.error('Get website error:', error);
    res.status(500).json({ error: 'Failed to fetch website' });
  }
});

// Update website
app.put('/api/websites/:id', authenticateToken, authorizeRole('admin', 'user'), async (req, res) => {
  try {
    const { name, url, language, settings } = req.body;

    const website = await Website.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    if (name) website.name = name;
    if (url) website.url = url;
    if (language) website.language = language;
    if (settings) website.settings = { ...website.settings, ...settings };

    await website.save();

    res.json({
      success: true,
      website
    });
  } catch (error) {
    console.error('Update website error:', error);
    res.status(500).json({ error: 'Failed to update website' });
  }
});

// Delete website
app.delete('/api/websites/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const website = await Website.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    // Delete associated content and analytics
    await Content.deleteMany({ websiteId: website._id });
    await Analytics.deleteMany({ websiteId: website._id });

    res.json({
      success: true,
      message: 'Website deleted successfully'
    });
  } catch (error) {
    console.error('Delete website error:', error);
    res.status(500).json({ error: 'Failed to delete website' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - AI CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════════

app.post('/api/content/generate', authenticateToken, async (req, res) => {
  try {
    const { websiteId, type, topic, keywords, language, tone, length } = req.body;

    // Validation
    if (!websiteId || !type || !topic || !language) {
      return res.status(400).json({ 
        error: 'Website ID, content type, topic, and language are required' 
      });
    }

    // Verify website ownership
    const website = await Website.findOne({
      _id: websiteId,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    // Language names mapping
    const languageNames = {
      'en': 'English',
      'fr': 'French',
      'es': 'Spanish',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'nl': 'Dutch',
      'pl': 'Polish',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ar': 'Arabic'
    };

    // Content type instructions
    const typeInstructions = {
      'blog-post': 'Write a comprehensive, engaging blog post',
      'product-description': 'Write a compelling product description',
      'meta-tags': 'Generate SEO-optimized meta title and description',
      'faq': 'Create a helpful FAQ section with questions and answers',
      'landing-page': 'Write persuasive landing page copy',
      'social-media': 'Create engaging social media post content'
    };

    // Build prompt for Claude
    const prompt = `You are an expert SEO content writer. ${typeInstructions[type]} in ${languageNames[language]}.

Topic: ${topic}
${keywords && keywords.length > 0 ? `Keywords to include: ${keywords.join(', ')}` : ''}
${tone ? `Tone: ${tone}` : 'Tone: Professional and engaging'}
${length ? `Target length: ${length} words` : ''}

Requirements:
- Write entirely in ${languageNames[language]}
- Make it SEO-friendly and include the keywords naturally
- Use clear, engaging language
- Format with proper headings and paragraphs
- Make it informative and valuable to readers

Generate the content now:`;

    // Call Claude AI
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const generatedContent = message.content[0].text;

    // Calculate metadata
    const wordCount = generatedContent.split(/\s+/).length;
    const readingTime = calculateReadingTime(generatedContent);
    const seoScore = calculateSEOScore(generatedContent, keywords || []);

    // Save content to database
    const content = new Content({
      websiteId,
      organizationId: req.user.organizationId,
      type,
      language,
      topic,
      keywords: keywords || [],
      content: generatedContent,
      metadata: {
        wordCount,
        readingTime,
        seoScore
      },
      createdBy: req.user._id
    });
    await content.save();

    // Update website stats
    website.stats.contentGenerated += 1;
    await website.save();

    res.json({
      success: true,
      content: {
        id: content._id,
        text: generatedContent,
        metadata: {
          wordCount,
          readingTime,
          seoScore
        }
      }
    });
  } catch (error) {
    console.error('Content generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate content',
      details: error.message 
    });
  }
});

// Get content history
app.get('/api/content', authenticateToken, async (req, res) => {
  try {
    const { websiteId, type, language, limit = 20 } = req.query;

    const query = { organizationId: req.user.organizationId };
    if (websiteId) query.websiteId = websiteId;
    if (type) query.type = type;
    if (language) query.language = language;

    const contents = await Content.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('websiteId', 'name url');

    res.json({
      success: true,
      contents
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// Get single content
app.get('/api/content/:id', authenticateToken, async (req, res) => {
  try {
    const content = await Content.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).populate('websiteId', 'name url');

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - ANALYTICS & TRACKING
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// TRACKING PIXEL ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// Main tracking pixel endpoint - /api/pixel.gif
app.get('/api/pixel.gif', async (req, res) => {
  try {
    // Set CORS headers explicitly for pixel tracking
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { siteId, data } = req.query;

    if (!siteId) {
      console.log('⚠️  Pixel: No siteId provided');
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': gif.length
      });
      return res.end(gif);
    }

    // Parse tracking data
    let pageData = {};
    if (data) {
      try {
        pageData = JSON.parse(decodeURIComponent(data));
      } catch (e) {
        console.error('Failed to parse pixel data:', e);
      }
    }

    // Find website by MongoDB _id
    const website = await Website.findOne({ siteId: siteId });
    
    if (website) {
      // Save analytics event
      const analytics = new Analytics({
        websiteId: website._id,
        organizationId: website.organizationId,
        pageUrl: pageData.url || pageData.path || '/',
        event: {
          type: 'pageview',
          data: pageData.meta || {}
        },
        userAgent: pageData.userAgent || req.headers['user-agent'],
        referrer: pageData.referrer || req.headers['referer'] || '',
        language: pageData.language || 'unknown',
        timestamp: new Date()
      });
      
      await analytics.save();

      // Update website stats
      if (!website.stats) {
        website.stats = { pagesAnalyzed: 0, totalWords: 0, avgSeoScore: 0, lastAnalyzed: null };
      }
      website.stats.pagesAnalyzed = (website.stats.pagesAnalyzed || 0) + 1;
      website.stats.lastAnalyzed = new Date();
      await website.save();
      
      console.log(`✅ Pixel tracked: ${website.name} - ${pageData.url || '/'}`);
    } else {
      console.log(`⚠️  Website not found for ID: ${siteId}`);
    }

    // Always return 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': gif.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(gif);
  } catch (error) {
    console.error('❌ Pixel tracking error:', error);
    // Always return GIF even on error
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(gif);
  }
});

// Alternative pixel endpoint without /api prefix
app.get('/pixel.gif', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    const { siteId, data } = req.query;

    if (siteId) {
      let pageData = {};
      if (data) {
        try {
          pageData = JSON.parse(decodeURIComponent(data));
        } catch (e) {
          console.error('Failed to parse pixel data:', e);
        }
      }

      const website = await Website.findOne({ siteId: siteId });
      
      if (website) {
        const analytics = new Analytics({
          websiteId: website._id,
          organizationId: website.organizationId,
          pageUrl: pageData.url || pageData.path || '/',
          event: {
            type: 'pageview',
            data: pageData.meta || {}
          },
          userAgent: pageData.userAgent || req.headers['user-agent'],
          referrer: pageData.referrer || req.headers['referer'] || '',
          language: pageData.language || 'unknown',
          timestamp: new Date()
        });
        
        await analytics.save();

        if (!website.stats) {
          website.stats = { pagesAnalyzed: 0, totalWords: 0, avgSeoScore: 0, lastAnalyzed: null };
        }
        website.stats.pagesAnalyzed = (website.stats.pagesAnalyzed || 0) + 1;
        website.stats.lastAnalyzed = new Date();
        await website.save();
        
        console.log(`✅ Pixel tracked (alt): ${website.name}`);
      }
    }

    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': gif.length
    });
    res.end(gif);
  } catch (error) {
    console.error('❌ Pixel tracking error (alt):', error);
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(gif);
  }
});

// Beacon API endpoint for modern browsers
app.post('/api/tracking/beacon', express.json(), async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    const { siteId, data, event } = req.body;
    
    if (!siteId) {
      return res.status(200).json({ success: true });
    }

    const website = await Website.findOne({ siteId: siteId });
    
    if (website) {
      const analytics = new Analytics({
        websiteId: website._id,
        organizationId: website.organizationId,
        pageUrl: data?.url || '/',
        event: {
          type: event || 'beacon',
          data: data || {}
        },
        userAgent: data?.userAgent || req.headers['user-agent'],
        referrer: data?.referrer || '',
        language: data?.language || 'unknown',
        timestamp: new Date()
      });
      
      await analytics.save();
      
      if (!website.stats) {
        website.stats = { pagesAnalyzed: 0, totalWords: 0, avgSeoScore: 0, lastAnalyzed: null };
      }
      website.stats.pagesAnalyzed = (website.stats.pagesAnalyzed || 0) + 1;
      website.stats.lastAnalyzed = new Date();
      await website.save();
      
      console.log(`✅ Beacon tracked: ${website.name} - ${event || 'beacon'}`);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Beacon tracking error:', error);
    res.status(200).json({ success: true }); // Always return success for beacon
  }
});

// Event tracking endpoint
app.post('/api/tracking/event', express.json(), async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    
    const { siteId, event, data } = req.body;
    
    if (!siteId || !event) {
      return res.status(200).json({ success: true });
    }

    const website = await Website.findOne({ siteId: siteId });
    
    if (website) {
      const analytics = new Analytics({
        websiteId: website._id,
        organizationId: website.organizationId,
        pageUrl: data?.url || '/',
        event: {
          type: event,
          data: data || {}
        },
        userAgent: req.headers['user-agent'],
        referrer: req.headers['referer'] || '',
        language: 'unknown',
        timestamp: new Date()
      });
      
      await analytics.save();
      
      console.log(`✅ Event tracked: ${website.name} - ${event}`);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Event tracking error:', error);
    res.status(200).json({ success: true });
  }
});

// Universal tracking pixel endpoint - supports both 'site' and 'siteId' parameters
app.get('/api/tracking/pixel', async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Support both 'site' and 'siteId' parameters
    const siteId = req.query.site || req.query.siteId;
    const data = req.query.data;

    if (!siteId) {
      console.log('⚠️  Tracking pixel: No siteId provided');
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': gif.length
      });
      return res.end(gif);
    }

    // Parse tracking data if provided
    let pageData = {};
    if (data) {
      try {
        pageData = JSON.parse(decodeURIComponent(data));
      } catch (e) {
        console.error('Failed to parse pixel data:', e);
      }
    }

    // Find website by MongoDB _id
    const website = await Website.findOne({ siteId: siteId });
    
    if (website) {
      // Save analytics event
      const analytics = new Analytics({
        websiteId: website._id,
        organizationId: website.organizationId,
        pageUrl: pageData.url || pageData.path || req.headers['referer'] || '/',
        event: {
          type: 'pageview',
          data: pageData.meta || {}
        },
        userAgent: pageData.userAgent || req.headers['user-agent'],
        referrer: pageData.referrer || req.headers['referer'] || '',
        language: pageData.language || req.headers['accept-language'] || 'unknown',
        timestamp: new Date()
      });
      
      await analytics.save();

      // Update website stats
      if (!website.stats) {
        website.stats = { pagesAnalyzed: 0, totalWords: 0, avgSeoScore: 0, lastAnalyzed: null };
      }
      website.stats.pagesAnalyzed = (website.stats.pagesAnalyzed || 0) + 1;
      website.stats.lastAnalyzed = new Date();
      await website.save();
      
      console.log(`✅ Tracking pixel: ${website.name} - ${pageData.url || req.headers['referer'] || '/'}`);
    } else {
      console.log(`⚠️  Website not found for ID: ${siteId}`);
    }

    // Always return 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': gif.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(gif);
  } catch (error) {
    console.error('❌ Tracking pixel error:', error);
    // Always return GIF even on error
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(gif);
  }
});

// Get analytics data
app.get('/api/analytics', authenticateToken, async (req, res) => {
  try {
    // Accept both 'website' and 'websiteId' parameters for flexibility
    const websiteId = req.query.websiteId || req.query.website;
    const { startDate, endDate, limit = 100 } = req.query;

    if (!websiteId) {
      return res.status(400).json({ error: 'Website ID is required' });
    }

    // Verify website ownership
    const website = await Website.findOne({
      _id: websiteId,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    const query = { websiteId };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const analytics = await Analytics.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    // Calculate summary statistics
    const totalPageviews = analytics.filter(a => a.event.type === 'pageview').length;
    const uniquePages = [...new Set(analytics.map(a => a.pageUrl))].length;

    res.json({
      success: true,
      analytics,
      data: analytics, // Also include as 'data' for frontend compatibility
      summary: {
        totalPageviews,
        uniquePages,
        timeRange: {
          start: startDate || analytics[analytics.length - 1]?.timestamp,
          end: endDate || analytics[0]?.timestamp
        }
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get recent analytics activity
app.get('/api/analytics/recent', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;
    const limit = parseInt(req.query.limit) || 20;

    // Get recent analytics events from user's websites
    const websites = await Website.find({ organizationId }).select('_id name url');
    const websiteIds = websites.map(w => w._id);

    if (websiteIds.length === 0) {
      return res.json({
        success: true,
        activities: []
      });
    }

    // Get recent analytics
    const recentAnalytics = await Analytics.find({
      websiteId: { $in: websiteIds }
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('websiteId', 'name url');

    // Transform into activity format
    const activities = recentAnalytics.map(analytic => {
      const website = websites.find(w => w._id.toString() === analytic.websiteId.toString());
      const websiteName = website ? website.name : 'Unknown Site';
      
      let description = '';
      switch (analytic.event.type) {
        case 'pageview':
          description = `Page vue sur ${websiteName}: ${analytic.pageUrl}`;
          break;
        case 'click':
          description = `Clic sur ${websiteName}`;
          break;
        case 'scroll_depth':
          description = `Scroll ${analytic.event.data?.depth || ''} sur ${websiteName}`;
          break;
        case 'beacon':
          description = `Activité sur ${websiteName}`;
          break;
        default:
          description = `${analytic.event.type} sur ${websiteName}`;
      }

      return {
        type: analytic.event.type,
        description: description,
        createdAt: analytic.timestamp,
        websiteId: analytic.websiteId,
        websiteName: websiteName
      };
    });

    res.json({
      success: true,
      activities
    });
  } catch (error) {
    console.error('Get recent analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch recent activity',
      activities: []
    });
  }
});

// Get dashboard statistics
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const organizationId = req.user.organizationId;

    // Get counts
    const websitesCount = await Website.countDocuments({ organizationId });
    const contentCount = await Content.countDocuments({ organizationId });
    
    // Get total pages analyzed across all websites
    const websites = await Website.find({ organizationId });
    const totalPagesAnalyzed = websites.reduce((sum, site) => sum + site.stats.pagesAnalyzed, 0);
    
    // Get recent analytics (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentAnalytics = await Analytics.countDocuments({
      organizationId,
      timestamp: { $gte: sevenDaysAgo }
    });

    // Get recent content
    const recentContent = await Content.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('websiteId', 'name');

    res.json({
      success: true,
      stats: {
        websites: websitesCount,
        contentGenerated: contentCount,
        pagesAnalyzed: totalPagesAnalyzed,
        recentPageviews: recentAnalytics
      },
      recentContent
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// Get all users in organization
app.get('/api/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ 
      organizationId: req.user.organizationId 
    }).select('-password').sort({ createdAt: -1 });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Invite user to organization
app.post('/api/users/invite', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { email, firstName, lastName, role } = req.body;

    // Validation
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Check organization limits
    const organization = await Organization.findById(req.user.organizationId);
    const userCount = await User.countDocuments({ organizationId: req.user.organizationId });
    
    if (userCount >= organization.settings.maxUsers) {
      return res.status(403).json({ 
        error: `Maximum number of users (${organization.settings.maxUsers}) reached. Please upgrade your plan.` 
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      organizationId: req.user.organizationId,
      role
    });
    await user.save();

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      temporaryPassword: tempPassword,
      message: 'User invited successfully. Send them their temporary password.'
    });
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Update user
app.put('/api/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;

    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (role) user.role = role;
    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
app.delete('/api/users/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    // Prevent deleting self
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - SEO RULES MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

// 📋 GET ALL SEO RULES - Liste toutes les règles d'un site
app.get('/api/seo-rules', authenticateToken, async (req, res) => {
  try {
    const { websiteId, status, search, sortBy = 'priority', order = 'desc' } = req.query;

    // Build query
    const query = {
      organizationId: req.user.organizationId
    };

    // Filter by website if specified
    if (websiteId) {
      query.websiteId = websiteId;
    }

    // Filter by status if specified
    if (status) {
      query.status = status;
    }

    // Search in name or description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Sort
    const sortOrder = order === 'desc' ? -1 : 1;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    const rules = await SEORule.find(query)
      .populate('websiteId', 'name url')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .sort(sortOptions);

    res.json({
      success: true,
      count: rules.length,
      rules
    });
  } catch (error) {
    console.error('Get SEO rules error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO rules' });
  }
});

// 🔍 GET SINGLE SEO RULE - Récupère une règle spécifique
app.get('/api/seo-rules/:id', authenticateToken, async (req, res) => {
  try {
    const rule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('websiteId', 'name url language')
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email');

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    console.error('Get SEO rule error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO rule' });
  }
});

// ➕ CREATE SEO RULE - Crée une nouvelle règle SEO
app.post('/api/seo-rules', authenticateToken, async (req, res) => {
  try {
    const {
      websiteId,
      name,
      description,
      targeting,
      modifications,
      status = 'draft',
      priority = 0,
      abTesting,
      schedule,
      notes,
      tags
    } = req.body;

    // Validation
    if (!websiteId || !name || !targeting || !modifications) {
      return res.status(400).json({ 
        error: 'Missing required fields: websiteId, name, targeting, modifications' 
      });
    }

    // Verify website belongs to user's organization
    const website = await Website.findOne({
      _id: websiteId,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found or access denied' });
    }

    // Validate targeting
    if (!targeting.matchType || !targeting.urlPattern) {
      return res.status(400).json({ 
        error: 'Targeting must include matchType and urlPattern' 
      });
    }

    // Create rule
    const rule = new SEORule({
      websiteId,
      organizationId: req.user.organizationId,
      name,
      description,
      targeting,
      modifications,
      status,
      priority,
      abTesting,
      schedule,
      notes,
      tags,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await rule.save();

    // Populate before sending response
    await rule.populate('websiteId', 'name url');
    await rule.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'SEO rule created successfully',
      rule
    });
  } catch (error) {
    console.error('Create SEO rule error:', error);
    res.status(500).json({ error: 'Failed to create SEO rule' });
  }
});

// ✏️ UPDATE SEO RULE - Met à jour une règle existante
app.put('/api/seo-rules/:id', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      targeting,
      modifications,
      status,
      priority,
      abTesting,
      schedule,
      notes,
      tags
    } = req.body;

    // Find rule
    const rule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    // Update fields
    if (name !== undefined) rule.name = name;
    if (description !== undefined) rule.description = description;
    if (targeting !== undefined) rule.targeting = targeting;
    if (modifications !== undefined) rule.modifications = modifications;
    if (status !== undefined) rule.status = status;
    if (priority !== undefined) rule.priority = priority;
    if (abTesting !== undefined) rule.abTesting = abTesting;
    if (schedule !== undefined) rule.schedule = schedule;
    if (notes !== undefined) rule.notes = notes;
    if (tags !== undefined) rule.tags = tags;

    rule.lastModifiedBy = req.user._id;
    rule.updatedAt = new Date();

    await rule.save();

    // Populate before sending response
    await rule.populate('websiteId', 'name url');
    await rule.populate('lastModifiedBy', 'firstName lastName email');

    res.json({
      success: true,
      message: 'SEO rule updated successfully',
      rule
    });
  } catch (error) {
    console.error('Update SEO rule error:', error);
    res.status(500).json({ error: 'Failed to update SEO rule' });
  }
});

// 🗑️ DELETE SEO RULE - Supprime une règle
app.delete('/api/seo-rules/:id', authenticateToken, async (req, res) => {
  try {
    const rule = await SEORule.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    // Also delete associated performance data
    await SEORulePerformance.deleteMany({ ruleId: rule._id });

    res.json({
      success: true,
      message: 'SEO rule deleted successfully'
    });
  } catch (error) {
    console.error('Delete SEO rule error:', error);
    res.status(500).json({ error: 'Failed to delete SEO rule' });
  }
});

// 🔄 DUPLICATE SEO RULE - Duplique une règle existante
app.post('/api/seo-rules/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const originalRule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!originalRule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    // Create duplicate
    const duplicateRule = new SEORule({
      websiteId: originalRule.websiteId,
      organizationId: originalRule.organizationId,
      name: `${originalRule.name} (Copy)`,
      description: originalRule.description,
      targeting: originalRule.targeting,
      modifications: originalRule.modifications,
      status: 'draft', // Always set to draft
      priority: originalRule.priority,
      abTesting: originalRule.abTesting,
      schedule: originalRule.schedule,
      notes: originalRule.notes,
      tags: originalRule.tags,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await duplicateRule.save();
    await duplicateRule.populate('websiteId', 'name url');
    await duplicateRule.populate('createdBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'SEO rule duplicated successfully',
      rule: duplicateRule
    });
  } catch (error) {
    console.error('Duplicate SEO rule error:', error);
    res.status(500).json({ error: 'Failed to duplicate SEO rule' });
  }
});

// 🎯 ACTIVATE/DEACTIVATE SEO RULE - Change le statut
app.patch('/api/seo-rules/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'draft', 'testing'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be: active, inactive, draft, or testing' 
      });
    }

    const rule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    rule.status = status;
    rule.lastModifiedBy = req.user._id;
    rule.updatedAt = new Date();

    await rule.save();

    res.json({
      success: true,
      message: `SEO rule ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      rule: {
        id: rule._id,
        name: rule.name,
        status: rule.status
      }
    });
  } catch (error) {
    console.error('Update SEO rule status error:', error);
    res.status(500).json({ error: 'Failed to update SEO rule status' });
  }
});

// 🔍 GET RULES FOR URL - Récupère les règles actives pour une URL (UTILISÉ PAR LE PIXEL)
app.get('/api/seo-rules/for-url', async (req, res) => {
  try {
    const { siteId, url, language, device } = req.query;

    if (!siteId || !url) {
      return res.status(400).json({ error: 'Missing required parameters: siteId, url' });
    }

    // Find website by siteId
    const website = await Website.findOne({ siteId });
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }

    // Get active rules for this URL
    const rules = await SEORule.getActiveRulesForUrl(
      website._id,
      url,
      { language, device }
    );

    res.json({
      success: true,
      count: rules.length,
      rules: rules.map(rule => ({
        id: rule._id,
        name: rule.name,
        priority: rule.priority,
        modifications: rule.modifications,
        abTesting: rule.abTesting
      }))
    });
  } catch (error) {
    console.error('Get rules for URL error:', error);
    res.status(500).json({ error: 'Failed to fetch rules for URL' });
  }
});

// 📊 RECORD RULE IMPRESSION - Enregistre l'application d'une règle (APPELÉ PAR LE PIXEL)
app.post('/api/seo-rules/:id/impression', async (req, res) => {
  try {
    const { url, variant, loadTime } = req.body;

    const rule = await SEORule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    // Update rule stats
    await rule.recordImpression();

    // Record performance data
    const performance = new SEORulePerformance({
      ruleId: rule._id,
      websiteId: rule.websiteId,
      impressions: 1,
      url,
      variant,
      avgLoadTime: loadTime || 0
    });

    await performance.save();

    res.json({
      success: true,
      message: 'Impression recorded'
    });
  } catch (error) {
    console.error('Record impression error:', error);
    res.status(500).json({ error: 'Failed to record impression' });
  }
});

// 📈 GET RULE PERFORMANCE - Récupère les stats d'une règle
app.get('/api/seo-rules/:id/performance', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const rule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    // Build query for performance data
    const query = { ruleId: rule._id };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const performanceData = await SEORulePerformance.find(query).sort({ date: -1 });

    // Calculate aggregated stats
    const stats = {
      totalImpressions: 0,
      totalClicks: 0,
      avgCTR: 0,
      avgLoadTime: 0,
      totalErrors: 0
    };

    performanceData.forEach(p => {
      stats.totalImpressions += p.impressions;
      stats.totalClicks += p.clicks;
      stats.avgLoadTime += p.avgLoadTime || 0;
      stats.totalErrors += p.errors;
    });

    if (performanceData.length > 0) {
      stats.avgCTR = stats.totalClicks / stats.totalImpressions * 100;
      stats.avgLoadTime = stats.avgLoadTime / performanceData.length;
    }

    res.json({
      success: true,
      rule: {
        id: rule._id,
        name: rule.name,
        status: rule.status
      },
      stats,
      data: performanceData
    });
  } catch (error) {
    console.error('Get rule performance error:', error);
    res.status(500).json({ error: 'Failed to fetch rule performance' });
  }
});

// 🧪 TEST RULE MATCHING - Teste si une règle matche une URL
app.post('/api/seo-rules/:id/test-match', authenticateToken, async (req, res) => {
  try {
    const { url, language, device } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const rule = await SEORule.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'SEO rule not found' });
    }

    // Test URL matching
    const urlMatches = rule.matchesUrl(url);
    
    // Check if rule is active
    const isActive = rule.isActiveNow();

    // Check language
    let languageMatches = true;
    if (rule.targeting.languages && rule.targeting.languages.length > 0) {
      languageMatches = language ? rule.targeting.languages.includes(language) : false;
    }

    // Check device
    let deviceMatches = true;
    if (rule.targeting.devices && rule.targeting.devices.length > 0) {
      deviceMatches = device ? rule.targeting.devices.includes(device) : false;
    }

    const matches = urlMatches && isActive && languageMatches && deviceMatches;

    res.json({
      success: true,
      matches,
      details: {
        urlMatches,
        isActive,
        languageMatches: language ? languageMatches : 'not tested',
        deviceMatches: device ? deviceMatches : 'not tested'
      },
      rule: {
        name: rule.name,
        status: rule.status,
        targeting: rule.targeting
      }
    });
  } catch (error) {
    console.error('Test rule matching error:', error);
    res.status(500).json({ error: 'Failed to test rule matching' });
  }
});

// 📊 GET DASHBOARD STATS FOR ALL RULES - Vue d'ensemble
app.get('/api/seo-rules/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.query;

    const query = { organizationId: req.user.organizationId };
    if (websiteId) query.websiteId = websiteId;

    // Count by status
    const statusCounts = await SEORule.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get top performing rules
    const topRules = await SEORule.find(query)
      .sort({ 'stats.impressions': -1 })
      .limit(5)
      .populate('websiteId', 'name');

    // Calculate total impressions
    const totalStats = await SEORule.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalImpressions: { $sum: '$stats.impressions' },
          avgSuccessRate: { $avg: '$stats.performance.successRate' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        totalImpressions: totalStats[0]?.totalImpressions || 0,
        avgSuccessRate: totalStats[0]?.avgSuccessRate || 0,
        topRules: topRules.map(r => ({
          id: r._id,
          name: r.name,
          website: r.websiteId?.name,
          impressions: r.stats.impressions,
          status: r.status
        }))
      }
    });
  } catch (error) {
    console.error('Get SEO rules overview error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO rules overview' });
  }
});

// 🔄 BULK UPDATE RULES - Met à jour plusieurs règles en masse
app.patch('/api/seo-rules/bulk', authenticateToken, async (req, res) => {
  try {
    const { ruleIds, action, value } = req.body;

    if (!ruleIds || !Array.isArray(ruleIds) || ruleIds.length === 0) {
      return res.status(400).json({ error: 'ruleIds array is required' });
    }

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    let updateData = { lastModifiedBy: req.user._id, updatedAt: new Date() };

    switch (action) {
      case 'activate':
        updateData.status = 'active';
        break;
      case 'deactivate':
        updateData.status = 'inactive';
        break;
      case 'delete':
        const deleteResult = await SEORule.deleteMany({
          _id: { $in: ruleIds },
          organizationId: req.user.organizationId
        });
        return res.json({
          success: true,
          message: `${deleteResult.deletedCount} rules deleted`,
          count: deleteResult.deletedCount
        });
      case 'setPriority':
        if (value === undefined) {
          return res.status(400).json({ error: 'value is required for setPriority' });
        }
        updateData.priority = value;
        break;
      case 'addTag':
        if (!value) {
          return res.status(400).json({ error: 'value (tag) is required for addTag' });
        }
        const addTagResult = await SEORule.updateMany(
          {
            _id: { $in: ruleIds },
            organizationId: req.user.organizationId
          },
          { $addToSet: { tags: value }, ...updateData }
        );
        return res.json({
          success: true,
          message: `Tag added to ${addTagResult.modifiedCount} rules`,
          count: addTagResult.modifiedCount
        });
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    const result = await SEORule.updateMany(
      {
        _id: { $in: ruleIds },
        organizationId: req.user.organizationId
      },
      updateData
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} rules updated`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update rules error:', error);
    res.status(500).json({ error: 'Failed to bulk update rules' });
  }
});

// 🎯 EXPORT RULES - Exporte les règles en JSON
app.get('/api/seo-rules/export', authenticateToken, async (req, res) => {
  try {
    const { websiteId } = req.query;

    const query = { organizationId: req.user.organizationId };
    if (websiteId) query.websiteId = websiteId;

    const rules = await SEORule.find(query)
      .populate('websiteId', 'name url')
      .select('-__v -stats -createdBy -lastModifiedBy');

    res.json({
      success: true,
      exportDate: new Date().toISOString(),
      count: rules.length,
      rules
    });
  } catch (error) {
    console.error('Export rules error:', error);
    res.status(500).json({ error: 'Failed to export rules' });
  }
});

// 📥 IMPORT RULES - Importe des règles depuis JSON
app.post('/api/seo-rules/import', authenticateToken, async (req, res) => {
  try {
    const { rules, websiteId } = req.body;

    if (!rules || !Array.isArray(rules)) {
      return res.status(400).json({ error: 'rules array is required' });
    }

    if (!websiteId) {
      return res.status(400).json({ error: 'websiteId is required' });
    }

    // Verify website belongs to user's organization
    const website = await Website.findOne({
      _id: websiteId,
      organizationId: req.user.organizationId
    });

    if (!website) {
      return res.status(404).json({ error: 'Website not found or access denied' });
    }

    const importedRules = [];
    const errors = [];

    for (const ruleData of rules) {
      try {
        const rule = new SEORule({
          ...ruleData,
          websiteId,
          organizationId: req.user.organizationId,
          status: 'draft', // Always import as draft
          createdBy: req.user._id,
          lastModifiedBy: req.user._id,
          stats: {
            impressions: 0,
            performance: {
              errors: 0,
              successRate: 100
            }
          }
        });

        await rule.save();
        importedRules.push(rule);
      } catch (error) {
        errors.push({
          rule: ruleData.name || 'Unknown',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `${importedRules.length} rules imported successfully`,
      imported: importedRules.length,
      errors: errors.length,
      errorDetails: errors
    });
  } catch (error) {
    console.error('Import rules error:', error);
    res.status(500).json({ error: 'Failed to import rules' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ROOT ENDPOINT
// ═══════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({
    message: '✅ SEO Platform Multi-User API Running!',
    version: '2.1.0',
    features: [
      'Multi-user authentication',
      'Multi-site management',
      'Multi-language content generation (EN, FR, ES, DE, IT, PT, NL, PL, RU, ZH, JA, AR)',
      'AI-powered content creation with Claude',
      'Real-time analytics tracking',
      'Organization management',
      'Role-based access control',
      '✨ SEO Rules & Dynamic Tag Modifications',
      '✨ A/B Testing for SEO',
      '✨ Scheduled SEO Campaigns'
    ],
    endpoints: {
      auth: [
        'POST /api/auth/register',
        'POST /api/auth/login',
        'GET /api/auth/me'
      ],
      websites: [
        'GET /api/websites',
        'POST /api/websites',
        'GET /api/websites/:id',
        'PUT /api/websites/:id',
        'DELETE /api/websites/:id'
      ],
      content: [
        'POST /api/content/generate',
        'GET /api/content',
        'GET /api/content/:id'
      ],
      analytics: [
        'GET /api/pixel.gif',
        'GET /api/analytics',
        'GET /api/dashboard/stats'
      ],
      users: [
        'GET /api/users',
        'POST /api/users/invite',
        'PUT /api/users/:id',
        'DELETE /api/users/:id'
      ],
      seoRules: [
        'GET /api/seo-rules',
        'GET /api/seo-rules/:id',
        'POST /api/seo-rules',
        'PUT /api/seo-rules/:id',
        'DELETE /api/seo-rules/:id',
        'POST /api/seo-rules/:id/duplicate',
        'PATCH /api/seo-rules/:id/status',
        'GET /api/seo-rules/for-url',
        'POST /api/seo-rules/:id/impression',
        'GET /api/seo-rules/:id/performance',
        'POST /api/seo-rules/:id/test-match',
        'GET /api/seo-rules/stats/overview',
        'PATCH /api/seo-rules/bulk',
        'GET /api/seo-rules/export',
        'POST /api/seo-rules/import'
      ]
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES - SEO ANALYSIS (NEW)
// ═══════════════════════════════════════════════════════════════════

// 📊 POST /api/seo/analyze - Analyze page SEO and generate recommendations
app.post('/api/seo/analyze', async (req, res) => {
  try {
    const { siteId, url, data } = req.body;
    
    console.log('📊 SEO Analysis request for:', url);
    
    // Find website
    const website = await Website.findOne({ siteId });
    if (!website) {
      return res.status(404).json({ error: 'Website not found' });
    }
    
    // Calculate SEO scores
    const scores = calculateDetailedSEOScore(data);
    const issues = detectSEOIssues(data);
    
    // Generate AI recommendations
    let recommendations = [];
    try {
      recommendations = await generateAIRecommendations(data, scores, issues);
      console.log(`✅ Generated ${recommendations.length} AI recommendations`);
    } catch (error) {
      console.error('⚠️  AI recommendations failed:', error.message);
      // Continue without AI recommendations
    }
    
    // Save analysis in MongoDB
    const analysis = await SEOAnalysis.create({
      websiteId: website._id,
      organizationId: website.organizationId,
      url,
      path: data.page?.path || new URL(url).pathname,
      timestamp: new Date(),
      data,
      score: scores,
      issues,
      recommendations
    });
    
    console.log('✅ SEO Analysis saved:', analysis._id);
    
    res.json({
      success: true,
      analysisId: analysis._id,
      score: scores,
      issues,
      recommendations: recommendations.slice(0, 5),
      message: `SEO Score: ${scores.overall}/100`
    });
    
  } catch (error) {
    console.error('❌ SEO Analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message 
    });
  }
});

// 📋 GET /api/seo/analyses - Get SEO analyses
app.get('/api/seo/analyses', authenticateToken, async (req, res) => {
  try {
    const { websiteId, limit = 10 } = req.query;
    
    let query = { organizationId: req.user.organizationId };
    if (websiteId) {
      query.websiteId = websiteId;
    }
    
    const analyses = await SEOAnalysis.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('websiteId', 'name url');
    
    // Calculate summary stats
    const summary = {
      totalAnalyses: analyses.length,
      avgScore: analyses.length > 0 
        ? Math.round(analyses.reduce((sum, a) => sum + a.score.overall, 0) / analyses.length)
        : 0,
      criticalIssues: analyses.reduce((sum, a) => 
        sum + a.issues.filter(i => i.severity === 'critical').length, 0
      ),
      warnings: analyses.reduce((sum, a) => 
        sum + a.issues.filter(i => i.severity === 'warning').length, 0
      )
    };
    
    res.json({
      success: true,
      analyses,
      summary
    });
    
  } catch (error) {
    console.error('Get SEO analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
});

// 📊 GET /api/seo/analyses/:id - Get single SEO analysis
app.get('/api/seo/analyses/:id', authenticateToken, async (req, res) => {
  try {
    const analysis = await SEOAnalysis.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).populate('websiteId', 'name url');
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.json({
      success: true,
      analysis
    });
    
  } catch (error) {
    console.error('Get SEO analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// ✨ POST /api/seo/apply-optimization - Create SEO rule from recommendation
app.post('/api/seo/apply-optimization', authenticateToken, async (req, res) => {
  try {
    const { analysisId, recommendationIndex, modifications } = req.body;
    
    // Get analysis
    const analysis = await SEOAnalysis.findOne({
      _id: analysisId,
      organizationId: req.user.organizationId
    });
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    const recommendation = analysis.recommendations[recommendationIndex];
    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    
    // Create SEO rule from recommendation
    const rule = await SEORule.create({
      websiteId: analysis.websiteId,
      organizationId: analysis.organizationId,
      name: `Auto: ${recommendation.title}`,
      description: recommendation.description,
      urlPattern: analysis.path,
      matchType: 'exact',
      status: 'active',
      modifications: modifications || {},
      source: 'ai-recommendation',
      createdBy: req.user._id,
      createdAt: new Date()
    });
    
    console.log('✅ SEO Rule created from AI recommendation:', rule._id);
    
    res.json({
      success: true,
      rule,
      message: 'Optimization rule created successfully'
    });
    
  } catch (error) {
    console.error('Apply optimization error:', error);
    res.status(500).json({ error: 'Failed to apply optimization' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ═══════════════════════════════════════════════════════════════════
// DATABASE CONNECTION & SERVER START
// ═══════════════════════════════════════════════════════════════════

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  
  app.listen(PORT, () => {
    console.log('\n╔═════════════════════════════════════════════╗');
    console.log('║   🚀 SEO Platform Multi-User API Started   ║');
    console.log(`║   📡 Port: ${PORT}                             ║`);
    console.log('║   🌍 Multi-language: EN, FR, ES, DE, IT     ║');
    console.log('║   💥 Multi-user & Multi-site ready          ║');
    console.log('╚═════════════════════════════════════════════╝\n');
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});
