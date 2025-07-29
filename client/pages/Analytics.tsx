import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAnalytics } from '../lib/analytics';
import { 
  ArrowLeft, 
  Users, 
  Eye, 
  Upload, 
  Clock,
  TrendingUp,
  Activity,
  BarChart3,
  Calendar,
  Timer,
  Globe
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

interface UserMetrics {
  current: number;
  lastHour: number;
  lastDay: number;
  lastWeek: number;
  lastMonth: number;
  lastYear: number;
}

interface RealTimeData {
  activeUsers: number;
  currentPageViews: number;
  topPages: Array<{ page: string; views: number }>;
  timestamp: number;
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [userMetrics, setUserMetrics] = useState<UserMetrics>({
    current: 0,
    lastHour: 0,
    lastDay: 0,
    lastWeek: 0,
    lastMonth: 0,
    lastYear: 0
  });
  const [realTimeData, setRealTimeData] = useState<RealTimeData>({
    activeUsers: 0,
    currentPageViews: 0,
    topPages: [],
    timestamp: Date.now()
  });
  const [pageViews, setPageViews] = useState(0);
  const [stlUploads, setStlUploads] = useState(0);
  const { getRealTimeData, getHistoricalData, trackPageView, getCustomData } = useAnalytics();

  // Track page view
  useEffect(() => {
    trackPageView('/analytics', 'Analytics Dashboard');
  }, []);

  // Fetch real-time data and user metrics
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get real-time data
        const realtimeData = await getRealTimeData();
        setRealTimeData(realtimeData);

        // Get user metrics for different time periods
        const userMetricsData = await getCustomData('/api/analytics/user-metrics');
        setUserMetrics(userMetricsData);

        // Get page views and STL uploads
        const historicalData = await getHistoricalData(timeRange);
        setPageViews(historicalData.pageViews || 0);
        setStlUploads(historicalData.stlUploads || 0);

      } catch (error) {
        console.error('Failed to fetch analytics data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const MetricCard = ({ 
    title, 
    value, 
    icon: Icon, 
    description,
    trend = 'neutral',
    className = ''
  }: {
    title: string;
    value: string | number;
    icon: any;
    description?: string;
    trend?: 'up' | 'down' | 'neutral';
    className?: string;
  }) => (
    <Card className={`bg-white/5 border-white/10 backdrop-blur-sm ${className}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400 mb-1">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {description && (
              <p className="text-xs text-gray-500 mt-1">{description}</p>
            )}
          </div>
          <div className="p-3 bg-blue-500/20 rounded-full">
            <Icon className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const TimeRangeCard = ({ 
    period, 
    value, 
    icon: Icon,
    description
  }: {
    period: string;
    value: number;
    icon: any;
    description: string;
  }) => (
    <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">{period}</span>
          </div>
          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
            {formatNumber(value)}
          </Badge>
        </div>
        <p className="text-xs text-gray-400">{description}</p>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-800 text-white flex items-center justify-center">
        <div className="text-center">
          <Activity className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-slate-800 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button 
                  variant="outline" 
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Viewer
                </Button>
              </Link>
              
              <div>
                <h1 className="text-2xl font-bold">User Analytics Dashboard</h1>
                <p className="text-gray-400">Real-time user tracking & engagement metrics</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select 
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-white/10 border-white/20 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="1d">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <Activity className="w-3 h-3 mr-1" />
                Live
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Current Activity Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard
            title="Users Online Now"
            value={realTimeData.activeUsers}
            icon={Users}
            description="Active in last 30 minutes"
            className="ring-2 ring-green-500/20"
          />
          <MetricCard
            title="Page Views (1 Hour)"
            value={realTimeData.currentPageViews}
            icon={Eye}
            description="Total views last hour"
          />
          <MetricCard
            title="STL Uploads Today"
            value={stlUploads}
            icon={Upload}
            description="Files uploaded today"
          />
        </div>

        {/* User Metrics by Time Period */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              User Activity Timeline
            </CardTitle>
            <p className="text-gray-400 text-sm">Unique users across different time periods</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <TimeRangeCard
                period="Last Hour"
                value={userMetrics.lastHour}
                icon={Timer}
                description="Users active in past hour"
              />
              <TimeRangeCard
                period="Last Day"
                value={userMetrics.lastDay}
                icon={Clock}
                description="Users active in past 24 hours"
              />
              <TimeRangeCard
                period="Last Week"
                value={userMetrics.lastWeek}
                icon={Calendar}
                description="Users active in past 7 days"
              />
              <TimeRangeCard
                period="Last Month"
                value={userMetrics.lastMonth}
                icon={Calendar}
                description="Users active in past 30 days"
              />
              <TimeRangeCard
                period="Last Year"
                value={userMetrics.lastYear}
                icon={TrendingUp}
                description="Users active in past year"
              />
              <TimeRangeCard
                period="Currently Online"
                value={userMetrics.current}
                icon={Activity}
                description="Users online right now"
              />
            </div>
          </CardContent>
        </Card>

        {/* Real-time Activity Details */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Real-time Activity Feed
            </CardTitle>
            <p className="text-gray-400 text-sm">Live user activity on the platform</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                  <Globe className="w-5 h-5 mr-2 text-blue-400" />
                  Active Now
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Active Users</span>
                    <span className="text-2xl font-bold text-green-400">{realTimeData.activeUsers}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
                    <span className="text-gray-300">Page Views</span>
                    <span className="text-2xl font-bold text-blue-400">{realTimeData.currentPageViews}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                  <Eye className="w-5 h-5 mr-2 text-blue-400" />
                  Top Pages (Live)
                </h3>
                <div className="space-y-2">
                  {realTimeData.topPages.length > 0 ? (
                    realTimeData.topPages.map((page, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-black/20 rounded-lg">
                        <span className="text-gray-300 text-sm">{page.page}</span>
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {page.views} views
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No recent page views</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-black/20 rounded-lg">
              <p className="text-xs text-gray-500">
                Last updated: {new Date(realTimeData.timestamp).toLocaleTimeString()}
                <span className="ml-2">• Auto-refresh every 30 seconds</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Usage Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Usage Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Page Views</span>
                  <span className="text-white font-mono">{formatNumber(pageViews)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">STL File Uploads</span>
                  <span className="text-white font-mono">{formatNumber(stlUploads)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Peak Users (Today)</span>
                  <span className="text-white font-mono">{Math.max(userMetrics.current, userMetrics.lastHour)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Clock className="w-5 h-5 mr-2" />
                Growth Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Daily Growth</span>
                  <span className="text-green-400 font-mono">
                    +{Math.round(((userMetrics.lastDay - userMetrics.lastWeek + userMetrics.lastDay) / userMetrics.lastWeek) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Weekly Growth</span>
                  <span className="text-green-400 font-mono">
                    +{Math.round(((userMetrics.lastWeek - userMetrics.lastMonth + userMetrics.lastWeek) / userMetrics.lastMonth) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Monthly Growth</span>
                  <span className="text-green-400 font-mono">
                    +{Math.round(((userMetrics.lastMonth - userMetrics.lastYear + userMetrics.lastMonth) / userMetrics.lastYear) * 100)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
