// ==UserScript==
// @name         Bird Species Image Preview
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Show Flickr images when hovering over bird species names with improved popup positioning, error handling, and performance.
// @author       Your Name
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.flickr.com
// @connect      flickr.com
// @connect      live.staticflickr.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Constants and Configurations
    const FLICKR_API_KEY = GM_getValue('flickrApiKey', '');
    const speciesList = GM_getValue('speciesList', []);
    const API_CALL_DELAY = 100; // 100 milliseconds delay between API calls
    const DEBOUNCE_DELAY = 300; // Debounce delay for mouseover events

    // State Variables
    let currentIndex = 0;
    let currentImages = [];
    let popupVisible = false;
    let observer;
    let observerActive = false;
    let lastApiCallTime = 0;
    let cursorPosition = { x: 0, y: 0 };
    let isKeydownListenerAdded = false;

    console.log('Script initialized.');

    // Initialize the script
    initializeScript();

    // --- Helper Functions ---

    // Create a container for the buttons
    function createButtonContainer() {
        console.log('Creating button container.');
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'button-container';
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.bottom = '10px';
        buttonContainer.style.left = '50%';
        buttonContainer.style.transform = 'translateX(-50%)';
        buttonContainer.style.zIndex = '10000';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.alignItems = 'center';
        document.body.appendChild(buttonContainer);
        return buttonContainer;
    }

    // Create settings icon/button
    function createSettingsButton(container) {
        console.log('Creating settings button.');
        const settingsButton = document.createElement('button');
        settingsButton.textContent = '⚙️';
        settingsButton.style.backgroundColor = 'transparent';
        settingsButton.style.border = 'none';
        settingsButton.style.cursor = 'pointer';
        settingsButton.style.fontSize = '24px';
        settingsButton.addEventListener('click', showSettingsDialog);
        container.appendChild(settingsButton);
    }

    // Create run icon/button
    function createRunButton(container) {
        console.log('Creating run button.');
        const runButton = document.createElement('button');
        runButton.id = 'run-button';
        runButton.innerHTML = '&#9658;';
        runButton.style.backgroundColor = 'transparent';
        runButton.style.border = 'none';
        runButton.style.cursor = 'pointer';
        runButton.style.color = 'black';
        runButton.style.padding = '0';
        runButton.style.display = 'flex';
        runButton.style.alignItems = 'center';
        runButton.style.justifyContent = 'center';
        runButton.addEventListener('click', () => {
            // Remove container
            container.remove() 
            // Run processSpecies
            processSpecies();
        });
        container.appendChild(runButton);
    }

    // Show settings dialog
    function showSettingsDialog() {
        console.log('Showing settings dialog.');
        const dialog = document.createElement('div');
        dialog.id = 'settings-dialog';
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.backgroundColor = 'white';
        dialog.style.border = '1px solid black';
        dialog.style.borderRadius = '10px';        
        dialog.style.padding = '20px';
        dialog.style.zIndex = '10001';
        dialog.style.boxShadow = '2px 2px 10px rgba(0, 0, 0, 0.5)';

        dialog.innerHTML = `
            <h3>Settings</h3>
            <label for="api-key-input">Flickr API Key:</label>
            <input type="text" id="api-key-input" value="${FLICKR_API_KEY}" placeholder="Enter Flickr API Key" />
            <button id="update-api-key">Update API Key</button>
            <button id="clear-api-key">Clear API Key</button>
            <br><br>
            <label for="species-list-file">Upload Species List (JSON):</label>
            <input type="file" id="species-list-file" accept=".json" />
            <button id="clear-species-list">Clear Species List</button>
            <br><br>
            <button id="close-settings-dialog">Close</button>
        `;

        document.body.appendChild(dialog);   

        // Add event listeners for dialog buttons
        document.getElementById('update-api-key').addEventListener('click', updateApiKey);
        document.getElementById('clear-api-key').addEventListener('click', clearApiKey);
        document.getElementById('species-list-file').addEventListener('change', handleFileSelect);
        document.getElementById('clear-species-list').addEventListener('click', clearSpeciesList);
        document.getElementById('close-settings-dialog').addEventListener('click', () => {
            console.log('Closing settings dialog.');
            document.body.removeChild(dialog);
        });
    }

    // Update API key
    function updateApiKey() {
        const apiKeyInput = document.getElementById('api-key-input');
        const newApiKey = apiKeyInput.value.trim();
        if (newApiKey) {
            GM_setValue('flickrApiKey', newApiKey);
            console.log('API Key updated.');
            alert('API Key updated!');
        } else {
            console.warn('API Key cannot be empty.');
            alert('API Key cannot be empty!');
        }
    }

    // Clear API key
    function clearApiKey() {
        GM_setValue('flickrApiKey', '');
        console.log('API Key cleared.');
        alert('API Key cleared!');
    }

    // Handle file selection and load species list
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const newSpeciesList = JSON.parse(e.target.result);
                    if (validateSpeciesList(newSpeciesList)) {
                        GM_setValue('speciesList', newSpeciesList);
                        console.log('Species list loaded successfully.');
                        alert('Species list loaded successfully!');
                    } else {
                        console.warn('Invalid species list format.');
                        alert('Invalid species list format!');
                    }
                } catch (error) {
                    console.error('Error parsing species list:', error);
                    alert('Error parsing species list!');
                }
            };
            reader.readAsText(file);
        }
    }

    // Clear species list
    function clearSpeciesList() {
        GM_setValue('speciesList', []);
        console.log('Species list cleared.');
        alert('Species list cleared!');
    }

    // Validate species list
    function validateSpeciesList(list) {
        const isValid = Array.isArray(list) && list.every(item => typeof item === 'string');
        if (!isValid) {
            console.warn('Species list validation failed.');
        }
        return isValid;
    }

    // Initialize the script
    function initializeScript() {
        console.log('Initializing script.');
        if (!FLICKR_API_KEY || speciesList.length === 0) {
            console.warn('API Key or species list missing. Showing settings dialog.');
            showSettingsDialog();
        }

        const buttonContainer = createButtonContainer();
        createSettingsButton(buttonContainer);
        createRunButton(buttonContainer);

        GM_addStyle(`
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `);
    }

    // Add style for add-on
    function add_style() {
        console.log('Adding styles.');
        GM_addStyle(`
            .bird-popup {
                position: absolute;
                z-index: 10000;
                background: white;
                border: 1px solid black;
                border-radius: 10px;
                padding: 10px;
                box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.5);
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
                background-color: yellow;
                cursor: pointer;
            }

            .bird-popup .nav-button {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                font-size: 24px;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border: none;
                padding: 10px;
                cursor: pointer;
                user-select: none;
            }

            .bird-popup .nav-button:hover {
                background: rgba(0, 0, 0, 0.8);
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
    }

    // --- Core Functionality ---

    // Process species list and highlight species in text
    function processSpecies() {
        console.log('Processing species list.');
        // Find and highlight species in text
        function findSpeciesInText(root) {
            const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const nodesToReplace = [];

            const speciesSet = new Set(speciesList); // Fast lookup
            const speciesRegex = new RegExp(`\\b(${[...speciesSet].join("|")})\\b`, "gi"); // Single regex

            let node;
            while ((node = treeWalker.nextNode())) {
                let text = node.nodeValue;
                let replacedText = text.replace(speciesRegex, (match) => {
                    console.log(`Found species: ${match}`);
                    return `<span class="bird-highlight">${match}</span>`; // Inline replacement
                });

                if (text !== replacedText) {
                    nodesToReplace.push({ node, replacedText });
                }
            }

            // Efficient DOM updates
            pauseObserver();
            nodesToReplace.forEach(({ node, replacedText }) => {
                const wrapper = document.createElement("span");
                wrapper.innerHTML = replacedText;
                node.parentNode.replaceChild(wrapper, node);
            });
            resumeObserver();
        }

        add_style();
        findSpeciesInText(document.body);

        observer = new MutationObserver((mutations) => {
            if (!observerActive) return;

            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        findSpeciesInText(node);
                    }
                });
            });
        });

        observerActive = true;
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Pause the observer
    function pauseObserver() {
        if (observer && observerActive) {
            console.log('Pausing observer.');
            observer.disconnect();
            observerActive = false;
        }
    }

    // Resume the observer
    function resumeObserver() {
        if (observer && !observerActive) {
            console.log('Resuming observer.');
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            observerActive = true;
        }
    }

    // Fetch images from Flickr API with rate limiting
    async function fetchFlickrImages(species, callback) {
        const now = Date.now();
        if (now - lastApiCallTime < API_CALL_DELAY) {
            console.log('Rate limiting API calls. Waiting...');
            await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY - (now - lastApiCallTime)));
        }
        lastApiCallTime = Date.now();

        try {
            const searchUrl = `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${FLICKR_API_KEY}&tags=${encodeURIComponent(species)}&sort=interestingness-desc&format=json&nojsoncallback=1&per_page=10`;

            console.log(`Fetching images for species: ${species}`);
            const searchResponse = await gmFetch(searchUrl);
            if (!searchResponse.photos || searchResponse.photos.photo.length === 0) {
                console.warn(`No images found for species: ${species}`);
                callback([]);
                return;
            }

            const photos = searchResponse.photos.photo.slice(0, 10);
            const images = photos.map(photo => ({
                url: `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_c.jpg`,
                title: photo.title,
                author: null,
                flickrPage: `https://www.flickr.com/photos/${photo.owner}/${photo.id}`
            }));

            callback(images);

            photos.forEach(async (photo, index) => {
                const ownerName = await fetchOwnerName(photo.owner);
                images[index].author = ownerName;

                if (currentIndex === index) {
                    updateImage();
                }
            });
        } catch (error) {
            console.error(`Error fetching images for ${species}:`, error);
            callback([]);
        }
    }

    // Helper function to fetch data using GM_xmlhttpRequest
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
                            console.error('Error parsing response:', error);
                            reject(`Error parsing response: ${error}`);
                        }
                    } else {
                        console.error(`Flickr API error: ${response.statusText}`);
                        reject(`Flickr API error: ${response.statusText}`);
                    }
                },
                onerror: function (error) {
                    console.error('Request failed:', error);
                    reject(`Request failed: ${error}`);
                }
            });
        });
    }

    // Fetch the owner's real name (or username if real name is missing)
    async function fetchOwnerName(ownerId) {
        try {
            const ownerUrl = `https://www.flickr.com/services/rest/?method=flickr.people.getInfo&api_key=${FLICKR_API_KEY}&user_id=${ownerId}&format=json&nojsoncallback=1`;
            console.log(`Fetching owner info for ID: ${ownerId}`);
            const ownerData = await gmFetch(ownerUrl);
            const person = ownerData.person;
            if (person) {
                return (person.realname ? person.realname._content : null)
                    || (person.username ? person.username._content : null)
                    || person.path_alias
                    || "Unknown";
            }
            return "Unknown";
        } catch (error) {
            console.error(`Error fetching owner info:`, error);
            return "Unknown";
        }
    }

    // Initialize popup element
    function initializePopup() {
        console.log('Initializing popup.');
        const popup = document.createElement('div');
        popup.id = 'bird-popup';
        popup.className = 'bird-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-labelledby', 'popup-title');
        document.body.appendChild(popup);
        return popup;
    }

    // Show popup with images
    function showPopup(e, imageData) {
        if (imageData.length === 0) {
            console.log('No images to display.');
            return;
        }

        currentImages = imageData;
        currentIndex = 0;

        let popup = document.getElementById('bird-popup');
        if (!popup) {
            popup = initializePopup();
        }

        popup.innerHTML = `<div class="loading-indicator">Loading...</div>`;
        popup.style.display = 'block';

        pauseObserver();
        popup.innerHTML = `
            <button class="nav-button" id="prev-button">⮜</button>
            <img src="${currentImages[currentIndex].url}" alt="Bird Image" />
            <button class="nav-button" id="next-button">⮞</button>
            <div class="photo-info">
                <strong>${currentImages[currentIndex].title}</strong> by ${currentImages[currentIndex].author || "Loading author..."}
            </div>
            <a href="${currentImages[currentIndex].flickrPage}" target="_blank">View on Flickr</a>
            <button class="dismiss-button" id="dismiss-button">Close</button>
        `;
        resumeObserver();

        cursorPosition = { x: e.clientX, y: e.clientY };

        const img = popup.querySelector('img');
        if (img.complete) {
            positionPopup(popup);
        } else {
            img.addEventListener('load', () => positionPopup(popup));
        }

        setupNavigation(popup);
        updateNavigationButtons();
        popupVisible = true;

        window.addEventListener('scroll', () => positionPopup(popup), { passive: true });
        window.addEventListener('resize', () => positionPopup(popup), { passive: true });
    }

    // Position popup relative to viewport with scroll handling
    function positionPopup(popup) {
        console.log('Positioning popup.');
        const popupWidth = popup.offsetWidth;
        const popupHeight = popup.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const scrollY = window.scrollY || window.pageYOffset;

        const cursorX = cursorPosition.x;
        const cursorY = cursorPosition.y + scrollY;

        const spaceBelow = viewportHeight + scrollY - (cursorY + popupHeight);
        const spaceAbove = cursorY - scrollY - popupHeight;

        let top;
        if (spaceBelow >= 0) {
            top = cursorY + 10;
        } else if (spaceAbove >= 0) {
            top = cursorY - popupHeight - 10;
        } else {
            top = viewportHeight + scrollY - popupHeight - 10;
        }

        let left = cursorX + 10;
        if (left + popupWidth > viewportWidth) {
            left = cursorX - popupWidth - 10;
        }
        left = Math.max(10, Math.min(left, viewportWidth - popupWidth - 10));

        pauseObserver();
        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
        resumeObserver();
    }

    // Setup navigation buttons
    function setupNavigation(popup) {
        console.log('Setting up navigation buttons.');
        document.getElementById('prev-button').addEventListener('click', () => navigate(-1));
        document.getElementById('next-button').addEventListener('click', () => navigate(1));
        document.getElementById('dismiss-button').addEventListener('click', hidePopup);

        if (!isKeydownListenerAdded) {
            document.addEventListener('keydown', function (e) {
                if (popupVisible) {
                    if (e.key === 'ArrowLeft') {
                        navigate(-1);
                    } else if (e.key === 'ArrowRight') {
                        navigate(1);
                    } else if (e.key === 'Escape') {
                        hidePopup();
                    }
                }
            });
            isKeydownListenerAdded = true;
        }
    }

    // Navigate between images
    function navigate(direction) {
        console.log(`Navigating to image index: ${currentIndex + direction}`);
        currentIndex = Math.max(0, Math.min(currentImages.length - 1, currentIndex + direction));
        updateImage();
        updateNavigationButtons();
    }

    // Update displayed image and info
    function updateImage() {
        console.log('Updating displayed image.');
        const popup = document.getElementById('bird-popup');
        if (popup) {
            pauseObserver();
            popup.querySelector('img').src = currentImages[currentIndex].url;
            popup.querySelector('.photo-info').innerHTML = `
                <strong>${currentImages[currentIndex].title}</strong> by ${currentImages[currentIndex].author || "Loading author..."}
            `;
            popup.querySelector('a').href = currentImages[currentIndex].flickrPage;
            resumeObserver();
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
        console.log('Hiding popup.');
        pauseObserver();
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
            const species = e.target.textContent;
            console.log(`Mouseover detected on species: ${species}`);
            fetchFlickrImages(species, (imageData) => showPopup(e, imageData));
        }
    }, DEBOUNCE_DELAY));
})();