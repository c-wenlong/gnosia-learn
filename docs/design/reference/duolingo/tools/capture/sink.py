import http.server,os,json,time
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'dumps')
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Headers','*')
        self.send_header('Access-Control-Allow-Private-Network','true')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        n=int(self.headers.get('Content-Length',0)); b=self.rfile.read(n)
        name=self.path.strip('/').replace('/','_') or 'dump'
        open(os.path.join(D,name+'.json'),'wb').write(b)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok %d'%len(b))
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8765),H).serve_forever()
