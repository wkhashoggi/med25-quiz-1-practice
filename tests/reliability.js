const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=process.env.MED25_SITE_ROOT?path.resolve(process.env.MED25_SITE_ROOT):path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const expectedAI=read('ai_questions.json').lecture_sets.filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').flatMap(s=>s.questions);
const map=read('question-study-guide-map.json');
const user={id:'00000000-0000-4000-8000-000000000001',email:'qa@example.com'};
const token={user,access_token:'fixture-access-token',refresh_token:'fixture-refresh-token'};
const getPeriod=(period)=>{
  const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Riyadh'}));
  if(period==='month')return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01';
  d.setDate(d.getDate()-(d.getDay()+6)%7);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const leaders=Array.from({length:503},(_,i)=>({username:'Student'+String(i).padStart(3,'0'),avatar_url:null,points:1000-i,weekly_xp:i===502?999:i,monthly_xp:i===501?999:i,current_streak:1,best_streak:1,week_start:getPeriod('week'),month_start:getPeriod('month')}));
leaders[0].weekly_xp=9999;leaders[0].week_start='2000-01-03';leaders[0].monthly_xp=9999;leaders[0].month_start='2000-01-01';
const profile={user_id:user.id,username:'Student000',leaderboard_visible:true,points:1000,weekly_xp:0,monthly_xp:0,current_streak:1,best_streak:1};
let cloud={};let failLeaderboard=false;const requests=[],attempts=new Set(),leaderOffsets=[];
async function fixture(route){
  const req=route.request(),u=new URL(req.url()),method=req.method();requests.push({path:u.pathname,method,body:method==='GET'?null:req.postDataJSON()});
  let body=[];let status=200;
  if(u.pathname.includes('/auth/v1/token'))body=token;
  else if(u.pathname.includes('/auth/v1/logout'))body={};
  else if(u.pathname.endsWith('/admin-analytics'))body={ok:true,analytics:{past_questions_answered:12,ai_questions_answered:8,lecture_study_actions:3,section_usage:[{section:'flashcards',views:5},{section:'questions',views:12},{section:'mock',views:4}],daily:[{date:'2026-10-13',visitors:2,sessions:3,answers:20,flashcards:5,lecture_actions:3}],flashcard_reviews:5,flashcard_ratings:[{rating:'good',reviews:5}]}};
  else if(u.pathname.endsWith('/leaderboard_entries')){
    if(failLeaderboard){status=503;body={message:'Fixture outage'}}else{const offset=Number(u.searchParams.get('offset')||0);leaderOffsets.push(offset);body=leaders.slice(offset,offset+500)}
  }else if(u.pathname.endsWith('/game_profiles')){
    if(method==='PATCH')Object.assign(profile,req.postDataJSON());body=[profile];
  }else if(u.pathname.endsWith('/student_progress')){
    if(method==='POST'){cloud=req.postDataJSON().progress;body={}}else body=Object.keys(cloud).length?[{progress:cloud}]:[];
  }else if(u.pathname.endsWith('/game_attempts')&&method==='POST'){
    const rows=[].concat(req.postDataJSON());body=[];
    for(const row of rows){const key=row.source+':'+row.question_id;if(!attempts.has(key)){attempts.add(key);body.push(row)}}
  }else if(method!=='GET')body={};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
}
async function waitReady(page){
  await page.waitForFunction(n=>window.med25GameBridge?.aiQuestions?.().length===n,expectedAI.length,{timeout:15000});
  const close=page.locator('#updateNoticeClose');if(await close.isVisible().catch(()=>false))await close.click();
  await page.waitForSelector('#v2Footer');
}
async function openAI(page,lid){
  await page.locator('#tabAI').click();
  if(!await page.locator('#aiGuideClear').isVisible())await page.locator('[data-mobile-filter-toggle="ai"]').click();
  await page.locator('#aiGuideClear').click();
  const q=expectedAI.find(q=>map.ai[q.id].lecture_id===lid),subject=map.ai[q.id].subject;
  await page.locator('#aiGuideSubject').selectOption({label:subject});
  await page.locator('#aiGuideLectureBtn').click();
  await page.locator('#aiGuideLecturePanel input[value="'+lid+'"]').check();
  await page.locator('#aiGuideLectureBtn').click();
  await page.waitForSelector('#aiQuestionList .aiCard');
}
async function run(){
  const server=http.createServer((req,res)=>{
    const filename=path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html');
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
    fs.readFile(filename,(err,data)=>{if(err){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)]||'application/octet-stream');res.end(data)});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  const launch={headless:true};if(process.env.MED25_CHROMIUM_PATH){launch.executablePath=process.env.MED25_CHROMIUM_PATH;launch.args=['--no-sandbox','--no-zygote','--single-process']}
  const browser=await chromium.launch(launch);const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();const errors=[];
  page.setDefaultTimeout(8000);
  const assetRequests=[];page.on('request',r=>assetRequests.push(r.url()));
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('https://**.supabase.co/**',fixture);
  try{
    await context.addInitScript(()=>{if(!localStorage.getItem('med25-main-section-v1'))localStorage.setItem('med25-main-section-v1','flashcards')});
    await page.goto(base);await waitReady(page);
    assert.equal(await page.locator('#tabFlashcards,#flashcardsSection,[data-v2-mobile="flash"]').count(),0);
    assert(!/flashcard|spaced.repetition|\bAnki\b/i.test(await page.locator('body').innerText()));
    assert(await page.locator('#homeSection').isVisible());
    assert(await page.evaluate(()=>typeof window.med25Anki==='undefined'&&typeof initFlashcards==='undefined'));

    assert.equal(await page.evaluate(()=>window.med25GameBridge.aiQuestions().length),expectedAI.length);
    assert(await page.evaluate(()=>window.med25GameBridge.aiQuestions().every(q=>window.med25GameBridge.questionLecture('ai',q).lecture_id)));
    assert.equal(await page.evaluate(()=>QUESTIONS.filter(window.med25ExamReadyPast).length),1072);
    console.log('PASS effective content counts, mappings, and mock eligibility');

    // Revision flows preserve first attempts while tracking fresh practice separately.
    await page.waitForSelector('#openQuiz2');
    await page.locator('#openQuiz2').click();
    await page.waitForSelector('#revisionDialog[open]');
    assert(await page.evaluate(()=>window.med25Revision.pool().every(x=>Number(x.g.quiz)===2)));
    await page.locator('#revisionCount').fill('1.5');await page.locator('#revisionStart').click();
    assert((await page.locator('#revisionMessage').innerText()).includes('whole number'));
    const thoracic='anatomy-histology__anatomy-of-thoracic-wall';
    await page.locator('#revisionLecture').selectOption(thoracic);
    await page.locator('#revisionCount').fill('1');
    const originalProgress=await page.evaluate(()=>JSON.stringify(saved));
    await page.locator('#revisionStart').click();
    assert.equal(await page.locator('.revisionExplanation').count(),0);
    await page.locator('[data-revision-answer]').first().click();
    assert.equal(await page.locator('[data-revision-answer]:disabled').count(),4);
    assert.equal(await page.locator('.revisionExplanation dd').count(),4);
    assert(await page.evaluate(old=>{const now=JSON.parse(JSON.stringify(saved));delete now.__revision_practice__;return JSON.stringify(now)===old},originalProgress));
    await page.locator('#revisionReport').click();await page.locator('#reportDetails').fill('Please check this wording.');
    const reportURL=await page.locator('#reportWhatsApp').getAttribute('href');
    assert(decodeURIComponent(reportURL).includes('Please check this wording.'));
    assert(decodeURIComponent(reportURL).includes('Question ID: ai:'));
    await page.locator('#reportClose').click();await page.locator('#revisionClose').click();
    await page.reload();await waitReady(page);await page.waitForSelector('#openRevision');
    assert(await page.evaluate(()=>Object.keys(saved.__revision_practice__||{}).length===1));
    await page.locator('#openRevision').click();await page.locator('#revisionResume').click();
    assert.equal(await page.locator('[data-revision-answer]:disabled').count(),4);
    await page.locator('#revisionNext').click();await page.getByText('Practice complete',{exact:true}).waitFor();
    await page.locator('#revisionClose').click();await page.locator('#clearRevisionScope').click();
    await page.evaluate(()=>{const x=window.med25Revision.all().find(x=>x.source==='ai'&&x.g.lecture_id==='anatomy-histology__anatomy-of-thoracic-wall');window.__revisionTestQ=x.q.id;delete saved.__revision_practice__;saved.__ai_questions__[x.q.id]={answered:true,correct:false,selected:'Z'};save()});
    await page.locator('#openMistakes').click();await page.locator('#revisionLecture').selectOption(thoracic);
    assert((await page.locator('#revisionAvailable').innerText()).startsWith('1 '));
    await page.locator('#revisionStart').click();
    const correctKey=await page.evaluate(()=>window.med25GameBridge.aiQuestions().find(q=>q.id===window.__revisionTestQ).answer);
    await page.locator('[data-revision-answer="'+correctKey+'"]').click();
    await page.locator('#revisionNext').click();await page.locator('#revisionAgain').click();
    assert((await page.locator('#revisionAvailable').innerText()).startsWith('0 '));
    await page.locator('#revisionClose').click();
    await page.evaluate(()=>{delete saved.__ai_questions__[window.__revisionTestQ];delete saved.__revision_practice__;save()});
    await page.locator('#tabHome').click();
    console.log('PASS Quiz 2 scope, revision validation, answer concealment, explanations, reports, resume, and mistake recovery');

    // Exercise the paginated cohort, period boundaries, top ten, expand/collapse, and recoverable outage.
    await page.waitForFunction(()=>document.querySelector('#gameLeaderboardMeta').textContent.startsWith('503'));
    assert(leaderOffsets.includes(500));
    await page.locator('[data-xp-board="weekly"]').click();
    assert((await page.locator('.gameLeaderboardRow').first().innerText()).includes('Student502'));
    assert.equal(await page.locator('.gameLeaderboardRow').count(),10);
    await page.locator('#gameLeaderboardExpand').click();assert.equal(await page.locator('.gameLeaderboardRow').count(),503);
    await page.locator('#gameLeaderboardExpand').click();assert.equal(await page.locator('.gameLeaderboardRow').count(),10);
    await page.locator('[data-xp-board="monthly"]').click();assert((await page.locator('.gameLeaderboardRow').first().innerText()).includes('Student501'));
    await page.locator('[data-xp-board="all"]').click();assert((await page.locator('.gameLeaderboardRow').first().innerText()).includes('Student000'));
    failLeaderboard=true;await page.locator('#gameLeaderboardRefresh').click();await page.getByText('Leaderboard is temporarily unavailable.').waitFor();
    failLeaderboard=false;await page.locator('#gameLeaderboardRefresh').click();await page.waitForFunction(()=>document.querySelectorAll('.gameLeaderboardRow').length===10);
    console.log('PASS 503-account leaderboard, weekly/monthly boundaries, and outage recovery');

    // Past-paper ordering and locking are checked against the actual rendered IDs and persisted first attempt.
    await page.locator('#tabQuestions').click();if(!await page.locator('#pastGuideClear').isVisible())await page.locator('[data-mobile-filter-toggle="past"]').click();await page.locator('#pastGuideClear').click();await page.locator('#sort').selectOption('repeated');
    const ordered=await page.evaluate(()=>({visible:[...document.querySelectorAll('#list .qcard')].map(x=>x.id),expected:repeatedSortOrder(QUESTIONS).slice(0,state.pageSize).map(q=>q.id)}));assert.deepEqual(ordered.visible,ordered.expected);
    const past=await page.evaluate(()=>QUESTIONS.find(q=>window.med25ExamReadyPast(q)&&!saved[q.id]?.answered));
    await page.locator('#search').fill(past.stem.slice(0,50));await page.locator('#'+past.id+' [data-opt="'+past.answer+'"]').click();
    assert.equal(await page.locator('#'+past.id+' .option:disabled').count(),Object.keys(past.options).length);
    const savedPast=await page.evaluate(id=>saved[id],past.id);
    await page.evaluate(({id,answer:opt})=>answer(id,opt==='A'?'B':'A'),past);
    assert.deepEqual(await page.evaluate(id=>saved[id],past.id),savedPast);
    await page.reload();await waitReady(page);assert.deepEqual(await page.evaluate(id=>saved[id],past.id),savedPast);
    console.log('PASS high-yield repeated order and first-attempt past-paper lock across reload');

    // Finish a lecture through the actual question UI and independently toggle the manual studied check.
    const lid='pharmacology__treatment-of-hematological-malignancy',qs=expectedAI.filter(q=>map.ai[q.id].lecture_id===lid);
    await openAI(page,lid);
    for(const q of qs){
      await page.locator('#'+q.id+' [data-ai-opt="'+q.answer+'"]').click();
      assert.equal(await page.locator('#'+q.id+' .aiOption:disabled').count(),4);
    }
    const first=qs[0],before=await page.evaluate(id=>window.med25GameBridge.aiProgress()[id],first.id);
    await page.locator('#'+first.id+' .aiOption').first().evaluate(el=>el.onclick());
    assert.deepEqual(await page.evaluate(id=>window.med25GameBridge.aiProgress()[id],first.id),before);
    await page.reload();await waitReady(page);assert.deepEqual(await page.evaluate(id=>window.med25GameBridge.aiProgress()[id],first.id),before);
    await page.locator('#tabProgress').click();await page.locator('#lectureDashSearch').fill('hematological malignancy');
    const row=page.locator('.lectureDashRow').filter({has:page.locator('[data-lecture-study="'+lid+'"]')});
    assert.equal(await row.locator('.lectureAutoCheck.checked').count(),1);assert.equal(await row.locator('.lectureStatus.questions-complete').count(),1);
    await row.locator('[data-lecture-study]').click();assert.equal(await row.locator('.lectureStatus.complete').count(),1);
    await row.locator('[data-lecture-study]').click();assert.equal(await row.locator('.lectureStatus.questions-complete').count(),1);
    await page.locator('#lectureSourceAudit').evaluate(el=>el.open=true);assert((await page.locator('#lectureSourceAudit').innerText()).includes(read('source-coverage-audit.json').lectures.filter(l=>l.ai_questions===0).length+' topics still need a source'));
    console.log('PASS AI locking, lecture automatic/manual completion, and honest coverage gaps');

    // Invalid numeric inputs must stay editable and block Start. Valid exact mixes survive reload without leaking answers.
    await page.locator('#tabMock').click();await page.locator('#mockClearCounts').click();
    const mixed=page.locator('[data-mock-subject-count="Pharmacology"]');await mixed.fill('1.5');assert(await page.locator('#mockStartBtn').isDisabled());
    await mixed.fill('-1');assert(await page.locator('#mockStartBtn').isDisabled());await mixed.fill('2');
    const minutes=page.locator('#mockMinutes');await minutes.fill('241');assert(await page.locator('#mockStartBtn').isDisabled());
    await minutes.fill('12');assert.equal(await minutes.inputValue(),'12');
    const detail=page.locator('.mockSubjectCard').filter({has:mixed}).locator('details');await detail.locator('summary').click();
    await page.locator('[data-mock-lecture-count="'+lid+'"]').fill('1');assert.equal(await page.locator('#mockRequested').innerText(),'3');
    const xpBefore=await page.evaluate(()=>localStorage.getItem('med25-pending-xp-v3'));
    await page.locator('#mockStartBtn').click();await page.locator('.mockExamShell').waitFor();
    const snapshot=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('med25-active-mock-v1')));
    assert.equal(snapshot.exam.questions.length,3);assert.equal(new Set(snapshot.exam.questions).size,3);
    assert.equal(await page.locator('.mockResults, .mockQuestionCard .feedback, .mockQuestionCard .correct').count(),0);
    const answer='A';await page.locator('[data-mock-answer="'+answer+'"]').click();
    await page.reload();await waitReady(page);
    await page.locator('.mockExamShell').waitFor();
    const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('med25-active-mock-v1')));
    assert.equal(restored.exam.endsAt,snapshot.exam.endsAt);assert.deepEqual(restored.exam.questions,snapshot.exam.questions);assert.equal(Object.values(restored.exam.answers)[0],answer);
    await page.locator('#mockFinishBtn').click();await page.locator('.mockResults').waitFor();
    const ended=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('med25-active-mock-v1')));
    assert(ended.exam.submitted);assert.equal(ended.exam.bonusXp,0);assert.equal(await page.evaluate(()=>localStorage.getItem('med25-pending-xp-v3')),xpBefore);
    await page.reload();await waitReady(page);await page.locator('.mockResults').waitFor();await page.locator('#mockBuildAnother').click();
    // Build an expired exam and verify automatic submission includes unanswered items, still with zero XP.
    await page.locator('[data-mock-source="past"]').click();await page.locator('#mockClearCounts').click();await page.locator('[data-mock-subject-count]').first().fill('2');
    await page.locator('#mockStartBtn').click();await page.locator('.mockExamShell').waitFor();
    assert((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('med25-active-mock-v1')).exam.questions)).every(k=>k.startsWith('past:')));
    await page.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('med25-active-mock-v1'));s.exam.endsAt=Date.now()-1;sessionStorage.setItem('med25-active-mock-v1',JSON.stringify(s))});
    await page.reload();await waitReady(page);await page.locator('.mockResults').waitFor();
    assert(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('med25-active-mock-v1')).exam.autoSubmitted));
    console.log('PASS mock validation, exact unique mix, concealment, reload recovery, timed submission, and zero XP');

    // Verify sign-in/sync integration with an isolated API fixture, including nested offline/cloud progress.
    const localQ=qs[1],remoteQ=qs[2];
    await page.evaluate(({user,localQ})=>localStorage.setItem('cb-bank-progress:'+user.id,JSON.stringify({__ai_questions__:{[localQ.id]:{answered:true,selected:localQ.answer,correct:true,locked_at:'2026-10-04T12:00:00Z'}}})),{user,localQ});
    cloud={__flashcards__:{historical:{due:123,reps:2}},__ai_questions__:{[remoteQ.id]:{answered:true,selected:remoteQ.answer,correct:true,locked_at:'2026-10-04T11:00:00Z'}}};
    await page.locator('#tabProfile').click();await page.locator('#authEmail').fill(user.email);await page.locator('#authPassword').fill('fixture-password');await page.locator('#authSignIn').click();
    await page.waitForFunction(()=>document.querySelector('#authSignedIn').style.display!=='none');
    await page.waitForFunction(({a,b})=>saved.__ai_questions__?.[a]?.answered&&saved.__ai_questions__?.[b]?.answered,{a:localQ.id,b:remoteQ.id});
    assert.deepEqual(cloud.__flashcards__,{historical:{due:123,reps:2}});
    assert(cloud.__ai_questions__[localQ.id]);assert(cloud.__ai_questions__[remoteQ.id]);
    await openAI(page,lid);const lockQ=qs[3];await page.locator('#'+lockQ.id+' [data-ai-opt="'+lockQ.answer+'"]').click();
    await page.waitForFunction(()=>document.querySelector('#'+CSS.escape('ai_1Aj5OXNtQh2z591zY5ZtiwNJItBL4R9Yl_04')+' .aiOption:disabled'));
    await page.locator('#tabHome').click();await page.locator('[data-xp-board="weekly"]').click();
    await page.waitForSelector('.gameLeaderboardRow.me.outsideTop');
    const apiAttemptsBefore=attempts.size;await page.locator('#tabMock').click();await page.locator('#mockBuildAnother').click();await page.locator('#mockClearCounts').click();await page.locator('[data-mock-subject-count]').first().fill('1');await page.locator('#mockStartBtn').click();await page.locator('.mockOption').first().click();await page.locator('#mockFinishBtn').click();await page.locator('.mockResults').waitFor();
    assert.equal(attempts.size,apiAttemptsBefore);
    assert(!requests.some(r=>r.path.endsWith('/game_attempts')&&[].concat(r.body||[]).some(b=>b.source==='mock')));
    await page.locator('#tabHome').click();await page.locator('.gameLeaderboardPrivacyToggle').click();await page.waitForFunction(()=>document.querySelector('#gameLeaderboardHiddenHome')?.checked);
    assert.equal(profile.leaderboard_visible,false);await page.locator('.gameLeaderboardPrivacyToggle').click();await page.waitForFunction(()=>document.querySelector('#gameLeaderboardHiddenHome')?.checked===false);
    console.log('PASS account sync, offline nested progress merge, own rank, privacy toggle, and mock XP exclusion');

    // Historical analytics payloads must remain usable without rendering retired counters or sections.
    await page.evaluate(async()=>{const email=currentUser.email;currentUser.email=ADMIN_EMAILS[0];try{await loadAdminAnalytics()}finally{currentUser.email=email}});
    const analytics=await page.locator('#analyticsBody').textContent();
    assert(!/flashcard|rating/i.test(analytics));assert(analytics.includes('Past Paper answers'));assert(analytics.includes('Mock Exams'));
    assert.equal(await page.locator('#analyticsBody .analyticsWideBox').first().locator('thead th').count(),5);
    console.log('PASS analytics compatibility without retired card counters');

    // Directly exercise a conflict: the earliest completed answer stays locked while independent maps are retained.
    const merged=await page.evaluate(()=>mergeStudyProgress({q:{answered:true,selected:'B',correct:false,locked_at:'2026-10-04T12:00:00Z'},__lecture_study__:{a:{studied:true,updated_at:'2026-10-04T13:00:00Z'}}},{q:{answered:true,selected:'A',correct:true,locked_at:'2026-10-04T11:00:00Z'},__lecture_study__:{b:{studied:true},a:{studied:false,updated_at:'2026-10-04T10:00:00Z'}}}));
    assert.equal(merged.q.selected,'A');assert(merged.__lecture_study__.a.studied);assert(merged.__lecture_study__.b.studied);
    assert(!assetRequests.some(u=>/flashcards\.json|anki-fsrs|ts-fsrs/.test(u)));
    assert(!requests.some(r=>r.body?.event_name==='flashcard_review'));
    assert.deepEqual(errors,[]);fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'test-artifacts/reliability-results.json'),JSON.stringify({passed:true,ai:expectedAI.length,leaderboardAccounts:503,checks:8,liveStudentWrites:0},null,2));
    console.log('RELIABILITY E2E PASS');
  }finally{await browser.close();await new Promise(r=>server.close(r))}
}
run().catch(e=>{console.error(e);process.exit(1)});
