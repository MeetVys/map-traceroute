from backend.net import get_local_ips


def test_local_ips_non_empty():
    ips = get_local_ips()
    assert isinstance(ips, set)
    assert len(ips) > 0


def test_includes_loopback():
    ips = get_local_ips()
    assert "127.0.0.1" in ips


def test_stable_across_calls():
    a = get_local_ips()
    b = get_local_ips()
    assert a == b
