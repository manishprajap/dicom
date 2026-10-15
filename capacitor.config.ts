import type { CapacitorConfig } from "@capacitor/cli";

// ⚠️ This MUST be a "Web application" OAuth Client ID from Google Cloud Console
// (not an Android-type client), and it MUST be the same client_id set in
// Laravel's config/services.php -> 'google' -> 'client_id' (used by
// verifyIdToken() in googleLogin()).
const GOOGLE_WEB_CLIENT_ID =
  "75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com";

const config: CapacitorConfig = {
  appId: "io.ionic.starter",
  appName: "dicom",

  // Vite build output
  webDir: "dist",

  // Required for local IP (192.168.x.x) & SMB
  server: {
    androidScheme: "http",
    cleartext: true,
  },

  plugins: {
    GoogleAuth: {
      scopes: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
      serverClientId: GOOGLE_WEB_CLIENT_ID,
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;