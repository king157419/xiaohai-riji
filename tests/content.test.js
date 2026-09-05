// node --test
// 内容数据的形状与文案约束。文案本身的套路检查在 copy.test.js。
const test = require('node:test');
const assert = require('node:assert/strict');
const XH = require('../content.js');

test('六个时刻，每个 4 个选项，每个选项都有合法的说法与日记句', () => {
  assert.equal(XH.moments.length, 6);
  for (const m of XH.moments) {
    assert.equal(m.options.length, 4, m.id);
    assert.ok(/^\d\d:\d\d$/.test(m.time), m.id + ' time');
    assert.equal(m.sky.length, 2, m.id + ' sky');
    for (const o of m.options) {
      assert.ok(XH.modes[o.mode], m.id + ' 未知说法 ' + o.mode);
      assert.ok(o.diary.length <= 46, m.id + ' 日记句太长：' + o.diary);
      assert.ok(o.text.length <= 24, m.id + ' 选项太长：' + o.text);
    }
    // 每个时刻都有一个自在选项
    assert.ok(m.options.some((o) => o.mode === 'free'), m.id + ' 缺自在选项');
    // 同一时刻里的说法不重复
    assert.equal(new Set(m.options.map((o) => o.mode)).size, 4, m.id + ' 说法重复');
  }
});

test('每种说法在整天里至少出现一次，且都有练习提示、结语、明天小事', () => {
  const seen = new Set();
  XH.moments.forEach((m) => m.options.forEach((o) => seen.add(o.mode)));
  for (const k of XH.modeOrder) {
    assert.ok(seen.has(k), '整天没出现：' + k);
    assert.ok(XH.practice.hints[k] && XH.practice.hints[k].hint, '缺练习提示：' + k);
    assert.ok(XH.diary.dominant[k], '缺结语：' + k);
    assert.ok(XH.diary.tomorrow[k], '缺明天小事：' + k);
    assert.ok(XH.faces[XH.modes[k].face], '缺表情：' + k);
  }
});

test('脸都是 8×8', () => {
  for (const [k, rows] of Object.entries(XH.faces)) {
    assert.equal(rows.length, 8, k);
    rows.forEach((r) => assert.ok(/^[#.]{8}$/.test(r), k + ' 行不合法：' + r));
  }
});

test('每个非自在选项都有自己的 example（练习页例句跟所挑的那句走）', () => {
  for (const m of XH.moments) {
    for (const o of m.options) {
      if (o.mode === 'free') continue;
      assert.ok(typeof o.example === 'string' && o.example.trim().length > 0, m.id + ' 缺 example：' + o.text);
      assert.ok(o.example.length <= 40, m.id + ' example 太长：' + o.example);
    }
  }
});

test('v2、v3 新键都在，share 模板十个占位齐全且末两行是致谢与网址，封面不再说「选了不能改」', () => {
  for (const k of ['introSub', 'firstHint', 'tagline', 'introMeta']) assert.ok(XH[k], '缺 ' + k);
  for (const k of ['how', 'note', 'exampleLead', 'placeholder', 'placeholderAllFree', 'doneAllFree', 'skipAllFree']) assert.ok(XH.practice[k], '缺 practice.' + k);
  assert.equal(XH.numerals.length, 7, 'numerals 要覆盖 0 到 6');
  for (const k of ['dominantTie', 'dominantMixed', 'dominantFreeAll', 'goodnight', 'psLead', 'said', 'rewrote', 'skipped', 'skippedAllFree', 'share', 'shareCredit']) {
    assert.ok(XH.diary[k], '缺 diary.' + k);
  }
  for (const k of ['credit', 'maker', 'freshNote', 'gallery']) assert.ok(XH.about[k], '缺 about.' + k);
  assert.ok(XH.diary.tomorrow.tie, '缺 tomorrow.tie');
  for (const p of ['date', 'lines', 'tally', 'dominant', 'practice', 'goodnight', 'psLead', 'tomorrow', 'credit', 'url']) {
    assert.ok(XH.diary.share.includes('{' + p + '}'), 'share 缺占位 ' + p);
  }
  assert.ok(XH.diary.share.endsWith('\n{credit}\n{url}'), 'share 末两行应是致谢与裸网址');
  assert.ok(!/过一天试试/.test(XH.diary.share), 'share 不该再有「过一天试试」');
  assert.ok(!/选了不能改/.test(XH.tagline + XH.introSub + XH.introMeta + XH.firstHint), '封面不该再说选了不能改');
  assert.ok(/选了就不改了/.test(XH.firstHint), 'firstHint 要说选了就不改了');
  assert.equal(XH.modes.free.face, 'calm', '自在的脸不该是 happy');
  for (const k of ['dominantTie', 'dominantMixed', 'dominantFreeAll']) assert.ok(!/最常/.test(XH.diary[k]), k + ' 不该说「最常」');
});

test('文案里没有破折号与 emoji', () => {
  const s = JSON.stringify(XH);
  assert.ok(!/—/.test(s), '有破折号');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(s), '有 emoji');
});
