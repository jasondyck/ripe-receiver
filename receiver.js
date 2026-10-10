// ripe receiver: plays ripe's WAV stream and shows what the iPhone is playing.
//
// ripe (the AirPlay -> Cast bridge) sends NOW_PLAYING messages on our
// namespace whenever the track, cover, progress or sender changes, and the
// same object as `customData` on every LOAD. Messages carry title/artist/
// album/art only once ripe trusts them (iOS first sends stale info from the
// previous Now Playing app); until then the screen shows who is casting.
//
// Open with ?demo to preview the layout in a desktop browser.

(() => {
  "use strict";

  const NS = "urn:x-cast:com.jasondyck.ripe";
  const $ = (id) => document.getElementById(id);
  const audio = $("player");

  const state = {
    sender: null,
    title: null,
    artist: null,
    album: null,
    art: null,
    positionMs: null, // as of `at`, at the live edge
    durationMs: null,
    at: 0,
    pausedAt: null,
  };

  // ---------- rendering ----------

  function setText(el, text) {
    if (el.textContent !== (text || "")) el.textContent = text || "";
  }

  function render(fresh) {
    const hasTrack = Boolean(state.title);
    document.body.classList.toggle("idle", !hasTrack);

    setText($("waiting-name"), state.sender || "AirPlay");
    setText($("title"), state.title);
    setText($("artist"), state.artist);
    setText($("album"), state.album);
    setText($("credit"), state.sender ? `Playing from ${state.sender}` : "ripe");

    if (fresh) {
      // Restart the staggered entrance for a new track.
      document.body.classList.remove("fresh");
      void document.body.offsetWidth;
      document.body.classList.add("fresh");
    }
    renderTime();
  }

  function setArt(url) {
    const img = $("art");
    const blobs = document.querySelectorAll(".blob");
    if (!url) {
      document.body.classList.remove("has-art");
      img.removeAttribute("src");
      delete img.dataset.src;
      blobs.forEach((b) => { b.style.backgroundImage = ""; });
      return;
    }
    if (img.dataset.src === url) return;
    img.dataset.src = url;
    img.onload = () => {
      document.body.classList.add("has-art");
      blobs.forEach((b) => { b.style.backgroundImage = `url("${url}")`; });
      tintFrom(img);
    };
    img.onerror = () => document.body.classList.remove("has-art");
    img.src = url;
  }

  // Average colour of the cover, kept dark enough for white text.
  function tintFrom(img) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 12;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0, 12, 12);
      const d = g.getImageData(0, 0, 12, 12).data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const max = Math.max(d[i], d[i + 1], d[i + 2]);
        const min = Math.min(d[i], d[i + 1], d[i + 2]);
        const w = 0.2 + (max - min) / 255; // favour saturated pixels
        r += d[i] * w; gr += d[i + 1] * w; b += d[i + 2] * w; n += w;
      }
      let rgb = [r / n, gr / n, b / n];
      const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
      const k = lum > 90 ? 90 / lum : 1;
      // Bright covers make a bright glow: tone it down (0.9 dark ... 0.3 white).
      const glow = Math.max(0.3, Math.min(0.9, 0.9 - (lum - 110) / 200));
      document.documentElement.style.setProperty("--glow", glow.toFixed(2));
      rgb = rgb.map((v) => Math.round(Math.min(255, v * k)));
      document.documentElement.style.setProperty("--tint", rgb.join(" "));
    } catch (_) {
      // Cover served without CORS: keep the default tint.
    }
  }

  // ---------- timeline ----------

  // How far behind the live edge playback is: what's downloaded but unplayed.
  function lagMs() {
    const b = audio.buffered;
    if (!b || !b.length) return 0;
    return Math.max(0, (b.end(b.length - 1) - audio.currentTime) * 1000);
  }

  function currentMs() {
    if (state.positionMs == null) return null;
    const until = state.pausedAt ?? performance.now();
    return Math.max(0, state.positionMs + (until - state.at) - lagMs());
  }

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  };

  function renderTime() {
    const pos = currentMs();
    const dur = state.durationMs;
    const ok = pos != null && dur > 0 && state.title;
    $("timeline").hidden = !ok;
    if (!ok) return;
    const p = Math.min(pos, dur);
    const pct = `${(p / dur) * 100}%`;
    $("fill").style.width = pct;
    setText($("pos"), fmt(p));
    setText($("dur"), `-${fmt(dur - p)}`); // remaining, like Apple
  }

  setInterval(renderTime, 250);

  // Catch up with the live edge. Playback can start seconds behind (the
  // start-of-song replay, the player's buffering); drift back by playing 4%
  // fast, pitch preserved, until about a second of audio is left in hand.
  const CATCH_UP_ABOVE_MS = 1500;
  const SETTLE_BELOW_MS = 1000;
  audio.preservesPitch = true;
  setInterval(() => {
    if (audio.paused) return;
    const lag = lagMs();
    if (lag > CATCH_UP_ABOVE_MS && audio.playbackRate === 1) audio.playbackRate = 1.04;
    else if (lag < SETTLE_BELOW_MS && audio.playbackRate !== 1) audio.playbackRate = 1;
  }, 1000);
  // A new LOAD resets the rate; start from normal speed.
  audio.addEventListener("loadstart", () => { audio.playbackRate = 1; });

  audio.addEventListener("pause", () => {
    state.pausedAt ??= performance.now();
    document.body.classList.add("paused");
  });
  audio.addEventListener("playing", () => {
    document.body.classList.remove("paused");
    if (state.pausedAt != null) {
      state.at += performance.now() - state.pausedAt;
      state.pausedAt = null;
    }
  });

  // ---------- updates from ripe ----------

  // `quiet`: update the screen only. Used inside the LOAD interceptor, where
  // touching the player's media info can stall the LOAD itself.
  function apply(msg, quiet = false) {
    if (!msg || typeof msg !== "object") return;
    const before = state.title;
    if ("sender" in msg) state.sender = msg.sender || null;
    if ("title" in msg) {
      state.title = msg.title || null;
      state.artist = msg.artist || null;
      state.album = msg.album || null;
      state.art = msg.art || null;
    } else if (msg.type === "NOW_PLAYING") {
      // Not trusted yet: show who's casting, not stale track info.
      state.title = state.artist = state.album = state.art = null;
    }
    if (msg.position_ms != null) {
      state.positionMs = msg.position_ms;
      state.at = performance.now();
      if (state.pausedAt != null) state.pausedAt = state.at;
    }
    if ("duration_ms" in msg) state.durationMs = msg.duration_ms || null;

    setArt(state.art);
    render(state.title && state.title !== before);
    if (!quiet) publish();
  }

  // ---------- Cast ----------

  const cast = window.cast;
  const onCast = cast && cast.framework && !new URLSearchParams(location.search).has("demo");
  let context = null;

  // Track info for the Cast session. Smart displays (Nest Hub) show it in
  // Google's own music player on top of this page; TVs show our page.
  function musicMetadata() {
    const md = new cast.framework.messages.MusicTrackMediaMetadata();
    md.title = state.title || state.sender || "ripe";
    md.artist = state.artist || undefined;
    md.albumName = state.album || undefined;
    if (state.art) md.images = [new cast.framework.messages.Image(state.art)];
    return md;
  }

  // Mirror the info into the Cast session (Google Home app, other senders).
  function publish() {
    if (!context) return;
    try {
      context.setApplicationState(state.sender ? `Playing from ${state.sender}` : "ripe");
      const pm = context.getPlayerManager();
      const info = pm.getMediaInformation();
      if (info && state.title) {
        info.metadata = musicMetadata();
        pm.setMediaInformation(info, true);
      }
    } catch (e) {
      console.warn("ripe: publish failed", e);
    }
  }

  if (onCast) {
    context = cast.framework.CastReceiverContext.getInstance();
    const pm = context.getPlayerManager();
    pm.setMediaElement(audio);

    pm.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (req) => {
      const media = req.media || {};
      if (media.customData) {
        apply(media.customData, true);
        media.metadata = musicMetadata();
      } else {
        const md = media.metadata || {};
        apply({
          title: md.title,
          artist: md.artist,
          album: md.albumName,
          art: md.images && md.images[0] && md.images[0].url,
        }, true);
      }
      return req;
    });

    const options = new cast.framework.CastReceiverOptions();
    options.customNamespaces = { [NS]: cast.framework.system.MessageType.JSON };
    options.skipPlayersLoad = true; // plain WAV: no Shaka/MPL needed
    options.statusText = "ripe";
    context.addCustomMessageListener(NS, (event) => apply(event.data));
    context.start(options);
  } else {
    // ?demo: preview in a desktop browser (&static: no transitions, for screenshots).
    const p = new URLSearchParams(location.search);
    if (p.has("static")) document.documentElement.classList.add("static");
    apply({ type: "NOW_PLAYING", sender: p.get("sender") || "iPhone" });
    if (p.get("demo") !== "idle") {
      apply({
        type: "NOW_PLAYING",
        sender: p.get("sender") || "iPhone",
        title: p.get("title") || "Song Title",
        artist: p.get("artist") || "Artist",
        album: p.get("album") || "Album",
        art: p.get("art") || null,
        position_ms: 83000,
        duration_ms: 245000,
      });
    }
  }
})();
