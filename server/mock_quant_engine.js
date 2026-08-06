import http from "http";

const server = http.createServer((req, res) => {
  if (req.url === "/research/predict/transformer-micro") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      outcome: "CONTINUATION",
      confidence: 0.85,
      probabilities: { continuation: 0.85, exhaustion: 0.10, trap: 0.05 },
      modelName: "transformer-micro-mock"
    }));
  } else if (req.url === "/research/predict/mamba") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      direction: "LONG",
      confidence: 0.78,
      probability: 0.78,
      predictor: "MAMBA_MOCK"
    }));
  } else if (req.url === "/research/regime/forecast") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      forecasted_regime: "TRANSITION",
      confidence: 0.88,
      transition_probabilities: {
        "TRENDING_BULL": 0.05,
        "TRENDING_BEAR": 0.05,
        "RANGING": 0.02,
        "TRANSITION": 0.88,
        "HIGH_VOLATILITY": 0.00
      },
      horizon: "10 bars",
      modelName: "mock-forecaster"
    }));
  } else if (req.url === "/research/predict/cnn") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      direction: "LONG",
      confidence: 0.85,
      probability: 0.85,
      predictor: "CNN_1D_V1"
    }));
  } else if (req.url === "/research/predict/ppo") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      direction: "LONG",
      confidence: 0.90,
      probability: 0.90,
      meta: { recommendedAction: "INCREASE_SIZE" }
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = process.env.PORT;
if (!PORT) throw new Error("PORT not defined");

server.listen(PORT, () => {
  console.log(`Mock Quant Engine running on port ${PORT}`);
});
