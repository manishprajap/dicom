import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import axios from "axios";
import {
  IonPage,
  IonContent,
  IonFooter,
  IonIcon,
  IonCard,
  IonCardContent,
  IonSpinner,
  IonPopover,
  IonList,
  IonItem,
  IonLabel,
  useIonRouter,
} from "@ionic/react";
import "../css/Dashboard.css";

import {

  notificationsOutline,
  personCircleOutline,
  personOutline,
  logOutOutline,
  shieldCheckmarkOutline,
  businessOutline,
  chevronDownOutline,
  chevronForwardOutline,
  arrowForwardOutline,
  cloudUploadOutline,
  documentOutline,
  videocamOutline,
  documentTextOutline,
  imagesOutline,
  cameraOutline,
  listOutline,
  settingsOutline,
  personAddOutline,
  homeOutline,
  peopleOutline,
  pulseOutline,
} from "ionicons/icons";

const API_BASE = "https://aarnatechxperts.in/dicomapi/public/api";

// ---- Types -----------------------------------------------------------

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  description: string;
  iconBg: string;
  iconColor: string;
}

interface DashboardStats {
  doctors: number;
  users: number;
  dcm_files: number;
  mp4_files: number;
  image_files: number;
  pdf_files: number;
}

interface RecentUpload {
  patientID: string;
  patient: string;
  imagepath: string;
}

// ---- Static config (labels/colors only — no data here) ----------------

const MENU_META: Record<string, Pick<MenuItem, "description" | "iconBg" | "iconColor">> = {
  "Take Picture /Video": {
    description: "Capture new images or videos",
    iconBg: "#d1fae5",
    iconColor: "#059669",
  },
  "Select Photo": {
    description: "Select images or videos from your device",
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
  },
  View: {
    description: "View history, status and manage uploads",
    iconBg: "#ede9fe",
    iconColor: "#7c3aed",
  },
  Settings: {
    description: "App preferences, servers and account",
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
  },
  "Add User": {
    description: "Register a new team member",
    iconBg: "#fce7f3",
    iconColor: "#db2777",
  },
};

