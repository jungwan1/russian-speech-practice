const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.env.ETTO_BASE || 'http://127.0.0.1:8765';
const OUT = process.env.ETTO_SHOTS || '/opt/cursor/artifacts';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

function ordinalLabel(date, time, rows) {
  const ords = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
  const wds = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const marks = '①②③④⑤⑥⑦⑧⑨⑩';
  const [y, m, d] = date.split('-').map(Number);
  const text = `${ords[Math.floor((d - 1) / 7)]} 주 ${wds[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
  const siblings = rows.filter(r => r[1] === date).slice().sort((a, b) => a[2].localeCompare(b[2]));
  if (siblings.length < 2) return text;
  return text + ' ' + marks[siblings.findIndex(r => r[2] === time)];
}

const EXPECTED = [
  ['etto_11.m4a', '2026-11-08', '16:08:53', '2026년 11월 8일 16:08:53'],
  ['etto_02.m4a', '2026-11-06', '20:45:34', '2026년 11월 6일 20:45:34'],
  ['etto_04.m4a', '2026-10-11', '17:23:57', '2026년 10월 11일 17:23:57'],
  ['etto_05.m4a', '2026-10-11', '17:08:21', '2026년 10월 11일 17:08:21'],
  ['etto_22.m4a', '2026-10-09', '20:58:37', '2026년 10월 9일 20:58:37'],
  ['etto_19.m4a', '2026-10-09', '19:55:39', '2026년 10월 9일 19:55:39'],
  ['etto_20.m4a', '2026-10-04', '16:39:44', '2026년 10월 4일 16:39:44'],
  ['etto_14.m4a', '2026-09-27', '16:45:49', '2026년 9월 27일 16:45:49'],
  ['etto_23.m4a', '2026-09-20', '17:03:26', '2026년 9월 20일 17:03:26'],
  ['etto_21.m4a', '2026-09-13', '16:49:30', '2026년 9월 13일 16:49:30'],
  ['etto_10.m4a', '2026-09-04', '19:50:42', '2026년 9월 4일 19:50:42'],
  ['etto_06.m4a', '2026-08-28', '20:47:01', '2026년 8월 28일 20:47:01'],
  ['etto_07.m4a', '2026-08-23', '17:17:39', '2026년 8월 23일 17:17:39'],
  ['etto_12.m4a', '2026-08-21', '19:54:39', '2026년 8월 21일 19:54:39'],
  ['etto_01.m4a', '2026-06-07', '17:27:48', '2026년 6월 7일 17:27:48'],
  ['etto_15.m4a', '2026-06-07', '17:25:11', '2026년 6월 7일 17:25:11'],
  ['etto_13.m4a', '2026-06-05', '19:50:51', '2026년 6월 5일 19:50:51'],
  ['etto_17.m4a', '2026-05-31', '17:30:58', '2026년 5월 31일 17:30:58'],
  ['etto_03.m4a', '2026-05-29', '20:45:47', '2026년 5월 29일 20:45:47'],
  ['etto_16.m4a', '2026-05-10', '17:26:02', '2026년 5월 10일 17:26:02'],
  ['etto_18.m4a', '2026-05-08', '20:53:31', '2026년 5월 8일 20:53:31'],
  ['etto_09.m4a', '2026-05-03', '17:25:44', '2026년 5월 3일 17:25:44'],
  ['etto_08.m4a', '2026-05-01', '20:42:44', '2026년 5월 1일 20:42:44'],
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  const path = `${OUT}/${name}`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

function step(msg) { console.log('STEP', msg); }

async function openBrowser() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
}

async function go(page, url) {
  step('goto ' + url);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 });
}

async function homeFacts(page) {
  return page.evaluate(() => {
    const home = document.querySelector('#view-home');
    const link = document.querySelector('#view-home a.etto');
    const rect = link.getBoundingClientRect();
    const practice = [...document.querySelectorAll('#view-home .smallBtns button')].map(b => b.textContent.trim());
    const visibleButtons = [...document.querySelectorAll('#view-home button, #view-home a')].map(b => b.textContent.trim());
    const cs = getComputedStyle(link);
    return {
      shown: home.classList.contains('show'),
      title: document.querySelector('#view-home h1').textContent.trim(),
      etto: link.textContent.trim(),
      href: link.getAttribute('href'),
      practice,
      visibleButtons,
      sectionTitles: [...document.querySelectorAll('#view-home .sectionTitle')].map(n => n.textContent.trim()),
      homeText: home.innerText,
      daily: document.querySelector('.dDate').textContent,
      verse: document.querySelector('.dVerse').innerText,
      linkBox: { x: rect.x, w: rect.width, cx: rect.x + rect.width / 2, vw: window.innerWidth },
      bg: cs.backgroundColor,
      display: cs.display,
      textAlign: getComputedStyle(document.querySelector('#view-home .home')).textAlign,
    };
  });
}

(async () => {
  const browser = await openBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) errors.push(res.status() + ' ' + res.url());
  });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await go(page, '/jw1.html');
  step('home facts');
  let home = await homeFacts(page);
  assert(home.shown, 'home view is visible');
  assert(home.title === 'Русский язык Попробуйте~', home.title);
  assert(home.etto === '에떠해설', JSON.stringify(home.etto));
  assert(home.href === 'etto.html', home.href);
  assert(!home.visibleButtons.includes('글렙'), '글렙 still on home');
  assert(!home.visibleButtons.includes('비올레따'), '비올레따 still on home');
  assert(!home.visibleButtons.includes('이번주 파수대'), '이번주 파수대 still on home');
  assert(!home.sectionTitles.includes('파수대 해설준비'), 'section label remains');
  assert(!home.homeText.includes('파수대 해설준비'), 'label in home text');
  assert(home.sectionTitles.includes('실연연습'), 'practice heading missing');
  assert(JSON.stringify(home.practice) === JSON.stringify([
    '11월 8일(일) 마치는 기도',
    '11월 9–15일 영적 보물 찾기 (예레미야 51–52) 사회',
    '11월 16–22일 마치는 기도',
    '지난 연설 보기',
  ]), JSON.stringify(home.practice));
  assert(home.daily.includes('2026년 11월 8일'), home.daily);
  assert(home.verse.includes('Бог «не пощадил древний мир»'), 'daily verse changed');
  assert(Math.abs(home.linkBox.cx - home.linkBox.vw / 2) < 8, `etto control not centered ${JSON.stringify(home.linkBox)}`);
  const mobileHome = await shot(page, 'screenshot_mobile_home_unchanged.png');
  step('daily');

  await page.click('#view-home .dailyBtn');
  const dailyOpen = await page.evaluate(() => document.getElementById('dailyPanel').style.display);
  assert(dailyOpen === 'block', 'daily panel did not open');
  await page.click('#dailyToggleBtn');
  const dailyClosed = await page.evaluate(() => document.getElementById('dailyPanel').style.display);
  assert(dailyClosed === 'none', 'daily panel did not close');

  await page.click('#view-home .smallBtns button');
  await page.waitForSelector('#view-nov8.show');
  const prayer = await page.evaluate(() => document.querySelector('#view-nov8 .headLabel').textContent.trim());
  assert(prayer === '11월 8일(일) 마치는 기도', prayer);
  await page.click('#view-nov8 .homeBtn');
  await page.waitForSelector('#view-home.show');
  await page.click('#view-home .smallBtns button:last-child');
  await page.waitForSelector('#view-archive.show');
  const archive = await page.evaluate(() => document.querySelector('#view-archive').innerText);
  assert(archive.includes('10월 30일 10분 연설 (예레미야 48장)'), 'archive missing speech');
  assert(archive.includes('실연 — 대화 시작하기 (집호 방문 전파)'), 'archive missing drama');
  await page.click('#view-archive .homeBtn');
  await page.waitForSelector('#view-home.show');

  step('open etto');
  await page.click('#view-home a.etto');
  await page.waitForSelector('#dateNote', { timeout: 8000 });
  assert(page.url().endsWith('/etto.html'), page.url());
  const mobileList = await shot(page, 'screenshot_mobile_months_player_v3.png');

  const list = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#ettoList button.ettoDate')];
    const audio = document.getElementById('playerAudio');
    const visibleDates = buttons.filter(b => !b.closest('.ettoItem').hasAttribute('hidden'));
    return {
      note: document.getElementById('dateNote').textContent.trim(),
      buttons: buttons.map(b => ({
        text: b.textContent.trim(),
        date: b.dataset.date,
        time: b.dataset.time,
        file: b.dataset.file,
      })),
      visibleDates: visibleDates.length,
      months: [...document.querySelectorAll('#monthNav button')].map(b => b.textContent.trim()),
      year2026: document.getElementById('year-2026').getAttribute('aria-pressed'),
      previous: document.getElementById('nav-previous').textContent.trim(),
      audio: {
        controls: audio.controls,
        autoplay: audio.autoplay,
        preload: audio.preload,
        paused: audio.paused,
      },
      back: document.getElementById('backBtn').textContent.trim(),
      home: document.querySelector('a.homeBtn').getAttribute('href'),
      homeText: document.querySelector('a.homeBtn').textContent.trim(),
    };
  });
  assert(list.note === '날짜는 파일 생성일 기준입니다.', list.note);
  assert(list.buttons.length === 23, String(list.buttons.length));
  assert(list.visibleDates === 0, 'dates shown before a month');
  assert(JSON.stringify(list.months) === JSON.stringify(['11월', '10월', '9월', '8월', '6월', '5월']), JSON.stringify(list.months));
  assert(list.year2026 === 'true' && list.previous === '이전');
  const no2025 = await page.evaluate(() => !document.body.innerText.includes('2025년'));
  assert(no2025, '2025년 still shown');
  assert(list.audio.controls === true && list.audio.autoplay === false && list.audio.preload === 'none' && list.audio.paused === true);
  assert(list.back === '뒤로' && list.home === 'jw1.html' && list.homeText === '홈으로');
  list.buttons.forEach((b, i) => {
    const exp = EXPECTED[i];
    const label = ordinalLabel(exp[1], exp[2], EXPECTED);
    assert(b.file === exp[0] && b.date === exp[1] && b.time === exp[2] && b.text === label, JSON.stringify({ b, label }));
    assert(!b.text.includes('년') && !b.text.includes(':'), b.text);
  });
  const caveat = await page.evaluate(() => ({
    n11: document.getElementById('caveat-11').textContent,
    n07: document.getElementById('caveat-07').textContent,
    count: document.querySelectorAll('.ettoCaveat').length,
  }));
  assert(caveat.count === 2, String(caveat.count));
  assert(caveat.n11.includes('다시 저장된 파일일 수 있어'), caveat.n11);
  assert(caveat.n07.includes('약 67초'), caveat.n07);
  assert(!caveat.n11.includes('원래 해설 날짜입니다') && !caveat.n07.includes('녹음일'));

  const plays = [];
  await page.exposeFunction('ettoPlayed', id => plays.push(id));
  await page.evaluate(() => {
    document.getElementById('playerAudio').addEventListener('play', () => window.ettoPlayed(document.getElementById('playerAudio').dataset.file));
  });
  step('play first');
  await page.click('button[data-month="11"]');
  await page.click('button[data-file="etto_11.m4a"]');
  await page.waitForFunction(() => {
    const a = document.getElementById('playerAudio');
    return a && a.dataset.file === 'etto_11.m4a' && !a.paused;
  }, { timeout: 8000 });
  await page.evaluate(() => { document.getElementById('playerAudio').currentTime = 1.25; });
  await page.waitForFunction(() => document.getElementById('playerAudio').currentTime >= 1, { timeout: 4000 });
  const pauseBox = await page.$eval('#pauseBtn', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.bottom - 1 };
  });
  await page.touchscreen.tap(pauseBox.x, pauseBox.y);
  await page.waitForFunction(() => document.getElementById('playerAudio').paused, { timeout: 4000 });
  const stillFile = await page.evaluate(() => document.getElementById('playerAudio').dataset.file);
  assert(stillFile === 'etto_11.m4a', stillFile);

  await page.click('button[data-file="etto_02.m4a"]');
  await page.waitForFunction(() => document.getElementById('playerAudio').dataset.file === 'etto_02.m4a' && !document.getElementById('playerAudio').paused, { timeout: 8000 });
  await page.click('#backToMonths');
  await page.click('button[data-month="10"]');
  await page.click('button[data-file="etto_04.m4a"]');
  await page.waitForFunction(() => document.getElementById('playerAudio').dataset.file === 'etto_04.m4a' && !document.getElementById('playerAudio').paused, { timeout: 8000 });
  const one = await page.evaluate(() => [...document.querySelectorAll('audio')].filter(a => !a.paused).map(a => a.id));
  assert(JSON.stringify(one) === JSON.stringify(['playerAudio']), 'more than one active ' + JSON.stringify(one));
  const playingShot = await shot(page, 'screenshot_mobile_fixed_player_playing_v3.png');

  step('home link');
  await page.click('a.homeBtn');
  await page.waitForSelector('#view-home.show', { timeout: 8000 });
  assert(page.url().endsWith('/jw1.html'), page.url());
  home = await homeFacts(page);
  assert(home.etto === '에떠해설' && home.practice.length === 4, 'home changed after return');

  step('desktop');
  await page.setViewport({ width: 1280, height: 900, isMobile: false, deviceScaleFactor: 1 });
  await go(page, '/jw1.html');
  home = await homeFacts(page);
  assert(Math.abs(home.linkBox.cx - home.linkBox.vw / 2) < 12, `desktop not centered ${JSON.stringify(home.linkBox)}`);
  assert(!home.visibleButtons.includes('글렙') && !home.visibleButtons.includes('비올레따') && !home.visibleButtons.includes('이번주 파수대'));
  const desktopHome = await shot(page, 'screenshot_desktop_home_unchanged.png');
  await page.click('a.etto');
  await page.waitForSelector('#dateNote', { timeout: 8000 });
  const desktopList = await shot(page, 'screenshot_desktop_months_player_v3.png');
  const still = await page.evaluate(() => document.querySelectorAll('#ettoList button.ettoDate').length);
  assert(still === 23, String(still));

  const direct = await browser.newPage();
  step('direct back');
  await direct.goto(`${BASE}/etto.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const before = await direct.evaluate(() => [...document.querySelectorAll('audio')].every(a => a.paused && !a.autoplay));
  assert(before, 'direct load autoplayed');
  await direct.click('#backBtn');
  await direct.waitForSelector('#view-home.show', { timeout: 8000 });
  assert(direct.url().endsWith('/jw1.html'), 'back from direct open: ' + direct.url());

  step('history back');
  const backPage = await browser.newPage();
  await backPage.setViewport({ width: 390, height: 844 });
  await backPage.goto(`${BASE}/jw1.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await backPage.waitForSelector('#view-home.show a.etto', { timeout: 8000 });
  await backPage.click('#view-home a.etto');
  await backPage.waitForSelector('#backBtn', { timeout: 8000 });
  await backPage.click('#backBtn');
  await backPage.waitForFunction(() => location.pathname.endsWith('/jw1.html'), { timeout: 8000 });
  assert(backPage.url().endsWith('/jw1.html'), 'history back failed ' + backPage.url());
  const backHome = await backPage.evaluate(() => document.querySelector('#view-home a.etto').textContent.trim());
  assert(backHome === '에떠해설', backHome);

  assert(errors.length === 0, errors.join('\n'));
  console.log(JSON.stringify({
    ok: true,
    controls: 23,
    shots: [mobileHome, mobileList, playingShot, desktopHome, desktopList],
  }, null, 2));
  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
