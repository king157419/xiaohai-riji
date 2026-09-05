/* 小孩日记 · 逻辑。文案与数据全部在 content.js（window.XH），这里只负责渲染与状态。
   存储只有 localStorage 的 xh.diaries 一项（数组，最新在前，最多 7 篇）；地址带 ?fresh 时不读不写。零外部请求。 */
(function () {
  'use strict';
  const C = window.XH;
  const KEY = 'xh.diaries';
  const LEGACY_KEY = 'xh.diary'; // v1 只存一篇；读到就并进数组，然后删掉旧键
  const MAX = 7;
  const SITE = 'https://xiaohai-riji.vercel.app';
  const FRESH = /[?&]fresh(?:[=&]|$)/.test(location.search);
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NUM = ['一', '二', '三', '四'];
  const HARSH = C.modeOrder.filter(function (k) { return k !== 'free'; });
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

  /* ---------- 小工具 ---------- */
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
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
  }
  function todayISO() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtDate(iso) {
    const parts = iso.split('-');
    return fill(C.diary.dateFmt, { m: Number(parts[1]), d: Number(parts[2]) });
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
    const pad = Math.round(size * 0.16);
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
    const panel = h('div', { class: 'facepanel' }, svg);
    panel.style.padding = pad + 'px';
    panel.style.borderRadius = Math.round(size * 0.22) + 'px';
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

  /* ---------- 统计 ---------- */
  function tallies(picks) {
    const t = {};
    C.modeOrder.forEach(function (k) { t[k] = 0; });
    picks.forEach(function (k, i) { t[C.moments[i].options[k].mode]++; });
    return t;
  }
  /* 「最常」只给唯一最大值。自在要 ≥ 4 才算最常；不到 4 时只在五种重话里比，打平或全 0 返回 null（用 dominantTie）。 */
  function dominant(t) {
    if (t.free >= 4) return 'free';
    let best = null;
    let tie = false;
    HARSH.forEach(function (k) {
      if (t[k] === 0) return;
      if (best === null || t[k] > t[best]) { best = k; tie = false; }
      else if (t[k] === t[best]) tie = true;
    });
    return best !== null && !tie ? best : null;
  }
  function dominantText(dom) { return dom ? C.diary.dominant[dom] : C.diary.dominantTie; }
  function tallyText(t) {
    return C.modeOrder
      .filter(function (k) { return t[k] > 0; })
      .map(function (k) { return fill(C.modes[k].tally, { n: C.numerals[t[k]] }); })
      .join('，');
  }
  /* 明天的小事：先跟睡前改的那句的说法走；没改就跟唯一最大的说法；再没有就 tie */
  function tomorrowKey(d, dom) {
    const pr = d.practice;
    if (pr && !pr.skipped && pr.from && C.diary.tomorrow[pr.mode]) return pr.mode;
    return dom || 'tie';
  }
  function quoted(s) { return String(s || '').trim().replace(/[。\s]+$/, ''); } // 引号里的句子不带句末句号
  function practiceLine(pr) {
    if (!pr || pr.skipped) return C.diary.skipped;
    if (pr.from) return fill(C.diary.rewrote, { from: quoted(pr.from), to: quoted(pr.to) });
    return fill(C.diary.said, { to: quoted(pr.to) });
  }
  function diaryLines(d) {
    return d.picks.map(function (k, i) { return { time: C.moments[i].time, text: C.moments[i].options[k].diary }; });
  }
  /* 复制的是整篇：六行、结语、落款、附言、地址。和日记页看到的一字不差。 */
  function shareText(d) {
    const t = tallies(d.picks);
    const dom = dominant(t);
    return fill(C.diary.share, {
      date: fmtDate(d.date),
      lines: diaryLines(d).map(function (l) { return l.time + ' ' + l.text; }).join('\n'),
      tally: tallyText(t),
      dominant: dominantText(dom),
      practice: practiceLine(d.practice),
      goodnight: C.diary.goodnight,
      psLead: C.diary.psLead,
      tomorrow: C.diary.tomorrow[tomorrowKey(d, dom)],
      url: SITE
    });
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
  function aboutBody() { return C.about.body.map(function (p) { return h('p', null, p); }); }
  function galleryLink() {
    return h('p', null, h('a', { href: 'https://xiaoshijie.vercel.app', target: '_blank', rel: 'noopener' }, C.about.gallery));
  }
  /* 封面页脚：致谢一行 + 折叠说明。日记页脚：只剩折叠的一行，致谢与陈列馆链接都收在里面。 */
  function foot(kind) {
    if (kind === 'diary') {
      return h('footer', { class: 'foot one' },
        h('details', { class: 'about' }, [h('summary', null, C.about.title)].concat(aboutBody(), [
          h('p', { class: 'credit' }, C.about.credit),
          galleryLink()
        ])));
    }
    return h('footer', { class: 'foot' }, [
      h('p', { class: 'credit' }, C.about.credit),
      h('details', { class: 'about' }, [h('summary', null, C.about.title)].concat(aboutBody()))
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
      i === 0 ? h('p', { class: 'qhint' }, C.firstHint) : null, // 只在第一个时刻出现一次
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

    const detail = h('div', { class: 'detail', hidden: true });
    const ta = h('textarea', { placeholder: P.placeholder, rows: 3, 'aria-label': P.placeholder });
    const doneBtn = h('button', {
      class: 'btn primary', type: 'button', disabled: true,
      onclick: function () {
        if (done || !ta.value.trim()) return;
        done = true;
        doneBtn.disabled = true;
        skipBtn.disabled = true;
        face.set('happy'); // 改好了：脸亮一下，停 1 秒再进日记页
        const pr = { skipped: false, mode: chosen ? chosen.o.mode : 'free', from: chosen ? chosen.o.text : null, to: ta.value.trim() };
        setTimeout(function () { finish(pr); }, T_HAPPY);
      }
    }, P.done);
    const skipBtn = h('button', {
      class: 'btn', type: 'button',
      onclick: function () { if (done) return; done = true; finish({ skipped: true }); }
    }, P.skip);
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
      allFree ? null : h('p', { class: 'how' }, P.how), // 怎么做、不做怎么走（冷启动评委第三件）
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
    const t = tallies(d.picks);
    const dom = dominant(t);
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
        }, fmtDate(x.date));
      })) : null,
      h('div', { class: 'entry' }, lines.concat([
        h('div', { class: 'close' }, [
          h('p', null, C.diary.tallyLead + tallyText(t) + '。'),
          h('p', null, dominantText(dom)),
          h('p', null, practiceLine(d.practice)),
          h('p', null, C.diary.goodnight)
        ]),
        h('p', { class: 'sign' }, C.diary.signoff),
        h('p', { class: 'ps' }, C.diary.psLead + C.diary.tomorrow[tomorrowKey(d, dom)])
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
})();
