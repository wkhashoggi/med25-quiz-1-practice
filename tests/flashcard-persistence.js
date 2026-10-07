const {chromium}=require('playwright'),assert=require('assert/strict');
const user={id:'00000000-0000-4000-8000-000000000008',email:'flashcard-fixture@example.com'},session={user,access_token:'fixture',refresh_token:'fixture'};
let cloud={};
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext();
 await context.addInitScript(s=>{localStorage.setItem('med25-auth-session',JSON.stringify(s));localStorage.setItem('med25-update-notice-2026-09-26-cleanup-v1','dismissed')},session);
 await context.route('https://**.supabase.co/**',async route=>{const r=route.request(),u=new URL(r.url());let body=[];
 if(u.pathname==='/auth/v1/user')body=user;
 else if(u.pathname.includes('/auth/v1/token'))body=session;
 else if(u.pathname.endsWith('/game_profiles'))body=[{user_id:user.id,username:'FlashcardFixture',points:0}];
 else if(u.pathname.endsWith('/student_progress')){if(r.method()==='POST'){cloud=r.postDataJSON().progress;body={}}else body=[{progress:cloud}];}
 else if(r.method()!=='GET')body={};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 let page=await context.newPage();const base=process.env.MED25_BASE_URL||'http://127.0.0.1:4173';
 async function ready(){await page.goto(base);await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&typeof gradeFlashCard==='function'&&gradeFlashCard.name==='ankiGrade'&&currentUser);}
 await ready();
 const ids=await page.evaluate(()=>{const d=flashLibrary.decks.find(d=>d.source_file_id==='1K8y3B4Uayu64dRGAXdVO8cA-Kghv0mkJ');startFlashStudy([d.id]);const card=currentFlashCard();return {deck:d.id,card:card.id}});
 const grade=async g=>page.evaluate(g=>{revealFlashAnswer();gradeFlashCard(g)},g);
 await grade('again');
 assert(await page.evaluate(id=>!!flashReview[id]?.pending_again,ids.card));
 const due=await page.evaluate(id=>flashReview[id].due,ids.card);
 await page.close();page=await context.newPage();await ready();
 assert(await page.evaluate(id=>dueCardsForDecks([id.deck]).some(c=>c.id===id.card&&c.__same_session_retry),ids));
 await page.evaluate(id=>{startFlashStudy([id.deck]);flashSession.index=flashSession.queue.findIndex(c=>c.id===id.card);renderFlashStudyCard()},ids);
 await grade('again');
 assert(await page.evaluate(id=>flashSession.queue.slice(flashSession.index).some(c=>c.id===id),ids.card));
 await page.evaluate(id=>{flashSession.index=flashSession.queue.findIndex((c,i)=>i>=flashSession.index&&c.id===id);renderFlashStudyCard()},ids.card);
 await grade('good');
 assert.equal(await page.evaluate(id=>flashReview[id].pending_again,ids.card),false);
 assert.equal(await page.evaluate(id=>flashReview[id].due,ids.card),due);
 await page.reload();await page.waitForFunction(()=>typeof gradeFlashCard==='function'&&gradeFlashCard.name==='ankiGrade'&&window.med25GameBridge?.studyLibrariesReady?.());
 assert.equal(await page.evaluate(id=>dueCardsForDecks([id.deck]).some(c=>c.id===id.card),ids),false);
 // Saved newest review wins over a stale cloud record.
 assert.equal(await page.evaluate(()=>mergeStudyProgress({x:{due:4,updated_at:200,pending_again:false}},{x:{due:3,updated_at:100,pending_again:true}}).x.pending_again),false);
 // Advance to the actual Riyadh due boundary, then verify tomorrow's queue and daily reset.
 await page.clock.install({time:new Date(due+1000)});
 assert(await page.evaluate(id=>dueCardsForDecks([id.deck]).some(c=>c.id===id.card&&!c.__same_session_retry),ids));
 assert.equal(await page.evaluate(()=>flashReview.__daily__.newIntroduced),0);
 console.log('PASS new lecture deck, Again persistence across close/reopen, repeated Again, successful retry, saved schedule, stale cloud merge, Riyadh daily rollover');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
