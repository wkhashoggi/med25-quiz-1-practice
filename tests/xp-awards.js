const {chromium}=require('playwright'),assert=require('assert/strict');
const user={id:'00000000-0000-4000-8000-000000000007',email:'xp-fixture@example.com'};
const session={user,access_token:'fixture',refresh_token:'fixture'};
const profile={user_id:user.id,username:'XPFixture',points:0,weekly_xp:0,monthly_xp:0,correct_first_attempts:0,wrong_first_attempts:0,current_streak:0,best_streak:0};
const rows=new Map();let fail=false,postCount=0;
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>localStorage.setItem('med25-auth-session',JSON.stringify(s)),session);
 await page.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url());let body=[],status=200;
  if(u.pathname==='/auth/v1/user')body=user;
  else if(u.pathname.includes('/auth/v1/token'))body=session;
  else if(u.pathname.endsWith('/game_profiles'))body=[profile];
  else if(u.pathname.endsWith('/game_attempts')){
   if(req.method()==='POST'){
    postCount++;
    if(fail){status=503;body={message:'Fixture temporary failure'}}else{
     for(const row of [].concat(req.postDataJSON())){
      const key=row.user_id+':'+row.source+':'+row.question_id;
      if(!rows.has(key)){const delta=row.correct?(row.source==='past'?7:5):1;rows.set(key,{...row,points_delta:delta});profile.points+=delta;profile.weekly_xp+=delta;profile.monthly_xp+=delta;profile[row.correct?'correct_first_attempts':'wrong_first_attempts']++;
       // Reproduce production: INSERT RETURNING still sees the default zero before the AFTER trigger's UPDATE.
       body.push({...row,points_delta:0});}
     }
    }
   }else{const key=[u.searchParams.get('user_id'),u.searchParams.get('source'),u.searchParams.get('question_id')].map(x=>x?.replace(/^eq\./,'')).join(':');body=rows.has(key)?[rows.get(key)]:[];}
  }else if(req.method()!=='GET')body={};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(process.env.MED25_BASE_URL||'http://127.0.0.1:4173');
 await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&window.med25GameRecordAttempt?.__xpReliable);
 const close=page.locator('#updateNoticeClose');await close.waitFor({state:'visible'});await close.click();
 await page.waitForFunction(()=>document.querySelector('.gamePoints b'));
 const past=await page.evaluate(()=>QUESTIONS.find(q=>window.med25ExamReadyPast(q)));
 await page.evaluate(q=>{hubGo('questions');document.getElementById('search').value=q.stem;state.page=1;render()},past);
 await page.locator('#'+past.id+' [data-opt="'+past.answer+'"]').click();
 await page.waitForFunction(()=>document.getElementById('gameScoreToast')?.textContent==='+7 XP');
 await page.waitForFunction(()=>document.querySelector('.gamePoints b')?.textContent==='7');
 await page.evaluate(()=>document.getElementById('tabAI').click());
 const ai=await page.evaluate(()=>window.med25GameBridge.aiQuestions().find(q=>document.querySelector('[data-ai-answer="'+q.id+'"]')));
 assert(ai);await page.locator('[data-ai-answer="'+ai.id+'"][data-ai-opt="'+ai.answer+'"]').click();
 await page.waitForFunction(()=>document.getElementById('gameScoreToast')?.textContent==='+5 XP');
 await page.waitForFunction(()=>document.querySelector('.gamePoints b')?.textContent==='12');
 await page.evaluate(q=>window.med25GameRecordAttempt('ai',q.id,true),ai);assert.equal(profile.points,12);
 fail=true;
 const next=await page.evaluate(id=>QUESTIONS.find(q=>q.id!==id&&window.med25ExamReadyPast(q)),past.id);
 await page.evaluate(q=>answer(q.id,q.answer),next);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('med25-pending-xp-v4')||'[]').length===1);
 await page.evaluate(()=>{const k='med25-pending-xp-v4',p=JSON.parse(localStorage.getItem(k));p[0].addedAt=Date.now()-86400000;localStorage.setItem(k,JSON.stringify(p))});
 await page.evaluate(()=>window.med25RetryPendingXP());
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('med25-pending-xp-v4')).length),1);
 const before=postCount;
 await page.evaluate(()=>{currentUser={id:'00000000-0000-4000-8000-000000000099'};return window.med25RetryPendingXP()});assert.equal(postCount,before);
 fail=false;await page.evaluate(u=>{currentUser=u;return window.med25RetryPendingXP()},user);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('med25-pending-xp-v4')||'[]').length===0);
 assert.equal(profile.points,19);assert.equal(rows.size,3);assert.deepEqual(errors,[]);
 console.log('PASS past +7 / AI +5 from committed awards, duplicate protection, durable failure retry, account isolation; no live data writes');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
