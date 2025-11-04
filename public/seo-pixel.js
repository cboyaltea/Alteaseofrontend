/**
 * SEO Analytics Pixel
 * Lightweight tracking script for SEO analytics
 */

(function() {
  'use strict';

  // Configuration
  const config = window.seoPixelConfig || {};
  const siteId = config.siteId;
  const apiEndpoint = config.apiEndpoint || '';
  const debug = config.debug || false;

  // Log helper
  function log(...args) {
    if (debug) {
      console.log('[SEO Pixel]', ...args);
    }
  }

  // Error helper
  function logError(...args) {
    if (debug) {
      console.error('[SEO Pixel]', ...args);
    }
  }

  // Validation
  if (!siteId) {
    logError('❌ siteId is required in window.seoPixelConfig');
    return;
  }

  if (!apiEndpoint) {
    logError('❌ apiEndpoint is required in window.seoPixelConfig');
    return;
  }

  log('✅ Configuration loaded', { siteId, apiEndpoint, debug });

  // Collect page data
  function collectPageData() {
    const data = {
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || '',
      title: document.title || '',
      language: navigator.language || 'unknown',
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timestamp: new Date().toISOString(),
      meta: {}
    };

    // Collect meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) {
        data.meta[name] = content;
      }
    });

    log('📊 Collected page data:', data);
    return data;
  }

  // Send tracking data
  function sendTracking(eventType = 'pageview', eventData = {}) {
    const pageData = collectPageData();
    const trackingData = {
      ...pageData,
      event: eventType,
      eventData: eventData
    };

    // Build URL
    const trackingUrl = `${apiEndpoint}/api/tracking/pixel?siteId=${encodeURIComponent(siteId)}&data=${encodeURIComponent(JSON.stringify(trackingData))}`;
    
    log('📤 Sending tracking to:', trackingUrl);

    // Use Image beacon for reliability
    const img = new Image(1, 1);
    img.onload = function() {
      log('✅ Tracking sent successfully');
    };
    img.onerror = function() {
      logError('❌ Failed to send tracking');
    };
    img.src = trackingUrl;

    // Also try sendBeacon if available (for page unload)
    if (navigator.sendBeacon) {
      const beaconUrl = `${apiEndpoint}/api/tracking/beacon`;
      const payload = JSON.stringify({
        siteId: siteId,
        data: trackingData
      });
      
      navigator.sendBeacon(beaconUrl, payload);
      log('📡 Beacon sent');
    }
  }

  // Track pageview on load
  function trackPageview() {
    log('👁️ Tracking pageview...');
    sendTracking('pageview');
  }

  // Track events
  function trackEvent(eventName, eventData = {}) {
    log('🎯 Tracking event:', eventName, eventData);
    sendTracking('event', { name: eventName, ...eventData });
  }

  // Track clicks
  function setupClickTracking() {
    document.addEventListener('click', function(e) {
      const target = e.target.closest('a, button');
      if (target) {
        const tagName = target.tagName.toLowerCase();
        const text = target.textContent.trim().substring(0, 50);
        const href = target.getAttribute('href');
        
        trackEvent('click', {
          element: tagName,
          text: text,
          href: href
        });
      }
    }, true);
    log('🖱️ Click tracking enabled');
  }

  // Track time on page
  let startTime = Date.now();
  function trackTimeOnPage() {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    trackEvent('time_on_page', { seconds: timeSpent });
    log('⏱️ Time on page:', timeSpent, 'seconds');
  }

  // Track scroll depth
  let maxScrollDepth = 0;
  function trackScroll() {
    const scrollDepth = Math.round(
      (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100
    );
    
    if (scrollDepth > maxScrollDepth) {
      maxScrollDepth = scrollDepth;
      
      // Track milestones: 25%, 50%, 75%, 100%
      if ([25, 50, 75, 100].includes(maxScrollDepth)) {
        trackEvent('scroll_depth', { depth: maxScrollDepth });
        log('📜 Scroll depth:', maxScrollDepth + '%');
      }
    }
  }

  // Initialize
  function init() {
    log('🚀 Initializing SEO Pixel...');

    // Track pageview immediately
    trackPageview();

    // Setup event tracking
    if (config.trackClicks !== false) {
      setupClickTracking();
    }

    // Track scroll
    if (config.trackScroll !== false) {
      window.addEventListener('scroll', trackScroll, { passive: true });
    }

    // Track time on page before leaving
    window.addEventListener('beforeunload', trackTimeOnPage);

    // Expose API
    window.seoPixel = {
      track: trackEvent,
      trackPageview: trackPageview,
      version: '1.0.0'
    };

    log('✅ SEO Pixel initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
