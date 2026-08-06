# MODEL VALIDATION REPORT

## Manifest Validation
- **MODEL_MANIFEST.json:** Defines expected size and schema for every model.
- **ModelValidator:** Python class that verifies `.pt` files exist and are loadable by Torch.

## Outcomes
- Invalid or missing checkpoints mark the specific model as `DEGRADED` in the registry.
- Prevents runtime crashes during inference.
