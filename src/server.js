import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {interpret,decide,WrapperError,VERSION} from './index.js';

const base = (process.env.BASE_PATH ?? '/jevwrapper').replace(/\/$/,'');
const port = Number(process.env.PORT || 3187);
const ownerToken = process.env.OWNER_TOKEN || '';
const liveAvailable = Boolean(process.env.OPENAI_API_KEY && process.env.TYPESAFE_API_KEY && ownerToken.length >= 24);
const publicDir = new URL('../public/',import.meta.url);
const limits = new Map();
let daily = {day:'',count:0};
const maxDaily = Number(process.env.MAX_REQUESTS_PER_DAY || 200);
const headers = {
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
function json(res,status,data) { res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>120000) throw new WrapperError('Request is too large.',413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new WrapperError('Request body must be valid JSON.'); }
}
function authorize(req) {
  if (!liveAvailable) throw new WrapperError('Live mode is not configured. Explore the illustrative sample or self-host with your own keys.',503);
  const a=Buffer.from(req.headers.authorization || ''); const b=Buffer.from(`Bearer ${ownerToken}`);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new WrapperError('Enter the owner access token to use live mode.',401);
  const origin=req.headers.origin;
  if (origin) { let host; try{host=new URL(origin).host;}catch{throw new WrapperError('Invalid origin.',403);} if(host!==req.headers.host)throw new WrapperError('This origin is not allowed.',403); }
}
function rateLimit(req) {
  const now=Date.now(),key=req.socket.remoteAddress || 'local';
  let value=limits.get(key); if(!value || now-value.start>=60000)value={start:now,count:0};
  if (++value.count>20)throw new WrapperError('Please wait a minute before making more requests.',429);
  limits.set(key,value);
  const day=new Date().toISOString().slice(0,10);if(daily.day!==day)daily={day,count:0};
  if(++daily.count>maxDaily)throw new WrapperError('This instance has reached its daily request budget.',429);
}
const assets = new Map([['','index.html'],['/','index.html'],['/index.html','index.html'],['/styles.css','styles.css'],['/style.css','style.css'],['/app.js','app.js'],['/favicon.svg','favicon.svg'],['/og.svg','og.svg']]);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
export const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname===base && req.method==='GET'){res.writeHead(308,{...headers,Location:`${base}/`});res.end();return;}
    if(!url.pathname.startsWith(`${base}/`)){json(res,404,{error:'Not found.'});return;}
    const path=url.pathname.slice(base.length);
    if(path==='/api/config' && req.method==='GET'){json(res,200,{version:VERSION,liveAvailable,authRequired:true,model:process.env.JEV_MODEL||'jev-latest',interpreterModel:process.env.OPENAI_MODEL||'gpt-5-mini'});return;}
    if(path.startsWith('/api/')){
      if(req.method!=='POST'){json(res,405,{error:'Use POST.'});return;}
      if(!['/api/interpret','/api/decide'].includes(path)){json(res,404,{error:'Not found.'});return;}
      if(!(req.headers['content-type']||'').startsWith('application/json'))throw new WrapperError('Use application/json.',415);
      authorize(req);rateLimit(req);
      const input=await body(req);
      if(!input || typeof input!=='object' || input.mode==='demo')throw new WrapperError('Use the illustrative browser sample for demo mode.');
      const result=path==='/api/interpret'?await interpret(input):await decide(input);
      json(res,200,result);return;
    }
    if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed.'});return;}
    const file=assets.get(path);if(!file){json(res,404,{error:'Not found.'});return;}
    let data;try{data=await readFile(new URL(file,publicDir));}catch{json(res,404,{error:'Not found.'});return;}
    res.writeHead(200,{...headers,'Content-Type':types[file.split('.').pop()]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch(error){json(res,error instanceof WrapperError?error.status:500,{error:error instanceof WrapperError?error.message:'An unexpected server error occurred.'});}
});
server.requestTimeout=60000;server.headersTimeout=10000;
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`JEV Wrapper ${VERSION} listening on ${port}${base}/; live=${liveAvailable}`));
