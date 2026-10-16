import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  FolderKanban,
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  X,
  ToggleLeft,
  ToggleRight,
  MoveRight,
} from 'lucide-react';
import { codinhApi } from '../../../api/codinhApi';

export default function OrgManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedClusters, setExpandedClusters] = useState({});
  const [expandedTeams, setExpandedTeams] = useState({});

  // Modals state
  const [clusterModal, setClusterModal] = useState({ open: false, cluster: null });
  const [teamModal, setTeamModal] = useState({ open: false, team: null, defaultClusterId: null });
  const [employeeModal, setEmployeeModal] = useState({ open: false, employee: null, defaultTeamId: null });
  const [moveEmployeeModal, setMoveEmployeeModal] = useState({ open: false, employee: null });
  const [moveTeamModal, setMoveTeamModal] = useState({ open: false, team: null });
  const [confirmExcelModal, setConfirmExcelModal] = useState(false);
  const [excelFile, setExcelFile] = useState(null);

  // Form errors
  const [formError, setFormError] = useState('');

  // 1. Fetch Org Tree
  const {
    data: orgTree = [],
    isLoading: loadingTree,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ['codinh-org-tree'],
    queryFn: codinhApi.getOrgTree,
  });

  // 2. Fetch Unmatched Usernames
  const {
    data: unmatchedUsers = [],
    isLoading: loadingUnmatched,
    refetch: refetchUnmatched,
  } = useQuery({
    queryKey: ['codinh-org-unmatched'],
    queryFn: codinhApi.getUnmatchedUsernames,
  });

  // Invalidate queries after mutation
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['codinh-org-tree'] });
    queryClient.invalidateQueries({ queryKey: ['codinh-org-unmatched'] });
    queryClient.invalidateQueries({ queryKey: ['codinh-stats'] });
    queryClient.invalidateQueries({ queryKey: ['codinh-reports'] });
  };

  // Expand / collapse all helpers
  const expandAll = () => {
    const cMap = {};
    const tMap = {};
    orgTree.forEach((c) => {
      cMap[c.id] = true;
      (c.teams || []).forEach((t) => {
        tMap[t.id] = true;
      });
    });
    setExpandedClusters(cMap);
    setExpandedTeams(tMap);
  };

  const collapseAll = () => {
    setExpandedClusters({});
    setExpandedTeams({});
  };

  // Toggle helpers
  const toggleCluster = (cId) => {
    setExpandedClusters((prev) => ({ ...prev, [cId]: prev[cId] === undefined ? false : !prev[cId] }));
  };

  const toggleTeam = (tId) => {
    setExpandedTeams((prev) => ({ ...prev, [tId]: prev[tId] === undefined ? false : !prev[tId] }));
  };

  // Flat teams list for dropdowns
  const flatTeams = useMemo(() => {
    const list = [];
    orgTree.forEach((c) => {
      (c.teams || []).forEach((t) => {
        list.push({
          id: t.id,
          ma_doi: t.ma_doi,
          ten_doi: t.ten_doi,
          cluster_id: c.id,
          cluster_name: c.ten_cum,
        });
      });
    });
    return list;
  }, [orgTree]);

  // Set Leader mutation
  const handleSetLeader = async (teamId, empId) => {
    try {
      await codinhApi.setTeamLeader(teamId, empId);
      invalidateAll();
    } catch (err) {
      alert(`Lỗi khi đặt đội trưởng: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Re-import from Excel mutation
  const handleImportExcel = async () => {
    try {
      setFormError('');
      await codinhApi.importOrgExcel(excelFile);
      setConfirmExcelModal(false);
      setExcelFile(null);
      invalidateAll();
      alert('Nạp lại danh mục từ Excel thành công!');
    } catch (err) {
      setFormError(err.response?.data?.detail || err.message || 'Lỗi khi nạp file Excel');
    }
  };

  // Delete handlers
  const handleDeleteCluster = async (cId, cName) => {
    if (!window.confirm(`Bạn có chắc muốn xóa cụm "${cName}" và toàn bộ đội, nhân viên trực thuộc?`)) return;
    try {
      await codinhApi.deleteCluster(cId);
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteTeam = async (tId, tName) => {
    if (!window.confirm(`Bạn có chắc muốn xóa đội "${tName}" và toàn bộ nhân viên trực thuộc?`)) return;
    try {
      await codinhApi.deleteTeam(tId);
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteEmployee = async (eId, eName) => {
    if (!window.confirm(`Bạn có chắc muốn xóa nhân viên "${eName}" khỏi danh mục? (Lưu ý: Nếu nhân viên đã có WO, hãy tắt hoạt động thay vì xóa để bảo toàn dữ liệu).`)) return;
    try {
      await codinhApi.deleteEmployee(eId);
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  // Toggle Active handlers
  const handleToggleClusterActive = async (cluster) => {
    try {
      await codinhApi.updateCluster(cluster.id, {
        ma_cum: cluster.ma_cum,
        ten_cum: cluster.ten_cum,
        sort_order: cluster.sort_order,
        is_active: !cluster.is_active,
      });
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const handleToggleTeamActive = async (team) => {
    try {
      await codinhApi.updateTeam(team.id, {
        cluster_id: team.cluster_id,
        ma_doi: team.ma_doi,
        ten_doi: team.ten_doi,
        sort_order: team.sort_order,
        is_active: !team.is_active,
      });
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  const handleToggleEmployeeActive = async (emp) => {
    try {
      await codinhApi.updateEmployee(emp.id, {
        team_id: emp.team_id,
        username: emp.username,
        ho_ten: emp.ho_ten,
        la_doi_truong: emp.la_doi_truong,
        sort_order: emp.sort_order,
        is_active: !emp.is_active,
      });
      invalidateAll();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    }
  };

  // Search filtering
  const filteredTree = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return orgTree;

    return orgTree
      .map((c) => {
        const cMatch =
          c.ten_cum.toLowerCase().includes(q) || c.ma_cum.toLowerCase().includes(q);
        const matchingTeams = (c.teams || [])
          .map((t) => {
            const tMatch =
              t.ten_doi.toLowerCase().includes(q) || t.ma_doi.toLowerCase().includes(q);
            const matchingEmps = (t.employees || []).filter(
              (e) =>
                e.ho_ten.toLowerCase().includes(q) || e.username.toLowerCase().includes(q)
            );
            if (tMatch || matchingEmps.length > 0) {
              return {
                ...t,
                employees: tMatch ? t.employees : matchingEmps,
              };
            }
            return null;
          })
          .filter(Boolean);

        if (cMatch || matchingTeams.length > 0) {
          return {
            ...c,
            teams: cMatch ? c.teams : matchingTeams,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [orgTree, searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Toolbar */}
      <div
        className="table-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Building2 size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Cơ Cấu Tổ Chức CĐBR (Cụm → Đội → Nhân viên)
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Danh mục nguồn duy nhất tổng hợp số liệu tab Đội và tab Cụm trên toàn bộ báo cáo CĐBR
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Search box */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Tìm kiếm username, tên, đội..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '6px 28px 6px 30px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                width: '230px',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Expand / Collapse All */}
          <button
            type="button"
            onClick={expandAll}
            className="btn btn-outline"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            title="Mở rộng tất cả Cụm và Đội"
          >
            Mở rộng
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="btn btn-outline"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            title="Thu gọn tất cả Cụm và Đội"
          >
            Thu gọn
          </button>

          {/* Add Cluster */}
          <button
            type="button"
            onClick={() => setClusterModal({ open: true, cluster: null })}
            className="btn btn-primary"
            style={{
              fontSize: '0.8rem',
              padding: '6px 14px',
              background: '#8b5cf6',
              borderColor: '#8b5cf6',
              gap: '6px',
            }}
          >
            <Plus size={14} />
            <span>Thêm Cụm</span>
          </button>

          {/* Import Excel */}
          <button
            type="button"
            onClick={() => setConfirmExcelModal(true)}
            className="btn btn-outline"
            style={{
              fontSize: '0.8rem',
              padding: '6px 12px',
              borderColor: '#8b5cf6',
              color: '#8b5cf6',
              gap: '6px',
            }}
            title="Nạp lại danh mục từ file danhsachnhanvien_codinh.xlsx"
          >
            <Upload size={14} />
            <span>Nạp từ Excel</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => {
              refetchTree();
              refetchUnmatched();
            }}
            className="btn btn-outline"
            style={{ padding: '6px 10px' }}
            title="Làm mới dữ liệu cây cơ cấu"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 2. Main 2-column Layout: 3-tier Tree (Left) + Unmatched List (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 360px',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: 3-tier Tree */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loadingTree ? (
            <div
              className="table-card"
              style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              <div className="spin" style={{ display: 'inline-block', marginBottom: '10px' }}>
                <RefreshCw size={24} style={{ color: '#8b5cf6' }} />
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem' }}>Đang tải danh mục cơ cấu CĐBR 3 cấp...</p>
            </div>
          ) : filteredTree.length === 0 ? (
            <div
              className="table-card"
              style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              <AlertTriangle size={32} style={{ color: '#f59e0b', margin: '0 auto 10px' }} />
              <p style={{ margin: 0, fontSize: '0.86rem' }}>
                Không tìm thấy Cụm / Đội / Nhân viên nào khớp với từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredTree.map((cluster) => {
                const isExpanded = expandedClusters[cluster.id] !== false; // default expanded
                const clusterTeams = cluster.teams || [];
                const totalEmpsInCluster = clusterTeams.reduce(
                  (sum, t) => sum + (t.employees || []).length,
                  0
                );

                return (
                  <div
                    key={cluster.id}
                    className="table-card"
                    style={{
                      overflow: 'hidden',
                      opacity: cluster.is_active ? 1 : 0.6,
                      border: cluster.is_active ? '1px solid var(--border-color)' : '1px dashed var(--border-color)',
                    }}
                  >
                    {/* Cluster Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                      }}
                      onClick={() => toggleCluster(cluster.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCluster(cluster.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>

                        <Building2 size={18} style={{ color: '#8b5cf6' }} />

                        <div>
                          <span
                            className="badge badge-purple"
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              marginRight: '8px',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {cluster.ma_cum}
                          </span>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            {cluster.ten_cum}
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="badge badge-neutral"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        >
                          {clusterTeams.length} đội • {totalEmpsInCluster} nhân sự
                        </span>

                        {/* Add Team */}
                        <button
                          type="button"
                          onClick={() =>
                            setTeamModal({ open: true, team: null, defaultClusterId: cluster.id })
                          }
                          className="btn btn-outline"
                          style={{
                            fontSize: '0.72rem',
                            padding: '3px 9px',
                            gap: '4px',
                            color: '#8b5cf6',
                            borderColor: 'rgba(139, 92, 246, 0.4)',
                          }}
                          title="Thêm Đội mới vào Cụm này"
                        >
                          <Plus size={12} />
                          <span>Thêm Đội</span>
                        </button>

                        {/* Edit Cluster */}
                        <button
                          type="button"
                          onClick={() => setClusterModal({ open: true, cluster })}
                          className="btn btn-outline"
                          style={{ padding: '3px 7px', color: 'var(--text-muted)' }}
                          title="Sửa tên hoặc mã Cụm"
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Toggle Active */}
                        <button
                          type="button"
                          onClick={() => handleToggleClusterActive(cluster)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: cluster.is_active ? 'var(--success)' : 'var(--text-muted)',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title={cluster.is_active ? 'Cụm đang bật (bấm để tắt)' : 'Cụm đang tắt (bấm để bật)'}
                        >
                          {cluster.is_active ? <ToggleRight size={19} /> : <ToggleLeft size={19} />}
                        </button>

                        {/* Delete Cluster */}
                        <button
                          type="button"
                          onClick={() => handleDeleteCluster(cluster.id, cluster.ten_cum)}
                          className="btn btn-outline"
                          style={{
                            padding: '3px 7px',
                            color: 'var(--danger-dark)',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                          }}
                          title="Xóa Cụm"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Cluster Teams List */}
                    {isExpanded && (
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {clusterTeams.length === 0 ? (
                          <div style={{ padding: '12px', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Chưa có đội nào trong cụm này. Nhấn "Thêm Đội" để tạo đội mới.
                          </div>
                        ) : (
                          clusterTeams.map((team) => {
                            const isTeamExp = expandedTeams[team.id] !== false; // default expanded
                            const teamEmployees = team.employees || [];
                            const leader = teamEmployees.find((e) => e.la_doi_truong);

                            return (
                              <div
                                key={team.id}
                                style={{
                                  border: '1px solid var(--border-color)',
                                  borderRadius: 'var(--radius-md)',
                                  overflow: 'hidden',
                                  background: 'var(--bg-secondary)',
                                  opacity: team.is_active ? 1 : 0.6,
                                }}
                              >
                                {/* Team Header */}
                                <div
                                  style={{
                                    padding: '8px 12px',
                                    background: 'var(--bg-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    borderBottom: isTeamExp ? '1px solid var(--border-color)' : 'none',
                                  }}
                                  onClick={() => toggleTeam(team.id)}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTeam(team.id);
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-muted)',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      {isTeamExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>

                                    <FolderKanban size={15} style={{ color: 'var(--brand-primary)' }} />

                                    <div>
                                      <span
                                        className="badge badge-neutral"
                                        style={{
                                          fontSize: '0.7rem',
                                          fontFamily: 'var(--font-mono)',
                                          marginRight: '6px',
                                        }}
                                      >
                                        {team.ma_doi}
                                      </span>
                                      <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                                        {team.ten_doi}
                                      </strong>
                                      {leader && (
                                        <span
                                          style={{
                                            marginLeft: '8px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            fontSize: '0.74rem',
                                            color: 'var(--warning-dark)',
                                            fontWeight: 600,
                                          }}
                                        >
                                          <span>⭐</span>
                                          <span>{leader.ho_ten}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span
                                      className="badge"
                                      style={{
                                        fontSize: '0.68rem',
                                        padding: '2px 6px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                      }}
                                    >
                                      {teamEmployees.length} NS
                                    </span>

                                    {/* Add Employee */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEmployeeModal({
                                          open: true,
                                          employee: null,
                                          defaultTeamId: team.id,
                                        })
                                      }
                                      className="btn btn-outline"
                                      style={{
                                        fontSize: '0.7rem',
                                        padding: '2px 7px',
                                        gap: '3px',
                                      }}
                                      title="Thêm nhân viên vào đội này"
                                    >
                                      <Plus size={11} />
                                      <span>Thêm NV</span>
                                    </button>

                                    {/* Move Team to Another Cluster */}
                                    <button
                                      type="button"
                                      onClick={() => setMoveTeamModal({ open: true, team })}
                                      className="btn btn-outline"
                                      style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
                                      title="Chuyển Đội này sang Cụm khác"
                                    >
                                      <MoveRight size={11} />
                                    </button>

                                    {/* Edit Team */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setTeamModal({
                                          open: true,
                                          team,
                                          defaultClusterId: cluster.id,
                                        })
                                      }
                                      className="btn btn-outline"
                                      style={{ padding: '2px 6px', color: 'var(--text-muted)' }}
                                      title="Sửa thông tin Đội"
                                    >
                                      <Edit2 size={11} />
                                    </button>

                                    {/* Toggle Active */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTeamActive(team)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: team.is_active ? 'var(--success)' : 'var(--text-muted)',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                      title={team.is_active ? 'Đang bật (bấm để tắt)' : 'Đang tắt'}
                                    >
                                      {team.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                                    </button>

                                    {/* Delete Team */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTeam(team.id, team.ten_doi)}
                                      className="btn btn-outline"
                                      style={{
                                        padding: '2px 6px',
                                        color: 'var(--danger-dark)',
                                        borderColor: 'rgba(239, 68, 68, 0.3)',
                                      }}
                                      title="Xóa Đội"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>

                                {/* Employees List */}
                                {isTeamExp && (
                                  <div
                                    style={{
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '4px',
                                    }}
                                  >
                                    {teamEmployees.length === 0 ? (
                                      <div
                                        style={{
                                          padding: '6px',
                                          fontSize: '0.75rem',
                                          color: 'var(--text-muted)',
                                          fontStyle: 'italic',
                                        }}
                                      >
                                        Chưa có nhân viên nào. Bấm "Thêm NV" để gán nhân viên vào đội.
                                      </div>
                                    ) : (
                                      teamEmployees.map((emp) => (
                                        <div
                                          key={emp.id}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '5px 10px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: emp.is_active ? 'var(--bg-tertiary)' : 'rgba(0,0,0,0.03)',
                                            opacity: emp.is_active ? 1 : 0.5,
                                            border: '1px solid var(--border-subtle)',
                                            fontSize: '0.78rem',
                                          }}
                                        >
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {emp.la_doi_truong ? (
                                              <span
                                                style={{ color: '#f59e0b', fontSize: '0.85rem' }}
                                                title="Đội trưởng"
                                              >
                                                ⭐
                                              </span>
                                            ) : (
                                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                •
                                              </span>
                                            )}

                                            <strong
                                              style={{
                                                color: emp.la_doi_truong ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                fontWeight: emp.la_doi_truong ? 700 : 500,
                                              }}
                                            >
                                              {emp.ho_ten}
                                            </strong>

                                            <code
                                              style={{
                                                fontSize: '0.74rem',
                                                padding: '1px 5px',
                                                borderRadius: '3px',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-muted)',
                                              }}
                                            >
                                              {emp.username}
                                            </code>
                                          </div>

                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {/* Set / Unset Leader Button */}
                                            <button
                                              type="button"
                                              onClick={() => handleSetLeader(team.id, emp.la_doi_truong ? null : emp.id)}
                                              className="btn btn-outline"
                                              style={{
                                                fontSize: '0.68rem',
                                                padding: '2px 6px',
                                                gap: '3px',
                                                color: emp.la_doi_truong ? 'var(--warning-dark)' : 'var(--text-muted)',
                                                borderColor: emp.la_doi_truong ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)',
                                              }}
                                              title={emp.la_doi_truong ? 'Hủy quyền Đội trưởng' : 'Đặt làm Đội trưởng của đội này'}
                                            >
                                              ⭐ {emp.la_doi_truong ? 'Đội trưởng' : 'Gán ĐT'}
                                            </button>

                                            {/* Move Employee to Another Team */}
                                            <button
                                              type="button"
                                              onClick={() => setMoveEmployeeModal({ open: true, employee: emp })}
                                              className="btn btn-outline"
                                              style={{ padding: '2px 5px', color: 'var(--text-muted)' }}
                                              title="Chuyển nhân viên sang Đội khác"
                                            >
                                              <MoveRight size={11} />
                                            </button>

                                            {/* Edit Employee */}
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEmployeeModal({
                                                  open: true,
                                                  employee: emp,
                                                  defaultTeamId: team.id,
                                                })
                                              }
                                              className="btn btn-outline"
                                              style={{ padding: '2px 5px', color: 'var(--text-muted)' }}
                                              title="Sửa thông tin nhân viên"
                                            >
                                              <Edit2 size={11} />
                                            </button>

                                            {/* Toggle Active */}
                                            <button
                                              type="button"
                                              onClick={() => handleToggleEmployeeActive(emp)}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: emp.is_active ? 'var(--success)' : 'var(--text-muted)',
                                                padding: '2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                              }}
                                              title={emp.is_active ? 'Đang hoạt động (bấm để tắt)' : 'Đang tắt'}
                                            >
                                              {emp.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                                            </button>

                                            {/* Delete Employee */}
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteEmployee(emp.id, emp.ho_ten)}
                                              className="btn btn-outline"
                                              style={{
                                                padding: '2px 5px',
                                                color: 'var(--danger-dark)',
                                                borderColor: 'rgba(239, 68, 68, 0.3)',
                                              }}
                                              title="Xóa nhân viên khỏi danh mục"
                                            >
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Reference list of Unmatched Usernames */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <div className="table-card" style={{ padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={17} style={{ color: '#8b5cf6' }} />
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Username Ngoài Danh Mục
                </h3>
              </div>
              <span
                className="badge badge-neutral"
                style={{ fontSize: '0.75rem', fontWeight: 700 }}
              >
                {unmatchedUsers.length} tài khoản
              </span>
            </div>

            {/* Instruction info box */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(139, 92, 246, 0.06)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                marginBottom: '14px',
              }}
            >
              <p style={{ margin: '0 0 6px 0' }}>
                <strong>📌 Lưu ý quy định:</strong> Các tài khoản này thuộc phân hệ Cơ điện, Điều hành, NOC hoặc đơn vị hành chính khác, <strong>KHÔNG</strong> thuộc nhân sự CĐBR.
              </p>
              <p style={{ margin: 0 }}>
                Toàn bộ WO của các tài khoản này tự động gom vào dòng <em>"Chưa phân đội / Chưa phân cụm"</em> ở cuối bảng để bảo toàn 100% tổng WO. Danh sách này chỉ để tham khảo.
              </p>
            </div>

            {loadingUnmatched ? (
              <div style={{ padding: '30px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Đang nạp danh sách tài khoản...
              </div>
            ) : unmatchedUsers.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Không có username nào phát sinh WO ngoài danh mục.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: '520px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  paddingRight: '4px',
                }}
              >
                {unmatchedUsers.map((u) => (
                  <div
                    key={u.username}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.76rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)', display: 'block' }}>
                        {u.username}
                      </strong>
                      {u.full_name && u.full_name !== u.username && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {u.full_name}
                        </span>
                      )}
                    </div>
                    <span
                      className="badge badge-purple"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '0.72rem',
                      }}
                    >
                      {u.total_wos?.toLocaleString('vi-VN')} WO
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODALS */}
      {/* ======================================================== */}

      {/* 1. Cluster Modal */}
      {clusterModal.open && (
        <ClusterFormModal
          cluster={clusterModal.cluster}
          onClose={() => setClusterModal({ open: false, cluster: null })}
          onSuccess={() => {
            setClusterModal({ open: false, cluster: null });
            invalidateAll();
          }}
        />
      )}

      {/* 2. Team Modal */}
      {teamModal.open && (
        <TeamFormModal
          team={teamModal.team}
          defaultClusterId={teamModal.defaultClusterId}
          clusters={orgTree}
          onClose={() => setTeamModal({ open: false, team: null, defaultClusterId: null })}
          onSuccess={() => {
            setTeamModal({ open: false, team: null, defaultClusterId: null });
            invalidateAll();
          }}
        />
      )}

      {/* 3. Employee Modal */}
      {employeeModal.open && (
        <EmployeeFormModal
          employee={employeeModal.employee}
          defaultTeamId={employeeModal.defaultTeamId}
          teams={flatTeams}
          onClose={() => setEmployeeModal({ open: false, employee: null, defaultTeamId: null })}
          onSuccess={() => {
            setEmployeeModal({ open: false, employee: null, defaultTeamId: null });
            invalidateAll();
          }}
        />
      )}

      {/* 4. Move Employee Modal */}
      {moveEmployeeModal.open && (
        <MoveEmployeeModal
          employee={moveEmployeeModal.employee}
          teams={flatTeams}
          onClose={() => setMoveEmployeeModal({ open: false, employee: null })}
          onSuccess={() => {
            setMoveEmployeeModal({ open: false, employee: null });
            invalidateAll();
          }}
        />
      )}

      {/* 5. Move Team Modal */}
      {moveTeamModal.open && (
        <MoveTeamModal
          team={moveTeamModal.team}
          clusters={orgTree}
          onClose={() => setMoveTeamModal({ open: false, team: null })}
          onSuccess={() => {
            setMoveTeamModal({ open: false, team: null });
            invalidateAll();
          }}
        />
      )}

      {/* 6. Confirm Excel Import Modal */}
      {confirmExcelModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setConfirmExcelModal(false);
            setExcelFile(null);
            setFormError('');
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '16px',
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: 'var(--warning-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Xác Nhận Nạp Danh Mục Từ Excel
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.45 }}>
                  Hành động này sẽ nạp lại toàn bộ Cụm, Đội, Nhân viên từ file Excel và <strong>ghi đè toàn bộ các điều chỉnh thủ công</strong> đã lưu trong database.
                </p>
              </div>
            </div>

            {/* Optional file selector */}
            <div
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                marginBottom: '16px',
              }}
            >
              <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Chọn file Excel tùy chỉnh (Không bắt buộc):
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                style={{ fontSize: '0.76rem', width: '100%' }}
              />
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                Nếu không chọn file, máy chủ sẽ dùng file gốc <code>danhsachnhanvien_codinh.xlsx</code>.
              </p>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--danger-light)',
                  color: 'var(--danger-dark)',
                  fontSize: '0.78rem',
                  marginBottom: '14px',
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setConfirmExcelModal(false);
                  setExcelFile(null);
                  setFormError('');
                }}
                className="btn btn-outline"
                style={{ fontSize: '0.8rem', padding: '7px 14px' }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleImportExcel}
                className="btn btn-danger"
                style={{ fontSize: '0.8rem', padding: '7px 16px' }}
              >
                Đồng Ý Ghi Đè & Nạp Lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// FORM MODAL COMPONENTS (Pure Vanilla CSS)
// ==========================================

function ClusterFormModal({ cluster, onClose, onSuccess }) {
  const [maCum, setMaCum] = useState(cluster?.ma_cum || '');
  const [tenCum, setTenCum] = useState(cluster?.ten_cum || '');
  const [sortOrder, setSortOrder] = useState(cluster?.sort_order || 0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!maCum.trim() || !tenCum.trim()) {
      setError('Vui lòng nhập đầy đủ mã cụm và tên cụm');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (cluster) {
        await codinhApi.updateCluster(cluster.id, {
          ma_cum: maCum.trim(),
          ten_cum: tenCum.trim(),
          sort_order: Number(sortOrder) || 0,
          is_active: cluster.is_active,
        });
      } else {
        await codinhApi.createCluster({
          ma_cum: maCum.trim(),
          ten_cum: tenCum.trim(),
          sort_order: Number(sortOrder) || 0,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
            {cluster ? 'Sửa Thông Tin Cụm' : 'Thêm Cụm Điều Hành Mới'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Mã cụm (viết tắt):
            </label>
            <input
              type="text"
              value={maCum}
              onChange={(e) => setMaCum(e.target.value)}
              placeholder="Ví dụ: VCC_HTH_002_CLC hoặc CLC"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Tên cụm đầy đủ:
            </label>
            <input
              type="text"
              value={tenCum}
              onChange={(e) => setTenCum(e.target.value)}
              placeholder="Ví dụ: Trung tâm Can Lộc"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Thứ tự hiển thị:
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.76rem', fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 18px',
                background: '#8b5cf6',
                borderColor: '#8b5cf6',
              }}
            >
              {submitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamFormModal({ team, defaultClusterId, clusters, onClose, onSuccess }) {
  const [clusterId, setClusterId] = useState(team?.cluster_id || defaultClusterId || clusters[0]?.id || '');
  const [maDoi, setMaDoi] = useState(team?.ma_doi || '');
  const [tenDoi, setTenDoi] = useState(team?.ten_doi || '');
  const [sortOrder, setSortOrder] = useState(team?.sort_order || 0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clusterId || !maDoi.trim() || !tenDoi.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin đội');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (team) {
        await codinhApi.updateTeam(team.id, {
          cluster_id: Number(clusterId),
          ma_doi: maDoi.trim(),
          ten_doi: tenDoi.trim(),
          sort_order: Number(sortOrder) || 0,
          is_active: team.is_active,
        });
      } else {
        await codinhApi.createTeam({
          cluster_id: Number(clusterId),
          ma_doi: maDoi.trim(),
          ten_doi: tenDoi.trim(),
          sort_order: Number(sortOrder) || 0,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
            {team ? 'Sửa Thông Tin Đội' : 'Thêm Đội Mới'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Cụm trực thuộc:
            </label>
            <select
              value={clusterId}
              onChange={(e) => setClusterId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ma_cum} - {c.ten_cum}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Mã đội (viết tắt):
            </label>
            <input
              type="text"
              value={maDoi}
              onChange={(e) => setMaDoi(e.target.value)}
              placeholder="Ví dụ: Đội 1 Can Lộc"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Tên đội đầy đủ:
            </label>
            <input
              type="text"
              value={tenDoi}
              onChange={(e) => setTenDoi(e.target.value)}
              placeholder="Ví dụ: Đội Kỹ thuật CĐBR 1"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Thứ tự hiển thị:
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.76rem', fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 18px',
                background: '#8b5cf6',
                borderColor: '#8b5cf6',
              }}
            >
              {submitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmployeeFormModal({ employee, defaultTeamId, teams, onClose, onSuccess }) {
  const [teamId, setTeamId] = useState(employee?.team_id || defaultTeamId || teams[0]?.id || '');
  const [username, setUsername] = useState(employee?.username || '');
  const [hoTen, setHoTen] = useState(employee?.ho_ten || '');
  const [laDoiTruong, setLaDoiTruong] = useState(employee?.la_doi_truong || false);
  const [sortOrder, setSortOrder] = useState(employee?.sort_order || 0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!teamId || !username.trim() || !hoTen.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin nhân viên');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (employee) {
        await codinhApi.updateEmployee(employee.id, {
          team_id: Number(teamId),
          username: username.trim(),
          ho_ten: hoTen.trim(),
          la_doi_truong: Boolean(laDoiTruong),
          sort_order: Number(sortOrder) || 0,
          is_active: employee.is_active,
        });
      } else {
        await codinhApi.createEmployee({
          team_id: Number(teamId),
          username: username.trim(),
          ho_ten: hoTen.trim(),
          la_doi_truong: Boolean(laDoiTruong),
          sort_order: Number(sortOrder) || 0,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
            {employee ? 'Sửa Nhân Viên' : 'Thêm Nhân Viên Mới'}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Đội trực thuộc:
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cluster_name} → {t.ten_doi}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Username nhận WO:
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ví dụ: phungnh hoặc d00195345"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Họ và tên:
            </label>
            <input
              type="text"
              value={hoTen}
              onChange={(e) => setHoTen(e.target.value)}
              placeholder="Ví dụ: Nguyễn Hữu Phùng"
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
            <input
              type="checkbox"
              id="chkLeader"
              checked={laDoiTruong}
              onChange={(e) => setLaDoiTruong(e.target.checked)}
              style={{ cursor: 'pointer', width: '15px', height: '15px' }}
            />
            <label htmlFor="chkLeader" style={{ fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              ⭐ Đặt làm Đội trưởng (Mỗi đội tối đa 1 đội trưởng)
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.76rem', fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 18px',
                background: '#8b5cf6',
                borderColor: '#8b5cf6',
              }}
            >
              {submitting ? 'Đang lưu...' : 'Lưu Nhân Viên'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MoveEmployeeModal({ employee, teams, onClose, onSuccess }) {
  const [newTeamId, setNewTeamId] = useState(employee?.team_id || teams[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleMove = async (e) => {
    e.preventDefault();
    if (!newTeamId || Number(newTeamId) === employee.team_id) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await codinhApi.updateEmployee(employee.id, {
        team_id: Number(newTeamId),
        username: employee.username,
        ho_ten: employee.ho_ten,
        la_doi_truong: employee.la_doi_truong,
        sort_order: employee.sort_order,
        is_active: employee.is_active,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '400px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
            Chuyển Nhân Viên Sang Đội Khác
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleMove} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Chuyển nhân viên <strong>{employee?.ho_ten}</strong> (<code>{employee?.username}</code>) sang đội mới:
          </p>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Chọn đội đích:
            </label>
            <select
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.cluster_name} → {t.ten_doi}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.76rem', fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 18px',
                background: '#8b5cf6',
                borderColor: '#8b5cf6',
              }}
            >
              {submitting ? 'Đang chuyển...' : 'Xác Nhận Chuyển'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MoveTeamModal({ team, clusters, onClose, onSuccess }) {
  const [newClusterId, setNewClusterId] = useState(team?.cluster_id || clusters[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleMove = async (e) => {
    e.preventDefault();
    if (!newClusterId || Number(newClusterId) === team.cluster_id) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await codinhApi.updateTeam(team.id, {
        cluster_id: Number(newClusterId),
        ma_doi: team.ma_doi,
        ten_doi: team.ten_doi,
        sort_order: team.sort_order,
        is_active: team.is_active,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '400px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>
            Chuyển Đội Sang Cụm Khác
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleMove} style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Chuyển đội <strong>{team?.ten_doi}</strong> ({team?.ma_doi}) sang Cụm quản lý mới:
          </p>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: '5px' }}>
              Chọn cụm đích:
            </label>
            <select
              value={newClusterId}
              onChange={(e) => setNewClusterId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
              }}
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ma_cum} - {c.ten_cum}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.76rem', fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                fontSize: '0.8rem',
                padding: '6px 18px',
                background: '#8b5cf6',
                borderColor: '#8b5cf6',
              }}
            >
              {submitting ? 'Đang chuyển...' : 'Xác Nhận Chuyển'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
