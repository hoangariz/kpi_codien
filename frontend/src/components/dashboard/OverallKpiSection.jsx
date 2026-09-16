import React from 'react';
import { 
  Briefcase, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  UserCheck 
} from 'lucide-react';
import KpiCard from '../KpiCard';

export default function OverallKpiSection({ kpi }) {
  return (
    <div className="kpi-grid">
      <KpiCard
        title="TỔNG CÔNG VIỆC TOÀN MẠNG"
        value={kpi?.total_tasks || 0}
        subtext={`${kpi?.total_groups || 0} nhóm • ${kpi?.total_employees || 0} nhân sự`}
        icon={Briefcase}
        color="blue"
      />
      <KpiCard
        title="ĐANG THỰC HIỆN"
        value={kpi?.in_progress_count || 0}
        subtext="Đang giao FT & tiếp nhận"
        icon={Clock}
        color="amber"
      />
      <KpiCard
        title="ĐÃ HOÀN THÀNH"
        value={kpi?.completed_count || 0}
        subtext={`Tỉ lệ hoàn thành: ${kpi?.completion_rate || 0}%`}
        icon={CheckCircle}
        color="green"
      />
      <KpiCard
        title="CÔNG VIỆC TRỄ HẠN"
        value={kpi?.overdue_count || 0}
        subtext="Cần tập trung đôn đốc"
        icon={AlertTriangle}
        color="red"
      />
      <KpiCard
        title="FT / CĐ TỪ CHỐI"
        value={kpi?.tu_choi_count || 0}
        subtext={`Quá hạn từ chối: ${kpi?.overdue_tu_choi_count || 0} • FT: ${kpi?.ft_tu_choi_count || 0} • CĐ: ${kpi?.cd_tu_choi_count || 0}`}
        icon={XCircle}
        color="rose"
      />
      <KpiCard
        title="FT HOÀN THÀNH"
        value={kpi?.ft_hoan_thanh_count || 0}
        subtext="Đang chờ cơ điện nghiệm thu"
        icon={CheckCircle2}
        color="cyan"
      />
      <KpiCard
        title="CHỜ CĐ TIẾP NHẬN"
        value={kpi?.cho_cd_tiep_nhan_count || 0}
        subtext="Việc mới chưa phân phối"
        icon={UserCheck}
        color="purple"
      />
    </div>
  );
}
