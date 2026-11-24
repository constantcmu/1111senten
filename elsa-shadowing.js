/**
 * ELSA Speak-style Shadowing Pronunciation Engine
 * Exposes `window.ElsaShadowingEngine` (and `module.exports` for Node testing).
 */
(function (root) {
  'use strict';

  // Common English contractions <-> expanded forms for resilient alignment
  const CONTRACTION_MAP = {
    "i'm": ['i', 'am'],
    "i've": ['i', 'have'],
    "i'll": ['i', 'will'],
    "i'd": ['i', 'would'],
    "you're": ['you', 'are'],
    "you've": ['you', 'have'],
    "you'll": ['you', 'will'],
    "you'd": ['you', 'would'],
    "he's": ['he', 'is'],
    "he'll": ['he', 'will'],
    "he'd": ['he', 'would'],
    "she's": ['she', 'is'],
    "she'll": ['she', 'will'],
    "she'd": ['she', 'would'],
    "it's": ['it', 'is'],
    "it'll": ['it', 'will'],
    "we're": ['we', 'are'],
    "we've": ['we', 'have'],
    "we'll": ['we', 'will'],
    "we'd": ['we', 'would'],
    "they're": ['they', 'are'],
    "they've": ['they', 'have'],
    "they'll": ['they', 'will'],
    "they'd": ['they', 'would'],
    "that's": ['that', 'is'],
    "there's": ['there', 'is'],
    "here's": ['here', 'is'],
    "what's": ['what', 'is'],
    "who's": ['who', 'is'],
    "where's": ['where', 'is'],
    "when's": ['when', 'is'],
    "how's": ['how', 'is'],
    "let's": ['let', 'us'],
    "don't": ['do', 'not'],
    "doesn't": ['does', 'not'],
    "didn't": ['did', 'not'],
    "isn't": ['is', 'not'],
    "aren't": ['are', 'not'],
    "wasn't": ['was', 'not'],
    "weren't": ['were', 'not'],
    "haven't": ['have', 'not'],
    "hasn't": ['has', 'not'],
    "hadn't": ['had', 'not'],
    "won't": ['will', 'not'],
    "wouldn't": ['would', 'not'],
    "can't": ['can', 'not'],
    "cannot": ['can', 'not'],
    "couldn't": ['could', 'not'],
    "shouldn't": ['should', 'not'],
    "mustn't": ['must', 'not'],
    "mightn't": ['might', 'not'],
    "needn't": ['need', 'not'],
    "ain't": ['am', 'not'],
    "gonna": ['going', 'to'],
    "wanna": ['want', 'to'],
    "gotta": ['got', 'to'],
    "kinda": ['kind', 'of'],
    "sorta": ['sort', 'of']
  };

  // Number word normalization for ASR digits
  const NUMBER_MAP = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
    '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
    '18': 'eighteen', '19': 'nineteen', '20': 'twenty'
  };

  // Common English homophone groups (spoken identically, ASR may pick either)
  const HOMOPHONE_GROUPS = [
    ['to', 'too', 'two'],
    ['there', 'their', "they're"],
    ['your', "you're"],
    ['its', "it's"],
    ['whose', "who's"],
    ['right', 'write', 'rite'],
    ['hear', 'here'],
    ['know', 'no'],
    ['new', 'knew'],
    ['wait', 'weight'],
    ['see', 'sea'],
    ['for', 'four', 'fore'],
    ['one', 'won'],
    ['son', 'sun'],
    ['by', 'buy', 'bye'],
    ['meet', 'meat'],
    ['peace', 'piece'],
    ['wear', 'where'],
    ['weather', 'whether'],
    ['hour', 'our'],
    ['aloud', 'allowed'],
    ['bored', 'board'],
    ['break', 'brake'],
    ['week', 'weak'],
    ['hair', 'hare'],
    ['whole', 'hole'],
    ['ate', 'eight'],
    ['be', 'bee'],
    ['eye', 'i'],
    ['hi', 'high'],
    ['night', 'knight'],
    ['mail', 'male'],
    ['sail', 'sale'],
    ['tail', 'tale'],
    ['way', 'weigh'],
    ['would', 'wood'],
    ['flower', 'flour'],
    ['passed', 'past'],
    ['read', 'red'],
    ['steal', 'steel'],
    ['through', 'threw'],
    ['waste', 'waist'],
    ['pair', 'pear'],
    ['plain', 'plane'],
    ['rain', 'reign', 'rein'],
    ['road', 'rode'],
    ['role', 'roll'],
    ['scene', 'seen'],
    ['sent', 'cent', 'scent'],
    ['some', 'sum'],
    ['stair', 'stare'],
    ['tale', 'tail'],
    ['threw', 'through'],
    ['toe', 'tow'],
    ['vain', 'vein', 'vane'],
    ['warn', 'worn']
  ];

  const HOMOPHONE_INDEX = Object.create(null);
  HOMOPHONE_GROUPS.forEach(function (group, idx) {
    group.forEach(function (w) {
      HOMOPHONE_INDEX[w] = idx;
    });
  });

  // Phonetically similar character pairs (lower substitution cost -> 'warn')
  const PHONETIC_CLOSE_PAIRS = new Set([
    'c:k', 'k:c', 'c:s', 's:c', 'c:q', 'q:c', 'k:q', 'q:k',
    's:z', 'z:s', 'f:v', 'v:f', 'p:b', 'b:p', 't:d', 'd:t',
    'k:g', 'g:k', 'g:j', 'j:g', 'm:n', 'n:m', 'l:r', 'r:l',
    'w:v', 'v:w', 'i:y', 'y:i', 'i:e', 'e:i', 'a:e', 'e:a',
    'a:o', 'o:a', 'o:u', 'u:o', 'e:u', 'u:e', 'a:u', 'u:a'
  ]);

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]*>/g, '');
  }

  function normalizeApostrophes(str) {
    return String(str || '').replace(/[\u2018\u2019\u201B\u0060]/g, "'");
  }

  function cleanWord(str) {
    var s = normalizeApostrophes(String(str || '')).toLowerCase().trim();
    s = s.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
    if (NUMBER_MAP[s]) return NUMBER_MAP[s];
    return s;
  }

  function areHomophones(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var ia = HOMOPHONE_INDEX[a];
    var ib = HOMOPHONE_INDEX[b];
    return ia !== undefined && ia === ib;
  }

  /**
   * Lightweight phonetic skeleton to capture English spelling-to-sound equivalence
   * (e.g. enough ~ enuf, phone ~ fone, night ~ nite, laugh ~ laf).
   */
  function phoneticSkeleton(word) {
    var w = cleanWord(word).replace(/'/g, '');
    if (!w) return '';
    w = w
      .replace(/^kn/, 'n')
      .replace(/^wr/, 'r')
      .replace(/^ps/, 's')
      .replace(/^wh/, 'w')
      .replace(/ph/g, 'f')
      .replace(/ck/g, 'k')
      .replace(/qu/g, 'kw')
      .replace(/ough$/g, 'o')
      .replace(/igh/g, 'ai')
      .replace(/tion/g, 'shn')
      .replace(/sion/g, 'zhn')
      .replace(/tch/g, 'ch')
      .replace(/dge/g, 'j')
      .replace(/c(?=[eiy])/g, 's')
      .replace(/c/g, 'k')
      .replace(/x/g, 'ks')
      .replace(/y$/g, 'i')
      .replace(/([a-z])\1+/g, '$1');
    if (w.length > 3 && w.endsWith('e') && !w.endsWith('le')) {
      w = w.slice(0, -1);
    }
    return w;
  }

  /**
   * Parse `targetItem.en` into structured word tokens, preserving punctuation
   * and tracking which characters were inside `<span>...</span>` or `targetItem.key`.
   */
  function parseTargetWords(targetItem) {
    var rawEn = String((targetItem && targetItem.en) || '').trim();
    var keyList = Array.isArray(targetItem && targetItem.key) ? targetItem.key : [];
    var keySet = new Set(keyList.map(function (k) { return cleanWord(k); }).filter(Boolean));

    // Step 1: Walk HTML string to tag each character with `inSpan: boolean`
    var taggedChars = [];
    var inSpan = false;
    var tagRegex = /<\/?span\b[^>]*>|<[^>]+>|[^<]/gi;
    var match;
    while ((match = tagRegex.exec(rawEn)) !== null) {
      var token = match[0];
      if (/^<span\b/i.test(token)) {
        inSpan = true;
      } else if (/^<\/span>/i.test(token)) {
        inSpan = false;
      } else if (/^</.test(token)) {
        // Ignore other HTML tags
      } else {
        taggedChars.push({ ch: token, inSpan: inSpan });
      }
    }

    // Step 2: Group into whitespace-separated word tokens
    var rawTokens = [];
    var current = [];
    for (var i = 0; i < taggedChars.length; i++) {
      var tc = taggedChars[i];
      if (/\s/.test(tc.ch)) {
        if (current.length > 0) {
          rawTokens.push(current);
          current = [];
        }
      } else {
        current.push(tc);
      }
    }
    if (current.length > 0) {
      rawTokens.push(current);
    }

    var hasAnySpan = taggedChars.some(function (c) { return c.inSpan && /[a-z0-9]/i.test(c.ch); });

    // Step 3: Build word objects with leading/core/trailing punctuation split
    var words = rawTokens.map(function (charArr) {
      var fullText = charArr.map(function (c) { return c.ch; }).join('');
      var m = /^([^a-zA-Z0-9']*)([a-zA-Z0-9''\u2018\u2019-]+?)([^a-zA-Z0-9']*)$/.exec(fullText);
      var leadingPunct = '';
      var core = fullText;
      var trailingPunct = '';
      if (m) {
        leadingPunct = m[1];
        core = m[2];
        trailingPunct = m[3];
      }
      var clean = cleanWord(core);
      var hasSpanChars = charArr.some(function (c) { return c.inSpan && /[a-z0-9]/i.test(c.ch); });

      // Mark as keyword if wrapped in <span>, OR if no <span> exists in sentence and word is in `key`
      var isKeyword = hasSpanChars || (!hasAnySpan && keySet.has(clean));

      // Per-character keyword flag (supports partial-word spans like `self-<span>conscious</span>.`)
      var coreStart = leadingPunct.length;
      var coreEnd = fullText.length - trailingPunct.length;
      var charMeta = charArr.map(function (c, idx) {
        var isCoreChar = idx >= coreStart && idx < coreEnd;
        var isKeyChar = false;
        if (isCoreChar) {
          if (hasSpanChars) {
            isKeyChar = c.inSpan;
          } else if (isKeyword) {
            isKeyChar = true;
          }
        }
        return {
          char: c.ch,
          isCore: isCoreChar,
          isKeyChar: isKeyChar
        };
      });

      return {
        text: fullText,
        leadingPunct: leadingPunct,
        core: core,
        trailingPunct: trailingPunct,
        clean: clean,
        isKeyword: isKeyword,
        charMeta: charMeta
      };
    });

    // Edge case: if neither <span> nor `key` matched any word (e.g. entries with missing key),
    // mark the longest alphabetic word as keyword so Normal mode always has a target.
    if (words.length > 0 && !words.some(function (w) { return w.isKeyword; })) {
      var bestIdx = 0;
      for (var j = 1; j < words.length; j++) {
        if (words[j].clean.length > words[bestIdx].clean.length) {
          bestIdx = j;
        }
      }
      words[bestIdx].isKeyword = true;
      words[bestIdx].charMeta.forEach(function (cm) {
        if (cm.isCore) cm.isKeyChar = true;
      });
    }

    return words;
  }

  /**
   * Parse `targetItem.ipa` into raw word tokens + outer slashes.
   */
  function parseIpaWords(ipaStr) {
    var raw = String(ipaStr || '').trim();
    if (!raw) return { hasSlashes: false, tokens: [] };
    var hasLeadingSlash = raw.startsWith('/');
    var hasTrailingSlash = raw.endsWith('/');
    var inner = raw.replace(/^\/+|\/+$/g, '').trim();
    if (!inner) return { hasSlashes: hasLeadingSlash || hasTrailingSlash, tokens: [] };
    return {
      hasSlashes: hasLeadingSlash || hasTrailingSlash,
      tokens: inner.split(/\s+/).filter(Boolean)
    };
  }

  /**
   * Build color-coded IPA tokens mapped from evaluated word results.
   * Joining `ipaTokens.map(t => t.text).join('')` reconstructs the exact IPA string.
   */
  function buildIpaTokens(ipaStr, wordResults) {
    var parsed = parseIpaWords(ipaStr);
    if (parsed.tokens.length === 0) return [];

    var out = [];
    if (parsed.hasSlashes) {
      out.push({ text: '/', level: 'neutral' });
    }

    var ipaCount = parsed.tokens.length;
    var wordCount = wordResults.length;

    for (var i = 0; i < ipaCount; i++) {
      if (i > 0) {
        out.push({ text: ' ', level: 'neutral' });
      }
      var ipaWord = parsed.tokens[i];
      if (wordCount === 0) {
        out.push({ text: ipaWord, level: 'neutral' });
        continue;
      }

      // Map IPA token index to corresponding word index
      var wIdx = ipaCount === wordCount
        ? i
        : Math.min(wordCount - 1, Math.floor((i / ipaCount) * wordCount));
      var w = wordResults[wIdx];

      // Inspect core char levels to support sub-word IPA color splits (e.g. /bɔr/ green + /ɪŋ/ red)
      var coreChars = (w.chars || []).filter(function (c, idx) {
        return !w._charMeta || (w._charMeta[idx] && w._charMeta[idx].isCore);
      });

      if (coreChars.length === 0) {
        out.push({ text: ipaWord, level: w.level || 'neutral' });
        continue;
      }

      // Collapse contiguous level runs in coreChars
      var runs = [];
      for (var c = 0; c < coreChars.length; c++) {
        var lv = coreChars[c].level || 'neutral';
        if (runs.length === 0 || runs[runs.length - 1].level !== lv) {
          runs.push({ level: lv, count: 1 });
        } else {
          runs[runs.length - 1].count++;
        }
      }

      if (runs.length === 1) {
        out.push({ text: ipaWord, level: runs[0].level });
      } else {
        // Proportionally slice IPA symbols across level runs
        var ipaChars = Array.from(ipaWord);
        var totalCore = coreChars.length;
        var cursor = 0;
        for (var r = 0; r < runs.length; r++) {
          var isLast = r === runs.length - 1;
          var sliceLen = isLast
            ? ipaChars.length - cursor
            : Math.max(1, Math.round((runs[r].count / totalCore) * ipaChars.length));
          if (cursor >= ipaChars.length) break;
          var segment = ipaChars.slice(cursor, cursor + sliceLen).join('');
          cursor += sliceLen;
          if (segment) {
            out.push({ text: segment, level: runs[r].level });
          }
        }
        if (cursor < ipaChars.length) {
          out.push({
            text: ipaChars.slice(cursor).join(''),
            level: runs[runs.length - 1].level
          });
        }
      }
    }

    if (parsed.hasSlashes) {
      out.push({ text: '/', level: 'neutral' });
    }
    return out;
  }

  /**
   * Character-level weighted Levenshtein alignment between targetCore and spokenCore.
   * Returns { score: 0..100, charLevels: Array<'good'|'warn'|'bad'> } matching targetCore length.
   */
  function alignWordCharacters(targetClean, spokenClean) {
    var a = targetClean.replace(/'/g, '');
    var b = spokenClean.replace(/'/g, '');
    var m = a.length;
    var n = b.length;

    if (m === 0) return { score: 100, charLevels: [] };
    if (n === 0) {
      return {
        score: 0,
        charLevels: new Array(m).fill('bad')
      };
    }

    if (a === b || areHomophones(targetClean, spokenClean)) {
      return {
        score: 100,
        charLevels: new Array(m).fill('good')
      };
    }

    // DP matrix for weighted edit distance
    var dp = new Array(m + 1);
    var bt = new Array(m + 1);
    for (var i = 0; i <= m; i++) {
      dp[i] = new Float64Array(n + 1);
      bt[i] = new Uint8Array(n + 1); // 0=diag, 1=up(del), 2=left(ins)
      dp[i][0] = i;
      bt[i][0] = 1;
    }
    for (var j = 0; j <= n; j++) {
      dp[0][j] = j;
      bt[0][j] = 2;
    }
    bt[0][0] = 0;

    for (var r = 1; r <= m; r++) {
      for (var c = 1; c <= n; c++) {
        var ca = a[r - 1];
        var cb = b[c - 1];
        var subCost = 1.0;
        if (ca === cb) {
          subCost = 0.0;
        } else if (PHONETIC_CLOSE_PAIRS.has(ca + ':' + cb)) {
          subCost = 0.45;
        }
        var diag = dp[r - 1][c - 1] + subCost;
        var up = dp[r - 1][c] + 1.0;   // deletion from target
        var left = dp[r][c - 1] + 0.85; // insertion in spoken

        if (diag <= up && diag <= left) {
          dp[r][c] = diag;
          bt[r][c] = 0;
        } else if (up <= left) {
          dp[r][c] = up;
          bt[r][c] = 1;
        } else {
          dp[r][c] = left;
          bt[r][c] = 2;
        }
      }
    }

    // Backtrack to assign per-character level for target `a`
    var charLevels = new Array(m).fill('bad');
    var ti = m;
    var sj = n;
    while (ti > 0 || sj > 0) {
      var move = bt[ti][sj];
      if (ti > 0 && sj > 0 && move === 0) {
        var chA = a[ti - 1];
        var chB = b[sj - 1];
        if (chA === chB) {
          charLevels[ti - 1] = 'good';
        } else if (PHONETIC_CLOSE_PAIRS.has(chA + ':' + chB)) {
          charLevels[ti - 1] = 'warn';
        } else {
          charLevels[ti - 1] = 'bad';
        }
        ti--;
        sj--;
      } else if (ti > 0 && (sj === 0 || move === 1)) {
        charLevels[ti - 1] = 'bad';
        ti--;
      } else {
        sj--;
      }
    }

    var maxLen = Math.max(m, n);
    var editSim = Math.max(0, 1 - dp[m][n] / maxLen);

    // Blend with phonetic skeleton similarity for English spelling quirks
    var skA = phoneticSkeleton(targetClean);
    var skB = phoneticSkeleton(spokenClean);
    var skSim = editSim;
    if (skA && skB) {
      if (skA === skB) {
        skSim = 0.96;
      } else {
        var skDist = simpleLevenshtein(skA, skB);
        skSim = Math.max(0, 1 - skDist / Math.max(skA.length, skB.length));
      }
    }

    var combined = Math.max(editSim, editSim * 0.65 + skSim * 0.35);
    var score = Math.round(Math.max(0, Math.min(100, combined * 100)));

    // If phonetic skeleton matched almost identically (e.g. enough vs enuf), upgrade warn/bad
    if (score >= 92) {
      charLevels = charLevels.map(function (lv) { return lv === 'bad' ? 'warn' : lv; });
    }

    return { score: score, charLevels: charLevels };
  }

  function simpleLevenshtein(a, b) {
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

  /**
   * Compute word-to-word similarity score (0..100) including contractions and hyphens.
   */
  function wordPairSimilarity(targetClean, spokenClean) {
    if (!targetClean || !spokenClean) return 0;
    if (targetClean === spokenClean || areHomophones(targetClean, spokenClean)) return 100;
    // Strip hyphens/apostrophes for quick check (e.g. didnt vs didn't, selfconscious vs self-conscious)
    var tFlat = targetClean.replace(/['-]/g, '');
    var sFlat = spokenClean.replace(/['-]/g, '');
    if (tFlat === sFlat) return 98;
    return alignWordCharacters(tFlat, sFlat).score;
  }

  /**
   * Check if a single contracted/hyphenated word matches two consecutive words
   * e.g. "didn't" <-> ["did", "not"], "self-conscious" <-> ["self", "conscious"].
   */
  function matchesTwoWords(singleClean, w1, w2) {
    if (!singleClean || !w1 || !w2) return 0;
    var exp = CONTRACTION_MAP[singleClean];
    if (exp && exp[0] === w1 && exp[1] === w2) return 100;
    if (singleClean.indexOf('-') !== -1) {
      var parts = singleClean.split('-').filter(Boolean);
      if (parts.length === 2) {
        var s1 = wordPairSimilarity(parts[0], w1);
        var s2 = wordPairSimilarity(parts[1], w2);
        return Math.round((s1 + s2) / 2);
      }
    }
    if (singleClean.replace(/['-]/g, '') === (w1 + w2).replace(/['-]/g, '')) return 98;
    return 0;
  }

  /**
   * Tokenize spoken transcript into cleaned words.
   */
  function tokenizeSpoken(spokenText) {
    var normalized = normalizeApostrophes(String(spokenText || ''))
      .replace(/[^\w\s'-]/g, ' ')
      .trim();
    if (!normalized) return [];
    return normalized
      .split(/\s+/)
      .map(cleanWord)
      .filter(Boolean);
  }

  /**
   * Word-level DP alignment (Needleman-Wunsch / LCS variant) between targetWords and spokenWords.
   * Supports 1-to-1, 1-to-2 (contractions/hyphens), and 2-to-1 matches so skipped/extra words
   * do not shift the rest of the sentence.
   */
  function alignSentenceWords(targetWords, spokenWords) {
    var M = targetWords.length;
    var N = spokenWords.length;
    var dp = new Array(M + 1);
    var bt = new Array(M + 1);
    // Backtrack codes: 1=1:1 match, 2=skip target, 3=skip spoken, 4=1target:2spoken, 5=2target:1spoken

    for (var i = 0; i <= M; i++) {
      dp[i] = new Float64Array(N + 1);
      bt[i] = new Uint8Array(N + 1);
      dp[i][0] = 0;
      bt[i][0] = 2;
    }
    for (var j = 0; j <= N; j++) {
      dp[0][j] = -5 * j;
      bt[0][j] = 3;
    }
    bt[0][0] = 0;

    for (var r = 1; r <= M; r++) {
      var tClean = targetWords[r - 1].clean;
      for (var c = 1; c <= N; c++) {
        var sClean = spokenWords[c - 1];

        // Default: skip target word (omission)
        var bestVal = dp[r - 1][c];
        var bestOp = 2;

        // Skip spoken word (insertion)
        var skipSpokenVal = dp[r][c - 1] - 5;
        if (skipSpokenVal > bestVal) {
          bestVal = skipSpokenVal;
          bestOp = 3;
        }

        // 1:1 match
        var sim11 = wordPairSimilarity(tClean, sClean);
        if (sim11 >= 25) {
          var match11Val = dp[r - 1][c - 1] + sim11;
          if (match11Val > bestVal) {
            bestVal = match11Val;
            bestOp = 1;
          }
        }

        // 1 target : 2 spoken (e.g. target "didn't" vs spoken "did not")
        if (c >= 2) {
          var sim12 = matchesTwoWords(tClean, spokenWords[c - 2], sClean);
          if (sim12 >= 60) {
            var match12Val = dp[r - 1][c - 2] + sim12 + 5;
            if (match12Val > bestVal) {
              bestVal = match12Val;
              bestOp = 4;
            }
          }
        }

        // 2 target : 1 spoken (e.g. target "did not" vs spoken "didn't")
        if (r >= 2) {
          var sim21 = matchesTwoWords(sClean, targetWords[r - 2].clean, tClean);
          if (sim21 >= 60) {
            var match21Val = dp[r - 2][c - 1] + sim21 * 2 + 5;
            if (match21Val > bestVal) {
              bestVal = match21Val;
              bestOp = 5;
            }
          }
        }

        dp[r][c] = bestVal;
        bt[r][c] = bestOp;
      }
    }

    // Reconstruct aligned spoken string per target word
    var aligned = new Array(M);
    for (var k = 0; k < M; k++) {
      aligned[k] = { spoken: '', forceScore: null };
    }

    var ti = M;
    var sj = N;
    while (ti > 0 && sj > 0) {
      var op = bt[ti][sj];
      if (op === 1) {
        aligned[ti - 1] = { spoken: spokenWords[sj - 1], forceScore: null };
        ti--;
        sj--;
      } else if (op === 4) {
        aligned[ti - 1] = {
          spoken: spokenWords[sj - 2] + ' ' + spokenWords[sj - 1],
          forceScore: matchesTwoWords(targetWords[ti - 1].clean, spokenWords[sj - 2], spokenWords[sj - 1])
        };
        ti--;
        sj -= 2;
      } else if (op === 5) {
        var score21 = matchesTwoWords(spokenWords[sj - 1], targetWords[ti - 2].clean, targetWords[ti - 1].clean);
        aligned[ti - 1] = { spoken: spokenWords[sj - 1], forceScore: score21 };
        aligned[ti - 2] = { spoken: spokenWords[sj - 1], forceScore: score21 };
        ti -= 2;
        sj--;
      } else if (op === 2) {
        ti--;
      } else {
        sj--;
      }
    }

    return aligned;
  }

  function scoreToLevel(score) {
    if (score >= 80) return 'good';
    if (score >= 50) return 'warn';
    return 'bad';
  }

  /**
   * Generate a specific, actionable Thai + English pronunciation tip
   * based on the lowest-scoring word and its mismatched characters.
   */
  function generateTip(wordResults, overallScore, mode, spokenBest) {
    if (!spokenBest || !spokenBest.trim()) {
      return 'ยังไม่ได้ยินเสียงพูด ลองกดปุ่มไมโครโฟนแล้วพูดประโยคให้ชัดเจนอีกครั้ง';
    }

    if (overallScore >= 95) {
      return 'ออกเสียงได้ชัดเจนมาก! น้ำเสียงและพยัญชนะท้ายใกล้เคียงเจ้าของภาษาเลย';
    }

    // Pick lowest-scoring word (prioritize keywords in normal mode)
    var candidates = mode === 'normal'
      ? wordResults.filter(function (w) { return w.isKeyword; })
      : wordResults;
    if (candidates.length === 0) candidates = wordResults;

    var worst = candidates[0];
    for (var i = 1; i < candidates.length; i++) {
      if (candidates[i].score < worst.score) {
        worst = candidates[i];
      }
    }

    if (!worst || worst.score >= 90) {
      return 'ยอดเยี่ยม! ลองฝึกพูดให้ลื่นไหลต่อเนื่องเป็นจังหวะเดียวกันทั้งประโยค';
    }

    var wordLabel = worst.core || worst.text;
    var lowerCore = wordLabel.toLowerCase();

    if (!worst.spoken) {
      return 'ไม่พบคำว่า "' + wordLabel + '" — ลองพูดช้าลงและออกเสียงคำนี้ให้ชัดเจน';
    }

    // Extract mismatched characters from the worst word
    var badChars = (worst.chars || [])
      .filter(function (c) { return c.level === 'bad' || c.level === 'warn'; })
      .map(function (c) { return c.char; })
      .join('')
      .toLowerCase();

    // Detect specific phonetic trouble spots
    if (/ed$/.test(lowerCore) && (badChars.indexOf('d') !== -1 || badChars.indexOf('e') !== -1)) {
      return 'คำว่า "' + wordLabel + '": ระวังเสียงท้าย -ed (/t/, /d/ หรือ /ɪd/) ให้ออกเสียงท้ายชัดเจน';
    }
    if (/le$/.test(lowerCore) && (badChars.indexOf('l') !== -1 || badChars.indexOf('e') !== -1)) {
      return 'คำว่า "' + wordLabel + '": เสียงท้าย -le (/l/) แตะปลายลิ้นที่ปุ่มเหงือกด้านบนให้ชัด';
    }
    if (/ing$/.test(lowerCore) && (badChars.indexOf('n') !== -1 || badChars.indexOf('g') !== -1)) {
      return 'คำว่า "' + wordLabel + '": เสียงท้าย -ing (/ŋ/) ให้ขึ้นจมูกเล็กน้อยโดยไม่กลืนเสียง';
    }
    if (lowerCore.indexOf('th') !== -1 && (badChars.indexOf('t') !== -1 || badChars.indexOf('h') !== -1)) {
      return 'คำว่า "' + wordLabel + '": เสียง /θ/ หรือ /ð/ (th) ให้แตะปลายลิ้นเบาๆ ระหว่างฟันบน-ล่าง';
    }
    if (badChars.indexOf('r') !== -1) {
      return 'คำว่า "' + wordLabel + '": เสียง /r/ ม้วนปลายลิ้นขึ้นเล็กน้อยโดยไม่แตะเพดานปาก';
    }
    if (badChars.indexOf('l') !== -1) {
      return 'คำว่า "' + wordLabel + '": เสียง /l/ แตะปลายลิ้นที่ปุ่มเหงือกหลังฟันบนให้ชัด';
    }
    if ((lowerCore.indexOf('sh') !== -1 || lowerCore.indexOf('ch') !== -1) &&
        (badChars.indexOf('s') !== -1 || badChars.indexOf('c') !== -1 || badChars.indexOf('h') !== -1)) {
      return 'คำว่า "' + wordLabel + '": เสียง /ʃ/ หรือ /tʃ/ ห่อริมฝีปากเล็กน้อยแล้วปล่อยลมออกให้ชัด';
    }
    if (badChars.indexOf('v') !== -1 || badChars.indexOf('f') !== -1) {
      return 'คำว่า "' + wordLabel + '": เสียง /v/ หรือ /f/ ใช้ฟันบนแตะริมฝีปากล่างเบาๆ';
    }
    if (/[sz]$/.test(lowerCore) && (badChars.indexOf('s') !== -1 || badChars.indexOf('z') !== -1)) {
      return 'คำว่า "' + wordLabel + '": อย่าลืมออกเสียงท้าย -s / -z ให้ได้ยินชัดเจน';
    }
    if (/[tdkp]$/.test(lowerCore) && /[tdkp]/.test(badChars)) {
      return 'คำว่า "' + wordLabel + '": เน้นเสียงพยัญชนะท้าย "-' + lowerCore.slice(-1) + '" ให้ชัด อย่าตัดเสียงสั้นเกินไป';
    }

    if (badChars) {
      return 'คำว่า "' + wordLabel + '": ลองเน้นช่วงเสียง "' + badChars + '" ให้ชัดขึ้น (ระบบได้ยินเป็น "' + worst.spoken + '")';
    }
    return 'คำว่า "' + wordLabel + '": ลองฟังเสียงช้า (หอยทาก) แล้วออกเสียงตามทีละพยางค์';
  }

  /**
   * Evaluate a single spoken transcript candidate against parsed target words.
   */
  function evaluateSingleCandidate(targetItem, parsedWords, spokenText, mode) {
    var spokenWords = tokenizeSpoken(spokenText);
    var aligned = alignSentenceWords(parsedWords, spokenWords);

    var wordResults = parsedWords.map(function (tw, idx) {
      var al = aligned[idx];
      var spokenWord = al.spoken || '';
      var wordScore = 0;
      var coreAlignLevels = null;

      if (al.forceScore !== null) {
        wordScore = al.forceScore;
      } else if (spokenWord) {
        var tFlat = tw.clean.replace(/['-]/g, '');
        var sFlat = spokenWord.replace(/['-]/g, '');
        if (tFlat === sFlat || areHomophones(tw.clean, spokenWord)) {
          wordScore = 100;
        } else {
          var charRes = alignWordCharacters(tFlat, sFlat);
          wordScore = charRes.score;
          coreAlignLevels = charRes.charLevels;
        }
      } else {
        wordScore = 0;
      }

      var wordLevel = scoreToLevel(wordScore);

      // Build character-level styling array matching tw.text
      var flatIdx = 0;
      var chars = tw.charMeta.map(function (cm) {
        if (!cm.isCore) {
          return { char: cm.char, level: 'neutral', underline: false };
        }

        // Apostrophes/hyphens inside core word inherit neutral unless whole word is bad
        var isAlphaNum = /[a-z0-9]/i.test(cm.char);
        var alignedLv = wordLevel;
        if (isAlphaNum && coreAlignLevels && flatIdx < coreAlignLevels.length) {
          alignedLv = coreAlignLevels[flatIdx];
          flatIdx++;
        } else if (isAlphaNum) {
          flatIdx++;
        }

        if (mode === 'normal') {
          if (!tw.isKeyword) {
            // Non-keyword words stay neutral unless severely replaced by a completely wrong word
            var severeMismatch = spokenWord !== '' && wordScore < 20;
            return {
              char: cm.char,
              level: severeMismatch ? 'bad' : 'neutral',
              underline: false
            };
          }

          // Keyword word in Normal mode
          if (!cm.isKeyChar) {
            // Non-spanned prefix/suffix of a partial-span word (e.g. `self-` in `self-<span>conscious</span>`)
            return { char: cm.char, level: 'neutral', underline: false };
          }
          if (wordScore >= 80) {
            return { char: cm.char, level: 'good', underline: false };
          }
          if (!spokenWord) {
            return { char: cm.char, level: 'bad', underline: true };
          }
          // Partial keyword match: highlight mismatched chars in red+underline / orange,
          // matching IMG_2166 (`hairsty` neutral, `le` red underlined) or green when >= 50
          if (alignedLv === 'bad') {
            return { char: cm.char, level: 'bad', underline: true };
          }
          if (alignedLv === 'warn') {
            return { char: cm.char, level: 'warn', underline: true };
          }
          return {
            char: cm.char,
            level: wordScore >= 50 ? 'good' : 'neutral',
            underline: false
          };
        }

        // Advanced mode: color every word & character (like IMG_2168: `bor` green, `ing` red)
        if (wordScore >= 85) {
          return { char: cm.char, level: 'good', underline: false };
        }
        if (!spokenWord) {
          return { char: cm.char, level: 'bad', underline: true };
        }
        if (alignedLv === 'bad') {
          return { char: cm.char, level: 'bad', underline: true };
        }
        if (alignedLv === 'warn') {
          return { char: cm.char, level: 'warn', underline: false };
        }
        return { char: cm.char, level: 'good', underline: false };
      });

      // In Normal mode, non-keyword word level for IPA stays 'neutral' unless severely wrong
      var displayLevel = wordLevel;
      if (mode === 'normal' && !tw.isKeyword) {
        displayLevel = (spokenWord !== '' && wordScore < 20) ? 'bad' : 'neutral';
      }

      return {
        text: tw.text,
        leadingPunct: tw.leadingPunct,
        core: tw.core,
        trailingPunct: tw.trailingPunct,
        clean: tw.clean,
        isKeyword: tw.isKeyword,
        score: wordScore,
        level: displayLevel,
        spoken: spokenWord,
        chars: chars,
        _charMeta: tw.charMeta
      };
    });

    // Compute overall score (0..100 integer)
    var overallScore = 0;
    if (wordResults.length > 0) {
      if (mode === 'normal') {
        var kwWords = wordResults.filter(function (w) { return w.isKeyword; });
        var kwAvg = kwWords.length > 0
          ? kwWords.reduce(function (acc, w) { return acc + w.score; }, 0) / kwWords.length
          : 0;
        var sentAvg = wordResults.reduce(function (acc, w) { return acc + w.score; }, 0) / wordResults.length;

        if (kwAvg === 0) {
          // Missing keyword must stay clearly incorrect (< 50%)
          overallScore = Math.min(35, Math.round(sentAvg * 0.35));
        } else {
          overallScore = Math.round(kwAvg * 0.85 + sentAvg * 0.15);
          // Do not let non-keyword words push a mispronounced keyword into 'correct' (>= 80)
          if (kwAvg < 80 && overallScore >= 80) {
            overallScore = Math.min(79, Math.round(kwAvg));
          }
          // If keyword was spoken perfectly, guarantee >= 85% even if user only said the keyword
          if (kwAvg >= 95 && overallScore < 85) {
            overallScore = 85;
          }
        }
      } else {
        // Advanced mode: length-weighted score across every word in the sentence
        var totalWeight = 0;
        var weightedSum = 0;
        for (var i = 0; i < wordResults.length; i++) {
          var weight = Math.max(2, wordResults[i].clean.length);
          totalWeight += weight;
          weightedSum += wordResults[i].score * weight;
        }
        overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      }
    }

    overallScore = Math.max(0, Math.min(100, overallScore));

    // Build color-coded IPA tokens before stripping internal `_charMeta`
    var ipaTokens = buildIpaTokens(targetItem && targetItem.ipa, wordResults);

    // Strip internal helper field from public word results
    var publicWords = wordResults.map(function (w) {
      return {
        text: w.text,
        leadingPunct: w.leadingPunct,
        core: w.core,
        trailingPunct: w.trailingPunct,
        clean: w.clean,
        isKeyword: w.isKeyword,
        score: w.score,
        level: w.level,
        spoken: w.spoken,
        chars: w.chars
      };
    });

    // Status thresholds & Thai copy
    var status;
    var statusTitleTh;
    var subtitleTh;
    if (overallScore >= 80) {
      status = 'correct';
      statusTitleTh = 'ยอดเยี่ยม!';
      subtitleTh = 'คุณฟังดู ' + overallScore + '% เหมือนเจ้าของภาษาเลย!';
    } else if (overallScore >= 50) {
      status = 'almost';
      statusTitleTh = 'เกือบจะถูกต้องแล้ว';
      subtitleTh = 'คุณฟังดู ' + overallScore + '% เหมือนเจ้าของภาษาเลย!';
    } else {
      status = 'incorrect';
      statusTitleTh = 'ไม่ถูกต้อง';
      subtitleTh = 'คุณฟังดู ' + overallScore + '% เหมือนเจ้าของภาษา — ลองเน้นเสียงสีแดงอีกครั้ง';
    }

    var tip = generateTip(publicWords, overallScore, mode, spokenText);

    return {
      score: overallScore,
      status: status,
      statusTitleTh: statusTitleTh,
      subtitleTh: subtitleTh,
      tip: tip,
      spokenBest: String(spokenText || '').trim(),
      words: publicWords,
      ipaTokens: ipaTokens
    };
  }

  /**
   * 1. preparePrompt(targetItem, mode)
   */
  function preparePrompt(targetItem, mode) {
    var safeMode = mode === 'advanced' ? 'advanced' : 'normal';
    var parsedWords = parseTargetWords(targetItem);

    var words = parsedWords.map(function (tw) {
      var chars = tw.charMeta.map(function (cm) {
        return {
          char: cm.char,
          level: 'neutral',
          underline: safeMode === 'normal' && cm.isKeyChar
        };
      });

      return {
        text: tw.text,
        leadingPunct: tw.leadingPunct,
        core: tw.core,
        trailingPunct: tw.trailingPunct,
        clean: tw.clean,
        isKeyword: tw.isKeyword,
        score: null,
        level: 'neutral',
        spoken: null,
        chars: chars
      };
    });

    var ipaTokens = buildIpaTokens(targetItem && targetItem.ipa, words);

    if (safeMode === 'advanced') {
      return {
        words: words,
        ipaTokens: ipaTokens,
        badgeTh: 'วิเคราะห์ทั้งประโยค',
        instructionTh: 'พูดประโยคทั้งหมดเพื่อวัดความเหมือนเจ้าของภาษาเป็นเปอร์เซ็นต์'
      };
    }

    return {
      words: words,
      ipaTokens: ipaTokens,
      badgeTh: 'เสียงตอบรับแบบเดี่ยว',
      instructionTh: 'พูดประโยคดังกล่าวและรับฟังความคิดเห็นเกี่ยวกับคำสำคัญที่ขีดเส้นใต้'
    };
  }

  /**
   * 2. evaluateSpeech(targetItem, spokenText, mode, alternatives = [])
   */
  function evaluateSpeech(targetItem, spokenText, mode, alternatives) {
    var safeMode = mode === 'advanced' ? 'advanced' : 'normal';
    var parsedWords = parseTargetWords(targetItem);

    var candidates = [];
    if (typeof spokenText === 'string' && spokenText.trim()) {
      candidates.push(spokenText.trim());
    }
    if (Array.isArray(alternatives)) {
      for (var i = 0; i < alternatives.length; i++) {
        var alt = alternatives[i];
        if (typeof alt === 'string' && alt.trim() && candidates.indexOf(alt.trim()) === -1) {
          candidates.push(alt.trim());
        }
      }
    }

    if (candidates.length === 0) {
      return evaluateSingleCandidate(targetItem, parsedWords, '', safeMode);
    }

    var bestResult = null;
    for (var c = 0; c < candidates.length; c++) {
      var res = evaluateSingleCandidate(targetItem, parsedWords, candidates[c], safeMode);
      if (!bestResult || res.score > bestResult.score) {
        bestResult = res;
      }
    }

    return bestResult;
  }

  /**
   * 3. createRecorder(callbacks)
   * Combines Web Speech API (SpeechRecognition) with MediaRecorder mic capture.
   */
  function createRecorder(callbacks) {
    var cbs = callbacks || {};
    var SpeechRecognitionCtor = (typeof window !== 'undefined')
      ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
      : null;

    var recognition = null;
    var mediaRecorder = null;
    var mediaStream = null;
    var audioChunks = [];
    var lastAudioUrl = null;
    var activeAudioEl = null;
    var isRecording = false;
    var receivedFinalResult = false;
    var lastInterimTranscript = '';

    function safeCall(fn) {
      if (typeof fn === 'function') {
        var args = Array.prototype.slice.call(arguments, 1);
        try {
          fn.apply(null, args);
        } catch (err) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[ElsaShadowingEngine] callback error:', err);
          }
        }
      }
    }

    function revokeLastAudio() {
      if (lastAudioUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(lastAudioUrl);
        } catch (e) { /* ignore */ }
      }
      lastAudioUrl = null;
    }

    function stopMediaTracks() {
      if (mediaStream) {
        try {
          mediaStream.getTracks().forEach(function (track) { track.stop(); });
        } catch (e) { /* ignore */ }
        mediaStream = null;
      }
    }

    function stopMediaRecorder() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch (e) {
          stopMediaTracks();
        }
      } else {
        stopMediaTracks();
      }
    }

    function startMediaCapture() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        return;
      }

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          // If recognition already stopped before mic stream resolved, immediately release stream
          if (!isRecording) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
          mediaStream = stream;
          audioChunks = [];

          var options = {};
          var mimeCandidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus'
          ];
          if (typeof MediaRecorder.isTypeSupported === 'function') {
            for (var i = 0; i < mimeCandidates.length; i++) {
              if (MediaRecorder.isTypeSupported(mimeCandidates[i])) {
                options.mimeType = mimeCandidates[i];
                break;
              }
            }
          }

          try {
            mediaRecorder = options.mimeType
              ? new MediaRecorder(stream, options)
              : new MediaRecorder(stream);
          } catch (err) {
            stopMediaTracks();
            return;
          }

          mediaRecorder.ondataavailable = function (ev) {
            if (ev.data && ev.data.size > 0) {
              audioChunks.push(ev.data);
            }
          };

          mediaRecorder.onstop = function () {
            stopMediaTracks();
            if (audioChunks.length > 0 && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
              var mimeType = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
              var blob = new Blob(audioChunks, { type: mimeType });
              revokeLastAudio();
              lastAudioUrl = URL.createObjectURL(blob);
              safeCall(cbs.onAudioReady, lastAudioUrl);
            }
            audioChunks = [];
            mediaRecorder = null;
          };

          mediaRecorder.onerror = function () {
            stopMediaTracks();
            mediaRecorder = null;
          };

          mediaRecorder.start();
        })
        .catch(function () {
          // Gracefully degrade: SpeechRecognition still works even if MediaRecorder/mic capture fails
        });
    }

    function isSupported() {
      return Boolean(SpeechRecognitionCtor);
    }

    function start() {
      if (!SpeechRecognitionCtor) {
        safeCall(cbs.onError, 'not-supported', 'เบราว์เซอร์นี้ไม่รองรับการรู้จำเสียงพูด (Web Speech API)');
        return false;
      }

      if (isRecording) {
        stop();
      }

      isRecording = true;
      receivedFinalResult = false;
      lastInterimTranscript = '';

      recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 5;
      recognition.continuous = false;

      recognition.onstart = function () {
        safeCall(cbs.onStart);
      };

      recognition.onresult = function (event) {
        if (!event || !event.results) return;
        var interimText = '';
        var finalTranscript = '';
        var alternatives = [];

        for (var i = event.resultIndex; i < event.results.length; i++) {
          var res = event.results[i];
          if (res.isFinal) {
            var primary = (res[0] && res[0].transcript) ? res[0].transcript.trim() : '';
            if (primary) {
              finalTranscript = finalTranscript ? (finalTranscript + ' ' + primary) : primary;
            }
            for (var a = 0; a < res.length; a++) {
              var altText = res[a] && res[a].transcript ? res[a].transcript.trim() : '';
              if (altText && alternatives.indexOf(altText) === -1) {
                alternatives.push(altText);
              }
            }
          } else {
            var part = (res[0] && res[0].transcript) ? res[0].transcript : '';
            interimText += part;
          }
        }

        if (interimText.trim()) {
          lastInterimTranscript = interimText.trim();
          safeCall(cbs.onInterim, lastInterimTranscript);
        }

        if (finalTranscript) {
          receivedFinalResult = true;
          safeCall(cbs.onResult, finalTranscript, alternatives);
        }
      };

      recognition.onerror = function (event) {
        var code = (event && event.error) || 'unknown';
        var msgMap = {
          'not-allowed': 'กรุณาอนุญาตการใช้ไมโครโฟนในเบราว์เซอร์',
          'service-not-allowed': 'ไม่อนุญาตให้ใช้บริการรู้จำเสียงพูด',
          'no-speech': 'ไม่ได้ยินเสียงพูด กรุณาลองใหม่อีกครั้ง',
          'audio-capture': 'ไม่พบไมโครโฟน กรุณาตรวจสอบอุปกรณ์',
          'network': 'เกิดข้อผิดพลาดทางเครือข่ายในการรู้จำเสียงพูด',
          'aborted': 'หยุดการฟังเสียงแล้ว'
        };
        safeCall(cbs.onError, code, msgMap[code] || ('ข้อผิดพลาดไมโครโฟน: ' + code));
      };

      recognition.onend = function () {
        var hadInterimOnly = !receivedFinalResult && Boolean(lastInterimTranscript);
        isRecording = false;
        stopMediaRecorder();
        if (hadInterimOnly) {
          receivedFinalResult = true;
          safeCall(cbs.onResult, lastInterimTranscript, [lastInterimTranscript]);
        }
        safeCall(cbs.onEnd);
      };

      try {
        recognition.start();
        startMediaCapture();
        return true;
      } catch (err) {
        isRecording = false;
        stopMediaRecorder();
        safeCall(cbs.onError, 'start-failed', 'ไม่สามารถเริ่มการฟังเสียงได้ กรุณาลองใหม่');
        return false;
      }
    }

    function stop() {
      isRecording = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) { /* ignore */ }
      }
      stopMediaRecorder();
    }

    function getLastAudioUrl() {
      return lastAudioUrl;
    }

    function playUserAudio(onEnded) {
      if (activeAudioEl) {
        try {
          activeAudioEl.pause();
          activeAudioEl.currentTime = 0;
        } catch (e) { /* ignore */ }
        activeAudioEl = null;
      }

      if (!lastAudioUrl || typeof Audio === 'undefined') {
        safeCall(onEnded);
        return null;
      }

      var audio = new Audio(lastAudioUrl);
      activeAudioEl = audio;
      var endedCalled = false;
      function finish() {
        if (endedCalled) return;
        endedCalled = true;
        if (activeAudioEl === audio) activeAudioEl = null;
        safeCall(onEnded);
      }

      audio.onended = finish;
      audio.onerror = finish;
      var playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(finish);
      }
      return audio;
    }

    function clearAudio() {
      if (activeAudioEl) {
        try {
          activeAudioEl.pause();
        } catch (e) { /* ignore */ }
        activeAudioEl = null;
      }
      revokeLastAudio();
    }

    return {
      start: start,
      stop: stop,
      isSupported: isSupported,
      getLastAudioUrl: getLastAudioUrl,
      playUserAudio: playUserAudio,
      clearAudio: clearAudio
    };
  }

  /**
   * 4. speakTTS(text, rate = 1.0, onEnd)
   */
  function speakTTS(text, rate, onEnd) {
    var cleanText = stripHtml(text).replace(/\s+/g, ' ').trim();
    var speed = (typeof rate === 'number' && !isNaN(rate))
      ? Math.max(0.4, Math.min(2.0, rate))
      : 1.0;

    function done() {
      if (typeof onEnd === 'function') {
        try {
          onEnd();
        } catch (e) { /* ignore */ }
      }
    }

    if (!cleanText || typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
      done();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      var utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = speed;

      var voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      if (voices && voices.length > 0) {
        var enUsVoice = voices.find(function (v) { return /^en[-_]US/i.test(v.lang); }) ||
          voices.find(function (v) { return /^en/i.test(v.lang); });
        if (enUsVoice) utterance.voice = enUsVoice;
      }

      var finished = false;
      function onFinish() {
        if (finished) return;
        finished = true;
        done();
      }
      utterance.onend = onFinish;
      utterance.onerror = onFinish;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      done();
    }
  }

  var ElsaShadowingEngine = {
    preparePrompt: preparePrompt,
    evaluateSpeech: evaluateSpeech,
    createRecorder: createRecorder,
    speakTTS: speakTTS
  };

  if (typeof window !== 'undefined') {
    window.ElsaShadowingEngine = ElsaShadowingEngine;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ElsaShadowingEngine;
  } else if (root && root !== (typeof window !== 'undefined' ? window : null)) {
    root.ElsaShadowingEngine = ElsaShadowingEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
