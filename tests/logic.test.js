// node --test
// app.js 前半段的纯函数（统计、结语、明天小事、复制文本）。v3 P1：说「最常做的是 X」时，X 的次数必须严格大于其余五种（含自在）。
const test = require('node:test');
const assert = require('node:assert/strict');
const XH = require('../content.js');
const L = require('../app.js');

const HARSH = XH.modeOrder.filter((k) => k !== 'free');
// 按说法凑一组 picks：modes[i] 是第 i 刻想要的说法；某刻没有那种说法就返回 null
function picksFor(modes) {
  const picks = modes.map((mode, i) => XH.moments[i].options.findIndex((o) => o.mode === mode));
  return picks.every((k) => k >= 0) ? picks : null;
}
function dayOf(modes, practice) {
  const picks = picksFor(modes);
  assert.ok(picks, '这组说法在六刻里凑不出来：' + modes.join(','));
  return { date: '2026-09-04', id: '1757000000000', picks, practice: practice || null };
}
function allDays() {
  const out = [];
  for (let n = 0; n < 4096; n++) {
    const picks = [];
    for (let i = 0, x = n; i < 6; i++, x = Math.floor(x / 4)) picks.push(x % 4);
    out.push(picks);
  }
  return out;
}

test('穷举 4096 种选法：说「最常做的是 X」时 X 严格大于其余五种（含自在），其余分支各守各的条件', () => {
  const seen = { harsh: 0, free: 0, freeAll: 0, mixed: 0, tie: 0 };
  for (const picks of allDays()) {
    const t = L.tallies(picks);
    const dom = L.dominant(t);
    const text = L.dominantText(dom);
    assert.ok(typeof text === 'string' && text.length > 0, '结语为空：' + picks.join(''));
    const maxHarsh = Math.max(...HARSH.map((k) => t[k]));
    if (HARSH.includes(dom)) {
      seen.harsh++;
      for (const k of XH.modeOrder) if (k !== dom) assert.ok(t[dom] > t[k], `说最常是 ${dom}（${t[dom]}）但 ${k} 有 ${t[k]}：${picks.join('')}`);
      assert.ok(/最常/.test(text), '重话分支该说「最常」：' + dom);
    } else {
      assert.ok(!/最常/.test(text), '非重话分支不该说「最常」：' + dom + ' ' + picks.join(''));
      if (dom === 'freeAll') { seen.freeAll++; assert.equal(t.free, 6); }
      else if (dom === 'free') { seen.free++; assert.ok(t.free >= 4 && t.free < 6, '自在分支要 4 或 5 次：' + t.free); }
      else if (dom === 'mixed') { seen.mixed++; assert.ok(t.free < 4 && t.free >= maxHarsh, 'mixed 要自在不到四次且不少于任何重话：' + JSON.stringify(t)); }
      else if (dom === 'tie') {
        seen.tie++;
        assert.ok(t.free < maxHarsh, 'tie 时自在必须少于最多的重话：' + JSON.stringify(t));
        assert.ok(HARSH.filter((k) => t[k] === maxHarsh).length >= 2, 'tie 时最多的重话至少两种：' + JSON.stringify(t));
      } else assert.fail('未知分支：' + dom);
    }
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, '穷举里没走到分支 ' + k);
});

test('六刻全自在：结语 dominantFreeAll；跳过用 skippedAllFree；写了话用 said；明天小事跟自在走', () => {
  const skip = dayOf(['free', 'free', 'free', 'free', 'free', 'free'], { skipped: true });
  const c = L.closing(skip);
  assert.equal(c.dom, 'freeAll');
  assert.equal(c.dominant, XH.diary.dominantFreeAll);
  assert.equal(c.practice, XH.diary.skippedAllFree);
  assert.equal(c.tomorrow, XH.diary.tomorrow.free);
  assert.equal(c.tally, XH.diary.tallyLead + '陪我玩了六次。');
  const said = dayOf(['free', 'free', 'free', 'free', 'free', 'free'], { skipped: false, mode: 'free', from: null, to: '今天辛苦了。' });
  const c2 = L.closing(said);
  assert.equal(c2.practice, '睡前你对我说：「今天辛苦了」。我听见了。');
  assert.ok(!/最常|大部分/.test(L.shareText(said)), '全自在不该说最常或大部分');
});

