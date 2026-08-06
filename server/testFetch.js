async function test() {
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol=ADAUSDT");
    const data = await res.json();
    console.log("Success:", data);
  } catch (err) {
    console.log("Error:", err.message);
  }
}
test();
