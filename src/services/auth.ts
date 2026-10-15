import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { Capacitor } from "@capacitor/core";

// Client IDs
const GOOGLE_WEB_CLIENT_ID =
  "75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com";

const GOOGLE_ANDROID_CLIENT_ID =
  "75839040914-lhqsn3qnaj742bju71m2u5nl05foa6fn.apps.googleusercontent.com";

const GOOGLE_SCOPES = [
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive.file",
];

const isNative = Capacitor.isNativePlatform();

export const initGoogleAuth = () => {
  if (isNative) {
    GoogleAuth.initialize({
      clientId: GOOGLE_WEB_CLIENT_ID, // Use Web Client ID here for Native ID Token generation
      scopes: GOOGLE_SCOPES,
      grantOfflineAccess: true,
    } as any); // Cast as 'any' if TypeScript strictly checks the interface
  } else {
    GoogleAuth.initialize({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: GOOGLE_SCOPES,
      grantOfflineAccess: true,
    });
  }
};

initGoogleAuth();

export const googleLogin = async () => {
  try {
    const user = await GoogleAuth.signIn();

    console.log("Google User Response:", user);

    return {
      success: true,
      data: user,
      idToken: user.authentication?.idToken,
      serverAuthCode: user.serverAuthCode,
    };
  } catch (error: any) {
    console.error("Google login error:", error);

    return {
      success: false,
      error: error?.message || error || "Google Sign-In failed.",
    };
  }
};