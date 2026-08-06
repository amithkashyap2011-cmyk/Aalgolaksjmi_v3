const fs = require('fs');

const path = 'server/src/services/binanceService.ts';
let code = fs.readFileSync(path, 'utf8');

// Replace signedFuturesPost with newSearchParams typo fix if necessary.
// I'll apply the requested getOrder / getFuturesOrder addition explicitly using regex to find the right spot.

const insertStr = `
export async function getOrder(apiKey: string, apiSecret: string, symbol: string, orderId: string): Promise<OrderResult> {
  const params = { symbol, orderId };
  return signedGet<OrderResult>("/api/v3/order", apiKey, apiSecret, params);
}
`;

if (!code.includes('export async function getOrder')) {
    code = code.replace(/export async function placeOrder[\s\S]*?return signedPost.*?;\n}/, match => match + "\n" + insertStr);
}

fs.writeFileSync(path, code);
