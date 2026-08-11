// ==UserScript==
// @name         Uilim Cameras Sayansk Only
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Скрипт для обхода ограничений на камеры ИТК в г.Саянск. Для работы скрипта с другими городами нужно сменить cc-stream-02 на cc-stream-01 и т.д.
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

    let currentHls = null;

    function getUUID() {
        return window.location.href.match(/id=([0-9a-f-]{36})/i)?.[1];
    }

    function cleanAndReplace() {
        const uuid = getUUID();
        if (!uuid) return;

        const streamUrl = `https://cc-stream-02.uilim.ru/${uuid}/mono.m3u8`;

        // Удаление заглушки
        document.querySelectorAll('app-camera-not-allowed, .stack-layout').forEach(el => el.remove());
        document.querySelectorAll('*').forEach(el => {
            if (el.textContent?.includes('Полный доступ')) el.remove();
        });

        // Удаление надписи Offline
        document.querySelectorAll('.flex.w-full.items-center.justify-between.gap-3.md\\:w-auto').forEach(el => el.remove());

        const container = document.getElementById('vjs_video_3');
        if (!container) return;

        // Уничтожение предыдущего HLS
        if (currentHls) {
            currentHls.destroy();
            currentHls = null;
        }

        container.outerHTML = `
            <div id="vjs_video_3" style="position: relative; width: 100%; background: #000; aspect-ratio: 16/9;">
                <video id="vjs_video_3_html5_api"
                       playsinline
                       muted
                       autoplay
                       style="width: 100%; height: 100%; display: block; background: #000;"></video>

                <!-- Кастомная панель управления -->
                <div id="custom-controls" style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 48px;
                    background: linear-gradient(transparent, rgba(0,0,0,0.75));
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 12px;
                    z-index: 10;
                    opacity: 1;
                    transition: opacity 0.3s;
                ">
                    <button id="custom-play-btn" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 22px;
                        cursor: pointer;
                        padding: 6px 10px;
                    " title="Play/Pause">⏸</button>

                    <button id="custom-fullscreen-btn" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 6px 10px;
                    " title="Fullscreen">⛶</button>
                </div>
            </div>
        `;

        const video = document.getElementById('vjs_video_3_html5_api');
        const playBtn = document.getElementById('custom-play-btn');
        const fsBtn = document.getElementById('custom-fullscreen-btn');
        const controls = document.getElementById('custom-controls');

        // HLS
        if (Hls.isSupported()) {
            currentHls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
            });
            currentHls.loadSource(streamUrl);
            currentHls.attachMedia(video);
            currentHls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = streamUrl;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => {});
            });
        }

        // Play / Pause
        playBtn.addEventListener('click', () => {
            if (video.paused) {
                video.play();
                playBtn.textContent = '⏸';
            } else {
                video.pause();
                playBtn.textContent = '▶';
            }
        });

        // Обновление иконки при паузе/воспроизведении
        video.addEventListener('play', () => {playBtn.textContent = '⏸';});
        video.addEventListener('pause', () => {playBtn.textContent = '▶';});

        // Функция переключения fullscreen
        function toggleFullscreen() {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                const player = document.getElementById('vjs_video_3');
                if (player?.requestFullscreen) {
                    player.requestFullscreen();
                } else if (video.requestFullscreen) {
                    video.requestFullscreen();
                }
            }
        }

        // Fullscreen по кнопке и даблклику
        fsBtn.addEventListener('click', toggleFullscreen);
        video.addEventListener('dblclick', toggleFullscreen);

        // Скрывать контролы при наведении / без наведения (опционально)
        let hideTimeout;
        const showControls = () => {
            controls.style.opacity = '1';
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!video.paused) controls.style.opacity = '0';
            }, 2500);
        };

        const player = document.getElementById('vjs_video_3');
        player.addEventListener('mousemove', showControls);
        player.addEventListener('mouseenter', showControls);
        player.addEventListener('mouseleave', () => {
            if (!video.paused) controls.style.opacity = '0';
        });

        // Сразу показать контролы
        showControls();
    }

    // Запуск
    setTimeout(cleanAndReplace, 700);
    setTimeout(cleanAndReplace, 1800);

    // При смене камеры
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(cleanAndReplace, 600);
        }
    }).observe(document, { subtree: true, childList: true });
})();
