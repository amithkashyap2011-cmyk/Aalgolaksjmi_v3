from quant_engine.cnn_predictor import CNNPredictor
import numpy as np

predictor = CNNPredictor()
ohlcv = [60000, 60100, 59900, 60050, 100]
indicators = [0.01, 0.05, 0.02, 0.03, 0.01, 60000, 60000]

try:
    res = predictor.predict(ohlcv, indicators)
    print("CNN Predict:", res)
except Exception as e:
    print("CNN Predict Failed:", e)
