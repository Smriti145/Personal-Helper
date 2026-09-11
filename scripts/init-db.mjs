import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const server=fileURLToPath(new URL('../server/',import.meta.url));
// These immutable migrations define the four tables used by the native MVP.
// IF NOT EXISTS makes bootstrapping safe for the already-initialized local DB.
const files=['0001_daffy_namor.sql','0003_wandering_mandarin.sql'];
const sql=(await Promise.all(files.map(f=>readFile(path.join(server,'drizzle',f),'utf8')))).join('\n')
 .replaceAll('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ')
 .replaceAll('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ');
const temp=await mkdtemp(path.join(tmpdir(),'saha-db-init-'));
try {
 const input=path.join(temp,'init.sql');await writeFile(input,sql);
 const result=spawnSync(process.execPath,[path.join(server,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc','--file',input],{cwd:server,stdio:'inherit',env:{...process.env,WRANGLER_LOG_PATH:path.join(server,'.wrangler/logs')}});
 if(result.error)throw result.error;
 process.exitCode=result.status??1;
}finally{await rm(temp,{recursive:true,force:true});}
