import React, { useMemo } from "react";
import {
  IonPage,
  IonContent,
  IonIcon,
  IonCard,
  IonCardContent,
  useIonRouter,
  IonFooter,
} from "@ionic/react";
import "../css/Dashboard.css";

import {
  serverOutline,
  cloudUploadOutline,
  medkitOutline,
  gitNetworkOutline,
  peopleOutline,
  arrowBackOutline,
  listOutline,
  arrowForwardOutline,
  settingsOutline,
  cameraOutline,
  homeOutline,
} from "ionicons/icons";

import { FaAws } from "react-icons/fa";

interface MenuItem {
  title: string;
  route: string;
  description: string;
  iconBg: string;
  iconColor: string;
  icon?: string;
  component?: React.ComponentType<{ size?: number; color?: string }>;
}

const menuItems: MenuItem[] = [
  {
    title: "Dicoms List",
    icon: serverOutline,
    route: "/serverdetailslist",
    description: "Browse DICOM servers and uploads",
    iconBg: "#d1fae5",
    iconColor: "#059669",
  },
  {
    title: "FTPs List",
    icon: cloudUploadOutline,
    route: "/sftpView",
    description: "Browse files on your SFTP servers",
    iconBg: "#dbeafe",
    iconColor: "#2563eb",
  },
  {
    title: "AWS S3 List",
    component: FaAws,
    route: "/awsConfiglist",
    description: "Browse files in your S3 buckets",
    iconBg: "#ffedd5",
    iconColor: "#ea580c",
  },
  {
    title: "Patient List",
    icon: medkitOutline,
    route: "/patientlist",
    description: "View and manage patient records",
    iconBg: "#ede9fe",
    iconColor: "#7c3aed",
  },
  {
    title: "SBM List",
    icon: gitNetworkOutline,
    route: "/sbm",
    description: "Browse files on your SMB shares",
    iconBg: "#fce7f3",
    iconColor: "#db2777",
  },
  {
    title: "User List",
    icon: peopleOutline,
    route: "/userlist", // ⚠️ confirm this route matches your router config
    description: "Manage team members and access",
    iconBg: "#fef3c7",
    iconColor: "#d97706",
  },
];

const ViewAll: React.FC = () => {
  const router = useIonRouter();

  const userData = useMemo(() => {
    try {
      const raw = localStorage.getItem("uData");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, []);

  const accountType = (userData?.types ?? "").toString().toLowerCase();
  const isGroupAccount = accountType === "group";

  // ✅ FILTER MENU BASED ON ACCOUNT TYPE
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (item.title === "User List") {
        return isGroupAccount; // only show for group users
      }
      return true;
    });
  }, [isGroupAccount]);

  const navigateTo = (route: string) => {
    router.push(route, "forward");
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY className="dash-content">
        <div className="dash-header">
          <div className="dash-header-row">
            <div className="dash-brand">
              <button
                className="dash-icon-btn"
                aria-label="Back"
                onClick={() => router.push("/dashboard", "back")}
                style={{ marginRight: 10 }}
              >
                <IonIcon icon={arrowBackOutline} />
              </button>
              <span className="dash-brand-icon">
                <IonIcon icon={listOutline} />
              </span>
              <div>
                <h1 className="dash-brand-title">View All</h1>
                <p className="dash-brand-subtitle">Servers, patients & uploads</p>
              </div>
            </div>
          </div>
        </div>

        <div className="dash-body">
          <div className="dash-action-grid">
            {filteredMenuItems.map((item) => (
              <IonCard
                key={item.title}
                button
                className="dash-action-card"
                onClick={() => navigateTo(item.route)}
              >
                <IonCardContent className="dash-action-content">
                  <span
                    className="dash-action-icon"
                    style={{ background: item.iconBg, color: item.iconColor }}
                  >
                    {item.icon ? (
                      <IonIcon icon={item.icon} />
                    ) : item.component ? (
                      <item.component size={20} color={item.iconColor} />
                    ) : null}
                  </span>
                  <h3 className="dash-action-title">{item.title}</h3>
                  <p className="dash-action-desc">{item.description}</p>
                  <span
                    className="dash-action-arrow"
                    style={{ background: item.iconBg, color: item.iconColor }}
                  >
                    <IonIcon icon={arrowForwardOutline} />
                  </span>
                </IonCardContent>
              </IonCard>
            ))}
          </div>
        </div>
      </IonContent>
      <IonFooter className="dash-footer">
          <div className="dash-tabbar">
            <button
              className="dash-tab"
              onClick={() => router.push("/dashboard", "back")}
            >
              <IonIcon icon={homeOutline} />
              <span>Dashboard</span>
            </button>

            <button
              className="dash-tab"
              onClick={() => router.push("/patientlist", "forward")}
            >
              <IonIcon icon={peopleOutline} />
              <span>Patients</span>
            </button>

            <button
              className="dash-tab-capture"
              onClick={() => router.push("/uploadImages?source=camera", "forward")}
            >
              <IonIcon icon={cameraOutline} />
            </button>

            <button
              className="dash-tab dash-tab-active"
              onClick={() => router.push("/viewall", "forward")}
            >
              <IonIcon icon={cloudUploadOutline} />
              <span>View</span>
            </button>

            <button
              className="dash-tab"
              onClick={() => router.push("/settings", "forward")}
            >
              <IonIcon icon={settingsOutline} />
              <span>Settings</span>
            </button>
          </div>
        </IonFooter>
    </IonPage>
  );
};

export default ViewAll;