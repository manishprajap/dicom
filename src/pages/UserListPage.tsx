import React, { useState } from "react";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonCardContent,
  IonIcon,
  IonToast,
  useIonViewWillEnter,
  IonSpinner,
  IonAlert,
} from "@ionic/react";

import "../css/patientlist.css";

import {
  eyeOutline,
  trashOutline,
  personOutline,
  callOutline,
  mailOutline,
} from "ionicons/icons";

import axios from "axios";
import AppFooter from "../components/AppFooter";

const API_BASE_URL =
  "https://aarnatechxperts.in/dicomapi/public/api";

const UserListPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastColor, setToastColor] =
    useState<"success" | "danger">("success");

  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteId, setDeleteId] =
    useState<number | string | null>(null);

  // =========================================================
  // Load users whenever page opens
  // =========================================================
  useIonViewWillEnter(() => {
    fetchUsers();
  });

  // =========================================================
  // GET GROUP USERS FROM LARAVEL API
  // =========================================================
  const fetchUsers = async () => {
    setLoading(true);

    try {
      // Login user ID
      const userId = localStorage.getItem("userId");

      console.log("Login User ID:", userId);

      if (!userId) {
        setUsers([]);

        setToastMessage("❌ Login user ID not found.");
        setToastColor("danger");
        setShowToast(true);

        return;
      }

      // API
      const response = await axios.get(
        `${API_BASE_URL}/group-users`,
        {
          params: {
            userId: userId,
          },
          headers: {
            Accept: "application/json",
          },
        }
      );

      console.log(
        "Group Users API Response:",
        response.data
      );

      if (response.data?.success) {
        setUsers(response.data.data || []);

        console.log(
          "Users:",
          response.data.data
        );
      } else {
        setUsers([]);

        setToastMessage(
          response.data?.message ||
            "No users found."
        );

        setToastColor("danger");
        setShowToast(true);
      }

    } catch (error: any) {
      console.error(
        "Group Users API Error:",
        error
      );

      console.error(
        "Response:",
        error?.response?.data
      );

      setUsers([]);

      setToastMessage(
        error?.response?.data?.message ||
          "❌ Failed to load users."
      );

      setToastColor("danger");
      setShowToast(true);

    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // VIEW / EXPAND USER
  // =========================================================
  const handleViewToggle = (
    id: number | string
  ) => {
    setExpanded(
      expanded === Number(id)
        ? null
        : Number(id)
    );
  };

  // =========================================================
  // DELETE CONFIRMATION
  // =========================================================
  const handleDelete = (
    id: number | string
  ) => {
    setDeleteId(id);
    setShowConfirm(true);
  };

  // =========================================================
  // DELETE
  // =========================================================
  const confirmDelete = async () => {
    if (deleteId === null) return;

    try {

      /*
       * Abhi database delete API connect nahi hai.
       *
       * Aapke api.php me:
       *
       * Route::post('userdelete', ...)
       *
       * already available hai.
       *
       * Agar userdelete API ka request format same hai,
       * to yahan usko call kar sakte hain.
       */

      console.log(
        "Delete User ID:",
        deleteId
      );

      setToastMessage(
        "Delete API not connected yet."
      );

      setToastColor("danger");
      setShowToast(true);

    } catch (error) {

      console.error(
        "Delete user error:",
        error
      );

      setToastMessage(
        "❌ Error deleting user."
      );

      setToastColor("danger");
      setShowToast(true);

    } finally {

      setShowConfirm(false);
      setDeleteId(null);

    }
  };

  return (
    <IonPage>

      {/* =====================================================
          HEADER
      ===================================================== */}
      <IonHeader>
        <IonToolbar className="custom-toolbar">

          <IonButtons slot="start">
            <IonBackButton
              defaultHref="/dashboard"
            />
          </IonButtons>

          <IonTitle>
            👥 User List
          </IonTitle>

        </IonToolbar>
      </IonHeader>


      {/* =====================================================
          CONTENT
      ===================================================== */}
      <IonContent className="dicom-bg">

        {loading ? (

          <div className="loader-box">
            <IonSpinner name="crescent" />
          </div>

        ) : users.length === 0 ? (

          <p className="empty-text">
            No Users Found
          </p>

        ) : (

          users.map((user) => (

            <IonCard
              key={user.id}
              className="sftp-card"
            >

              <IonCardContent
                className="card-content-wrap"
              >

                <div className="card-row">

                  {/* =================================================
                      USER INFORMATION
                  ================================================= */}
                  <div className="card-info">

                    {/* Name */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >

                      <IonIcon
                        icon={personOutline}
                      />

                      <strong>
                        {user.name || "N/A"}
                      </strong>

                    </div>


                    {/* Mobile */}
                    <div className="sub-info">

                      <IonIcon
                        icon={callOutline}
                      />

                      <strong>
                        Mobile:
                      </strong>{" "}

                      {user.mobile || "N/A"}

                    </div>


                    {/* Email */}
                    <div className="sub-info">

                      <IonIcon
                        icon={mailOutline}
                      />

                      <strong>
                        Email:
                      </strong>{" "}

                      {user.email || "N/A"}

                    </div>


                    {/* TYPE ONLY */}
                    <div className="sub-info">

                      <strong>
                        Type:
                      </strong>{" "}

                      {user.type || "N/A"}

                    </div>


                    {/* =================================================
                        EXPANDED INFORMATION
                    ================================================= */}
                    {expanded === user.id && (

                      <div className="extra-info">

                        <div>
                          <strong>
                            User ID:
                          </strong>{" "}
                          {user.id || "N/A"}
                        </div>

                        <div>
                          <strong>
                            Group ID:
                          </strong>{" "}
                          {user.group_id || "N/A"}
                        </div>

                        <div>
                          <strong>
                            Facility:
                          </strong>{" "}
                          {user.facility || "N/A"}
                        </div>

                        <div>
                          <strong>
                            Department:
                          </strong>{" "}
                          {user.department || "N/A"}
                        </div>

                        <div>
                          <strong>
                            Status:
                          </strong>{" "}
                          {user.status || "N/A"}
                        </div>

                      </div>

                    )}

                  </div>


                  {/* =================================================
                      ACTION ICONS
                  ================================================= */}
                  <div className="card-icons">

                    <IonIcon
                      icon={eyeOutline}
                      className="icon view"
                      onClick={() =>
                        handleViewToggle(
                          user.id
                        )
                      }
                    />

                    <IonIcon
                      icon={trashOutline}
                      className="icon delete"
                      onClick={() =>
                        handleDelete(
                          user.id
                        )
                      }
                    />

                  </div>

                </div>

              </IonCardContent>

            </IonCard>

          ))

        )}

      </IonContent>


      {/* =====================================================
          DELETE ALERT
      ===================================================== */}
      <IonAlert
        isOpen={showConfirm}
        onDidDismiss={() => {
          setShowConfirm(false);
          setDeleteId(null);
        }}
        header="Confirm Delete"
        message="Are you sure you want to delete this user?"
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


      {/* =====================================================
          TOAST
      ===================================================== */}
      <IonToast
        isOpen={showToast}
        message={toastMessage}
        duration={2500}
        color={toastColor}
        onDidDismiss={() =>
          setShowToast(false)
        }
      />


      {/* =====================================================
          FOOTER
      ===================================================== */}
      <AppFooter />

    </IonPage>
  );
};

export default UserListPage;