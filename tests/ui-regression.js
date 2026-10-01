const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.MED25_BASE_URL || 'http://127.0.0.1:4173';
const devices = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'ipad', width: 1180, height: 820 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const REPEATS = 10;
const results = [];
fs.mkdirSync('test-artifacts', { recursive: true });

async function visible(locator) {
  return (await locator.count()) > 0 && await locator.first().isVisible().catch(() => false);
}
async function click(locator, label) {
  if (!await visible(locator)) throw new Error('Not visible: ' + label);
  await locator.first().click({ timeout: 6000 });
}
async function assertVisible(page, selector, label = selector) {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {
    throw new Error('Expected visible: ' + label);
  });
}
async function noPageOverflow(page, label) {
  const x = await page.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (x.scroll > x.width + 4) throw new Error(label + ' page overflow: ' + x.scroll + ' > ' + x.width);
}
async function dismissUpdate(page) {
  const close = page.locator('#updateNoticeClose');
  if (await visible(close)) await close.click();
}
async function goDesktop(page, id, section) {
  await click(page.locator('#' + id), id);
  await assertVisible(page, section, section);
  await noPageOverflow(page, id);
}
async function openMobilePractice(page, key, expected) {
  await click(page.locator('[data-v2-mobile="practice"]'), 'mobile Practice');
  await assertVisible(page, '#v2PracticeBack.show', 'Practice chooser');
  await click(page.locator('[data-v2-practice="' + key + '"]'), 'Practice ' + key);
  await assertVisible(page, expected, expected);
  await noPageOverflow(page, 'mobile practice ' + key);
}
async function goHome(page, mobile) {
  if (mobile) await click(page.locator('[data-v2-mobile="home"]'), 'mobile Home');
  else await click(page.locator('#tabHome'), 'desktop Home');
  await assertVisible(page, '#homeSection:not(.hidden)', 'Home');
}
async function testFooter(page) {
  for (const key of ['about','privacy','terms','contact']) {
    await click(page.locator('[data-v2-info="' + key + '"]'), 'footer ' + key);
    await assertVisible(page, '#v2InfoBack.show', key + ' sheet');
    if (key === 'about') {
      await page.waitForFunction(() => {
        const img=document.querySelector('.v2AboutIdentity img');
        return !!img && img.complete && img.naturalWidth > 0;
      }, null, {timeout:5000}).catch(()=>{throw new Error('Cohort logo did not load in About')});
    }
    await click(page.locator('#v2InfoClose'), 'close ' + key);
  }
}
async function testHome(page, mobile) {
  await goHome(page, mobile);
  const logo = page.locator('.v2CohortIdentity img');
  await assertVisible(page, '.v2CohortIdentity', 'cohort identity');
  await page.waitForFunction(() => {
    const img=document.querySelector('.v2CohortIdentity img');
    return !!img && img.complete && img.naturalWidth > 0;
  }, null, {timeout:5000}).catch(()=>{throw new Error('Home cohort logo failed to load')});

  for (const mode of ['weekly','monthly','all']) {
    const b = page.locator('[data-xp-board="' + mode + '"]');
    if (await visible(b)) await b.click();
  }
  const refresh = page.locator('#gameLeaderboardRefresh');
  if (await visible(refresh)) await refresh.click();

  const continueVisual = await page.locator('.homeContinue').evaluate(el => {
    const s=getComputedStyle(el);
    return {backgroundImage:s.backgroundImage,color:s.color};
  });
  if (!continueVisual.backgroundImage || continueVisual.backgroundImage==='none') {
    throw new Error('Continue card lost its branded background');
  }


  const metric = page.locator('#homeMetrics .homeMetricButton');
  if (await metric.count() >= 2) {
    await metric.nth(0).click();
    await assertVisible(page, '#flashcardsSection:not(.hidden)', 'flashcards metric');
    await goHome(page, mobile);
    await metric.nth(1).click();
    await assertVisible(page, '#questionSection:not(.hidden)', 'questions metric');
    await goHome(page, mobile);
  }

  const cont = page.locator('#homeContinueBtn');
  if (await visible(cont)) {
    await cont.click();
    await page.waitForTimeout(100);
    const leftHome = await page.locator('#homeSection').evaluate(el => el.classList.contains('hidden'));
    if (!leftHome) throw new Error('Continue button did not leave Home');
    await goHome(page, mobile);
  }
  await noPageOverflow(page, 'home');
}

