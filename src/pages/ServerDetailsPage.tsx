import React, { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonIcon,
} from '@ionic/react';
import { eye, eyeOff, globeOutline, keyOutline, lockClosedOutline, personOutline, serverOutline, settingsOutline, timeOutline } from 'ionicons/icons';
import "../css/server-details.css";
import { useLocation, useHistory } from 'react-router-dom';
import AppFooter from '../components/AppFooter';

const ServerDetailsPage: React.FC = () => {
  const location = useLocation<{ server: any }>();
  const history = useHistory();
  const server = location.state?.server;

  const [showPassword, setShowPassword] = useState(false);

  if (!server) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar className='custom-toolbar'>
            <IonTitle className="text-white text-center">Error</IonTitle>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding">
          <div className="no-data">
            <h2>No server data available</h2>
            <button className="back-btn" onClick={() => history.goBack()}>
              Go Back
            </button>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const InfoRow = ({ icon, label, value }: any) => (
    <div className="server-detail-row">
      <span className="server-detail-icon"><IonIcon icon={icon} /></span>
      <div className="server-detail-copy">
      <span className="info-label">{label}</span>
      <span className="info-value">{value || '-'}</span>
      </div>
    </div>
  );

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/serverdetailslist" color="light" />
          </IonButtons>
          <IonTitle className="text-white text-center">
            {server.hostname || 'Server Details'}
          </IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding dicom-bg">
        <section className="server-details-list" aria-label="Server information">
          <InfoRow icon={serverOutline} label="Hostname" value={server.hostname} />
          <InfoRow icon={globeOutline} label="IP Address" value={server.ips} />
          <InfoRow icon={settingsOutline} label="Port" value={server.port} />
          <InfoRow icon={keyOutline} label="AE Title" value={server.callingAETitle || server.calledAETitle} />
          <InfoRow icon={personOutline} label="Username" value={server.username} />
          <div className="server-detail-row">
            <span className="server-detail-icon"><IonIcon icon={lockClosedOutline} /></span>
            <div className="server-detail-copy">
              <span className="info-label">Password</span>
              <div className="password-wrapper">
                <span className="info-value">{showPassword ? server.password : "••••••••"}</span>
                <IonIcon icon={showPassword ? eyeOff : eye} className="password-icon" onClick={() => setShowPassword(!showPassword)} />
              </div>
            </div>
          </div>
          <InfoRow icon={timeOutline} label="Connection Timeout" value={server.connectionTimeout} />
          <InfoRow icon={timeOutline} label="Response Timeout" value={server.responseTimeout} />
          <InfoRow icon={settingsOutline} label="Preferred Charset" value={server.preferredCharset} />
          <InfoRow icon={settingsOutline} label="TLS Support" value={server.tlsSupport ? "Enabled" : "Disabled"} />
          <InfoRow icon={serverOutline} label="Description" value={server.description} />
        </section>
      </IonContent>
      <AppFooter/>
    </IonPage>
  );
};

export default ServerDetailsPage;
