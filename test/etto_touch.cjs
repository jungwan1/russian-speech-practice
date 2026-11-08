const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.env.ETTO_BASE || 'http://127.0.0.1:8765';
const OUT = process.env.ETTO_SHOTS || '/opt/cursor/artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const path = `${OUT}/${name}`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function box(page, sel) {
  return page.$eval(sel, el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
  });
}

async function state(page) {
  return page.evaluate(() => {
    const audio = document.getElementById('playerAudio');
    const player = document.getElementById('player').getBoundingClientRect();
    const visible = [...document.querySelectorAll('.ettoDate')].filter(b => !b.closest('.ettoItem').hasAttribute('hidden'));
    return {
      file: audio.dataset.file || '',
      paused: audio.paused,
      t: audio.currentTime,
      label: document.getElementById('playerLabel').textContent,
      visible: visible.map(b => b.dataset.file),
      months: [...document.querySelectorAll('#monthNav button')].map(b => b.textContent.trim()),
      monthDisplay: getComputedStyle(document.getElementById('monthNav')).display,
      dateHeadDisplay: getComputedStyle(document.getElementById('dateHead')).display,
      emptyHidden: document.getElementById('emptyNote').hidden,
      emptyText: document.getElementById('emptyNote').textContent.trim(),
      y2025: document.getElementById('year-2025').getAttribute('aria-pressed'),
      y2026: document.getElementById('year-2026').getAttribute('aria-pressed'),
      playerH: player.height,
      playerBottom: player.bottom,
      vh: window.innerHeight,
    };
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) errors.push(res.status() + ' ' + res.url());
  });
  const shots = [];

  async function openAt(vp) {
    await page.setViewport({ ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/etto.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#monthNav button');
  }

  await openAt({ width: 390, height: 844 });
  const grouped = await page.evaluate(() => {
    const map = {};
    document.querySelectorAll('.ettoItem').forEach(el => {
      const m = el.dataset.month;
      map[m] = map[m] || [];
      map[m].push(el.querySelector('.ettoDate').dataset.file);
    });
    return map;
  });
  const counts = Object.fromEntries(Object.entries(grouped).map(([m, files]) => [m, files.length]));
  assert(JSON.stringify(counts) === JSON.stringify({ 11: 2, 10: 5, 9: 4, 8: 3, 6: 3, 5: 6 }), JSON.stringify(counts));
  assert(Object.values(grouped).flat().length === 23);
  let s = await state(page);
  assert(s.y2026 === 'true' && s.y2025 === 'false', 'default year');
  assert(JSON.stringify(s.months) === JSON.stringify(['11월', '10월', '9월', '8월', '6월', '5월']), JSON.stringify(s.months));
  assert(s.visible.length === 0 && s.paused && !s.file, 'autoplay or dates visible');
  assert(s.monthDisplay === 'flex' && s.dateHeadDisplay === 'none', 'month list chrome ' + s.monthDisplay + ' ' + s.dateHeadDisplay);
  assert(Math.abs(s.playerBottom - s.vh) < 1, 'player not pinned ' + s.playerBottom);
  const playerH = s.playerH;
  shots.push(await shot(page, 'screenshot_mobile_year_months_v2.png'));

  await page.click('#year-2025');
  s = await state(page);
  assert(s.y2025 === 'true' && s.emptyText === '등록된 해설이 없습니다' && s.emptyHidden === false, JSON.stringify(s));
  assert(s.visible.length === 0 && s.monthDisplay === 'none' && s.dateHeadDisplay === 'none' && s.paused && !s.file, JSON.stringify(s));
  assert(Math.abs(s.playerH - playerH) < 1, 'player jumped on 2025');
  shots.push(await shot(page, 'screenshot_mobile_2025_empty_v2.png'));

  await page.click('#year-2026');
  s = await state(page);
  assert(s.months.length === 6 && s.visible.length === 0 && s.paused && !s.file, 'year return autoplayed');

  for (const month of ['11', '10', '9', '8', '6', '5']) {
    await page.click(`button[data-month="${month}"]`);
    s = await state(page);
    assert(JSON.stringify(s.visible) === JSON.stringify(grouped[month]), month + ' ' + JSON.stringify(s.visible));
    assert(s.paused && !s.file, 'month select started audio ' + month);
    assert(s.monthDisplay === 'none' && s.dateHeadDisplay === 'flex', 'month chrome ' + month + ' ' + s.monthDisplay);
    assert(Math.abs(s.playerH - playerH) < 1, 'player jumped on month ' + month);
    if (month !== '5') await page.click('#backToMonths');
  }

  await page.click('#backToMonths');
  await page.click('button[data-month="11"]');
  await page.click('button[data-file="etto_11.m4a"]');
  await page.waitForFunction(() => document.getElementById('playerAudio').dataset.file === 'etto_11.m4a' && !document.getElementById('playerAudio').paused);
  s = await state(page);
  assert(Math.abs(s.playerH - playerH) < 1, 'player jumped when playback started');
  shots.push(await shot(page, 'screenshot_mobile_dates_player_v2.png'));

  async function edgeTap(sel, times) {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => window.scrollBy(0, 40));
      const r = await box(page, sel);
      await page.touchscreen.tap(r.x + r.w / 2, r.bottom - 1);
    }
  }
  await edgeTap('#pauseBtn', 6);
  s = await state(page);
  assert(s.file === 'etto_11.m4a' && s.paused, 'pause edge changed track ' + JSON.stringify(s));
  await edgeTap('#playBtn', 2);
  s = await state(page);
  assert(s.file === 'etto_11.m4a' && !s.paused, 'play edge changed track ' + JSON.stringify(s));
  await edgeTap('#stopBtn', 6);
  s = await state(page);
  assert(s.file === 'etto_11.m4a' && s.paused && s.t < 0.25, 'stop edge ' + JSON.stringify(s));

  await page.evaluate(() => {
    const pause = document.getElementById('pauseBtn').getBoundingClientRect();
    const date = document.querySelector('button[data-file="etto_02.m4a"]');
    const dr = date.getBoundingClientRect();
    window.scrollBy(0, dr.top - pause.top);
  });
  const hit = await page.evaluate(() => {
    const r = document.getElementById('pauseBtn').getBoundingClientRect();
    const audio = document.getElementById('playerAudio').getBoundingClientRect();
    function describe(x, y) {
      const el = document.elementFromPoint(x, y);
      const date = el && el.closest ? el.closest('button.ettoDate') : null;
      return { id: el && el.id, tag: el && el.tagName, file: date && date.dataset.file };
    }
    return {
      pause: describe(r.x + r.width / 2, r.bottom - 1),
      stop: describe(document.getElementById('stopBtn').getBoundingClientRect().x + 8, document.getElementById('stopBtn').getBoundingClientRect().bottom - 1),
      audio: describe(audio.x + 24, audio.bottom - 1),
    };
  });
  assert(hit.pause.id === 'pauseBtn' && !hit.pause.file, JSON.stringify(hit));
  assert(hit.stop.id === 'stopBtn' && !hit.stop.file, JSON.stringify(hit));
  assert(hit.audio.id === 'playerAudio' && !hit.audio.file, JSON.stringify(hit));
  await edgeTap('#pauseBtn', 4);
  await edgeTap('#stopBtn', 4);
  s = await state(page);
  assert(s.file === 'etto_11.m4a' && s.paused, 'overlapped tap started next ' + JSON.stringify(s));
  shots.push(await shot(page, 'screenshot_mobile_pause_separated_v2.png'));

  await page.evaluate(() => {
    document.getElementById('pauseBtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    document.querySelector('button[data-file="etto_02.m4a"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  s = await state(page);
  assert(s.file === 'etto_11.m4a', 'retargeted click started next ' + s.file);

  const beforeYear = await state(page);
  await page.click('button[data-file="etto_11.m4a"]');
  await page.waitForFunction(() => !document.getElementById('playerAudio').paused);
  await page.click('#year-2025');
  s = await state(page);
  assert(s.paused && !s.file && s.emptyText === '등록된 해설이 없습니다', 'year switch left audio ' + JSON.stringify(s));
  assert(Math.abs(s.playerH - beforeYear.playerH) < 1);
  await page.click('#playBtn');
  s = await state(page);
  assert(s.paused && !s.file, 'play on empty year started audio');

  await openAt({ width: 320, height: 640 });
  shots.push(await shot(page, 'screenshot_mobile_narrow_months_v2.png'));
  await page.click('button[data-month="10"]');
  s = await state(page);
  assert(s.visible.length === 5 && s.visible[0] === 'etto_04.m4a' && s.visible[4] === 'etto_20.m4a');
  const narrowHit = await page.evaluate(() => {
    const r = document.getElementById('pauseBtn').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.bottom - 1);
    return el && el.id;
  });
  assert(narrowHit === 'pauseBtn', narrowHit);
  await page.click('button[data-file="etto_04.m4a"]');
  await page.waitForFunction(() => document.getElementById('playerAudio').dataset.file === 'etto_04.m4a' && !document.getElementById('playerAudio').paused);
  await edgeTap('#stopBtn', 5);
  s = await state(page);
  assert(s.file === 'etto_04.m4a' && s.paused, 'narrow stop hit next ' + JSON.stringify(s));
  shots.push(await shot(page, 'screenshot_mobile_narrow_dates_v2.png'));

  await page.$eval('#backToMonths', el => el.scrollIntoView({ block: 'center' }));
  await page.click('#backToMonths');
  await page.waitForSelector('button[data-month="8"]', { timeout: 3000 });
  await page.click('button[data-month="8"]');
  const aug = await page.evaluate(() => [...document.querySelectorAll('.ettoDate')].filter(b => !b.closest('.ettoItem').hasAttribute('hidden')).map(b => b.textContent.trim()));
  assert(aug[1].includes('8월 23일 17:17:39'), aug.join('|'));
  assert((await page.$eval('#caveat-07', el => el.textContent)).includes('약 67초'));

  assert(errors.length === 0, errors.join('\n'));
  console.log(JSON.stringify({ ok: true, counts, shots }, null, 2));
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
