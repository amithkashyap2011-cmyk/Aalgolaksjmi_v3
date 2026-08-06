const { io } = require('socket.io-client');
const s = io('http://localhost:9991');
s.on('connect', ()=>console.log('[SOCKET] connected', s.id));
s.on('performance', d=>console.log('[PERF]', JSON.stringify(d)));
s.on('connect_error', e=>{console.error('[SOCKET] connect_error', e); process.exit(1)});
setInterval(()=>{},1e6);
