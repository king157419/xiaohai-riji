/* 小孩日记 · 逻辑。文案与数据全部在 content.js（window.XH），这里只负责渲染与状态。
   存储只有 localStorage 的 xh.diaries 一项（数组，最新在前，最多 7 篇）；地址带 ?fresh 时不读不写。零外部请求。
   前半段是不碰 DOM 的纯函数（统计、结语、复制文本），node 测试用 require('../app.js') 取到它们；后半段才渲染。 */
(function (root) {
  'use strict';
  const IS_NODE = typeof module !== 'undefined' && module.exports;
  const C = root.XH || (IS_NODE ? require('./content.js') : null);
  const KEY = 'xh.diaries';
  const LEGACY_KEY = 'xh.diary'; // v1 只存一篇；读到就并进数组，然后删掉旧键
  const MAX = 7;
  const SITE = 'https://xiaohai-riji.vercel.app';
  const HARSH = C.modeOrder.filter(function (k) { return k !== 'free'; });

  /* ---------- 纯函数：小工具 ---------- */
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDate(iso) {
    const parts = iso.split('-');
    return fill(C.diary.dateFmt, { m: Number(parts[1]), d: Number(parts[2]) });
  }
  /* 存档 id 是写完那一刻的时间戳；同一天有多篇时按钮后面带「21:05」。不是时间戳（v1 迁移来的）就返回空串。 */
  function fmtStamp(id) {
    if (!/^\d{12,}$/.test(String(id))) return '';
    const d = new Date(Number(id));
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function dateLabel(x, list) {
    const same = list.filter(function (y) { return y.date === x.date; }).length;
    const stamp = same > 1 ? fmtStamp(x.id) : '';
    return fmtDate(x.date) + (stamp ? ' ' + stamp : '');
  }

  /* ---------- 纯函数：统计与结语 ---------- */
  function tallies(picks) {
    const t = {};
    C.modeOrder.forEach(function (k) { t[k] = 0; });
    picks.forEach(function (k, i) { t[C.moments[i].options[k].mode]++; });
    return t;
  }
  /* 结语该说哪句。返回：'freeAll'（六刻全自在）、'free'（自在 ≥ 4）、'mixed'（自在不到四次但不少于任何一种重话）、
     'tie'（重话之间打平）、或某种重话的键（它的次数严格大于其余五种，含自在，这时才说「最常」）。 */
  function dominant(t) {
    if (t.free >= C.moments.length) return 'freeAll';
    if (t.free >= 4) return 'free';
    let best = null;
    let tie = false;
    HARSH.forEach(function (k) {
      if (t[k] === 0) return;
      if (best === null || t[k] > t[best]) { best = k; tie = false; }
      else if (t[k] === t[best]) tie = true;
    });
    if (best === null) return 'mixed';
    if (tie) return 'tie'; // 重话之间打平（含六种各一次）先算打平，再看自在
    if (t.free >= t[best]) return 'mixed';
    return best;
  }
  function dominantText(dom) {
    if (dom === 'freeAll') return C.diary.dominantFreeAll;
    if (dom === 'mixed') return C.diary.dominantMixed;
    if (dom === 'tie') return C.diary.dominantTie;
    return C.diary.dominant[dom];
  }
  function tallyText(t) {
    return C.modeOrder
      .filter(function (k) { return t[k] > 0; })
      .map(function (k) { return fill(C.modes[k].tally, { n: C.numerals[t[k]] }); })
      .join('，');
  }
  /* 明天的小事：先跟睡前改的那句的说法走；没改就跟结语走（全自在按自在，mixed / tie 用 tie） */
  function tomorrowKey(d, dom) {
    const pr = d.practice;
    if (pr && !pr.skipped && pr.from && C.diary.tomorrow[pr.mode]) return pr.mode;
    if (dom === 'freeAll') return 'free';
    if (dom === 'mixed' || dom === 'tie') return 'tie';
    return dom;
  }
  function quoted(s) { return String(s || '').trim().replace(/[。\s]+$/, ''); } // 引号里的句子不带句末句号
  function practiceLine(pr, allFree) {
    if (!pr || pr.skipped) return allFree ? C.diary.skippedAllFree : C.diary.skipped;
    if (pr.from) return fill(C.diary.rewrote, { from: quoted(pr.from), to: quoted(pr.to) });
    return fill(C.diary.said, { to: quoted(pr.to) });
  }
  function diaryLines(d) {
    return d.picks.map(function (k, i) { return { time: C.moments[i].time, text: C.moments[i].options[k].diary }; });
  }
  /* 日记页与复制文本共用的一份「结语四句 + 附言」 */
  function closing(d) {
    const t = tallies(d.picks);
    const dom = dominant(t);
    return {
      t: t,
      dom: dom,
      tally: C.diary.tallyLead + tallyText(t) + '。',
      dominant: dominantText(dom),
      practice: practiceLine(d.practice, dom === 'freeAll'),
      tomorrow: C.diary.tomorrow[tomorrowKey(d, dom)]
    };
  }
  /* 复制的是整篇：六行、结语四句各一行、落款、附言、致谢、地址。和日记页看到的一字不差。 */
  function shareText(d) {
    const c = closing(d);
    return fill(C.diary.share, {
      date: fmtDate(d.date),
      lines: diaryLines(d).map(function (l) { return l.time + ' ' + l.text; }).join('\n'),
      tally: tallyText(c.t),
      dominant: c.dominant,
      practice: c.practice,
      goodnight: C.diary.goodnight,
      psLead: C.diary.psLead,
      tomorrow: c.tomorrow,
      credit: C.diary.shareCredit,
      url: SITE
    });
  }

  if (IS_NODE) {
    module.exports = {
      SITE: SITE, HARSH: HARSH,
      fill: fill, fmtDate: fmtDate, fmtStamp: fmtStamp, dateLabel: dateLabel,
      tallies: tallies, dominant: dominant, dominantText: dominantText, tallyText: tallyText,
      tomorrowKey: tomorrowKey, practiceLine: practiceLine, closing: closing, shareText: shareText
    };
    return;
  }

  /* ---------- 从这里开始碰 DOM ---------- */
  const FRESH = /[?&]fresh(?:[=&]|$)/.test(location.search);
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NUM = ['一', '二', '三', '四'];
  /* 节奏：脸 0.2 秒（CSS），日记句 0.5 秒淡入（CSS），「下一刻」在句子淡完之后再等 800 毫秒；「改好了」之后脸 happy 停 1 秒 */
  const T_NEXT = REDUCED ? 0 : 1300;
  const T_HAPPY = 1000;
  const SKY = {
    cover: { colors: ['#141830', '#2b2d4a'], dark: true },
    night: { colors: ['#0b1020', '#1c2541'], dark: true },
    paper: { colors: ['#f6f1e7', '#efe6d6'], dark: false, paper: true }
  };

  const app = document.getElementById('app');
  const skies = [document.getElementById('skyA'), document.getElementById('skyB')];
  let skyOn = -1;
  let state = newState();
  let current = null; // 正在显示的那篇日记

  function newState() { return { v: 2, id: null, date: null, picks: [], practice: null }; }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null || c === false) return;
        el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    }
    return el;
  }
  function shuffled(n) { // Fisher-Yates，返回 0..n-1 的一个随机排列
    const a = [];
    for (let i = 0; i < n; i++) a.push(i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function mount(el) {
    app.replaceChildren(el);
    window.scrollTo(0, 0);
  }
  function setSky(sky) {
    const nextIdx = skyOn === 0 ? 1 : 0;
    const next = skies[nextIdx];
    next.style.background = 'linear-gradient(180deg, ' + sky.colors[0] + ', ' + sky.colors[1] + ')';
    next.classList.add('show');
    if (skyOn >= 0) skies[skyOn].classList.remove('show');
    skyOn = nextIdx;
    document.body.classList.toggle('dark', !!sky.dark);
    document.body.classList.toggle('paper', !!sky.paper);
    document.body.style.background = sky.colors[1]; // 天色层之外（回弹、整页截图）也用同一色
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', sky.colors[0]);
  }

  /* ---------- 像素脸 ---------- */
  let faceSeq = 0;
  function makeFace(size) {
    const NS = 'http://www.w3.org/2000/svg';
    const id = 'xf' + (++faceSeq);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'face');
    svg.innerHTML =
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffb000"/><stop offset="1" stop-color="#ff9500"/></linearGradient>' +
      '<filter id="' + id + 'b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="0.32"/></filter></defs>';
    const gOff = document.createElementNS(NS, 'g');
    gOff.setAttribute('class', 'off');
    const gGlow = document.createElementNS(NS, 'g');
    gGlow.setAttribute('class', 'glow');
    gGlow.setAttribute('filter', 'url(#' + id + 'b)');
    const gLit = document.createElementNS(NS, 'g');
    gLit.setAttribute('class', 'lit');
    const cells = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const mk = function (fillv, inset, rx) {
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', x + inset);
          r.setAttribute('y', y + inset);
          r.setAttribute('width', 1 - inset * 2);
          r.setAttribute('height', 1 - inset * 2);
          r.setAttribute('rx', rx);
          r.setAttribute('fill', fillv);
          return r;
        };
        gOff.appendChild(mk('#262626', 0.1, 0.18));
        const gl = mk('#ffb000', 0.02, 0.3);
        gGlow.appendChild(gl);
        const li = mk('url(#' + id + 'g)', 0.1, 0.18);
        gLit.appendChild(li);
        cells.push([gl, li]);
      }
    }
    svg.appendChild(gOff);
    svg.appendChild(gGlow);
    svg.appendChild(gLit);
    /* 尺寸只写进 --fs0，内边距与圆角由 CSS 按 --fs 算；小屏封面用媒体查询把 --fs 改小 */
    const panel = h('div', { class: 'facepanel' }, svg);
    panel.style.setProperty('--fs0', size + 'px');
    function set(name) {
      const rows = C.faces[name] || C.faces.calm;
      panel.dataset.face = name;
      rows.forEach(function (row, y) {
        for (let x = 0; x < 8; x++) {
          const on = row[x] === '#';
          cells[y * 8 + x].forEach(function (r) { r.classList.toggle('on', on); });
        }
      });
    }
    return { el: panel, set: set };
  }

  /* ---------- 存储：xh.diaries 是数组，最新在前，最多 7 篇 ---------- */
  function validDiary(d) {
    if (!d || !Array.isArray(d.picks) || d.picks.length !== C.moments.length) return false;
    if (!d.picks.every(function (k, i) { return Number.isInteger(k) && !!C.moments[i].options[k]; })) return false;
    if (typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return false;
    return true;
  }
  function clean(d, i) {
    return {
      v: 2,
      id: typeof d.id === 'string' && d.id ? d.id : d.date + '-' + i,
      date: d.date,
      picks: d.picks,
      practice: d.practice || null
    };
  }
  function writeAll(list) {
    if (FRESH) return;
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* 存不了就算了 */ }
  }
  function readAll() {
    if (FRESH) return [];
    let list = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (Array.isArray(raw)) list = raw.filter(validDiary);
    } catch (e) { list = []; }
    try {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (validDiary(old)) {
        list.push(old); // v1 那一篇比数组里任何一篇都旧，放末尾
        list = list.map(clean).slice(0, MAX);
        writeAll(list);
      }
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) { /* 没有旧存档 */ }
    return list.map(clean).slice(0, MAX);
  }
  function save(d) {
    if (FRESH) return;
    const list = readAll().filter(function (x) { return x.id !== d.id; });
    list.unshift(clean(d, 0));
    writeAll(list);
  }

  /* ---------- 复制 ---------- */
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    }
    legacyCopy(text);
    return Promise.resolve();
  }

  /* ---------- 公共块 ---------- */
  /* 说明段：正文五段；带 ?fresh 时在「日记会存在本机」那段后面接一句「这一篇不会保存」；末尾是署名 */
  function aboutBody() {
    const ps = [];
    C.about.body.forEach(function (p, i) {
      ps.push(h('p', null, p));
      if (FRESH && i === 2) ps.push(h('p', { class: 'fresh' }, C.about.freshNote));
    });
    ps.push(h('p', { class: 'maker' }, C.about.maker));
    return ps;
  }
  function galleryLink() {
    return h('p', null, h('a', { href: 'https://xiaoshijie.vercel.app', target: '_blank', rel: 'noopener' }, C.about.gallery));
  }
  /* 页脚：致谢一行露在外面 + 折叠说明。日记页的折叠里多一个陈列馆链接。 */
  function foot(kind) {
    const inside = [h('summary', null, C.about.title)].concat(aboutBody());
    if (kind === 'diary') inside.push(galleryLink());
    return h('footer', { class: 'foot' }, [
      h('p', { class: 'credit' }, C.about.credit),
      h('details', { class: 'about' }, inside)
    ]);
  }
  /* ---------- 封面：标题 → tagline → introSub → introMeta → 按钮（冷启动评委：说清「不是测评」的话不能折在页脚里） ---------- */
  function renderCover() {
    state = newState();
    current = null;
    setSky(SKY.cover);
    const face = makeFace(96);
    face.set('calm');
    face.el.classList.add('breath');
    const saved = readAll();
    const sec = h('section', { class: 'screen cover' }, [
      h('div', { class: 'cover-main' }, [
        face.el,
        h('h1', { class: 'title' }, C.title),
        h('p', { class: 'tagline' }, C.tagline),
        h('p', { class: 'sub' }, C.introSub),
        h('p', { class: 'meta' }, C.introMeta),
        h('button', { class: 'btn primary big', type: 'button', onclick: function () { renderMoment(0); } }, C.startBtn),
        saved.length ? h('button', { class: 'link', type: 'button', onclick: function () { renderDiary(saved[0]); } },
          fill(C.lastDiaryLink, { date: fmtDate(saved[0].date) })) : null
      ]),
      foot('cover')
    ]);
    mount(sec);
  }

  /* ---------- 时刻页 ---------- */
  function renderMoment(i) {
    const m = C.moments[i];
    setSky({ colors: m.sky, dark: m.dark });
    const face = makeFace(56);
    face.set('calm');
    const noted = h('div', { class: 'noted', 'aria-live': 'polite' });
    const actions = h('div', { class: 'actions' });
    const order = shuffled(m.options.length); // 每次进入都打乱，编号按显示顺序；存的是原始下标
    const optEls = order.map(function (k, pos) {
      const o = m.options[k];
      return h('button', { class: 'opt', type: 'button', 'data-k': k, onclick: function () { choose(k); } }, [
        h('span', { class: 'n', 'aria-hidden': 'true' }, NUM[pos]),
        h('span', { class: 'txt' }, o.text)
      ]);
    });
    const dots = h('div', { class: 'dots', 'aria-hidden': 'true' }, C.moments.map(function (_, j) {
      return h('i', { class: j < i ? 'done' : j === i ? 'now' : '' });
    }));
    const sec = h('section', { class: 'screen moment' }, [
      h('header', { class: 'top' }, [
        h('div', { class: 'when' }, [h('span', { class: 'time' }, m.time), h('span', { class: 'name' }, m.name)]),
        dots,
        face.el
      ]),
      h('p', { class: 'scene' }, m.scene),
      h('p', { class: 'q' }, C.question),
      i === 0 ? h('p', { class: 'qhint' }, C.firstHint) : null, // 只在第一个时刻出现一次（含「选了就不改了」）
      h('div', { class: 'opts' }, optEls),
      noted,
      actions
    ]);
    mount(sec);

    function choose(k) {
      if (state.picks[i] != null) return;
      state.picks[i] = k;
      const o = m.options[k];
      optEls.forEach(function (b) {
        b.disabled = true;
        b.classList.add(Number(b.dataset.k) === k ? 'chosen' : 'faded');
      });
      face.set(C.modes[o.mode].face);
      noted.appendChild(h('div', { class: 'lbl' }, C.noted));
      noted.appendChild(h('p', { class: 'dline' }, o.diary));
      requestAnimationFrame(function () { noted.classList.add('in'); });
      const last = i === C.moments.length - 1;
      const btn = h('button', {
        class: 'btn primary late', type: 'button',
        onclick: function () { if (last) renderPractice(); else renderMoment(i + 1); }
      }, last ? C.toPracticeBtn : C.nextBtn);
      setTimeout(function () {
        actions.appendChild(btn);
        requestAnimationFrame(function () { btn.classList.add('in'); });
        btn.focus({ preventScroll: true });
        btn.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
      }, T_NEXT);
    }
  }

  /* ---------- 睡前练习 ---------- */
  function renderPractice() {
    setSky(SKY.night);
    const P = C.practice;
    const face = makeFace(56);
    face.set('calm');
    const picks = state.picks
      .map(function (k, i) { return { i: i, k: k, m: C.moments[i], o: C.moments[i].options[k] }; })
      .filter(function (p) { return p.o.mode !== 'free'; });
    const allFree = picks.length === 0;
    const someFree = picks.length < C.moments.length;
    let chosen = null;
    let done = false;

    /* 全自在那天没有句子可改：占位、两颗按钮、结语都换成「写一句想说的话」那一套 */
    const placeholder = allFree ? P.placeholderAllFree : P.placeholder;
    const detail = h('div', { class: 'detail', hidden: true });
    const ta = h('textarea', { placeholder: placeholder, rows: 3, 'aria-label': placeholder });
    const doneBtn = h('button', {
      class: 'btn primary', type: 'button', disabled: true,
      onclick: function () {
        if (done || !ta.value.trim()) return;
        done = true;
        doneBtn.disabled = true;
        doneBtn.classList.add('sent'); // 按下去之后这 1 秒保持亮着，不退回描边态
        skipBtn.disabled = true;
        face.set('happy'); // 改好了：脸亮一下，停 1 秒再进日记页
        const pr = { skipped: false, mode: chosen ? chosen.o.mode : 'free', from: chosen ? chosen.o.text : null, to: ta.value.trim() };
        setTimeout(function () { finish(pr); }, T_HAPPY);
      }
    }, allFree ? P.doneAllFree : P.done);
    const skipBtn = h('button', {
      class: 'btn', type: 'button',
      onclick: function () { if (done) return; done = true; finish({ skipped: true }); }
    }, allFree ? P.skipAllFree : P.skip);
    ta.addEventListener('input', function () { doneBtn.disabled = done || !ta.value.trim(); });

    function showHint(mode, example) {
      const hint = P.hints[mode];
      detail.replaceChildren(
        h('p', { class: 'hint' }, hint.hint),
        h('p', { class: 'example' }, [h('span', { class: 'exlead' }, P.exampleLead), h('span', { class: 'extext' }, example)]),
        ta
      );
      detail.hidden = false;
    }

    const rows = picks.map(function (p) {
      const row = h('button', { class: 'pick', type: 'button', 'aria-pressed': 'false' }, [
        h('span', { class: 'ptime' }, p.m.time),
        h('span', { class: 'ptext' }, p.o.text),
        h('span', { class: 'pgo' }, P.pick)
      ]);
      row.addEventListener('click', function () {
        if (done) return;
        chosen = p;
        rows.forEach(function (r) {
          const on = r.p === p;
          r.row.classList.toggle('chosen', on);
          r.row.classList.toggle('faded', !on);
          r.row.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        showHint(p.o.mode, p.o.example || P.hints[p.o.mode].example); // 例句跟所挑的那句走，提示按说法
        ta.focus({ preventScroll: true });
        detail.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
      });
      return { p: p, row: row };
    });

    const sec = h('section', { class: 'screen practice' }, [
      h('header', { class: 'top' }, [h('h2', null, P.title), face.el]),
      h('p', { class: 'lead' }, allFree ? P.leadAllFree : P.lead),
      allFree ? null : h('p', { class: 'how' }, P.how), // 先挑一句、挑好后有提示和例句、不改怎么走：放在句子列表上方
      allFree ? null : h('div', { class: 'picks' }, rows.map(function (r) { return r.row; })),
      allFree || !someFree ? null : h('p', { class: 'pnote' }, P.note), // 今天有自在的时刻才需要解释它们为什么不在列表里
      detail,
      h('div', { class: 'actions' }, [skipBtn, doneBtn])
    ]);
    mount(sec);
    if (allFree) showHint('free', P.hints.free.example);
  }

  function finish(practice) {
    state.practice = practice;
    state.date = todayISO();
    state.id = String(Date.now());
    save(state);
    renderDiary(state);
  }

  /* ---------- 日记页 ---------- */
  function renderDiary(d) {
    current = d;
    setSky(SKY.paper);
    const face = makeFace(56);
    face.set('sleep');
    const c = closing(d);
    const all = readAll();
    const list = all.some(function (x) { return x.id === d.id; }) ? all : [d].concat(all); // ?fresh 时 all 为空
    const lines = diaryLines(d).map(function (l) {
      return h('p', { class: 'line' }, [h('time', null, l.time), h('span', null, l.text)]);
    });
    const copyBtn = h('button', { class: 'btn', type: 'button', onclick: doCopy }, C.diary.copyBtn);
    function doCopy() {
      copyText(shareText(d)).then(function () {
        copyBtn.textContent = C.diary.copied;
        setTimeout(function () { copyBtn.textContent = C.diary.copyBtn; }, 1600);
      });
    }
    const sec = h('section', { class: 'screen diary' }, [
      h('header', { class: 'dhead' }, [
        face.el,
        h('div', null, [h('h2', null, C.diary.title), h('div', { class: 'date' }, fmtDate(d.date))])
      ]),
      list.length > 1 ? h('div', { class: 'dates' }, list.map(function (x) {
        const now = x.id === d.id;
        return h('button', {
          class: 'datebtn' + (now ? ' now' : ''), type: 'button',
          'aria-current': now ? 'true' : null, disabled: now,
          onclick: function () { renderDiary(x); }
        }, dateLabel(x, list)); // 同一天有多篇时带上时间「9月4日 21:05」
      })) : null,
      h('div', { class: 'entry' }, lines.concat([
        h('div', { class: 'close' }, [
          h('p', null, c.tally),
          h('p', null, c.dominant),
          h('p', null, c.practice),
          h('p', null, C.diary.goodnight)
        ]),
        h('p', { class: 'sign' }, C.diary.signoff),
        h('p', { class: 'ps' }, C.diary.psLead + c.tomorrow)
      ])),
      h('div', { class: 'actions' }, [
        copyBtn,
        h('button', { class: 'btn', type: 'button', onclick: again }, C.diary.againBtn)
      ]),
      foot('diary')
    ]);
    mount(sec);
  }
  function again() { // 再过一天：直接进 07:40，不回封面
    state = newState();
    current = null;
    renderMoment(0);
  }

  /* 给自动化测试留的只读窥孔 */
  window.__xh = {
    fresh: FRESH,
    state: function () { return state; },
    current: function () { return current; },
    shareText: function () { return current ? shareText(current) : ''; }
  };

  renderCover();
})(typeof window !== 'undefined' ? window : globalThis);
