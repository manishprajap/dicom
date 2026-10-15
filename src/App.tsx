import React, { useEffect, useState } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonSpinner, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';

// Auth Guard
import ProtectedRoute from './ProtectedRoute';

// Public Pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import OtpVerify from './pages/Otpverify';

// Dashboards
import Dashboard from './pages/Dashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import HospitalAdminDashboard from './pages/HospitalAdminDashboard';
import HospitalUserDashboard from './pages/HospitalUserDashboard';
import DoctorDashboard from './pages/DoctorDashboard';

// Super Admin Pages
import ManageHospitals from './pages/super-admin/ManageHospitals';
import ManageUsers from './pages/super-admin/ManageUsers';
import ViewReports from './pages/super-admin/ViewReports';
import SystemSettings from './pages/super-admin/SystemSettings';

// General Pages
import SaveServerDetails from './pages/SaveServerDetails';
import ServerDetailsList from './pages/ServerDetailsList';
import ImageListPage from './pages/ImageListPage';
import ServerDetailsPage from './pages/ServerDetailsPage';
import PatientListPage from './pages/patientList';
import PatientRegistration from './pages/Addpatient';
import SFTPListPage from './pages/SFTPList';
import AddSFTPDetails from './pages/saveFTPDetails';
import AwsConfig from './pages/saveAWS';
import AwsS3List from './pages/awsList';
import S3FileUpload from './pages/awscloud';
import GoogleDrivePage from './pages/GoogleDrivePage';
import AddSBMNetwork from './pages/addSBMNetwork';
import SbmList from './pages/sbmList';
import SbmUploads from './pages/sbmUploads';
import SmbImages from './pages/SmbImages';
import SFTPFileBrowser from './pages/Sftpfilebrowser';
import SFTPDetails from './pages/SFTPDetails';
import SFTPEditPage from './pages/SFTPEditPage';
import EditSBMNetwork from './pages/EditSBMNetwork';
import AwsConfigEdit from './pages/AwsConfigEdit';
import PatientReport from './pages/PatientReport';
import AWSUpload from './pages/Awsupload';
import AWSList from './pages/awscloud';
import ViewAll from './pages/ViewAll';
import SettingsMenu from './pages/SettingsMenu';
import UploadImages from './pages/UploadImages';
import Uploadfiles from './pages/Uploadfiles';
import SaveUserDetails from './pages/SaveUserDetails';

// Ionic CSS
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import './theme/variables.css';
import Profile from './pages/Profile';
import UserListPage from './pages/UserListPage';
import Studies from './pages/Studies';

setupIonicReact();

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [hasUser, setHasUser] = useState<boolean>(false);

  useEffect(() => {
    // Check local storage on initial app mount
    const userId = localStorage.getItem('userId');
    setHasUser(Boolean(userId));
    setIsInitializing(false);
  }, []);

  // Show quick loader while app initializes session state
  if (isInitializing) {
    return (
      <IonApp>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <IonSpinner name="crescent" />
        </div>
      </IonApp>
    );
  }

  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Switch>
            {/* Public Routes */}
            <Route exact path="/login" component={Login} />
            <Route exact path="/signup" component={Signup} />
            <Route exact path="/verify-otp" component={OtpVerify} />

            {/* Root Route Handle */}
            <Route
              exact
              path="/"
              render={() => (hasUser ? <Redirect to="/dashboard" /> : <Redirect to="/login" />)}
            />

            {/* Protected Routes */}
            <ProtectedRoute exact path="/studies" component={Studies} />
            <ProtectedRoute exact path="/dashboard" component={Dashboard} />
            <ProtectedRoute exact path="/viewall" component={ViewAll} />
            <ProtectedRoute exact path="/settings" component={SettingsMenu} />
            <ProtectedRoute exact path="/uploadImages" component={UploadImages} />
            <ProtectedRoute exact path="/saveserverdetails" component={SaveServerDetails} />
            <ProtectedRoute exact path="/serverdetailslist" component={ServerDetailsList} />
            <ProtectedRoute exact path="/image-list" component={ImageListPage} />
            <ProtectedRoute exact path="/server-details" component={ServerDetailsPage} />
            <ProtectedRoute exact path="/uploadfiles" component={Uploadfiles} />
            <ProtectedRoute exact path="/saveuserdetails" component={SaveUserDetails} />
            <ProtectedRoute exact path="/patientlist" component={PatientListPage} />
            <ProtectedRoute exact path="/userlist" component={UserListPage} />
            <ProtectedRoute exact path="/addpatient" component={PatientRegistration} />
            <ProtectedRoute exact path="/sftpView" component={SFTPListPage} /> 
            <ProtectedRoute exact path="/sftpDetails/:id" component={SFTPDetails} />
            <ProtectedRoute exact path="/sftpEdit/:id" component={SFTPEditPage} />
            <ProtectedRoute exact path="/sftp" component={AddSFTPDetails} />
            <ProtectedRoute exact path="/sftpBrowse" component={SFTPFileBrowser} />
            <ProtectedRoute exact path="/view-reports" component={PatientReport} />
            <ProtectedRoute exact path="/profile" component={Profile} />

            <ProtectedRoute exact path="/awsConfiglist" component={AwsS3List} />
            <ProtectedRoute exact path="/awsconfig" component={AwsConfig} />
            <ProtectedRoute exact path="/awscloud" component={S3FileUpload} />
            <ProtectedRoute exact path="/awsEdit/:id" component={AwsConfigEdit} />
            <ProtectedRoute exact path="/googleCloud" component={GoogleDrivePage} />
            <ProtectedRoute exact path="/addsbm" component={AddSBMNetwork} />
            <ProtectedRoute exact path="/editsbm/:id" component={EditSBMNetwork} />
            <ProtectedRoute exact path="/sbm" component={SbmList} />

            {/* Other Unprotected Pages */}
            <Route exact path="/awsupload" component={AWSUpload} />
            <Route exact path="/awsfiles" component={AWSList} />
            <Route exact path="/smbImages" component={SmbImages} />
            <Route exact path="/sbmUploads" component={SbmUploads} />
            <Route exact path="/super-admin-dashboard" component={SuperAdminDashboard} />
            <Route exact path="/hospital-admin-dashboard" component={HospitalAdminDashboard} />
            <Route exact path="/hospital-user-dashboard" component={HospitalUserDashboard} />
            <Route exact path="/doctor-dashboard" component={DoctorDashboard} />

            <Route exact path="/super-admin/hospitals" component={ManageHospitals} />
            <Route exact path="/super-admin/users" component={ManageUsers} />
            <Route exact path="/super-admin/reports" component={ViewReports} />
            <Route exact path="/super-admin/settings" component={SystemSettings} />

            {/* Catch-all Fallback */}
            <Redirect to={hasUser ? "/studies" : "/login"} />
          </Switch>
        </IonRouterOutlet>
        
      </IonReactRouter>
    </IonApp>
  );
};

export default App;