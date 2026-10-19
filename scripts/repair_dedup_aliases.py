"""Serialize the reviewed alias registry without regex replacement escape processing."""
import json, re, subprocess, unicodedata
from pathlib import Path
from difflib import SequenceMatcher
root=Path(__file__).resolve().parents[1]
audit=json.loads((root/'question-deduplication-audit.json').read_text())
before=subprocess.check_output(['git','show',audit['baseline_commit']+':legacy-app.html'],cwd=root).decode()
aliases=json.loads(re.search(r'const PAST_QUESTION_ALIASES=(\{[^\n]*\});',before)[1])
norm=lambda value:re.sub('[^a-z0-9]','',unicodedata.normalize('NFKC',str(value)).lower())
for g in audit['groups']:
    target=g['original_retained']
    for q in g['variants']:
        option_map={}
        for key,text in q['options'].items():
            same=[k for k,v in target['options'].items() if norm(text)==norm(v)]
            if len(same)==1:option_map[key]=same[0]
            else:
                close=sorted([(SequenceMatcher(None,norm(text),norm(value)).ratio(),k) for k,value in target['options'].items()],reverse=True)
                if close and close[0][0]>=.94 and (len(close)==1 or close[0][0]-close[1][0]>=.08):option_map[key]=close[0][1]
        aliases[q['id']]=dict(id=target['id'],options=q['options'],option_map=option_map,preserve_progress=True)
for alias in aliases.values():
    previous=alias['id'];final=audit['aliases'].get(previous,previous)
    if previous!=final:
        intermediate=aliases.get(previous,{})
        if alias.get('option_map'):alias['option_map']={k:intermediate.get('option_map',{}).get(v,v) for k,v in alias['option_map'].items()}
        alias['id']=final
p=root/'legacy-app.html';html=p.read_text();start=html.index('const PAST_QUESTION_ALIASES=');end=html.index('function regradeSavedProgress()',start)
html=html[:start]+'const PAST_QUESTION_ALIASES='+json.dumps(aliases,ensure_ascii=False)+';\nconst AI_TO_PAST_ALIASES='+json.dumps(audit['ai_to_past'],ensure_ascii=False)+';\n'+html[end:];p.write_text(html)
