import { RequestHandler } from "express";

// In-memory storage for demo purposes
// In production, you'd use a proper database like PostgreSQL, MongoDB, etc.
interface AnalyticsEvent {
  timestamp: number;
  event_name: string;
  event_category?: string;
  event_label?: string;
  value?: number;
  session_id: string;
  user_id?: string;
  url: string;
  referrer?: string;
  custom_parameters?: Record<string, any>;
}

interface SessionData {
  session_id: string;
  user_id?: string;
  start_time: number;
  last_activity: number;
  page_views: number;
  events: AnalyticsEvent[];
}

// In-memory storage (replace with database in production)
const analytics_events: AnalyticsEvent[] = [];
const active_sessions: Map<string, SessionData> = new Map();

// Track custom analytics events
export const trackEvent: RequestHandler = (req, res) => {
  try {
    const event: AnalyticsEvent = req.body;
    
    // Validate required fields
    if (!event.event_name || !event.session_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Add server timestamp
    event.timestamp = Date.now();
    
    // Store event
    analytics_events.push(event);
    
    // Update session data
    let session = active_sessions.get(event.session_id);
    if (!session) {
      session = {
        session_id: event.session_id,
        user_id: event.user_id,
        start_time: event.timestamp,
        last_activity: event.timestamp,
        page_views: 0,
        events: []
      };
      active_sessions.set(event.session_id, session);
    }
    
    session.last_activity = event.timestamp;
    session.events.push(event);
    
    if (event.event_name === 'page_view') {
      session.page_views++;
    }
    
    if (event.user_id) {
      session.user_id = event.user_id;
    }

    // Clean up old sessions (older than 30 minutes)
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    for (const [sessionId, sessionData] of active_sessions.entries()) {
      if (sessionData.last_activity < thirtyMinutesAgo) {
        active_sessions.delete(sessionId);
      }
    }

    res.json({ success: true, event_id: `${event.session_id}_${event.timestamp}` });
  } catch (error) {
    console.error('Analytics tracking error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
};

// Get real-time analytics data
export const getRealTimeData: RequestHandler = (req, res) => {
  try {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Count active users (sessions with activity in last 30 minutes)
    const thirtyMinutesAgo = now - (30 * 60 * 1000);
    const activeUsers = Array.from(active_sessions.values())
      .filter(session => session.last_activity > thirtyMinutesAgo).length;
    
    // Count page views in last hour
    const recentPageViews = analytics_events
      .filter(event => event.event_name === 'page_view' && event.timestamp > oneHourAgo)
      .length;
    
    // Get top pages from recent page views
    const recentPages = analytics_events
      .filter(event => event.event_name === 'page_view' && event.timestamp > oneHourAgo)
      .reduce((acc: Record<string, number>, event) => {
        const path = event.custom_parameters?.page_path || event.url || '/';
        acc[path] = (acc[path] || 0) + 1;
        return acc;
      }, {});
    
    const topPages = Object.entries(recentPages)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([page, views]) => ({ page, views }));

    res.json({
      activeUsers,
      currentPageViews: recentPageViews,
      topPages,
      timestamp: now
    });
  } catch (error) {
    console.error('Real-time analytics error:', error);
    res.status(500).json({ error: 'Failed to get real-time data' });
  }
};

// Get historical analytics data
export const getHistoricalData: RequestHandler = (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const now = Date.now();
    
    let timeRange: number;
    switch (range) {
      case '1d': timeRange = 24 * 60 * 60 * 1000; break;
      case '7d': timeRange = 7 * 24 * 60 * 60 * 1000; break;
      case '30d': timeRange = 30 * 24 * 60 * 60 * 1000; break;
      case '90d': timeRange = 90 * 24 * 60 * 60 * 1000; break;
      default: timeRange = 7 * 24 * 60 * 60 * 1000;
    }
    
    const startTime = now - timeRange;
    
    // Filter events within time range
    const eventsInRange = analytics_events.filter(event => event.timestamp >= startTime);
    
    // Calculate metrics
    const uniqueUsers = new Set(eventsInRange.map(event => event.user_id || event.session_id)).size;
    const uniqueSessions = new Set(eventsInRange.map(event => event.session_id)).size;
    const pageViews = eventsInRange.filter(event => event.event_name === 'page_view').length;
    const stlUploads = eventsInRange.filter(event => event.event_name === 'stl_upload').length;
    
    // Calculate session durations for bounce rate
    const sessionDurations = Array.from(active_sessions.values())
      .map(session => {
        const sessionEvents = session.events.filter(event => event.timestamp >= startTime);
        if (sessionEvents.length < 2) return 0;
        return sessionEvents[sessionEvents.length - 1].timestamp - sessionEvents[0].timestamp;
      })
      .filter(duration => duration > 0);
    
    const avgSessionDuration = sessionDurations.length > 0 
      ? sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length
      : 0;
    
    const bounceRate = sessionDurations.filter(duration => duration < 30000).length / sessionDurations.length * 100;
    
    // Calculate revenue from tracked events
    const revenueEvents = eventsInRange.filter(event => event.event_name === 'revenue');
    const totalRevenue = revenueEvents.reduce((sum, event) => sum + (event.value || 0), 0);
    
    // Format session duration
    const formatDuration = (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    res.json({
      totalUsers: uniqueUsers,
      newUsers: Math.floor(uniqueUsers * 0.3), // Approximate new users
      sessions: uniqueSessions,
      pageViews,
      bounceRate: Math.round(bounceRate * 10) / 10,
      avgSessionDuration: formatDuration(avgSessionDuration),
      stlUploads,
      revenue: Math.round(totalRevenue * 100) / 100,
      userGrowth: Math.random() * 20 + 5, // Mock growth data
      sessionGrowth: Math.random() * 15 + 3,
      revenueGrowth: Math.random() * 25 + 10,
      timeRange: range,
      generatedAt: now
    });
  } catch (error) {
    console.error('Historical analytics error:', error);
    res.status(500).json({ error: 'Failed to get historical data' });
  }
};

// Get STL-specific analytics
export const getSTLAnalytics: RequestHandler = (req, res) => {
  try {
    const stlEvents = analytics_events.filter(event => 
      event.event_name === 'stl_upload' || 
      event.event_name === 'stl_visualization' ||
      event.event_name === 'tool_usage'
    );
    
    const uploads = stlEvents.filter(event => event.event_name === 'stl_upload');
    const visualizations = stlEvents.filter(event => event.event_name === 'stl_visualization');
    const toolUsage = stlEvents.filter(event => event.event_name === 'tool_usage');
    
    // Calculate file format distribution
    const formatCounts: Record<string, number> = {};
    uploads.forEach(event => {
      const fileName = event.custom_parameters?.file_name || '';
      const extension = fileName.split('.').pop()?.toUpperCase() || 'UNKNOWN';
      formatCounts[extension] = (formatCounts[extension] || 0) + 1;
    });
    
    const totalFiles = uploads.length;
    const formatDistribution = Object.entries(formatCounts)
      .map(([format, count]) => ({
        format,
        count,
        percentage: Math.round((count / totalFiles) * 100 * 10) / 10
      }))
      .sort((a, b) => b.count - a.count);
    
    // Calculate average file size
    const fileSizes = uploads
      .map(event => event.custom_parameters?.file_size_mb || 0)
      .filter(size => size > 0);
    const avgFileSize = fileSizes.length > 0 
      ? Math.round((fileSizes.reduce((sum, size) => sum + size, 0) / fileSizes.length) * 100) / 100
      : 0;

    res.json({
      totalUploads: uploads.length,
      totalVisualizations: visualizations.length,
      totalToolUsage: toolUsage.length,
      avgFileSize: `${avgFileSize} MB`,
      formatDistribution,
      popularTools: toolUsage.reduce((acc: Record<string, number>, event) => {
        const tool = event.custom_parameters?.tool_name || 'unknown';
        acc[tool] = (acc[tool] || 0) + 1;
        return acc;
      }, {}),
      generatedAt: Date.now()
    });
  } catch (error) {
    console.error('STL analytics error:', error);
    res.status(500).json({ error: 'Failed to get STL analytics' });
  }
};
