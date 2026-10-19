import json, re, unicodedata
from pathlib import Path
from difflib import SequenceMatcher
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'legacy-app.html').read_text()
past = json.JSONDecoder().raw_decode(html.split('const QUESTIONS=')[1])[0]
library = json.loads((ROOT / 'ai_questions.json').read_text())
ai = [dict(q, set_id=s['id']) for s in library['lecture_sets'] if not s.get('archived') and s.get('eligibility_status') == 'allowed' and s.get('quality_status') == 'pass' for q in s['questions']]

def norm(s):
    s = unicodedata.normalize('NFKC', str(s)).lower()
    return re.sub(r'[^a-z0-9]', '', s)

def tokens(s):
    return re.findall(r'[a-z0-9]+', unicodedata.normalize('NFKC', str(s)).lower())

def protected(s):
    terms = set(tokens(s))
    return terms & {'not', 'except', 'least', 'most', 'left', 'right', 'increase', 'decrease', 'increased', 'decreased', 'inspiration', 'expiration', 'arterial', 'venous', 'acute', 'chronic'}

def same_numbers(a, b):
    return re.findall(r'\d+(?:\.\d+)?', a) == re.findall(r'\d+(?:\.\d+)?', b)

def choice_overlap(a, b):
    aa = [norm(v) for v in a.values() if v]
    bb = [norm(v) for v in b.values() if v]
    return sum(any(SequenceMatcher(None, x, y).ratio() >= .9 for y in bb) for x in aa)

def figure_dependent(q):
    return bool(q.get('question_figure') or q.get('figure_required') or re.search(r'picture|image|diagram|marked|labelled|labeled|this x.ray|this slide|shown|specimen', q['stem'], re.I))

groups = {}
for i, q in enumerate(past):
    groups.setdefault(norm(q['stem']), []).append(i)
exact = [v for v in groups.values() if len(v) > 1]
v = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5))
mat = v.fit_transform([q['stem'] for q in past])
scores = cosine_similarity(mat)
near = []
for i, a in enumerate(past):
    for j in range(i + 1, len(past)):
        b = past[j]
        if norm(a['stem']) == norm(b['stem']) or scores[i, j] < .70:
            continue
        ratio = SequenceMatcher(None, norm(a['stem']), norm(b['stem'])).ratio()
        if ratio < .77:
            continue
        overlap = choice_overlap(a['options'], b['options'])
        if overlap < 2:
            continue
        near.append(dict(a=a['id'], b=b['id'], stem_a=a['stem'], stem_b=b['stem'], options_a=a['options'], options_b=b['options'], similarity=round(ratio, 3), tfidf=round(float(scores[i, j]), 3), overlap=overlap, numbers_same=same_numbers(a['stem'], b['stem']), protected_same=protected(a['stem']) == protected(b['stem']), figures=figure_dependent(a) or figure_dependent(b)))
out = dict(past_count=len(past), ai_count=len(ai), exact_groups=[[past[i]['id'] for i in group] for group in exact], near=near, cross=[dict(past=p['id'], ai=a['id'], past_options=p['options'], ai_options=a['options'], stem=a['stem']) for a in ai for p in past if norm(a['stem']) == norm(p['stem'])])
(ROOT / 'duplicate-candidates.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print('Past:', len(past), 'AI:', len(ai), 'exact groups:', len(exact), 'near candidates:', len(near), 'cross-bank:', len(out['cross']))
for x in near:
    print(f"{x['a']} | {x['b']} | {x['similarity']} | choices {x['overlap']} | nums {x['numbers_same']} protected {x['protected_same']} figs {x['figures']}\n  {x['stem_a']}\n  {x['stem_b']}")
print('CROSS', json.dumps(out['cross'], ensure_ascii=False))
