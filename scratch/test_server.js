import http from 'http';
const server = http.createServer((req, res) => {
  res.end('Hello World');
});
server.listen(9990, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:9990/');
});
