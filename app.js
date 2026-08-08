const TOKEN_KEY = 'check_session_token';

let IMAGES = [];
let META = { softValues: [], elegantValues: [], labels: [], labelCounts: {}, totalImages: 0 };
let PACKAGE_CONFIG = {};
let ratings = {};
let badPhotos = {};
let currentIndex = 0;
let saveTimer = null;
let listenersBound = false;
let accessCodeRequired = false;

const loginScreenEl = document.getElementById('login-screen');
const loginFormEl = document.getElementById('login-form');
const loginUserIdEl = document.getElementById('login-user-id');
const loginPackageEl = document.getElementById('login-package');
const loginAccessCodeEl = document.getElementById('login-access-code');
const accessCodeFieldEl = document.getElementById('access-code-field');
const loginErrorEl = document.getElementById('login-error');
const loginSubmitEl = document.getElementById('login-submit');

const outfitImg = document.getElementById('outfit-image');
const imgLoading = document.getElementById('image-loading');
const currentLabelEl = document.getElementById('current-label');
const currentRankEl = document.getElementById('current-rank');
const averageScoreEl = document.getElementById('average-score');
const totalCirclesEl = document.getElementById('total-circles');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const impressiveGrid = document.getElementById('impressive-grid');
const labelBreakdownList = document.getElementById('label-breakdown-list');
const yAxisScale = document.getElementById('y-axis-scale');
const xAxisScale = document.getElementById('x-axis-scale');
const labelBreakdownTitle = document.getElementById('label-breakdown-title');

const btnCross = document.getElementById('btn-cross');
const btnCircle = document.getElementById('btn-circle');
const btnBad = document.getElementById('btn-bad');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnExport = document.getElementById('btn-export');
const btnReset = document.getElementById('btn-reset');
const btnLogout = document.getElementById('btn-logout');
const errorLogoutEl = document.getElementById('error-logout');
const raterBadgeEl = document.getElementById('rater-badge');
const appLoadingEl = document.getElementById('app-loading');
const appErrorEl = document.getElementById('app-error');
const appErrorMessageEl = document.getElementById('app-error-message');
const appContainerEl = document.getElementById('app-container');

function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: authHeaders(options.headers || {}),
    });
    let data = null;
    const text = await res.text();
    if (text) {
        try {
            data = JSON.parse(text);
        } catch (_) {
            data = { error: text };
        }
    }
    if (!res.ok) {
        const message = (data && data.error) || `リクエストに失敗しました (${res.status})`;
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return data;
}

function getRaterId() {
    return PACKAGE_CONFIG.raterId || 'default';
}

function storageKey(suffix) {
    return `check_${getRaterId()}_${suffix}`;
}

function labelGroups() {
    const groups = {};
    IMAGES.forEach(img => {
        if (!groups[img.label]) groups[img.label] = [];
        groups[img.label].push(img.fileName);
    });
    return groups;
}

function maxRankForLabel(label) {
    return IMAGES.filter(img => img.label === label).length;
}

function applyPackageConfig() {
    const label = PACKAGE_CONFIG.raterLabel || PACKAGE_CONFIG.packageLabel;
    if (label) {
        raterBadgeEl.textContent = label;
        raterBadgeEl.hidden = false;
        document.title = `コーデ印象判定 — ${label}`;
    }
}

function showLogin() {
    loginScreenEl.hidden = false;
    appLoadingEl.hidden = true;
    appErrorEl.hidden = true;
    appContainerEl.hidden = true;
    accessCodeFieldEl.hidden = !accessCodeRequired;
    if (!accessCodeRequired) {
        loginAccessCodeEl.value = '';
    }
}

function showLoading() {
    if (loginScreenEl) loginScreenEl.hidden = true;
    appLoadingEl.hidden = false;
    appErrorEl.hidden = true;
    appContainerEl.hidden = true;
}

function showLoadError(message) {
    if (loginScreenEl) loginScreenEl.hidden = true;
    appLoadingEl.hidden = true;
    appErrorMessageEl.textContent = message;
    appErrorEl.hidden = false;
    appContainerEl.hidden = true;
}

function showLoginError(message) {
    loginErrorEl.textContent = message;
    loginErrorEl.hidden = !message;
}

