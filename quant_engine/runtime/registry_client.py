import httpx
import asyncio
import logging
import os
from datetime import datetime

logger = logging.getLogger("RegistryClient")

class RegistryClient:
    def __init__(self, service_name="quant_engine"):
        self.service_name = service_name
        self.node_url = os.environ.get("REGISTRY_URL")
        if not self.node_url:
            raise ValueError("AQEA_ORCHESTRATION_ERROR: REGISTRY_URL environment variable must be set. No hardcoded addresses allowed.")
        self.registered = False
        self.port = None

    async def register(self, port, health_callback=None):
        self.port = port
        url = f"{self.node_url}/system/register"
        
        service_url = os.environ.get("QUANT_SERVICE_URL", f"http://127.0.0.1:{port}")
        
        payload = {
            "name": self.service_name,
            "url": service_url,
            "version": "11.5.0",
            "health": health_callback() if health_callback else {"status": "Online"}
        }

        while not self.registered:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, json=payload, timeout=2.0)
                    if response.status_code == 200:
                        logger.info(f"Successfully registered with Node Registry at {self.node_url}")
                        self.registered = True
                        # Start heartbeat in background
                        asyncio.create_task(self.heartbeat_loop(health_callback))
                        return True
            except Exception as e:
                logger.warning(f"Registration failed, retrying in 2s... Error: {e}")
                await asyncio.sleep(2)

    async def heartbeat_loop(self, health_callback):
        url = f"{self.node_url}/system/heartbeat"
        while self.registered:
            try:
                health = health_callback() if health_callback else {"status": "Online"}
                payload = {
                    "name": self.service_name,
                    "health": health
                }
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, json=payload, timeout=1.0)
                    if response.status_code == 200:
                        logger.info(f"Heartbeat sent successfully to {url}")
                    elif response.status_code == 404:
                        logger.warning(f"Heartbeat rejected (404): service not registered. Initiating re-registration.")
                        self.registered = False
                        break
                    else:
                        logger.error(f"Heartbeat failed with status: {response.status_code}")
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")
            await asyncio.sleep(10) # 10 second heartbeats

        if not self.registered:
            asyncio.create_task(self.register(self.port, health_callback))

registry_client = RegistryClient()