async function testPast(page, mobile) {
  if (mobile) await openMobilePractice(page, 'past', '#questionSection:not(.hidden)');
  else await goDesktop(page, 'tabQuestions', '#questionSection:not(.hidden)');
  await page.waitForFunction(() => document.querySelectorAll('#list .qcard').length > 0, null, { timeout: 10000 });

  const search = page.locator('#search');
  if (await visible(search)) { await search.fill('anemia'); await search.fill(''); }
  const pastNext=page.locator('[data-page="next"]:not([disabled])').first();
  if (await visible(pastNext)) {
    await pastNext.click();
    const pastPrev=page.locator('[data-page="prev"]:not([disabled])').first();
    if (await visible(pastPrev)) await pastPrev.click();
  }
  const pastSubject=page.locator('#pastGuideSubject');
  if (await visible(pastSubject) && await pastSubject.locator('option').count()>1) {
    await pastSubject.selectOption({index:1});
    await pastSubject.selectOption('');
  }
  if (await visible(pastSubject)) {
    const pastSubjects=await pastSubject.locator('option').allTextContents();
    if(!pastSubjects.includes('Physiology'))throw new Error('Past Papers missing Physiology subject');
    await pastSubject.selectOption({label:'Physiology'});
    await page.waitForTimeout(60);
    const lectureBtn=page.locator('#pastGuideLectureBtn');
    await click(lectureBtn,'Past Papers Physiology lecture picker');
    const ecg=page.locator('#pastGuideLecturePanel input[value="physiology__normal-ecg"]');
    if(!await visible(ecg))throw new Error('Normal ECG missing from Past Papers lecture filter');
    await ecg.check();
    await page.waitForTimeout(100);
    if(await page.locator('#list .qcard').count()<1)throw new Error('Normal ECG filter returns zero Past Paper questions');
    await pastSubject.selectOption('');
  }

  const mobileFilter = page.locator('[data-mobile-filter-toggle="past"]');
  if (await visible(mobileFilter)) { await mobileFilter.click(); await mobileFilter.click(); }

  for (const filter of ['hy','formative','unanswered','wrong','smart','starred','all']) {
    const b = page.locator('[data-filter="' + filter + '"]');
    if (await visible(b)) { await b.click(); await page.waitForTimeout(40); }
  }
  const shuffle = page.locator('#shuffle');
  if (await visible(shuffle)) { await shuffle.click(); await shuffle.click(); }
  const practice = page.locator('#modePractice'), review = page.locator('#modeReview');
  if (await visible(review)) await review.click();
  if (await visible(practice)) await practice.click();

  const cards = page.locator('#list .qcard');
  let wrongFound = false;
  const n = Math.min(6, await cards.count());
  for (let i=0;i<n;i++) {
    const option = cards.nth(i).locator('.option:not(:disabled)').first();
    if (await visible(option)) {
      await option.click();
      if (await cards.nth(i).locator('.feedback.wrong').count()) { wrongFound = true; break; }
    }
  }
  if (!wrongFound) {
    // More cards if the first-option streak happened to be correct.
    for (let i=6;i<Math.min(15, await cards.count());i++) {
      const option = cards.nth(i).locator('.option:not(:disabled)').nth(1);
      if (await visible(option)) {
        await option.click();
        if (await cards.nth(i).locator('.feedback.wrong').count()) { wrongFound = true; break; }
      }
    }
  }
  if (!wrongFound) throw new Error('Could not generate a representative wrong answer for Mistake Quiz');

  const star = page.locator('#list .reviewmark').first();
  if (await visible(star)) { await star.click(); await star.click(); }

  await noPageOverflow(page, 'past papers');
}

