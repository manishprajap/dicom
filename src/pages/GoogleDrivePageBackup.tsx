import React, { useState, useEffect } from "react";
import {
  IonContent,
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonLoading,
  IonGrid,
  IonRow,
  IonCol,
} from "@ionic/react";
import { FcGoogle } from "react-icons/fc";
import { AiOutlineGooglePlus } from "react-icons/ai";
import { useHistory } from "react-router-dom";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import "../css/GoogleDrivePage.css";

const GoogleDrivePage: React.FC = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const history = useHistory();

  // ✅ Initialize GoogleAuth correctly for Android/iOS
  useEffect(() => {
    if (typeof window !== "undefined") {
      GoogleAuth.initialize({
        scopes: [
          "profile",
          "email",
          "https://www.googleapis.com/auth/drive.file"
        ],
        clientId: "75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com",
      });
    }
  }, []);

  // ✅ Pick file
  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,application/pdf,application/dicom,video/*";
    input.onchange = (e: any) => {
      const selectedFile = e.target.files[0];
      if (selectedFile) setFile(selectedFile);
    };
    input.click();
  };

  // ✅ Upload to Google Drive
  const uploadToDrive = async () => {
    if (!file) return alert("Please select a file first.");
    const accessToken = googleUser?.authentication?.accessToken;
    if (!accessToken) return alert("Please sign in first.");

    setLoading(true);
    try {
      // Step 1: Get resumable upload URL
      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": file.type,
            "X-Upload-Content-Length": file.size.toString(),
          },
          body: JSON.stringify({ name: file.name, mimeType: file.type }),
        }
      );

      const uploadUrl = initRes.headers.get("Location");
      if (!uploadUrl) throw new Error("Failed to get upload URL");

      // Step 2: Upload file content
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      const uploadedFile = await uploadRes.json();

      // Step 3: Make it public
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        }
      );

      // Step 4: Fetch file info
      const infoRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}?fields=id,name,mimeType,thumbnailLink,webContentLink,createdTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const info = await infoRes.json();

      const formatted = {
        id: info.id,
        name: info.name,
        url: `https://drive.google.com/file/d/${info.id}/view`,
        thumbnailLink: info.thumbnailLink,
        uploadTime: new Date(info.createdTime).toLocaleString(),
        downloadLink: info.webContentLink,
        mimeType: info.mimeType,
      };

      setDriveFiles((prev) => [formatted, ...prev]);
      alert("✅ File uploaded successfully!");
      setFile(null);
    } catch (err: any) {
      alert("⚠️ Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Google Sign-In (native flow)
  const signInToGoogle = async () => {
    setLoading(true);
    try {
      const user = await GoogleAuth.signIn();
      if (!user || !user.authentication?.accessToken)
        throw new Error("Sign-in failed: No access token");

      setGoogleUser(user);
      setIsSignedIn(true);
      localStorage.setItem("google_User", JSON.stringify(user));

      const token = user.authentication.accessToken;
      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (err: any) {
      console.error("❌ Google Sign-In Error:", err);
      alert(err.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Auto login if saved
  useEffect(() => {
    const saved = localStorage.getItem("google_User");
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setGoogleUser(user);
        setIsSignedIn(true);
      } catch {
        localStorage.removeItem("google_User");
      }
    }
  }, []);

  // ✅ Logout
  const logoutFromGoogle = async () => {
    try {
      await GoogleAuth.signOut();
      localStorage.removeItem("google_User");
      setIsSignedIn(false);
      setGoogleUser(null);
      setDriveFiles([]);
    } catch {
      alert("Logout failed");
    }
  };

  // ✅ File click handler
  const handleFileClick = (file: any) => {
    const isDicom =
      file.mimeType === "application/dicom" || file.name.endsWith(".dcm");
    if (isDicom) {
      const token = googleUser?.authentication?.accessToken;
      const dicomUrl = `https://aarnatechxperts.in/dicomapi/public/api/files/${file.id}.dcm?access_token=${token}`;
      history.push({ pathname: "/checkk", state: { dicomUrl } });
    } else {
      window.open(`https://drive.google.com/file/d/${file.id}/view`, "_blank");
    }
  };

  // ✅ Delete file
  const deleteFileFromDrive = async (id: string) => {
    if (!window.confirm("Delete this file?")) return;
    const token = googleUser?.authentication?.accessToken;
    if (!token) return alert("Session expired");
    await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setDriveFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="custom-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard" className="text-white" />
          </IonButtons>
          <IonTitle className="page-title">Sign in with Google</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="dicom-bg">
        <div className="container">
          <IonLoading
            isOpen={loading}
            message={"Please wait..."}
            spinner="circles"
          />

          {!isSignedIn ? (
            <div className="center-box">
              <button className="google-btn" onClick={signInToGoogle}>
                <FcGoogle className="google-icon" />
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="signedin-header">
              <button className="logout-btn" onClick={logoutFromGoogle}>
                <FcGoogle /> Logout
              </button>
              <button className="select-btn" onClick={pickFile}>
                Select File
              </button>
            </div>
          )}

          {file && (
            <div className="upload-section">
              {file.type === "application/pdf" ? (
                <img
                  src="https://cdn-icons-png.flaticon.com/512/337/337946.png"
                  alt="PDF"
                  className="preview"
                />
              ) : (
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="preview"
                />
              )}
              <button className="upload-btn" onClick={uploadToDrive}>
                <AiOutlineGooglePlus /> Upload
              </button>
            </div>
          )}

          <IonGrid className="file-grid">
            {driveFiles.map((file) => (
              <IonRow key={file.id} className="file-row">
                <IonCol className="file-col">
                  <div className="file-card">
                    <img
                      src={
                        file.thumbnailLink ||
                        "https://placehold.co/130x130?text=No+Preview"
                      }
                      alt={file.name}
                      className="thumb"
                      onClick={() => handleFileClick(file)}
                    />
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-actions">
                        <button onClick={() => handleFileClick(file)}>
                          View
                        </button>
                        <button onClick={() => deleteFileFromDrive(file.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </IonCol>
              </IonRow>
            ))}
          </IonGrid>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default GoogleDrivePage;
