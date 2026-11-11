const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('fs'),assert=require('node:assert/strict');
const root=require('node:path').join(__dirname,'../public/');
const source=fs.readFileSync(root+'life.js','utf8');
const fields=fs.readFileSync(root+'fields.js','utf8');
const css=fs.readFileSync(root+'life.css','utf8');
const base={experiment:{phase:0,results:null},prediction:{phase:0,submitted:0,actual:null,bins:null},version:3,room:'123456',isHost:false,count:1,unlocked:0,reveal:false,finale:false,stats:[],summary:{changed:0,total:1,ratio:0,retained:0,pending:1},returns:[],lottery:{drawn:false,locked:false,winners:[]},roster:[],member:{id:'member',name:'Test',number:'001',preset:0,choices:{},confirmed:false,ranking:null,prediction:-1,expLabel:0}};
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
function make(mode='audience',unlocked=0,options={}){
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<style>'+css+'</style><div id="app"></div><div id="toast"></div>',{url:`http://localhost/life.html?mode=${mode}&room=123456`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;const state=structuredClone(base);state.unlocked=unlocked;state.isHost=mode==='host';state.stats=['interests','direction','emotions','responsibilities'].map(id=>({id,counts:Array(12).fill(0),submitted:0,changed:0,total:1}));Object.assign(state,options);
 w.scrollTo=()=>{};w.AbortSignal=AbortSignal;w.localStorage.setItem('life.member.123456','test');w.localStorage.setItem('life.host.123456','test');
 w.fetch=async(url,opts)=>{if(opts?.body){const b=JSON.parse(opts.body);if(url.endsWith('choice')){state.member.choices[b.field]=b.value;state.summary={...state.summary,changed:1,ratio:1};}if(url.endsWith('confirm'))state.member.confirmed=true;}return {ok:true,json:async()=>structuredClone(state)}};
 w.LifePoster={markup:()=>'<section id="posterBuilder">Poster builder</section>',bind:()=>{}};
 w.eval(fields);w.eval(source);return {dom,w,state,errors};
}
(async()=>{
 let t=make();await flush();assert.equal(t.w.document.querySelectorAll('[data-choice]').length,0);assert.equal(t.w.document.querySelectorAll('.journey-links a').length,4);assert.equal(t.w.document.querySelectorAll('.unlock-meter .active').length,0);t.dom.window.close();
 t=make('audience',15);await flush();let d=t.w.document;
 const option=d.querySelector('[data-choice=interests][data-value="3"]');option.focus();option.click();await flush();
 assert.deepEqual(t.state.member.choices.interests,[0,1,2,3]);
 assert.equal(d.activeElement.dataset.value,'3');assert.equal(d.activeElement.getAttribute('aria-pressed'),'true');
 assert.match(d.querySelector('.selectionstatus').textContent,/Saved automatically/);
 assert.equal(d.querySelectorAll('.unlock-meter .active').length,4);
 d.querySelector('#confirm').click();await flush();assert.equal(d.querySelector('#confirm').textContent,'Confirmed ✓');
 assert.equal(d.querySelectorAll('#mainContent').length,1);assert.equal(d.querySelectorAll('.checkmark:not([aria-hidden])').length,0);
 assert.deepEqual(t.errors,[]);t.dom.window.close();
 for(const mode of ['host','screen']){t=make(mode,15,{finale:true,reveal:true});await flush();assert.equal(t.w.document.querySelectorAll('#mainContent').length,1);assert.match(t.w.document.body.textContent,mode==='host'?/Give the choice back/:/Configured by/);assert.deepEqual(t.errors,[]);t.dom.window.close();}
 console.log('PASS: locked choices, four navigation targets, unlock indicators, autosave, focus retention, confirmation, host and projection rendering; no DOM runtime errors.');
})().catch(e=>{console.error(e);process.exit(1)});
