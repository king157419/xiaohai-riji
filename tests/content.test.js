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

test('文案里没有破折号与 emoji', () => {
  const s = JSON.stringify(XH);
  assert.ok(!/—/.test(s), '有破折号');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(s), '有 emoji');
});
