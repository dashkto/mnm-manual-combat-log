// Voice entry: speech recognition in the browser (Vosk), limited to the logger's spoken words.
const Voice = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js';
  const MODEL = 'https://dashkto.github.io/voice-model/vosk-model-small-en-us-0.15.tar.gz';

  const UNITS = {zero:0, oh:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9};
  const TEENS = {ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19};
  const TENS = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90};
  const VOCAB = [...Object.keys(UNITS), ...Object.keys(TEENS), ...Object.keys(TENS),
    'hundred', 'mob', 'miss', 'next', 'undo', 'scratch', 'pause', 'resume'];

  // One number group: "twenty two", "fifteen", "five", "one hundred fifteen".
  function readGroup(t, i){
    let v = null, j = i;
    const w = t[j];
    if (w in TENS) { v = TENS[w]; j++; if (UNITS[t[j]] > 0) v += UNITS[t[j++]]; }
    else if (w in TEENS) { v = TEENS[w]; j++; }
    else if (w in UNITS) { v = UNITS[w]; j++; }
    if (v === null) return null;
    if (t[j] === 'hundred' && v < 10) {
      v *= 100; j++;
      const rest = t[j] !== undefined ? readGroup(t, j) : null;
      if (rest && rest.value < 100) { v += rest.value; j = rest.next; }
    }
    return {value: v, next: j};
  }

  // Consecutive groups join as digits: "one fifteen" -> 115, "one five" -> 15.
  function readNumber(t, i){
    let s = '', j = i, g;
    while (j < t.length && (g = readGroup(t, j))) { s += g.value; j = g.next; }
    return s ? {value: parseInt(s, 10), next: j} : null;
  }

  // Spoken words -> logger tokens ("14", "m", "-22", "-m", "n", "u", "pause", "resume").
  function toTokens(text){
    const t = text.toLowerCase().split(/\s+/).filter(Boolean);
    const tokens = [], junk = [];
    for (let i = 0; i < t.length;) {
      const w = t[i];
      if (w === 'mob') {
        if (t[i+1] === 'miss') { tokens.push('-m'); i += 2; continue; }
        const n = readNumber(t, i + 1);
        if (n) { tokens.push('-' + n.value); i = n.next; continue; }
      }
      else if (w === 'miss') { tokens.push('m'); i++; continue; }
      else if (w === 'next') { tokens.push('n'); i++; continue; }
      else if (w === 'undo' || w === 'scratch') { tokens.push('u'); i++; continue; }
      else if (w === 'pause' || w === 'resume') { tokens.push(w); i++; continue; }
      else {
        const n = readNumber(t, i);
        if (n) { tokens.push(String(n.value)); i = n.next; continue; }
      }
      junk.push(w); i++;
    }
    return {tokens, junk};
  }

  let model, rec, ctx, stream, h;
  // A phrase ends once the partial transcript hasn't changed for this long (Vosk's own cutoff is ~500 ms).
  let endMs = 300;
  let partial = '', partialAt = 0, held = '', heldTimer, finalizing = false;
  // Phrases ending like this may be unfinished ("mob …", "twenty …"), so they get extra time.
  const OPEN_END = /(^|\s)(mob|hundred|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/;
  const OPEN_MS = 1000;

  function emit(text){
    clearTimeout(heldTimer);
    if (held) text = held + ' ' + text;
    held = '';
    if (OPEN_END.test(text)) {
      held = text;
      heldTimer = setTimeout(() => { const t = held; held = ''; if (t) h.onResult(t); }, OPEN_MS);
      return;
    }
    h.onResult(text);
  }

  const loadScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load the speech library'));
    document.head.appendChild(s);
  });

  // handlers: onState(state, detail), onPartial(text), onResult(text)
  async function start(handlers){
    h = handlers;
    try {
      h.onState('loading', 'Starting microphone…');
      stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
      if (!window.Vosk) { h.onState('loading', 'Loading speech library…'); await loadScript(LIB); }
      if (!model) { h.onState('loading', 'Loading voice model (41 MB the first time, then cached)…'); model = await Vosk.createModel(MODEL); }
      ctx = new AudioContext();
      await ctx.resume();
      rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...VOCAB, '[unk]']));
      rec.on('result', m => {
        partial = ''; finalizing = false;
        const t = (m.result.text || '').replace(/\[unk\]/g, '').replace(/\s+/g, ' ').trim();
        if (t) emit(t);
      });
      rec.on('partialresult', m => {
        // Partials queued before a forced cutoff describe audio already finalized.
        if (finalizing) return;
        const p = (m.result.partial || '').replace(/\[unk\]/g, '').trim();
        if (p !== partial) { partial = p; partialAt = performance.now(); h.onPartial(p); }
      });
      const node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = e => {
        try {
          rec?.acceptWaveform(e.inputBuffer);
          const wait = OPEN_END.test(partial) ? Math.max(endMs, 600) : endMs;
          if (partial && !finalizing && performance.now() - partialAt >= wait) { partial = ''; finalizing = true; rec.retrieveFinalResult(); }
        } catch (err) { console.error(err); }
      };
      ctx.createMediaStreamSource(stream).connect(node);
      node.connect(ctx.destination);
      h.onState('listening');
    } catch (err) {
      console.error(err);
      stop(false);
      h.onState('error', err.name === 'NotAllowedError' ? 'Microphone access was blocked.' : (err.message || String(err)));
    }
  }

  function stop(report = true){
    stream?.getTracks().forEach(t => t.stop());
    ctx?.close();
    rec?.remove();
    stream = ctx = rec = null;
    clearTimeout(heldTimer); held = ''; partial = ''; finalizing = false;
    if (report) h?.onState('off');
  }

  // Short tones so you can hear what was logged without looking.
  let beepCtx;
  function beep(freq, ms, volume = 0.6){
    try {
      beepCtx ||= new AudioContext();
      const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t = beepCtx.currentTime;
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(Math.max(0.001, volume * 0.8), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
      o.connect(g).connect(beepCtx.destination);
      o.start(t); o.stop(t + ms / 1000);
    } catch (e) {}
  }

  return {start, stop, toTokens, beep, get on(){ return !!rec || !!stream; }, set endMs(v){ endMs = v; }};
})();