async function loadPackagesIntoForm() {
    const data = await api('/api/packages');
    const packages = (data.packages || []).filter(p => p.available);
    accessCodeRequired = !!data.accessCodeRequired;
    loginPackageEl.innerHTML = '';

    if (packages.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '利用可能なパッケージがありません';
        loginPackageEl.appendChild(opt);
        loginSubmitEl.disabled = true;
        accessCodeFieldEl.hidden = !accessCodeRequired;
        return data;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '選択してください';
    loginPackageEl.appendChild(placeholder);

    packages.forEach(pkg => {
        const opt = document.createElement('option');
        opt.value = pkg.id;
        opt.textContent = pkg.label || pkg.id;
        loginPackageEl.appendChild(opt);
    });

    accessCodeFieldEl.hidden = !accessCodeRequired;
    loginSubmitEl.disabled = false;
    return data;
}

async function logout() {
    try {
        if (getToken()) await api('/api/logout', { method: 'POST' });
    } catch (_) {
        // ignore
    }
    setToken('');
    IMAGES = [];
    ratings = {};
    badPhotos = {};
    currentIndex = 0;
    PACKAGE_CONFIG = {};
    loginAccessCodeEl.value = '';
    showLoginError('');
    try {
        await loadPackagesIntoForm();
    } catch (err) {
        showLoginError(`パッケージ一覧の取得に失敗しました: ${err.message}`);
    }
    showLogin();
}

async function startSessionFromLogin(event) {
    event.preventDefault();
    showLoginError('');

    const userId = loginUserIdEl.value.trim();
    const packageId = loginPackageEl.value;
    if (!userId) {
        showLoginError('検証者IDを入力してください');
        return;
    }
    if (!packageId) {
        showLoginError('パッケージを選択してください（例: women_n0）');
        return;
    }

    loginSubmitEl.disabled = true;
    loginSubmitEl.textContent = '開始中...';

    try {
        const payload = {
            userId,
            packageId,
            accessCode: loginAccessCodeEl.value,
        };
        const data = await api('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        setToken(data.token);
        await initApp();
    } catch (err) {
        showLoginError(err.message);
        showLogin();
    } finally {
        loginSubmitEl.disabled = false;
        loginSubmitEl.textContent = '開始する';
    }
}

async function initApp() {
    showLoading();
    try {
        const [configRes, imagesRes] = await Promise.all([
            fetch('./config.json'),
            fetch('./images.json'),
        ]);

        if (!configRes.ok || !imagesRes.ok) {
            throw new Error('サイトのデータを取得できませんでした');
        }

        PACKAGE_CONFIG = await configRes.json();
        const payload = await imagesRes.json();
        IMAGES = payload.images || [];
        META = payload.meta || META;

        if (IMAGES.length === 0) {
            throw new Error('画像フォルダに有効な画像が見つかりません');
        }

        applyProgress();
        applyPackageConfig();
        buildCoordinateGrid();
        setupEventListeners();

        appLoadingEl.hidden = true;
        appContainerEl.hidden = false;
        render();
    } catch (err) {
        showLoadError(err.message);
    }
}

function applyProgress() {
    ratings = {};
    badPhotos = {};
    IMAGES.forEach(img => {
        ratings[img.fileName] = null;
        badPhotos[img.fileName] = false;
    });

    const savedRatings = JSON.parse(localStorage.getItem(storageKey('clothing_ratings')) || '{}');
    const savedBad = JSON.parse(localStorage.getItem(storageKey('bad_photos')) || '{}');

    Object.keys(savedRatings).forEach(fileName => {
        if (fileName in ratings) ratings[fileName] = savedRatings[fileName];
    });
    Object.keys(savedBad).forEach(fileName => {
        if (fileName in badPhotos) badPhotos[fileName] = !!savedBad[fileName];
    });

    const rawIndex = localStorage.getItem(storageKey('current_index'));
    const savedIndex = rawIndex === null ? null : Number.parseInt(rawIndex, 10);

    if (savedIndex !== null && savedIndex >= 0 && savedIndex < IMAGES.length) {
        currentIndex = savedIndex;
    } else {
        const firstUnrated = IMAGES.findIndex(img => ratings[img.fileName] === null);
        currentIndex = firstUnrated !== -1 ? firstUnrated : 0;
    }
}

function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 100);
}

