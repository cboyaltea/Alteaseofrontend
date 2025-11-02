// ╔═══════════════════════════════════════════════════════════════════╗
// ║                                                                   ║
// ║          🎯 SEO PIXEL SCRIPT - DYNAMIC TAG MODIFICATIONS         ║
// ║                                                                   ║
// ║     Script qui modifie dynamiquement les tags SEO sur les pages  ║
// ║     Version complète comme OTTO SEO                              ║
// ║                                                                   ║
// ╚═══════════════════════════════════════════════════════════════════╝

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════
  
  const CONFIG = {
    apiEndpoint: window.seoPixelConfig?.apiEndpoint || 'https://alteaseo-production.up.railway.app',
    siteId: window.seoPixelConfig?.siteId || null,
    debug: window.seoPixelConfig?.debug || false,
    language: window.seoPixelConfig?.language || document.documentElement.lang || 'en',
    device: getDeviceType(),
    retryAttempts: 3,
    retryDelay: 1000
  };

  // Validate configuration
  if (!CONFIG.siteId) {
    console.error('[SEO Pixel] Error: siteId is required. Please configure window.seoPixelConfig.siteId');
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 📊 VARIABLES GLOBALES
  // ═══════════════════════════════════════════════════════════════════
  
  let appliedRules = [];
  let startTime = Date.now();
  let originalTags = {};

  // ═══════════════════════════════════════════════════════════════════
  // 🛠️ UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  function getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  function log(...args) {
    if (CONFIG.debug) {
      console.log('[SEO Pixel]', ...args);
    }
  }

  function error(...args) {
    console.error('[SEO Pixel]', ...args);
  }

  function getCurrentUrl() {
    return window.location.pathname;
  }

  function getQueryParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 API COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════

  async function fetchRulesForCurrentPage(attempt = 1) {
    const url = getCurrentUrl();
    const apiUrl = `${CONFIG.apiEndpoint}/api/seo-rules/for-url?siteId=${CONFIG.siteId}&url=${encodeURIComponent(url)}&language=${CONFIG.language}&device=${CONFIG.device}`;

    try {
      log('Fetching rules from:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      log('Rules fetched successfully:', data);
      
      return data.rules || [];
    } catch (err) {
      error('Error fetching rules (attempt ' + attempt + '):', err);
      
      // Retry logic
      if (attempt < CONFIG.retryAttempts) {
        log('Retrying in', CONFIG.retryDelay, 'ms...');
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
        return fetchRulesForCurrentPage(attempt + 1);
      }
      
      return [];
    }
  }

  async function recordImpression(ruleId, variant = null) {
    const loadTime = Date.now() - startTime;
    const url = getCurrentUrl();

    try {
      await fetch(`${CONFIG.apiEndpoint}/api/seo-rules/${ruleId}/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          variant,
          loadTime
        })
      });
      
      log('Impression recorded for rule:', ruleId);
    } catch (err) {
      error('Error recording impression:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🎯 A/B TESTING
  // ═══════════════════════════════════════════════════════════════════

  function selectVariant(rule) {
    if (!rule.abTesting || !rule.abTesting.enabled || !rule.abTesting.variants) {
      return { modifications: rule.modifications, variant: null };
    }

    // Get or create persistent variant assignment
    const storageKey = `seo_variant_${rule.id}`;
    let assignedVariant = sessionStorage.getItem(storageKey);

    if (!assignedVariant) {
      // Assign variant based on percentage
      const random = Math.random() * 100;
      let cumulative = 0;

      for (const variant of rule.abTesting.variants) {
        cumulative += variant.percentage;
        if (random <= cumulative) {
          assignedVariant = variant.name;
          break;
        }
      }

      sessionStorage.setItem(storageKey, assignedVariant);
    }

    // Find the variant modifications
    const variant = rule.abTesting.variants.find(v => v.name === assignedVariant);
    
    return {
      modifications: variant ? variant.modifications : rule.modifications,
      variant: assignedVariant
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🏷️ TAG MODIFICATION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────
  // TITLE TAG
  // ─────────────────────────────────────────────────────────────────
  
  function modifyTitle(config) {
    if (!config.enabled) return;

    const titleEl = document.querySelector('title');
    if (!titleEl) {
      document.head.appendChild(document.createElement('title'));
    }

    const originalTitle = document.title;
    
    // Save original if not saved yet
    if (!originalTags.title) {
      originalTags.title = originalTitle;
    }

    let newTitle = '';

    switch (config.action) {
      case 'replace':
        newTitle = config.value;
        break;
      
      case 'prepend':
        newTitle = config.value + originalTitle;
        break;
      
      case 'append':
        newTitle = originalTitle + config.value;
        break;
      
      case 'template':
        newTitle = applyTemplate(config.template, {
          original: originalTitle,
          brand: window.seoPixelConfig?.brand || '',
          year: new Date().getFullYear()
        });
        break;
    }

    // Apply max length
    if (config.maxLength && newTitle.length > config.maxLength) {
      newTitle = newTitle.substring(0, config.maxLength - 3) + '...';
    }

    document.title = newTitle;
    log('Title modified:', newTitle);
  }

  // ─────────────────────────────────────────────────────────────────
  // META DESCRIPTION
  // ─────────────────────────────────────────────────────────────────
  
  function modifyMetaDescription(config) {
    if (!config.enabled) return;

    let metaDesc = document.querySelector('meta[name="description"]');
    
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }

    const originalDesc = metaDesc.getAttribute('content') || '';
    
    if (!originalTags.metaDescription) {
      originalTags.metaDescription = originalDesc;
    }

    let newDesc = '';

    switch (config.action) {
      case 'replace':
        newDesc = config.value;
        break;
      
      case 'prepend':
        newDesc = config.value + originalDesc;
        break;
      
      case 'append':
        newDesc = originalDesc + config.value;
        break;
      
      case 'template':
        newDesc = applyTemplate(config.template, {
          original: originalDesc,
          brand: window.seoPixelConfig?.brand || ''
        });
        break;
    }

    // Apply max length
    if (config.maxLength && newDesc.length > config.maxLength) {
      newDesc = newDesc.substring(0, config.maxLength - 3) + '...';
    }

    metaDesc.setAttribute('content', newDesc);
    log('Meta description modified:', newDesc);
  }

  // ─────────────────────────────────────────────────────────────────
  // META KEYWORDS
  // ─────────────────────────────────────────────────────────────────
  
  function modifyMetaKeywords(config) {
    if (!config.enabled) return;

    let metaKeywords = document.querySelector('meta[name="keywords"]');
    
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }

    const currentKeywords = metaKeywords.getAttribute('content') || '';
    const currentArray = currentKeywords ? currentKeywords.split(',').map(k => k.trim()) : [];

    let newKeywords = [];

    switch (config.action) {
      case 'replace':
        newKeywords = config.keywords;
        break;
      
      case 'add':
        newKeywords = [...new Set([...currentArray, ...config.keywords])];
        break;
      
      case 'remove':
        newKeywords = currentArray.filter(k => !config.keywords.includes(k));
        break;
    }

    metaKeywords.setAttribute('content', newKeywords.join(', '));
    log('Meta keywords modified:', newKeywords);
  }

  // ─────────────────────────────────────────────────────────────────
  // H1 TAG
  // ─────────────────────────────────────────────────────────────────
  
  function modifyH1(config) {
    if (!config.enabled) return;

    let h1Elements = document.querySelectorAll('h1');
    
    // If selector specified, use it
    if (config.selector) {
      h1Elements = document.querySelectorAll(config.selector);
    }

    switch (config.action) {
      case 'replace':
        if (h1Elements.length > 0) {
          const original = h1Elements[0].textContent;
          if (!originalTags.h1) originalTags.h1 = original;
          h1Elements[0].textContent = config.value;
          log('H1 replaced:', config.value);
        }
        break;
      
      case 'replace_all':
        h1Elements.forEach((h1, index) => {
          if (index === 0 && !originalTags.h1) {
            originalTags.h1 = h1.textContent;
          }
          h1.textContent = config.value;
        });
        log('All H1s replaced:', h1Elements.length);
        break;
      
      case 'prepend':
        if (h1Elements.length > 0) {
          const original = h1Elements[0].textContent;
          if (!originalTags.h1) originalTags.h1 = original;
          h1Elements[0].textContent = config.value + original;
          log('H1 prepended:', config.value);
        }
        break;
      
      case 'append':
        if (h1Elements.length > 0) {
          const original = h1Elements[0].textContent;
          if (!originalTags.h1) originalTags.h1 = original;
          h1Elements[0].textContent = original + config.value;
          log('H1 appended:', config.value);
        }
        break;
      
      case 'inject_if_missing':
        if (h1Elements.length === 0) {
          const h1 = document.createElement('h1');
          h1.textContent = config.value;
          
          // Determine insertion point
          let target = document.body;
          
          if (config.position === 'after_header') {
            target = document.querySelector('header') || document.body;
          } else if (config.position === 'before_main') {
            target = document.querySelector('main') || document.body;
          } else if (config.position === 'custom' && config.customSelector) {
            target = document.querySelector(config.customSelector) || document.body;
          }
          
          target.insertBefore(h1, target.firstChild);
          log('H1 injected:', config.value);
        }
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // OPEN GRAPH TAGS
  // ─────────────────────────────────────────────────────────────────
  
  function modifyOpenGraph(config) {
    if (!config.enabled || !config.tags) return;

    config.tags.forEach(tag => {
      let ogTag = document.querySelector(`meta[property="${tag.property}"]`);
      
      if (!ogTag) {
        ogTag = document.createElement('meta');
        ogTag.setAttribute('property', tag.property);
        document.head.appendChild(ogTag);
      }

      ogTag.setAttribute('content', tag.content);
      log('Open Graph tag set:', tag.property, '=', tag.content);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // TWITTER CARD TAGS
  // ─────────────────────────────────────────────────────────────────
  
  function modifyTwitterCard(config) {
    if (!config.enabled || !config.tags) return;

    config.tags.forEach(tag => {
      let twitterTag = document.querySelector(`meta[name="${tag.name}"]`);
      
      if (!twitterTag) {
        twitterTag = document.createElement('meta');
        twitterTag.setAttribute('name', tag.name);
        document.head.appendChild(twitterTag);
      }

      twitterTag.setAttribute('content', tag.content);
      log('Twitter Card tag set:', tag.name, '=', tag.content);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CANONICAL URL
  // ─────────────────────────────────────────────────────────────────
  
  function modifyCanonical(config) {
    if (!config.enabled) return;

    let canonical = document.querySelector('link[rel="canonical"]');

    switch (config.action) {
      case 'set':
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          document.head.appendChild(canonical);
        }
        
        const url = config.useCurrentUrl ? window.location.href.split('?')[0] : config.url;
        canonical.setAttribute('href', url);
        log('Canonical URL set:', url);
        break;
      
      case 'remove':
        if (canonical) {
          canonical.remove();
          log('Canonical URL removed');
        }
        break;
      
      case 'update':
        if (canonical && config.url) {
          canonical.setAttribute('href', config.url);
          log('Canonical URL updated:', config.url);
        }
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // ROBOTS META TAG
  // ─────────────────────────────────────────────────────────────────
  
  function modifyRobots(config) {
    if (!config.enabled || !config.directives) return;

    let robots = document.querySelector('meta[name="robots"]');
    
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }

    robots.setAttribute('content', config.directives.join(', '));
    log('Robots meta tag set:', config.directives.join(', '));
  }

  // ─────────────────────────────────────────────────────────────────
  // HREFLANG TAGS
  // ─────────────────────────────────────────────────────────────────
  
  function modifyHreflang(config) {
    if (!config.enabled || !config.alternates) return;

    // Remove existing hreflang tags
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());

    config.alternates.forEach(alternate => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', alternate.lang);
      link.setAttribute('href', alternate.url);
      document.head.appendChild(link);
      log('Hreflang tag added:', alternate.lang, '→', alternate.url);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // STRUCTURED DATA (JSON-LD)
  // ─────────────────────────────────────────────────────────────────
  
  function modifyStructuredData(config) {
    if (!config.enabled || !config.schemas) return;

    config.schemas.forEach(schema => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema.data, null, 2);
      document.head.appendChild(script);
      log('Structured data added:', schema.type);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CONTENT INJECTION
  // ─────────────────────────────────────────────────────────────────
  
  function injectContent(config) {
    if (!config.enabled || !config.blocks) return;

    config.blocks.forEach(block => {
      const container = document.createElement('div');
      container.innerHTML = block.html;
      
      if (block.cssClass) {
        container.className = block.cssClass;
      }

      if (block.hideFromUsers) {
        container.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
      }

      let target = null;

      switch (block.position) {
        case 'before_h1':
          target = document.querySelector('h1');
          if (target && block.insertMethod === 'before') {
            target.parentNode.insertBefore(container, target);
          }
          break;
        
        case 'after_h1':
          target = document.querySelector('h1');
          if (target) {
            target.parentNode.insertBefore(container, target.nextSibling);
          }
          break;
        
        case 'before_content':
          target = document.querySelector('main') || document.body;
          target.insertBefore(container, target.firstChild);
          break;
        
        case 'after_content':
          target = document.querySelector('main') || document.body;
          target.appendChild(container);
          break;
        
        case 'footer':
          target = document.querySelector('footer') || document.body;
          target.appendChild(container);
          break;
        
        case 'sidebar':
          target = document.querySelector('aside, .sidebar') || document.body;
          target.appendChild(container);
          break;
        
        case 'custom':
          if (block.customSelector) {
            target = document.querySelector(block.customSelector);
            if (target) {
              switch (block.insertMethod) {
                case 'prepend':
                  target.insertBefore(container, target.firstChild);
                  break;
                case 'append':
                  target.appendChild(container);
                  break;
                case 'before':
                  target.parentNode.insertBefore(container, target);
                  break;
                case 'after':
                  target.parentNode.insertBefore(container, target.nextSibling);
                  break;
                case 'replace':
                  target.parentNode.replaceChild(container, target);
                  break;
              }
            }
          }
          break;
      }

      log('Content injected at:', block.position);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // IMAGE ALT ATTRIBUTES
  // ─────────────────────────────────────────────────────────────────
  
  function modifyImageAlt(config) {
    if (!config.enabled || !config.rules) return;

    config.rules.forEach(rule => {
      const images = document.querySelectorAll(rule.selector || 'img');
      
      images.forEach(img => {
        const currentAlt = img.getAttribute('alt') || '';
        let newAlt = '';

        switch (rule.action) {
          case 'set':
            newAlt = rule.value;
            break;
          
          case 'append':
            newAlt = currentAlt + rule.value;
            break;
          
          case 'prepend':
            newAlt = rule.value + currentAlt;
            break;
          
          case 'template':
            const filename = img.src.split('/').pop().split('.')[0];
            newAlt = applyTemplate(rule.template, {
              filename,
              original: currentAlt,
              brand: window.seoPixelConfig?.brand || ''
            });
            break;
        }

        img.setAttribute('alt', newAlt);
      });

      log('Image ALT attributes modified for:', rule.selector);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 TEMPLATE SYSTEM
  // ═══════════════════════════════════════════════════════════════════

  function applyTemplate(template, variables) {
    let result = template;
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      result = result.replace(regex, variables[key]);
    });
    
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🎯 MAIN EXECUTION - APPLY RULES
  // ═══════════════════════════════════════════════════════════════════

  function applyRule(rule) {
    try {
      log('Applying rule:', rule.name);

      // Select variant if A/B testing
      const { modifications, variant } = selectVariant(rule);

      // Apply all modifications
      if (modifications.title) {
        modifyTitle(modifications.title);
      }

      if (modifications.metaDescription) {
        modifyMetaDescription(modifications.metaDescription);
      }

      if (modifications.metaKeywords) {
        modifyMetaKeywords(modifications.metaKeywords);
      }

      if (modifications.h1) {
        modifyH1(modifications.h1);
      }

      if (modifications.openGraph) {
        modifyOpenGraph(modifications.openGraph);
      }

      if (modifications.twitterCard) {
        modifyTwitterCard(modifications.twitterCard);
      }

      if (modifications.canonical) {
        modifyCanonical(modifications.canonical);
      }

      if (modifications.robots) {
        modifyRobots(modifications.robots);
      }

      if (modifications.hreflang) {
        modifyHreflang(modifications.hreflang);
      }

      if (modifications.structuredData) {
        modifyStructuredData(modifications.structuredData);
      }

      if (modifications.contentInjection) {
        injectContent(modifications.contentInjection);
      }

      if (modifications.imageAlt) {
        modifyImageAlt(modifications.imageAlt);
      }

      // Record this rule as applied
      appliedRules.push({
        id: rule.id,
        name: rule.name,
        variant
      });

      // Record impression
      recordImpression(rule.id, variant);

      log('Rule applied successfully:', rule.name);
    } catch (err) {
      error('Error applying rule:', rule.name, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🚀 INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async function init() {
    try {
      log('SEO Pixel initializing...');
      log('Configuration:', CONFIG);
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }

      // Fetch rules for current page
      const rules = await fetchRulesForCurrentPage();
      
      if (rules.length === 0) {
        log('No rules found for current page');
        return;
      }

      log('Found', rules.length, 'rule(s) to apply');

      // Apply all rules (already sorted by priority on backend)
      rules.forEach(rule => {
        applyRule(rule);
      });

      log('SEO Pixel initialization complete');
      log('Applied rules:', appliedRules);

      // Expose to window for debugging
      if (CONFIG.debug) {
        window.seoPixelAppliedRules = appliedRules;
        window.seoPixelOriginalTags = originalTags;
      }

    } catch (err) {
      error('Initialization error:', err);
    }
  }

  // Start initialization
  init();

  // ═══════════════════════════════════════════════════════════════════
  // 📊 EXPOSE PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  window.SEOPixel = {
    version: '1.0.0',
    config: CONFIG,
    appliedRules: () => appliedRules,
    originalTags: () => originalTags,
    reapply: init
  };

  log('SEO Pixel v1.0.0 loaded');

})();