async function testAI(page, mobile) {
  if (mobile) await openMobilePractice(page, 'ai', '#aiSection:not(.hidden)');
  else await goDesktop(page, 'tabAI', '#aiSection:not(.hidden)');
  await page.waitForFunction(() => document.querySelectorAll('#aiQuestionList .aiCard').length > 0, null, { timeout: 10000 });

  const search = page.locator('#aiSearch');
  if (await visible(search)) { await search.fill('heart'); await search.fill(''); }
  const aiNext=page.locator('[data-ai-page="next"]:not([disabled])').first();
  if (await visible(aiNext)) {
    await aiNext.click();
    const aiPrev=page.locator('[data-ai-page="prev"]:not([disabled])').first();
    if (await visible(aiPrev)) await aiPrev.click();
  }
  const aiSubject=page.locator('#aiGuideSubject');
  if (await visible(aiSubject) && await aiSubject.locator('option').count()>1) {
    await aiSubject.selectOption({index:1});
    await aiSubject.selectOption('');
  }
  if (await visible(aiSubject)) {
    const optionTexts=await aiSubject.locator('option').allTextContents();
    for (const subjectName of ['Hematology','Anatomy & Histology']) {
      if (!optionTexts.includes(subjectName)) throw new Error('AI subject missing: '+subjectName);
      await aiSubject.selectOption({label:subjectName});
      await page.waitForTimeout(80);
      const cards=page.locator('#aiQuestionList .aiCard');
      if (await cards.count()<1) throw new Error('AI subject has zero questions: '+subjectName);
    }
    await aiSubject.selectOption('');
    await aiSubject.selectOption({label:'Pathology'});
    await page.waitForTimeout(60);
    const lectureBtn=page.locator('#aiGuideLectureBtn');
    await click(lectureBtn,'AI Pathology lecture picker');
    const endo=page.locator('#aiGuideLecturePanel input[value="pathology__infective-endocarditis"]');
    if(!await visible(endo))throw new Error('Infective Endocarditis missing from AI lecture filter');
    await endo.check();
    await page.waitForTimeout(100);
    if(await page.locator('#aiQuestionList .aiCard').count()<1)throw new Error('Infective Endocarditis filter returns zero AI questions');
    await aiSubject.selectOption('');
  }
  const mobileFilter = page.locator('[data-mobile-filter-toggle="ai"]');
  if (await visible(mobileFilter)) { await mobileFilter.click(); await mobileFilter.click(); }

  for (const filter of ['unanswered','wrong','starred','all']) {
    const b=page.locator('[data-ai-filter="' + filter + '"]');
    if (await visible(b)) { await b.click(); await page.waitForTimeout(40); }
  }
  const shuffle=page.locator('#aiShuffle');
  if (await visible(shuffle)) { await shuffle.click(); await shuffle.click(); }

  const card=page.locator('#aiQuestionList .aiCard').first();
  const option=card.locator('.aiOption:not(:disabled)').first();
  if (await visible(option)) {
    await option.click();
    await card.locator('.aiFeedback').waitFor({state:'visible',timeout:5000});
  }
  const star=card.locator('[data-ai-star]');
  if (await visible(star)) { await star.click(); await star.click(); }
  const copy=card.locator('[data-ai-copy]');
  if (await visible(copy)) await copy.click();

  await noPageOverflow(page, 'ai questions');
}

async function testMistakeQuiz(page, mobile) {
  if (mobile) await openMobilePractice(page, 'quiz', '#quizSection:not(.hidden)');
  else await goDesktop(page, 'tabQuiz', '#quizSection:not(.hidden)');
  const shuffle=page.locator('#quizShuffleBtn');
  if (await visible(shuffle)) { await shuffle.click(); await shuffle.click(); }
  const option=page.locator('#quizStage .quizOption:not(:disabled)').first();
  if (await visible(option)) await option.click();
  const next=page.locator('#quizStage .quizNextBtn');
  if (await visible(next)) await next.click();
  await noPageOverflow(page, 'mistake quiz');
}

async function testFlashcards(page, mobile) {
  if (mobile) await click(page.locator('[data-v2-mobile="flash"]'), 'mobile Cards');
  else await goDesktop(page, 'tabFlashcards', '#flashcardsSection:not(.hidden)');
  await assertVisible(page, '#flashcardsSection:not(.hidden)', 'Flashcards');
  await page.waitForFunction(() => document.querySelectorAll('#flashDeckList .ankiDeckRow').length > 0, null, { timeout: 10000 });

  const stats=page.locator('#flashStatsToggle');
  if (await visible(stats)) { await stats.click(); await stats.click(); }
  const search=page.locator('#flashSearch');
  if (await visible(search)) { await search.fill('cardiac'); await search.fill(''); }

  const suspend=page.locator('#flashDeckList .ankiSuspendBtn').first();
  if (await visible(suspend)) { await suspend.click(); await suspend.click(); }
  const deck=page.locator('#flashDeckList .ankiDeckRow').first();
  if (await visible(deck)) await deck.evaluate(el=>el.click());
  if (!await visible(page.locator('#flashStudy'))) {
    const all=page.locator('#flashStudyAll');
    if (await visible(all)) await all.click();
  }
  await assertVisible(page, '#flashStudy:not(.hidden)', 'Flash study');
  const show=page.locator('#flashShowAnswer');
  if (await visible(show)) await show.click();
  await assertVisible(page, '#flashRatings.show', 'Flash ratings');
  const good=page.locator('[data-grade="good"]');
  if (await visible(good)) await good.click();
  const back=page.locator('#flashBack');
  if (await visible(back)) await back.click();
  await assertVisible(page, '#flashDeckBrowser:not(.hidden)', 'Deck browser');
  await noPageOverflow(page, 'flashcards');
}

