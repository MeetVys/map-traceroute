from __future__ import annotations

import ipaddress
import logging
import threading
import time
from dataclasses import dataclass
from typing import Callable

from scapy.all import sniff  # type: ignore
from scapy.layers.inet import IP, TCP, UDP, ICMP  # type: ignore
from scapy.layers.inet6 import IPv6  # type: ignore

from .net import get_local_ips

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RawPacket:
    ts: float
    src_ip: str
    dst_ip: str
    src_local: bool
    dst_local: bool
    direction: str  # "in" | "out"
    proto: str
    length: int


def _is_routable(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    if addr.is_private or addr.is_loopback or addr.is_link_local:
        return False
    if addr.is_multicast or addr.is_reserved or addr.is_unspecified:
        return False
    return True


class Capturer:
    def __init__(self, on_packet: Callable[[RawPacket], None]) -> None:
        self._on_packet = on_packet
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._local_ips: set[str] = set()

    def start(self) -> None:
        if self.is_running():
            return
        self._stop.clear()
        self._local_ips = get_local_ips()
        self._thread = threading.Thread(target=self._run, name="capturer", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def _run(self) -> None:
        try:
            sniff(
                prn=self._handle,
                store=False,
                filter="ip or ip6",
                stop_filter=lambda _pkt: self._stop.is_set(),
            )
        except PermissionError as e:
            log.error("packet capture needs root: %s", e)
        except Exception as e:
            log.exception("sniff crashed: %s", e)

    def _handle(self, pkt) -> None:  # type: ignore[no-untyped-def]
        if IP in pkt:
            src = pkt[IP].src
            dst = pkt[IP].dst
            raw_len = getattr(pkt[IP], "len", None)
            length = int(raw_len) if raw_len else len(pkt)
        elif IPv6 in pkt:
            src = pkt[IPv6].src
            dst = pkt[IPv6].dst
            raw_len = getattr(pkt[IPv6], "plen", None)
            length = int(raw_len) if raw_len else len(pkt)
        else:
            return

        src_local = src in self._local_ips
        dst_local = dst in self._local_ips
        if src_local == dst_local:
            return
        direction = "out" if src_local else "in"
        remote = dst if src_local else src
        if not _is_routable(remote):
            return

        if TCP in pkt:
            proto = "tcp"
        elif UDP in pkt:
            proto = "udp"
        elif ICMP in pkt:
            proto = "icmp"
        else:
            proto = "other"

        raw = RawPacket(
            ts=time.time(),
            src_ip=src,
            dst_ip=dst,
            src_local=src_local,
            dst_local=dst_local,
            direction=direction,
            proto=proto,
            length=length,
        )
        try:
            self._on_packet(raw)
        except Exception as e:
            log.debug("on_packet dropped: %s", e)
