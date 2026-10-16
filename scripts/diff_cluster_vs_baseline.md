# BẢNG SO SÁNH TAB CỤM CŨ VÀ MỚI (CĐBR)

> **Ngày tạo:** 2026-10-12  
> **Nguồn danh mục mới:** `danhsachnhanvien_codinh.xlsx` (Cụm -> Đội -> Nhân viên)  
> **Quy tắc gom Cụm mới:** Mỗi WO được tính về Cụm của Nhân viên thực hiện theo danh mục. WO của tài khoản ngoài danh mục được gom vào dòng `Chưa phân cụm` (`is_other=True`).

## 1. Kết quả kiểm tra toàn vẹn hệ thống

- **Summary khớp baseline:** ❌ Có 10 lỗi
- **Tab Nhân viên khớp baseline:** ❌ Có 10 lỗi
- **Tổng Cụm = Đội = Nhân viên = Summary:** ✅ 100% Khớp tuyệt đối mọi tháng
- **Drilldown khớp baseline:** ❌ Có 30 lỗi

---
## 2. So sánh chi tiết: Tháng hiện tại (Active Month)

### 2.1. Báo cáo Bảo Dưỡng Tủ Hộp Cáp (THC)

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 31 | 9 | 22 | 5 | 21 | 6 | 15 | 28.6% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 46 | 19 | 27 | 0 | 27 | 12 | 15 | 44.4% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 59 | 14 | 45 | 20 | 28 | 7 | 21 | 25.0% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 80 | 12 | 68 | 24 | 40 | 6 | 34 | 15.0% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 45 | 11 | 34 | 18 | 33 | 9 | 24 | 27.3% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 55 | 15 | 40 | 13 | 38 | 12 | 26 | 31.6% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 24 | 8 | 16 | 4 | 19 | 8 | 11 | 42.1% |
| 8 | **Chưa phân cụm** | 10 | 7 | 3 | 1 | 6 | 6 | 0 | 100.0% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 30 | 0 | 30 | 30 | 375 | 39 | 336 | 10.4% |
| 2 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 23 | 0 | 23 | 23 | 294 | 31 | 263 | 10.5% |
| 3 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 18 | 0 | 18 | 18 | 223 | 27 | 196 | 12.1% |
| 4 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 18 | 0 | 18 | 18 | 208 | 1 | 207 | 0.5% |
| 5 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 10 | 0 | 10 | 10 | 141 | 56 | 85 | 39.7% |
| 6 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 5 | 0 | 5 | 5 | 60 | 6 | 54 | 10.0% |

### 2.2. Báo cáo ĐH Port Kém

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 143 | 48 | 95 | 33 | 62 | 94 | 37.5% | 64.6% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 89 | 30 | 59 | 17 | 42 | 56 | 43.3% | 60.0% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 202 | 33 | 169 | 49 | 120 | 169 | 57.6% | 84.8% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 201 | 33 | 168 | 58 | 110 | 167 | 27.3% | 57.6% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 262 | 11 | 251 | 51 | 200 | 250 | 18.2% | 54.5% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 199 | 28 | 171 | 33 | 138 | 171 | 46.4% | 85.7% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 70 | 22 | 48 | 21 | 27 | 48 | 31.8% | 54.5% |
| 8 | **Chưa phân cụm** | 20 | 0 | 20 | 3 | 17 | 20 | 0.0% | 0.0% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 236 | 3 | 233 | 45 | 188 | 233 | 0.0% | 33.3% |
| 2 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 193 | 15 | 178 | 48 | 130 | 178 | 73.3% | 80.0% |
| 3 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 191 | 17 | 174 | 36 | 138 | 174 | 41.2% | 52.9% |
| 4 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 191 | 10 | 181 | 48 | 133 | 181 | 40.0% | 80.0% |
| 5 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 131 | 22 | 109 | 34 | 75 | 109 | 50.0% | 77.3% |
| 6 | Trung tâm Sơn Giang (VCC_HTH_007_SGG) | 88 | 16 | 72 | 16 | 56 | 72 | 56.2% | 68.8% |
| 7 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 64 | 10 | 54 | 23 | 31 | 54 | 40.0% | 50.0% |

