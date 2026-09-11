# Saha — React Native CLI app

The app uses the React Native Community CLI with committed `android/` and `ios/` projects. Start it using `npm start`, `npm run android` or `npm run ios`; Expo is not used.

See the parent [README](../README.md) for installation, API setup and native build instructions.

- `App.tsx`: native screens and application state.
- `src/api.ts`: account API and Keychain/Keystore session storage.
- `src/notifications.ts`: native reminder scheduling with Notifee.
- `src/config.ts`: physical-device API URL configuration.
- `../shared/`: shared scheduling domain.

Run `npm ci` before development because generated dependencies are deliberately excluded from the cleaned folder.