async function testMock(page, mobile) {
  if (mobile) await click(page.locator('[data-v2-mobile="mock"]'), 'mobile Mock');
  else await goDesktop(page, 'tabMock', '#mockSection:not(.hidden)');
  await assertVisible(page, '#mockSection:not(.hidden)', 'Mock Exam');
  await page.waitForFunction(() => document.querySelectorAll('[data-mock-subject-count]').length > 0, null, { timeout: 10000 });

  const minutes=page.locator('#mockMinutes');
  if (await visible(minutes)) {
    await minutes.fill('12');
    await minutes.evaluate(el=>el.dispatchEvent(new Event('input',{bubbles:true})));
  }
  const sourcePast=page.locator('[data-mock-source="past"]');
  const sourceBoth=page.locator('[data-mock-source="both"]');
  if (await visible(sourcePast)) await sourcePast.click();
  if (await visible(sourceBoth)) await sourceBoth.click();
  for (const subjectName of ['Hematology','Anatomy & Histology']) {
    const card=page.locator('.mockSubjectCard').filter({hasText:subjectName}).first();
    if (!await visible(card)) throw new Error('Mock subject missing: '+subjectName);
    const summaryText=await card.locator('.mockSubjectMain').innerText();
    const match=summaryText.match(/(\d+)\s+AI/);
    if (!match || Number(match[1])<1) throw new Error('Mock subject has zero AI questions: '+subjectName);
  }

  const count=page.locator('[data-mock-subject-count]').first();
  await count.evaluate(el=>{el.value='2';el.dispatchEvent(new Event('change',{bubbles:true}));});
  const clear=page.locator('#mockClearCounts');
  if (await visible(clear)) {
    await clear.click();
    const zeroStart=page.locator('#mockStartBtn');
    if (!await zeroStart.isDisabled()) throw new Error('Mock Start should disable after Clear all');
  }
  const subjectCount=page.locator('[data-mock-subject-count]').first();
  await subjectCount.evaluate(el=>{el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));});
  const firstDetails=page.locator('.mockSubjectCard details').first();
  const summary=firstDetails.locator('summary');
  if (await visible(summary)) await summary.click();
  const lectureCount=page.locator('[data-mock-lecture-count]').first();
  await lectureCount.waitFor({state:'visible',timeout:5000});
  await lectureCount.evaluate(el=>{el.value='1';el.dispatchEvent(new Event('change',{bubbles:true}));});
  const start=page.locator('#mockStartBtn');
  if (await start.isDisabled()) throw new Error('Mock Start remained disabled after subject + lecture selection');
  await start.click();
  await assertVisible(page, '.mockExamShell', 'Mock exam shell');

  const first=page.locator('.mockOption').first();
  if (await visible(first)) await first.click();
  const next=page.locator('#mockNext');
  if (await visible(next)) await next.click();
  const prev=page.locator('#mockPrev');
  if (await visible(prev) && !await prev.isDisabled()) await prev.click();
  const map=page.locator('[data-mock-jump]').last();
  if (await visible(map)) await map.click();

  await click(page.locator('#mockFinishBtn'), 'Finish mock');
  await assertVisible(page, '.mockResults', 'Mock results');
  if (!await page.locator('.mockNoPoints').isVisible()) throw new Error('Mock zero-XP notice missing');
  await click(page.locator('#mockBuildAnother'), 'Build another mock');
  await assertVisible(page, '.mockBuilder', 'Mock builder restored');
  await noPageOverflow(page, 'mock');
}

