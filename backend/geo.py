from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import maxminddb

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeoPoint:
    lat: float
    lng: float
    city: Optional[str]
    country: Optional[str]


class GeoResolver:
    def __init__(self, db_path: str, reader: object | None = None) -> None:
        self._reader = reader if reader is not None else maxminddb.open_database(db_path)

    @lru_cache(maxsize=10_000)
    def resolve(self, ip: str) -> Optional[GeoPoint]:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return None
        if not addr.is_global:
            return None
        try:
            rec = self._reader.get(ip)
        except Exception as e:
            log.debug("geo lookup failed for %s: %s", ip, e)
            return None
        if not rec:
            return None
        loc = rec.get("location") or {}
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        if lat is None or lng is None:
            return None
        city = (rec.get("city") or {}).get("names", {}).get("en")
        country = (rec.get("country") or {}).get("names", {}).get("en")
        return GeoPoint(float(lat), float(lng), city, country)

    def close(self) -> None:
        self._reader.close()
