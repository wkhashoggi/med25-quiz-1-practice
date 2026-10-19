"""Apply reviewed duplicate groups while archiving every removed source variant."""
import collections
import copy
import hashlib
import json
import re
import subprocess
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def read(name): return json.loads((ROOT / name).read_text())
def write(name, value): (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def norm(value): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKC', str(value)).lower())
html = (ROOT / 'legacy-app.html').read_text()
start = html.index('const QUESTIONS=') + len('const QUESTIONS=')
past, end = json.JSONDecoder().raw_decode(html[start:])
by_id = {q['id']: q for q in past}
index = {q['id']: i for i, q in enumerate(past)}
candidates = read('duplicate-candidates.json')
assert len(past) == candidates['past_count'], 'Run the review scan again before applying a different bank.'
parent = {q['id']: q['id'] for q in past}
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
def union(a, b):
    a, b = find(a), find(b)
    if a != b: parent[b] = a

figure_terms = re.compile(r'picture|image|diagram|marked|labelled|labeled|this x.ray|this slide|shown|specimen', re.I)
figure_exceptions = []
for group in candidates['exact_groups']:
    if any(by_id[i].get('question_figure') or by_id[i].get('figure_required') or figure_terms.search(by_id[i]['stem']) for i in group):
        figure_exceptions.append(dict(ids=group, reason='Identical generic prompts can identify different images. Only visually confirmed source copies are merged.'))
        continue
    for other in group[1:]: union(group[0], other)

# Every candidate below was reviewed against both full stems and the options.
# Keep opposite mechanisms, different figures/marks, and different clinical cases.
distinct = {
    9: 'IgE-mediated versus T-cell-mediated hypersensitivity',
    10: 'Ventricular depolarization versus repolarization',
    24: 'Closing versus widening the laryngeal inlet',
    25: 'Closing versus widening the laryngeal inlet',
    77: 'Sarcoidosis diagnosis versus its immune-cell mechanism',
    85: 'Image comparison handled in the separate visual review',
    98: 'Right lung versus left lung cardiac impressions',
    99: 'Formation of the bulla versus drainage onto it',
    102: 'Different clinical cough cases, one including amlodipine',
    105: 'Image comparison handled in the separate visual review',
    106: 'Different numbered marks on a spirogram',
    107: 'Different lettered marks on a graph',
    110: 'Different labeled regions on a graph',
    111: 'Different clinical cough cases, one including amlodipine',
}
reviewed_near = []
for n, row in enumerate(candidates['near']):
    if n in distinct:
        reviewed_near.append(dict(a=row['a'], b=row['b'], decision='keep_distinct', reason=distinct[n]))
    else:
        assert not row['figures']
        union(row['a'], row['b'])
        reviewed_near.append(dict(a=row['a'], b=row['b'], decision='merge', reason='Same complete question and clinical target; spelling, formatting, minor copy edits or reordered choice variants.'))

# Visual review: same radiograph and same arrow/diagnosis, copied into different papers.
visual_groups = [
    ['rs-med24-final-p56-q2-94', 'rs-module3-p135-q116'],
    ['rs-med24-final-p58-q5-97', 'rs-module3-p136-q119'],
    ['rs-med24-final-p57-q3-95', 'rs-module3-p135-q117'],
    ['rs-med24-final-p61-q6-103', 'rs-module3-p94-q10'],
    ['rs-med24-final-p62-q8-105', 'rs-module3-p104-q42', 'rs-module3-p136-q122'],
    ['rs-med24-final-p62-q7-104', 'rs-module3-p136-q121', 'rs-module3-p56-q71'],
]
for group in visual_groups:
    for other in group[1:]: union(group[0], other)
for row in reviewed_near:
    if row['reason'] == 'Image comparison handled in the separate visual review':
        row['decision'] = 'merge'
        row['reason'] = 'Visual review confirmed the same radiograph and diagnostic target in these source copies.'

groups = collections.defaultdict(list)
for q in past: groups[find(q['id'])].append(q)

def rank(q):
    # Prefer a complete, already checked card; keep its actual wording, key and explanation.
    usable = bool(q.get('answer') and q.get('exam_ready') is not False and len(q['options']) >= 4)
    reviewed = bool(q.get('review_references') or q.get('medical_review_references') or q.get('proofreading_status') == 'resolved')
    return (usable, reviewed, q.get('proofreading_status') != 'needs_review', not q['id'].startswith('rs-module3'), -index[q['id']])

alias_match = re.search(r'const PAST_QUESTION_ALIASES=(\{[^\n]*\});', html)
assert alias_match
aliases = json.loads(alias_match[1])
merges = []
redirect = {}
kept = []
metadata_fields = ['past_paper_sources', 'question_repeat_count', 'duplicate_question_ids', 'tags', 'concepts', 'repeated_concepts', 'repeat_count', 'high_yield', 'high_yield_reason', 'bank_aliases', 'concept_question_count']
for group in groups.values():
    original = max(group, key=rank)
    target = copy.deepcopy(original)
    kept.append(target)
    if len(group) < 2: continue
    removed = [q for q in group if q['id'] != target['id']]
    refs, seen = [], set()
    for q in group:
        for ref in q.get('past_paper_sources', []):
            key = ref.get('source_question_id') or json.dumps([ref.get('file'), ref.get('page'), ref.get('number')])
            if key not in seen: refs.append(ref); seen.add(key)
    target['past_paper_sources'] = refs
    target['question_repeat_count'] = len(refs) or 1
    for field in ['tags', 'concepts', 'repeated_concepts', 'duplicate_question_ids']:
        target[field] = list(dict.fromkeys(item for q in group for item in q.get(field, [])))
    target['duplicate_question_ids'] = list(dict.fromkeys(target['duplicate_question_ids'] + [q['id'] for q in removed]))
    target['bank_aliases'] = list(dict.fromkeys(item for q in group for item in [q['bank'], *q.get('bank_aliases', [])]))
    target['high_yield'] = any(q.get('high_yield') for q in group)
    for q in removed:
        redirect[q['id']] = target['id']
        option_map = {}
        for letter, text in q['options'].items():
            same = [key for key, value in target['options'].items() if norm(text) == norm(value)]
            if len(same) == 1: option_map[letter] = same[0]
            else:
                close = [(SequenceMatcher(None, norm(text), norm(value)).ratio(), key) for key, value in target['options'].items()]
                close.sort(reverse=True)
                if close and close[0][0] >= .94 and (len(close) == 1 or close[0][0] - close[1][0] >= .08): option_map[letter] = close[0][1]
        aliases[q['id']] = dict(id=target['id'], options=q['options'], option_map=option_map, preserve_progress=True)
    merges.append(dict(retained_id=target['id'], original_retained=original, variants=removed, reason='Reviewed duplicate question; original clinical content and answer of the retained card are unchanged.'))

def resolve(i):
    seen = set()
    while i in redirect:
        assert i not in seen
        seen.add(i); i = redirect[i]
    return i

# Flatten old alias chains as well, including copies removed by earlier imports.
for old_id, alias in aliases.items():
    previous = alias['id']
    final = resolve(previous)
    if final != previous:
        intermediate = aliases.get(previous, {})
        if alias.get('option_map'):
            alias['option_map'] = {k: intermediate.get('option_map', {}).get(v, v) for k, v in alias['option_map'].items()}
        alias['id'] = final

kept.sort(key=lambda q: index[q['id']])
concepts = collections.defaultdict(set)
for q in kept:
    for concept in set(q.get('concepts', []) + q.get('repeated_concepts', [])): concepts[concept].add(q['id'])
for q in kept:
    if not any(q['id'] == m['retained_id'] for m in merges): continue
    repeated = [c for c in dict.fromkeys(q.get('concepts', []) + q.get('repeated_concepts', [])) if len(concepts[c]) >= 2]
    q['repeated_concepts'] = repeated
    q['concept_question_count'] = max([len(concepts[c]) for c in repeated] or [0])
    q['repeat_count'] = q['concept_question_count']
    if repeated: q['high_yield'] = True

# One AI card copies a Past Paper stem verbatim. Keep the authentic Past Paper card.
cross = candidates['cross']
assert len(cross) == 1
library = read('ai_questions.json')
ai_aliases = {}
removed_ai = []
for pair in cross:
    for source_set in library['lecture_sets']:
        matching = [q for q in source_set['questions'] if q['id'] == pair['ai']]
        if not matching: continue
        question = matching[0]
        removed_ai.append(dict(set_id=source_set['id'], question=question, retained_past_id=resolve(pair['past'])))
        source_set['questions'] = [q for q in source_set['questions'] if q['id'] != pair['ai']]
        ai_aliases[pair['ai']] = dict(id=resolve(pair['past']), options=question['options'], option_map={'A': 'A'}, preserve_progress=True)
write('ai_questions.json', library)
supplement = read('med25-daily-supplement.json')
for n, source_set in enumerate(supplement.get('ai_sets', [])):
    replacement = next((s for s in library['lecture_sets'] if s['id'] == source_set['id']), None)
    if replacement: supplement['ai_sets'][n] = replacement
write('med25-daily-supplement.json', supplement)

audit = dict(date='2026-10-19', baseline_commit=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip(), before_past=len(past), after_past=len(kept), removed_past=len(redirect), removed_ai=len(removed_ai), aliases=redirect, ai_to_past=ai_aliases, groups=merges, removed_ai_questions=removed_ai, reviewed_near_pairs=reviewed_near, distinct_image_prompt_groups=figure_exceptions, visually_confirmed_duplicates=visual_groups, preserved_metadata_fields=metadata_fields)
write('question-deduplication-audit.json', audit)
html = html[:start] + json.dumps(kept, ensure_ascii=False, indent=2) + html[start + end:]
html = re.sub(r'const PAST_QUESTION_ALIASES=\{[^\n]*\};', lambda _: 'const PAST_QUESTION_ALIASES=' + json.dumps(aliases, ensure_ascii=False) + ';\nconst AI_TO_PAST_ALIASES=' + json.dumps(ai_aliases, ensure_ascii=False) + ';', html, count=1)
html = html.replace("q.bank==='Coordinator Formative Quiz 2'", "(q.bank==='Coordinator Formative Quiz 2'||(q.bank_aliases||[]).includes('Coordinator Formative Quiz 2'))")
html = html.replace("q.bank===b||(q.past_paper_sources||[])", "q.bank===b||(q.bank_aliases||[]).includes(b)||(q.past_paper_sources||[])")
(ROOT / 'legacy-app.html').write_text(html)
mapping = read('question-study-guide-map.json')
coverage = read('source-coverage-audit.json')
active_ai = [q for s in library['lecture_sets'] if not s.get('archived') and s.get('eligibility_status') == 'allowed' and s.get('quality_status') == 'pass' for q in s['questions']]
for lecture in coverage['lectures']:
    lecture['past_questions'] = sum(mapping['past'].get(q['id'], {}).get('lecture_id') == lecture['lecture_id'] for q in kept)
    lecture['ai_questions'] = sum(mapping['ai'].get(q['id'], {}).get('lecture_id') == lecture['lecture_id'] for q in active_ai)
coverage['active_ai_questions'] = len(active_ai)
write('source-coverage-audit.json', coverage)
print(json.dumps({k: audit[k] for k in ['before_past', 'after_past', 'removed_past', 'removed_ai']}))
