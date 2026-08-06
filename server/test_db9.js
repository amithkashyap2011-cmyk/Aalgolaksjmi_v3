import fetch from 'node-fetch';

setInterval(async () => {
    try {
        const res = await fetch('process.env.API_GATEWAY_URL/ticker-prices');
        console.log(await res.json());
    } catch(e) {}
}, 2000);
