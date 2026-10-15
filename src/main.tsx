import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

// Same Web Client ID as capacitor.config.ts — must never drift from it.
const GOOGLE_WEB_CLIENT_ID =
  '75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com';

// IMPORTANT: only initialize the native Capacitor plugin on native platforms
// (Android/iOS). On web, GoogleAuth.initialize() drives the plugin's
// gapi.auth2-based web fallback, which is deprecated by Google and triggers
// the "Not a valid origin" / FedCM errors. Web uses Google Identity Services
// directly instead — see Login.tsx.
if (Capacitor.isNativePlatform()) {
  GoogleAuth.initialize({
    clientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.file'],
    grantOfflineAccess: true,
  });
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);