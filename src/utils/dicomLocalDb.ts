export interface DicomUploadLocalRecord {
  instanceId: string;
  study_uid?: string;
  series_uid?: string;
  sopInstanceUID?: string;
  serverIp: string;
  serverPort?: string | number;
  calledAET?: string;
  callingAET?: string;
  patientId: string;
  patientName: string;
  userId?: string;
  fileName: string;
  fileType: string;
  modality?: string;
  uploadedAt: string;
  status: "success";
  metadata?: Record<string, unknown>;
}

export const normalizeDicomServerKey = (serverIp?: string) =>
  String(serverIp || "unknown").trim().toLowerCase();

export const readDicomUploadRegistry = (): Record<string, DicomUploadLocalRecord[]> => {
  try {
    const raw = localStorage.getItem("dicom_uploads");
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, DicomUploadLocalRecord[]>>(
      (acc, [key, value]) => {
        if (Array.isArray(value)) {
          acc[key] = value as DicomUploadLocalRecord[];
        }
        return acc;
      },
      {}
    );
  } catch (error) {
    console.error("Failed to read DICOM upload registry:", error);
    return {};
  }
};

export const writeDicomUploadRegistry = (
  registry: Record<string, DicomUploadLocalRecord[]>
) => {
  localStorage.setItem("dicom_uploads", JSON.stringify(registry));
};

export const saveDicomUploadRecord = (
  server: { ips?: string; port?: string | number; calledAETitle?: string; callingAETitle?: string },
  patient: { id?: string | number; name?: string },
  file: { name?: string; type?: string },
  result: Partial<DicomUploadLocalRecord> & { instanceId?: string; status?: string },
  metadata?: Record<string, unknown>
): DicomUploadLocalRecord => {
  const registry = readDicomUploadRegistry();
  const serverKey = normalizeDicomServerKey(server?.ips);
  const instanceId =
    String(result.instanceId || result.sopInstanceUID || result.study_uid || Date.now()).trim() || `${Date.now()}`;

  const record: DicomUploadLocalRecord = {
    instanceId,
    study_uid: typeof result.study_uid === "string" ? result.study_uid : undefined,
    series_uid: typeof result.series_uid === "string" ? result.series_uid : undefined,
    sopInstanceUID: typeof result.sopInstanceUID === "string" ? result.sopInstanceUID : undefined,
    serverIp: String(server?.ips || "unknown"),
    serverPort: server?.port,
    calledAET: server?.calledAETitle,
    callingAET: server?.callingAETitle,
    patientId: String(patient?.id || "unknown"),
    patientName: String(patient?.name || "Unknown Patient"),
    userId: localStorage.getItem("userId") || undefined,
    fileName: file?.name || "unknown-file",
    fileType: file?.type || "application/octet-stream",
    modality: typeof metadata?.modality === "string" ? metadata.modality : undefined,
    uploadedAt: new Date().toISOString(),
    status: "success",
    metadata,
  };

  const existing = Array.isArray(registry[serverKey]) ? registry[serverKey] : [];
  const trimmed = existing.filter((item) => item.instanceId !== record.instanceId);
  trimmed.unshift(record);
  registry[serverKey] = trimmed;
  writeDicomUploadRegistry(registry);

  return record;
};

export const getDicomUploadRecordsForServer = (serverIp?: string): DicomUploadLocalRecord[] => {
  const key = normalizeDicomServerKey(serverIp);
  const registry = readDicomUploadRegistry();
  return Array.isArray(registry[key]) ? registry[key] : [];
};

export const getDicomUploadRecordByInstanceId = (
  serverIp: string | undefined,
  instanceId: string | undefined
): DicomUploadLocalRecord | null => {
  if (!instanceId) return null;

  const records = getDicomUploadRecordsForServer(serverIp);
  return records.find((record) => record.instanceId === String(instanceId)) || null;
};
