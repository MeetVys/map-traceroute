import psutil


def get_local_ips() -> set[str]:
    ips: set[str] = set()
    for addrs in psutil.net_if_addrs().values():
        for a in addrs:
            if a.address:
                ips.add(a.address.split("%")[0])
    return ips
