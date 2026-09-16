import React from 'react';
import { 
  BarChart3, 
  Users 
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function OverviewChartsSection({
  groupChartData = [],
  empChartData = [],
  timelineData = [],
  timelineDays = 14,
  setTimelineDays
}) {
  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Charts Row 1: Groups & Employees */}
      <div className="charts-grid">
        {/* Chart by Group */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Thống Kê Khối Lượng Theo Nhóm Điều Phối</h3>
              <p className="chart-subtitle">Phân bổ tiến độ thực hiện theo từng trung tâm</p>
            </div>
            <BarChart3 size={18} style={{ color: 'var(--text-muted)' }} />
          </div>

          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groupChartData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="Hoàn thành" fill="#10b981" stackId="a" />
                <Bar dataKey="Đang xử lý" fill="#0284c7" stackId="a" />
                <Bar dataKey="Trễ hạn" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart by Employee */}
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <h3 className="chart-title">Top Nhân Viên Nhận Việc Nhiều Nhất</h3>
              <p className="chart-subtitle">Khối lượng và kết quả theo từng nhân sự</p>
            </div>
            <Users size={18} style={{ color: 'var(--text-muted)' }} />
          </div>

          <div style={{ height: '300px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={empChartData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={85} />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="Hoàn thành" fill="#10b981" stackId="a" />
                <Bar dataKey="Đang xử lý" fill="#0284c7" stackId="a" />
                <Bar dataKey="Trễ hạn" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Chart Row 2: Timeline Trends */}
      <div className="chart-card" style={{ marginTop: '20px' }}>
        <div className="chart-header">
          <div>
            <h3 className="chart-title">Xu Hướng Công Việc Theo Ngày</h3>
            <p className="chart-subtitle">So sánh tiến độ tạo mới và đóng/hoàn thành công việc</p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={`btn ${timelineDays === 7 ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setTimelineDays(7)}
            >
              7 ngày
            </button>
            <button
              className={`btn ${timelineDays === 14 ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setTimelineDays(14)}
            >
              14 ngày
            </button>
            <button
              className={`btn ${timelineDays === 30 ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={() => setTimelineDays(30)}
            >
              30 ngày
            </button>
          </div>
        </div>

        <div style={{ height: '260px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData || []} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} />
              <Area type="monotone" dataKey="created_count" name="Tạo mới" stroke="#0284c7" fillOpacity={1} fill="url(#colorCreated)" />
              <Area type="monotone" dataKey="completed_count" name="Hoàn thành/Đóng" stroke="#10b981" fillOpacity={1} fill="url(#colorCompleted)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
