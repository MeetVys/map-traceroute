from backend.geo import GeoResolver


def test_known_ipv4(geo: GeoResolver):
    p = geo.resolve("1.1.1.1")
    assert p is not None
    assert p.lat == 37.77
    assert p.lng == -122.41
    assert p.city == "San Francisco"
    assert p.country == "US"


def test_known_ipv6(geo: GeoResolver):
    p = geo.resolve("2606:4700::1111")
    assert p is not None
    assert p.country == "US"


def test_private_ip_none(geo: GeoResolver):
    assert geo.resolve("192.168.1.1") is None


def test_loopback_none(geo: GeoResolver):
    assert geo.resolve("127.0.0.1") is None


def test_invalid_string_none(geo: GeoResolver):
    assert geo.resolve("not-an-ip") is None


def test_unknown_ip_none(geo: GeoResolver):
    assert geo.resolve("203.0.113.99") is None


def test_cache_hit(geo: GeoResolver):
    geo.resolve.cache_clear()
    geo.resolve("1.1.1.1")
    geo.resolve("1.1.1.1")
    info = geo.resolve.cache_info()
    assert info.hits >= 1


def test_record_missing_location_is_none(fake_reader_cls):
    rdr = fake_reader_cls(
        {"1.2.3.4": {"city": {"names": {"en": "X"}}, "country": {"names": {"en": "Y"}}}}
    )
    g = GeoResolver(db_path="(fake)", reader=rdr)
    assert g.resolve("1.2.3.4") is None


def test_reader_exception_returns_none(fake_reader_cls):
    class Boom:
        def get(self, ip):
            raise RuntimeError("db read error")

        def close(self):
            pass

    g = GeoResolver(db_path="(fake)", reader=Boom())
    assert g.resolve("1.2.3.4") is None
