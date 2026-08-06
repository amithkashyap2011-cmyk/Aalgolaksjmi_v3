async function go() {
  const loginRes = await fetch("http://localhost:9990/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@aalgo.local", password: "123456" })
  });
  const login = await loginRes.json();
  if (!login.token) return;
  const updateRes = await fetch("http://localhost:9990/settings/update", {
    method: "PUT", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + login.token },
    body: JSON.stringify({ allowedSymbols: ["DOGEUSDT", "SHIBUSDT"] })
  });
  console.log("UPDATE:", await updateRes.json());
}
go();
