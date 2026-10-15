import React, { useEffect, useRef, useState } from 'react';
import {
  IonContent,
  IonHeader,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonText,
} from '@ionic/react';

import { Dicom } from '@aarna/capacitor-dicom';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import '../css/Studies.css';

interface Study {
  ID: string;
  IsStable?: boolean;
  MainDicomTags?: {
    PatientName?: string;
    PatientID?: string;
    StudyDate?: string;
    StudyDescription?: string;
    StudyInstanceUID?: string;
  };
  Series?: string[];
}

interface DimseStudy {
  StudyInstanceUID?: string;
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;
  StudyDescription?: string;
  [key: string]: unknown;
}

const Studies: React.FC = () => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [host, setHost] = useState('38.143.20.250');
  const [port, setPort] = useState('4242');
  const [calledAET, setCalledAET] = useState('MyOrthanc');
  const [callingAET, setCallingAET] = useState('MYSCU');
  const [connected, setConnected] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [studyInstanceUID, setStudyInstanceUID] = useState('');
  const [retrieving, setRetrieving] = useState(false);
  const [retrievedFiles, setRetrievedFiles] = useState<string[]>([]);
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | undefined;
    Dicom.addListener('connectionState', (event) => {
      if (event.error) {
        setError(`DICOM native error: ${event.error}`);
      }
    }).then((listener) => { handle = listener; }).catch(() => undefined);
    return () => { void handle?.remove(); };
  }, []);

  const loadStudies = async (connectionOnly = false) => {
    let associationEstablished = connected;
    try {
      setLoading(true);
      setError('');
      if (Capacitor.getPlatform() === 'web') {
        throw new Error(
          'DIMSE is unavailable in the browser. Install and run the Android app to connect to port 4242, or enable Orthanc HTTP/DICOMweb on port 8042.'
        );
      } else {
        await Dicom.connect({
          mode: 'dimse',
          dimse: {
            host: host.trim(),
            port: Number(port),
            callingAET: callingAET.trim(),
            calledAET: calledAET.trim(),
          },
        });
        setConnected(true);
        associationEstablished = true;
        if (connectionOnly) return;
        const result = await Dicom.find({
          level: 'STUDY',
          model: 'PATIENT_ROOT',
          query: {},
          returnKeys: [
            'StudyInstanceUID',
            'PatientName',
            'PatientID',
            'StudyDate',
            'StudyDescription',
          ],
        });

        setStudies((result.items as DimseStudy[]).map((study, index) => ({
          ID: study.StudyInstanceUID || `study-${index}`,
          MainDicomTags: {
            PatientName: study.PatientName,
            PatientID: study.PatientID,
            StudyDate: study.StudyDate,
            StudyDescription: study.StudyDescription,
            StudyInstanceUID: study.StudyInstanceUID,
          },
        })).sort((left, right) =>
          (right.MainDicomTags?.StudyDate || '').localeCompare(left.MainDicomTags?.StudyDate || '')
        ));
      }
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unknown connection error';
      setConnected(associationEstablished);
      setError(
        associationEstablished
          ? `Connected to DICOM server, but C-FIND failed. C-STORE upload remains available. ${message}`
          : `DICOM connection failed. Verify the server IP/port and AE titles. ${message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const connectToServer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!host.trim() || !port || !calledAET.trim() || !callingAET.trim()) {
      setError('IP, port, called AE title, and calling AE title are required.');
      return;
    }
    await loadStudies();
  };

  const stageFile = async (file: File): Promise<string> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Unable to read the selected file.'));
      reader.readAsDataURL(file);
    });
    const stagedPath = `dicom_uploads/${Date.now()}-${file.name}`;
    await Filesystem.writeFile({ path: stagedPath, data: base64, directory: Directory.Cache, recursive: true });
    const result = await Filesystem.getUri({ path: stagedPath, directory: Directory.Cache });
    return result.uri.replace(/^file:\/\//, '');
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    const isImage = /\.(jpg|jpeg|png|bmp)$/i.test(selectedFile.name);
    const isDicom = /\.dcm$/i.test(selectedFile.name);
    if (!isImage && !isDicom) {
      setUploadMessage('Upload failed: select a DICOM, JPG, JPEG, PNG, or BMP file.');
      return;
    }
    if (Capacitor.getPlatform() === 'web') {
      setUploadMessage('DICOM upload uses C-STORE and is available in the Android app.');
      setError('DICOM upload uses C-STORE and is available in the Android app. Browser upload requires an HTTP STOW endpoint.');
      return;
    }
    try {
      setUploading(true);
      setError('');
      setUploadMessage('Uploading DICOM file with C-STORE...');
      if (!connected) await loadStudies(true);
      const path = await stageFile(selectedFile);
      const result = await Dicom.store({ filePath: path });
      if (!result.success) throw new Error(`C-STORE failed with status 0x${(result.status ?? -1).toString(16)}`);
      setUploadMessage(`Upload successful. SOP Instance UID: ${result.sopInstanceUID || 'returned by server'}`);
      const uploadedStudy: Study = {
        ID: result.sopInstanceUID || `uploaded-${Date.now()}`,
        MainDicomTags: {
          StudyInstanceUID: result.sopInstanceUID,
          StudyDescription: `Uploaded: ${selectedFile.name}`,
          StudyDate: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
        },
      };
      setStudies((current) => [
        uploadedStudy,
        ...current.filter((study) => study.ID !== uploadedStudy.ID),
      ]);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      try {
        await loadStudies();
      } catch {
        // Keep the uploaded file visible when the server's C-FIND is unavailable.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DICOM upload failed.';
      setUploadMessage(`Upload failed: ${message}`);
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  const retrieveStudy = async () => {
    if (!studyInstanceUID.trim()) {
      setError('Enter a Study Instance UID before retrieving.');
      return;
    }
    if (!isNative) {
      setError('C-GET is available in the Android app only.');
      return;
    }
    try {
      setRetrieving(true);
      setError('');
      if (!connected) await loadStudies(true);
      const result = await Dicom.get({ studyInstanceUID: studyInstanceUID.trim() });
      if (result.status !== 0) throw new Error(`C-GET failed with status 0x${result.status.toString(16)}`);
      setRetrievedFiles(result.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'C-GET retrieval failed.');
    } finally {
      setRetrieving(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>DICOM Studies</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">

        <div className="studies-layout">
          <IonCard className="connection-card">
            <IonCardHeader>
              <IonCardTitle>Connect to DICOM server</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p className="protocol-note">
                {isNative
                  ? 'Android DIMSE mode: C-ECHO and C-FIND use the DICOM port below.'
                  : 'Browser HTTP mode: this requires Orthanc HTTP/DICOMweb, usually port 8042. Browser cannot connect to DIMSE port 4242.'}
              </p>
              <form onSubmit={connectToServer}>
                <IonItem>
                  <IonLabel position="stacked">Server IP or hostname</IonLabel>
                  <IonInput value={host} onIonInput={(event) => setHost(event.detail.value || '')} inputMode="url" />
                </IonItem>
                <div className="studies-form-row">
                  <IonItem>
                    <IonLabel position="stacked">DICOM port</IonLabel>
                    <IonInput value={port} onIonInput={(event) => setPort(event.detail.value || '')} type="number" />
                  </IonItem>
                  <IonItem>
                    <IonLabel position="stacked">Called AE title</IonLabel>
                    <IonInput value={calledAET} onIonInput={(event) => setCalledAET(event.detail.value || '')} />
                  </IonItem>
                </div>
                <IonItem>
                  <IonLabel position="stacked">Calling AE title</IonLabel>
                  <IonInput value={callingAET} onIonInput={(event) => setCallingAET(event.detail.value || '')} />
                </IonItem>
                <IonButton type="submit" expand="block" disabled={loading}>
                  {loading ? <IonSpinner name="dots" /> : connected ? 'Reconnect and refresh' : 'Connect and load studies'}
                </IonButton>
              </form>
            </IonCardContent>
          </IonCard>

          <IonCard className="upload-card">
            <IonCardHeader>
              <IonCardTitle>Send DICOM file</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".dcm,application/dicom,.jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setUploadMessage(''); }} />
              <IonButton fill="outline" onClick={() => fileInputRef.current?.click()}>Choose from gallery</IonButton>
              <span className="selected-file">{selectedFile ? selectedFile.name : 'No file selected'}</span>
              <IonButton onClick={uploadFile} disabled={!selectedFile || uploading || !connected}>
                {uploading ? <IonSpinner name="dots" /> : 'Upload with C-STORE'}
              </IonButton>
              {uploadMessage && <p className={`upload-status ${uploadMessage.startsWith('Upload successful') ? 'upload-status-success' : 'upload-status-error'}`}>{uploadMessage}</p>}
            </IonCardContent>
          </IonCard>

          <IonCard className="retrieve-card">
            <IonCardHeader>
              <IonCardTitle>Retrieve a study with C-GET</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem>
                <IonLabel position="stacked">Study Instance UID</IonLabel>
                <IonInput value={studyInstanceUID} onIonInput={(event) => setStudyInstanceUID(event.detail.value || '')} placeholder="1.2.840..." />
              </IonItem>
              <IonButton onClick={retrieveStudy} disabled={!studyInstanceUID.trim() || retrieving || !connected}>
                {retrieving ? <IonSpinner name="dots" /> : 'Retrieve study'}
              </IonButton>
              {retrievedFiles.length > 0 && (
                <p className="selected-file">Retrieved {retrievedFiles.length} file(s) into the app cache.</p>
              )}
            </IonCardContent>
          </IonCard>
        </div>

        {loading && <IonSpinner />}

        {error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}

        <h2 className="studies-section-title">Latest studies</h2>
        <IonList>
          {studies.map((study) => {
            const tags = study.MainDicomTags || {};

            return (
              <IonItem key={study.ID}>
                <IonLabel>
                  <h2>
                    {tags.PatientName || 'Unknown Patient'}
                  </h2>

                  <p>
                    Patient ID: {tags.PatientID || '-'}
                  </p>

                  <p>
                    Study Date: {tags.StudyDate || '-'}
                  </p>

                  <p>
                    Description: {tags.StudyDescription || '-'}
                  </p>

                  <p>
                    Series: {study.Series?.length || 0}
                  </p>
                </IonLabel>
              </IonItem>
            );
          })}
        </IonList>

      </IonContent>
    </IonPage>
  );
};

export default Studies;