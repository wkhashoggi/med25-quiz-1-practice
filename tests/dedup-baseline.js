// Historical medical/import ledgers describe the bank before duplicate cards were merged.
// Reconstruct that view from the archived originals. deduplication.js independently checks
// the published bank, unchanged retained clinical content, provenance and progress migration.
const fs=require('fs');
const audit=JSON.parse(fs.readFileSync('question-deduplication-audit.json','utf8'));
exports.past=questions=>{
  const originals=new Map([...audit.groups.map(g=>[g.retained_id,g.original_retained]),...(audit.metadata_updates||[]).map(r=>[r.id,r.original])]);
  return questions.map(q=>originals.get(q.id)||q).concat(audit.groups.flatMap(g=>g.variants));
};
exports.ai=library=>{
  const copy=JSON.parse(JSON.stringify(library));
  for(const r of audit.removed_ai_questions){
    const set=(copy.lecture_sets||copy.ai_sets||[]).find(s=>s.id===r.set_id);
    if(set&&!set.questions.some(q=>q.id===r.question.id)){
      const baseline=JSON.parse(require('child_process').execFileSync('git',['show',audit.baseline_commit+':ai_questions.json'],{encoding:'utf8',maxBuffer:20e6}));
      const original=baseline.lecture_sets.find(s=>s.id===r.set_id);
      const byId=new Map([...set.questions,r.question].map(q=>[q.id,q]));
      set.questions=original.questions.map(q=>byId.get(q.id));
    }
  }
  return copy;
};
