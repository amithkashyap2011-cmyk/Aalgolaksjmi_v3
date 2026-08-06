import { config } from "dotenv";
config({ path: "./.env" });
const go = async () => {
  const login = await fetch("process.env.API_GATEWAY_URL/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@aalgo.local", password: "123456" })
  }).then(r => r.json());
  console.log("LOGIN:", login.token ? "OK" : login);
  if (!login.token) return;
  const update = await fetch("process.env.API_GATEWAY_URL/settings/update", {
    method: "PUT", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + login.token },
    body: JSON.stringify({ allowedSymbols: ["DOGEUSDT"] })
  }).then(r => r.json());
  console.log("UPDATE:", update);
};
go();