const Dashboard: React.FC = () => {
  const router = useIonRouter();
  const location = useLocation();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [accountMenuEvent, setAccountMenuEvent] = useState<
    MouseEvent | undefined
  >(undefined);

  const openAccountMenu = (e: React.MouseEvent) => {
    e.persist?.();
    setAccountMenuEvent(e.nativeEvent);
    setShowAccountMenu(true);
  };

  // Read account type + profile info from stored user data
  const userData = useMemo(() => {
    try {
      const raw = localStorage.getItem("uData");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const userId = localStorage.getItem("userId");

  const accountType = (userData?.types ?? "").toString().toLowerCase();
  const isGroupAccount = accountType === "group";

  const doctorName = userData?.name ?? "";
  const facilityName = userData?.facility ?? "";
  const department = userData?.department ?? "";

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      if (!userId) {
        setStatsLoading(false);
        return;
      }
      setStatsLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/dashboardStats`, {
          params: { userId },
        });
        if (!cancelled && res.data?.success) {
          setStats(res.data.data);
        }
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    const fetchRecentUploads = async () => {
      if (!userId) {
        setRecentLoading(false);
        return;
      }
      setRecentLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/imageListing`, {
          params: { userId },
        });
        if (!cancelled) {
          setRecentUploads(res.data?.data ?? []);
        }
      } catch (err) {
        console.error("Failed to load recent uploads:", err);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    };

    fetchStats();
    fetchRecentUploads();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const baseMenuItems: Omit<MenuItem, "description" | "iconBg" | "iconColor">[] = [
    { title: "Take Picture /Video", icon: cameraOutline, route: "/uploadImages?source=camera" },
    { title: "Select Photo", icon: imagesOutline, route: "/uploadImages?source=gallery" },
    { title: "View", icon: listOutline, route: "/viewall" },
    { title: "Settings", icon: settingsOutline, route: "/settings" },
  ];

  // Only group accounts can see/add the "Add User" card
  const menuItems: MenuItem[] = (
    isGroupAccount
      ? [...baseMenuItems, { title: "Add User", icon: personAddOutline, route: "/saveuserdetails" }]
      : baseMenuItems
  ).map((item) => ({ ...item, ...MENU_META[item.title] }));

  const navigateTo = (route: string) => {
    const path = route.split("?")[0];
    if (path === location.pathname) return; // already here, nothing to do

    try {
      router.push(route, "forward");
    } catch (err) {
      console.error("navigateTo failed, falling back to window.location:", err);
      window.location.href = route;
    }
  };

  const logout = () => {
    localStorage.clear();
    router.push("/");
  };

  const fileTypeItems = stats
    ? [
      { label: "DICOM Files", count: stats.dcm_files, icon: documentOutline, bg: "#dbeafe", color: "#2563eb" },
      { label: "Videos", count: stats.mp4_files, icon: videocamOutline, bg: "#ede9fe", color: "#7c3aed" },
      { label: "Images", count: stats.image_files, icon: imagesOutline, bg: "#d1fae5", color: "#059669" },
      { label: "PDFs", count: stats.pdf_files, icon: documentTextOutline, bg: "#fee2e2", color: "#dc2626" },
    ]
    : [];

  return (
    <IonPage>
      <IonContent fullscreen scrollY className="dash-content">
        {/* Header */}
        <div className="dash-header">
          <div className="dash-header-row">


            <div className="dash-brand">
              <span className="dash-brand-icon">
                <IonIcon icon={pulseOutline} />
              </span>
              <div>
                <h1 className="dash-brand-title">eMedical Access</h1>
                <p className="dash-brand-subtitle">Secure. Compliant. Connected.</p>
              </div>
            </div>

            <div className="dash-header-actions">

              <button className="dash-icon-btn" aria-label="Notifications">
                <IonIcon icon={notificationsOutline} />
              </button>
              
              <button
                className="dash-icon-btn"
                aria-label="Account menu"
                onClick={openAccountMenu}
              >
                <IonIcon icon={personCircleOutline} />
              </button>
            </div>
          </div>
        </div>

        
        <IonPopover
          isOpen={showAccountMenu}
          event={accountMenuEvent}
          onDidDismiss={() => setShowAccountMenu(false)}
          dismissOnSelect
        >
          <IonList lines="none">
            <IonItem
              button
              detail={false}
              onClick={() => {
                setShowAccountMenu(false);
                navigateTo("/profile");
              }}
            >
              <IonIcon icon={personOutline} slot="start" />
              <IonLabel>Profile</IonLabel>
            </IonItem>
            <IonItem
              button
              detail={false}
              onClick={() => {
                setShowAccountMenu(false);
                logout();
              }}
            >
              <IonIcon icon={logOutOutline} slot="start" color="danger" />
              <IonLabel color="danger">Logout</IonLabel>
            </IonItem>
          </IonList>
        </IonPopover>

        <div className="dash-body">
          {/* Welcome */}
          <section className="dash-welcome">
            <p className="dash-welcome-eyebrow">Welcome back,</p>
            <h2 className="dash-welcome-name">{doctorName || "—"}</h2>
            <div className="dash-hipaa">
              <IonIcon icon={shieldCheckmarkOutline} />
              <span>HIPAA compliant</span>
              <span className="dash-dot">•</span>
              <span>Your data is secure</span>
            </div>
          </section>

          {(facilityName || department) && (
            <IonCard className="dash-facility-card">
              <IonCardContent className="dash-facility-content">
                <span className="dash-facility-icon">
                  <IonIcon icon={businessOutline} />
                </span>
                <div className="dash-facility-info">
                  <p className="dash-facility-label">Facility</p>
                  <p className="dash-facility-name">{facilityName || "—"}</p>
                  {department && <p className="dash-facility-dept">Department: {department}</p>}
                </div>
                <IonIcon icon={chevronDownOutline} className="dash-facility-chevron" />
              </IonCardContent>
            </IonCard>
          )}

          {/* Action grid */}
          <div className="dash-action-grid">
            {menuItems.map((item) => (
              <IonCard
                key={item.title}
                button
                className="dash-action-card"
                onClick={() => navigateTo(item.route)}
              >
                <IonCardContent className="dash-action-content">
                  <span className="dash-action-icon" style={{ background: item.iconBg, color: item.iconColor }}>
                    <IonIcon icon={item.icon} />
                  </span>
                  <h3 className="dash-action-title">{item.title}</h3>
                  <p className="dash-action-desc">{item.description}</p>
                  <span className="dash-action-arrow" style={{ background: item.iconBg, color: item.iconColor }}>
                    <IonIcon icon={arrowForwardOutline} />
                  </span>
                </IonCardContent>
              </IonCard>
            ))}
          </div>

          {/* File overview */}
          <IonCard className="dash-section-card">
            <IonCardContent>
              <div className="dash-section-header">
                <span className="dash-section-title">
                  <IonIcon icon={cloudUploadOutline} />
                  File Overview
                </span>
                <button className="dash-view-all" onClick={() => navigateTo("/viewall")}>
                  View All <IonIcon icon={chevronForwardOutline} />
                </button>
              </div>

              {statsLoading ? (
                <div className="dash-loading-row">
                  <IonSpinner name="dots" />
                </div>
              ) : stats ? (
                <div className="dash-status-grid">
                  {fileTypeItems.map((s) => (
                    <div className="dash-status-item" key={s.label}>
                      <span className="dash-status-icon" style={{ background: s.bg, color: s.color }}>
                        <IonIcon icon={s.icon} />
                      </span>
                      <div>
                        <p className="dash-status-count">{s.count}</p>
                        <p className="dash-status-label" style={{ color: s.color }}>
                          {s.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-empty-text">Could not load file overview.</p>
              )}
            </IonCardContent>
          </IonCard>

          {/* Recent uploads */}
          <IonCard className="dash-section-card">
            <IonCardContent>
              <div className="dash-section-header">
                <span className="dash-section-title">
                  <IonIcon icon={documentTextOutline} />
                  Recent Uploads
                </span>
                <button className="dash-view-all" onClick={() => navigateTo("/viewall")}>
                  View All <IonIcon icon={chevronForwardOutline} />
                </button>
              </div>

              {recentLoading ? (
                <div className="dash-loading-row">
                  <IonSpinner name="dots" />
                </div>
              ) : recentUploads.length === 0 ? (
                <p className="dash-empty-text">No uploads yet.</p>
              ) : (
                <div className="dash-recent-list">
                  {recentUploads.map((u) => (
                    <div
                      className="dash-recent-item"
                      key={u.patientID}
                      onClick={() => navigateTo("/viewall")}
                    >
                      <span className="dash-recent-thumb" style={{ background: "#e0f2fe", color: "#0369a1" }}>
                        <IonIcon icon={pulseOutline} />
                      </span>
                      <div className="dash-recent-info">
                        <p className="dash-recent-title">{u.patient}</p>
                        <p className="dash-recent-meta">Patient ID: {u.patientID}</p>
                      </div>
                      <IonIcon icon={chevronForwardOutline} className="dash-recent-chevron" />
                    </div>
                  ))}
                </div>
              )}
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>

      {/* Bottom tab bar */}
      <IonFooter className="dash-footer">
        <div className="dash-tabbar">
          <button className="dash-tab dash-tab-active" onClick={() => navigateTo("/dashboard")}>
            <IonIcon icon={homeOutline} />
            <span>Dashboard</span>
          </button>
          <button className="dash-tab" onClick={() => navigateTo("/patientlist")}>
            <IonIcon icon={peopleOutline} />
            <span>Patients</span>
          </button>
          <button className="dash-tab-capture" onClick={() => navigateTo("/uploadImages?source=camera")}>
            <IonIcon icon={cameraOutline} />
          </button>
          <button className="dash-tab" onClick={() => navigateTo("/viewall")}>
            <IonIcon icon={cloudUploadOutline} />
            <span>View</span>
          </button>
          <button className="dash-tab" onClick={() => navigateTo("/settings")}>
            <IonIcon icon={settingsOutline} />
            <span>Settings</span>
          </button>
        </div>
      </IonFooter>
    </IonPage>
  );
};

export default Dashboard;