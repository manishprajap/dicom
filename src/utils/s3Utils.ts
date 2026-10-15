import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

/* ======================================================================
   Types
   ====================================================================== */
export type FileKind = "image" | "video" | "pdf" | "dicom" | "other";

export interface S3FileItem {
  key: string; // full S3 key, e.g. "invoices/1699999999-scan.pdf"
  name: string; // just the filename part, e.g. "1699999999-scan.pdf"
  url: string;
}

export interface AwsConfig {
  bucketName: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

/* ======================================================================
   File-kind helpers
   ====================================================================== */
export const getFileKind = (name?: string): FileKind => {
  const ext = name?.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (ext === "dcm") return "dicom";
  return "other";
};

export const KIND_META: Record<
  FileKind,
  { icon: string; label: string; tint: string }
> = {
  image: { icon: "images-outline", label: "IMAGE", tint: "#0d9488" },
  video: { icon: "videocam-outline", label: "VIDEO", tint: "#7c3aed" },
  pdf: { icon: "document-text-outline", label: "PDF", tint: "#dc2626" },
  dicom: { icon: "pulse-outline", label: "DICOM", tint: "#1d4ed8" },
  other: { icon: "document-outline", label: "FILE", tint: "#475569" },
};

/* ======================================================================
   AWS config / client
   ====================================================================== */
export const getAwsConfig = (): Partial<AwsConfig> => {
  try {
    return JSON.parse(localStorage.getItem("awsConfig") || "{}");
  } catch {
    return {};
  }
};

export const getS3Client = (): {
  s3: S3Client;
  BUCKET_NAME: string;
  REGION: string;
} | null => {
  const config = getAwsConfig();
  const BUCKET_NAME = config.bucketName || "";
  const REGION = config.region || "";
  const ACCESS_KEY_ID = config.accessKey || "";
  const SECRET_ACCESS_KEY = config.secretKey || "";

  if (!BUCKET_NAME || !REGION || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    console.warn("Missing AWS Config");
    return null;
  }

  const s3 = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    // FIX: newer AWS SDK v3 versions default to requestChecksumCalculation:
    // "WHEN_SUPPORTED", which auto-attaches a CRC32 checksum to each
    // multipart upload part. Combined with @aws-sdk/lib-storage's Upload
    // helper, this was sometimes dropping the checksum on part 1, causing
    // S3 to reject the request with:
    //   "The upload was created using a crc32 checksum. The complete
    //    request must include the checksum for each part. It was missing
    //    for part 1 in the request."
    // Forcing "WHEN_REQUIRED" avoids attaching checksums unless S3 actually
    // requires them, which resolves the mismatch for both single-part
    // (small file / gallery) and multipart (large / recorded video) uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  return { s3, BUCKET_NAME, REGION };
};

export const buildPublicUrl = (key: string) => {
  const { bucketName, region } = getAwsConfig();
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

/* ======================================================================
   Upload
   ====================================================================== */
/**
 * Uploads a file to S3.
 * @param file        The File to upload.
 * @param folder      Optional folder path (no leading/trailing slash), e.g. "invoices" or "invoices/2026".
 * @param onProgress  Optional progress callback (0-100).
 */
export const uploadFileToS3 = async (
  file: File,
  folder?: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const clientConfig = getS3Client();
  if (!clientConfig) throw new Error("Invalid AWS configuration");

  const { s3, BUCKET_NAME, REGION } = clientConfig;
  const cleanFolder = folder ? folder.replace(/^\/+|\/+$/g, "") : "";
  const key = cleanFolder
    ? `${cleanFolder}/${Date.now()}-${file.name}`
    : `${Date.now()}-${file.name}`;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: file.type || "application/octet-stream",
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

/* ======================================================================
   Folders
   ====================================================================== */
const FOLDER_MARKER = ".keep";

/** Lists the top-level folders that exist under a given prefix ("" = bucket root). */
export const listFolders = async (prefix: string = ""): Promise<string[]> => {
  const clientConfig = getS3Client();
  if (!clientConfig) return [];
  const { s3, BUCKET_NAME } = clientConfig;

  const cleanPrefix = prefix ? `${prefix.replace(/\/+$/, "")}/` : "";

  const data = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Delimiter: "/",
      Prefix: cleanPrefix,
    })
  );

  return (data.CommonPrefixes || [])
    .map((p) => p.Prefix?.replace(/\/$/, "") || "")
    .filter(Boolean);
};

/** Creates an (empty) folder by writing a hidden marker object, e.g. "invoices/.keep". */
export const createFolder = async (
  folderPath: string
): Promise<void> => {
  const clientConfig = getS3Client();
  if (!clientConfig) throw new Error("Invalid AWS configuration");
  const { s3, BUCKET_NAME } = clientConfig;

  const cleanPath = folderPath.replace(/^\/+|\/+$/g, "").trim();
  if (!cleanPath) throw new Error("Folder name cannot be empty");

  const key = `${cleanPath}/${FOLDER_MARKER}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: "",
    })
  );
};

/**
 * Lists folders and files directly inside a given folder ("" = bucket root).
 * Marker files (.keep) used to represent empty folders are hidden from the file list.
 */
export const listFolderContents = async (
  prefix: string = ""
): Promise<{ folders: string[]; files: S3FileItem[] }> => {
  const clientConfig = getS3Client();
  if (!clientConfig) return { folders: [], files: [] };
  const { s3, BUCKET_NAME, REGION } = clientConfig;

  const cleanPrefix = prefix ? `${prefix.replace(/\/+$/, "")}/` : "";

  const data = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Delimiter: "/",
      Prefix: cleanPrefix,
    })
  );

  const folders = (data.CommonPrefixes || [])
    .map((p) => p.Prefix?.replace(/\/$/, "") || "")
    .filter(Boolean);

  const files: S3FileItem[] = (data.Contents || [])
    .filter((obj) => obj.Key && !obj.Key.endsWith(`/${FOLDER_MARKER}`) && obj.Key !== cleanPrefix)
    .map((obj) => {
      const key = obj.Key as string;
      const name = key.split("/").pop() || key;
      return {
        key,
        name,
        url: `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`,
      };
    });

  return { folders, files };
};

/* ======================================================================
   Camera helper
   ====================================================================== */
export const dataUrlToFile = async (
  dataUrl: string,
  filename: string,
  mime: string
) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: mime });
};