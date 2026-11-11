import http from 'node:http';
import { randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,existsSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { api } from '../shared/core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
mkdirSync(path.join(root,'data'),{recursive:true});
const sqlite=new DatabaseSync(path.join(root,'data','life-settings.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
// Local install only. Cloud schema is deployed through tracked Drizzle migrations.
sqlite.exec(`CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,host_hash TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,unlocked INTEGER NOT NULL DEFAULT 0,reveal INTEGER NOT NULL DEFAULT 0,finale INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,room TEXT NOT NULL REFERENCES rooms(id),token_hash TEXT NOT NULL,preset INTEGER NOT NULL,choices TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS participants_room_idx ON participants(room);`);
// Additive migration: retain all existing rooms and participant records.
for (const [table,column,definition] of [
 ['rooms','exp_phase','INTEGER NOT NULL DEFAULT 0'],
 ['rooms','predict_phase','INTEGER NOT NULL DEFAULT 0'],
 ['rooms','predict_actual','REAL NOT NULL DEFAULT -1'],
 ['participants','exp_label','INTEGER NOT NULL DEFAULT -1'],
 ['participants','ranking',"TEXT NOT NULL DEFAULT ''"],
 ['participants','prediction','INTEGER NOT NULL DEFAULT -1'],
 ['rooms','schema_version','INTEGER NOT NULL DEFAULT 1'],
 ['rooms','roster_locked','INTEGER NOT NULL DEFAULT 0'],
 ['rooms','lottery',"TEXT NOT NULL DEFAULT ''"],
 ['participants','nickname',"TEXT NOT NULL DEFAULT ''"],
 ['participants','confirmed','INTEGER NOT NULL DEFAULT 0']
]) if(!sqlite.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
for(const row of sqlite.prepare('SELECT id FROM participants WHERE exp_label=-1').all()) sqlite.prepare('UPDATE participants SET exp_label=? WHERE id=?').run(randomInt(2),row.id);
const db={prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
function origins(){try{const ips=[];for(const items of Object.values(os.networkInterfaces()))for(const i of items||[])if(i.family==='IPv4'&&!i.internal&&!i.address.startsWith('169.254.'))ips.push(`http://${i.address}:${port}`);return ips.sort((a,b)=>Number(b.includes('192.168.'))-Number(a.includes('192.168.')))}catch{return []}}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
 if(url.pathname==='/api/network'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({origins:[]}));}
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const part of req){body+=part;if(body.length>4096){res.writeHead(413);return res.end('Request too large')}}
  const result=await api(new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}: {})}),db);
  res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));
 }
 const pathname=url.pathname==='/'?'/life.html':url.pathname;
 const files=new Set(['/life.html','/life.js','/life.css','/fields.js','/qr.js','/favicon.svg','/QR-LICENSE.txt','/poster.js']);
 if(!files.has(pathname)){res.writeHead(404);return res.end('Not found');}
 const file=path.join(root,'public',pathname.slice(1));
 if(!existsSync(file)){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(readFileSync(file));
}catch(e){console.error(e);if(!res.headersSent)res.writeHead(500);res.end('Server error')}}).listen(port,host,()=>{
 console.log('\nLIFE SETTINGS — classroom server is ready\n');
 console.log(`Presenter: http://127.0.0.1:${port}/life.html?mode=host`);
 console.log('Health check: http://127.0.0.1:'+port+'/api/health');
 console.log('\nReady for the reverse proxy. Keep this process running during the test.\n');
});
