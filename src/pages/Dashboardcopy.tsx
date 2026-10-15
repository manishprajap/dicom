import React from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonIcon,
  IonCard,
  IonCardContent,
  useIonRouter,
  IonButtons,
} from "@ionic/react";
import "../css/Dashboard.css";

import {
  cloudUpload,
  serverOutline,
  imageOutline,
  personOutline,
  shareSocialOutline,
} from "ionicons/icons";

import { AiOutlineLogout } from "react-icons/ai";
import { FcGoogle } from "react-icons/fc";
import { FaAws } from "react-icons/fa";

const Dashboard: React.FC = () => {
  const router = useIonRouter();

  const LEFT_CARD_COLOR = "#8cdcc8";
  const RIGHT_CARD_COLOR = "#00a0a0";

  const menuItems = [
    { title: "Dicom Server Setup", icon: serverOutline, isIonIcon: true, route: "/saveserverdetails" },
    { title: "Dicom Servers", icon: imageOutline, isIonIcon: true, route: "/serverdetailslist" },
    { title: "FTP Setup", icon: cloudUpload, isIonIcon: true, route: "/sftpView" },
    { title: "AWS Cloud", component: FaAws, isIonIcon: false, route: "/awsConfiglist" },
    { title: "Patient", icon: personOutline, isIonIcon: true, route: "/patientlist" },
    { title: "SBM Network", icon: shareSocialOutline, isIonIcon: true, route: "/sbm" },
    { title: "Google Cloud", component: FcGoogle, isIonIcon: false, route: "/googleCloud" },
  ];

  const navigateTo = (route: string) => {
    router.push(route, "forward");
  };

  const Logout = () => {
    localStorage.clear();
    router.push("/");
  };

  return (
    <IonPage>
      {/* Header */}
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start" />
          <IonTitle className="text-center font-semibold">Dashboard</IonTitle>
        </IonToolbar>
      </IonHeader>

      {/* Content */}
      <IonContent className="ion-padding dicom-bg">
        <IonGrid>
          <IonRow>
            {menuItems.map((item, index) => {
              const row = Math.floor(index / 2);
              const isLeftColumn = index % 2 === 0;

              const cardColor =
                row % 2 === 0
                  ? isLeftColumn
                    ? LEFT_CARD_COLOR
                    : RIGHT_CARD_COLOR
                  : isLeftColumn
                    ? RIGHT_CARD_COLOR
                    : LEFT_CARD_COLOR;

              return (
                <IonCol size="6" key={index} className="px-1 pb-1">
                  <IonCard
                    button
                    onClick={() => navigateTo(item.route)}
                    className="dashboard-card full-color-card"
                    style={{ "--card-color": cardColor } as React.CSSProperties}
                  >
                    <IonCardContent
                      className={`dashboard-card-content ${cardColor === LEFT_CARD_COLOR ? "gray-content" : ""
                        }`}
                    >
                      {item.isIonIcon && item.icon ? (
                        <IonIcon icon={item.icon} className="dashboard-icon" />
                      ) : item.component ? (
                        <item.component size={36} className="dashboard-icon" />
                      ) : null}

                      <h3 className="dashboard-title">{item.title}</h3>
                    </IonCardContent>


                  </IonCard>
                </IonCol>
              );
            })}
          </IonRow>
        </IonGrid>

        {/* Logout */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            onClick={Logout}
            style={{
              backgroundColor: "#ff4d4f",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 22px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            <AiOutlineLogout style={{ transform: "rotate(270deg)" }} />
            Logout
          </button>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Dashboard;