---
## 2. So sánh chi tiết: Tháng 2026-08

### 2.1. Báo cáo Bảo Dưỡng Tủ Hộp Cáp (THC)

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 283 | 261 | 22 | 5 | 173 | 158 | 15 | 91.3% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 222 | 195 | 27 | 0 | 115 | 100 | 15 | 87.0% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 386 | 341 | 45 | 20 | 259 | 238 | 21 | 91.9% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 328 | 260 | 68 | 24 | 188 | 154 | 34 | 81.9% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 394 | 360 | 34 | 18 | 276 | 252 | 24 | 91.3% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 269 | 229 | 40 | 13 | 206 | 180 | 26 | 87.4% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 201 | 185 | 16 | 4 | 192 | 181 | 11 | 94.3% |
| 8 | **Chưa phân cụm** | 267 | 264 | 3 | 1 | 117 | 117 | 0 | 100.0% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 361 | 338 | 23 | 23 | 1751 | 1488 | 263 | 85.0% |
| 2 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 261 | 231 | 30 | 30 | 1493 | 1157 | 336 | 77.5% |
| 3 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 443 | 425 | 18 | 18 | 1331 | 1124 | 207 | 84.4% |
| 4 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 355 | 345 | 10 | 10 | 1311 | 1226 | 85 | 93.5% |
| 5 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 305 | 287 | 18 | 18 | 975 | 779 | 196 | 79.9% |
| 6 | Trung tâm Sơn Giang (VCC_HTH_007_SGG) | 177 | 177 | 0 | 0 | 927 | 927 | 0 | 100.0% |
| 7 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 183 | 178 | 5 | 5 | 725 | 671 | 54 | 92.6% |

### 2.2. Báo cáo ĐH Port Kém

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 389 | 294 | 95 | 33 | 62 | 94 | 37.8% | 59.2% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 236 | 177 | 59 | 17 | 42 | 56 | 29.9% | 40.7% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 405 | 236 | 169 | 49 | 120 | 169 | 26.7% | 43.6% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 488 | 320 | 168 | 58 | 110 | 167 | 16.9% | 32.2% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 429 | 178 | 251 | 51 | 200 | 250 | 17.4% | 33.1% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 422 | 251 | 171 | 33 | 138 | 171 | 21.9% | 43.4% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 161 | 113 | 48 | 21 | 27 | 48 | 14.2% | 35.4% |
| 8 | **Chưa phân cụm** | 67 | 47 | 20 | 3 | 17 | 20 | 4.3% | 23.4% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 448 | 267 | 181 | 48 | 133 | 181 | 16.1% | 30.7% |
| 2 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 409 | 176 | 233 | 45 | 188 | 233 | 14.2% | 23.9% |
| 3 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 395 | 221 | 174 | 36 | 138 | 174 | 20.4% | 34.8% |
| 4 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 384 | 206 | 178 | 48 | 130 | 178 | 24.8% | 38.3% |
| 5 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 354 | 245 | 109 | 34 | 75 | 109 | 41.2% | 58.0% |
| 6 | Trung tâm Sơn Giang (VCC_HTH_007_SGG) | 212 | 140 | 72 | 16 | 56 | 72 | 31.4% | 39.3% |
| 7 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 159 | 105 | 54 | 23 | 31 | 54 | 11.4% | 28.6% |

---
## 2. So sánh chi tiết: Toàn bộ thời gian (All)

