/**
 * ELSA Speak Premium — Long Passage Speaking Engine & Page Controller (CEFR A1–C2)
 * Exposes `window.ElsaPassagesApp` (and `module.exports = { evaluatePassage, ... }` for Node testing).
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'elsa_passages_progress_v1';
  var CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  var CONTRACTION_MAP = {
    "i'm": ['i', 'am'], "i've": ['i', 'have'], "i'll": ['i', 'will'], "i'd": ['i', 'would'],
    "you're": ['you', 'are'], "you've": ['you', 'have'], "you'll": ['you', 'will'], "you'd": ['you', 'would'],
    "he's": ['he', 'is'], "he'll": ['he', 'will'], "he'd": ['he', 'would'],
    "she's": ['she', 'is'], "she'll": ['she', 'will'], "she'd": ['she', 'would'],
    "it's": ['it', 'is'], "it'll": ['it', 'will'],
    "we're": ['we', 'are'], "we've": ['we', 'have'], "we'll": ['we', 'will'], "we'd": ['we', 'would'],
    "they're": ['they', 'are'], "they've": ['they', 'have'], "they'll": ['they', 'will'], "they'd": ['they', 'would'],
    "that's": ['that', 'is'], "there's": ['there', 'is'], "here's": ['here', 'is'],
    "what's": ['what', 'is'], "who's": ['who', 'is'], "let's": ['let', 'us'],
    "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'],
    "isn't": ['is', 'not'], "aren't": ['are', 'not'], "wasn't": ['was', 'not'], "weren't": ['were', 'not'],
    "haven't": ['have', 'not'], "hasn't": ['has', 'not'], "hadn't": ['had', 'not'],
    "won't": ['will', 'not'], "wouldn't": ['would', 'not'], "can't": ['can', 'not'], "cannot": ['can', 'not'],
    "couldn't": ['could', 'not'], "shouldn't": ['should', 'not']
  };

  var HOMOPHONE_GROUPS = [
    ['to', 'too', 'two'], ['there', 'their', "they're"], ['your', "you're"],
    ['its', "it's"], ['right', 'write'], ['hear', 'here'], ['know', 'no'],
    ['new', 'knew'], ['wait', 'weight'], ['see', 'sea'], ['for', 'four'],
    ['one', 'won'], ['son', 'sun'], ['by', 'buy', 'bye'], ['meet', 'meat'],
    ['peace', 'piece'], ['wear', 'where'], ['weather', 'whether'], ['hour', 'our'],
    ['week', 'weak'], ['whole', 'hole'], ['ate', 'eight'], ['be', 'bee'],
    ['night', 'knight'], ['way', 'weigh'], ['would', 'wood'], ['passed', 'past'],
    ['read', 'red'], ['through', 'threw'], ['some', 'sum'], ['scene', 'seen']
  ];
  var HOMOPHONE_MAP = Object.create(null);
  HOMOPHONE_GROUPS.forEach(function (g, idx) {
    g.forEach(function (w) { HOMOPHONE_MAP[w] = idx; });
  });

  var NUMBER_MAP = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
    '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
    '18': 'eighteen', '19': 'nineteen', '20': 'twenty'
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanWord(str) {
    var s = String(str || '')
      .replace(/[\u2018\u2019\u201B\u0060]/g, "'")
      .toLowerCase()
      .trim()
      .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
    return NUMBER_MAP[s] || s;
  }

  function areHomophones(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var ia = HOMOPHONE_MAP[a];
    var ib = HOMOPHONE_MAP[b];
    return ia !== undefined && ia === ib;
  }

  function levenshtein(a, b) {
    var m = a.length;
    var n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var prev = new Uint16Array(n + 1);
    var curr = new Uint16Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      for (var k = 1; k <= n; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n];
  }

  function wordSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b || areHomophones(a, b)) return 100;
    var af = a.replace(/['-]/g, '');
    var bf = b.replace(/['-]/g, '');
    if (af === bf) return 98;
    var maxL = Math.max(af.length, bf.length);
    if (maxL === 0) return 0;
    var dist = levenshtein(af, bf);
    return Math.max(0, Math.round((1 - dist / maxL) * 100));
  }

  function matchesTwoWords(singleClean, w1, w2) {
    if (!singleClean || !w1 || !w2) return 0;
    var exp = CONTRACTION_MAP[singleClean];
    if (exp && exp[0] === w1 && exp[1] === w2) return 100;
    if (singleClean.indexOf('-') !== -1) {
      var parts = singleClean.split('-').filter(Boolean);
      if (parts.length === 2) {
        return Math.round((wordSimilarity(parts[0], w1) + wordSimilarity(parts[1], w2)) / 2);
      }
    }
    if (singleClean.replace(/['-]/g, '') === (w1 + w2).replace(/['-]/g, '')) return 98;
    return 0;
  }

  function tokenizeSpoken(text) {
    return String(text || '')
      .replace(/[\u2018\u2019\u201B\u0060]/g, "'")
      .replace(/[^\w\s'-]/g, ' ')
      .trim()
      .split(/\s+/)
      .map(cleanWord)
      .filter(Boolean);
  }

  /**
   * Parse passage paragraphs into structured sentences & word tokens.
   */
  function parsePassageStructure(passage) {
    var paras = Array.isArray(passage && passage.paragraphs) && passage.paragraphs.length > 0
      ? passage.paragraphs
      : [String((passage && passage.text) || '')];

    var allWords = [];
    var allSentences = [];
    var structuredParas = [];

    for (var pIdx = 0; pIdx < paras.length; pIdx++) {
      var pText = String(paras[pIdx] || '').trim();
      if (!pText) continue;
      // Split into sentences preserving punctuation
      var rawSents = pText.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [pText];
      var paraSents = [];

      for (var sIdx = 0; sIdx < rawSents.length; sIdx++) {
        var sText = rawSents[sIdx].trim();
        if (!sText) continue;
        var sentObj = {
          sentIndex: allSentences.length,
          paraIndex: pIdx,
          text: sText,
          wordStart: allWords.length,
          wordEnd: allWords.length
        };

        var rawTokens = sText.split(/\s+/).filter(Boolean);
        for (var t = 0; t < rawTokens.length; t++) {
          var raw = rawTokens[t];
          var core = raw.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '') || raw;
          allWords.push({
            index: allWords.length,
            paraIndex: pIdx,
            sentIndex: sentObj.sentIndex,
            text: raw,
            core: core,
            clean: cleanWord(core),
            score: 0,
            level: 'neutral',
            spoken: ''
          });
        }
        sentObj.wordEnd = allWords.length;
        allSentences.push(sentObj);
        paraSents.push(sentObj);
      }

      structuredParas.push({
        paraIndex: pIdx,
        sentences: paraSents
      });
    }

    return {
      paragraphs: structuredParas,
      sentences: allSentences,
      words: allWords
    };
  }

  /**
   * Fast banded DP alignment for long passages (250+ words in <10ms).
   */
  function alignPassageWords(targetWords, spokenWords) {
    var M = targetWords.length;
    var N = spokenWords.length;
    var result = new Array(M);
    for (var i = 0; i < M; i++) {
      result[i] = { spoken: '', score: 0 };
    }
    if (M === 0 || N === 0) return result;

    // Band width adapts to length difference while staying fast on 250+ word passages
    var band = Math.max(30, Math.abs(M - N) + 25);
    var NEG_INF = -1e9;

    // Sparse banded storage: each row r stores columns [jMin..jMax]
    var rows = new Array(M + 1);
    var bts = new Array(M + 1);
    var jMins = new Int32Array(M + 1);
    var jMaxs = new Int32Array(M + 1);

    for (var r = 0; r <= M; r++) {
      var center = Math.round((r / Math.max(1, M)) * N);
      var jMin = Math.max(0, center - band);
      var jMax = Math.min(N, center + band);
      jMins[r] = jMin;
      jMaxs[r] = jMax;
      var len = jMax - jMin + 1;
      rows[r] = new Float64Array(len);
      bts[r] = new Uint8Array(len);
      rows[r].fill(NEG_INF);
    }

    function getDp(r, c) {
      if (r < 0 || r > M || c < jMins[r] || c > jMaxs[r]) return NEG_INF;
      return rows[r][c - jMins[r]];
    }

    // Initialize row 0
    for (var c0 = jMins[0]; c0 <= jMaxs[0]; c0++) {
      rows[0][c0 - jMins[0]] = -4 * c0;
      bts[0][c0 - jMins[0]] = 3;
    }
    if (jMins[0] === 0) {
      rows[0][0] = 0;
      bts[0][0] = 0;
    }

    for (var r1 = 1; r1 <= M; r1++) {
      var tClean = targetWords[r1 - 1].clean;
      var cStart = jMins[r1];
      var cEnd = jMaxs[r1];
      for (var c1 = cStart; c1 <= cEnd; c1++) {
        var bestVal = getDp(r1 - 1, c1); // skip target word (op 2)
        var bestOp = 2;

        if (c1 > 0) {
          var skipSpoken = getDp(r1, c1 - 1) - 4; // skip spoken word (op 3)
          if (skipSpoken > bestVal) {
            bestVal = skipSpoken;
            bestOp = 3;
          }

          var sClean = spokenWords[c1 - 1];
          var sim11 = wordSimilarity(tClean, sClean);
          if (sim11 >= 35) {
            var m11 = getDp(r1 - 1, c1 - 1) + sim11;
            if (m11 > bestVal) {
              bestVal = m11;
              bestOp = 1;
            }
          }

          // 1 target : 2 spoken (contraction / hyphen)
          if (c1 >= 2) {
            var sim12 = matchesTwoWords(tClean, spokenWords[c1 - 2], sClean);
            if (sim12 >= 65) {
              var m12 = getDp(r1 - 1, c1 - 2) + sim12 + 5;
              if (m12 > bestVal) {
                bestVal = m12;
                bestOp = 4;
              }
            }
          }

          // 2 target : 1 spoken
          if (r1 >= 2) {
            var sim21 = matchesTwoWords(sClean, targetWords[r1 - 2].clean, tClean);
            if (sim21 >= 65) {
              var m21 = getDp(r1 - 2, c1 - 1) + sim21 * 2 + 5;
              if (m21 > bestVal) {
                bestVal = m21;
                bestOp = 5;
              }
            }
          }
        }

        rows[r1][c1 - cStart] = bestVal;
        bts[r1][c1 - cStart] = bestOp;
      }
    }

    // Backtrack from (M, N)
    var ti = M;
    var sj = Math.min(N, jMaxs[M]);
    while (ti > 0 && sj > 0) {
      if (sj < jMins[ti] || sj > jMaxs[ti]) break;
      var op = bts[ti][sj - jMins[ti]];
      if (op === 1) {
        var sc1 = wordSimilarity(targetWords[ti - 1].clean, spokenWords[sj - 1]);
        result[ti - 1] = { spoken: spokenWords[sj - 1], score: sc1 };
        ti--;
        sj--;
      } else if (op === 4) {
        var sc12 = matchesTwoWords(targetWords[ti - 1].clean, spokenWords[sj - 2], spokenWords[sj - 1]);
        result[ti - 1] = { spoken: spokenWords[sj - 2] + ' ' + spokenWords[sj - 1], score: sc12 };
        ti--;
        sj -= 2;
      } else if (op === 5) {
        var sc21 = matchesTwoWords(spokenWords[sj - 1], targetWords[ti - 2].clean, targetWords[ti - 1].clean);
        result[ti - 1] = { spoken: spokenWords[sj - 1], score: sc21 };
        result[ti - 2] = { spoken: spokenWords[sj - 1], score: sc21 };
        ti -= 2;
        sj--;
      } else if (op === 2) {
        ti--;
      } else {
        sj--;
      }
    }

    return result;
  }

  function scoreToLevel(score) {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warn';
    return 'bad';
  }

  function generateWordTip(wordObj) {
    var core = wordObj.core || wordObj.text || '';
    var lower = core.toLowerCase();
    if (wordObj.score >= 85) {
      return 'ออกเสียงคำว่า "' + core + '" ได้ชัดเจนมาก!';
    }
    if (!wordObj.spoken) {
      return 'ข้ามคำว่า "' + core + '" ไป — ลองชะลอจังหวะและออกเสียงคำนี้ให้ชัดเจน';
    }
    if (/ed$/.test(lower)) {
      return 'คำว่า "' + core + '": เน้นเสียงท้าย -ed (/t/, /d/ หรือ /ɪd/) ให้ได้ยินชัด';
    }
    if (/le$/.test(lower)) {
      return 'คำว่า "' + core + '": เสียงท้าย -le (/l/) แตะปลายลิ้นที่ปุ่มเหงือกหลังฟันบน';
    }
    if (/ing$/.test(lower)) {
      return 'คำว่า "' + core + '": เสียงท้าย -ing (/ŋ/) ให้ขึ้นจมูกเล็กน้อยโดยไม่กลืนเสียง';
    }
    if (lower.indexOf('th') !== -1) {
      return 'คำว่า "' + core + '": เสียง /θ/ หรือ /ð/ (th) แตะปลายลิ้นเบาๆ ระหว่างฟันบน-ล่าง';
    }
    if (lower.indexOf('r') !== -1) {
      return 'คำว่า "' + core + '": เสียง /r/ ม้วนปลายลิ้นขึ้นเล็กน้อยโดยไม่แตะเพดานปาก';
    }
    if (lower.indexOf('l') !== -1) {
      return 'คำว่า "' + core + '": เสียง /l/ แตะปลายลิ้นที่ปุ่มเหงือกด้านบนให้ชัด';
    }
    if (lower.indexOf('sh') !== -1 || lower.indexOf('ch') !== -1) {
      return 'คำว่า "' + core + '": เสียง /ʃ/ หรือ /tʃ/ ห่อริมฝีปากเล็กน้อยแล้วปล่อยลมชัด';
    }
    if (/[sz]$/.test(lower)) {
      return 'คำว่า "' + core + '": อย่าลืมออกเสียงท้าย -s / -z ให้ชัดเจน';
    }
    return 'คำว่า "' + core + '": ลองกดฟังเสียงตัวอย่างแล้วออกเสียงตามให้ชัด (ระบบได้ยินเป็น "' + wordObj.spoken + '")';
  }

  /**
   * ELSA Speech Analyzer 4-Metric Evaluation for Long Passages
   */
  function evaluatePassage(passage, spokenText, durationSec) {
    var parsed = parsePassageStructure(passage);
    var targetWords = parsed.words;
    var spokenWords = tokenizeSpoken(spokenText);
    var totalWords = targetWords.length;
    var spokenCount = spokenWords.length;
    var targetWpm = (passage && Number(passage.targetWpm)) || 120;

    if (totalWords === 0) {
      return {
        overall: 0, pronunciation: 0, fluency: 0, keyword: 0,
        wpm: 0, targetWpm: targetWpm, coverage: 0,
        status: 'incorrect', statusTitleTh: 'ไม่พบข้อความบทความ',
        subtitleTh: '', spokenCount: 0, totalWords: 0,
        words: [], paragraphs: parsed.paragraphs, sentences: parsed.sentences
      };
    }

    var aligned = alignPassageWords(targetWords, spokenWords);
    var weightedSum = 0;
    var totalWeight = 0;
    var matchedCount = 0;

    for (var i = 0; i < totalWords; i++) {
      var al = aligned[i];
      var w = targetWords[i];
      w.score = al.score;
      w.spoken = al.spoken;
      w.level = scoreToLevel(al.score);

      var weight = Math.max(2, w.clean.length);
      totalWeight += weight;
      weightedSum += w.score * weight;
      if (w.score >= 50) matchedCount++;
    }

    var pronunciation = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
    var coverage = matchedCount / totalWords;

    // WPM calculation (use realistic duration if spoken live; estimate cleanly for typing fallback when durationSec <= 0)
    var wpm = 0;
    if (spokenCount > 0) {
      if (typeof durationSec === 'number' && durationSec >= 3) {
        wpm = Math.round(spokenCount / Math.max(0.15, durationSec / 60));
      } else {
        wpm = Math.round(coverage * targetWpm);
      }
    }

    // Fluency = 70% completion coverage + 30% pace proximity to targetWpm
    var fluency = 0;
    if (spokenCount > 0) {
      var paceDiff = Math.abs(wpm - targetWpm);
      var paceScore = Math.max(0, 1 - paceDiff / Math.max(45, targetWpm * 0.65));
      fluency = Math.round((coverage * 0.70 + paceScore * 0.30) * 100);
    }

    // Keyword Mastery across `passage.vocab` (supports single words & multi-word phrases)
    var vocabList = Array.isArray(passage && passage.vocab) ? passage.vocab : [];
    var keywordScores = [];
    for (var v = 0; v < vocabList.length; v++) {
      var vWordRaw = String((vocabList[v] && vocabList[v].word) || '').trim();
      var vTokens = vWordRaw.split(/[\s-]+/).map(cleanWord).filter(Boolean);
      if (vTokens.length === 0) continue;

      // Find best matching span in `targetWords`
      var bestSpanScore = null;
      for (var ti = 0; ti <= totalWords - vTokens.length; ti++) {
        var matchesAll = true;
        var sumSpan = 0;
        for (var k = 0; k < vTokens.length; k++) {
          var twClean = targetWords[ti + k].clean.replace(/-/g, '');
          var vtClean = vTokens[k].replace(/-/g, '');
          if (twClean !== vtClean && twClean.indexOf(vtClean) !== 0 && vtClean.indexOf(twClean) !== 0) {
            matchesAll = false;
            break;
          }
          sumSpan += targetWords[ti + k].score;
        }
        if (matchesAll) {
          var avgSpan = sumSpan / vTokens.length;
          if (bestSpanScore === null || avgSpan > bestSpanScore) {
            bestSpanScore = avgSpan;
          }
        }
      }
      if (bestSpanScore !== null) {
        keywordScores.push(bestSpanScore);
      }
    }

    var keyword = keywordScores.length > 0
      ? Math.round(keywordScores.reduce(function (a, b) { return a + b; }, 0) / keywordScores.length)
      : pronunciation;

    var overall = Math.max(0, Math.min(100, Math.round(pronunciation * 0.55 + fluency * 0.25 + keyword * 0.20)));

    var status;
    var statusTitleTh;
    var subtitleTh;
    if (overall >= 80) {
      status = 'correct';
      statusTitleTh = 'ยอดเยี่ยม!';
      subtitleTh = 'คุณอ่านบทความนี้ได้ ' + overall + '% เหมือนเจ้าของภาษาเลย! (' + wpm + ' WPM)';
    } else if (overall >= 50) {
      status = 'almost';
      statusTitleTh = 'เกือบจะถูกต้องแล้ว';
      subtitleTh = 'ความแม่นยำรวม ' + overall + '% — แตะคำสีส้ม/สีแดงเพื่อฟังเสียงและฝึกเฉพาะคำ';
    } else {
      status = 'incorrect';
      statusTitleTh = 'ลองฝึกอีกครั้ง';
      subtitleTh = 'ความแม่นยำรวม ' + overall + '% — ลองฟังเสียงช้า 0.75x หรือสลับไปโหมดซ้อมทีละประโยค';
    }

    return {
      overall: overall,
      pronunciation: pronunciation,
      fluency: fluency,
      keyword: keyword,
      wpm: wpm,
      targetWpm: targetWpm,
      coverage: Math.round(coverage * 100),
      status: status,
      statusTitleTh: statusTitleTh,
      subtitleTh: subtitleTh,
      spokenCount: spokenCount,
      totalWords: totalWords,
      words: targetWords,
      paragraphs: parsed.paragraphs,
      sentences: parsed.sentences
    };
  }

  // =========================================================================
  // Browser Page Controller (runs only in DOM environment)
  // =========================================================================

  var state = {
    passages: [],
    progress: { scores: {}, bookmarks: [] },
    activeLevel: 'A1',
    activeFilter: 'all',
    searchQuery: '',
    currentPassage: null,
    currentStructure: null,
    lastEval: null,
    mode: 'full', // 'full' | 'drill'
    activeDrillSentIdx: 0,
    // Audio player
    passageAudio: null,
    passageAudioRate: 1.0,
    // Continuous Recording
    isReadingActive: false,
    recInstance: null,
    browserRecAlive: false,
    lastRecStopTime: 0,
    recSessionSeq: 0,
    restartTimer: null,
    committedTranscript: '',
    interimTranscript: '',
    readStartTime: 0,
    timerInterval: null,
    liveTrackerIndex: 0,
    // MediaRecorder & Shared AudioContext
    mediaRecorder: null,
    mediaStream: null,
    audioChunks: [],
    userAudioUrl: null,
    activeUserAudio: null,
    audioContext: null,
    sourceNode: null,
    analyserNode: null,
    waveformTimer: null
  };

  function $(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function loadProgress() {
    var def = { scores: {}, bookmarks: [] };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          def.scores = (parsed.scores && typeof parsed.scores === 'object') ? parsed.scores : {};
          def.bookmarks = Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
        }
      }
    } catch (e) { /* ignore */ }
    state.progress = def;
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (e) { /* ignore */ }
  }

  function recordPassageScore(passageId, evalRes) {
    var prev = state.progress.scores[passageId] || { best: 0, attempts: 0 };
    state.progress.scores[passageId] = {
      best: Math.max(prev.best || 0, evalRes.overall),
      last: evalRes.overall,
      pronunciation: evalRes.pronunciation,
      fluency: evalRes.fluency,
      keyword: evalRes.keyword,
      wpm: evalRes.wpm,
      attempts: (prev.attempts || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    saveProgress();
    updateMasteryPill();
  }

  function isBookmarked(id) {
    return state.progress.bookmarks.indexOf(id) !== -1;
  }

  function toggleBookmark(id) {
    var idx = state.progress.bookmarks.indexOf(id);
    if (idx === -1) state.progress.bookmarks.push(id);
    else state.progress.bookmarks.splice(idx, 1);
    saveProgress();
    syncBookmarkBtn();
  }

  function updateMasteryPill() {
    var pill = $('psgMasteryPill');
    if (!pill) return;
    var passed = 0;
    var keys = Object.keys(state.progress.scores);
    for (var i = 0; i < keys.length; i++) {
      if ((state.progress.scores[keys[i]].best || 0) >= 70) passed++;
    }
    pill.textContent = 'ผ่านแล้ว ' + passed + '/' + (state.passages.length || 120);
  }

  function renderCefrTabs() {
    var container = $('psgCefrTabs');
    if (!container) return;
    container.innerHTML = CEFR_LEVELS.map(function (lv) {
      var list = state.passages.filter(function (p) { return p.level === lv; });
      var doneCount = list.filter(function (p) {
        var sc = state.progress.scores[p.id];
        return sc && sc.best >= 70;
      }).length;
      var activeCls = state.activeLevel === lv ? ' active' : '';
      return '<button type="button" class="psg-cefr-tab' + activeCls + '" data-level="' + lv + '">' +
        '<span class="psg-cefr-code">' + lv + '</span>' +
        '<span class="psg-cefr-count">' + doneCount + '/' + list.length + '</span>' +
        '</button>';
    }).join('');
  }

  function renderLibraryGrid() {
    var grid = $('psgGrid');
    if (!grid) return;
    var q = state.searchQuery.trim().toLowerCase();

    var filtered = state.passages.filter(function (p) {
      if (state.activeLevel && p.level !== state.activeLevel) return false;
      if (state.activeFilter === 'bookmarked' && !isBookmarked(p.id)) return false;
      if (state.activeFilter === 'unpracticed' && state.progress.scores[p.id]) return false;
      if (q) {
        var hay = (p.id + ' ' + p.title + ' ' + p.titleTh + ' ' + p.topic + ' ' + p.text).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="psg-empty-state">ไม่พบบทความที่ตรงกับเงื่อนไข — ลองเปลี่ยนตัวกรองหรือระดับ CEFR</div>';
      return;
    }

    grid.innerHTML = filtered.map(function (p) {
      var sc = state.progress.scores[p.id];
      var bestBadge = '';
      if (sc && typeof sc.best === 'number') {
        var lv = scoreToLevel(sc.best);
        bestBadge = '<span class="psg-best-pill level-' + lv + '">🏆 ' + sc.best + '%</span>';
      }
      var bmIcon = isBookmarked(p.id) ? '<span class="psg-bm-star">★</span>' : '';
      var estSec = Math.max(15, Math.round(((p.wordCount || 60) / (p.targetWpm || 115)) * 60));
      return '<button type="button" class="psg-card-item" data-id="' + escapeHtml(p.id) + '">' +
        '<div class="psg-card-top">' +
          '<span class="psg-level-pill" data-level="' + escapeHtml(p.level) + '">' + escapeHtml(p.level) + ' · #' + p.num + '</span>' +
          '<div class="psg-card-badges">' + bmIcon + bestBadge + '</div>' +
        '</div>' +
        '<div class="psg-card-title">' + escapeHtml(p.title) + '</div>' +
        '<div class="psg-card-title-th">' + escapeHtml(p.titleTh) + '</div>' +
        '<div class="psg-card-meta">' +
          '<span class="psg-topic-tag">' + escapeHtml(p.topic) + '</span>' +
          '<span class="psg-meta-stats">' + (p.wordCount || 0) + ' คำ · ~' + estSec + 'วิ</span>' +
        '</div>' +
      '</button>';
    }).join('');
  }

  // =========================================================================
  // Studio View & Passage Audio Player
  // =========================================================================

  function stopPassageAudio() {
    if (state.passageAudio) {
      try {
        state.passageAudio.pause();
        state.passageAudio.currentTime = 0;
      } catch (e) { /* ignore */ }
      state.passageAudio = null;
    }
    if (window.ElsaShadowingEngine && window.ElsaShadowingEngine.stopSpeaking) {
      window.ElsaShadowingEngine.stopSpeaking();
    }
    var bNorm = $('psgBtnAudioNormal');
    var bSlow = $('psgBtnAudioSlow');
    if (bNorm) bNorm.classList.remove('playing');
    if (bSlow) bSlow.classList.remove('playing');
    var prog = $('psgAudioProgress');
    if (prog) prog.value = 0;
  }

  function formatMmSs(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function playPassageAudio(rate) {
    if (!state.currentPassage) return;
    var btn = rate < 0.9 ? $('psgBtnAudioSlow') : $('psgBtnAudioNormal');
    var otherBtn = rate < 0.9 ? $('psgBtnAudioNormal') : $('psgBtnAudioSlow');

    // Toggle-stop if already playing at this speed
    if (btn && btn.classList.contains('playing')) {
      stopPassageAudio();
      return;
    }

    stopRecording(true);
    stopUserAudio();
    stopPassageAudio();

    if (btn) btn.classList.add('playing');
    if (otherBtn) otherBtn.classList.remove('playing');

    var p = state.currentPassage;
    var mp3Url = './audio_passages/' + p.id + '.mp3';
    var audio = new Audio(mp3Url);
    state.passageAudio = audio;
    state.passageAudioRate = rate;
    audio.playbackRate = rate;
    if ('preservesPitch' in audio) audio.preservesPitch = true;
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;

    var prog = $('psgAudioProgress');
    var timeEl = $('psgAudioTime');

    audio.ontimeupdate = function () {
      if (state.passageAudio !== audio) return;
      if (audio.duration && isFinite(audio.duration)) {
        if (prog) prog.value = Math.round((audio.currentTime / audio.duration) * 100);
        if (timeEl) timeEl.textContent = formatMmSs(audio.currentTime) + ' / ' + formatMmSs(audio.duration);
      }
    };

    audio.onended = function () {
      if (state.passageAudio !== audio) return;
      stopPassageAudio();
    };

    var fellBack = false;
    function fallbackToTts() {
      if (fellBack || state.passageAudio !== audio) return;
      fellBack = true;
      state.passageAudio = null;
      if (window.ElsaShadowingEngine && window.ElsaShadowingEngine.speakNatural) {
        window.ElsaShadowingEngine.speakNatural(p.text, {
          lang: 'en-US',
          rate: rate,
          onEnd: function () {
            if (btn) btn.classList.remove('playing');
          }
        });
      } else if (btn) {
        btn.classList.remove('playing');
      }
    }

    audio.onerror = fallbackToTts;
    var playProm = audio.play();
    if (playProm && typeof playProm.catch === 'function') {
      playProm.catch(fallbackToTts);
    }
  }

  function stopUserAudio() {
    if (state.activeUserAudio) {
      try {
        state.activeUserAudio.pause();
        state.activeUserAudio.currentTime = 0;
      } catch (e) { /* ignore */ }
      state.activeUserAudio = null;
    }
    var btn = $('psgBtnPlayUser');
    if (btn) btn.classList.remove('playing');
  }

  function playUserAudio() {
    var btn = $('psgBtnPlayUser');
    if (btn && btn.classList.contains('playing')) {
      stopUserAudio();
      return;
    }
    if (!state.userAudioUrl) return;
    stopPassageAudio();
    stopUserAudio();

    var audio = new Audio(state.userAudioUrl);
    state.activeUserAudio = audio;
    if (btn) btn.classList.add('playing');
    audio.onended = stopUserAudio;
    audio.onerror = stopUserAudio;
    var p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(stopUserAudio);
  }

  function syncBookmarkBtn() {
    var btn = $('psgBtnBookmark');
    if (!btn || !state.currentPassage) return;
    var bm = isBookmarked(state.currentPassage.id);
    btn.classList.toggle('bookmarked', bm);
    btn.setAttribute('aria-pressed', bm ? 'true' : 'false');
    btn.textContent = bm ? '★' : '☆';
  }

  function renderReadingText(evalRes) {
    var container = $('psgParagraphs');
    if (!container || !state.currentStructure) return;
    var struct = state.currentStructure;
    var words = evalRes ? evalRes.words : struct.words;

    container.innerHTML = struct.paragraphs.map(function (para) {
      var sentsHtml = para.sentences.map(function (sent) {
        var drillCls = (state.mode === 'drill' && state.activeDrillSentIdx === sent.sentIndex) ? ' drill-active' : '';
        var wordsHtml = [];
        for (var wi = sent.wordStart; wi < sent.wordEnd; wi++) {
          var w = words[wi];
          var cls = 'psg-w';
          if (evalRes) {
            cls += ' level-' + (w.level || 'neutral');
          }
          wordsHtml.push('<span class="' + cls + '" data-widx="' + wi + '">' + escapeHtml(w.text) + '</span>');
        }
        return '<span class="psg-sentence-block' + drillCls + '" data-sidx="' + sent.sentIndex + '">' + wordsHtml.join(' ') + '</span>';
      }).join(' ');
      return '<p class="psg-para">' + sentsHtml + '</p>';
    }).join('');
  }

  function renderVocabStrip(passage) {
    var strip = $('psgVocabStrip');
    if (!strip) return;
    var vocab = Array.isArray(passage && passage.vocab) ? passage.vocab : [];
    if (vocab.length === 0) {
      strip.innerHTML = '';
      return;
    }
    strip.innerHTML = vocab.map(function (v) {
      return '<button type="button" class="psg-vocab-pill" data-word="' + escapeHtml(v.word) + '">' +
        '<strong>' + escapeHtml(v.word) + '</strong>' +
        (v.ipa ? ' <span class="psg-vocab-ipa">' + escapeHtml(v.ipa) + '</span>' : '') +
        (v.th ? ' <span class="psg-vocab-th">· ' + escapeHtml(v.th) + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function renderAnalyzer(evalRes) {
    var box = $('psgAnalyzer');
    if (!box) return;
    if (!evalRes) {
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.classList.remove('status-correct', 'status-almost', 'status-incorrect');
    box.classList.add('status-' + evalRes.status);

    var ring = $('psgOverallRingProgress');
    if (ring) {
      var r = 36;
      var circ = 2 * Math.PI * r;
      ring.style.strokeDasharray = circ.toFixed(1);
      ring.style.strokeDashoffset = (circ * (1 - evalRes.overall / 100)).toFixed(1);
    }
    var scoreTxt = $('psgOverallScoreText');
    if (scoreTxt) scoreTxt.textContent = evalRes.overall + '%';

    var titleEl = $('psgAnalyzerTitle');
    var subEl = $('psgAnalyzerSubtitle');
    if (titleEl) titleEl.textContent = evalRes.statusTitleTh;
    if (subEl) subEl.textContent = evalRes.subtitleTh;

    var pronVal = $('psgPronVal');
    var pronBar = $('psgPronBar');
    if (pronVal) pronVal.textContent = evalRes.pronunciation + '%';
    if (pronBar) pronBar.style.width = evalRes.pronunciation + '%';

    var fluVal = $('psgFluencyVal');
    var fluBar = $('psgFluencyBar');
    var wpmEl = $('psgWpmReadout');
    if (fluVal) fluVal.textContent = evalRes.fluency + '%';
    if (fluBar) fluBar.style.width = evalRes.fluency + '%';
    if (wpmEl) wpmEl.textContent = evalRes.wpm + ' WPM · เป้าหมาย ' + evalRes.targetWpm + ' WPM';

    var kwVal = $('psgKeywordVal');
    var kwBar = $('psgKeywordBar');
    if (kwVal) kwVal.textContent = evalRes.keyword + '%';
    if (kwBar) kwBar.style.width = evalRes.keyword + '%';
  }

  function closeWordPopover() {
    var pop = $('psgWordPopover');
    if (pop) pop.classList.add('hidden');
  }

  function openWordPopover(wordIdx) {
    if (!state.lastEval || !state.lastEval.words[wordIdx]) return;
    var w = state.lastEval.words[wordIdx];
    var pop = $('psgWordPopover');
    if (!pop) return;

    var ipa = '';
    var vocab = (state.currentPassage && state.currentPassage.vocab) || [];
    for (var i = 0; i < vocab.length; i++) {
      if (cleanWord(vocab[i].word) === w.clean) {
        ipa = vocab[i].ipa || '';
        break;
      }
    }

    var wEl = $('psgPopoverWord');
    var iEl = $('psgPopoverIpa');
    var sEl = $('psgPopoverSpoken');
    var tEl = $('psgPopoverTip');
    var spkBtn = $('psgPopoverSpeak');

    if (wEl) wEl.textContent = w.core || w.text;
    if (iEl) {
      iEl.textContent = ipa;
      iEl.classList.toggle('hidden', !ipa);
    }
    if (sEl) {
      sEl.textContent = w.spoken
        ? ('ระบบได้ยินว่า: "' + w.spoken + '" (' + w.score + '%)')
        : 'ระบบไม่ได้ยินคำนี้ (0%)';
    }
    if (tEl) tEl.textContent = generateWordTip(w);
    if (spkBtn) spkBtn.setAttribute('data-word', w.core || w.text);

    pop.classList.remove('hidden');
  }

  function openStudio(passageId) {
    var passage = state.passages.find(function (p) { return p.id === passageId; });
    if (!passage) return;

    stopRecording(true);
    stopPassageAudio();
    stopUserAudio();
    closeWordPopover();

    state.currentPassage = passage;
    state.currentStructure = parsePassageStructure(passage);
    state.lastEval = null;
    state.activeDrillSentIdx = 0;
    state.liveTrackerIndex = 0;
    if (state.userAudioUrl) {
      try { URL.revokeObjectURL(state.userAudioUrl); } catch (e) { /* ignore */ }
      state.userAudioUrl = null;
    }

    var lib = $('psgLibraryView');
    var studio = $('psgStudioView');
    if (lib) lib.classList.add('hidden');
    if (studio) studio.classList.remove('hidden');

    var badge = $('psgStudioLevelBadge');
    if (badge) {
      badge.textContent = passage.level + ' · #' + passage.num;
      badge.setAttribute('data-level', passage.level);
    }
    var tEn = $('psgStudioTitle');
    var tTh = $('psgStudioTitleTh');
    if (tEn) tEn.textContent = passage.title;
    if (tTh) tTh.textContent = passage.titleTh;

    var thPanel = $('psgThPanel');
    if (thPanel) {
      thPanel.textContent = passage.th || '';
      thPanel.classList.add('hidden');
    }
    var thBtn = $('psgBtnToggleTh');
    if (thBtn) thBtn.classList.remove('active');

    var playUserBtn = $('psgBtnPlayUser');
    if (playUserBtn) playUserBtn.classList.add('hidden');

    var footer = $('psgFooterBtns');
    if (footer) footer.classList.add('hidden');

    var interimEl = $('psgInterim');
    if (interimEl) {
      interimEl.textContent = '';
      interimEl.classList.remove('is-error');
    }
    var timerEl = $('psgTimer');
    if (timerEl) timerEl.textContent = '00:00';

    var micHint = $('psgMicHint');
    if (micHint) micHint.textContent = state.mode === 'drill' ? 'แตะเพื่อซ้อมประโยคที่เลือก' : 'แตะเพื่อเริ่มอ่านทั้งบทความ';

    syncBookmarkBtn();
    renderAnalyzer(null);
    renderReadingText(null);
    renderVocabStrip(passage);
    updateModeUI();

    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function backToLibrary() {
    stopRecording(true);
    stopPassageAudio();
    stopUserAudio();
    closeWordPopover();

    var lib = $('psgLibraryView');
    var studio = $('psgStudioView');
    if (studio) studio.classList.add('hidden');
    if (lib) lib.classList.remove('hidden');
    renderCefrTabs();
    renderLibraryGrid();
  }

  function updateModeUI() {
    var bFull = $('psgModeFull');
    var bDrill = $('psgModeDrill');
    var banner = $('psgDrillBanner');
    if (bFull) bFull.classList.toggle('active', state.mode === 'full');
    if (bDrill) bDrill.classList.toggle('active', state.mode === 'drill');
    if (banner) banner.classList.toggle('hidden', state.mode !== 'drill');
    var micHint = $('psgMicHint');
    if (micHint && !state.isReadingActive) {
      micHint.textContent = state.mode === 'drill'
        ? 'แตะเพื่อซ้อมประโยคที่เลือก'
        : 'แตะเพื่อเริ่มอ่านทั้งบทความ';
    }
    renderReadingText(state.lastEval);
  }

  // =========================================================================
  // Continuous Speech Recognition + Shared AudioContext Waveform + MediaRecorder
  // =========================================================================

  function stopWaveform() {
    if (state.waveformTimer) {
      clearInterval(state.waveformTimer);
      state.waveformTimer = null;
    }
    if (state.sourceNode) {
      try { state.sourceNode.disconnect(); } catch (e) { /* ignore */ }
      state.sourceNode = null;
    }
    if (state.analyserNode) {
      try { state.analyserNode.disconnect(); } catch (e) { /* ignore */ }
      state.analyserNode = null;
    }
    var wf = $('psgWaveform');
    if (wf) {
      wf.classList.add('hidden');
      var bars = wf.querySelectorAll('.psg-wave-bar');
      for (var i = 0; i < bars.length; i++) bars[i].style.height = '4px';
    }
  }

  function startWaveform(stream, mySeq) {
    stopWaveform();
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (!state.audioContext || state.audioContext.state === 'closed') {
        state.audioContext = new AudioCtx();
      }
      if (state.audioContext.state === 'suspended' && state.audioContext.resume) {
        state.audioContext.resume().catch(function () {});
      }
      var src = state.audioContext.createMediaStreamSource(stream);
      var analyser = state.audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      src.connect(analyser);

      state.sourceNode = src;
      state.analyserNode = analyser;

      var wf = $('psgWaveform');
      if (wf) wf.classList.remove('hidden');
      var bars = wf ? wf.querySelectorAll('.psg-wave-bar') : [];
      var freqData = new Uint8Array(analyser.frequencyBinCount);

      state.waveformTimer = setInterval(function () {
        if (!state.isReadingActive || mySeq !== state.recSessionSeq || !state.analyserNode) {
          stopWaveform();
          return;
        }
        analyser.getByteFrequencyData(freqData);
        var step = Math.max(1, Math.floor(freqData.length / 16));
        for (var b = 0; b < bars.length && b < 16; b++) {
          var sum = 0;
          for (var s = 0; s < step; s++) {
            sum += freqData[Math.min(freqData.length - 1, b * step + s)] || 0;
          }
          var pct = Math.min(100, Math.round((sum / step / 255) * 100));
          bars[b].style.height = Math.max(4, Math.round(4 + (pct / 100) * 22)) + 'px';
        }
      }, 60);
    } catch (e) {
      stopWaveform();
    }
  }

  function startMediaCapture(mySeq) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        if (!state.isReadingActive || mySeq !== state.recSessionSeq) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        state.mediaStream = stream;
        state.audioChunks = [];
        var mr = new MediaRecorder(stream);
        state.mediaRecorder = mr;
        mr.ondataavailable = function (ev) {
          if (ev.data && ev.data.size > 0) state.audioChunks.push(ev.data);
        };
        mr.onstop = function () {
          stopWaveform();
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          if (state.mediaStream === stream) state.mediaStream = null;
          if (state.mediaRecorder === mr) state.mediaRecorder = null;
          if (mySeq === state.recSessionSeq && state.audioChunks.length > 0) {
            var blob = new Blob(state.audioChunks, { type: mr.mimeType || 'audio/webm' });
            if (state.userAudioUrl) {
              try { URL.revokeObjectURL(state.userAudioUrl); } catch (e) {}
            }
            state.userAudioUrl = URL.createObjectURL(blob);
            var btn = $('psgBtnPlayUser');
            if (btn) btn.classList.remove('hidden');
          }
          state.audioChunks = [];
        };
        mr.start();
        startWaveform(stream, mySeq);
      })
      .catch(function () { /* non-blocking */ });
  }

  function stopMediaCapture(immediateTracks) {
    stopWaveform();
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      try { state.mediaRecorder.stop(); } catch (e) {}
    }
    if (immediateTracks && state.mediaStream) {
      try { state.mediaStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      state.mediaStream = null;
    }
  }

  function updateLiveWordTracker(fullTranscript) {
    if (state.mode !== 'full' || !state.currentStructure) return;
    var spoken = tokenizeSpoken(fullTranscript);
    if (spoken.length === 0) return;

    var words = state.currentStructure.words;
    var ptr = state.liveTrackerIndex;
    var recent = spoken.slice(-4);

    for (var r = 0; r < recent.length; r++) {
      var sw = recent[r];
      var lookEnd = Math.min(words.length, ptr + 10);
      for (var k = ptr; k < lookEnd; k++) {
        if (wordSimilarity(words[k].clean, sw) >= 75) {
          ptr = k + 1;
          break;
        }
      }
    }

    if (ptr > state.liveTrackerIndex) {
      state.liveTrackerIndex = ptr;
      var spans = document.querySelectorAll('#psgParagraphs .psg-w');
      for (var i = 0; i < spans.length; i++) {
        spans[i].classList.toggle('is-spoken', i < ptr);
        spans[i].classList.toggle('is-current', i === ptr);
      }
    }
  }

  function spawnRecognitionSegment(mySeq) {
    if (!state.isReadingActive || mySeq !== state.recSessionSeq) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    var rec = new SR();
    state.recInstance = rec;
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    var segmentCommitted = '';

    rec.onstart = function () {
      if (mySeq !== state.recSessionSeq) return;
      state.browserRecAlive = true;
    };

    rec.onresult = function (event) {
      if (mySeq !== state.recSessionSeq || !event || !event.results) return;
      var segFinal = '';
      var segInterim = '';
      for (var i = 0; i < event.results.length; i++) {
        var r = event.results[i];
        var t = (r[0] && r[0].transcript) ? r[0].transcript.trim() : '';
        if (!t) continue;
        if (r.isFinal) segFinal = segFinal ? (segFinal + ' ' + t) : t;
        else segInterim = segInterim ? (segInterim + ' ' + t) : t;
      }
      segmentCommitted = segFinal;
      state.interimTranscript = segInterim;

      var combined = [state.committedTranscript, segmentCommitted, state.interimTranscript]
        .filter(Boolean).join(' ').trim();

      var interimEl = $('psgInterim');
      if (interimEl && combined) {
        interimEl.classList.remove('is-error');
        interimEl.textContent = '“' + (combined.length > 90 ? '…' + combined.slice(-90) : combined) + '”';
      }
      updateLiveWordTracker(combined);
    };

    rec.onerror = function (event) {
      if (mySeq !== state.recSessionSeq) return;
      var code = (event && event.error) || '';
      if (code === 'aborted' || code === 'no-speech') return;
      var interimEl = $('psgInterim');
      if (interimEl) {
        interimEl.classList.add('is-error');
        interimEl.textContent = code === 'not-allowed'
          ? '⚠️ กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์'
          : '⚠️ ข้อผิดพลาดไมโครโฟน: ' + code;
      }
    };

    rec.onend = function () {
      if (state.recInstance === rec) {
        state.recInstance = null;
        state.browserRecAlive = false;
        state.lastRecStopTime = Date.now();
      }
      if (mySeq !== state.recSessionSeq) return;

      // Commit whatever this segment captured
      var piece = segmentCommitted || state.interimTranscript;
      if (piece) {
        state.committedTranscript = state.committedTranscript
          ? (state.committedTranscript + ' ' + piece)
          : piece;
        state.interimTranscript = '';
      }

      // Auto-restart seamlessly if user is still reading (prevents Chrome 60s timeout cutoff!)
      if (state.isReadingActive) {
        state.restartTimer = setTimeout(function () {
          state.restartTimer = null;
          spawnRecognitionSegment(mySeq);
        }, 120);
      } else {
        finalizeRecordingEvaluation();
      }
    };

    try {
      state.browserRecAlive = true;
      rec.start();
    } catch (e) {
      state.browserRecAlive = false;
    }
  }

  function startRecording() {
    if (!state.currentPassage) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      var interimEl = $('psgInterim');
      if (interimEl) {
        interimEl.classList.add('is-error');
        interimEl.textContent = '⚠️ เบราว์เซอร์นี้ไม่รองรับการรับเสียง — ใช้ปุ่ม ⌨️ พิมพ์ทดสอบได้ทันที';
      }
      var fb = $('psgFallbackBar');
      if (fb) fb.classList.remove('hidden');
      return;
    }

    stopPassageAudio();
    stopUserAudio();
    closeWordPopover();

    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }
    if (state.recInstance && state.browserRecAlive) {
      try { state.recInstance.abort(); } catch (e) {}
      state.recInstance = null;
      state.browserRecAlive = false;
      state.lastRecStopTime = Date.now();
    }
    stopMediaCapture(true);

    var mySeq = ++state.recSessionSeq;
    state.isReadingActive = true;
    state.committedTranscript = '';
    state.interimTranscript = '';
    state.liveTrackerIndex = 0;
    state.readStartTime = Date.now();
    state.lastEval = null;

    renderAnalyzer(null);
    renderReadingText(null);

    var micBtn = $('psgMicBtn');
    var micHint = $('psgMicHint');
    var footer = $('psgFooterBtns');
    var interimEl = $('psgInterim');
    if (micBtn) micBtn.classList.add('recording');
    if (micHint) micHint.textContent = 'กำลังอัดเสียง... แตะอีกครั้งเพื่อหยุดและตรวจคะแนน';
    if (footer) footer.classList.add('hidden');
    if (interimEl) {
      interimEl.classList.remove('is-error');
      interimEl.textContent = 'กำลังฟัง... อ่านออกเสียงได้เลย';
    }

    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(function () {
      var timerEl = $('psgTimer');
      if (timerEl) timerEl.textContent = formatMmSs((Date.now() - state.readStartTime) / 1000);
    }, 500);

    var sinceStop = state.lastRecStopTime ? (Date.now() - state.lastRecStopTime) : 9999;
    if (sinceStop < 120) {
      state.restartTimer = setTimeout(function () {
        state.restartTimer = null;
        spawnRecognitionSegment(mySeq);
        startMediaCapture(mySeq);
      }, 120);
    } else {
      spawnRecognitionSegment(mySeq);
      startMediaCapture(mySeq);
    }
  }

  function stopRecording(silentCancel) {
    var wasActive = state.isReadingActive;
    state.isReadingActive = false;
    if (state.restartTimer) {
      clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }

    var micBtn = $('psgMicBtn');
    var micHint = $('psgMicHint');
    if (micBtn) micBtn.classList.remove('recording');
    if (micHint) {
      micHint.textContent = state.mode === 'drill'
        ? 'แตะเพื่อซ้อมประโยคที่เลือก'
        : 'แตะเพื่อเริ่มอ่านทั้งบทความ';
    }

    if (silentCancel) {
      state.recSessionSeq++;
      if (state.recInstance) {
        try { state.recInstance.abort(); } catch (e) {}
        state.recInstance = null;
        state.browserRecAlive = false;
        state.lastRecStopTime = Date.now();
      }
      stopMediaCapture(true);
      return;
    }

    stopMediaCapture(false);
    if (state.recInstance && state.browserRecAlive) {
      state.lastRecStopTime = Date.now();
      try { state.recInstance.stop(); } catch (e) {
        if (wasActive) finalizeRecordingEvaluation();
      }
    } else if (wasActive) {
      finalizeRecordingEvaluation();
    }
  }

  function finalizeRecordingEvaluation() {
    var transcript = [state.committedTranscript, state.interimTranscript].filter(Boolean).join(' ').trim();
    var durationSec = state.readStartTime ? ((Date.now() - state.readStartTime) / 1000) : 0;
    if (!transcript) {
      var interimEl = $('psgInterim');
      if (interimEl) {
        interimEl.classList.add('is-error');
        interimEl.textContent = '⚠️ ไม่ได้ยินเสียงพูด ลองกดไมค์แล้วอ่านใหม่อีกครั้ง หรือใช้ปุ่ม ⌨️';
      }
      return;
    }
    runEvaluation(transcript, durationSec);
  }

  function runEvaluation(spokenText, durationSec) {
    if (!state.currentPassage || !state.currentStructure) return;

    if (state.mode === 'drill') {
      var sent = state.currentStructure.sentences[state.activeDrillSentIdx];
      if (!sent) return;
      var engine = window.ElsaShadowingEngine;
      var drillRes = engine && engine.evaluateSpeech
        ? engine.evaluateSpeech({ en: sent.text, ipa: '', key: [] }, spokenText, 'advanced', [], 'en')
        : null;
      if (drillRes) {
        var interimEl = $('psgInterim');
        if (interimEl) {
          interimEl.classList.remove('is-error');
          interimEl.textContent = '🎯 ประโยคที่ ' + (sent.sentIndex + 1) + ': ' + drillRes.score + '% — ' + drillRes.tip;
        }
        // Color just this sentence's words in the reading card
        for (var i = 0; i < drillRes.words.length; i++) {
          var wIdx = sent.wordStart + i;
          var el = document.querySelector('#psgParagraphs .psg-w[data-widx="' + wIdx + '"]');
          if (el) {
            el.classList.remove('level-good', 'level-warn', 'level-bad', 'level-neutral');
            el.classList.add('level-' + (drillRes.words[i].level || 'neutral'));
          }
        }
      }
      return;
    }

    var evalRes = evaluatePassage(state.currentPassage, spokenText, durationSec);
    state.lastEval = evalRes;
    recordPassageScore(state.currentPassage.id, evalRes);
    renderAnalyzer(evalRes);
    renderReadingText(evalRes);

    var footer = $('psgFooterBtns');
    if (footer) footer.classList.remove('hidden');
    var interimEl2 = $('psgInterim');
    if (interimEl2) {
      interimEl2.classList.remove('is-error');
      interimEl2.textContent = 'อ่านได้ ' + evalRes.spokenCount + '/' + evalRes.totalWords + ' คำ · ความเร็ว ' + evalRes.wpm + ' WPM';
    }
  }

  function goNextPassage() {
    if (!state.currentPassage || state.passages.length === 0) return;
    var idx = state.passages.findIndex(function (p) { return p.id === state.currentPassage.id; });
    var next = state.passages[(idx + 1) % state.passages.length];
    if (next) openStudio(next.id);
  }

  function bindEvents() {
    var cefrTabs = $('psgCefrTabs');
    if (cefrTabs) {
      cefrTabs.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.psg-cefr-tab');
        if (!btn) return;
        state.activeLevel = btn.getAttribute('data-level') || 'A1';
        renderCefrTabs();
        renderLibraryGrid();
      });
    }

    var filters = $('psgFilterChips');
    if (filters) {
      filters.addEventListener('click', function (ev) {
        var btn = ev.target.closest('[data-filter]');
        if (!btn) return;
        state.activeFilter = btn.getAttribute('data-filter') || 'all';
        var allBtns = filters.querySelectorAll('[data-filter]');
        for (var i = 0; i < allBtns.length; i++) {
          allBtns[i].classList.toggle('active', allBtns[i] === btn);
        }
        renderLibraryGrid();
      });
    }

    var search = $('psgSearchInput');
    if (search) {
      search.addEventListener('input', function () {
        state.searchQuery = search.value || '';
        renderLibraryGrid();
      });
    }

    var grid = $('psgGrid');
    if (grid) {
      grid.addEventListener('click', function (ev) {
        var card = ev.target.closest('.psg-card-item');
        if (!card) return;
        var id = card.getAttribute('data-id');
        if (id) openStudio(id);
      });
    }

    var backBtn = $('psgBtnBackToLib');
    if (backBtn) backBtn.addEventListener('click', backToLibrary);

    var bmBtn = $('psgBtnBookmark');
    if (bmBtn) {
      bmBtn.addEventListener('click', function () {
        if (state.currentPassage) toggleBookmark(state.currentPassage.id);
      });
    }

    var mFull = $('psgModeFull');
    var mDrill = $('psgModeDrill');
    if (mFull) mFull.addEventListener('click', function () { state.mode = 'full'; updateModeUI(); });
    if (mDrill) mDrill.addEventListener('click', function () { state.mode = 'drill'; updateModeUI(); });

    var bNorm = $('psgBtnAudioNormal');
    var bSlow = $('psgBtnAudioSlow');
    if (bNorm) bNorm.addEventListener('click', function () { playPassageAudio(1.0); });
    if (bSlow) bSlow.addEventListener('click', function () { playPassageAudio(0.75); });

    var prog = $('psgAudioProgress');
    if (prog) {
      prog.addEventListener('input', function () {
        if (state.passageAudio && state.passageAudio.duration && isFinite(state.passageAudio.duration)) {
          state.passageAudio.currentTime = (Number(prog.value) / 100) * state.passageAudio.duration;
        }
      });
    }

    var bUser = $('psgBtnPlayUser');
    if (bUser) bUser.addEventListener('click', playUserAudio);

    var bTh = $('psgBtnToggleTh');
    if (bTh) {
      bTh.addEventListener('click', function () {
        var panel = $('psgThPanel');
        if (!panel) return;
        var willShow = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willShow);
        bTh.classList.toggle('active', willShow);
      });
    }

    var paraBox = $('psgParagraphs');
    if (paraBox) {
      paraBox.addEventListener('click', function (ev) {
        if (state.mode === 'drill') {
          var sentEl = ev.target.closest('.psg-sentence-block');
          if (sentEl) {
            state.activeDrillSentIdx = parseInt(sentEl.getAttribute('data-sidx'), 10) || 0;
            renderReadingText(state.lastEval);
            var sentObj = state.currentStructure && state.currentStructure.sentences[state.activeDrillSentIdx];
            if (sentObj && window.ElsaShadowingEngine && window.ElsaShadowingEngine.speakNatural) {
              window.ElsaShadowingEngine.speakNatural(sentObj.text, { lang: 'en-US', rate: 0.95 });
            }
            return;
          }
        }
        var wEl = ev.target.closest('.psg-w');
        if (wEl && state.lastEval) {
          var wIdx = parseInt(wEl.getAttribute('data-widx'), 10);
          if (!isNaN(wIdx)) openWordPopover(wIdx);
        }
      });
    }

    var vocabStrip = $('psgVocabStrip');
    if (vocabStrip) {
      vocabStrip.addEventListener('click', function (ev) {
        var pill = ev.target.closest('.psg-vocab-pill');
        if (!pill) return;
        var word = pill.getAttribute('data-word');
        if (word && window.ElsaShadowingEngine && window.ElsaShadowingEngine.speakNatural) {
          window.ElsaShadowingEngine.speakNatural(word, { lang: 'en-US', rate: 0.9 });
        }
      });
    }

    var popClose = $('psgPopoverClose');
    if (popClose) popClose.addEventListener('click', closeWordPopover);

    var popSpeak = $('psgPopoverSpeak');
    if (popSpeak) {
      popSpeak.addEventListener('click', function () {
        var word = popSpeak.getAttribute('data-word');
        if (word && window.ElsaShadowingEngine && window.ElsaShadowingEngine.speakNatural) {
          window.ElsaShadowingEngine.speakNatural(word, { lang: 'en-US', rate: 0.9 });
        }
      });
    }

    var micBtn = $('psgMicBtn');
    if (micBtn) {
      micBtn.addEventListener('click', function () {
        if (state.isReadingActive) stopRecording(false);
        else startRecording();
      });
    }

    var retryBtn = $('psgBtnRetry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        if (state.currentPassage) openStudio(state.currentPassage.id);
      });
    }

    var nextBtn = $('psgBtnNext');
    if (nextBtn) nextBtn.addEventListener('click', goNextPassage);

    var fbToggle = $('psgBtnToggleFallback');
    if (fbToggle) {
      fbToggle.addEventListener('click', function () {
        var fb = $('psgFallbackBar');
        if (!fb) return;
        fb.classList.toggle('hidden');
        if (!fb.classList.contains('hidden')) {
          var inp = $('psgFallbackInput');
          if (inp) inp.focus();
        }
      });
    }

    var fbSubmit = $('psgFallbackSubmit');
    if (fbSubmit) {
      fbSubmit.addEventListener('click', function () {
        var inp = $('psgFallbackInput');
        var val = inp ? inp.value.trim() : '';
        if (!val) return;
        runEvaluation(val, 0);
      });
    }
  }

  function initPassagesApp() {
    if (typeof document === 'undefined') return;
    loadProgress();
    bindEvents();

    fetch('./passages_data.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        state.passages = Array.isArray(data) ? data : [];
        updateMasteryPill();
        renderCefrTabs();
        renderLibraryGrid();
      })
      .catch(function (err) {
        var grid = $('psgGrid');
        if (grid) {
          grid.innerHTML = '<div class="psg-empty-state">ไม่สามารถโหลดข้อมูลบทความ (passages_data.json) ได้: ' + escapeHtml(err.message) + '</div>';
        }
      });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPassagesApp);
    } else {
      initPassagesApp();
    }
  }

  var ElsaPassagesApp = {
    evaluatePassage: evaluatePassage,
    parsePassageStructure: parsePassageStructure,
    openStudio: openStudio,
    backToLibrary: backToLibrary
  };

  if (typeof window !== 'undefined') {
    window.ElsaPassagesApp = ElsaPassagesApp;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ElsaPassagesApp;
  } else if (root && root !== (typeof window !== 'undefined' ? window : null)) {
    root.ElsaPassagesApp = ElsaPassagesApp;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
