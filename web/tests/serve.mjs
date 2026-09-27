import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
const dist=fileURLToPath(new URL('../../dist/',import.meta.url));
export async function serve(port=0) {
  const server=createServer(async(req,res)=>{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/ipfs\/heartbeat\//,'');
    const path=resolve(dist,relative||'index.html');
    if(!path.startsWith(dist)){res.writeHead(403);res.end();return;}
    try {const bytes=await readFile(path);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'}[extname(path)]??'application/octet-stream'});res.end(bytes);}
    catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));
  return {server,url:`http://127.0.0.1:${server.address().port}/ipfs/heartbeat/`};
}
if(process.argv.includes('--preview')){const {url}=await serve(4173);console.log(url);}
