import React from "react";
import { IonFooter, IonIcon } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import {
  homeOutline,
  peopleOutline,
  cameraOutline,
  cloudUploadOutline,
  settingsOutline,
} from "ionicons/icons";
import "../css/Dashboard.css";

const AppFooter: React.FC = () => {
  const history = useHistory();
  const location = useLocation();

  const navigateTo = (route: string) => {
    history.push(route);
  };

  const isActive = (route: string) => {
    return location.pathname === route;
  };

  return (
    <IonFooter className="dash-footer">
      <div className="dash-tabbar">

        <button
          className={`dash-tab ${isActive("/dashboard") ? "dash-tab-active" : ""}`}
          onClick={() => navigateTo("/dashboard")}
        >
          <IonIcon icon={homeOutline} />
          <span>Dashboard</span>
        </button>

        <button
          className={`dash-tab ${isActive("/patientlist") ? "dash-tab-active" : ""}`}
          onClick={() => navigateTo("/patientlist")}
        >
          <IonIcon icon={peopleOutline} />
          <span>Patients</span>
        </button>

        <button
          className="dash-tab-capture"
          onClick={() => navigateTo("/uploadImages?source=camera")}
        >
          <IonIcon icon={cameraOutline} />
        </button>

        <button
          className={`dash-tab ${isActive("/viewall") ? "dash-tab-active" : ""}`}
          onClick={() => navigateTo("/viewall")}
        >
          <IonIcon icon={cloudUploadOutline} />
          <span>View</span>
        </button>

        <button
          className={`dash-tab ${isActive("/settings") ? "dash-tab-active" : ""}`}
          onClick={() => navigateTo("/settings")}
        >
          <IonIcon icon={settingsOutline} />
          <span>Settings</span>
        </button>

      </div>
    </IonFooter>
  );
};

export default AppFooter;