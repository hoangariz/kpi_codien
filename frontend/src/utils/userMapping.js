/**
 * Mapping giữa username và Họ và Tên nhân viên từ file user-ten.txt
 */

export const USER_TEN_MAP = {
  'd00199830': 'Nguyễn Duy Trường',
  'dungnt58': 'Nguyễn Trọng Dũng',
  'd00170579': 'Phan Văn Thọ',
  'd00192089': 'Đặng Anh Tuấn',
  'thanglv22': 'Lê Văn Thắng',
  'vccos_869512': 'Nguyễn Huy Tùng',
  'vccos_845996': 'Ngô Đức Tuân',
  'vccos_810463': 'Nguyễn Văn Tính',
  'd00170583': 'Nguyễn Đình Nam',
  'd00191063': 'Trần Danh Nhật',
  'vccos_833152': 'Nguyễn Khắc Hoàng',
  'vccos_845929': 'Phan Văn Định',
  'vccos_857655': 'Trần Xuân Trường',
  'huytn12': 'Trần Nam Huy',
  'Maipd2': 'Phạm Đình Mãi',
  'phungnh': 'Nguyễn Hữu Phùng',
  'thuantq2': 'Trương Quang Thuận',
  'vulq10': 'Lê Quang Vũ',
  'sonlx2': 'Lê Xuân Sơn',
  'ducnn1': 'Nguyễn Nhân Đức',
  'anhnd7': 'Nguyễn Đức Anh',
  'hungnv206': 'Nguyễn Văn Hưng',
  'tuanla67': 'Lê Anh Tuấn',
  'vccos_818400': 'Nguyễn Tống Ngọ',
  'vietba': 'Bùi Anh Việt',
  'd00191072': 'Nguyễn Thanh Sơn',
  'd00171157': 'Cao Phương Nam',
  'tuongpm2': 'Phan Mạnh Tường',
  'kimpx': 'Phan Xuân Kim',
  'vccos_869494': 'Nguyễn Xuân Tam',
  'vccos_221873': 'Trần Văn Định',
  'huyhq24': 'Hoàng Quang Huy',
  'vccos_833714': 'Mai Hồng Quân',
  'd00174777': 'Nguyễn Mạnh Hùng',
  'D00193295': 'Đoàn Vĩnh Hào',
  'd00170589': 'Ngô Việt Hùng',
  'tiendm8': 'Đoàn Mạnh Tiến',
  'D00202919': 'Phạm Mạnh Nho',
  'sonpt42': 'Phan Thái Sơn',
  'vccos_529402': 'Trần Ngọc Giảng',
  'vccos_524676': 'Trần Hồng Quân',
  'duchm32': 'Hồ Minh Đức',
  'vccos_849881': 'Nguyễn Đình Đạt',
  'd00124389': 'Nguyễn Văn Hợp',
  'thaihb': 'Hoàng Bá Thái',
  'congnc13': 'Nguyễn Chí Công',
  'tunv33': 'Nguyễn Văn Tư',
  'haunv18': 'Nguyễn Văn Hậu',
  'baovv': 'Võ Văn Bảo',
  'd00179978': 'Nguyễn Văn Hiền',
  'D00203018': 'Đặng Hữu Thuận',
  'vccos_440929': 'Nguyễn Văn Anh',
  'hienns': 'Nguyễn Sỹ Hiền',
  'nguyentvh': 'Trần Văn Hồng Nguyên',
  'hiepld42': 'Lê Đức Hiệp',
  'sonta4': 'Trần Anh Sơn',
  'toint3': 'Nguyễn Trọng Tới',
  'DUONGLT21': 'Lê Tùng Dương',
  'thangln': 'Lê Nam Thắng',
  'D00203617': 'Nguyễn Xuân Tỉnh',
  'quynhtm3': 'Trần Mạnh Quỳnh',
  'd00170596': 'Nguyễn Cao Cường',
  'd00195344': 'Nguyễn Thế Huấn',
  'thiennv16': 'Nguyễn Viết Thiện',
  'congld1': 'Lê Duy Công',
  'tuannt39': 'Nguyễn Thanh Tuấn',
  'd00192068': 'Trần Thanh Tuấn',
  'minhnv2': 'Nguyễn Văn Minh',
  'baodq15': 'Đậu Quốc Bảo',
  'd00170591': 'Trần Huy Thắng',
  'anhttt1': 'Cao Trọng Tuấn Anh',
  'd00181993': 'Hoàng Xuân Thái',
  'd00195348': 'Trương Hữu Ninh',
  'SonVX': 'Vũ Xuân Sơn',
  'binhnv55': 'Nguyễn Văn Bình',
  'hoanv24': 'Nguyễn Văn Hòa',
  'quanth29': 'Trương Hữu Quân',
  'ngoanlt1': 'Lại Thế Ngoan',
  'd00170599': 'Bùi Tuấn Anh',
  'hanhvt': 'Võ Tá Hạnh',
  'd00195345': 'Hoàng Xuân Quốc',
  'sontd9': 'Trần Đức Sơn',
  'haivq': 'Võ Quốc Hải',
  'vccos_432649': 'Dương Mạnh Vũ',
};

// Map lookup dạng lowercase để so khớp không phân biệt hoa thường
const LOWER_USER_MAP = Object.entries(USER_TEN_MAP).reduce((acc, [user, name]) => {
  acc[user.trim().toLowerCase()] = name;
  return acc;
}, {});

/**
 * Lấy Họ và Tên tương ứng với username
 * @param {string} user - Mã hoặc username của nhân viên
 * @returns {string} Họ và tên nếu tìm thấy, ngược lại trả về user gốc
 */
export function getUserFullName(user) {
  if (!user) return '';
  const key = String(user).trim().toLowerCase();
  return LOWER_USER_MAP[key] || user;
}
