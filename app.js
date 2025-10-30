(() => {
  // --- Get Elements ---
  const videoEl = document.getElementById('video');
  const canvasEl = document.getElementById('canvas');
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  const modeLabel = document.getElementById('modeLabel');

  // Controls we are keeping
  const switchBtn = document.getElementById('switchCameraBtn');
  const captureBtn = document.getElementById('captureBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  
  // --- State Variables ---
  // 1. REMOVED "RAW" mode
  const FilterMode = ['RED FILTER', 'BLUE FILTER'];
  let currentModeIndex = 0;
  let currentStream = null;
  let usingEnvironment = true;
  let lastCaptureDataUrl = null;
  let rafId = null; // requestAnimationFrame ID

  // Touch controls for swiping
  let touchStartX = 0; 
  let touchStartY = 0;
  let touchActive = false;

  // --- Core Functions ---

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
        usingEnvironment = false; // Fallback
      }
    }

    videoEl.srcObject = currentStream;
    await videoEl.play().catch(() => {});

    // 2. REMOVED calls to setupTorchCapability() and setupZoomCapability()
    
    setCanvasSizeToView();
    renderLoop();
  }

  // 3. ENTIRELY NEW (and correct) filter logic
  function applyFilterToPixels(data, mode) {
    const len = data.length;

    if (mode === 'RED FILTER') {
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Calculate a better "average" (luminance)
        const avg = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = avg;     // Set Red channel
        data[i + 1] = 0;   // Zero out Green
        data[i + 2] = 0;   // Zero out Blue
      }
    } else if (mode === 'BLUE FILTER') {
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Calculate a better "average" (luminance)
        const avg = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = 0;       // Zero out Red
        data[i + 1] = 0;   // Zero out Green
        data[i + 2] = avg;     // Set Blue channel
      }
    }
  }

  function renderLoop() {
    const cw = canvasEl.width;
    const ch = canvasEl.height;

    // --- Aspect-ratio correct drawing ---
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
    // --- End aspect-ratio logic ---

    ctx.drawImage(videoEl, dx, dy, renderW, renderH);

    // 4. UPDATED to always apply a filter (no "RAW" mode)
    const mode = FilterMode[currentModeIndex];
    const imgData = ctx.getImageData(0, 0, cw, ch);
    // 5. REMOVED intensity slider value
    applyFilterToPixels(imgData.data, mode);
    ctx.putImageData(imgData, 0, 0);

    rafId = requestAnimationFrame(renderLoop);
  }

  // --- Touch Controls ---
  function onTouchStart(ev) {
    const t = ev.changedTouches[0];
    touchActive = true; 
    touchStartX = t.clientX; 
    touchStartY = t.clientY;
  }
  function onTouchEnd(ev) {
    if (!touchActive) return; 
    touchActive = false;
    const t = ev.changedTouches[0];
    const dx = t.clientX - touchStartX; 
    const dy = t.clientY - touchStartY;
    // Check for a horizontal swipe
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) cycleMode(+1); // Swipe Right
      else cycleMode(-1); // Swipe Left
    }
  }

  // --- Event Listeners ---
  switchBtn.addEventListener('click', async () => {
    usingEnvironment = !usingEnvironment;
    await startCamera();
  });

  // 6. REMOVED torch, zoom, and intensity listeners

  captureBtn.addEventListener('click', () => {
    try {
      const exportCanvas = document.createElement('canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      exportCanvas.width = w; 
      exportCanvas.height = h;
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

  // Window resize/orientation listeners
  window.addEventListener('resize', () => setCanvasSizeToView());
  window.addEventListener('orientationchange', () => setTimeout(setCanvasSizeToView, 200));

  // Swipe gesture listeners
  const app = document.getElementById('app');
  app.addEventListener('touchstart', onTouchStart, { passive: true });
  app.addEventListener('touchend', onTouchEnd, { passive: true });

  // --- Initialization ---
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
    showModeLabel(); // Show the first mode ("RED FILTER")
  }

  // Pause rendering when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else {
      if (!rafId) renderLoop();
    }
  });

  init();
})();
