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

 const initial={
  'rs-module3-p35-q37':{answered:true,selected:'C',correct:null,starred:true},
  'rs-module3-p211-q18':{answered:true,selected:'A',correct:null},
  'rs-module3-p220-q15':{answered:true,selected:null,correct:null,revealed:true},
  'rs-module3-p19-q52':{answered:true,selected:'A',correct:null,starred:true},
  'rs-module3-p219-q12':{answered:true,selected:null,correct:null,revealed:true}
 };
 await page.addInitScript(({initial,user})=>{if(!localStorage.getItem('grading-fixture-seeded')){localStorage.setItem('grading-fixture-seeded','yes');localStorage.setItem('cb-bank-progress',JSON.stringify(initial));localStorage.setItem('cb-bank-progress:'+user.id,JSON.stringify(initial))}},{initial,user});
 await page.goto(process.env.MED25_BASE_URL||'http://127.0.0.1:4173');
 await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&window.med25GameRecordAttempt?.__xpReliable&&currentUser);
 const close=page.locator('#updateNoticeClose');if(await close.isVisible())await close.click();

 await page.waitForFunction(()=>document.querySelector('.gamePoints b')?.textContent==='8');
 assert.equal(profile.points,8);assert.equal(rows.size,2);
 assert(await page.evaluate(()=>saved['rs-module3-p35-q37'].correct===true&&saved['rs-module3-p211-q18'].correct===false));
 assert(await page.evaluate(()=>saved['rs-module3-p19-q52'].answered===false&&saved['rs-module3-p19-q52'].starred&&saved['rs-module3-p19-q52'].previous_review_attempt.selected==='A'));
 assert(![...rows.values()].some(r=>['rs-module3-p220-q15','rs-module3-p19-q52','rs-module3-p219-q12'].includes(r.question_id)));
 // A reconstructed question permits a new graded attempt; a reveal is never turned into XP.
 await page.evaluate(()=>{hubGo('questions');const q=QUESTIONS.find(q=>q.id==='rs-module3-p19-q52');state.filter='all';document.getElementById('search').value=q.stem;state.page=1;render()});
 const card=page.locator('#rs-module3-p19-q52');await card.scrollIntoViewIfNeeded();
 assert((await card.locator('.pastAnswerReview summary').innerText()).includes('Adapted for study'));
 const key=await page.evaluate(()=>QUESTIONS.find(q=>q.id==='rs-module3-p19-q52').answer);
 await card.locator('[data-opt="'+key+'"]').click();
 await page.waitForFunction(()=>document.querySelector('.gamePoints b')?.textContent==='15');assert.equal(profile.points,15);
 await card.locator('.pastAnswerReview summary').click();assert(await card.locator('.answerReferences a').isVisible());
 assert((await card.locator('.feedback').innerText()).includes('Slide-checked answer'));
 // Ungraded source still earns no points even if its options are selected.
 const unknown=await page.evaluate(()=>QUESTIONS.find(q=>q.proofreading_status==='needs_review'&&Object.keys(q.options||{}).length));
 await page.evaluate(q=>answer(q.id,Object.keys(q.options)[0]),unknown);assert.equal(profile.points,15);
 await page.reload();await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&currentUser);
assert.equal(profile.points,15);assert.equal(rows.size,3);assert.deepEqual(errors,[]);
 console.log('PASS lecture grading: saved correct +7 / wrong +1, reveals and unresolved excluded, reconstructed question fresh +7, references shown, reload deduplication; fixture-only writes');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
