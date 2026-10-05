(function () {
  'use strict';

  var LENGTHS = [3, 5, 7];
  var STORE_KEY = 'woodtype-wordle:v3';
  var STAMP_MS = 500;
  var STEP_MS = 280;
  var RANK = { absent: 1, present: 2, correct: 3 };
  var STATE_LABEL = { tbd: '', correct: ', right spot', present: ', wrong spot', absent: ', not in word' };
  var MIDDLE_LINES = ['Masterwork', 'Crisp print', 'Clean proof', 'Good press', 'Well inked', 'Pulled it off'];
  var ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  var KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'];
  var BACK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11v12H9l-6-6z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>';

  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  // One more try than the word has letters: 4, 6 or 8.
  function rowsFor(len) { return len + 1; }
  // 1 hint for 3 letters, 2 for 5, 3 for 7.
  function maxHints(len) { return Math.floor((len - 1) / 2); }
  function winLine(row, rows) {
    if (row === 0) return 'First impression!';
    if (row === rows - 1) return 'Last sheet. Phew!';
    return MIDDLE_LINES[row - 1] || 'Printed';
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  // ---------- word lists ----------

  var LISTS = {};
  LENGTHS.forEach(function (len) {
    var w = window.WORDS[len];
    LISTS[len] = {
      answers: w.answers,
      answerSet: new Set(w.answers),
      valid: new Set(w.answers.concat(w.guesses))
    };
  });

  function shuffledIndexes(n) {
    var idx = [], i;
    for (i = 0; i < n; i++) idx.push(i);
    for (i = n - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    return idx;
  }

  // Each length draws from a shuffled "bag" of its answers, so no word
  // repeats until every word of that length has been played.
  function drawAnswer(len) {
    if (!bags[len].length) bags[len] = shuffledIndexes(LISTS[len].answers.length);
    return LISTS[len].answers[bags[len].pop()].toUpperCase();
  }
  function cleanBag(saved, len) {
    var n = LISTS[len].answers.length;
    if (!Array.isArray(saved)) return [];
    return saved.filter(function (i, k, a) { return i === (i | 0) && i >= 0 && i < n && a.indexOf(i) === k; });
  }

  // Wordle scoring, including repeated letters: greens first, then yellows
  // only while unmatched copies of that letter remain in the answer.
  function score(guess, answer) {
    var res = [], left = {}, i, n = guess.length;
    for (i = 0; i < n; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else { res[i] = 'absent'; left[answer[i]] = (left[answer[i]] || 0) + 1; }
    }
    for (i = 0; i < n; i++) {
      if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  }

  // ---------- saved state ----------

  function readStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s) return s;
      // Earlier daily-puzzle versions: keep stats and settings, start fresh words.
      var v2 = JSON.parse(localStorage.getItem('woodtype-wordle:v2'));
      if (v2) return { stats: v2.stats, settings: v2.settings };
      var v1 = JSON.parse(localStorage.getItem('woodtype-wordle:v1'));
      if (v1) return { stats: { 5: v1.stats }, settings: v1.settings };
    } catch (e) { /* storage unavailable */ }
    return {};
  }
  function serializeGames() {
    var out = {};
    LENGTHS.forEach(function (len) {
      var g = games[len];
      out[len] = { answer: g.answer, guesses: g.guesses, hard: g.hard, hints: g.hints, counted: g.counted };
    });
    return out;
  }
  function writeStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ stats: stats, settings: settings, games: serializeGames(), bags: bags }));
    } catch (e) { /* storage unavailable: the game still works for this visit */ }
  }

  function makeGame(len, answer) {
    return { len: len, rows: rowsFor(len), answer: answer, guesses: [], current: '', status: 'playing', hard: false, hints: [], counted: false };
  }
  function statusOf(g) {
    if (g.guesses[g.guesses.length - 1] === g.answer) return 'won';
    return g.guesses.length >= g.rows ? 'lost' : 'playing';
  }
  // Resume an unfinished word; a finished one is replaced by a fresh word.
  function restoreGame(len, saved) {
    if (!saved || typeof saved.answer !== 'string' || !LISTS[len].answerSet.has(saved.answer.toLowerCase())) return null;
    var g = makeGame(len, saved.answer.toUpperCase());
    if (Array.isArray(saved.guesses)) {
      g.guesses = saved.guesses
        .filter(function (w) { return typeof w === 'string' && w.length === len; })
        .slice(0, g.rows)
        .map(function (w) { return w.toUpperCase(); });
    }
    if (Array.isArray(saved.hints)) {
      g.hints = saved.hints
        .filter(function (i, k, a) { return i === (i | 0) && i >= 0 && i < len && a.indexOf(i) === k; })
        .slice(0, maxHints(len));
    }
    g.hard = !!saved.hard;
    g.counted = !!saved.counted;
    g.status = statusOf(g);
    return g.status === 'playing' ? g : null;
  }
  function loadStats(saved, len) {
    var rows = rowsFor(len);
    var s = Object.assign({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [] }, saved);
    var dist = [];
    for (var i = 0; i < rows; i++) dist.push((Array.isArray(s.dist) && s.dist[i]) || 0);
    s.dist = dist;
    return s;
  }

  var stored = readStore();
  var settings = Object.assign({ hard: false, contrast: false, length: 5 }, stored.settings);
  if (LENGTHS.indexOf(settings.length) < 0) settings.length = 5;
  var stats = {};
  var bags = {};
  var games = {};
  LENGTHS.forEach(function (len) {
    stats[len] = loadStats((stored.stats || {})[len], len);
    bags[len] = cleanBag((stored.bags || {})[len], len);
    games[len] = restoreGame(len, (stored.games || {})[len]) || makeGame(len, drawAnswer(len));
  });
  var game = games[settings.length];
  var busy = false;
  var gen = 0; // bumps when the board is swapped, so stale animation timers do nothing

  // Streak = wins in a row; a loss resets it.
  function recordResult(g) {
    if (g.counted) return;
    g.counted = true;
    var s = stats[g.len];
    s.played++;
    if (g.status === 'won') {
      s.wins++;
      s.dist[g.guesses.length - 1]++;
      s.streak++;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
    } else {
      s.streak = 0;
    }
  }

  // ---------- board and keyboard ----------

  var boardEl = $('board');
  var rowEls = [];
  var tiles = [];

  function onTileAnimEnd(e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('pop', 'hop'); }
  function onRowAnimEnd(e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('shake'); }

  function buildBoard(len, rows) {
    boardEl.textContent = '';
    boardEl.style.setProperty('--cols', len);
    boardEl.style.setProperty('--rows', rows);
    rowEls = [];
    tiles = [];
    for (var r = 0; r < rows; r++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'row';
      rowEl.setAttribute('role', 'group');
      rowEl.setAttribute('aria-label', 'Row ' + (r + 1));
      rowEl.addEventListener('animationend', onRowAnimEnd);
      var rowTiles = [];
      for (var c = 0; c < len; c++) {
        var t = document.createElement('div');
        t.className = 'tile';
        t.setAttribute('role', 'img');
        t.addEventListener('animationend', onTileAnimEnd);
        paint(t);
        rowEl.appendChild(t);
        rowTiles.push(t);
      }
      boardEl.appendChild(rowEl);
      rowEls.push(rowEl);
      tiles.push(rowTiles);
    }
    boardEl.dataset.size = len + 'x' + rows;
  }

  var keys = {};
  var kbEl = $('keyboard');
  KB_ROWS.forEach(function (line, li) {
    var krow = document.createElement('div');
    krow.className = 'krow' + (li === 1 ? ' mid' : '');
    line.split('').forEach(function (ch) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'key';
      k.tabIndex = -1;
      var code = ch;
      if (ch === '>') { code = 'ENTER'; k.classList.add('wide'); k.textContent = 'Enter'; }
      else if (ch === '<') { code = 'BACK'; k.classList.add('wide'); k.innerHTML = BACK_ICON; k.setAttribute('aria-label', 'Delete letter'); }
      else { k.textContent = ch; keys[ch] = k; }
      k.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // keep focus where it was
      k.addEventListener('click', function () { handleKey(code); });
      krow.appendChild(k);
    });
    kbEl.appendChild(krow);
  });

  function paint(t, letter, state) {
    t.textContent = letter || '';
    t.dataset.state = state || (letter ? 'tbd' : 'empty');
    t.setAttribute('aria-label', letter ? letter + STATE_LABEL[t.dataset.state] : 'empty');
  }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  function markKey(letter, state) {
    var k = keys[letter], cur = k.dataset.state;
    if (!cur || RANK[state] > RANK[cur]) k.dataset.state = state;
  }
  function applyKeys(word, res) {
    for (var i = 0; i < word.length; i++) markKey(word[i], res[i]);
  }

  // Hinted letters show faintly in the row you're typing, in their right spot.
  function refreshGhosts() {
    var g = game, cur = g.status === 'playing' ? g.guesses.length : -1;
    tiles.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (r === cur && g.hints.indexOf(c) >= 0) {
          t.dataset.hint = g.answer[c];
          if (t.dataset.state === 'empty') t.setAttribute('aria-label', 'empty, hint ' + g.answer[c]);
        } else if (t.dataset.hint) {
          delete t.dataset.hint;
          if (t.dataset.state === 'empty') t.setAttribute('aria-label', 'empty');
        }
      });
    });
  }

  function renderAll() {
    var g = game;
    if (boardEl.dataset.size !== g.len + 'x' + g.rows) buildBoard(g.len, g.rows);
    for (var r = 0; r < g.rows; r++) {
      var word = r < g.guesses.length ? g.guesses[r] : (r === g.guesses.length ? g.current : '');
      var res = r < g.guesses.length ? score(word, g.answer) : null;
      for (var c = 0; c < g.len; c++) {
        tiles[r][c].classList.remove('pop', 'stamp', 'hop');
        paint(tiles[r][c], word[c], res ? res[c] : null);
      }
    }
    Object.keys(keys).forEach(function (ch) { delete keys[ch].dataset.state; });
    g.guesses.forEach(function (w) { applyKeys(w, score(w, g.answer)); });
    g.hints.forEach(function (i) { markKey(g.answer[i], 'correct'); });
    refreshGhosts();
    updateSubtitle();
    updateSettingsLock();
    updateToolbar();
  }

  function updateSubtitle() {
    var g = game;
    var number = stats[g.len].played + (g.counted ? 0 : 1);
    var tail = g.status === 'won' ? 'Solved in ' + g.guesses.length
      : g.status === 'lost' ? 'Not solved'
      : 'Impression ' + (g.guesses.length + 1) + ' of ' + g.rows;
    var hard = g.guesses.length ? g.hard : settings.hard;
    $('subtitle').textContent = 'Word ' + number + ' · ' + tail + (hard ? ' · Hard' : '');
  }

  // ---------- messages ----------

  var toastsEl = $('toasts');
  function toast(text, ms) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    toastsEl.prepend(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 300);
    }, ms || 1400);
  }
  function clearToasts() { toastsEl.textContent = ''; }
  function announce(text) { $('live').textContent = text; }
  function later(fn, ms) { var g0 = gen; setTimeout(function () { if (gen === g0) fn(); }, ms); }

  // ---------- play ----------

  function handleKey(code) {
    if (busy || openModalEl) return;
    if (game.status !== 'playing') {
      if (code === 'ENTER') nextWord(); // Enter after a finished word deals the next one
      return;
    }
    if (code === 'ENTER') submit();
    else if (code === 'BACK') removeLetter();
    else if (/^[A-Z]$/.test(code)) addLetter(code);
  }

  function addLetter(ch) {
    var g = game;
    if (g.current.length >= g.len) return;
    var t = tiles[g.guesses.length][g.current.length];
    g.current += ch;
    paint(t, ch);
    if (!reduced) restart(t, 'pop');
  }

  function removeLetter() {
    var g = game;
    if (!g.current) return;
    g.current = g.current.slice(0, -1);
    paint(tiles[g.guesses.length][g.current.length]);
    refreshGhosts();
  }

  function reject(r, msg) {
    toast(msg);
    announce(msg);
    if (!reduced) restart(rowEls[r], 'shake');
  }

  function hardModeError(g, guess) {
    var i;
    for (i = 0; i < g.hints.length; i++) {
      var p = g.hints[i];
      if (guess[p] !== g.answer[p]) return ORDINALS[p] + ' letter must be ' + g.answer[p];
    }
    for (var n = 0; n < g.guesses.length; n++) {
      var prev = g.guesses[n], res = score(prev, g.answer), need = {};
      for (i = 0; i < g.len; i++) {
        if (res[i] === 'correct' && guess[i] !== prev[i]) return ORDINALS[i] + ' letter must be ' + prev[i];
        if (res[i] !== 'absent') need[prev[i]] = (need[prev[i]] || 0) + 1;
      }
      for (var letter in need) {
        var have = guess.split(letter).length - 1;
        if (have < need[letter]) return 'Guess must contain ' + letter;
      }
    }
    return null;
  }

  function revealRow(r, word, res) {
    var g0 = gen, rowTiles = tiles[r], last = rowTiles.length - 1;
    if (reduced) {
      rowTiles.forEach(function (t, i) { paint(t, word[i], res[i]); });
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      rowTiles.forEach(function (t, i) {
        setTimeout(function () {
          if (gen !== g0) return;
          t.classList.remove('pop');
          restart(t, 'stamp');
          setTimeout(function () { if (gen === g0) paint(t, word[i], res[i]); }, STAMP_MS * 0.45);
          setTimeout(function () {
            if (gen !== g0) return;
            t.classList.remove('stamp');
            if (i === last) resolve();
          }, STAMP_MS);
        }, i * STEP_MS);
      });
    });
  }

  function submit() {
    var g = game, r = g.guesses.length, guess = g.current;
    if (guess.length < g.len) return reject(r, 'Not enough letters');
    if (!LISTS[g.len].valid.has(guess.toLowerCase())) return reject(r, 'Not in word list');
    if (r === 0) g.hard = settings.hard;
    if (g.hard) {
      var err = hardModeError(g, guess);
      if (err) return reject(r, err);
    }

    var res = score(guess, g.answer);
    g.guesses.push(guess);
    g.current = '';
    g.status = statusOf(g);
    if (g.status !== 'playing') recordResult(g);
    writeStore(); // save before the animation so a reload can't lose the guess

    busy = true;
    var g0 = gen;
    refreshGhosts();
    revealRow(r, guess, res).then(function () {
      if (gen !== g0) return;
      busy = false;
      applyKeys(guess, res);
      announce(guess.split('').map(function (ch, i) { return ch + STATE_LABEL[res[i]]; }).join('; '));
      refreshGhosts();
      updateSubtitle();
      updateSettingsLock();
      updateToolbar();
      if (g.status === 'won') {
        toast(winLine(r, g.rows), 2000);
        if (!reduced) tiles[r].forEach(function (t, i) { later(function () { t.classList.add('hop'); }, i * 100); });
        later(openStats, 2300);
      } else if (g.status === 'lost') {
        toast(g.answer, 3000);
        later(openStats, 2300);
      }
    });
  }

  function nextWord() {
    var len = game.len;
    games[len] = makeGame(len, drawAnswer(len));
    writeStore();
    switchTo(games[len]);
  }
  function switchTo(g) {
    gen++;
    busy = false;
    game = g;
    clearToasts();
    closeModal();
    renderAll();
  }

  // ---------- toolbar: hint, next word, word length ----------

  var btnHint = $('btn-hint');
  var btnNext = $('btn-next');

  function hintsLeft(g) { return maxHints(g.len) - g.hints.length; }

  function useHint() {
    var g = game;
    if (busy || openModalEl || g.status !== 'playing') return;
    if (hintsLeft(g) <= 0) { toast('No hints left'); return; }

    // positions you haven't already pinned down with a green or an earlier hint
    var known = {}, open = [], i;
    g.guesses.forEach(function (w) {
      score(w, g.answer).forEach(function (s, j) { if (s === 'correct') known[j] = true; });
    });
    g.hints.forEach(function (j) { known[j] = true; });
    for (i = 0; i < g.len; i++) if (!known[i]) open.push(i);
    if (!open.length) { toast("You've found every letter's spot already"); return; }

    var pos = open[Math.floor(Math.random() * open.length)];
    g.hints.push(pos);
    writeStore();

    markKey(g.answer[pos], 'correct');
    refreshGhosts();
    updateToolbar();
    var t = tiles[g.guesses.length][pos];
    if (!reduced && t.dataset.state === 'empty') restart(t, 'pop');
    var msg = 'Hint: ' + ORDINALS[pos] + ' letter is ' + g.answer[pos];
    toast(msg, 2400);
    announce(msg);
  }

  // While playing the right-hand button is Hint; once the word is done it becomes Next word.
  function updateToolbar() {
    var g = game, over = g.status !== 'playing', left = hintsLeft(g);
    btnHint.hidden = over;
    btnNext.hidden = !over;
    $('hint-count').textContent = left;
    btnHint.disabled = left <= 0;
    btnHint.setAttribute('aria-label', left > 0 ? 'Get a hint, ' + left + ' left' : 'No hints left');
    sizeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.len) === g.len)); });
  }
  btnHint.addEventListener('click', useHint);
  btnNext.addEventListener('click', nextWord);

  function pickLength(len) {
    settings.length = len;
    writeStore();
    if (game === games[len]) closeModal();
    else switchTo(games[len]); // switchTo closes any open popup too
  }
  var sizeBtns = Array.prototype.slice.call(document.querySelectorAll('.size-btn'));
  sizeBtns.forEach(function (b) {
    b.addEventListener('click', function () { pickLength(Number(b.dataset.len)); });
  });

  // ---------- modals ----------

  var openModalEl = null;
  var lastFocus = null;

  function openModal(id, focusSelector) {
    if (openModalEl) closeModal(true);
    var m = $(id);
    lastFocus = document.activeElement;
    m.hidden = false;
    openModalEl = m;
    m.querySelector(focusSelector || '.sheet').focus();
  }
  function closeModal(swapping) {
    if (!openModalEl) return;
    openModalEl.hidden = true;
    openModalEl = null;
    if (!swapping && lastFocus && lastFocus.focus && lastFocus !== document.body && !lastFocus.hidden) lastFocus.focus({ preventScroll: true });
  }
  function trapTab(e) {
    var f = openModalEl.querySelectorAll('button:not([hidden]):not([disabled]), input:not([disabled]), textarea:not([hidden])');
    f = Array.prototype.filter.call(f, function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === openModalEl.querySelector('.sheet'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.overlay'), function (o) {
    o.addEventListener('click', function (e) { if (e.target === o) closeModal(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () { closeModal(); });
  });

  // ---------- welcome ----------

  function openWelcome() {
    var wrap = $('welcome-sizes');
    wrap.textContent = '';
    LENGTHS.forEach(function (len) {
      var g = games[len], wins = stats[len].wins;
      var status = g.guesses.length ? g.guesses.length + ' of ' + g.rows + ' tries used' : 'New word ready';
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'size-card';
      card.setAttribute('aria-pressed', String(game.len === len));
      card.setAttribute('aria-label', 'Play ' + len + ' letters. ' + status + (wins ? ', ' + wins + ' solved so far' : ''));

      var block = document.createElement('span');
      block.className = 'tile';
      block.dataset.state = 'tbd';
      block.textContent = len;
      var name = document.createElement('span');
      name.className = 'size-name';
      name.textContent = len + ' letters';
      var note = document.createElement('span');
      note.className = 'size-status';
      note.textContent = status;
      card.append(block, name, note);
      if (wins) {
        var solved = document.createElement('span');
        solved.className = 'size-solved';
        solved.textContent = wins + ' solved';
        card.append(solved);
      }

      card.addEventListener('click', function () { pickLength(len); });
      wrap.appendChild(card);
    });

    $('btn-welcome-play').textContent = 'Play ' + game.len + ' letters';
    openModal('modal-welcome', '#btn-welcome-play');
  }

  $('btn-welcome-play').addEventListener('click', function () { closeModal(); });
  $('btn-welcome-help').addEventListener('click', function () { openModal('modal-help'); });

  $('btn-help').addEventListener('click', function () { openModal('modal-help'); });
  $('btn-stats').addEventListener('click', openStats);
  $('btn-settings').addEventListener('click', function () { openModal('modal-settings'); });

  // ---------- statistics ----------

  function openStats() {
    renderStats();
    openModal('modal-stats', game.status !== 'playing' ? '#btn-next-stats' : null);
  }

  function renderStats() {
    var g = game, s = stats[g.len];
    $('stats-sub').textContent = g.len + '-letter games';
    var pct = s.played ? Math.round(s.wins / s.played * 100) : 0;
    $('stat-row').innerHTML = [[s.played, 'Played'], [pct, 'Win %'], [s.streak, 'Current streak'], [s.maxStreak, 'Max streak']]
      .map(function (x) { return '<div><div class="stat-num">' + x[0] + '</div><div class="stat-label">' + x[1] + '</div></div>'; })
      .join('');

    var dist = $('dist');
    if (!s.wins) {
      dist.innerHTML = '<p class="dist-empty">Solve a ' + g.len + '-letter word to start your record.</p>';
    } else {
      var max = Math.max.apply(null, s.dist);
      var cur = g.status === 'won' ? g.guesses.length - 1 : -1;
      dist.innerHTML = s.dist.map(function (n, i) {
        var w = Math.max(7, n / max * 100);
        return '<div class="dist-row"><span class="dist-n">' + (i + 1) + '</span>' +
          '<div><div class="bar' + (i === cur ? ' current' : '') + '" style="width:' + w + '%">' + n + '</div></div></div>';
      }).join('');
    }

    var done = g.status !== 'playing';
    var result = $('result');
    result.hidden = !done;
    if (done) {
      var withHints = g.hints.length ? ' with ' + plural(g.hints.length, 'hint') : '';
      result.innerHTML = g.status === 'won'
        ? 'Solved in ' + g.guesses.length + (g.guesses.length === 1 ? ' guess' : ' guesses') + withHints + '.'
        : 'The word was <b>' + g.answer + '</b>.';
    }
    $('stats-foot').hidden = !done;
    $('share-fallback').hidden = true;
  }

  function shareText(g) {
    var squares = settings.contrast
      ? { correct: '🟧', present: '🟦', absent: '⬛' }
      : { correct: '🟩', present: '🟨', absent: '⬛' };
    var n = g.status === 'won' ? g.guesses.length : 'X';
    var hints = g.hints.length ? ' · ' + plural(g.hints.length, 'hint') : '';
    var grid = g.guesses.map(function (w) {
      return score(w, g.answer).map(function (s) { return squares[s]; }).join('');
    }).join('\n');
    return 'Wood Type Wordle · ' + g.len + ' letters ' + n + '/' + g.rows + (g.hard ? '*' : '') + hints + '\n\n' + grid;
  }
  function showShareFallback(text) {
    var ta = $('share-fallback');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
    toast('Copy the text below to share', 2200);
  }
  $('btn-share').addEventListener('click', function () {
    var text = shareText(game);
    try {
      navigator.clipboard.writeText(text).then(
        function () { toast('Result copied to clipboard'); },
        function () { showShareFallback(text); }
      );
    } catch (e) { showShareFallback(text); }
  });
  $('btn-next-stats').addEventListener('click', nextWord);

  // ---------- settings ----------

  var optHard = $('opt-hard');
  var optContrast = $('opt-contrast');

  function applyContrast() {
    if (settings.contrast) root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');
  }
  function updateSettingsLock() {
    var locked = game.status === 'playing' && game.guesses.length > 0;
    optHard.checked = locked ? game.hard : settings.hard;
    optHard.disabled = locked;
    $('hard-note').hidden = !locked;
  }
  optHard.addEventListener('change', function () {
    settings.hard = optHard.checked;
    writeStore();
    updateSubtitle();
  });
  optContrast.addEventListener('change', function () {
    settings.contrast = optContrast.checked;
    applyContrast();
    writeStore();
  });

  // ---------- keyboard input ----------

  window.addEventListener('keydown', function (e) {
    if (openModalEl) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      else if (e.key === 'Tab') trapTab(e);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (e.key === 'Enter') {
      if (onButton) return; // let a focused toolbar button do its job
      e.preventDefault();
      handleKey('ENTER');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (onButton) document.activeElement.blur();
      handleKey('BACK');
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      if (onButton) document.activeElement.blur(); // typing means playing; Enter should submit next
      handleKey(e.key.toUpperCase());
    }
  });

  // ---------- start ----------

  function start(data) {
    data = data || {};
    if (data.games) {
      LENGTHS.forEach(function (len) {
        var g = restoreGame(len, data.games[len]);
        if (g) games[len] = g;
      });
    }
    game = games[LENGTHS.indexOf(data.len) >= 0 ? data.len : settings.length];
    if (typeof data.current === 'string' && game.status === 'playing') game.current = data.current.slice(0, game.len);

    optContrast.checked = settings.contrast;
    applyContrast();
    renderAll();
    writeStore(); // keep any freshly dealt words, so a reload shows the same ones

    // Greet every fresh page load; skip it when a live update restores a board.
    if (!data.games) later(openWelcome, 250);
  }

  // Keep the current boards across live page updates.
  var hot = window.claude && window.claude.hot;
  try {
    if (hot && typeof hot.snapshot === 'function') {
      hot.snapshot(function () { return { len: game.len, current: game.current, games: serializeGames() }; });
    }
  } catch (e) { /* not running inside a viewer */ }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
