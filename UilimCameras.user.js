// ==UserScript==
// @name         Uilim Cameras
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Скрипт для просмотра камер ИТК. Автовыбор stream-хоста.
// @icon         https://uilim.ru/wp-content/themes/dakalipa/images/mobile-app.png
// @author       MaZa128
// @homepageURL  https://github.com/MaZa128/UilimCameras
// @downloadURL  https://raw.githubusercontent.com/MaZa128/UilimCameras/main/UilimCameras.user.js
// @updateURL    https://raw.githubusercontent.com/MaZa128/UilimCameras/main/UilimCameras.user.js
// @match        https://cc.uilim.ru/*
// @grant        none
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js
// ==/UserScript==

(function () {
    'use strict';
    /* global Hls */

    // ========== Настройки ==========
    const STREAM_HOSTS = [
        'cc-stream-02', // Саянск
        'cc-stream-01', // Усть-Илимск
        'cc-stream-03', // Невон и др.
        'cc-stream-04' // хз нужен ли) пусть пока будет
    ];

    const CONTROLS_HIDE_DELAY = 2500;

    let currentHls = null;
    let currentUuid = null;
    let isReplacing = false;
    let hideTimeout = null;

    // ========== Утилиты ==========
    function getUUID() {
        return window.location.href.match(/id=([0-9a-f-]{36})/i)?.[1] || null;
    }

    function waitForElement(selector, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const found = document.querySelector(selector);
                if (found) {
                    observer.disconnect();
                    resolve(found);
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Элемент ${selector} не найден`));
            }, timeout);
        });
    }

    function destroyPlayer() {
        if (currentHls) {
            try { currentHls.destroy(); } catch (e) {}
            currentHls = null;
        }

        const video = document.getElementById('uilim-video');
        if (video) {
            video.removeAttribute('src');
            video.load();
        }
    }

    // ========== Очистка блокировок ==========
    function removeBlockers() {
        // Удаление блокировки
        document.querySelectorAll('app-camera-not-allowed').forEach(el => el.remove());

        // Тексты про доступ
        document.querySelectorAll('button, div, span, p, a, h1, h2, h3, h4').forEach(el => {
            const text = (el.textContent || '').trim();
            if (
                text.includes('Полный доступ') ||
                text.includes('Ограниченный доступ') ||
                text.includes('Доступ ограничен') ||
                text.includes('Нет доступа')
            ) {
                // Удаление элемента или ближайшего родителя
                const parent = el.closest('.stack-layout, .mat-dialog-container, [class*="modal"], [class*="overlay"]') || el;
                parent.remove();
            }
        });

        // Offline-бар
        document.querySelectorAll('.flex.w-full.items-center.justify-between.gap-3.md\\:w-auto').forEach(el => {
            const t = (el.textContent || '').toLowerCase();
            if (t.includes('offline') || t.includes('офлайн')) {
                el.remove();
            }
        });

        // Любые оверлеи с запретом
        document.querySelectorAll('[class*="not-allowed"], [class*="access-denied"], [class*="restricted"]').forEach(el => {
            el.remove();
        });
    }

    // Постоянный наблюдатель за блокировками
    const blockerObserver = new MutationObserver(() => {
        if (document.querySelector('app-camera-not-allowed') ||
            document.body.innerText.includes('Полный доступ') ||
            document.body.innerText.includes('Ограниченный доступ')) {
            removeBlockers();
        }
    });

    blockerObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // При старте несколько раз принудительное удаление баннера (на случай поздней загрузки)
    function aggressiveCleanOnStart() {
        removeBlockers();
        const times = [100, 300, 600, 1000, 1500, 2500, 4000];
        times.forEach(ms => setTimeout(removeBlockers, ms));
    }

    // ========== Основная функция ==========
    async function cleanAndReplace(force = false) {
        const uuid = getUUID();
        if (!uuid) return;

        if (!force && uuid === currentUuid && document.getElementById('uilim-video')) {
            return;
        }

        if (isReplacing) return;
        isReplacing = true;

        try {
            destroyPlayer();
            currentUuid = uuid;

            // Удаление баннера
            removeBlockers();

            let container;
            try {
                container = await waitForElement('#vjs_video_3', 6000);
            } catch {
                container = document.querySelector('video')?.closest('[id*="vjs"]') ||
                            document.querySelector('video')?.parentElement || null;
            }

            if (!container) {
                isReplacing = false;
                return;
            }

            // Ещё раз удаление баннера на всякий случай
            removeBlockers();

            container.outerHTML = `
                <div id="vjs_video_3" style="
                    position: relative;
                    width: 100%;
                    background: #000;
                    aspect-ratio: 16/9;
                    overflow: hidden;
                    border-radius: 4px;
                ">
                    <video id="uilim-video"
                           playsinline
                           muted
                           autoplay
                           style="width: 100%; height: 100%; display: block; background: #000; object-fit: contain;">
                    </video>

                    <div id="custom-controls" style="
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        height: 48px;
                        background: linear-gradient(transparent, rgba(0,0,0,0.8));
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 0 10px;
                        z-index: 20;
                        opacity: 1;
                        transition: opacity 0.25s ease;
                        user-select: none;
                    ">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <button id="btn-play" title="Play / Pause">▶</button>
                            <button id="btn-reload" title="Перезагрузить поток">↻</button>
                        </div>

                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span id="live-badge" style="
                                color: #ff4444;
                                font-size: 12px;
                                font-weight: 600;
                                letter-spacing: 0.5px;
                                margin-right: 8px;
                                display: none;
                            ">● LIVE</span>
                            <button id="btn-pip" title="Picture-in-Picture">⧉</button>
                            <button id="btn-fs" title="Fullscreen (F)">⛶</button>
                        </div>
                    </div>

                    <div id="error-msg" style="
                        position: absolute;
                        inset: 0;
                        display: none;
                        align-items: center;
                        justify-content: center;
                        background: rgba(0,0,0,0.85);
                        color: #fff;
                        font-size: 15px;
                        text-align: center;
                        padding: 20px;
                        z-index: 30;
                        white-space: pre-line;
                    "></div>
                </div>
            `;

            if (!document.getElementById('uilim-controls-style')) {
                const style = document.createElement('style');
                style.id = 'uilim-controls-style';
                style.textContent = `
                    #custom-controls button {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 6px 10px;
                        border-radius: 4px;
                        transition: background 0.15s;
                    }
                    #custom-controls button:hover {
                        background: rgba(255,255,255,0.15);
                    }
                `;
                document.head.appendChild(style);
            }

            const video = document.getElementById('uilim-video');
            const controls = document.getElementById('custom-controls');
            const playBtn = document.getElementById('btn-play');
            const reloadBtn = document.getElementById('btn-reload');
            const fsBtn = document.getElementById('btn-fs');
            const pipBtn = document.getElementById('btn-pip');
            const liveBadge = document.getElementById('live-badge');
            const errorMsg = document.getElementById('error-msg');
            const player = document.getElementById('vjs_video_3');

            // ===== Загрузка потока =====
            function loadStream(hostIndex = 0) {
                if (hostIndex >= STREAM_HOSTS.length) {
                    showError('Не удалось загрузить поток ни с одного сервера');
                    return;
                }

                const host = STREAM_HOSTS[hostIndex];
                const streamUrl = `https://${host}.uilim.ru/${uuid}/mono.m3u8`;

                console.log(`[Uilim] Загружаем: ${streamUrl}`);

                if (currentHls) {
                    try { currentHls.destroy(); } catch (e) {}
                    currentHls = null;
                }

                hideError();
                liveBadge.style.display = 'none';

                if (Hls.isSupported()) {
                    currentHls = new Hls({
                        enableWorker: true,
                        lowLatencyMode: true,
                        backBufferLength: 30,
                        maxBufferLength: 30
                    });

                    currentHls.loadSource(streamUrl);
                    currentHls.attachMedia(video);

                    currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
                        liveBadge.style.display = 'inline';
                        video.play().catch(() => {});
                        updatePlayButton();
                    });

                    currentHls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            console.warn('[Uilim] HLS fatal:', data.type, data.details);
                            try { currentHls.destroy(); } catch (e) {}
                            currentHls = null;
                            setTimeout(() => loadStream(hostIndex + 1), 600);
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = streamUrl;
                    video.addEventListener('loadedmetadata', () => {
                        liveBadge.style.display = 'inline';
                        video.play().catch(() => {});
                        updatePlayButton();
                    }, { once: true });

                    video.addEventListener('error', () => {
                        setTimeout(() => loadStream(hostIndex + 1), 600);
                    }, { once: true });
                } else {
                    showError('Браузер не поддерживает HLS');
                }
            }

            function showError(text) {
                errorMsg.textContent = text + '\n\nНажмите ↻ чтобы попробовать снова';
                errorMsg.style.display = 'flex';
                liveBadge.style.display = 'none';
            }

            function hideError() {
                errorMsg.style.display = 'none';
            }

            loadStream(0);

            // ===== Кнопки =====
            function updatePlayButton() {
                playBtn.textContent = video.paused ? '▶' : '⏸';
            }

            playBtn.addEventListener('click', () => {
                video.paused ? video.play() : video.pause();
            });

            reloadBtn.addEventListener('click', () => loadStream(0));

            function toggleFullscreen() {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    (player.requestFullscreen || video.requestFullscreen).call(player || video);
                }
            }

            fsBtn.addEventListener('click', toggleFullscreen);
            video.addEventListener('dblclick', toggleFullscreen);

            pipBtn.addEventListener('click', async () => {
                try {
                    if (document.pictureInPictureElement) {
                        await document.exitPictureInPicture();
                    } else if (document.pictureInPictureEnabled) {
                        await video.requestPictureInPicture();
                    }
                } catch (e) {
                    console.warn('PiP error:', e);
                }
            });

            video.addEventListener('play', updatePlayButton);
            video.addEventListener('pause', updatePlayButton);
            updatePlayButton();

            // ===== Скрытие контролов =====
            function showControls() {
                controls.style.opacity = '1';
                clearTimeout(hideTimeout);
                hideTimeout = setTimeout(() => {
                    if (!video.paused) controls.style.opacity = '0';
                }, CONTROLS_HIDE_DELAY);
            }

            player.addEventListener('mousemove', showControls);
            player.addEventListener('mouseenter', showControls);
            player.addEventListener('mouseleave', () => {
                if (!video.paused) controls.style.opacity = '0';
            });
            showControls();

            // Ещё одна чистка от баннера. После замены плеера
            setTimeout(removeBlockers, 200);
            setTimeout(removeBlockers, 800);

        } catch (err) {
            console.error('[Uilim] Ошибка:', err);
        } finally {
            isReplacing = false;
        }
    }

    // ========== Отслеживание смены камеры ==========
    function checkAndReplace() {
        const uuid = getUUID();
        if (!uuid) return;

        if (uuid !== currentUuid) {
            console.log('[Uilim] Смена камеры:', currentUuid, '→', uuid);
            cleanAndReplace(true);
            return;
        }

        if (!document.getElementById('uilim-video')) {
            cleanAndReplace(true);
        }
    }

    // ===== Запуск =====
    aggressiveCleanOnStart();
    setTimeout(checkAndReplace, 200);
    setTimeout(checkAndReplace, 700);
    setTimeout(checkAndReplace, 1500);

    // Отслеживание URL
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(checkAndReplace, 150);
            setTimeout(checkAndReplace, 500);
        }
    }, 250);

    // Наблюдатель на появление плеера / блокировки
    new MutationObserver(() => {
        const uuid = getUUID();
        if (!uuid) return;

        if (document.querySelector('app-camera-not-allowed') ||
            !document.getElementById('uilim-video')) {
            checkAndReplace();
        }
    }).observe(document.body, { childList: true, subtree: true });

})();
