import jwt from "jsonwebtoken";

const token = jwt.sign({ sub: "69c2bc93c8601b4eaf3abe2f" }, "CHANGE_ME_IN_PRODUCTION_12345", { expiresIn: "7d" });

async function run() {
  const apiGatewayUrl = process.env.API_GATEWAY_URL;
  if (!apiGatewayUrl) throw new Error("API_GATEWAY_URL not defined");
  try {
    const res = await fetch(`${apiGatewayUrl}/health`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (err) {
    console.error(err);
  }
}
run();
