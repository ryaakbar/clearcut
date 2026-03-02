// ============================================
//   CLEARCUT — Frontend Script
//   Features: drag&drop, paste, batch upload,
//   before/after slider, multi-format download
// ============================================

// ---- STATE ----
let uploadedFiles = [];     // { id, file, thumb, status, resultB64, resultName }
let modalData = null;       // currently open result
let downloadFmt = 'png';    // selected download format
let sliderDragging = false;
let idCounter = 0;

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
    initUploadZone();
    initSlider();
    initReveal();
    initPasteFromClipboard();
});

// ============================================
// UPLOAD ZONE
// ============================================
function initUploadZone() {
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('fileInput');

    // Click to upload
    zone.addEventListener('click', (e) => {
        if (e.target.classList.contains('upload-link') || e.target.id === 'fileInput') return;
        if (uploadedFiles.length === 0) input.click();
    });

    // File input change
    input.addEventListener('change', () => {
        addFiles(Array.from(input.files));
        input.value = '';
    });

    // Drag events
    ['dragenter','dragover'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            zone.classList.add('hover');
            document.getElementById('dragOverlay').classList.remove('hidden');
        });
    });

    ['dragleave','dragend'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            if (!zone.contains(e.relatedTarget)) {
                zone.classList.remove('hover');
                document.getElementById('dragOverlay').classList.add('hidden');
            }
        });
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('hover');
        document.getElementById('dragOverlay').classList.add('hidden');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length) addFiles(files);
        else showToast('⚠️ Only image files are supported');
    });

    // Also allow drop on body
    document.body.addEventListener('dragover', (e) => e.preventDefault());
}

// Paste from clipboard
function initPasteFromClipboard() {
    document.addEventListener('paste', async (e) => {
        const items = Array.from(e.clipboardData?.items || []);
        const imageItems = items.filter(item => item.type.startsWith('image/'));
        if (!imageItems.length) return;
        const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
        if (files.length) {
            addFiles(files);
            showToast('📋 Image pasted from clipboard!');
        }
    });
}

function addMoreFiles() {
    document.getElementById('fileInput').click();
}

// ============================================
// FILE MANAGEMENT
// ============================================
const MAX_FILES = 5;
const MAX_SIZE  = 10 * 1024 * 1024; // 10MB
const ALLOWED   = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];

function addFiles(files) {
    const remaining = MAX_FILES - uploadedFiles.length;
    if (remaining <= 0) {
        showToast(`⚠️ Max ${MAX_FILES} images per batch`);
        return;
    }

    const toAdd = files.slice(0, remaining);
    const skipped = files.length - toAdd.length;

    toAdd.forEach(file => {
        if (!ALLOWED.includes(file.type)) {
            showToast(`❌ ${file.name}: Unsupported format`);
            return;
        }
        if (file.size > MAX_SIZE) {
            showToast(`❌ ${file.name}: File too large (max 10MB)`);
            return;
        }
        const id = ++idCounter;
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedFiles.push({ id, file, thumb: e.target.result, status: 'ready', resultB64: null, resultName: null });
            renderQueue();
        };
        reader.readAsDataURL(file);
    });

    if (skipped > 0) showToast(`⚠️ ${skipped} file(s) skipped (max ${MAX_FILES})`);
}

function removeFile(id) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== id);
    renderQueue();
}

function clearAll() {
    uploadedFiles = [];
    renderQueue();
    document.getElementById('resultsSection').classList.add('hidden');
}

function renderQueue() {
    const queue = document.getElementById('batchQueue');
    const list = document.getElementById('queueList');
    const countEl = document.getElementById('batchCount');
    const infoEl = document.getElementById('processInfo');

    if (!uploadedFiles.length) {
        queue.classList.add('hidden');
        return;
    }

    queue.classList.remove('hidden');
    countEl.textContent = `${uploadedFiles.length} image${uploadedFiles.length > 1 ? 's' : ''} ready`;
    infoEl.textContent = `${uploadedFiles.length} image${uploadedFiles.length > 1 ? 's' : ''} will be processed`;

    list.innerHTML = uploadedFiles.map(item => `
        <div class="queue-item" id="qi-${item.id}">
            <img class="qi-thumb" src="${item.thumb}" alt="">
            <div class="qi-info">
                <div class="qi-name">${escHtml(item.file.name || 'Pasted image')}</div>
                <div class="qi-meta">${fmtSize(item.file.size)} · ${item.file.type.split('/')[1].toUpperCase()}</div>
            </div>
            <div class="qi-status">
                ${statusBadge(item.status)}
            </div>
            ${item.status === 'ready' || item.status === 'error' ? `
                <button class="qi-remove" onclick="removeFile(${item.id})" title="Remove">
                    <i class="fa-solid fa-xmark"></i>
                </button>` : ''}
        </div>
    `).join('');

    // Update process button state
    const btn = document.getElementById('processBtn');
    const allDone = uploadedFiles.every(f => f.status === 'done');
    const anyLoading = uploadedFiles.some(f => f.status === 'loading');
    btn.disabled = anyLoading || allDone;
}

