"""배포 전에 실행: python3 tools/bump.py analyze check  (페이지 이름 여러 개 가능)
version.json의 숫자와 그 페이지 안의 버전 숫자(V=)를 함께 1씩 올린다.
페이지는 열릴 때 version.json을 새로 받아 보고, 자기 숫자가 낮으면 ?v=새숫자 주소로 다시 열어 예전 캐시를 건너뛴다."""
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
FILES = {"analyze": "analyze/index.html", "check": "check/index.html", "plans": "plans/index.html", "app": "app/index.html"}
ver = json.loads((ROOT / "version.json").read_text())
for name in sys.argv[1:]:
    ver[name] = ver.get(name, 0) + 1
    f = ROOT / FILES[name]; s = f.read_text()
    s, n = re.subn(r'var V=\d+,K="%s"' % name, 'var V=%d,K="%s"' % (ver[name], name), s)
    assert n == 1, f"{f}: 버전 줄을 못 찾음"
    f.write_text(s); print(f"{name} -> {ver[name]}")
(ROOT / "version.json").write_text(json.dumps(ver, ensure_ascii=False, indent=1) + "\n")
