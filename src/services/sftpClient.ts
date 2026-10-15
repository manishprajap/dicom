import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * NOTE:
 * SFTP cannot run directly in WebView (no TCP sockets in JS).
 * This works ONLY on native Android/iOS using a Capacitor plugin.
 * You MUST implement the same methods in native code.
 */

/* ================= TYPES ================= */

export interface SftpConfig {
  host: string;
  port: string | number;
  user: string;
  password: string;
}

export interface SftpEntry {
  name: string;
  path: string; // full path e.g. /folder/file.pdf
  isDir: boolean;
  size?: number;
  modified?: string;
}

/* ================= PLUGIN INTERFACE ================= */

interface SftpPluginInterface {
  deleteFile(arg0: any): unknown;
  listDir(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    path: string;
  }): Promise<{ entries: SftpEntry[] }>;

  downloadToCache(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    path: string;
  }): Promise<{ localUri: string }>;

  // ✅ Upload file
  uploadFile(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    localUri: string;
    remotePath: string;
    fileName: string;
  }): Promise<{ success: boolean }>;

  // ✅ Create directory
  mkdir(options: {
    host: string;
    port: number;
    user: string;
    password: string;
    path: string;
    folderName: string;
  }): Promise<{ success: boolean }>;
}

/* ================= REGISTER PLUGIN ================= */

const SftpPlugin = registerPlugin<SftpPluginInterface>("SftpPlugin");

/* ================= GUARD ================= */

async function ensureNative() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("SFTP works only on Android/iOS (native build).");
  }
}

/* ================= FUNCTIONS ================= */

/**
 * List directory
 */
export async function sftpListDir(
  cfg: SftpConfig,
  path: string
): Promise<SftpEntry[]> {
  await ensureNative();

  const res = await SftpPlugin.listDir({
    host: cfg.host,
    port: Number(cfg.port) || 22,
    user: cfg.user,
    password: cfg.password,
    path,
  });

  return res.entries || [];
}

/**
 * Download file to local cache
 */
export async function sftpDownloadToCache(
  cfg: SftpConfig,
  path: string
): Promise<{ localUri: string }> {
  await ensureNative();

  return SftpPlugin.downloadToCache({
    host: cfg.host,
    port: Number(cfg.port) || 22,
    user: cfg.user,
    password: cfg.password,
    path,
  });
}

/**
 * Upload file to SFTP
 */
export async function sftpUploadFile(
  cfg: SftpConfig,
  localUri: string,
  remotePath: string,
  fileName: string
): Promise<boolean> {
  await ensureNative();

  const res = await SftpPlugin.uploadFile({
    host: cfg.host,
    port: Number(cfg.port) || 22,
    user: cfg.user,
    password: cfg.password,
    localUri,
    remotePath,
    fileName,
  });

  return res?.success ?? false;
}

/**
 * Create folder on SFTP
 */
export async function sftpMkdir(
  cfg: SftpConfig,
  path: string,
  folderName: string
): Promise<boolean> {
  await ensureNative();

  const res = await SftpPlugin.mkdir({
    host: cfg.host,
    port: Number(cfg.port) || 22,
    user: cfg.user,
    password: cfg.password,
    path,
    folderName,
  });

  return res?.success ?? false;
}

export async function sftpDeleteFile(creds: any, path: string): Promise<void> {
  await SftpPlugin.deleteFile({
    ...creds,
    path
  });
}