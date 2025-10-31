(() => {
  const videoEl = document.getElementById('video');
  const canvasEl = document.getElementById('canvas');
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  const modeLabel = document.getElementById('modeLabel');

  const switchBtn = document.getElementById('switchCameraBtn');
  const torchBtn = document.getElementById('torchBtn');
  const zoomSlider = document.getElementById('zoomSlider');
  const intensitySlider = document.getElementById('intensitySlider');
  const captureBtn = document.getElementById('captureBtn');
  const downloadBtn = document.getElementById('downloadBtn');

  const FilterMode = ['RAW', 'RED FILTER', 'BLUE FILTER'];
  let currentModeIndex = 0;
  let currentStream = null;
  let usingEnvironment = true;
  let torchEnabled = false;
  let lastCaptureDataUrl = null;
  let rafId = null;

  let touchStartX = 0, touchStartY = 0, touchActive = false;

  function setCanvasSizeToView() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);
    if (canvasEl.width !== width || canvasEl.height !== height) {
      canvasEl.width = width;
      canvasEl.height = height;
    }
  }

  function showModeLabel() {
    modeLabel.textContent = FilterMode[currentModeIndex];
    modeLabel.classList.remove('hidden');
    canvasEl.classList.add('fade');
    setTimeout(() => { canvasEl.classList.remove('fade'); }, 240);
    clearTimeout(showModeLabel._t);
    showModeLabel._t = setTimeout(() => modeLabel.classList.add('hidden'), 1200);
  }

  function cycleMode(delta) {
    const len = FilterMode.length;
    currentModeIndex = (currentModeIndex + delta + len) % len;
    showModeLabel();
  }

  function stopStream() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
  }

  async function startCamera() {
    stopStream();
    const idealFacing = usingEnvironment ? 'environment' : 'user';
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: idealFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 60 }
      }
    };
    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e1) {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: idealFacing } }, audio: false });
      } catch (e2) {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        usingEnvironment = false;
      }
    }

    videoEl.srcObject = currentStream;
    await videoEl.play().catch(() => {});

    setupTorchCapability();
    setupZoomCapability();

    setCanvasSizeToView();
    renderLoop();
  }

  function setupTorchCapability() {
    torchEnabled = false;
    torchBtn.disabled = true;
    try {
      const track = currentStream?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities?.();
      if (caps && 'torch' in caps) {
        torchBtn.disabled = false;
      }
    } catch {}
  }

  function setupZoomCapability() {
    zoomSlider.disabled = true;
    zoomSlider.min = '1';
    zoomSlider.max = '1';
    zoomSlider.value = '1';
    try {
      const track = currentStream?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities?.();
      const settings = track?.getSettings?.();
      if (caps && caps.zoom) {
        const min = caps.zoom.min ?? 1;
        const max = caps.zoom.max ?? 1;
        const step = caps.zoom.step ?? 0.1;
        zoomSlider.min = String(min);
        zoomSlider.max = String(max);
        zoomSlider.step = String(step);
        zoomSlider.value = String(settings?.zoom ?? 1);
        zoomSlider.disabled = false;
      }
    } catch {}
  }

  // New robust filter: detect color-dominance per pixel and suppress detected ink pixels.
  // Intensity slider controls suppression strength and thresholding.
  function applyFilterToPixels(data, mode, intensity) {
  const len = data.length;
  const factor = Math.min(Math.max(intensity, 1.0), 1.6); // intensity safety
  const strength = (factor - 1.0) / 0.6; // normalized 0–1

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Luminance keeps paper brightness stable
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (mode === 'RED FILTER') {
      // Simulate red gelatin: let red pass, fade out blue ink
      const redDominant = r > b * 1.25 && r > g * 1.1; // detect red ink
      const blueDominant = b > r * 1.25 && b > g * 1.1; // detect blue ink

      if (redDominant) {
        // Fade red ink toward white instead of black
        const fade = 1 - strength;
        data[i] = lum + (r - lum) * fade; // move toward paper tone
        data[i + 1] = lum;
        data[i + 2] = lum;
      } else if (blueDominant) {
        // Enhance blue ink visibility slightly
        const boost = 1 + 0.8 * strength;
        data[i] = r * 0.7;
        data[i + 1] = g * 0.8;
        data[i + 2] = Math.min(255, b * boost);
      } else {
        // Neutral paper area
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }

    else if (mode === 'BLUE FILTER') {
      // Simulate blue gelatin: let blue pass, fade out red ink
      const redDominant = r > b * 1.25 && r > g * 1.1;
      const blueDominant = b > r * 1.25 && b > g * 1.1;

      if (blueDominant) {
        // Enhance blue ink
        const boost = 1 + 0.8 * strength;
        data[i] = r * 0.8;
        data[i + 1] = g * 0.9;
        data[i + 2] = Math.min(255, b * boost);
      } else if (redDominant) {
        // Fade red ink toward white (not black)
        const fade = 1 - strength;
        data[i] = lum + (r - lum) * fade;
        data[i + 1] = lum;
        data[i + 2] = lum;
      } else {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  }
}



  function renderLoop() {
    const cw = canvasEl.width;
    const ch = canvasEl.height;

    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    let renderW, renderH;
    if (videoAspect > canvasAspect) {
      renderH = ch; renderW = Math.round(ch * videoAspect);
    } else {
      renderW = cw; renderH = Math.round(cw / videoAspect);
    }
    const dx = Math.round((cw - renderW) / 2);
    const dy = Math.round((ch - renderH) / 2);

    ctx.drawImage(videoEl, dx, dy, renderW, renderH);

    const mode = FilterMode[currentModeIndex];
    if (mode !== 'RAW') {
      // read pixels and apply mask-based suppression
      try {
        const imgData = ctx.getImageData(0, 0, cw, ch);
        applyFilterToPixels(imgData.data, mode, parseFloat(intensitySlider.value));
        ctx.putImageData(imgData, 0, 0);
      } catch (err) {
        // some browsers restrict getImageData on cross-origin video; ignore
        // fallback: draw overlay tint (not preferred)
        // console.warn('getImageData failed', err);
      }
    }

    rafId = requestAnimationFrame(renderLoop);
  }

  function onTouchStart(ev) {
    const t = ev.changedTouches[0];
    touchActive = true; touchStartX = t.clientX; touchStartY = t.clientY;
  }
  function onTouchEnd(ev) {
    if (!touchActive) return; touchActive = false;
    const t = ev.changedTouches[0];
    const dx = t.clientX - touchStartX; const dy = t.clientY - touchStartY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) cycleMode(+1); else cycleMode(-1);
    }
  }

  switchBtn.addEventListener('click', async () => {
    usingEnvironment = !usingEnvironment;
    await startCamera();
  });

  torchBtn.addEventListener('click', async () => {
    try {
      const track = currentStream?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities?.();
      if (caps && 'torch' in caps) {
        torchEnabled = !torchEnabled;
        await track.applyConstraints({ advanced: [{ torch: torchEnabled }] });
      }
    } catch {}
  });

  zoomSlider.addEventListener('input', async () => {
    try {
      const track = currentStream?.getVideoTracks?.()[0];
      await track.applyConstraints({ advanced: [{ zoom: parseFloat(zoomSlider.value) }] });
    } catch {}
  });

  intensitySlider.addEventListener('input', () => { /* live effect uses value directly */ });

  captureBtn.addEventListener('click', () => {
    try {
      const exportCanvas = document.createElement('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      exportCanvas.width = w; exportCanvas.height = h;
      const ectx = exportCanvas.getContext('2d');
      ectx.drawImage(canvasEl, 0, 0, w, h);
      lastCaptureDataUrl = exportCanvas.toDataURL('image/png');
      downloadBtn.classList.remove('disabled');
      if (window.navigator?.vibrate) navigator.vibrate(30);
    } catch {}
  });

  downloadBtn.addEventListener('click', () => {
    if (!lastCaptureDataUrl) return;
    const a = document.createElement('a');
    a.href = lastCaptureDataUrl;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `capture-${FilterMode[currentModeIndex].replace(/\s+/g,'_').toLowerCase()}-${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  window.addEventListener('resize', () => setCanvasSizeToView());
  window.addEventListener('orientationchange', () => setTimeout(setCanvasSizeToView, 200));

  const app = document.getElementById('app');
  app.addEventListener('touchstart', onTouchStart, { passive: true });
  app.addEventListener('touchend', onTouchEnd, { passive: true });

  async function init() {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Camera not supported in this browser. Please use a modern mobile browser.');
      return;
    }
    setCanvasSizeToView();
    await startCamera().catch(err => {
      console.error(err);
      alert('Unable to access camera. Check permissions and HTTPS connection.');
    });
    showModeLabel();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      if (!rafId) renderLoop();
    }
  });

  init();
})();
