import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// import './theme/variables.css';

import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

GoogleAuth.initialize({
  // scopes: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly'],
  scopes: ['https://www.googleapis.com/auth/drive.file'],
  grantOfflineAccess: true,
  clientId: '648160995017-rtv2khho3hsq3pgmpdkdqkmen580873c.apps.googleusercontent.com' // ✅ updated key name
});

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);