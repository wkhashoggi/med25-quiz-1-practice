(async function(){
'use strict';
try{
  const res=await fetch('legacy-app.html?v=hub-1',{cache:'no-store'});
  if(!res.ok)throw new Error('Could not load the MED25 app (HTTP '+res.status+').');
  let html=await res.text();

  html=html.replace('</head>','<link rel="stylesheet" href="study-hub.css?v=5"></head>');

  const oldTabs='<div class="studyTabs" id="studyTabs"><button class="studyTab active" id="tabQuestions" type="button">Past Papers / Practice Questions</button><button class="studyTab" id="tabFlashcards" type="button">Flashcards</button></div>';
  const newTabs='<div class="studyTabs" id="studyTabs"><button class="studyTab active" id="tabHome" type="button">Home</button><button class="studyTab" id="tabQuestions" type="button">Past Papers</button><button class="studyTab" id="tabAI" type="button">AI Questions</button><button class="studyTab" id="tabFlashcards" type="button">Flashcards</button></div>';
  if(!html.includes(oldTabs))throw new Error('Navigation anchor not found.');
  html=html.replace(oldTabs,newTabs);

  const homeAnchor='  <div class="flashHeroStats hidden" id="flashHeroStats"></div>\n</section>\n\n<div id="questionSection">';
  if(!html.includes(homeAnchor))throw new Error('Home anchor not found.');
  html=html.replace(homeAnchor,'  <div class="flashHeroStats hidden" id="flashHeroStats"></div>\n</section>\n\n'+"<div id=\"homeSection\" class=\"hubSection hidden\">\n  <div class=\"hubGrid\">\n    <section class=\"hubCard hubIntro\">\n      <h2>Your MED25 study dashboard</h2>\n      <p>One home screen for progress across past papers, lecture-grounded AI questions, and Anki-style flashcard review.</p>\n      <div class=\"hubActions\">\n        <button class=\"hubBtn primary\" onclick=\"hubGo('questions')\">Continue past papers</button>\n        <button class=\"hubBtn\" onclick=\"hubGo('ai')\">Practice AI questions</button>\n        <button class=\"hubBtn\" onclick=\"hubGo('flashcards')\">Review flashcards</button>\n      </div>\n      <div class=\"hubNote\" id=\"homeSync\">Loading Drive-linked libraries…</div>\n    </section>\n    <div id=\"homeMetrics\" style=\"display:contents\"></div>\n    <section class=\"hubCard hubHalf\"><h3>Weakest topics</h3><p>Combined performance from Past Papers and AI Questions. Lowest-performing topics appear first.</p><div id=\"homeWeak\"></div></section>\n    <section class=\"hubCard hubHalf\"><h3>Subject progress</h3><p>AI-question attempts and flashcard exposure by subject.</p><div id=\"homeSubjects\"></div></section>\n  </div>\n</div>"+'\n\n<div id="questionSection">');

  const aiAnchor='\n<section id="flashcardsSection" class="flashcardsSection hidden">';
  if(!html.includes(aiAnchor))throw new Error('AI section anchor not found.');
  html=html.replace(aiAnchor,'\n'+"<section id=\"aiSection\" class=\"aiSection hidden\">\n  <div class=\"aiToolbar\">\n    <div class=\"aiControls\">\n      <input id=\"aiSearch\" class=\"aiControl aiSearch\" placeholder=\"Search AI questions, concepts, or lectures…\" />\n      <select id=\"aiSubject\" class=\"aiControl\"><option value=\"\">All subjects</option></select>\n      <select id=\"aiLecture\" class=\"aiControl\"><option value=\"\">All lectures</option></select>\n    </div>\n    <div class=\"aiChips\">\n      <button class=\"aiChip active\" data-ai-filter=\"all\">All</button>\n      <button class=\"aiChip\" data-ai-filter=\"unanswered\">Unanswered</button>\n      <button class=\"aiChip\" data-ai-filter=\"wrong\">Got wrong</button>\n      <button class=\"aiChip\" data-ai-filter=\"starred\">★ Starred</button>\n      <button class=\"aiChip\" id=\"aiShuffle\">Shuffle</button>\n    </div>\n  </div>\n  <div class=\"aiLayout\">\n    <main class=\"aiList\" id=\"aiQuestionList\"><div class=\"empty\">Loading lecture-grounded AI questions…</div></main>\n    <aside class=\"aiSidebar\">\n      <div class=\"aiBox\"><h3>AI question bank</h3><div id=\"aiStats\"></div><p id=\"aiSyncMeta\" style=\"margin-top:10px\">Loading Drive sync…</p></div>\n      <div class=\"aiBox\"><h3>How this section works</h3><p>These are separate from past papers. Each official lecture gets its own KAU-style 4-option SBA set. Answers lock after selection, and every question links back to its source lecture.</p></div>\n      <div class=\"aiBox\"><h3>Automatic updates</h3><p>When a new official lecture appears in the MED25 Drive, the sync creates or updates its AI MCQs and its flashcard deck together.</p></div>\n    </aside>\n  </div>\n</section>"+'\n\n<section id="flashcardsSection" class="flashcardsSection hidden">');

  html=html.replace("if(id==='__flashcards__')continue;","if(id==='__flashcards__'||id==='__ai_questions__')continue;");

  const close=html.lastIndexOf('</script>');
  if(close<0)throw new Error('Main application script not found.');
  const insert=close+9;
  const extra='<script src="study-hub.js?v=7"></'+'script>\n<script src="anki-fsrs.js?v=3"></'+'script>\n<script src="live-question-stats.js?v=3"></'+'script>';
  html=html.slice(0,insert)+'\n'+extra+html.slice(insert);

  document.open();document.write(html);document.close();
}catch(err){
  const host=document.getElementById('hubLoader');
  if(host)host.innerHTML='<div><b>Could not load MED25 Study Hub</b><span>'+String(err&&err.message||err)+'</span></div>';
  console.error(err);
}
})();