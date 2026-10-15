// import type { CapacitorConfig } from "@capacitor/cli";

// const config: CapacitorConfig = {
//   appId: "io.ionic.tech",
//   appName: "myApp",
//   webDir: "dist",
//   plugins: {
//     GoogleAuth: {
//       scopes: [
//         "profile",
//         "email",
//         "https://www.googleapis.com/auth/drive.file",
//       ],
//       serverClientId:
//         "648160995017-rtv2khho3hsq3pgmpdkdqkmen580873c.apps.googleusercontent.com",
     
//     },
//   },
// };

// export default config;

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.ionic.starter",
  appName: "dicom",

  // ✅ Vite build output
  webDir: "dist",

  // ✅ Required for local IP (192.168.x.x) & SMB
  server: {
    androidScheme: "http",
    cleartext: true,
  },

  plugins: {
    GoogleAuth: {
      scopes: ["https://www.googleapis.com/auth/drive.file"],
      serverClientId:
        "75839040914-0ih63na107kheqhkgf853j1nb3huj2q2.apps.googleusercontent.com",
    },
  },
};

export default config;

