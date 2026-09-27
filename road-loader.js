(async function(){
  'use strict';
  var ROAD_HTML="<div id=\"roadSection\" class=\"roadSection hidden\">\n  <div class=\"roadWrap\">\n    <section class=\"roadHero\" id=\"roadHeroDynamic\"></section>\n\n    <div class=\"roadGrid\">\n      <section class=\"roadCard\" id=\"roadAction\"></section>\n      <section class=\"roadCard\" id=\"roadBrief\"></section>\n    </div>\n\n    <section class=\"roadCard\">\n      <div class=\"roadCardHead\"><div><h3>Mastery map</h3><p class=\"small\">Confidence-adjusted question performance, not raw accuracy alone.</p></div></div>\n      <div id=\"roadWeakStrong\"></div>\n    </section>\n\n    <div class=\"roadGrid\">\n      <section class=\"roadCard\">\n        <div class=\"roadCardHead\"><div><h3>A+ Review Queue</h3><p class=\"small\">Wrong, revealed, guessed-correct, 50/50 and unseen high-yield items rise automatically.</p></div></div>\n        <div id=\"roadReviewQueue\"></div>\n      </section>\n      <section class=\"roadCard\">\n        <div class=\"roadCardHead\"><div><h3>High-yield evidence map</h3><p class=\"small\">Prioritized from repetition, formative coverage and bank frequency — not guessed exam probability.</p></div></div>\n        <div id=\"roadEvidence\"></div>\n      </section>\n    </div>\n\n    <section class=\"roadCard\">\n      <div class=\"roadCardHead\"><div><h3>Lecture coverage</h3><p class=\"small\">Every Drive lecture → flashcards → related practice → mastery.</p></div></div>\n      <div class=\"roadLectureTools\"><select id=\"roadSubjectFilter\"><option value=\"\">All subjects</option></select><span class=\"small\">Open the lecture source whenever a topic needs remediation.</span></div>\n      <div class=\"roadLectureList\" id=\"roadLectureList\"></div>\n    </section>\n\n    <div class=\"roadToolGrid\">\n      <section class=\"roadCard\">\n        <h3>Concept chains</h3>\n        <p>Understand the mechanism from start to finish instead of memorizing isolated facts.</p>\n        <select class=\"roadSelect\" id=\"roadChainSelect\"></select>\n        <div id=\"roadChainContent\"></div>\n      </section>\n      <section class=\"roadCard\">\n        <h3>Compare confusing things</h3>\n        <p>Put commonly mixed-up exam concepts side by side.</p>\n        <select class=\"roadSelect\" id=\"roadCompareSelect\"></select>\n        <div id=\"roadCompareContent\"></div>\n      </section>\n    </div>\n\n    <section class=\"roadCard\">\n      <div class=\"roadCardHead\"><div><h3>KAU-style Exam Simulator</h3><p class=\"small\">Uses your actual past-paper/formative bank. Answers stay hidden until the exam ends.</p></div></div>\n      <div class=\"roadExamBuilder\">\n        <div class=\"roadField\"><label>Questions</label><select id=\"roadExamCount\"><option>10</option><option selected>20</option><option>30</option><option>40</option><option>60</option></select></div>\n        <div class=\"roadField\"><label>Module</label><select id=\"roadExamModule\"><option>All</option><option>IBLS</option><option>CVS</option><option>Formative</option></select></div>\n        <div class=\"roadField\"><label>Minutes</label><input id=\"roadExamMinutes\" type=\"number\" min=\"1\" max=\"240\" value=\"30\"></div>\n        <div class=\"roadField\"><label>Start</label><button class=\"roadPrimary\" id=\"roadStartExam\" style=\"width:100%\">Start exam</button></div>\n      </div>\n      <label class=\"roadCheck\"><input id=\"roadExamStrict\" type=\"checkbox\" checked> Strict mode: once an answer is selected, it is locked.</label>\n      <div class=\"roadExamPanel\" id=\"roadExamPanel\"></div>\n    </section>\n\n    <section class=\"roadCard\">\n      <div class=\"roadCardHead\"><div><h3>A+ readiness</h3><p class=\"small\">A finishing checklist: mastery, high-yield gaps, due cards, review queue and simulator performance.</p></div></div>\n      <div id=\"roadReadiness\"></div>\n    </section>\n  </div>\n</div>";
  try{
    var res=await fetch('legacy-app.html?v=road-a-plus-1',{cache:'no-store'});
    if(!res.ok)throw new Error('Could not load the MED25 app (HTTP '+res.status+').');
    var html=await res.text();

    html=html.replace('</head>','<link rel="stylesheet" href="road-to-a-plus.css?v=1"></head>');

    var oldTabs='<div class="studyTabs" id="studyTabs"><button class="studyTab active" id="tabQuestions" type="button">Past Papers / Practice Questions</button><button class="studyTab" id="tabFlashcards" type="button">Flashcards</button></div>';
    var newTabs='<div class="studyTabs" id="studyTabs"><button class="studyTab active" id="tabRoad" type="button">Road to A+</button><button class="studyTab" id="tabQuestions" type="button">Practice Questions</button><button class="studyTab" id="tabFlashcards" type="button">Flashcards</button></div>';
    if(html.indexOf(oldTabs)<0)throw new Error('Navigation anchor not found.');
    html=html.replace(oldTabs,newTabs);

    var anchor='  <div class="flashHeroStats hidden" id="flashHeroStats"></div>\n</section>\n\n<div id="questionSection">';
    if(html.indexOf(anchor)<0)throw new Error('Dashboard anchor not found.');
    html=html.replace(anchor,'  <div class="flashHeroStats hidden" id="flashHeroStats"></div>\n</section>\n\n'+ROAD_HTML+'\n\n<div id="questionSection">');

    html=html.replace("if(id==='__flashcards__')continue;","if(id==='__flashcards__'||id==='__a_plus__')continue;");

    var close=html.lastIndexOf('</script>');
    if(close<0)throw new Error('Main application script not found.');
    var insert=close+9;
    var extra='<script src="road-to-a-plus.js?v=1"></'+'script>';
    html=html.slice(0,insert)+'\n'+extra+html.slice(insert);

    document.open();
    document.write(html);
    document.close();
  }catch(err){
    var host=document.getElementById('roadLoader');
    if(host)host.innerHTML='<div><b>Could not load Road to A+</b><span>'+String(err&&err.message||err)+'</span></div>';
    console.error(err);
  }
})();