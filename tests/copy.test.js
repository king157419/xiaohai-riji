// node --test
// 用去腔（claudex/10）的规则引擎检查我们自己的文案：计入密度的套路（strong）必须为 0。
// 两份文本：(a) content.js 里所有含汉字的字符串；(b) index.html 去掉 script/style 与标签后的可见文案。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XH = require('../content.js');
const QQ = require('D:/desk/claudex/10/engine.js');

function collectStrings(v, out) {
  if (typeof v === 'string') {
    if (/[\u4e00-\u9fff]/.test(v)) out.push(v);
  } else if (Array.isArray(v)) {
    v.forEach((x) => collectStrings(x, out));
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach((x) => collectStrings(x, out));
  }
  return out;
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function report(res) {
  return res.strong.map((h) => `[${h.ruleId}] ${h.text} ← ${h.sent.text.trim()}`).join('\n');
}

test('content.js 里所有含汉字的文案，去腔 strong 命中为 0', () => {
  const strings = collectStrings(XH, []);
  assert.ok(strings.length > 100, '文案条数异常：' + strings.length);
  const res = QQ.analyze(strings.join('\n'));
  assert.equal(res.strong.length, 0, '\n' + report(res));
});

test('index.html 可见文案，去腔 strong 命中为 0', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const text = visibleText(html);
  assert.ok(/小孩日记/.test(text), 'index.html 可见文案里应有标题');
  const res = QQ.analyze(text);
  assert.equal(res.strong.length, 0, '\n' + report(res));
});

test('index.html 与 app.js 里没有破折号、emoji 与外部请求', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['index.html', 'app.js']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/—/.test(s), f + ' 有破折号');
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(s), f + ' 有 emoji');
    // http://www.w3.org/2000/svg 是 SVG 的 XML 命名空间常量，不会发请求，放行。
    const urls = (s.match(/https?:\/\/[^\s"')]+/g) || [])
      .filter((u) => !/^https:\/\/(xiaohai-riji|xiaoshijie)\.vercel\.app/.test(u))
      .filter((u) => u !== 'http://www.w3.org/2000/svg');
    assert.deepEqual(urls, [], f + ' 引用了外部地址');
  }
});
