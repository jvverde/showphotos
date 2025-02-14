// ==UserScript==
// @name         Bird Species Image Preview
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Show Flickr images when hovering over bird species names with navigation for larger images and persistent visibility for the popup.
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_download
// @connect      api.flickr.com
// @connect      flickr.com
// @connect      live.staticflickr.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const FLICKR_API_KEY = 'c161f42fac23abc42328d8abd9f14fc5';
    let speciesList = [];
    let currentIndex = 0;
    let currentImages = [];
    let popupVisible = false;

    // Create file input for loading species list
    function createFileInput() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.position = 'fixed';
        fileInput.style.top = '10px';
        fileInput.style.left = '10px';
        fileInput.style.zIndex = '10000';
        fileInput.addEventListener('change', handleFileSelect);
        document.body.appendChild(fileInput);
    }

    // Handle file selection and load species list
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    speciesList = JSON.parse(e.target.result);
                    console.log('Species list loaded:', speciesList);
                    processSpecies();
                } catch (error) {
                    console.error('Error parsing species list:', error);
                }
            };
            reader.readAsText(file);
        }
    }

    // Process species list and highlight species in text
    function processSpecies() {
        GM_addStyle(`
            :root {
                --popup-bg: white;
                --popup-border: 1px solid black;
                --popup-shadow: 2px 2px 10px rgba(0, 0, 0, 0.5);
                --highlight-bg: yellow;
                --button-bg: rgba(0, 0, 0, 0.5);
                --button-hover-bg: rgba(0, 0, 0, 0.8);
            }

            .bird-popup {
                position: absolute;
                z-index: 10000;
                background: var(--popup-bg);
                border: var(--popup-border);
                padding: 10px;
                box-shadow: var(--popup-shadow);
                max-width: 900px;
                display: none;
                text-align: center;
                transition: opacity 0.3s ease;
            }

            .bird-popup img {
                width: 600px;
                height: auto;
                display: block;
                margin: auto;
            }

            .bird-highlight {
                background-color: var(--highlight-bg);
                cursor: pointer;
            }

            .bird-popup .nav-button {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                font-size: 24px;
                background: var(--button-bg);
                color: white;
                border: none;
                padding: 10px;
                cursor: pointer;
                user-select: none;
            }

            .bird-popup .nav-button:hover {
                background: var(--button-hover-bg);
            }

            #prev-button { left: 10px; }
            #next-button { right: 10px; }

            .dismiss-button {
                display: block;
                margin: 10px auto;
                padding: 5px 10px;
                background-color: red;
                color: white;
                cursor: pointer;
                border: none;
                border-radius: 5px;
            }
        `);

        // Find and highlight species in text
        function findSpeciesInText(root) {
            const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = treeWalker.nextNode())) {
                let text = node.nodeValue;
                let parent = node.parentNode;
                let replaced = false;

                speciesList.forEach(species => {
                    const regex = new RegExp(`\\b${species}\\b`, 'gi');
                    if (text.match(regex)) {
                        const span = document.createElement('span');
                        span.className = 'bird-highlight';
                        span.textContent = species;
                        text = text.replace(regex, span.outerHTML);
                        replaced = true;
                    }
                });

                if (replaced) {
                    const wrapper = document.createElement('span');
                    wrapper.innerHTML = text;
                    parent.replaceChild(wrapper, node);
                }
            }
        }

        // Fetch images from Flickr API
        function fetchFlickrImages(species, callback) {
            console.log(`Fetching images for: ${species}`);
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${FLICKR_API_KEY}&tags=${encodeURIComponent(species)}&format=json&nojsoncallback=1&per_page=10`,
                headers: { 'Origin': 'null' },
                anonymous: true,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            if (data.photos && data.photos.photo.length > 0) {
                                const photos = data.photos.photo.slice(0, 10);
                                const imageUrls = photos.map(photo => `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_c.jpg`);
                                callback(imageUrls);
                            } else {
                                console.log(`No images found for: ${species}`);
                                callback([]);
                            }
                        } catch (error) {
                            console.error(`Error parsing Flickr response:`, error);
                            callback([]);
                        }
                    } else {
                        console.error(`Flickr API error: ${response.statusText}`);
                        callback([]);
                    }
                },
                onerror: function (error) {
                    console.error(`Error fetching images for ${species}:`, error);
                    callback([]);
                }
            });
        }

        // Show popup with images
        function showPopup(e, imageUrls) {
            if (imageUrls.length === 0) return;

            currentImages = imageUrls;
            currentIndex = 0;

            let popup = document.getElementById('bird-popup');
            if (!popup) {
                popup = initializePopup();
            }

            popup.innerHTML = `
                <button class="nav-button" id="prev-button">⮜</button>
                <img src="${currentImages[currentIndex]}" alt="Bird Image" />
                <button class="nav-button" id="next-button">⮞</button>
                <button class="dismiss-button" id="dismiss-button">Close</button>
            `;

            positionPopup(popup, e);
            setupNavigation(popup);

            popup.style.display = 'block';
            popupVisible = true;
        }

        // Initialize popup element
        function initializePopup() {
            const popup = document.createElement('div');
            popup.id = 'bird-popup';
            popup.className = 'bird-popup';
            document.body.appendChild(popup);
            return popup;
        }

        // Position popup relative to viewport
        function positionPopup(popup, e) {
            const popupWidth = popup.offsetWidth;
            const popupHeight = popup.offsetHeight;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let top = e.pageY + 10;
            let left = e.pageX + 10;

            if (left + popupWidth > viewportWidth) {
                left = viewportWidth - popupWidth - 10;
            }
            if (top + popupHeight > viewportHeight) {
                top = viewportHeight - popupHeight - 10;
            }

            popup.style.top = `${top}px`;
            popup.style.left = `${left}px`;
        }

        // Setup navigation buttons
        function setupNavigation(popup) {
            document.getElementById('prev-button').addEventListener('click', () => navigate(-1));
            document.getElementById('next-button').addEventListener('click', () => navigate(1));
            document.getElementById('dismiss-button').addEventListener('click', hidePopup);
        }

        // Navigate between images
        function navigate(direction) {
            currentIndex = Math.max(0, Math.min(currentImages.length - 1, currentIndex + direction));
            updateImage();
        }

        // Update displayed image
        function updateImage() {
            const popup = document.getElementById('bird-popup');
            if (popup) {
                popup.querySelector('img').src = currentImages[currentIndex];
            }
        }

        // Hide popup
        function hidePopup() {
            const popup = document.getElementById('bird-popup');
            if (popup) {
                popup.style.display = 'none';
                popupVisible = false;
            }
        }

        // Debounce mouseover events
        function debounce(func, delay) {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), delay);
            };
        }

        // Attach debounced mouseover event listener
        document.addEventListener('mouseover', debounce(function (e) {
            if (e.target.classList.contains('bird-highlight')) {
                const species = e.target.textContent;
                fetchFlickrImages(species, (imageUrls) => showPopup(e, imageUrls));
            }
        }, 300));

        console.log("Starting bird species detection...");
        findSpeciesInText(document.body);
    }

    createFileInput();
})();