test('自在 3 + 逼 2 + 等 1：结语 dominantMixed，不含「最常」；没改句时明天小事用 tie，改了句跟那句走', () => {
  const skip = dayOf(['free', 'free', 'free', 'later', 'force', 'force'], { skipped: true });
  const c = L.closing(skip);
  assert.deepEqual(c.t, { scare: 0, force: 2, deny: 0, refuse: 0, later: 1, free: 3 });
  assert.equal(c.dom, 'mixed');
  assert.equal(c.dominant, XH.diary.dominantMixed);
  assert.ok(!/最常/.test(c.dominant));
  assert.equal(c.tomorrow, XH.diary.tomorrow.tie);
  assert.equal(c.practice, XH.diary.skipped, '不是全自在，跳过用普通那句');
  const rewrote = dayOf(['free', 'free', 'free', 'later', 'force', 'force'],
    { skipped: false, mode: 'later', from: XH.moments[3].options[0].text, to: '这两小时我就去弹一会儿。' });
  assert.equal(L.closing(rewrote).tomorrow, XH.diary.tomorrow.later, '改过句子时明天小事跟那句的说法走');
  // 产品评委探针里的另两组：吓 2 自在 3；吓 2 自在 2
  assert.equal(L.dominant({ scare: 2, force: 0, deny: 1, refuse: 0, later: 0, free: 3 }), 'mixed');
  assert.equal(L.dominant({ scare: 2, force: 1, deny: 1, refuse: 0, later: 0, free: 2 }), 'mixed');
});

test('吓 3 + 其他：结语「最常做的是吓我」；自在 4 说「大部分」；重话打平且自在更少才用 dominantTie', () => {
  const scare3 = dayOf(['scare', 'scare', 'deny', 'force', 'refuse', 'scare'], { skipped: true });
  const c = L.closing(scare3);
  assert.equal(c.dom, 'scare');
  assert.equal(c.dominant, XH.diary.dominant.scare);
  assert.match(c.dominant, /最常做的是吓我/);
  assert.equal(c.tomorrow, XH.diary.tomorrow.scare);
  assert.equal(L.dominant({ scare: 2, force: 0, deny: 0, refuse: 0, later: 0, free: 4 }), 'free');
  assert.equal(L.dominantText('free'), XH.diary.dominant.free);
  assert.equal(L.dominant({ scare: 2, force: 0, deny: 2, refuse: 1, later: 1, free: 0 }), 'tie');
  assert.equal(L.dominant({ scare: 2, force: 2, deny: 0, refuse: 1, later: 0, free: 1 }), 'tie');
  assert.equal(L.tomorrowKey({ practice: { skipped: true } }, 'tie'), 'tie');
  assert.equal(L.tomorrowKey({ practice: null }, 'mixed'), 'tie');
  assert.equal(L.tomorrowKey({ practice: null }, 'freeAll'), 'free');
});

test('复制文本：十个占位全填，结语四句各占一行，末两行是致谢与裸网址', () => {
  const d = dayOf(['scare', 'deny', 'refuse', 'later', 'force', 'free'],
    { skipped: false, mode: 'refuse', from: XH.moments[2].options[2].text, to: '我想知道细节，直接去问他。' });
  const s = L.shareText(d);
  assert.ok(!/\{\w+\}/.test(s), '还有没填的占位：' + s);
  const lines = s.split('\n');
  assert.equal(lines[lines.length - 1], L.SITE, '最后一行是裸网址');
  assert.equal(lines[lines.length - 2], XH.diary.shareCredit, '倒数第二行是致谢');
  assert.equal(lines[lines.length - 3], '', '致谢前空一行');
  assert.ok(!/过一天试试/.test(s), '不再有「过一天试试」');
  const c = L.closing(d);
  const i = lines.indexOf(c.tally);
  assert.ok(i > 0, '结语第一句独占一行');
  assert.equal(lines[i + 1], c.dominant);
  assert.equal(lines[i + 2], c.practice);
  assert.equal(lines[i + 3], XH.diary.goodnight);
  assert.equal(lines[i + 4], '');
  assert.equal(lines[i + 5], XH.diary.signoff);
  assert.equal(lines[i + 6], XH.diary.psLead + c.tomorrow);
  assert.equal(lines[0], XH.diary.title + ' · 9月4日');
  for (let k = 0; k < 6; k++) assert.equal(lines[2 + k], XH.moments[k].time + ' ' + XH.moments[k].options[d.picks[k]].diary);
});

test('同一天多篇时日期按钮带时间，只有一篇或不是时间戳 id 时只有日期', () => {
  const a = { id: String(new Date(2026, 8, 4, 21, 5).getTime()), date: '2026-09-04' };
  const b = { id: String(new Date(2026, 8, 4, 9, 40).getTime()), date: '2026-09-04' };
  const old = { id: '2026-09-03-0', date: '2026-09-03' };
  assert.equal(L.dateLabel(a, [a, b, old]), '9月4日 21:05');
  assert.equal(L.dateLabel(b, [a, b, old]), '9月4日 09:40');
  assert.equal(L.dateLabel(old, [a, b, old]), '9月3日');
  assert.equal(L.dateLabel(a, [a, old]), '9月4日');
  assert.equal(L.fmtStamp('2026-09-03-0'), '');
});
