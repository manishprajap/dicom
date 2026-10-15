import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

/* ================= TYPES ================= */

export type SmbConfig = {
  ip: string;
  share?: string; // optional (default WiFiShare)
  username?: string;
  password?: string;
};

export type ListEntry = {
  name: string;
  isDir: boolean;
  path: string;
  size?: number;
  modifiedAt?: number;
};

type ListDirResult = { items: ListEntry[] };
type UploadFileResult = { ok: boolean };
type DownloadToCacheResult = { localUri: string };

export interface SmbClientPlugin {
  listDir(options: {
    ip: string;
    username?: string;
    password?: string;
    share: string;
    path: string;
  }): Promise<ListDirResult>;

  uploadFile(options: {
    ip: string;
    username?: string;
    password?: string;
    share: string;
    remotePath: string;
    localUri: string;
    mimeType: string;
  }): Promise<UploadFileResult>;

  createFolder(options: {
    ip: string;
    username?: string;
    password?: string;
    share: string;
    path: string;
  }): Promise<{ ok: boolean }>;

  downloadToCache(options: {
    ip: string;
    username?: string;
    password?: string;
    share: string;
    remotePath: string;
  }): Promise<DownloadToCacheResult>;

  readFile(options: {
    ip: string;
    username?: string;
    password?: string;
    share: string;
    path: string;
  }): Promise<{ base64?: string; data?: string; content?: string }>;
}

/* ================= HELPERS ================= */

function ensureNative() {
  if (Capacitor.getPlatform() === "web") {
    throw new Error("SMB is not supported on Web. Please run on Android/iOS build.");
  }
}

const defaultShare = (cfg: SmbConfig) =>
  cfg.share && cfg.share.trim() ? cfg.share.trim() : "WiFiShare";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; // 32KB at a time
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ================= PLUGIN ================= */

const SmbClient = registerPlugin<SmbClientPlugin>("SmbClient");

/* ================= FUNCTIONS ================= */

/**
 * List directory
 *
 * NOTE: on a fresh install, the very first SMB call can race against
 * Android still binding the app process to the Wi-Fi network (especially
 * on dual Wi-Fi + cellular devices). The native side times out after
 * ~5s in that case. We retry a couple of times with a short backoff so
 * the UI doesn't surface a hard failure on that first race.
 */
export async function smbListDir(
  cfg: SmbConfig,
  path: string,
  retries = 2,
  retryDelayMs = 1500
): Promise<ListEntry[]> {
  ensureNative();

  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await SmbClient.listDir({
        ip: cfg.ip,
        share: defaultShare(cfg),
        path: path?.trim() ? path : "/",
        username: cfg.username || "",
        password: cfg.password || "",
      });
      return res?.items || [];
    } catch (err: any) {
      lastErr = err;
      const isConnectFailure = /failed to connect/i.test(err?.message || "");
      // Only retry on connect-style failures, not auth/path errors.
      if (!isConnectFailure || attempt === retries) break;
      await sleep(retryDelayMs);
    }
  }

  throw lastErr;
}

/**
 * Write a browser File to the device cache in chunks, so we never pass
 * one giant base64 string across the bridge in a single call. Returns
 * the native file:// URI of the written file.
 *
 * Use this for anything that can be large (DICOM, video, etc). Small
 * files (images) work fine with this too, it's just marginally slower.
 */
export async function writeFileToCacheChunked(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per bridge call
  const safeName = `upload_${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;

  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  let offset = 0;
  let chunkIndex = 0;

  // First chunk: create/overwrite the file
  {
    const slice = file.slice(0, Math.min(CHUNK_SIZE, file.size));
    const buf = await slice.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    await Filesystem.writeFile({
      path: safeName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    offset += slice.size;
    chunkIndex += 1;
    onProgress?.(Math.round((chunkIndex / totalChunks) * 100));
  }

  // Remaining chunks: append
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const slice = file.slice(offset, end);
    const buf = await slice.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);

    await Filesystem.appendFile({
      path: safeName,
      data: base64,
      directory: Directory.Cache,
    });

    offset = end;
    chunkIndex += 1;
    onProgress?.(Math.round((chunkIndex / totalChunks) * 100));
  }

  const { uri } = await Filesystem.getUri({
    path: safeName,
    directory: Directory.Cache,
  });

  return uri;
}

/**
 * Delete a previously written cache file (call after a successful/failed
 * upload to avoid leaving large temp files around on device).
 */
export async function deleteCacheFileByUri(uri: string): Promise<void> {
  try {
    const marker = "/Cache/";
    const idx = uri.indexOf(marker);
    if (idx === -1) return;
    const relativePath = uri.substring(idx + marker.length);
    await Filesystem.deleteFile({
      path: relativePath,
      directory: Directory.Cache,
    });
  } catch (err) {
    console.warn("Failed to clean up temp upload file:", err);
  }
}

/**
 * Upload a file by native URI (streamed on the native side).
 * `localUri` should come from writeFileToCacheChunked(), the Camera
 * plugin, or any other Capacitor API that gives you a native file path.
 */
export async function smbUploadFromUri(
  cfg: SmbConfig,
  remotePath: string,
  localUri: string,
  mimeType: string
): Promise<UploadFileResult> {
  ensureNative();
  return await SmbClient.uploadFile({
    ip: cfg.ip,
    share: defaultShare(cfg),
    remotePath,
    localUri,
    mimeType,
    username: cfg.username || "",
    password: cfg.password || "",
  });
}

/**
 * Create folder
 */
export async function smbCreateFolder(cfg: SmbConfig, path: string): Promise<{ ok: boolean }> {
  ensureNative();
  return await SmbClient.createFolder({
    ip: cfg.ip,
    share: defaultShare(cfg),
    path,
    username: cfg.username || "",
    password: cfg.password || "",
  });
}

/**
 * Download file to device cache
 */
export async function smbDownloadToCache(
  cfg: SmbConfig,
  remotePath: string
): Promise<DownloadToCacheResult> {
  ensureNative();
  return await SmbClient.downloadToCache({
    ip: cfg.ip,
    share: defaultShare(cfg),
    remotePath,
    username: cfg.username || "",
    password: cfg.password || "",
  });
}

/**
 * Read file as Base64 (fine for smaller files; for very large DICOM
 * downloads consider adding a chunked readFile on the native side too).
 */
export async function smbReadFileBase64(cfg: SmbConfig, path: string): Promise<string> {
  ensureNative();
  const res = await SmbClient.readFile({
    ip: cfg.ip,
    share: defaultShare(cfg),
    path,
    username: cfg.username || "",
    password: cfg.password || "",
  });
  return res?.base64 || res?.data || res?.content || "";
}