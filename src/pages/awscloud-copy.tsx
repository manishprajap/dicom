import React, { useState, useEffect, useRef } from "react";
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonIcon,
    IonToast,
    IonAlert,
    IonLoading,
    IonModal,
    IonImg,
} from "@ionic/react";
import { eyeOutline, trashOutline, downloadOutline } from "ionicons/icons";
import {
    S3Client,
    ListObjectsV2Command,
    DeleteObjectCommand,
    ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { isPlatform } from "@ionic/react";

// ✅ Upload Helper
const getS3Client = () => {
    const storedConfig = JSON.parse(localStorage.getItem("awsConfig") || "{}");
    const config = storedConfig || {};

    const BUCKET_NAME = config.bucketName || "defaultBucketName";
    const REGION = config.region || "defaultRegion";
    const ACCESS_KEY_ID = config.accessKey || "defaultAccessKeyId";
    const SECRET_ACCESS_KEY = config.secretKey || "defaultSecretAccessKey";

    const s3 = new S3Client({
        region: REGION,
        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        },
    });

    return { s3, BUCKET_NAME, REGION };
};

// ✅ Upload to S3
export const uploadFileToS3 = async (
    file: File,
    onProgress?: (progress: number) => void
): Promise<string> => {
    const { s3, BUCKET_NAME, REGION } = getS3Client();

    const key = `${Date.now()}-${file.name}`;
    const upload = new Upload({
        client: s3,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file,
            ACL: ObjectCannedACL.public_read,
            ContentType: file.type,
        },
    });

    upload.on("httpUploadProgress", (progress) => {
        if (onProgress && progress.loaded && progress.total) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            onProgress(percent);
        }
    });

    await upload.done();
    return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
};

// ✅ Placeholder DICOM Thumbnail
const DicomThumbnail: React.FC<{ url: string }> = ({ url }) => {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: "#222",
                color: "#fff",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                fontSize: "0.9rem",
            }}
        >
            DICOM File
        </div>
    );
};

