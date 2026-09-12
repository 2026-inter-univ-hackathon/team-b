// node tests/pwa.cjs — 依存なしのService Worker/PWA登録テスト
const {readFileSync,existsSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const manifest=JSON.parse(readFileSync('manifest.webmanifest'));
assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons){
 const png=readFileSync(icon.src);const size=Number(icon.sizes.split('x')[0]);
 assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
}
async function serviceWorker(){
 const handlers={}, stores=new Map(),scope='https://example.test/project/';
 const old='zekki-shell:'+scope+':v0', other='another-app';
 stores.set(old,new Map());stores.set(other,new Map());
 let networkCalls=0,failInstall=false;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {
 async addAll(requests){if(failInstall)throw Error('offline');for(const r of requests){assert(existsSync(new URL(r.url).pathname.replace('/project/','')));data.set(r.url,new Response(r.url));}},
 async match(key){return data.get(key)?.clone();}}},async keys(){return [...stores.keys()]},async delete(key){return stores.delete(key)}};
 const context={URL,Request,Response,caches,fetch:async(r,opts)=>{networkCalls++;return new Response(opts?.cache||'network')},self:{registration:{scope},addEventListener(n,f){handlers[n]=f}}};
 vm.runInNewContext(readFileSync('sw.js','utf8'),context);
 let pending;handlers.install({waitUntil(p){pending=p}});await pending;
 const current=[...stores.keys()].find(k=>k.endsWith(':v1'));
 assert(![...stores.get(current).keys()].some(k=>k.includes('config.js')||k.includes('odpt.org')));
 handlers.activate({waitUntil(p){pending=p}});await pending;
 assert(!stores.has(old));assert(stores.has(other));
 async function request(url,mode='cors',method='GET'){let response;handlers.fetch({request:{url,mode,method},respondWith(p){response=p}});return response===undefined?null:await response;}
 assert((await (await request(scope,'navigate')).text()).endsWith('index.html'));
 assert((await (await request(scope+'index.html?launch=1','navigate')).text()).endsWith('index.html'));
 assert((await (await request(scope+'js/main.js')).text()).endsWith('js/main.js'));
 assert.equal(networkCalls,0);
 assert.equal(await request('https://api.odpt.org/api/v4/test?acl:consumerKey=redacted'),null);
 assert.equal(await request(scope+'private.json'),null);
 assert.equal(await request(scope+'js/main.js?token=x'),null);
 assert.equal(await request(scope+'index.html','navigate','POST'),null);
 assert.equal(await (await request(scope+'js/config.js')).text(),'no-store');
 failInstall=true;handlers.install({waitUntil(p){pending=p}});await assert.rejects(pending);
 assert(stores.get(current).has(scope+'index.html'));
}
async function registration(protocol,secure,fail=false){
 const events={},elements={},listeners={};let calls=0;
 const el=()=>({hidden:true,textContent:'',addEventListener(n,f){this[n]=f}});
 const worker={state:'installing',addEventListener(n,f){listeners[n]=f}};
 const reg={installing:worker,active:null,waiting:null,addEventListener(){}};
 const ctx={location:{protocol},document:{querySelector(s){return elements[s]??=el()}},window:{isSecureContext:secure,matchMedia(){return {matches:false}},addEventListener(n,f){events[n]=f}},navigator:{onLine:true,serviceWorker:{async register(path,opts){calls++;assert.equal(path,'./sw.js');assert.equal(opts.updateViaCache,'none');if(fail)throw Error('fail');return reg}}}};
 vm.runInNewContext(readFileSync('js/pwa.js','utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));
 if(protocol==='file:'||!secure){assert.equal(calls,0);assert.equal(elements['#pwa-info'].hidden,true);return;}
 assert.equal(calls,1);
 if(fail){assert.match(elements['#pwa-status'].textContent,/できませんでした/);return;}
 worker.state='activated';listeners.statechange();assert.match(elements['#pwa-status'].textContent,/準備ができました/);
 reg.active={};worker.state='installed';listeners.statechange();assert.match(elements['#pwa-status'].textContent,/すべて閉じる/);
 let prompted=false;events.beforeinstallprompt({preventDefault(){},async prompt(){prompted=true}});assert.equal(elements['#btn-install'].hidden,false);
 await elements['#btn-install'].click();assert(prompted);assert.equal(elements['#btn-install'].hidden,true);
 ctx.navigator.onLine=false;events.offline();assert.equal(elements['#network-status'].hidden,false);
 ctx.navigator.onLine=true;events.online();assert.equal(elements['#network-status'].hidden,true);
}
(async()=>{await serviceWorker();await registration('file:',true);await registration('http:',false);await registration('https:',true);await registration('http:',true);await registration('https:',true,true);console.log('PASS: manifest/PNG, scoped cache, offline shell, exclusions, update/install failure, protocol guards, install UI, network UI');})().catch(e=>{console.error(e);process.exitCode=1});
