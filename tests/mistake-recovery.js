const {chromium}=require('playwright'),assert=require('assert/strict');
const user={id:'00000000-0000-4000-8000-000000000007',email:'recovery-fixture@example.com'},session={user,access_token:'fixture',refresh_token:'fixture'};
const profile={user_id:user.id,username:'RecoveryFixture',points:0},events=new Map();let cloud={},fail=false;
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(s=>{localStorage.setItem('med25-auth-session',JSON.stringify(s));localStorage.setItem('med25-update-notice-2026-09-26-cleanup-v1','dismissed')},session);
 await context.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url());let body=[],status=200;
  if(u.pathname==='/auth/v1/user')body=user;
  else if(u.pathname.includes('/auth/v1/token'))body=session;
  else if(u.pathname.endsWith('/game_profiles'))body=[profile];
  else if(u.pathname.endsWith('/student_progress')){if(req.method()==='POST'){cloud=req.postDataJSON().progress;body={}}else body=[{progress:cloud}];}
  else if(u.pathname.endsWith('/game_xp_events')){
   if(req.method()==='POST'){if(fail){status=503;body={message:'Temporary outage'}}else{const row=req.postDataJSON();if(!events.has(row.event_key)){events.set(row.event_key,row);profile.points+=row.xp;body=[row]}}}
   else body=[...events.values()];
  }else if(req.method()!=='GET'&&!u.pathname.endsWith('/game_attempts'))body={};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 let page=await context.newPage();const base=process.env.MED25_BASE_URL||'http://127.0.0.1:4173';
 const ready=async()=>{await page.goto(base);await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&typeof window.med25GameOpenQuiz==='function'&&currentUser);};
 await ready();
 const items=await page.evaluate(()=>{const p=QUESTIONS.find(q=>window.med25ExamReadyPast(q)),a=window.med25GameBridge.aiQuestions()[0];saved[p.id]={answered:true,correct:false,selected:p.answer==='A'?'B':'A'};window.med25GameBridge.aiProgress()[a.id]={answered:true,correct:false,selected:a.answer==='A'?'B':'A'};save();return {p,a}});
 await page.evaluate(()=>window.med25GameOpenQuiz());
 await page.locator('[data-quiz-opt="'+items.p.answer+'"]').click();
 await page.waitForFunction(()=>document.getElementById('gameScoreToast')?.textContent==='+8 XP');
 await page.waitForFunction(id=>saved.__quiz_retries__?.['past:'+id]?.xp_synced_user,items.p.id);
 // Close the page before pressing Next: the recovered question must stay gone.
 await page.close();page=await context.newPage();await ready();await page.evaluate(()=>window.med25GameOpenQuiz());
 assert.equal(await page.locator('#quizStage h3').textContent(),items.a.stem);assert.equal(profile.points,8);
 // Restore old lost recovery history from the server ledger, without paying twice.
 await page.evaluate(()=>{delete saved.__quiz_retries__;save()});cloud.__quiz_retries__={};
 await page.reload();await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.());
 await page.waitForFunction(id=>saved.__quiz_retries__?.['past:'+id]?.recovered,items.p.id);
 await page.evaluate(()=>window.med25GameOpenQuiz());assert.equal(await page.locator('#quizStage h3').textContent(),items.a.stem);
 fail=true;await page.locator('[data-quiz-opt="'+items.a.answer+'"]').click();
 await page.waitForFunction(id=>saved.__quiz_retries__?.['ai:'+id]?.recovered,items.a.id);
 await page.close();fail=false;page=await context.newPage();await ready();
 await page.waitForFunction(()=>document.querySelector('.gamePoints b')?.textContent==='16');
 await page.evaluate(()=>window.med25GameOpenQuiz());assert.equal(await page.locator('#quizStage h3').textContent(),'Mistake quiz complete');assert.equal(events.size,2);assert.equal(profile.points,16);
 const merged=await page.evaluate(()=>mergeStudyProgress({__quiz_retries__:{x:{recovered:false,last_at:'2026-10-06',attempts:2}}},{__quiz_retries__:{x:{recovered:true,last_at:'2026-10-05',attempts:1}}}));assert(merged.__quiz_retries__.x.recovered);
 console.log('PASS close/reopen recovery, restoration from XP ledger, +8 XP per recovery, retry after outage, duplicate protection, cross-device merge');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
