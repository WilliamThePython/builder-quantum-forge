import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Users, 
  Eye, 
  Upload, 
  Download,
  Globe,
  Smartphone,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  DollarSign,
  FileText,
  MousePointer,
  Zap,
  AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

// Mock analytics data - in production, this would come from your analytics service
const mockAnalytics = {
  overview: {
    totalUsers: 15247,
    newUsers: 2893,
    sessions: 18456,
    pageViews: 45231,
    bounceRate: 32.1,
    avgSessionDuration: '4:32',
    userGrowth: 15.3,
    sessionGrowth: 8.7
  },
  stlMetrics: {
    totalUploads: 8934,
    totalDownloads: 12456,
    avgFileSize: '2.4 MB',
    popularFormats: [
      { format: 'STL', count: 8934, percentage: 89.3 },
      { format: 'OBJ', count: 756, percentage: 7.6 },
      { format: 'PLY', count: 310, percentage: 3.1 }
    ]
  },
  geographic: {
    countries: [
      { country: 'United States', users: 4573, percentage: 30.0 },
      { country: 'Germany', users: 2134, percentage: 14.0 },
      { country: 'United Kingdom', users: 1829, percentage: 12.0 },
      { country: 'Canada', users: 1371, percentage: 9.0 },
      { country: 'France', users: 1067, percentage: 7.0 }
    ]
  },
  devices: {
    desktop: 62.3,
    mobile: 28.7,
    tablet: 9.0
  },
  browsers: [
    { browser: 'Chrome', percentage: 67.2 },
    { browser: 'Firefox', percentage: 18.4 },
    { browser: 'Safari', percentage: 9.1 },
    { browser: 'Edge', percentage: 5.3 }
  ],
  performance: {
    avgLoadTime: 1.23,
    errorRate: 0.12,
    uptime: 99.97
  },
  engagement: {
    avgTimeOnPage: '3:45',
    pagesPerSession: 2.8,
    returnVisitorRate: 43.2
  },
  revenue: {
    totalRevenue: 1247.50,
    adRevenue: 892.30,
    premiumRevenue: 355.20,
    revenueGrowth: 23.4
  },
  realTime: {
    activeUsers: 127,
    currentPageViews: 89,
    topPages: [
      { page: '/', views: 45 },
      { page: '/about', views: 23 },
      { page: '/profile', views: 12 }
    ]
  }
};

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('7d');
  const [isLoading, setIsLoading] = useState(false);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const MetricCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    trend = 'up',
    suffix = '' 
  }: {
    title: string;
    value: string | number;
    change?: number;
    icon: any;
    trend?: 'up' | 'down' | 'neutral';
    suffix?: string;
  }) => (
    <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400 mb-1">{title}</p>
            <p className="text-2xl font-bold text-white">{value}{suffix}</p>
            {change !== undefined && (
              <div className="flex items-center mt-2">
                {trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-green-400 mr-1" />
                ) : trend === 'down' ? (
                  <TrendingDown className="w-4 h-4 text-red-400 mr-1" />
                ) : null}
                <span className={`text-sm ${
                  trend === 'up' ? 'text-green-400' : 
                  trend === 'down' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {change > 0 ? '+' : ''}{change}%
                </span>
                <span className="text-sm text-gray-500 ml-1">vs last period</span>
              </div>
            )}
          </div>
          <div className="p-3 bg-blue-500/20 rounded-full">
            <Icon className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
                <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
                <p className="text-gray-400">3D Tools Platform Insights</p>
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
        {/* Real-time Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title="Active Users Right Now"
            value={mockAnalytics.realTime.activeUsers}
            icon={Users}
            trend="neutral"
          />
          <MetricCard
            title="Page Views (Last Hour)"
            value={mockAnalytics.realTime.currentPageViews}
            icon={Eye}
            trend="neutral"
          />
          <MetricCard
            title="Total Users"
            value={formatNumber(mockAnalytics.overview.totalUsers)}
            change={mockAnalytics.overview.userGrowth}
            icon={Users}
            trend="up"
          />
          <MetricCard
            title="Total Sessions"
            value={formatNumber(mockAnalytics.overview.sessions)}
            change={mockAnalytics.overview.sessionGrowth}
            icon={Activity}
            trend="up"
          />
        </div>

        {/* Main Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MetricCard
            title="Page Views"
            value={formatNumber(mockAnalytics.overview.pageViews)}
            icon={Eye}
          />
          <MetricCard
            title="New Users"
            value={formatNumber(mockAnalytics.overview.newUsers)}
            icon={Users}
          />
          <MetricCard
            title="Bounce Rate"
            value={mockAnalytics.overview.bounceRate}
            suffix="%"
            icon={MousePointer}
            trend="down"
          />
          <MetricCard
            title="Avg Session Duration"
            value={mockAnalytics.overview.avgSessionDuration}
            icon={Clock}
          />
          <MetricCard
            title="STL Uploads"
            value={formatNumber(mockAnalytics.stlMetrics.totalUploads)}
            icon={Upload}
          />
          <MetricCard
            title="Revenue (Month)"
            value={`$${mockAnalytics.revenue.totalRevenue}`}
            change={mockAnalytics.revenue.revenueGrowth}
            icon={DollarSign}
            trend="up"
          />
        </div>

        {/* STL File Analytics */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              STL File Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-2">Total Uploads</p>
                <p className="text-2xl font-bold text-white">{formatNumber(mockAnalytics.stlMetrics.totalUploads)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-2">Total Downloads</p>
                <p className="text-2xl font-bold text-white">{formatNumber(mockAnalytics.stlMetrics.totalDownloads)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-2">Avg File Size</p>
                <p className="text-2xl font-bold text-white">{mockAnalytics.stlMetrics.avgFileSize}</p>
              </div>
            </div>
            
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-4">File Format Distribution</p>
              <div className="space-y-3">
                {mockAnalytics.stlMetrics.popularFormats.map((format) => (
                  <div key={format.format} className="flex items-center justify-between">
                    <span className="text-white">{format.format}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ width: `${format.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-400 w-12">{format.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Geographic & Device Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Geographic Distribution */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                Geographic Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockAnalytics.geographic.countries.map((country) => (
                  <div key={country.country} className="flex items-center justify-between">
                    <span className="text-white">{country.country}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${country.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-400 w-16">{formatNumber(country.users)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Device & Browser Analytics */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Smartphone className="w-5 h-5 mr-2" />
                Device & Browser Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <p className="text-sm text-gray-400 mb-3">Device Types</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-white">Desktop</span>
                      <span className="text-gray-400">{mockAnalytics.devices.desktop}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">Mobile</span>
                      <span className="text-gray-400">{mockAnalytics.devices.mobile}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white">Tablet</span>
                      <span className="text-gray-400">{mockAnalytics.devices.tablet}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-3">Top Browsers</p>
                  <div className="space-y-2">
                    {mockAnalytics.browsers.map((browser) => (
                      <div key={browser.browser} className="flex justify-between">
                        <span className="text-white">{browser.browser}</span>
                        <span className="text-gray-400">{browser.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance & Revenue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Metrics */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Zap className="w-5 h-5 mr-2" />
                Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Avg Load Time</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{mockAnalytics.performance.avgLoadTime}s</span>
                    <Badge className="bg-green-500/20 text-green-400 text-xs">Good</Badge>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Error Rate</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{mockAnalytics.performance.errorRate}%</span>
                    <Badge className="bg-green-500/20 text-green-400 text-xs">Excellent</Badge>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Uptime</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">{mockAnalytics.performance.uptime}%</span>
                    <Badge className="bg-green-500/20 text-green-400 text-xs">Excellent</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Revenue Breakdown */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <DollarSign className="w-5 h-5 mr-2" />
                Revenue Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Ad Revenue</span>
                  <span className="text-white font-mono">${mockAnalytics.revenue.adRevenue}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Premium Revenue</span>
                  <span className="text-white font-mono">${mockAnalytics.revenue.premiumRevenue}</span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                  <span className="text-white font-medium">Total Revenue</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono font-bold">${mockAnalytics.revenue.totalRevenue}</span>
                    <TrendingUp className="w-4 h-4 text-green-400" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Real-time Activity */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Real-time Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-400 mb-2">Active Users</p>
                <p className="text-3xl font-bold text-green-400">{mockAnalytics.realTime.activeUsers}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-2">Current Page Views</p>
                <p className="text-3xl font-bold text-blue-400">{mockAnalytics.realTime.currentPageViews}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-3">Top Pages (Live)</p>
                <div className="space-y-2">
                  {mockAnalytics.realTime.topPages.map((page) => (
                    <div key={page.page} className="flex justify-between">
                      <span className="text-white text-sm">{page.page}</span>
                      <span className="text-gray-400 text-sm">{page.views}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
