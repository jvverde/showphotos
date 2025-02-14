// ==UserScript==
// @name         Bird Species Image Preview
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Show Flickr images when hovering over bird species names with navigation for larger images, persistent visibility for the popup, and additional features.
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @connect      api.flickr.com
// @connect      flickr.com
// @connect      live.staticflickr.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    let FLICKR_API_KEY = GM_getValue('flickrApiKey', ''); // Load API key from storage
    let speciesList = GM_getValue('speciesList', []); // Load species list from storage
    let currentIndex = 0;
    let currentImages = [];
    let currentPhotoData = []; // Store photo metadata (title, author)
    let popupVisible = false;
    let observer; // MutationObserver instance
    let observerActive = false; // Track observer state

    console.log('Script initialized.');

    // Prompt user on first run
    if (!GM_getValue('firstRunCompleted', false)) {
        console.log('First run detected. Prompting user...');
        const runScript = confirm('Welcome! Do you want to run the Bird Species Image Preview script?');
        if (!runScript) {
            console.log('User chose not to run the script. Exiting.');
            return;
        }

        const useStoredList = speciesList.length > 0 && confirm('Do you want to use the stored species list?');
        if (!useStoredList) {
            console.log('User chose not to use the stored species list. Clearing list.');
            speciesList = [];
            GM_setValue('speciesList', []);
        }

        GM_setValue('firstRunCompleted', true);
        console.log('First run setup completed.');
    }

    // Initialize the script
    initializeScript();

    // Create file input for loading species list
    function createFileInput() {
        console.log('Creating file input for species list.');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.position = 'fixed';
        fileInput.style.top = '10px';
        fileInput.style.left = '10px';
        fileInput.style.zIndex = '10000';
        fileInput.addEventListener('change', handleFileSelect);
        document.body.appendChild(fileInput);

        // Add a clear button
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Species List';
        clearButton.style.position = 'fixed';
        clearButton.style.top = '40px';
        clearButton.style.left = '10px';
        clearButton.style.zIndex = '10000';
        clearButton.addEventListener('click', () => {
            console.log('Clearing species list.');
            speciesList = [];
            GM_setValue('speciesList', []);
            alert('Species list cleared!');
        });
        document.body.appendChild(clearButton);

        // Add API key input
        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'text';
        apiKeyInput.placeholder = 'Enter Flickr API Key';
        apiKeyInput.value = FLICKR_API_KEY;
        apiKeyInput.style.position = 'fixed';
        apiKeyInput.style.top = '70px';
        apiKeyInput.style.left = '10px';
        apiKeyInput.style.zIndex = '10000';
        apiKeyInput.addEventListener('change', () => {
            console.log('Updating Flickr API Key.');
            FLICKR_API_KEY = apiKeyInput.value;
            GM_setValue('flickrApiKey', FLICKR_API_KEY);
            alert('API Key updated!');
        });
        document.body.appendChild(apiKeyInput);
    }

    // Handle file selection and load species list
    function handleFileSelect(event) {
        console.log('File selected. Reading file...');
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    console.log('Parsing species list from file.');
                    const newSpeciesList = JSON.parse(e.target.result);
                    if (validateSpeciesList(newSpeciesList)) {
                        console.log('Species list validated. Updating list.');
                        speciesList = newSpeciesList;
                        GM_setValue('speciesList', speciesList);
                        console.log('Species list loaded:', speciesList);
                        processSpecies(); // Process species after loading
                    } else {
                        console.error('Invalid species list format!');
                        alert('Invalid species list format!');
                    }
                } catch (error) {
                    console.error('Error parsing species list:', error);
                }
            };
            reader.readAsText(file);
        }
    }

    // Validate species list
    function validateSpeciesList(list) {
        console.log('Validating species list.');
        return Array.isArray(list) && list.every(item => typeof item === 'string');
    }

    // Initialize the script
    function initializeScript() {
        console.log('Initializing script.');
        createFileInput();
        if (speciesList.length > 0) {
            console.log('Stored species list found. Processing species...');
            processSpecies(); // Process species if list is already loaded
        } else {
            console.log('No stored species list found.');
        }
    }

    // Process species list and highlight species in text
    function processSpecies() {
        console.log('Processing species list.');
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
                resize: both;
                overflow: auto;
            }

            .bird-popup img {
                max-width: 100%;
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

            .loading-indicator {
                font-size: 18px;
                color: #333;
                padding: 20px;
            }

            .photo-info {
                margin: 10px 0;
                font-size: 14px;
                color: #555;
            }
        `);

        // Find and highlight species in text
        function findSpeciesInText(root) {
            console.log('Finding species in text nodes.');
            const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodesToReplace = []; // Store nodes and their replacements

            let node;
            while ((node = treeWalker.nextNode())) {
                let text = node.nodeValue;
                let parent = node.parentNode;
                let replaced = false;

                speciesList.forEach(species => {
                    const regex = new RegExp(`\\b${species}\\b`, 'gi');
                    if (text.match(regex)) {
                        console.log(`Found species: ${species}`);
                        const span = document.createElement('span');
                        span.className = 'bird-highlight';
                        span.textContent = species;
                        text = text.replace(regex, span.outerHTML);
                        replaced = true;
                    }
                });

                if (replaced) {
                    console.log('Replacement needed for node:', node);
                    nodesToReplace.push({ node, text });
                }
            }

            // Temporarily disconnect the observer
            pauseObserver();

            // Perform replacements after traversal
            nodesToReplace.forEach(({ node, text }) => {
                const wrapper = document.createElement('span');
                wrapper.innerHTML = text;
                node.parentNode.replaceChild(wrapper, node);
                console.log('Replaced node with highlighted species.');
            });

            // Reconnect the observer
            resumeObserver();
        }

        // Traverse the entire document
        console.log('Traversing document for species.');
        findSpeciesInText(document.body);

        // Observe DOM changes for dynamically loaded content
        console.log('Setting up MutationObserver for dynamic content.');
        observer = new MutationObserver((mutations) => {
            if (!observerActive) return; // Skip if observer is paused

            console.log('DOM mutation detected. Processing new nodes.');
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Only process element nodes
                        console.log('Processing new node:', node);
                        findSpeciesInText(node);
                    }
                });
            });
        });

        // Start observer in active state
        observerActive = true;
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Pause the observer
    function pauseObserver() {
        if (observer && observerActive) {
            console.log('Pausing MutationObserver.');
            observer.disconnect();
            observerActive = false;
        }
    }

    // Resume the observer
    function resumeObserver() {
        if (observer && !observerActive) {
            console.log('Resuming MutationObserver.');
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            observerActive = true;
        }
    }

    // Fetch images from Flickr API
    async function fetchFlickrImages(species, callback) {
        try {
            const searchUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${FLICKR_API_KEY}&tags=${encodeURIComponent(species)}&format=json&nojsoncallback=1&per_page=10`;

            const searchResponse = await gmFetch(searchUrl);
            if (!searchResponse.photos || searchResponse.photos.photo.length === 0) {
                console.log(`No images found for species: ${species}`);
                return callback([]);
            }

            console.log(`Found ${searchResponse.photos.photo.length} images for species: ${species}`);
            const photos = searchResponse.photos.photo.slice(0, 10);

            // Fetch owner names in parallel
            const images = await Promise.all(photos.map(async (photo) => {
                const ownerName = await fetchOwnerName(photo.owner);
                return {
                    url: `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_c.jpg`,
                    title: photo.title,
                    author: ownerName,
                    flickrPage: `https://www.flickr.com/photos/${photo.owner}/${photo.id}`
                };
            }));

            callback(images);
        } catch (error) {
            console.error(`Error fetching images for ${species}:`, error);
            callback([]);
        }
    }

    // Helper function to fetch data using GM_xmlhttpRequest and return a promise
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: { 'Origin': 'null' },
                anonymous: true,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (error) {
                            reject(`Error parsing response: ${error}`);
                        }
                    } else {
                        reject(`Flickr API error: ${response.statusText}`);
                    }
                },
                onerror: function (error) {
                    reject(`Request failed: ${error}`);
                }
            });
        });
    }

    // Fetch the owner's real name (or username if real name is missing)
    async function fetchOwnerName(ownerId) {
        try {
            const ownerUrl = `https://www.flickr.com/services/rest/?method=flickr.people.getInfo&api_key=${FLICKR_API_KEY}&user_id=${ownerId}&format=json&nojsoncallback=1`;
            const ownerData = await gmFetch(ownerUrl);
            const person = ownerData.person;
            if (person) {
                return (person.realname ? person.realname._content : null)
                    || (person.username ? person.username._content : null)
                    || person.path_alias
                    || "Unknown"
            }
            return "Unknown";
        } catch (error) {
            console.error(`Error fetching owner info:`, error);
            return "Unknown"; // Fallback if the request fails
        }
    }

    // Show popup with images
    function showPopup(e, imageData) {

        if (imageData.length === 0) {
            console.log('No images to display.');
            return;
        }

        pauseObserver(); // Disable observer before DOM changes
        console.log('Displaying popup with images.');
        currentImages = imageData;
        currentIndex = 0;

        let popup = document.getElementById('bird-popup');
        if (!popup) {
            console.log('Creating new popup.');
            popup = initializePopup();
        }

        // Show loading indicator
        popup.innerHTML = `<div class="loading-indicator">Loading...</div>`;
        popup.style.display = 'block';

        console.log('Loading images into popup.');
        popup.innerHTML = `
            <button class="nav-button" id="prev-button">⮜</button>
            <img src="${currentImages[currentIndex].url}" alt="Bird Image" />
            <button class="nav-button" id="next-button">⮞</button>
            <div class="photo-info">
                <strong>${currentImages[currentIndex].title}</strong> by ${currentImages[currentIndex].author}
            </div>
            <a href="${currentImages[currentIndex].flickrPage}" target="_blank">View on Flickr</a>
            <button class="dismiss-button" id="dismiss-button">Close</button>
        `;

        positionPopup(popup, e);
        setupNavigation(popup);
        updateNavigationButtons();
        popupVisible = true;

        resumeObserver(); // Re-enable observer after DOM changes
    }

    // Initialize popup element
    function initializePopup() {
        console.log('Initializing popup element.');
        const popup = document.createElement('div');
        popup.id = 'bird-popup';
        popup.className = 'bird-popup';
        document.body.appendChild(popup);
        return popup;
    }

    // Position popup relative to viewport
    function positionPopup(popup, e) {
        console.log('Positioning popup.');
        const popupWidth = popup.offsetWidth;
        const popupHeight = popup.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let top = e.pageY + 10 + window.scrollY; // Account for page scroll
        let left = e.pageX + 10 + window.scrollX; // Account for page scroll

        if (left + popupWidth > viewportWidth) {
            console.log('Adjusting popup position to fit viewport.');
            left = viewportWidth - popupWidth - 10;
        }
        if (top + popupHeight > viewportHeight) {
            console.log('Adjusting popup position to fit viewport.');
            top = viewportHeight - popupHeight - 10;
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    }

    // Add event listener for window scroll
    window.addEventListener('scroll', () => {
        const popup = document.getElementById('bird-popup');
        if (popup && popup.style.display === 'block') {
            positionPopup(popup, { pageY: window.scrollY, pageX: window.scrollX }); // Recalculate popup position on scroll
        }
    });

    // Setup navigation buttons
    function setupNavigation(popup) {
        console.log('Setting up popup navigation.');
        document.getElementById('prev-button').addEventListener('click', () => navigate(-1));
        document.getElementById('next-button').addEventListener('click', () => navigate(1));
        document.getElementById('dismiss-button').addEventListener('click', hidePopup);

        // Add keyboard navigation
        document.addEventListener('keydown', function (e) {
            if (popupVisible) {
                console.log('Keyboard navigation detected.');
                if (e.key === 'ArrowLeft') {
                    navigate(-1);
                } else if (e.key === 'ArrowRight') {
                    navigate(1);
                } else if (e.key === 'Escape') {
                    hidePopup();
                }
            }
        });
    }

    // Navigate between images
    function navigate(direction) {
        console.log(`Navigating ${direction > 0 ? 'forward' : 'backward'}.`);
        currentIndex = Math.max(0, Math.min(currentImages.length - 1, currentIndex + direction));
        updateImage();
        updateNavigationButtons();
    }

    // Update displayed image and info
    function updateImage() {
        console.log('Updating displayed image.');
        const popup = document.getElementById('bird-popup');
        if (popup) {
            popup.querySelector('img').src = currentImages[currentIndex].url;
            popup.querySelector('.photo-info').innerHTML = `
                <strong>${currentImages[currentIndex].title}</strong> by ${currentImages[currentIndex].author}
            `;
            popup.querySelector('a').href = currentImages[currentIndex].flickrPage;
        }
    }

    // Update navigation buttons visibility
    function updateNavigationButtons() {
        console.log('Updating navigation buttons visibility.');
        const prevButton = document.getElementById('prev-button');
        const nextButton = document.getElementById('next-button');
        if (prevButton) prevButton.style.display = currentIndex > 0 ? 'block' : 'none';
        if (nextButton) nextButton.style.display = currentIndex < currentImages.length - 1 ? 'block' : 'none';
    }

    // Hide popup
    function hidePopup() {
        pauseObserver();
        console.log('Hiding popup.');
        const popup = document.getElementById('bird-popup');
        if (popup) {
            popup.style.display = 'none';
            popupVisible = false;
        }
        resumeObserver();
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
            console.log('Mouseover detected on highlighted species.');
            const species = e.target.textContent;
            fetchFlickrImages(species, (imageData) => showPopup(e, imageData));
        }
    }, 300));
})();