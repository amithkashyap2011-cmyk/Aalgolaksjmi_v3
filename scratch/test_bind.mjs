import http from 'node:http';

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Diagnostic OK');
});

const PORT = 9992;
try {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Diagnostic server listening on ${PORT}`);
    process.exit(0);
  });
} catch (err) {
  console.error(`Listen failed: ${err.message}`);
  process.exit(1);
}