async function testProgress(page, mobile) {
  await goHome(page,mobile);
  if (mobile) await click(page.locator('#v2OpenTracker'), 'Open Lecture Tracker');
  else await click(page.locator('#tabProgress'), 'desktop Lecture Tracker');
  await assertVisible(page, '#progressSection:not(.hidden)', 'Lecture Tracker page');
  if (await page.locator('#homeSection').isVisible()) throw new Error('Home remained visible behind Lecture Tracker');
  await assertVisible(page, '.lectureDashboardCard', 'Lecture dashboard card');
  const summaryText=await page.locator('#lectureDashboardSummary').innerText();
  if(!/published lectures/i.test(summaryText))throw new Error('Lecture Tracker summary is not based on published content');
  const zeroRows=await page.locator('.lectureDashRow:not(.lectureDashColumns)').evaluateAll(rows=>rows.filter(row=>{
    const cells=row.querySelectorAll('.lectureDashCheckCell small');
    return cells[1]&&cells[1].textContent.trim()==='0/0';
  }).length);
  if(zeroRows)throw new Error('Lecture Tracker contains unpublished 0/0 lecture rows');

  const subject = page.locator('#lectureDashSubject');
  if (await visible(subject) && await subject.locator('option').count() > 1) {
    await subject.selectOption({ index: 1 });
    await subject.selectOption('');
  }
  const status = page.locator('#lectureDashStatus');
  if (await visible(status)) {
    await status.selectOption('not-started');
    await status.selectOption('');
  }
  const search = page.locator('#lectureDashSearch');
  if (await visible(search)) {
    await search.fill('cardiac');
    await search.fill('');
  }
  const manual = page.locator('[data-lecture-study]').first();
  if (await visible(manual)) {
    await manual.click();
    await manual.click();
  }
  await noPageOverflow(page, 'lecture tracker');
  await click(page.locator('#v2TrackerBack'),'Lecture Tracker back to Home');
  await assertVisible(page,'#homeSection:not(.hidden)','Home after Lecture Tracker');
}

async function testProfile(page, mobile, deviceName) {
  if (mobile) await click(page.locator('[data-v2-mobile="profile"]'), 'mobile Profile');
  else await click(page.locator('#tabProfile'), 'desktop Profile');
  await assertVisible(page, '#profileSection:not(.hidden)', 'Profile page');
  if (await page.locator('#homeSection').isVisible()) throw new Error('Home remained visible behind Profile');
  await assertVisible(page, '#profileGameSlot', 'Profile XP card');
  await assertVisible(page, '#profileAuthSlot', 'Profile account card');

  const t=page.locator('#mobileAuthToggle');
  if (await visible(t)) { await t.click(); await t.click(); }

  if (deviceName === 'ipad') {
    const accountBox=await page.locator('.v2AccountCard').boundingBox();
    const profileBox=await page.locator('.v2ProfileCard').boundingBox();
    if (!accountBox || !profileBox) throw new Error('iPad Profile cards not measurable');
    if (accountBox.y >= profileBox.y) throw new Error('iPad Account & Sync is not above Profile & XP');

    const emailBox=await page.locator('#authEmail').boundingBox();
    const passBox=await page.locator('#authPassword').boundingBox();
    if (!emailBox || !passBox || emailBox.width < 220 || passBox.width < 220) {
      throw new Error('iPad auth inputs are too narrow');
    }

    const iconCenters=await page.locator('#studyTabs .studyTab:visible .navIcon').evaluateAll(nodes =>
      nodes.map(n => {
        const r=n.getBoundingClientRect();
        return Math.round((r.left+r.width/2)*10)/10;
      })
    );
    if (iconCenters.length < 6) throw new Error('Not enough visible iPad sidebar icons');
    if (Math.max(...iconCenters)-Math.min(...iconCenters) > 2) {
      throw new Error('iPad sidebar icons are not vertically aligned');
    }
  }

  if (mobile) {
    await assertVisible(page,'#v2MobileAppearance','profile appearance control');
    const before=await page.locator('html').getAttribute('data-theme');
    await click(page.locator('#v2MobileAppearance'),'profile appearance toggle');
    const after=await page.locator('html').getAttribute('data-theme');
    if (before===after) throw new Error('Profile appearance toggle did not change theme');
    await page.locator('#v2MobileAppearance').click();

    await click(page.locator('[data-v2-mobile="practice"]'),'Practice overlay from Profile');
    await assertVisible(page,'#v2PracticeBack.show','Practice chooser over Profile');
    await click(page.locator('#v2PracticeClose'),'close Practice chooser');
    await assertVisible(page,'#profileSection:not(.hidden)','Profile preserved after closing Practice chooser');
  }
  await noPageOverflow(page, 'profile');
}

