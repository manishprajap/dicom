import React, { useMemo, useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonIcon,
  IonToast,
  useIonViewWillEnter,
  IonSpinner,
  IonAlert,
  IonSearchbar,
} from "@ionic/react";
import "../css/patientlist.css";
import { eyeOutline, trashOutline, add } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import AppFooter from "../components/AppFooter";

const PATIENTS_STORAGE_KEY = "patients";

// Route of the "Add Patient" form page (AddPatient.tsx)
const ADD_PATIENT_ROUTE = "/addpatient";

// yyyy-mm-dd  ->  dd/mm/yyyy
const formatDob = (value?: string): string => {
  if (!value) return "N/A";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

const PatientListPage: React.FC = () => {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastColor, setToastColor] = useState<"success" | "danger">("success");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const history = useHistory();

  // Runs every time this page is opened (also when coming back from Add Patient)
  useIonViewWillEnter(() => {
    fetchPatients();
  });

  // ===== Load Patients from localStorage =====
const fetchPatients = () => {
  setLoading(true);
  try {
    const userId = localStorage.getItem("userId");
    const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
    const allPatients = raw ? JSON.parse(raw) : [];

    const patientList = userId
      ? allPatients.filter(
          (p: any) =>
            p.user_id == null || String(p.user_id) === String(userId)
        )
      : allPatients;

    // 👉 Alphabetical sorting by name
    const sortedPatients = patientList.sort((a: any, b: any) =>
      a.name.localeCompare(b.name)
    );

    setPatients(sortedPatients);

  } catch (error: any) {
    console.error("Error loading patients from localStorage:", error);
    setPatients([]);
    setToastMessage("❌ Failed to load patients list.");
    setToastColor("danger");
    setShowToast(true);
  } finally {
    setLoading(false);
  }
};

  // ===== Search by patient name or patient ID =====
  const filteredPatients = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return patients;

    return patients.filter((p) => {
      const name = String(p.name ?? "").toLowerCase();
      const id = String(p.id ?? "").toLowerCase();
      const patientId = String(p.patient_id ?? "").toLowerCase();
      return name.includes(q) || id.includes(q) || patientId.includes(q);
    });
  }, [patients, searchText]);

  const handleViewToggle = (id: number) => {
    setExpanded(expanded === id ? null : id);
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
    setShowConfirm(true);
  };

  // ===== Delete Patient from localStorage =====
  const confirmDelete = () => {
    if (deleteId === null) return;

    try {
      const raw = localStorage.getItem(PATIENTS_STORAGE_KEY);
      const allPatients = raw ? JSON.parse(raw) : [];

      const updatedAll = allPatients.filter((p: any) => p.id !== deleteId);
      localStorage.setItem(PATIENTS_STORAGE_KEY, JSON.stringify(updatedAll));

      // Update local state too
      setPatients((prevPatients) =>
        prevPatients.filter((p) => p.id !== deleteId)
      );

      setToastMessage("✅ Patient deleted successfully");
      setToastColor("success");
    } catch (error: any) {
      console.error("Local Storage delete error:", error);
      setToastMessage("❌ Error deleting patient");
      setToastColor("danger");
    } finally {
      setShowToast(true);
      setShowConfirm(false);
      setDeleteId(null);
    }
  };

  const handleViewReports = (patientId: number | string, patientName: string) => {
    history.push("/view-reports", {
      patientId,
      patientName,
    });
    console.log("patient data:", patientId, patientName);
  };

  return (
    <IonPage>
      {/* ===== Header with Add Button ===== */}
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" />
          </IonButtons>

          <IonTitle>👨‍⚕️ Patient List</IonTitle>

          <IonButtons slot="end">
            <IonButton
              fill="solid"
              aria-label="Add Patient"
              onClick={() => history.push(ADD_PATIENT_ROUTE)}
              style={
                {
                  "--background": "#ffffff",
                  "--background-activated": "#e2e8f0",
                  "--color": "#0f766e",
                  "--border-radius": "20px",
                  "--padding-start": "12px",
                  "--padding-end": "16px",
                  "--box-shadow": "0 2px 8px rgba(0,0,0,.18)",
                  fontWeight: 700,
                  marginRight: 8,
                } as React.CSSProperties
              }
            >
              <IonIcon slot="start" icon={add} />
              Add
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      {/* ===== Content ===== */}
      <IonContent className="dicom-bg">
        {/* ===== Search (outside header) ===== */}
        <div style={{ padding: "12px 12px 0" }}>
          <IonSearchbar
            value={searchText}
            debounce={150}
            placeholder="Search by name or patient ID"
            onIonInput={(e) => setSearchText(String(e.detail.value ?? ""))}
            onIonClear={() => setSearchText("")}
            style={
              {
                "--background": "#ffffff",
                "--border-radius": "12px",
                "--box-shadow": "0 2px 8px rgba(0,0,0,.10)",
                padding: 0,
              } as React.CSSProperties
            }
          />
        </div>

        {loading ? (
          <div className="loader-box">
            <IonSpinner name="crescent" />
          </div>
        ) : patients.length === 0 ? (
          <p className="empty-text">No Patients Found</p>
        ) : filteredPatients.length === 0 ? (
          <p className="empty-text">No patients match "{searchText.trim()}"</p>
        ) : (
          filteredPatients.map((patient) => (
            <IonCard key={patient.id} className="sftp-card">
              {/* card-content-wrap = outer container (no flex here) */}
              <IonCardContent className="card-content-wrap">
                {/* Top row: patient info + eye/delete icons */}
                <div className="card-row">
                  <div className="card-info">
                    <strong>{patient.name}</strong>

                    <div className="sub-info">
                      <strong>Patient ID:</strong>{" "}
                      {patient.patient_id ?? patient.id} <br />
                      <strong>Mobile:</strong> {patient.mobile || "N/A"} <br />
                      <strong>Email:</strong> {patient.email || "N/A"}
                    </div>

                    <div className="sub-info">
                      <strong>Gender:</strong> {patient.gender} |{" "}
                      <strong>DOB:</strong> {formatDob(patient.date_of_birth)}
                    </div>

                    {expanded === patient.id && (
                      <div className="extra-info">
                        <div>
                          <strong>Age:</strong> {patient.age}
                        </div>
                        <div>
                          <strong>Address:</strong> {patient.address || "N/A"}
                        </div>
                        <div>
                          <strong>City:</strong> {patient.city || "N/A"}
                        </div>
                        <div>
                          <strong>State:</strong> {patient.state || "N/A"}
                        </div>
                        <div>
                          <strong>Country:</strong> {patient.country || "N/A"}
                        </div>
                        <div>
                          <strong>Blood Group:</strong>{" "}
                          {patient.blood_group || "N/A"}
                        </div>
                        <div>
                          <strong>Diagnosis:</strong>{" "}
                          {patient.diagnosis_details || "N/A"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="card-icons">
                    <IonIcon
                      icon={eyeOutline}
                      className="icon view"
                      onClick={() => handleViewToggle(patient.id)}
                    />
                    <IonIcon
                      icon={trashOutline}
                      className="icon delete"
                      onClick={() => handleDelete(patient.id)}
                    />
                  </div>
                </div>

                {/* View Reports button — icons ke NEECHE, full width */}
                {/* <IonButton
                  expand="block"
                  className="view-reports"
                  onClick={() => handleViewReports(patient.id, patient.name)}
                >
                  View Reports
                </IonButton> */}
              </IonCardContent>
            </IonCard>
          ))
        )}
      </IonContent>

      {/* ===== Delete Confirmation ===== */}
      <IonAlert
        isOpen={showConfirm}
        onDidDismiss={() => setShowConfirm(false)}
        header="Confirm Delete"
        message="Are you sure you want to delete this patient?"
        buttons={[
          {
            text: "Cancel",
            role: "cancel",
            handler: () => {
              setShowConfirm(false);
              setDeleteId(null);
            },
          },
          {
            text: "Yes",
            handler: confirmDelete,
          },
        ]}
      />

      {/* ===== Toast ===== */}
      <IonToast
        isOpen={showToast}
        message={toastMessage}
        duration={2500}
        color={toastColor}
        onDidDismiss={() => setShowToast(false)}
      />
      <AppFooter />
    </IonPage>
  );
};

export default PatientListPage;