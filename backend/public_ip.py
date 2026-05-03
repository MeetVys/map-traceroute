from __future__ import annotations

import logging
import urllib.error
import urllib.request
import json

log = logging.getLogger(__name__)


def fetch_public_ip(timeout: float = 2.0) -> str | None:
    """One-shot lookup of the user's public IP. Returns None on failure."""
    for url in ("https://api.ipify.org?format=json", "https://ifconfig.me/all.json"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "map-traceroute/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                ip = data.get("ip") or data.get("ip_addr")
                if ip:
                    return str(ip)
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            log.debug("public IP lookup via %s failed: %s", url, e)
    return None
