# 📱 Mobile App (React Native / Expo) - AI Agent Guidelines

> **Parent Reference**: Please review the root [AGENTS.md](../AGENTS.md) and [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) for full monorepo context.

---

## ⚠️ Critical Rules for this Sub-project

1. **Expo Version Guidelines**:
   - Always adhere to the current Expo version documentation: [Expo Docs](https://docs.expo.dev/versions/v57.0.0/).
   - Use `npx expo install <package>` to install compatible native packages.

2. **Strict Folder Isolation**:
   - Run all npm / expo commands inside `/mobile-app/`.
   - Never install mobile packages in the repository root or in `/Backend/`.
   - Never import backend Mongoose models or Node.js server modules into the mobile app.

3. **Backend Communication**:
   - All network requests must go through the centralized Axios client in `src/api/`.
   - API endpoints connect to the BAS Backend server (`http://<server-ip>:5000/api/...`).

4. **Build Artifacts**:
   - All `.expo/`, `dist/`, `web-build/`, `.eas/`, `*.apk`, `*.aab`, and Metro logs are git-ignored.
