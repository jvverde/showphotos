// ==UserScript==
// @name         Bird Species Image Preview
// @namespace    http://tampermonkey.net/
// @version      3.1.5
// @description  Show Flickr images when hovering over bird species names (IOC nomenclature) on a webpage.
// @author       Isidro Vila Verde
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.flickr.com
// @connect      api.github.com
// @connect      flickr.com
// @connect      live.staticflickr.com
// @run-at       document-end
// ==/UserScript==

(async function () {
    'use strict';

    // Generate a random postfix for IDs to avoid conflicts
    const randomPostfix = `_${Math.random().toString(36).substring(2, 9)}`; // e.g., "_a1b2c3d"

    // Constants and Configurations
    const FLICKR_API_KEY = 'c161f42fac23abc42328d8abd9f14fc5';
    const GISTID = ['70598ae6bef6da21ade780c12d907452','d31217a5c802d1018893907df29d1d45'];
    const API_CALL_DELAY = 300; // 300 milliseconds delay between API calls
    const DEBOUNCE_DELAY = 300; // Debounce delay for mouseover events
    let speciesList = GM_getValue('speciesList', []);

    // State Variables
    let currentIndex = 0;
    let currentImages = [];
    let popupVisible = false;
    let observer;
    let observerActive = false;
    let lastApiCallTime = 0;
    let cursorPosition = { x: 0, y: 0 };
    let isKeydownListenerAdded = false;

    console.log('Script loaded.');

    // Initialize the script
    async function initializeScript() {
        console.log('Initializing script.');
        
        // Try to load speciesList from GitHub Gists
        if (speciesList.length === 0) {
            let mergedSpeciesList = [];

            for (const gistId of GISTID) { // Iterate over multiple Gist IDs
                const gistUrl = `https://api.github.com/gists/${gistId}`;
                try {
                    const gistData = await gmFetch(gistUrl); // Reuse gmFetch function
                    const speciesSubset = loadAndMergeSpeciesLists(gistData); // Load, merge, sort, and deduplicate
                    mergedSpeciesList.push(...speciesSubset);
                } catch (error) {
                    console.warn(`Failed to load or process species list from Gist ${gistId}:`, error);
                }
            }

            // Remove duplicates and sort
            speciesList = [...new Set(mergedSpeciesList)].sort((a, b) => a.localeCompare(b));
            console.log(`Species list loaded and processed: ${speciesList.length} unique names`);

            // Cache the speciesList
            GM_setValue('speciesList', speciesList);
        }
    }

    // Function to load, merge, sort, and deduplicate species lists from Gist files
    function loadAndMergeSpeciesLists(gistData) {
        const mergedList = [];

        // Iterate over all files in the Gist
        for (const file of Object.values(gistData.files)) {
            // Check if the file name matches 'birdnames'
            if (file.filename.includes('birdnames')) {
                try {
                    // Parse the file content as JSON and add to the merged list
                    const content = JSON.parse(file.content);
                    if (Array.isArray(content)) {
                        mergedList.push(...content);
                    } else {
                        console.warn(`File ${file.filename} does not contain a valid array.`);
                    }
                } catch (error) {
                    console.error(`Error parsing file ${file.filename}:`, error);
                }
            }
        }

        return mergedList;
    }


    // Add style for add-on
    function add_style() {
        console.log('Adding styles.');
        GM_addStyle(`
            .bird-popup {
                position: absolute;
                z-index: 10000;
                background: #121212; /* Dark background */
                border: 1px solid #333; /* Dark border */
                border-radius: 10px;
                padding: 10px;
                box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.5);
                max-width: 80vw;
                display: none;
                text-align: center;
                transition: opacity 0.3s ease;
                resize: both;
                overflow: auto;
                color: #ffffff; /* Light text color */
            }

            /* Ensure all child elements inherit the dark mode styles */
            .bird-popup * {
                color: inherit; /* Inherit light text color */
                background-color: transparent; /* Transparent background for child elements */
                border-color: #555; /* Dark border for child elements */
            }

            /* Style buttons for dark mode */
            .bird-popup button {
                background-color: #333; /* Dark background for buttons */
                color: #ffffff; /* Light text color for buttons */
                border: 1px solid #555; /* Dark border for buttons */
                padding: 5px 10px;
                border-radius: 5px;
                cursor: pointer;
            }

            .bird-popup button:hover {
                background-color: #444; /* Slightly lighter background for hovered buttons */
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

            #prev-button${randomPostfix} { left: 10px; }
            #next-button${randomPostfix} { right: 10px; }

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
                        console.error(`API error: ${response.statusText}`);
                        reject(`API error: ${response.statusText}`);
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
        popup.id = `bird-popup${randomPostfix}`; // Add random postfix to ID
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

        let popup = document.getElementById(`bird-popup${randomPostfix}`); // Add random postfix to ID
        if (!popup) {
            popup = initializePopup();
        }

        popup.innerHTML = `<div class="loading-indicator">Loading...</div>`;
        popup.style.display = 'block';

        pauseObserver();
        popup.innerHTML = `
            <button class="nav-button" id="prev-button${randomPostfix}">&lsaquo;</button>
            <img src="${currentImages[currentIndex].url}" alt="Bird Image" />
            <button class="nav-button" id="next-button${randomPostfix}">&rsaquo;</button>
            <div class="photo-info">
                <strong>${currentImages[currentIndex].title}</strong> by ${currentImages[currentIndex].author || "Loading author..."}
            </div>
            <a href="${currentImages[currentIndex].flickrPage}" target="_blank">View on Flickr</a>
            <button class="dismiss-button" id="dismiss-button${randomPostfix}">Close</button>
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

        // Button event listeners
        document.getElementById(`prev-button${randomPostfix}`).addEventListener('click', () => navigate(-1));
        document.getElementById(`next-button${randomPostfix}`).addEventListener('click', () => navigate(1));
        document.getElementById(`dismiss-button${randomPostfix}`).addEventListener('click', hidePopup);

        // Keyboard event listeners
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
        const popup = document.getElementById(`bird-popup${randomPostfix}`);
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
        const prevButton = document.getElementById(`prev-button${randomPostfix}`);
        const nextButton = document.getElementById(`next-button${randomPostfix}`);
        if (prevButton) prevButton.style.display = currentIndex > 0 ? 'block' : 'none';
        if (nextButton) nextButton.style.display = currentIndex < currentImages.length - 1 ? 'block' : 'none';
    }

    // Hide popup
    function hidePopup() {
        console.log('Hiding popup.');
        pauseObserver();
        const popup = document.getElementById(`bird-popup${randomPostfix}`);
        if (popup) {
            popup.style.display = 'none';
            popupVisible = false;
        }
        resumeObserver();
    }

    // Debounce function to limit the rate of execution
    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Function to handle species highlight (for both mouse and touch events)
    function handleSpeciesHighlight(event) {
        let target;
        if (event.type === 'touchstart' || event.type === 'touchend') {
            // For touch events, use the first touch point
            target = event.touches ? event.touches[0].target : event.target;
        } else {
            // For mouse events, use the event target directly
            target = event.target;
        }

        // Check if the target has the 'bird-highlight' class
        if (target.classList.contains('bird-highlight')) {
            const species = target.textContent;
            console.log(`Highlight detected on species: ${species}`);
            fetchFlickrImages(species, (imageData) => showPopup(event, imageData));

            // Prevent default behavior for touchend events on bird-highlight elements
            if (event.type === 'touchend') {
                event.preventDefault();
            }
        }
    }

    // Attach event listeners for both mouse and touch events
    const debouncedHighlight = debounce(handleSpeciesHighlight, DEBOUNCE_DELAY);

    // Mouse events for desktop
    document.addEventListener('mouseover', debouncedHighlight);

    // Touch events for smartphones and tablets
    let touchStartX2, touchStartY2;

    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX2 = touch.clientX;
        touchStartY2 = touch.clientY;
    });

    document.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - touchStartX2);
        const deltaY = Math.abs(touch.clientY - touchStartY2);

        // Only trigger if the touch movement is small (e.g., less than 10 pixels)
        if (deltaX < 10 && deltaY < 10) {
            debouncedHighlight(e);
        }
    });

    await initializeScript();
    processSpecies();
    add_style();

    GM_registerMenuCommand("Clear Species List", function () {
        GM_setValue('speciesList', []);
        alert("Species list cleared. You should reload the page now");
    });

})();