async function runOne(browser, device, iteration) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.name === 'phone' ? 3 : device.name === 'ipad' ? 2 : 1,
    isMobile: device.name !== 'desktop',
    hasTouch: device.name !== 'desktop',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t=msg.text();
      if (!/supabase|ERR_FAILED|Failed to fetch|net::/i.test(t)) errors.push('console: ' + t);
    }
  });
  page.on('dialog', async d => {
    if (d.type() === 'prompt') await d.dismiss();
    else await d.accept();
  });
  await page.route('https://**.supabase.co/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: route.request().method()==='GET' ? '[]' : '{}'
  }));

  try {
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#homeSection', { timeout: 10000 });
    await dismissUpdate(page);
    await page.waitForFunction(() => document.querySelector('#v2Footer') && document.querySelector('#v2MobileNav'), null, { timeout: 10000 });

    const mobile=device.width<=820;
    if (mobile) {
      await assertVisible(page,'#v2MobileNav','mobile bottom nav');
      if (await page.locator('#studyTabs').isVisible()) throw new Error('Desktop sidebar visible on ' + device.name);
      if (await page.locator('.mobileThemeToggle').isVisible().catch(()=>false)) throw new Error('Legacy floating theme toggle is still visible on ' + device.name);
    } else {
      await assertVisible(page,'#studyTabs','desktop sidebar');
      if (await page.locator('#v2MobileNav').isVisible()) throw new Error('Mobile nav visible on desktop');
      const before=await page.locator('html').getAttribute('data-theme');
      await click(page.locator('#themeToggle'),'theme toggle');
      const after=await page.locator('html').getAttribute('data-theme');
      if (before===after) throw new Error('Theme toggle did not change theme');
      await page.locator('#themeToggle').click();
    }

    await testHome(page,mobile);
    await testProgress(page,mobile);
    await testProfile(page,mobile,device.name);
    if(iteration===1&&device.name==='ipad'){
      await page.screenshot({path:'test-artifacts/ipad-profile.png',fullPage:true});
    }
    await testPast(page,mobile);
    await testAI(page,mobile);
    await testMistakeQuiz(page,mobile);
    await testFlashcards(page,mobile);
    await testMock(page,mobile);
    await testFooter(page);

    // Reset is intentionally tested last because it clears local progress.
    if (mobile) await openMobilePractice(page,'past','#questionSection:not(.hidden)');
    else await goDesktop(page,'tabQuestions','#questionSection:not(.hidden)');
    const reset=page.locator('#reset');
    if (await visible(reset)) await reset.click();

    if (errors.length) throw new Error(errors.join('\n'));
    if (iteration===1) {
      await goHome(page,mobile);
      await page.screenshot({path:'test-artifacts/'+device.name+'-home.png',fullPage:true});
      if (mobile) await click(page.locator('[data-v2-mobile="mock"]'),'screenshot mock');
      else await page.locator('#tabMock').click();
      await page.waitForTimeout(120);
      await page.screenshot({path:'test-artifacts/'+device.name+'-mock.png',fullPage:true});
    }
    results.push({device:device.name,iteration,ok:true});
    process.stdout.write('PASS '+device.name+' '+iteration+'/'+REPEATS+'\n');
  } catch (e) {
    results.push({device:device.name,iteration,ok:false,error:e.stack||String(e)});
    process.stderr.write('FAIL '+device.name+' '+iteration+'/'+REPEATS+'\n'+(e.stack||e)+'\n');
    throw e;
  } finally {
    await context.close();
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const device of devices){
      for(let i=1;i<=REPEATS;i++) await runOne(browser,device,i);
    }
  } finally {
    await browser.close();
    fs.writeFileSync('test-artifacts/results.json',JSON.stringify(results,null,2));
  }
  const passed=results.filter(x=>x.ok).length;
  console.log('UI regression complete: '+passed+'/'+results.length+' runs passed.');
  if(passed!==devices.length*REPEATS) process.exit(1);
})().catch(err=>{console.error(err);process.exit(1)});