function statusBadge(status) {
    const map = {
        ready:   `<span class="qi-badge ready"><i class="fa-solid fa-circle-dot"></i> Ready</span>`,
        loading: `<span class="qi-badge loading"><i class="fa-solid fa-circle-notch spin"></i> Processing</span>`,
        done:    `<span class="qi-badge done"><i class="fa-solid fa-check"></i> Done</span>`,
        error:   `<span class="qi-badge error"><i class="fa-solid fa-xmark"></i> Failed</span>`,
    };
    return map[status] || '';
}

// ============================================
// PROCESS / API CALL
// ============================================
async function processAll() {
    const toProcess = uploadedFiles.filter(f => f.status === 'ready' || f.status === 'error');
    if (!toProcess.length) return;

    // Set all to loading
    toProcess.forEach(f => { f.status = 'loading'; });
    renderQueue();
    document.getElementById('processBtn').disabled = true;
    document.getElementById('processInfo').textContent = 'Processing...';

    // Build FormData
    const formData = new FormData();
    toProcess.forEach(item => {
        formData.append('images', item.file, item.file.name || `image_${item.id}.png`);
    });

    try {
        const res = await fetch('/api/remove', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Processing failed');
        }

        // Map results back to files by index
        const results  = data.results || [];
        const errors   = data.errors  || [];

        results.forEach((r, i) => {
            const item = toProcess[i];
            if (item) {
                item.status     = 'done';
                item.resultB64  = r.data;
                item.resultName = r.name;
                item.resultSize = r.size;
            }
        });

        // Mark failures
        errors.forEach(err => {
            const item = toProcess.find(f => f.file.name === err.name);
            if (item) item.status = 'error';
        });

        // Fallback: if counts match perfectly
        if (!results.length && !errors.length) {
            toProcess.forEach(f => { f.status = 'error'; });
        }

        renderQueue();
        renderResults();

    } catch (err) {
        toProcess.forEach(f => { f.status = 'error'; });
        renderQueue();
        showToast('❌ ' + err.message);
        document.getElementById('processBtn').disabled = false;
        document.getElementById('processInfo').textContent = 'Some images failed. Try again.';
    }
}

// ============================================
// RESULTS
// ============================================
function renderResults() {
    const done = uploadedFiles.filter(f => f.status === 'done');
    const failed = uploadedFiles.filter(f => f.status === 'error');

    if (!done.length) return;

    const section = document.getElementById('resultsSection');
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('resultsCount').textContent =
        `${done.length} image${done.length > 1 ? 's' : ''} processed`;

    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = done.map(item => `
        <div class="result-card">
            <div class="result-img-wrap" onclick="openModal(${item.id})">
                <img class="result-img" src="data:image/png;base64,${item.resultB64}" alt="${escHtml(item.resultName || '')}">
                <div class="result-overlay">
                    <button class="result-action-btn" title="Compare before/after">
                        <i class="fa-solid fa-sliders"></i>
                    </button>
                </div>
            </div>
            <div class="result-info">
                <div class="result-name">${escHtml(item.resultName || 'result.png')}</div>
                <div class="result-size">${fmtSize(item.resultSize || 0)} · Transparent PNG</div>
                <div class="result-dl-row">
                    <button class="result-dl-btn" onclick="downloadSingle(${item.id},'png')">PNG</button>
                    <button class="result-dl-btn" onclick="downloadSingle(${item.id},'jpg')">JPG</button>
                    <button class="result-dl-btn" onclick="downloadSingle(${item.id},'webp')">WebP</button>
                </div>
            </div>
        </div>
    `).join('');

    // Errors block
    const errorsBlock = document.getElementById('errorsBlock');
    if (failed.length) {
        errorsBlock.classList.remove('hidden');
        document.getElementById('errorsList').innerHTML = failed.map(f =>
            `<div class="error-item"><i class="fa-solid fa-xmark" style="color:var(--red);margin-right:6px"></i>${escHtml(f.file.name)}</div>`
        ).join('');
    } else {
        errorsBlock.classList.add('hidden');
    }
}

function resetTool() {
    uploadedFiles = [];
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('batchQueue').classList.add('hidden');
    document.getElementById('processBtn').disabled = false;
    showToast('🔄 Ready for new images!');
}

// ============================================
// DOWNLOAD
// ============================================
async function downloadSingle(id, fmt = 'png') {
    const item = uploadedFiles.find(f => f.id === id);
    if (!item?.resultB64) return;

    const blob = await b64ToBlob(item.resultB64, fmt);
    const baseName = item.resultName?.replace(/\.[^/.]+$/, '') || 'clearcut_result';
    triggerDownload(blob, `${baseName}.${fmt}`);
    showToast(`✅ Downloaded as ${fmt.toUpperCase()}`);
}

