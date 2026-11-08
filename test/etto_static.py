#!/usr/bin/env python3
"""Static checks for the 에떠해설 page and the published recordings."""
import datetime
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "etto.html").read_text(encoding="utf-8")
JW1 = (ROOT / "jw1.html").read_text(encoding="utf-8")
AUDIO = ROOT / "audio" / "etto"

buttons = re.findall(
    r'<button type="button" class="ettoDate" data-audio="([^"]+)" data-date="([^"]+)" data-time="([^"]+)" data-file="([^"]+)">([^<]+)</button>',
    HTML,
)
assert len(buttons) == 23, len(buttons)
files = list(AUDIO.glob("*.m4a"))
assert len(files) == 23, len(files)
assert {p.name for p in files} == {b[3] for b in buttons}

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
assert 'type="audio/mp4"' in HTML
assert HTML.count("<audio ") == 23
assert "autoplay" not in HTML.lower()
assert "mybox" not in HTML.lower() and "resourcekey" not in HTML.lower()
assert "samsung" not in HTML.lower()
for src in re.findall(r'<source src="([^"]+)"', HTML):
    assert src.startswith("audio/etto/") and not src.startswith("/"), src
    assert (ROOT / src).is_file()

# Latest-first, and same-date rows differ by time.
stamps = []
for audio_id, date, time, filename, label in buttons:
    y, m, d = date.split("-")
    expect = f"{int(y)}년 {int(m)}월 {int(d)}일 {time}"
    assert label == expect, (label, expect)
    assert audio_id == "etto-audio-" + filename[5:7]
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
for audio_id, date, time, filename, label in buttons:
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

raw_bytes = b"".join(p.read_bytes() for p in files)
for needle in (b"com.samsung", b"com.android", b"MYBOX", b"resourceKey"):
    assert needle not in raw_bytes, needle

print("static ok", len(buttons), "controls", len(set(dates)), "dates")
