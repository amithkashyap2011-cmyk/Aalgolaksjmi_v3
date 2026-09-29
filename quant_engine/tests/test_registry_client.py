import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict(os.environ, {"REGISTRY_URL": "http://127.0.0.1:9991"}):
    from runtime.registry_client import RegistryClient


class RegistryRecoveryTest(unittest.IsolatedAsyncioTestCase):
    def client(self):
        with patch.dict(os.environ, {"REGISTRY_URL": "http://127.0.0.1:9991"}):
            return RegistryClient()

    async def test_rejected_registration_backs_off(self):
        http = AsyncMock()
        http.post.return_value = MagicMock(status_code=503)
        with patch("runtime.registry_client.httpx.AsyncClient") as factory, \
             patch("runtime.registry_client.asyncio.sleep", new_callable=AsyncMock) as sleep:
            factory.return_value.__aenter__.return_value = http
            sleep.side_effect = asyncio.CancelledError
            with self.assertRaises(asyncio.CancelledError):
                await self.client().register(1234)
            sleep.assert_awaited_once_with(2)
            self.assertEqual(http.post.await_count, 1)

    async def test_heartbeat_timeout_has_diagnostic_type(self):
        import httpx
        client = self.client()
        client.registered = True
        http = AsyncMock()
        http.post.side_effect = httpx.ReadTimeout("")
        with patch("runtime.registry_client.httpx.AsyncClient") as factory, \
             patch("runtime.registry_client.asyncio.sleep", new_callable=AsyncMock) as sleep:
            factory.return_value.__aenter__.return_value = http
            sleep.side_effect = asyncio.CancelledError
            with self.assertLogs("RegistryClient", level="ERROR") as logs:
                with self.assertRaises(asyncio.CancelledError):
                    await client.heartbeat_loop(None)
            self.assertIn("ReadTimeout", logs.output[0])
