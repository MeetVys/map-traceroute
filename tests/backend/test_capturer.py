from __future__ import annotations

from scapy.layers.inet import ICMP, IP, TCP, UDP
from scapy.layers.inet6 import IPv6
from scapy.layers.l2 import Ether

from backend.capturer import Capturer, RawPacket


def make_capturer(local_ips: set[str] | None = None):
    captured: list[RawPacket] = []
    c = Capturer(on_packet=captured.append)
    c._local_ips = local_ips if local_ips is not None else {"192.168.1.10"}
    return c, captured


def test_outbound_tcp():
    c, got = make_capturer()
    c._handle(IP(src="192.168.1.10", dst="1.1.1.1") / TCP())
    assert len(got) == 1
    assert got[0].direction == "out"
    assert got[0].proto == "tcp"
    assert got[0].src_ip == "192.168.1.10"
    assert got[0].dst_ip == "1.1.1.1"
    assert got[0].src_local is True
    assert got[0].dst_local is False


def test_inbound_udp():
    c, got = make_capturer()
    c._handle(IP(src="1.1.1.1", dst="192.168.1.10") / UDP())
    assert len(got) == 1
    assert got[0].direction == "in"
    assert got[0].proto == "udp"
    assert got[0].src_local is False
    assert got[0].dst_local is True


def test_loopback_dropped():
    c, got = make_capturer(local_ips={"127.0.0.1"})
    c._handle(IP(src="127.0.0.1", dst="127.0.0.1") / TCP())
    assert got == []


def test_private_both_ends_dropped():
    c, got = make_capturer(local_ips={"192.168.1.10"})
    c._handle(IP(src="192.168.1.10", dst="10.0.0.5") / TCP())
    assert got == []


def test_multicast_dropped():
    c, got = make_capturer()
    c._handle(IP(src="192.168.1.10", dst="224.0.0.1") / UDP())
    assert got == []


def test_no_ip_layer_dropped():
    c, got = make_capturer()
    c._handle(Ether())
    assert got == []


def test_icmp_proto():
    c, got = make_capturer()
    c._handle(IP(src="192.168.1.10", dst="1.1.1.1") / ICMP())
    assert len(got) == 1
    assert got[0].proto == "icmp"


def test_other_proto():
    c, got = make_capturer()
    # IP with no TCP/UDP/ICMP layer
    pkt = IP(src="192.168.1.10", dst="1.1.1.1", proto=47)  # GRE
    c._handle(pkt)
    assert len(got) == 1
    assert got[0].proto == "other"


def test_ipv6_remote_private_dropped():
    # Local is global, remote is ULA (private). Remote not routable → drop.
    c, got = make_capturer(local_ips={"2606:4700::2222"})
    c._handle(IPv6(src="2606:4700::2222", dst="fd00::1") / TCP())
    assert got == []


def test_ipv6_outbound():
    c, got = make_capturer(local_ips={"fd00::1"})
    # Local ULA (normal), remote global.
    c._handle(IPv6(src="fd00::1", dst="2606:4700::1111") / TCP())
    assert len(got) == 1
    assert got[0].direction == "out"


def test_start_stop_idempotent():
    c, _ = make_capturer()
    # start() would call scapy.sniff; don't actually start. Just ensure
    # is_running is False before start, stop is no-op.
    assert not c.is_running()
    c.stop()
    assert not c.is_running()
