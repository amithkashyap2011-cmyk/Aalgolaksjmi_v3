import torch
import numpy as np
import logging
from research.models.mamba_ssm import MambaModel

logger = logging.getLogger("AALGO-MAMBA")

class MambaPredictor:
    def __init__(self, d_model=12, n_layers=4, d_state=32):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = MambaModel(d_model=d_model, n_layers=n_layers, d_state=d_state).to(self.device)
        self.model.eval()
        
        self.directions = ["LONG", "SHORT", "HOLD"]

    def predict(self, sequence_data):
        """
        Runs inference on a sequence of feature vectors.
        Expected shape: (seq_len, features)
        """
        try:
            # sequence_data: list of lists
            seq = np.array(sequence_data, dtype=np.float32)
            if len(seq.shape) == 2:
                seq = np.expand_dims(seq, axis=0) # Add batch dim
            
            input_tensor = torch.FloatTensor(seq).to(self.device)
            
            with torch.no_grad():
                output = self.model(input_tensor)
                probs = torch.softmax(output, dim=1).cpu().numpy()[0]
            
            idx = np.argmax(probs)
            return {
                "direction": self.directions[idx],
                "confidence": float(np.max(probs)),
                "probability": float(probs[idx]),
                "probabilities": probs.tolist()
            }
        except Exception as e:
            logger.error(f"Mamba inference error: {e}")
            return {
                "direction": "HOLD",
                "confidence": 0.0,
                "probability": 0.33,
                "error": str(e)
            }

mamba_predictor = MambaPredictor()
