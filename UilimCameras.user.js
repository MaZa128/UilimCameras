// ==UserScript==
// @name         Uilim Cameras Sayansk Only
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Скрипт для обхода ограничений на камеры ИТК в г.Саянск. Для работы скрипта с другими городами нужно сменить cc-stream-02 на cc-stream-01 и т.д. Смену городов лень делать)
// @icon         https://uilim.ru/wp-content/themes/dakalipa/images/mobile-app.png
// @author       MaZa128
// @homepageURL  https://github.com/MaZa128/UilimCameras
// @downloadURL  https://raw.githubusercontent.com/MaZa128/UilimCameras/main/UilimCameras.user.js
// @updateURL    https://raw.githubusercontent.com/MaZa128/UilimCameras/main/UilimCameras.user.js
// @match        https://cc.uilim.ru/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function getUUID() {
        return window.location.href.match(/id=([0-9a-f-]{36})/i)?.[1];
    }

    function cleanAndReplace() {
        const uuid = getUUID();
        if (!uuid) return;

        const streamUrl = `https://cc-stream-02.uilim.ru/${uuid}/mono.m3u8`;

        // Удаление заглушки (скриншот)
        document.querySelectorAll('app-camera-not-allowed, .stack-layout').forEach(el => el.remove());
        document.querySelectorAll('*').forEach(el => {
            if (el.textContent?.includes('Полный доступ')) el.remove();
        });

        const container = document.getElementById('vjs_video_3');
        if (container) {
            container.outerHTML = `
                <div id="vjs_video_3" class="video-js vjs-default-skin vjs-rounded max-w-full vjs-fluid vjs_video_3-dimensions vjs-controls-enabled vjs-workinghover vjs-v8 vjs-has-started vjs-layout-large vjs-live vjs-playing vjs-user-active"
                     webkit-playsinline="" preload="metadata" playsinline="true" tabindex="-1" role="region" lang="en" translate="no" aria-label="Video Player">
                    <video playsinline="playsinline" preload="metadata" webkit-playsinline="" class="vjs-tech"
                           id="vjs_video_3_html5_api" tabindex="-1" role="application" muted="muted" autoplay=""
                           src="${streamUrl}"></video>

                    <div class="vjs-control-bar" dir="ltr">
                        <button class="vjs-play-control vjs-control vjs-button vjs-playing" type="button" title="Pause">
                            <span class="vjs-icon-placeholder"></span>
                            <span class="vjs-control-text">Pause</span>
                        </button>
                        <div class="vjs-custom-control-spacer">&nbsp;</div>
                        <button id="custom-fullscreen-btn" class="vjs-fullscreen-control vjs-control vjs-button" type="button" title="Fullscreen">
                            <span class="vjs-icon-placeholder"></span>
                            <span class="vjs-control-text">Fullscreen</span>
                        </button>
                    </div>
                </div>`;

            // Добавление для того, чтоб работал fullscreen
            setTimeout(() => {
                const fsBtn = document.getElementById('custom-fullscreen-btn');
                if (fsBtn) {
                    fsBtn.addEventListener('click', () => {
                        const video = document.getElementById('vjs_video_3_html5_api');
                        if (video) {
                            if (document.fullscreenElement) {
                                document.exitFullscreen();
                            } else {
                                video.requestFullscreen();
                            }
                        }
                    });
                }
            }, 300);
        }
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
