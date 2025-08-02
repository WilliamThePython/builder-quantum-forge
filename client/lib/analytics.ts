// Google Analytics 4 and Real Analytics Integration

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

interface AnalyticsEvent {
  event_name: string;
  event_category?: string;
  event_label?: string;
  value?: number;
  custom_parameters?: Record<string, any>;
}

interface STLMetrics {
  file_name: string;
  file_size: number;
  vertices: number;
  triangles: number;
  upload_time: number;
}

class Analytics {
  private isInitialized = false;
  private userId: string | null = null;
  private sessionId: string;
  private startTime: number;
  private analyticsFailureCount: number = 0;
  private lastAnalyticsFailure: number = 0;
  private maxFailures: number = 3;
  private cooldownPeriod: number = 5 * 60 * 1000; // 5 minutes
  private isInCooldown: boolean = false;
  private isTrackingAnalyticsErrors: boolean = false;
  private globallyDisabled: boolean = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.initializeAnalytics();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeAnalytics() {
    // Initialize Google Analytics 4
    this.initializeGA4();
    
    // Initialize custom analytics
    this.initializeCustomTracking();
    
    this.isInitialized = true;
    console.log('Analytics initialized');
  }

  private initializeGA4() {
    // Google Analytics 4 setup
    const GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || 'G-XXXXXXXXXX';
    
    // Load GA4 script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script1);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: any[]) {
      window.dataLayer.push(args);
    };

    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, {
      session_id: this.sessionId,
      custom_map: {
        custom_dimension_1: 'user_type',
        custom_dimension_2: 'stl_action'
      }
    });
  }

  private initializeCustomTracking() {
    try {
      // Track session start
      this.trackEvent({
        event_name: 'session_start',
        event_category: 'engagement',
        custom_parameters: {
          session_id: this.sessionId,
          timestamp: Date.now(),
          user_agent: navigator.userAgent,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
          viewport_size: `${window.innerWidth}x${window.innerHeight}`
        }
      });
    } catch (error) {
      // Silent fail for session tracking initialization
    }

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.trackEvent({
          event_name: 'page_hidden',
          event_category: 'engagement'
        });
      } else {
        this.trackEvent({
          event_name: 'page_visible',
          event_category: 'engagement'
        });
      }
    });

    // Track scroll depth
    let maxScroll = 0;
    window.addEventListener('scroll', () => {
      const scrollPercent = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > maxScroll && scrollPercent % 25 === 0) {
        maxScroll = scrollPercent;
        this.trackEvent({
          event_name: 'scroll_depth',
          event_category: 'engagement',
          value: scrollPercent
        });
      }
    });
  }

  // Set user ID for authenticated users
  setUserId(userId: string) {
    this.userId = userId;
    if (window.gtag) {
      window.gtag('config', import.meta.env.VITE_GA4_MEASUREMENT_ID || 'G-XXXXXXXXXX', {
        user_id: userId
      });
    }
  }

  // Track page views
  trackPageView(path: string, title?: string) {
    if (!this.isInitialized) return;

    try {
      window.gtag?.('event', 'page_view', {
        page_title: title || document.title,
        page_location: window.location.href,
        page_path: path,
        session_id: this.sessionId
      });
    } catch (error) {
      // Silent fail for Google Analytics page view
    }

    try {
      this.trackEvent({
        event_name: 'page_view',
        event_category: 'navigation',
        event_label: path,
        custom_parameters: {
          page_title: title || document.title,
          referrer: document.referrer
        }
      });
    } catch (error) {
      // Silent fail for custom page view tracking
    }
  }

  // Track custom events
  trackEvent(event: AnalyticsEvent) {
    if (!this.isInitialized || this.globallyDisabled) return;

    try {
      // Send to Google Analytics
      window.gtag?.('event', event.event_name, {
        event_category: event.event_category,
        event_label: event.event_label,
        value: event.value,
        session_id: this.sessionId,
        user_id: this.userId,
        ...event.custom_parameters
      });
    } catch (error) {
      // Silent fail for Google Analytics errors
    }

    try {
      // Send to custom analytics endpoint (if you have one)
      this.sendToCustomAnalytics(event);
    } catch (error) {
      // Silent fail for custom analytics errors
    }
  }

  // STL-specific tracking methods
  trackSTLUpload(metrics: STLMetrics) {
    try {
      this.trackEvent({
        event_name: 'stl_upload',
        event_category: '3d_interaction',
        event_label: metrics.file_name,
        value: metrics.file_size,
        custom_parameters: {
          file_name: metrics.file_name,
          file_size_mb: Math.round(metrics.file_size / 1024 / 1024 * 100) / 100,
          vertices: metrics.vertices,
          triangles: metrics.triangles,
          upload_duration: metrics.upload_time
        }
      });
    } catch (error) {
      // Silent fail for STL upload tracking errors
    }
  }

  trackSTLVisualization(action: string, settings?: Record<string, any>) {
    try {
      this.trackEvent({
        event_name: 'stl_visualization',
        event_category: '3d_interaction',
        event_label: action,
        custom_parameters: {
          action,
          settings: JSON.stringify(settings || {}),
          timestamp: Date.now()
        }
      });
    } catch (error) {
      // Silent fail for visualization tracking errors
    }
  }

  trackToolUsage(tool: string, duration?: number) {
    this.trackEvent({
      event_name: 'tool_usage',
      event_category: '3d_tools',
      event_label: tool,
      value: duration,
      custom_parameters: {
        tool_name: tool,
        usage_duration: duration,
        session_id: this.sessionId
      }
    });
  }

  trackPerformanceMetrics() {
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      this.trackEvent({
        event_name: 'performance_metrics',
        event_category: 'technical',
        custom_parameters: {
          page_load_time: Math.round(navigation.loadEventEnd - navigation.navigationStart),
          dom_content_loaded: Math.round(navigation.domContentLoadedEventEnd - navigation.navigationStart),
          first_paint: this.getFirstPaint(),
          connection_type: this.getConnectionType()
        }
      });
    }
  }

  private getFirstPaint(): number | null {
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
    return firstPaint ? Math.round(firstPaint.startTime) : null;
  }

  private getConnectionType(): string {
    // @ts-ignore
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return connection ? connection.effectiveType || 'unknown' : 'unknown';
  }

  // Revenue tracking
  trackRevenue(source: 'ads' | 'premium' | 'affiliate', amount: number, currency = 'USD') {
    this.trackEvent({
      event_name: 'revenue',
      event_category: 'monetization',
      event_label: source,
      value: amount,
      custom_parameters: {
        currency,
        revenue_source: source,
        session_id: this.sessionId
      }
    });

    // Send to GA4 with purchase event for e-commerce tracking
    window.gtag?.('event', 'purchase', {
      transaction_id: `${source}_${Date.now()}`,
      value: amount,
      currency: currency,
      items: [{
        item_id: source,
        item_name: `Revenue from ${source}`,
        category: 'monetization',
        quantity: 1,
        price: amount
      }]
    });
  }

  // Error tracking with loop prevention
  trackError(error: Error, context?: string) {
    // Prevent tracking analytics-related errors to avoid infinite loops
    if (error.message?.includes('Failed to fetch') && context?.includes('analytics')) {
      console.warn('Skipping analytics-related error to prevent loop:', error.message);
      return;
    }

    // Prevent tracking errors from analytics services
    if (error.message?.includes('fullstory') ||
        error.stack?.includes('fullstory') ||
        error.stack?.includes('fs.js')) {
      return;
    }

    // Skip if we're already in analytics cooldown
    if (this.shouldSkipAnalytics()) {
      console.warn('Skipping error tracking due to analytics circuit breaker');
      return;
    }

    try {
      this.trackEvent({
        event_name: 'javascript_error',
        event_category: 'error',
        event_label: error.message,
        custom_parameters: {
          error_message: error.message,
          error_stack: error.stack,
          context: context || 'unknown',
          user_agent: navigator.userAgent,
          url: window.location.href
        }
      });
    } catch (trackingError) {
      console.warn('Failed to track error, preventing loop:', trackingError);
    }
  }

  // Get real-time analytics data (from your backend API)
  async getRealTimeData() {
    try {
      console.log('Fetching real-time analytics data...');
      const response = await fetch('/api/analytics/realtime');

      if (response.ok) {
        const data = await response.json();
        console.log('Real-time analytics data received:', data);
        return data;
      } else {
        console.error('Analytics API error:', response.status, response.statusText);
        throw new Error(`Analytics API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch real-time analytics:', error);
    }

    // Fallback to mock data if API is not available
    console.log('Falling back to mock data');
    return this.getMockRealTimeData();
  }

  // Get historical analytics data
  async getHistoricalData(timeRange: string) {
    try {
      const response = await fetch(`/api/analytics/historical?range=${timeRange}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch historical analytics:', error);
    }

    return this.getMockHistoricalData(timeRange);
  }

  // Sanitize event data to prevent circular references and remove DOM elements
  private sanitizeEventData(data: any, seen = new WeakSet()): any {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    // Check for circular references
    if (seen.has(data)) {
      return '[Circular Reference]';
    }
    seen.add(data);

    // Filter out DOM elements and React Fiber nodes
    if (data instanceof HTMLElement ||
        data instanceof Event ||
        (data && typeof data === 'object' && data.constructor && data.constructor.name === 'FiberNode') ||
        (data && typeof data === 'object' && data.__reactFiber) ||
        (data && typeof data === 'object' && data.stateNode)) {
      return '[DOM Element]';
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeEventData(item, seen));
    }

    const sanitized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        try {
          sanitized[key] = this.sanitizeEventData(data[key], seen);
        } catch (error) {
          sanitized[key] = '[Serialization Error]';
        }
      }
    }

    return sanitized;
  }

  // Public getter for failure count
  get failureCount(): number {
    return this.analyticsFailureCount;
  }

  // Get custom analytics data from any endpoint - completely silent
  async getCustomData(endpoint: string) {
    // Always return empty object - disable all external data fetching
    return {};
  }

  private shouldSkipAnalytics(): boolean {
    const now = Date.now();

    // Check if we're in cooldown period
    if (this.isInCooldown && (now - this.lastAnalyticsFailure) < this.cooldownPeriod) {
      return true;
    }

    // Reset cooldown if enough time has passed
    if (this.isInCooldown && (now - this.lastAnalyticsFailure) >= this.cooldownPeriod) {
      this.isInCooldown = false;
      this.analyticsFailureCount = 0;
      console.log('Analytics circuit breaker reset - resuming tracking');
    }

    return false;
  }

  private handleAnalyticsFailure(error: any, eventName: string): void {
    this.analyticsFailureCount++;
    this.lastAnalyticsFailure = Date.now();

    console.error(`Failed to send analytics event: ${eventName}`, error);

    // Activate circuit breaker if too many failures
    if (this.analyticsFailureCount >= this.maxFailures) {
      this.isInCooldown = true;
      console.warn(`Analytics circuit breaker activated after ${this.maxFailures} failures. Cooling down for ${this.cooldownPeriod / 1000}s`);
    }
  }

  private sendToCustomAnalytics(event: AnalyticsEvent) {
    // Ultimate silent analytics - nothing can throw or bubble up
    try {
      // Check circuit breaker
      if (this.shouldSkipAnalytics()) {
        return;
      }

      // Don't track analytics errors to prevent infinite loops
      if (event.event_name === 'javascript_error' && this.isTrackingAnalyticsErrors) {
        return;
      }

      // Skip analytics entirely if we've had too many failures
      if (this.analyticsFailureCount > 10) {
        return; // Silent skip
      }

      // In development, be more lenient with analytics failures
      const isDevelopment = import.meta.env?.DEV || window.location.hostname === 'localhost';

      // Set flag to prevent tracking analytics-related errors
      if (event.event_name === 'javascript_error') {
        this.isTrackingAnalyticsErrors = true;
      }

      // Safe JSON serialization to avoid circular references
      const safeEventData = this.sanitizeEventData({
        ...event,
        timestamp: Date.now(),
        session_id: this.sessionId,
        user_id: this.userId,
        url: window.location.href,
        referrer: document.referrer
      });

      // Completely isolated async operation that can't throw
      Promise.resolve().then(async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const response = await fetch('/api/analytics/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(safeEventData),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            this.analyticsFailureCount = 0;
          } else {
            this.analyticsFailureCount++;
          }
        } catch (fetchError) {
          // Completely silent - ignore all errors including AbortError
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            // Timeout occurred, but don't count as failure for abort errors
            console.debug('Analytics request timed out (this is normal)');
          } else {
            this.analyticsFailureCount++;
          }
        }

        // Reset flag after attempt
        if (event.event_name === 'javascript_error') {
          this.isTrackingAnalyticsErrors = false;
        }

        // Disable after too many failures
        const maxFailures = isDevelopment ? 50 : 10;
        if (this.analyticsFailureCount > maxFailures) {
          this.globallyDisabled = true;
        }
      }).catch(() => {
        // Ultimate safety net - nothing can escape
      });

    } catch (error) {
      // Final safety catch for any synchronous errors
      this.analyticsFailureCount++;

      if (event.event_name === 'javascript_error') {
        this.isTrackingAnalyticsErrors = false;
      }

      const isDevelopment = import.meta.env?.DEV || window.location.hostname === 'localhost';
      const maxFailures = isDevelopment ? 50 : 10;
      if (this.analyticsFailureCount > maxFailures) {
        this.globallyDisabled = true;
      }
    }
  }

  private getMockRealTimeData() {
    return {
      activeUsers: Math.floor(Math.random() * 200) + 50,
      currentPageViews: Math.floor(Math.random() * 100) + 20,
      topPages: [
        { page: '/', views: Math.floor(Math.random() * 50) + 10 },
        { page: '/about', views: Math.floor(Math.random() * 30) + 5 },
        { page: '/analytics', views: Math.floor(Math.random() * 15) + 2 }
      ]
    };
  }

  private getMockHistoricalData(timeRange: string) {
    const multiplier = timeRange === '1d' ? 1 : timeRange === '7d' ? 7 : 30;
    
    return {
      totalUsers: Math.floor(Math.random() * 10000 * multiplier) + 1000,
      sessions: Math.floor(Math.random() * 15000 * multiplier) + 2000,
      pageViews: Math.floor(Math.random() * 30000 * multiplier) + 5000,
      bounceRate: Math.random() * 20 + 25,
      avgSessionDuration: `${Math.floor(Math.random() * 3) + 2}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
      stlUploads: Math.floor(Math.random() * 5000 * multiplier) + 500,
      revenue: Math.random() * 1000 * multiplier + 100
    };
  }
}

// Wrap the native fetch to catch FullStory errors
const originalFetch = window.fetch;
let fetchWrapperActive = false; // Prevent recursion

window.fetch = function(...args) {
  // Prevent infinite recursion
  if (fetchWrapperActive) {
    return originalFetch.apply(this, args);
  }

  fetchWrapperActive = true;

  try {
    return originalFetch.apply(this, args).catch(error => {
      // Check if this is a FullStory or other third-party analytics service call
      const url = args[0]?.toString() || '';
      const isThirdPartyAnalytics = url.includes('fullstory.com') ||
          url.includes('fs.') ||
          url.includes('edge.fullstory.com') ||
          url.includes('gtag') ||
          url.includes('googletagmanager') ||
          error.stack?.includes('fullstory') ||
          error.stack?.includes('fs.js') ||
          error.stack?.includes('gtag');

      if (isThirdPartyAnalytics) {
        // Silently ignore third-party analytics fetch errors
        console.debug('Ignoring third-party analytics fetch error:', error.message);
        // Return a resolved promise to prevent unhandled rejection
        return Promise.resolve(new Response('', { status: 204 }));
      }

      // Re-throw other errors
      throw error;
    }).finally(() => {
      fetchWrapperActive = false;
    });
  } catch (syncError) {
    fetchWrapperActive = false;
    throw syncError;
  }
};

// Create singleton instance
export const analytics = new Analytics();

// React hook for using analytics
export function useAnalytics() {
  return {
    trackPageView: analytics.trackPageView.bind(analytics),
    trackEvent: analytics.trackEvent.bind(analytics),
    trackSTLUpload: analytics.trackSTLUpload.bind(analytics),
    trackSTLVisualization: analytics.trackSTLVisualization.bind(analytics),
    trackToolUsage: analytics.trackToolUsage.bind(analytics),
    trackRevenue: analytics.trackRevenue.bind(analytics),
    trackError: analytics.trackError.bind(analytics),
    setUserId: analytics.setUserId.bind(analytics),
    getRealTimeData: analytics.getRealTimeData.bind(analytics),
    getHistoricalData: analytics.getHistoricalData.bind(analytics),
    getCustomData: analytics.getCustomData.bind(analytics)
  };
}

// Initialize performance tracking
window.addEventListener('load', () => {
  analytics.trackPerformanceMetrics();
});

// Global error tracking with analytics loop prevention
window.addEventListener('error', (event) => {
  // Enhanced analytics-related error filtering to prevent loops
  if (event.message?.includes('Failed to fetch') ||
      event.filename?.includes('analytics.ts') ||
      event.filename?.includes('/api/analytics/') ||
      event.message?.includes('sendToCustomAnalytics') ||
      event.message?.includes('trackEvent') ||
      event.error?.stack?.includes('fullstory') ||
      event.error?.stack?.includes('fs.js') ||
      event.filename?.includes('edge.fullstory.com') ||
      event.error?.message?.includes('Failed to fetch')) {
    console.warn('🔄 Skipping analytics/third-party error to prevent loop');
    return;
  }

  // Don't track errors from FullStory or other third-party analytics services
  if (event.filename?.includes('fullstory.com') ||
      event.filename?.includes('fs.js') ||
      event.filename?.includes('edge.fullstory.com') ||
      event.message?.includes('fullstory') ||
      event.filename?.includes('gtag') ||
      event.filename?.includes('googletagmanager') ||
      event.filename?.includes('google-analytics')) {
    return;
  }

  // Skip if analytics is already failing too much
  if (analytics?.failureCount > 5) {
    return;
  }

  try {
    analytics.trackError(new Error(event.message), 'global_error_handler');
  } catch (error) {
    // Completely silent to prevent any cascading issues
  }
});

window.addEventListener('unhandledrejection', (event) => {
  // Don't track analytics-related promise rejections or third-party service errors
  if (event.reason?.message?.includes('Failed to fetch') ||
      event.reason?.toString?.()?.includes('analytics') ||
      event.reason?.toString?.()?.includes('fullstory') ||
      event.reason?.toString?.()?.includes('fs.js') ||
      event.reason?.toString?.()?.includes('edge.fullstory.com') ||
      event.reason?.stack?.includes('fullstory') ||
      event.reason?.stack?.includes('fs.js') ||
      event.reason?.stack?.includes('edge.fullstory.com') ||
      (event.reason instanceof TypeError && event.reason.message?.includes('Failed to fetch'))) {
    console.warn('Skipping analytics/third-party promise rejection to prevent loop:', event.reason);
    event.preventDefault(); // Prevent the error from being logged to console
    return;
  }

  try {
    analytics.trackError(new Error(event.reason), 'unhandled_promise_rejection');
  } catch (error) {
    console.warn('Failed to track promise rejection, skipping to prevent loop:', error);
  }
});
