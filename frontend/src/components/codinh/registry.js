import ThcReport, { getThcCardKpis, THC_COLUMNS } from './reports/ThcReport';
import PortKemReport, { getPortKemCardKpis, PORT_KEM_COLUMNS } from './reports/PortKemReport';
import QlctktTrienKhaiReport, { getQlctktCardKpis, buildQlctktColumns } from './reports/QlctktTrienKhaiReport';
import TongHopSuCoReport, { getTongHopSuCoCardKpis, buildTongHopSuCoColumns } from './reports/TongHopSuCoReport';

/**
 * Registry ánh xạ giữa mã báo cáo (report key) và Component giao diện tương ứng.
 */
export const REPORT_REGISTRY = {
  thc: {
    key: 'thc',
    title: 'Bảo Dưỡng Tủ Hộp Cáp (THC)',
    component: ThcReport,
    getCardKpis: getThcCardKpis,
    columns: THC_COLUMNS,
    timeType: 'month',
  },
  port_kem: {
    key: 'port_kem',
    title: 'ĐH Port Kém',
    component: PortKemReport,
    getCardKpis: getPortKemCardKpis,
    columns: PORT_KEM_COLUMNS,
    timeType: 'month',
  },
  qlctkt_trien_khai: {
    key: 'qlctkt_trien_khai',
    title: 'Tổng Hợp TK',
    component: QlctktTrienKhaiReport,
    getCardKpis: getQlctktCardKpis,
    columns: buildQlctktColumns(),
    timeType: 'date',
  },
  tong_hop_su_co: {
    key: 'tong_hop_su_co',
    title: 'Tổng Hợp Sự Cố',
    component: TongHopSuCoReport,
    getCardKpis: getTongHopSuCoCardKpis,
    columns: buildTongHopSuCoColumns(),
    timeType: 'date',
  },
};

/**
 * Lấy cấu hình báo cáo theo key (hoặc legacy categoryId: 13 -> thc, 14 -> port_kem).
 */
export function getReportConfig(keyOrId) {
  if (!keyOrId) return REPORT_REGISTRY.thc;

  const str = String(keyOrId).toLowerCase().trim();
  if (REPORT_REGISTRY[str]) {
    return REPORT_REGISTRY[str];
  }
  if (str === '13' || str.includes('thc') || str.includes('hộp cáp')) {
    return REPORT_REGISTRY.thc;
  }
  if (str === '14' || str.includes('port')) {
    return REPORT_REGISTRY.port_kem;
  }
  if (str.includes('qlctkt') || str.includes('trien_khai')) {
    return REPORT_REGISTRY.qlctkt_trien_khai;
  }
  if (str.includes('su_co') || str.includes('tong_hop_su_co')) {
    return REPORT_REGISTRY.tong_hop_su_co;
  }

  return REPORT_REGISTRY.thc;
}
