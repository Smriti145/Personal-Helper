# Personal Helper — React Native CLI

Saha is an Android/iOS personal health and routine app. The mobile app uses React Native CLI, with native Android and iOS projects. There is no website UI, Expo runtime, Expo Go or chatgpt.site dependency.

## Folder structure

- `mobile-app/` — React Native screens, native storage/notifications, `android/` and `ios/` projects.
- `shared/` — configurable routine/scheduling domain used by the app and API.
- `server/` — account and saved-routine API only. Keep it for login, multiple users and persistence.
- `tests/` — routine and reminder regression tests.
- `docs/` — product architecture and current feature boundaries.

See [the repository audit and prioritized implementation plan](docs/REPOSITORY_AUDIT.md) for verified coverage, remaining correctness issues and incremental development order.

Generated dependencies and build outputs have been removed to keep this checkout small. Install them when developing; `node_modules` and native build caches will grow again normally. Existing server secrets and local database files are retained.

## Install

```sh
npm run app:install
npm run api:install
```

Requirements: Node 22.13+, Java 17 and Android SDK 36 for Android. iOS requires macOS, full Xcode and CocoaPods. For iOS, run `bundle install` and `bundle exec pod install` from `mobile-app/ios` after installing the JavaScript dependencies.

## Start the account API

```sh
npm run api
```

The API listens on port 3000. The existing `server/.dev.vars` contains the local authentication secret; do not commit it. Local records live in `server/.wrangler/state`.

Initialize the account database from the **Personal Helper root**:

```sh
npm run db:init
```

This command creates missing native-app tables and can be rerun without deleting existing accounts or records. It does not need a server build or a placeholder migration filename. Keep `server/.dev.vars` with a random `AUTH_SECRET` of at least 32 characters for a fresh checkout.

## Run the native app

Personal Helper uses **Metro port 8082** for start, Android and iOS, leaving port 8081 available for other React Native projects.

In a second terminal:

```sh
npm start
```

In a third terminal, with a device or simulator available:

```sh
npm run android
# or
npm run ios
```

Android emulator API default: `http://10.0.2.2:3000`. iOS simulator: `http://localhost:3000`. For a physical phone, set `SERVER_URL` in `mobile-app/src/config.ts` to your computer's reachable LAN URL. Use an HTTPS API for production. Android HTTP access is limited to debug builds by the native template.

## Features retained

Native register/login, configurable onboarding, routine builder, daily checklist, medication schedules, meal planning, hydration, movement, sleep, wellbeing, calendar, weekly insights, recovery guidance, export and account deletion. The app uses the API for durable account data; temporary preview mode is explicitly unsaved.

Native notifications are queued through Notifee, respecting configured dates, completion, snooze, quiet hours and category preferences. The app refreshes the next seven days when syncing, capped at 50 Android / 60 iOS notifications. Device permissions and OS restrictions affect delivery; exact alarm delivery and indefinite background queue renewal are not guaranteed.

Reminder updates are serialized and reconcile individual triggers rather than clearing the entire queue first. Missing or ambiguous daylight-saving times are reported for review instead of silently moved. Failed native updates can be partial; retry the reminder refresh. Cross-midnight snooze handling remains an open audit item.

## Checks

```sh
npm test
npm run typecheck
npm run bundle
npm --prefix server run typecheck
```

`npm run bundle` checks JavaScript bundles; it does not compile an APK or iOS binary. Android binary: `cd mobile-app/android && ./gradlew assembleDebug`. iOS binary: build the generated workspace in Xcode after CocoaPods installation.

## Keep the folder small

After stopping Metro, the API and native builds, run `npm run clean`. It removes dependencies and generated build files, but retains native source, lockfiles, database records and local secrets. Reinstall dependencies before your next development session.

## If the app says “SahaNative has not been registered”

Run `npm start` once, then `npm run android` to rebuild/reconnect to port 8082. Do not start a second Metro in `mobile-app`. Root and mobile-app start commands launch the same bundler. If another project's Metro occupies 8081, leave it running; Personal Helper uses 8082.

Android Studio and direct Gradle debug builds also default to Metro 8082 through `mobile-app/android/gradle.properties`. Rebuild/reinstall the app once after changing this value; restarting Metro alone does not change the port embedded in an older APK. Existing GroceryCompare Metro on 8081 should remain untouched.
