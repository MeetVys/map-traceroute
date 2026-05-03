from __future__ import annotations

import pytest

from backend.geo import GeoResolver


class FakeReader:
    def __init__(self, records: dict[str, dict]) -> None:
        self._records = records

    def get(self, ip: str):
        return self._records.get(ip)

    def close(self) -> None:
        pass


DEFAULT_RECORDS = {
    "1.1.1.1": {
        "city": {"names": {"en": "San Francisco"}},
        "country": {"names": {"en": "US"}},
        "location": {"latitude": 37.77, "longitude": -122.41},
    },
    "8.8.8.8": {
        "city": {"names": {"en": "Mountain View"}},
        "country": {"names": {"en": "US"}},
        "location": {"latitude": 37.39, "longitude": -122.08},
    },
    "151.101.1.69": {
        "city": {"names": {"en": "London"}},
        "country": {"names": {"en": "GB"}},
        "location": {"latitude": 51.50, "longitude": -0.12},
    },
    "2606:4700::1111": {
        "city": {"names": {"en": "San Francisco"}},
        "country": {"names": {"en": "US"}},
        "location": {"latitude": 37.77, "longitude": -122.41},
    },
}


@pytest.fixture
def geo() -> GeoResolver:
    return GeoResolver(db_path="(fake)", reader=FakeReader(DEFAULT_RECORDS))


@pytest.fixture
def fake_reader_cls():
    return FakeReader
