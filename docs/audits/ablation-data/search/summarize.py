import json,glob,collections
f=sorted(glob.glob('results/results-*.json'))[-1]
d=json.load(open(f))
print(f, d['env']['deno'], d['env']['cpu'], 'loadavg', d['env']['loadavgStart'], d['env']['loadavgEnd'])
bad=[r for r in d['results'] if r['kind'].startswith(('equivalent','baseline')) and not r['sameIdsAsBaseline']]
print('equivalent/baseline variants with id mismatch:',len(bad),[ (r['fixture'],r['query'],r['variant']) for r in bad])
inv=[r for r in d['results'] if r['kind'].startswith('invariant') and not r['sameIdsAsBaseline']]
print('invariant-dependent mismatches:',len(inv))
for r in d['results']:
    if r['variant'].startswith('N1') and r.get('foreignRows'):
        print('N1 leak', r['fixture'], r['query'], 'foreignRows', r['foreignRows'])
# speedup table: median ms by fixture for key queries
M=collections.defaultdict(dict)
for r in d['results']: M[(r['fixture'],r['query'])][r['variant'].split(' ')[0]]=r
print('\nfixture | query | replica med/p95 | A1 | A2 | A3 | T1 | T2 | T3 | service')
for (fx,q),v in M.items():
    if not q.startswith('docs:'): continue
    g=lambda k: f"{v[k]['median']:.2f}" if k in v else '-'
    print(fx,q,f"{v['sql-replica']['median']:.2f}/{v['sql-replica']['p95']:.2f}",*[g(k) for k in ['A1','A2','A3','T1','T2','T3']],g('service(real'),sep=' | ')
print()
for (fx,q),v in M.items():
    if q.startswith('apps:'):
        print(fx,q,*[f"{k}={v[k]['median']:.3f}" for k in v],sep=' ')
for (fx,q),v in M.items():
    if q.startswith(('personal','suggest')):
        print(fx,q,*[f"{k}={v[k]['median']:.3f}" for k in v],sep=' ')
# T1 recall loss, T2 order divergence
print('\nhits (replica/T1/T2/T3/hit-ids differ?)')
for (fx,q),v in M.items():
    if q.startswith('docs:') and fx=='m10k':
        print(q,'replica hits',v['sql-replica']['hits'],'T1 hits',v['T1']['hits'],'T2 same',v['T2']['sameIdsAsBaseline'],'previewChars base/T3',v['sql-replica'].get('previewChars'),v['T3'].get('previewChars'))
