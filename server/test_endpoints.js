async function test() {
  const apiGatewayUrl = process.env.API_GATEWAY_URL;
  if (!apiGatewayUrl) throw new Error("API_GATEWAY_URL not defined");
  try {
    const resAuth = await fetch(`${apiGatewayUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "demo@aalgo.local", password: "123456" })
    });
    const auth = await resAuth.json();
    const token = auth.token;
    console.log("Token:", token.substring(0, 15) + "...");

    const resBal = await fetch(`${apiGatewayUrl}/wallet/balance?mode=PAPER&accountType=FUTURES`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const bal = await resBal.json();
    console.log("/wallet/balance response realizedPnL:", bal.realizedPnL);

    const resHist = await fetch(`${apiGatewayUrl}/trading/history?mode=PAPER`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const hist = await resHist.json();
    console.log("/trading/history trades count:", hist.trades?.length);
    
    if (hist.trades && hist.trades.length > 0) {
      const today = new Date();
      today.setUTCHours(0,0,0,0);
      const pnl = hist.trades
        .filter(t => t.status === "CLOSED" && new Date(t.closedAt || t.openedAt).getTime() >= today.getTime())
        .reduce((s, t) => s + (t.pnl || 0), 0);
      console.log("Calculated realizedPnl from history:", pnl);
    }
  } catch (err) {
    console.error(err);
  }
}
test();
