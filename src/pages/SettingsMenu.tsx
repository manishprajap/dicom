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
  IonButtons,
  IonBackButton,
  useIonRouter,
  IonFooter,
} from "@ionic/react";
import "../css/Dashboard.css";

import {
  serverOutline,
  cloudUpload,
  shareSocialOutline,
  settingsOutline,
  cloudUploadOutline,
  cameraOutline,
  peopleOutline,
  homeOutline,
} from "ionicons/icons";

import { FaAws } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import AppFooter from "../components/AppFooter";

const SettingsMenu: React.FC = () => {
  const router = useIonRouter();

  const LEFT_CARD_COLOR = "#8cdcc8";
  const RIGHT_CARD_COLOR = "#00a0a0";

  const menuItems = [
    { title: "Dicom Server Setup", icon: serverOutline, isIonIcon: true, route: "/saveserverdetails" },
    { title: "Add SFTP", icon: cloudUpload, isIonIcon: true, route: "/sftp" },
    { title: "Add AWS S3", component: FaAws, isIonIcon: false, route: "/awsconfig" },
    { title: "SBM Network Add", icon: shareSocialOutline, isIonIcon: true, route: "/addsbm" },
    { title: "Google Cloud", component: FcGoogle, isIonIcon: false, route: "/googleCloud" },
  ];

  const navigateTo = (route: string) => {
    router.push(route, "forward");
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" />
          </IonButtons>
          <IonTitle className="text-center font-semibold">Settings</IonTitle>
        </IonToolbar>
      </IonHeader>

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
                      className={`dashboard-card-content ${
                        cardColor === LEFT_CARD_COLOR ? "gray-content" : ""
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
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default SettingsMenu;