### 2.1. Báo cáo Bảo Dưỡng Tủ Hộp Cáp (THC)

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 283 | 261 | 22 | 5 | 173 | 158 | 15 | 91.3% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 222 | 195 | 27 | 0 | 115 | 100 | 15 | 87.0% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 386 | 341 | 45 | 20 | 259 | 238 | 21 | 91.9% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 328 | 260 | 68 | 24 | 188 | 154 | 34 | 81.9% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 394 | 360 | 34 | 18 | 276 | 252 | 24 | 91.3% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 269 | 229 | 40 | 13 | 206 | 180 | 26 | 87.4% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 201 | 185 | 16 | 4 | 192 | 181 | 11 | 94.3% |
| 8 | **Chưa phân cụm** | 267 | 264 | 3 | 1 | 117 | 117 | 0 | 100.0% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Quá hạn | Tủ THC | Tủ xong | Tủ tồn | Tỉ lệ tủ (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 361 | 338 | 23 | 23 | 1751 | 1488 | 263 | 85.0% |
| 2 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 261 | 231 | 30 | 30 | 1493 | 1157 | 336 | 77.5% |
| 3 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 443 | 425 | 18 | 18 | 1331 | 1124 | 207 | 84.4% |
| 4 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 355 | 345 | 10 | 10 | 1311 | 1226 | 85 | 93.5% |
| 5 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 305 | 287 | 18 | 18 | 975 | 779 | 196 | 79.9% |
| 6 | Trung tâm Sơn Giang (VCC_HTH_007_SGG) | 177 | 177 | 0 | 0 | 927 | 927 | 0 | 100.0% |
| 7 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 183 | 178 | 5 | 5 | 725 | 671 | 54 | 92.6% |

### 2.2. Báo cáo ĐH Port Kém

#### Cụm MỚI (Tính theo Nhân viên -> Đội -> Cụm)
| STT | Cụm / Phân loại | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Trung tâm Can Lộc (VCC_HTH_002_CLC)** | 389 | 294 | 95 | 33 | 62 | 94 | 37.8% | 59.2% |
| 2 | **Trung tâm Sơn Giang (VCC_HTH_007_SGG)** | 236 | 177 | 59 | 17 | 42 | 56 | 29.9% | 40.7% |
| 3 | **Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL)** | 405 | 236 | 169 | 49 | 120 | 169 | 26.7% | 43.6% |
| 4 | **Trung tâm Thạch Hà (VCC_HTH_003_THA)** | 488 | 320 | 168 | 58 | 110 | 167 | 16.9% | 32.2% |
| 5 | **Trung tâm Sông Trí (VCC_HTH_005_STI)** | 429 | 178 | 251 | 51 | 200 | 250 | 17.4% | 33.1% |
| 6 | **Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN)** | 422 | 251 | 171 | 33 | 138 | 171 | 21.9% | 43.4% |
| 7 | **Trung tâm Hương Khê (VCC_HTH_006_HKE)** | 161 | 113 | 48 | 21 | 27 | 48 | 14.2% | 35.4% |
| 8 | **Chưa phân cụm** | 67 | 47 | 20 | 3 | 17 | 20 | 4.3% | 23.4% |

#### Nhóm CŨ (Tính theo codinh_tasks.nhom)
| STT | Nhóm cũ | Tổng WO | Đã đóng | Tồn | Home wifi kém | Port kém GPON | Quá hạn | KPI 24h (%) | KPI 72h (%) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Trung tâm Thạch Hà (VCC_HTH_003_THA) | 448 | 267 | 181 | 48 | 133 | 181 | 16.1% | 30.7% |
| 2 | Trung tâm Sông Trí (VCC_HTH_005_STI) | 409 | 176 | 233 | 45 | 188 | 233 | 14.2% | 23.9% |
| 3 | Trung tâm Cẩm Xuyên (VCC_HTH_004_CXN) | 395 | 221 | 174 | 36 | 138 | 174 | 20.4% | 34.8% |
| 4 | Trung tâm Bắc Hồng Lĩnh (VCC_HTH_001_BHL) | 384 | 206 | 178 | 48 | 130 | 178 | 24.8% | 38.3% |
| 5 | Trung tâm Can Lộc (VCC_HTH_002_CLC) | 354 | 245 | 109 | 34 | 75 | 109 | 41.2% | 58.0% |
| 6 | Trung tâm Sơn Giang (VCC_HTH_007_SGG) | 212 | 140 | 72 | 16 | 56 | 72 | 31.4% | 39.3% |
| 7 | Trung tâm Hương Khê (VCC_HTH_006_HKE) | 159 | 105 | 54 | 23 | 31 | 54 | 11.4% | 28.6% |
