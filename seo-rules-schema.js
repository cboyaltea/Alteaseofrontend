// ╔═══════════════════════════════════════════════════════════════════╗
// ║                                                                   ║
// ║          🎯 SEO RULES SCHEMA - TAG MODIFICATION SYSTEM           ║
// ║                                                                   ║
// ║     Système complet de règles SEO pour modifier les tags         ║
// ║     dynamiquement via le pixel (comme OTTO SEO)                  ║
// ║                                                                   ║
// ╚═══════════════════════════════════════════════════════════════════╝

const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════════════
// SEO RULE SCHEMA - Configuration des modifications de tags
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

module.exports = {
  SEORule: mongoose.model('SEORule', seoRuleSchema),
  SEORulePerformance: mongoose.model('SEORulePerformance', seoRulePerformanceSchema)
};
