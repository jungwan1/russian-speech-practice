#!/usr/bin/env python3
"""Static checks for the 에떠해설 page and the published recordings."""
import datetime
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "etto.html").read_text(encoding="utf-8")
JW1 = (ROOT / "jw1.html").read_text(encoding="utf-8")
AUDIO = ROOT / "audio" / "etto"

buttons = re.findall(
    r'<button type="button" class="ettoDate" data-date="([^"]+)" data-time="([^"]+)" data-file="([^"]+)">([^<]+)</button>',
    HTML,
)
assert len(buttons) == 23, len(buttons)
files = list(AUDIO.glob("*.m4a"))
assert len(files) == 24, len(files)
assert {p.name for p in files} == {b[2] for b in buttons} | {"first-commentary.m4a"}
sections = re.findall(r'data-year="(\d{4})" data-month="(\d+)"', HTML)
assert len(sections) == 23
month_counts = Counter(m for y, m in sections)
assert month_counts == {"11": 2, "10": 5, "9": 4, "8": 3, "6": 3, "5": 6}, month_counts
assert {y for y, m in sections} == {"2026"}
assert ">2025년<" not in HTML
assert HTML.find(">2026년<") < HTML.find(">이전<")
assert ">첫해설<" in HTML
assert 'data-file="first-commentary.m4a"' in HTML
assert "2024년 8월 18일 (일) 16:51" in HTML
assert "20240818" not in HTML and "165103" not in HTML
assert HTML.count("<audio ") == 1 and 'id="playerAudio"' in HTML
assert "position:fixed" in HTML and 'id="pauseBtn"' in HTML and 'id="stopBtn"' in HTML
assert "source.src='audio/etto/'" in HTML and "source.type='audio/mp4'" in HTML

home = JW1.split('<div id="view-home"', 1)[1].split('<div id="view-reference"', 1)[0]
for banned in ("파수대 해설준비", ">글렙<", ">비올레따<", ">이번주 파수대<"):
    assert banned not in home, banned
assert ">에떠해설</a>" in home
assert 'href="etto.html"' in home
for kept in (
    "📖 일용할 성구",
    "11월 8일(일) 마치는 기도",
    "11월 9–15일 영적 보물 찾기 (예레미야 51–52) 사회",
    "11월 16–22일 마치는 기도",
    "지난 연설 보기",
    "const GLEB_CARDS=",
    "const REF_DATA=",
    "const WT_HTML=",
    'id="view-gleb"',
    'id="view-violetta"',
    'id="view-reference"',
):
    assert kept in JW1, kept

assert HTML.count("날짜는 파일 생성일 기준입니다.") == 1
assert "autoplay" not in HTML.lower()
assert "mybox" not in HTML.lower() and "resourcekey" not in HTML.lower()
assert "samsung" not in HTML.lower()
assert not re.search(r'<source src="https?:', HTML)

# Latest-first, and same-date rows differ by time.
stamps = []
for date, time, filename, label in buttons:
    y, m, d = date.split("-")
    expect = f"{int(y)}년 {int(m)}월 {int(d)}일 {time}"
    assert label == expect, (label, expect)
    stamps.append((date, time, filename))
assert stamps == sorted(stamps, reverse=True)
dates = [s[0] for s in stamps]
assert len(set(dates)) == 20
assert dates.count("2026-10-11") == 2
assert dates.count("2026-10-09") == 2
assert dates.count("2026-06-07") == 2

assert 'id="caveat-11"' in HTML and "다시 저장된 파일일 수 있어" in HTML
assert 'id="caveat-07"' in HTML and "약 67초" in HTML
assert HTML.count('class="ettoCaveat"') == 2
assert "원래 해설 시각으로 단정하지 않습니다." in HTML
assert "원래 시각으로 단정하지 않습니다." in HTML

kst = datetime.timezone(datetime.timedelta(hours=9))
for date, time, filename, label in buttons:
    path = AUDIO / filename
    probe = json.loads(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-print_format", "json", str(path)],
        text=True,
    ))
    assert len(probe["streams"]) == 1
    stream = probe["streams"][0]
    assert stream["codec_type"] == "audio" and stream["codec_name"] == "aac"
    assert stream["sample_rate"] == "48000" and stream["channels"] == 1
    tags = probe["format"].get("tags") or {}
    stream_tags = stream.get("tags") or {}
    blob = " ".join(list(tags) + list(stream_tags)).lower()
    assert "samsung" not in blob and "android" not in blob and "com." not in blob
    raw = tags["creation_time"]
    dt = datetime.datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S.000000Z").replace(tzinfo=datetime.timezone.utc)
    got = dt.astimezone(kst)
    assert got.strftime("%Y-%m-%d") == date, (filename, got, date)
    assert got.strftime("%H:%M:%S") == time, (filename, got, time)
    if filename == "etto_07.m4a":
        stream_raw = stream_tags["creation_time"]
        sdt = datetime.datetime.strptime(stream_raw, "%Y-%m-%dT%H:%M:%S.000000Z").replace(tzinfo=datetime.timezone.utc)
        assert int((dt - sdt).total_seconds()) == 67
        assert time == "17:17:39"

first = json.loads(subprocess.check_output(
    ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-print_format", "json", str(AUDIO / "first-commentary.m4a")],
    text=True,
))
assert len(first["streams"]) == 1
fs = first["streams"][0]
assert fs["codec_name"] == "aac" and fs.get("profile") == "LC"
assert abs(float(first["format"]["duration"]) - 15.533) < 0.01
assert "creation_time" not in (first["format"].get("tags") or {})
assert "creation_time" not in (fs.get("tags") or {})

raw_bytes = b"".join(p.read_bytes() for p in files)
for needle in (b"com.samsung", b"com.android", b"MYBOX", b"resourceKey"):
    assert needle not in raw_bytes, needle

print("static ok", len(buttons), "controls", len(set(dates)), "dates")
