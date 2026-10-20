const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'legacy-app.html'),'utf8');
const past=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const ai=JSON.parse(fs.readFileSync(path.join(root,'ai_questions.json'))).lecture_sets.filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').flatMap(s=>s.questions);
const stat=(id,correct,n)=>({question_id:id,correct_count:correct,wrong_count:n-correct,response_count:n,success_rate:100*correct/n});
const rows=[...Array.from({length:497},(_,i)=>stat('unused-'+i,1,2)),...past.slice(0,3).map((q,i)=>stat(q.id,[2,8,90][i],[10,10,100][i])),...ai.slice(0,3).map((q,i)=>stat(q.id,[2,8,90][i],[10,10,100][i]))];
let refreshed=false,offsets=[];
(async()=>{
 const server=http.createServer((req,res)=>{const name=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);const file=name===root?path.join(root,'index.html'):name;if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(e,d)=>{if(e){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(d)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390]){
  refreshed=false;offsets=[];const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**.supabase.co/**',async route=>{
   const u=new URL(route.request().url());let body=[];
   if(u.pathname.endsWith('/question_success_stats')){const offset=Number(u.searchParams.get('offset')||0);offsets.push(offset);const data=rows.map(r=>refreshed&&r.question_id===past[0].id?stat(r.question_id,10,10):r);body=data.slice(offset,offset+Number(u.searchParams.get('limit')||500))}
   else if(route.request().method()!=='GET')body={};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base);await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&window.med25SortByLiveSuccess);
  await page.waitForFunction(id=>document.querySelector('#'+CSS.escape(id)+' .liveSuccessCounts')||document.querySelector('#aiLiveSort'),past[0].id);
  await page.evaluate(()=>window.hubGo('questions'));await page.waitForTimeout(500);
  if(await page.locator('#updateNoticeClose').isVisible())await page.locator('#updateNoticeClose').click();
  const filters=async kind=>{const id=kind==='past'?'#pastGuideStatus':'#aiGuideStatus';if(!await page.locator(id).isVisible())await page.locator('[data-mobile-filter-toggle="'+kind+'"]').click()};
  await filters('past');await page.locator('#sort').selectOption('live-hardest');
  assert.deepEqual(await page.locator('#list .qcard').evaluateAll(cs=>cs.slice(0,3).map(c=>c.id)),past.slice(0,3).map(q=>q.id));
  await page.locator('#sort').selectOption('live-easiest');
  assert.deepEqual(await page.locator('#list .qcard').evaluateAll(cs=>cs.slice(0,3).map(c=>c.id)),past.slice(0,3).reverse().map(q=>q.id));
  assert(offsets.includes(500),'Fetch all response pages, including beyond the default API limit');
  // Automatic refresh updates rates without silently reordering active practice.
  refreshed=true;await page.evaluate(()=>window.loadQuestionSuccessStats(true));
  assert.equal(await page.locator('#list .qcard').first().getAttribute('id'),past[2].id);
  await page.locator('[data-live-refresh="past"]').click();
  await page.waitForFunction(id=>document.querySelector('#list .qcard')?.id===id,past[0].id);
  await page.locator('#sort').selectOption('');await page.locator('#pastGuideStatus').selectOption('unanswered');
  if(width<600)await page.locator('[data-mobile-filter-toggle="past"]').click();
  await checkStable(page,'past');
  await page.locator(width<600?'[data-responsive-page="next"]':'[data-page="next"]').first().click();await page.locator(width<600?'[data-responsive-page="prev"]':'[data-page="prev"]').first().click();
  assert.equal(await page.locator('#'+CSSescape(page.answeredPast)).count(),0,'Answered item leaves Unanswered after changing page');
  await page.evaluate(()=>window.hubGo('ai'));await filters('ai');
  await page.locator('#aiLiveSort').selectOption('live-hardest');
  assert.deepEqual(await page.locator('#aiQuestionList .aiCard').evaluateAll(cs=>cs.slice(0,3).map(c=>c.id)),ai.slice(0,3).map(q=>q.id));
  await page.locator('#aiLiveSort').selectOption('live-easiest');
  assert.deepEqual(await page.locator('#aiQuestionList .aiCard').evaluateAll(cs=>cs.slice(0,3).map(c=>c.id)),ai.slice(0,3).reverse().map(q=>q.id));
  await page.locator('#aiLiveSort').selectOption('');await page.locator('#aiGuideStatus').selectOption('unanswered');
  if(width<600)await page.locator('[data-mobile-filter-toggle="ai"]').click();
  await checkStable(page,'ai');
  await page.evaluate(()=>window.hubGo('home'));await page.evaluate(()=>window.hubGo('ai'));
  assert.equal(await page.locator('#'+CSSescape(page.answeredAI)).count(),0,'Leaving the view clears temporary pins');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+'px: both live sorting directions, 503 statistics rows, explicit refresh, stable past/AI unanswered cards and viewport, navigation cleanup');
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
function CSSescape(s){return s.replace(/[^a-zA-Z0-9_-]/g,'\\$&')}
async function checkStable(page,kind){
 const host=kind==='past'?'#list':'#aiQuestionList',cards=page.locator(host+' > .qcard'),target=cards.nth(5),id=await target.getAttribute('id');
 await page.evaluate(({host,id})=>{window.__neighbor=document.querySelector(host+' > .qcard');document.getElementById(id).scrollIntoView({block:'start',behavior:'instant'});window.scrollBy({top:-230,behavior:'instant'})}, {host,id});
 await target.locator('.option').first().scrollIntoViewIfNeeded();await page.waitForTimeout(500);await target.locator('.option').first().scrollIntoViewIfNeeded();
 const before=await page.evaluate(id=>({y:scrollY,top:document.getElementById(id).getBoundingClientRect().top}),id);
 await target.locator('.option').first().click();await page.waitForTimeout(300);
 assert.equal(await target.getAttribute('id'),id,'Card stays in the same position');
 assert(await page.evaluate(()=>window.__neighbor.isConnected),'Do not rebuild neighboring cards on answer');
 const after=await page.evaluate(id=>({y:scrollY,top:document.getElementById(id).getBoundingClientRect().top,feedback:!!document.getElementById(id).querySelector('.feedback.show')}),id);
 assert(after.feedback);assert(Math.abs(after.y-before.y)<5,JSON.stringify({kind,before,after}));assert(Math.abs(after.top-before.top)<5);
 if(kind==='past'){
  page.answeredPast=id;const reveal=cards.nth(6),rid=await reveal.getAttribute('id');await reveal.locator('[data-reveal]').click();assert.equal(await cards.nth(6).getAttribute('id'),rid);assert(await reveal.locator('.feedback.show').count());
 }else page.answeredAI=id;
}
