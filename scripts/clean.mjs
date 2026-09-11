import {rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
// Only reproducible dependencies and compiler outputs. Never delete secrets,
// database files, native source projects, migrations, lockfiles or git history.
const generated=[
 'mobile-app/node_modules','mobile-app/build','mobile-app/.expo',
 'mobile-app/android/.gradle','mobile-app/android/.kotlin',
 'mobile-app/android/build','mobile-app/android/app/build','mobile-app/android/app/.cxx',
 'mobile-app/ios/build','mobile-app/ios/Pods',
 'server/node_modules','server/dist','server/.next','server/.vinext','server/tsconfig.tsbuildinfo',
];
for(const name of generated)await rm(path.join(root,name),{recursive:true,force:true});
console.log('Cleaned generated files. Native source, API data and secrets are preserved.');
console.log('Before developing again: npm run app:install && npm run api:install');
