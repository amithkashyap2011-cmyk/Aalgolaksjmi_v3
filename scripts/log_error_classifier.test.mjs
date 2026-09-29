import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuantErrorLine } from './log_error_classifier.mjs';

test('counts error events rather than stderr lines', () => {
  const lines = [
    'INFO:httpx:HTTP Request: POST /system/heartbeat "HTTP/1.1 200 OK"',
    'INFO:AALGO-QUANT:ENTER Path: /predict/cnn',
    'WARNING:RegistryClient:Re-registering',
    'ERROR:RegistryClient:Heartbeat failed: ',
    'CRITICAL:engine:Unexpected failure',
    '2026-09-29 10:00:00,000 [ERROR] RegistryClient: Timeout',
    '2026-09-29 10:00:00,000 [INFO] engine: request completed',
    'Traceback (most recent call last):',
    '  File "main.py", line 1',
  ];
  assert.equal(lines.filter(isQuantErrorLine).length, 3);
});
