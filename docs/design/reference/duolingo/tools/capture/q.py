#!/usr/bin/env python3
"""q.py DUMP [filter-substring ...] : list nodes with data-test/role/aria/text matching (or all interactive if none)."""
import json,sys
d=json.load(open(f'dumps/{sys.argv[1]}.json')); f=sys.argv[2:]
print(d['meta'])
for n in d['nodes']:
    lab=' '.join(str(n.get(k,'')) for k in ('dt','role','aria-label','tx','href','cl'))
    inter=n['t'] in('button','a','input','select','textarea') or n.get('role') in('button','link','tab','checkbox','switch','radio','menuitem') or 'dt' in n
    if (f and all(x.lower() in lab.lower() for x in f)) or (not f and inter):
        print(n['i'],n['t'],n['r'],n.get('dt',''),n.get('role',''),n.get('aria-label',''),repr(n.get('tx',''))[:40],n.get('href','')[:40])