// ✅ Main Component
const S3FileUpload: React.FC = () => {
    const [files, setFiles] = useState<any[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<
        "image" | "pdf" | "video" | "dicom" | null
    >(null);
    const [showModal, setShowModal] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const awsConfig = JSON.parse(localStorage.getItem("awsConfig") || "{}");
    const { bucketName, region, accessKey, secretKey } = awsConfig;

    const s3Client =
        bucketName && region && accessKey && secretKey
            ? new S3Client({
                  region,
                  credentials: {
                      accessKeyId: accessKey,
                      secretAccessKey: secretKey,
                  },
              })
            : null;

    // ✅ Fetch files
    const fetchFiles = async () => {
        if (!s3Client) return;
        setLoading(true);
        try {
            const data = await s3Client.send(
                new ListObjectsV2Command({ Bucket: bucketName })
            );
            const list =
                data.Contents?.map((obj) => ({
                    name: obj.Key,
                    url: `https://${bucketName}.s3.${region}.amazonaws.com/${obj.Key}`,
                })) || [];
            setFiles(list);
        } catch (err) {
            console.error("Fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (s3Client && bucketName) fetchFiles();
    }, []);

    // ✅ Upload file
    const handleUpload = async () => {
        if (!file) {
            setToastMessage("⚠️ No file selected for upload.");
            return;
        }
        setLoading(true);
        try {
            await uploadFileToS3(file, (progress) =>
                console.log(`Uploading: ${progress}%`)
            );
            setToastMessage("✅ File Uploaded Successfully!");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            fetchFiles();
        } catch (error: any) {
            console.error("Upload error:", error);
            setToastMessage(`❌ Upload failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ✅ Delete file
    const handleDelete = async (url: string) => {
        if (!s3Client || !bucketName || !url) return;
        setLoading(true);
        try {
            const key = decodeURIComponent(url.split("/").pop() || "");
            await s3Client.send(
                new DeleteObjectCommand({ Bucket: bucketName, Key: key })
            );
            setToastMessage("🗑️ File deleted successfully!");
            fetchFiles();
        } catch (err) {
            console.error("Delete error:", err);
            setToastMessage("❌ Failed to delete file.");
        } finally {
            setLoading(false);
        }
    };

    // ✅ Thumbnail
    const getThumbnail = (item: any) => {
        const ext = item.name?.split(".").pop()?.toLowerCase();
        if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return item.url;
        if (["mp4", "mov", "webm"].includes(ext))
            return (
                <video controls className="preview-media">
                    <source src={item.url} type="video/mp4" />
                </video>
            );
        if (ext === "pdf")
            return "https://cdn-icons-png.flaticon.com/512/337/337946.png";
        if (ext === "dcm") return "dicom";
        return "https://cdn-icons-png.flaticon.com/512/833/833524.png";
    };

    // ✅ Preview modal (Updated)
    const handlePreview = async (item: any) => {
        const ext = item.name?.split(".").pop()?.toLowerCase();

        setPreviewUrl(item.url);
        if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext))
            setPreviewType("image");
        else if (["mp4", "mov", "webm"].includes(ext)) setPreviewType("video");
        else if (ext === "pdf") setPreviewType("pdf");
        else if (ext === "dcm") setPreviewType("dicom");
        else setPreviewType(null);
        setShowModal(true);
    };

    // ✅ Download
    const handleDownload = (url: string, name: string) => {
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.target = "_blank";
        link.click();
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar color="primary">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/awsConfiglist" color="light" />
                    </IonButtons>
                    <IonTitle className="text-white text-center">AWS S3 Files</IonTitle>
                </IonToolbar>
            </IonHeader>

            <IonContent>
                {loading && <IonLoading isOpen={loading} message="Please wait..." />}

                {/* Upload Section */}
                <div className="upload-section">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="file-input"
                    />
                    <button
                        onClick={handleUpload}
                        disabled={!file}
                        className={`upload-btn ${!file ? "disabled" : ""}`}
                    >
                        Upload
                    </button>
                </div>

                {/* File Grid */}
                <div className="image-grid">
                    {files
                        .slice()
                        .reverse()
                        .map((item) => {
                            const thumb = getThumbnail(item);
                            return (
                                <div key={item.url} className="image-card">
                                    <div
                                        className="preview-container"
                                        onClick={() => handlePreview(item)}
                                    >
                                        {thumb === "dicom" ? (
                                            <DicomThumbnail url={item.url} />
                                        ) : typeof thumb === "string" ? (
                                            <IonImg src={thumb} className="preview-media" />
                                        ) : (
                                            thumb
                                        )}
                                    </div>

                                    <div className="icon-group">
                                        <IonButton
                                            fill="clear"
                                            color="primary"
                                            onClick={() => handlePreview(item)}
                                        >
                                            <IonIcon icon={eyeOutline} size="small" />
                                        </IonButton>
                                        <IonButton
                                            fill="clear"
                                            color="success"
                                            onClick={() =>
                                                handleDownload(item.url, item.name)
                                            }
                                        >
                                            <IonIcon icon={downloadOutline} size="small" />
                                        </IonButton>
                                        <IonButton
                                            fill="clear"
                                            color="danger"
                                            onClick={() => {
                                                setFileToDelete(item.url);
                                                setShowDeleteAlert(true);
                                            }}
                                        >
                                            <IonIcon icon={trashOutline} size="small" />
                                        </IonButton>
                                    </div>
                                </div>
                            );
                        })}
                </div>

                {/* Modal Preview */}
                <IonModal isOpen={showModal} onDidDismiss={() => setShowModal(false)}>
                    <IonHeader>
                        <IonToolbar color="primary">
                            <IonButtons slot="start">
                                <IonButton onClick={() => setShowModal(false)}>
                                    Close
                                </IonButton>
                            </IonButtons>
                            <IonTitle className="text-white text-center">
                                {previewType === "pdf"
                                    ? "PDF Viewer"
                                    : previewType === "image"
                                    ? "Image Viewer"
                                    : previewType === "video"
                                    ? "Video Player"
                                    : previewType === "dicom"
                                    ? "DICOM Viewer"
                                    : "Preview"}
                            </IonTitle>
                        </IonToolbar>
                    </IonHeader>

                    <IonContent className="ion-padding">
                        {previewType === "image" && previewUrl && (
                            <IonImg
                                src={previewUrl}
                                className="max-w-full object-contain rounded-xl"
                            />
                        )}
                        {previewType === "video" && previewUrl && (
                            <video controls className="w-full rounded-xl">
                                <source
                                    src={previewUrl}
                                    type={`video/${previewUrl
                                        .split(".")
                                        .pop()
                                        ?.toLowerCase()}`}
                                />
                            </video>
                        )}

                        {/* ✅ PDF Viewer (Works in Android/iOS/Desktop) */}
                        {previewType === "pdf" && previewUrl && (
                            <iframe
                                src={`https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(
                                    previewUrl
                                )}`}
                                title="PDF Viewer"
                                style={{
                                    width: "100%",
                                    height: "100vh",
                                    backgroundColor: "#000",
                                }}
                            />
                        )}

                        {previewType === "dicom" && previewUrl && (
                            <DicomThumbnail url={previewUrl} />
                        )}
                    </IonContent>
                </IonModal>

                {/* Toast + Alert */}
                <IonToast
                    isOpen={!!toastMessage}
                    message={toastMessage}
                    duration={2000}
                    onDidDismiss={() => setToastMessage("")}
                />

                <IonAlert
                    isOpen={showDeleteAlert}
                    onDidDismiss={() => setShowDeleteAlert(false)}
                    header="Confirm Delete"
                    message="Are you sure you want to delete this file?"
                    buttons={[
                        { text: "Cancel", role: "cancel" },
                        {
                            text: "Yes",
                            handler: () => {
                                if (fileToDelete) handleDelete(fileToDelete);
                                setFileToDelete(null);
                            },
                        },
                    ]}
                />

                {/* Styles */}
                <style>{`
          .upload-section {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #fff;
            border-radius: 10px;
            margin: 10px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.1);
          }
          .file-input {
            flex: 1;
            margin-right: 10px;
          }
          .upload-btn {
            background-color: #007bff;
            color: white;
            padding: 8px 18px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          }
          .upload-btn.disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .image-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 12px;
          }
          .image-card {
            background: #fff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          }
          .preview-container {
            background: #f8f8f8;
            height: 160px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
          .preview-media {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .icon-group {
            display: flex;
            justify-content: center;
            gap: 10px;
            padding: 6px;
            background: #fff;
            border-top: 1px solid #eee;
          }
        `}</style>
            </IonContent>
        </IonPage>
    );
};

export default S3FileUpload;
