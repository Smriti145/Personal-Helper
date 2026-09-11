const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const port=8082;
const socket=net.connect({port,host:'127.0.0.1'});
socket.on('connect',async()=>{
 socket.destroy();
 const lookup=spawnSync('lsof',['-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'});
 const pid=lookup.stdout?.trim().split('\n')[0];
 const cwd=pid?spawnSync('lsof',['-a','-p',pid,'-d','cwd','-Fn'],{encoding:'utf8'}).stdout?.split('\n').find(s=>s.startsWith('n'))?.slice(1):null;
 let status='';try{status=await(await fetch(`http://127.0.0.1:${port}/status`,{signal:AbortSignal.timeout(2000)})).text();}catch{}
 if(cwd&&fs.realpathSync(cwd)===fs.realpathSync(root)&&status==='packager-status:running'){
  console.log(`Personal Helper Metro is already running on ${port}. Reusing it; run npm run android (or npm run ios) from the project root.`);
 }else{
  console.error(`Port ${port} is occupied by ${cwd||'another process'}. No process was stopped. Check the port owner before starting Metro.`);process.exitCode=1;
 }
});
socket.on('error',error=>{
 if(error.code!=='ECONNREFUSED'){console.error(error.message);process.exitCode=1;return;}
 const child=spawn(process.execPath,[require.resolve('react-native/cli.js'),'start','--port',String(port),...process.argv.slice(2)],{cwd:root,stdio:'inherit'});
 child.on('exit',code=>{process.exitCode=code??1;});
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});
});