async function saveProgress() {
    localStorage.setItem(storageKey('clothing_ratings'), JSON.stringify(ratings));
    localStorage.setItem(storageKey('bad_photos'), JSON.stringify(badPhotos));
    localStorage.setItem(storageKey('current_index'), String(currentIndex));
}

function buildCoordinateGrid() {
    const softValues = [...META.softValues].sort((a, b) => b - a);
    const elegantValues = [...META.elegantValues].sort((a, b) => a - b);

    yAxisScale.innerHTML = '';
    softValues.forEach((soft, i) => {
        const span = document.createElement('span');
        span.textContent = i === 0 ? `${soft} (Soft)` : String(soft);
        yAxisScale.appendChild(span);
    });

    xAxisScale.innerHTML = '';
    elegantValues.forEach((elegant, i) => {
        const span = document.createElement('span');
        span.textContent = i === elegantValues.length - 1 ? `${elegant} (Elegant)` : String(elegant);
        xAxisScale.appendChild(span);
    });

    impressiveGrid.innerHTML = '';
    impressiveGrid.style.gridTemplateColumns = `repeat(${elegantValues.length}, 1fr)`;

    softValues.forEach(soft => {
        elegantValues.forEach(elegant => {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.soft = soft;
            cell.dataset.elegant = elegant;
            cell.id = `cell-${soft}-${elegant}`;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'grid-cell-label';
            labelSpan.innerText = `${soft},${elegant}`;
            cell.appendChild(labelSpan);

            impressiveGrid.appendChild(cell);
        });
    });

    labelBreakdownTitle.textContent = `ラベル別の ◯ 獲得数 (${META.labels.length} ラベル)`;
}

function render() {
    if (IMAGES.length === 0) return;

    const currentImage = IMAGES[currentIndex];
    const labelTotal = maxRankForLabel(currentImage.label);

    imgLoading.style.display = 'block';
    outfitImg.classList.add('loading');
    outfitImg.src = currentImage.path;
    outfitImg.alt = `Coordinate Image for ${currentImage.label}`;

    outfitImg.onload = () => {
        imgLoading.style.display = 'none';
        outfitImg.classList.remove('loading');
    };
    outfitImg.onerror = () => {
        imgLoading.style.display = 'none';
        outfitImg.classList.remove('loading');
        outfitImg.alt = '画像の読み込みに失敗しました';
    };

    currentLabelEl.innerText = currentImage.label;
    currentRankEl.innerText = `Rank ${currentImage.rank}/${labelTotal} (Similarity: ${(currentImage.similarity * 100).toFixed(1)}%)`;

    const currentRating = ratings[currentImage.fileName];
    btnCross.classList.toggle('selected', currentRating === 'X');
    btnCircle.classList.toggle('selected', currentRating === 'O');

    if (badPhotos[currentImage.fileName]) {
        btnBad.classList.add('active');
    } else {
        btnBad.classList.remove('active');
    }

    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === IMAGES.length - 1;

    updateStatistics();

    document.querySelectorAll('.grid-cell').forEach(cell => cell.classList.remove('active-cell'));
    const activeCell = document.getElementById(`cell-${currentImage.soft}-${currentImage.elegant}`);
    if (activeCell) activeCell.classList.add('active-cell');

    scheduleSave();
}

function updateStatistics() {
    let totalCircleCount = 0;
    let ratedCount = 0;

    IMAGES.forEach(img => {
        const rate = ratings[img.fileName];
        if (rate === 'O') totalCircleCount++;
        if (rate !== null) ratedCount++;
    });

    const total = IMAGES.length;
    const average = total ? (totalCircleCount / total) * 100 : 0;
    averageScoreEl.innerText = `${average.toFixed(1)}%`;
    totalCirclesEl.innerText = `${totalCircleCount} / ${total}`;

    const progressPercent = total ? (ratedCount / total) * 100 : 0;
    progressFill.style.width = `${progressPercent}%`;
    progressText.innerText = `${ratedCount} / ${total} (${progressPercent.toFixed(0)}%)`;

    const groups = labelGroups();
    labelBreakdownList.innerHTML = '';
    const sortedLabels = Object.keys(groups).sort();
    const currentLabel = IMAGES[currentIndex].label;

    sortedLabels.forEach(label => {
        const fileNames = groups[label];
        let circleCount = 0;
        fileNames.forEach(fn => {
            if (ratings[fn] === 'O') circleCount++;
        });

        const breakdownItem = document.createElement('div');
        breakdownItem.className = 'breakdown-item';
        if (label === currentLabel) breakdownItem.className += ' highlighted';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'breakdown-name';
        nameSpan.innerText = label;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'breakdown-score';
        scoreSpan.innerText = `${circleCount}/${fileNames.length}`;

        breakdownItem.appendChild(nameSpan);
        breakdownItem.appendChild(scoreSpan);
        labelBreakdownList.appendChild(breakdownItem);
    });
}

