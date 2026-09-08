# Saha mobile app

Saha is a native Expo/React Native companion for Android and iPhone. Daily task completion, hydration, mood, energy, and symptoms are saved on the device and restored when the app reopens.

## Open in VS Code

Open the parent folder `Personal Helper` to work on both products, or open this `mobile-app` folder by itself for only the phone app.

## Run on a phone

1. Install **Expo Go** on the Android or iPhone.
2. In a VS Code terminal, change into `mobile-app`.
3. Run `npm start`.
4. Scan the QR code with Expo Go. The computer and phone should be on the same network.

Use `npm run android` for an Android emulator or `npm run ios` for the iOS Simulator on macOS.

## Product structure

- `App.tsx` — interactive Today, Plan, Track, Medicines, and Insights screens.
- `app.json` — app name and native configuration.
- `assets/` — app icons and splash assets.
- Async Storage — local persistence for the current MVP.

The existing web application remains in the parent project. A future shared API can synchronize the web and native applications across devices.
