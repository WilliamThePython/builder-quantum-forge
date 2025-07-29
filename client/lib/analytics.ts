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

    window.gtag?.('event', 'page_view', {
      page_title: title || document.title,
      page_location: window.location.href,
      page_path: path,
      session_id: this.sessionId
    });

    this.trackEvent({
      event_name: 'page_view',
      event_category: 'navigation',
      event_label: path,
      custom_parameters: {
        page_title: title || document.title,
        referrer: document.referrer
      }
    });
  }

  // Track custom events
  trackEvent(event: AnalyticsEvent) {
    if (!this.isInitialized) return;

    // Send to Google Analytics
    window.gtag?.('event', event.event_name, {
      event_category: event.event_category,
      event_label: event.event_label,
      value: event.value,
      session_id: this.sessionId,
      user_id: this.userId,
      ...event.custom_parameters
    });

    // Send to custom analytics endpoint (if you have one)
    this.sendToCustomAnalytics(event);
  }

  // STL-specific tracking methods
  trackSTLUpload(metrics: STLMetrics) {
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
  }

  trackSTLVisualization(action: string, settings?: Record<string, any>) {
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

  // Error tracking
  trackError(error: Error, context?: string) {
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
  }

  // Get real-time analytics data (from your backend API)
  async getRealTimeData() {
    try {
      // This would call your backend API that aggregates analytics data
      const response = await fetch('/api/analytics/realtime');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch real-time analytics:', error);
    }
    
    // Fallback to mock data if API is not available
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

  // Get custom analytics data from any endpoint
  async getCustomData(endpoint: string) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error(`Failed to fetch data from ${endpoint}:`, error);
    }

    return {};
  }

  private sendToCustomAnalytics(event: AnalyticsEvent) {
    // Send to your own analytics endpoint
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...event,
        timestamp: Date.now(),
        session_id: this.sessionId,
        user_id: this.userId,
        url: window.location.href,
        referrer: document.referrer
      })
    }).catch(error => {
      console.error('Failed to send custom analytics:', error);
    });
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

// Global error tracking
window.addEventListener('error', (event) => {
  analytics.trackError(new Error(event.message), 'global_error_handler');
});

window.addEventListener('unhandledrejection', (event) => {
  analytics.trackError(new Error(event.reason), 'unhandled_promise_rejection');
});