function rateImage(decision) {
    const currentImage = IMAGES[currentIndex];
    ratings[currentImage.fileName] = decision;
    if (currentIndex < IMAGES.length - 1) currentIndex++;
    render();
}

function toggleBadPhoto() {
    const currentImage = IMAGES[currentIndex];
    badPhotos[currentImage.fileName] = !badPhotos[currentImage.fileName];
    render();
}

function setupEventListeners() {
    if (listenersBound) return;
    listenersBound = true;

    btnCircle.addEventListener('click', () => rateImage('O'));
    btnCross.addEventListener('click', () => rateImage('X'));
    btnBad.addEventListener('click', toggleBadPhoto);

    btnPrev.addEventListener('click', () => {
        if (currentIndex > 0) { currentIndex--; render(); }
    });

    btnNext.addEventListener('click', () => {
        if (currentIndex < IMAGES.length - 1) { currentIndex++; render(); }
    });

    btnReset.addEventListener('click', async () => {
        if (!confirm('すべての評価データをリセットしますか？この操作は取り消せません。')) return;
        IMAGES.forEach(img => {
            ratings[img.fileName] = null;
            badPhotos[img.fileName] = false;
        });
        currentIndex = 0;
        try {
            await saveProgress();
        } catch (err) {
            alert(`保存に失敗しました: ${err.message}`);
        }
        render();
    });

    btnExport.addEventListener('click', exportToCSV);
    document.addEventListener('keydown', (e) => {
        if (appContainerEl.hidden) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        if (e.key === 'f' || e.key === 'F') rateImage('X');
        else if (e.key === 'j' || e.key === 'J') rateImage('O');
    });
}

function exportToCSV() {
    let csv = '\ufeff';
    const raterId = getRaterId();
    const packageId = PACKAGE_CONFIG.packageId || '';
    const groups = labelGroups();

    csv += `Rater,${raterId}\n`;
    csv += `Package,${packageId}\n`;
    csv += 'Image Filename,Label,Soft,Elegant,Rank,Similarity,Rating (O/X),Bad Photo\n';

    IMAGES.forEach(img => {
        const rate = ratings[img.fileName] || 'Unrated';
        const isBad = badPhotos[img.fileName] ? 'Yes' : 'No';
        csv += `"${img.fileName}","${img.label}",${img.soft},${img.elegant},${img.rank},${img.similarity},"${rate}","${isBad}"\n`;
    });

    csv += '\n--- Summary Statistics ---\n';
    let totalCircleCount = 0;
    IMAGES.forEach(img => { if (ratings[img.fileName] === 'O') totalCircleCount++; });

    csv += `Total Images,${IMAGES.length}\n`;
    csv += `Total Labels,${META.labels.length}\n`;
    csv += `Total Circles (O),${totalCircleCount}\n`;
    csv += `Average Circle Rate,${IMAGES.length ? (totalCircleCount / IMAGES.length).toFixed(4) : '0'}\n\n`;
    csv += 'Label,Circle Count,Label Total,Circle Rate\n';

    Object.keys(groups).sort().forEach(label => {
        const fileNames = groups[label];
        let circleCount = 0;
        fileNames.forEach(fn => { if (ratings[fn] === 'O') circleCount++; });
        csv += `"${label}",${circleCount},${fileNames.length},${(circleCount / fileNames.length).toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `clothing_ratings_results_${raterId}_${packageId || 'pkg'}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function boot() {
    await initApp();
}

document.addEventListener('DOMContentLoaded', boot);
