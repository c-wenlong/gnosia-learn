#!/usr/bin/env python3
"""Tiny OpenPencil MCP client. Usage: op.py list | op.py call <tool> '<json args>' | op.py desc <tool>"""
import json, sys, urllib.request, os
CFG = json.load(open(os.path.expanduser('~/Library/Application Support/OpenPencil/mcp.json')))
URL = f"http://127.0.0.1:{CFG['httpPort']}/mcp"
HDR = {"Authorization": f"Bearer {CFG['authToken']}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
import tempfile
SIDFILE = os.path.join(tempfile.gettempdir(), 'openpencil-mcp-session')
def post(body, sid=None):
    h = dict(HDR)
    if sid: h['mcp-session-id'] = sid
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read().decode(); ct = r.headers.get('content-type','')
        newsid = r.headers.get('mcp-session-id')
    if 'text/event-stream' in ct:
        data = [l[5:].strip() for l in raw.splitlines() if l.startswith('data:')]
        raw = data[-1] if data else '{}'
    return (json.loads(raw) if raw.strip() else {}), newsid
def session():
    if os.path.exists(SIDFILE):
        sid = open(SIDFILE).read().strip()
        try:
            post({"jsonrpc":"2.0","id":0,"method":"ping"}, sid); return sid
        except Exception: pass
    _, sid = post({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"claude-code","version":"1"}}})
    post({"jsonrpc":"2.0","method":"notifications/initialized"}, sid)
    open(SIDFILE,'w').write(sid); return sid
def main():
    sid = session(); cmd = sys.argv[1]
    if cmd == 'list':
        r,_ = post({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}, sid)
        for t in r['result']['tools']:
            print('###', t['name']); print(t.get('description','')[:500].strip())
            print('  params:', json.dumps(t.get('inputSchema',{}).get('properties',{}))[:800]); print()
    elif cmd == 'desc':
        r,_ = post({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}, sid)
        for t in r['result']['tools']:
            if t['name'] == sys.argv[2]: print(json.dumps(t, indent=1))
    elif cmd == 'call':
        args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        r,_ = post({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":sys.argv[2],"arguments":args}}, sid)
        res = r.get('result', r)
        for c in res.get('content', []):
            if c.get('type') == 'text': print(c['text'])
            else: print('[' + c.get('type','?') + ' content]')
        if res.get('isError'): print('ISERROR'); sys.exit(1)
        if 'error' in r: print('ERROR', json.dumps(r['error'])); sys.exit(1)
main()