async function downloadAll() {
    const done = uploadedFiles.filter(f => f.status === 'done' && f.resultB64);
    if (!done.length) return;

    for (const item of done) {
        const blob = await b64ToBlob(item.resultB64, downloadFmt);
        const baseName = item.resultName?.replace(/\.[^/.]+$/, '') || 'clearcut_result';
        triggerDownload(blob, `${baseName}.${downloadFmt}`);
        await sleep(120); // slight delay to avoid browser blocking
    }
    showToast(`✅ Downloaded ${done.length} images`);
}

async function downloadModal() {
    if (!modalData) return;
    const blob = await b64ToBlob(modalData.resultB64, downloadFmt);
    const baseName = modalData.resultName?.replace(/\.[^/.]+$/, '') || 'clearcut_result';
    triggerDownload(blob, `${baseName}.${downloadFmt}`);
    showToast(`✅ Downloaded as ${downloadFmt.toUpperCase()}`);
}

async function b64ToBlob(b64, fmt) {
    const dataUrl = `data:image/png;base64,${b64}`;

    if (fmt === 'png') {
        const res = await fetch(dataUrl);
        return res.blob();
    }

    // Convert to JPG/WebP via canvas
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width  = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (fmt === 'jpg') {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            const mimeType = fmt === 'webp' ? 'image/webp' : 'image/jpeg';
            canvas.toBlob(resolve, mimeType, 0.95);
        };
        img.src = dataUrl;
    });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function setDownloadFmt(fmt) {
    downloadFmt = fmt;
    document.querySelectorAll('.dl-btn').forEach(b => b.classList.toggle('active', b.dataset.fmt === fmt));
}

// ============================================
// COMPARE MODAL
// ============================================
function openModal(id) {
    const item = uploadedFiles.find(f => f.id === id);
    if (!item?.resultB64) return;
    modalData = item;

    document.getElementById('modalTitle').textContent = item.file.name || 'Before / After';
    document.getElementById('sliderBeforeImg').src = item.thumb;
    document.getElementById('sliderAfterImg').src  = `data:image/png;base64,${item.resultB64}`;

    // Reset slider to 50%
    setSliderPos(50);
    setPreviewBg('checker');
    setDownloadFmt('png');

    document.getElementById('modalOverlay').classList.remove('hidden');
    document.getElementById('compareModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('compareModal').classList.add('hidden');
    document.body.style.overflow = '';
    modalData = null;
}

// Keyboard close
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ---- BEFORE/AFTER SLIDER ----
function initSlider() {
    const wrap   = document.getElementById('sliderWrap');
    const handle = document.getElementById('sliderHandle');
    if (!wrap || !handle) return;

    const getPos = (e) => {
        const rect = wrap.getBoundingClientRect();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        return Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100));
    };

    wrap.addEventListener('mousedown', (e) => { sliderDragging = true; setSliderPos(getPos(e)); });
    wrap.addEventListener('touchstart', (e) => { sliderDragging = true; setSliderPos(getPos(e)); }, {passive:true});
    document.addEventListener('mousemove', (e) => { if (sliderDragging) setSliderPos(getPos(e)); });
    document.addEventListener('touchmove', (e) => { if (sliderDragging) setSliderPos(getPos(e)); }, {passive:true});
    document.addEventListener('mouseup',   () => { sliderDragging = false; });
    document.addEventListener('touchend',  () => { sliderDragging = false; });
}

function setSliderPos(pct) {
    const before = document.getElementById('sliderBefore');
    const handle = document.getElementById('sliderHandle');
    if (!before || !handle) return;
    before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.left = pct + '%';
}

// ---- PREVIEW BACKGROUND ----
function setPreviewBg(bg) {
    const wrap = document.getElementById('sliderWrap');
    if (!wrap) return;

    document.querySelectorAll('.bg-opt').forEach(b => b.classList.toggle('active', b.dataset.bg === bg));

    if (bg === 'checker') {
        wrap.style.background = '';
        wrap.style.backgroundImage = `
            linear-gradient(45deg,#1a1a1a 25%,transparent 25%),
            linear-gradient(-45deg,#1a1a1a 25%,transparent 25%),
            linear-gradient(45deg,transparent 75%,#1a1a1a 75%),
            linear-gradient(-45deg,transparent 75%,#1a1a1a 75%)`;
        wrap.style.backgroundSize = '20px 20px';
        wrap.style.backgroundPosition = '0 0,0 10px,10px -10px,-10px 0';
        wrap.style.backgroundColor = '#222';
    } else {
        wrap.style.backgroundImage = 'none';
        wrap.style.background = bg;
    }
}

// ============================================
// HOW IT WORKS REVEAL
// ============================================
function initReveal() {
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ============================================
// UTILS
// ============================================
function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let toastTimer;
function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
