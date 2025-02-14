// ==UserScript==
// @name         Bird Species Image Preview
// @namespace    http://tampermonkey.net/
// @version      1.6
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

(function() {
    'use strict';

    const FLICKR_API_KEY = 'd141faa4e492baf9a0bbfb558f50d062';
    let speciesList = [];
    let currentIndex = 0;
    let currentImages = [];
    let popupVisible = false;

    // Create an input element for file selection
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

    // Handle file selection and load the species list
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
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

    // Process the loaded species list
    function processSpecies() {
        GM_addStyle(`
            .bird-popup {
                position: absolute;
                z-index: 10000;
                background: white;
                border: 1px solid black;
                padding: 10px;
                box-shadow: 2px 2px 10px rgba(0,0,0,0.5);
                max-width: 900px;
                display: none;
            }
            .bird-popup img {
                width: 600px; /* Increase thumbnail size */
                height: auto;
                display: block;
                margin: 10px auto;
            }
            .bird-highlight {
                background-color: yellow;
                cursor: pointer;
            }
            .bird-popup .nav-button {
                padding: 5px 10px;
                background-color: #007bff;
                color: white;
                cursor: pointer;
                text-align: center;
                margin: 10px 0;
                display: inline-block;
            }
            .bird-popup .nav-button.disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
        `);

        function findSpeciesInText(node) {
            if (node.nodeType === 3 && node.parentNode) {
                let text = node.nodeValue;
                let parent = node.parentNode;
                let replaced = false;

                speciesList.forEach(species => {
                    const regex = new RegExp(`\\b${species}\\b`, 'gi');
                    if (text.match(regex)) {
                        console.log(`Found species in text: ${species}`);
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
            } else if (node.nodeType === 1 && node.childNodes) {
                [...node.childNodes].forEach(findSpeciesInText);
            }
        }

        function fetchFlickrImages(species, callback) {
            console.log(`Fetching images for: ${species}`);
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://www.flickr.com/services/rest/?method=flickr.photos.search&api_key=${FLICKR_API_KEY}&tags=${encodeURIComponent(species)}&format=json&nojsoncallback=1&per_page=10`,
                headers: {
                    'Origin': 'null'
                },
                anonymous: true,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        console.log(`Flickr response:`, data);
                        if (data.photos && data.photos.photo.length > 0) {
                            const photos = data.photos.photo.slice(0, 10); // Take the first 10 photos
                            const imageUrls = photos.map(photo => `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_c.jpg`);
                            callback(imageUrls);
                        } else {
                            console.log(`No images found for: ${species}`);
                            callback([]);
                        }
                    } catch (error) {
                        console.error(`Error parsing Flickr response:`, error);
                    }
                },
                onerror: function(error) {
                    console.error(`Error fetching images for ${species}:`, error);
                    callback([]);
                }
            });
        }

        function showPopup(e, imageUrls) {
            if (imageUrls.length === 0) return;

            currentImages = imageUrls;
            currentIndex = 0;

            let popup = document.getElementById('bird-popup');
            if (!popup) {
                popup = document.createElement('div');
                popup.id = 'bird-popup';
                popup.className = 'bird-popup';
                document.body.appendChild(popup);
            }

            popup.innerHTML = `
                <img src="${currentImages[currentIndex]}" alt="Bird Image" />
                <div class="nav-button" id="prev-button">Prev</div>
                <div class="nav-button" id="next-button">Next</div>
            `;

            // Disable buttons if at the start or end
            const prevButton = document.getElementById('prev-button');
            const nextButton = document.getElementById('next-button');
            prevButton.classList.toggle('disabled', currentIndex === 0);
            nextButton.classList.toggle('disabled', currentIndex === currentImages.length - 1);

            popup.style.top = `${e.pageY + 10}px`;
            popup.style.left = `${e.pageX + 10}px`;
            popup.style.display = 'block';

            // Event listeners for navigation buttons
            prevButton.addEventListener('click', function() {
                if (currentIndex > 0) {
                    currentIndex--;
                    updateImage();
                }
            });

            nextButton.addEventListener('click', function() {
                if (currentIndex < currentImages.length - 1) {
                    currentIndex++;
                    updateImage();
                }
            });

            function updateImage() {
                popup.querySelector('img').src = currentImages[currentIndex];
                prevButton.classList.toggle('disabled', currentIndex === 0);
                nextButton.classList.toggle('disabled', currentIndex === currentImages.length - 1);
            }

            popupVisible = true;
        }

        function hidePopup() {
            const popup = document.getElementById('bird-popup');
            if (popup) {
                popup.style.display = 'none';
                popupVisible = false;
            }
        }

        document.addEventListener('mouseover', function(e) {
            if (e.target.classList.contains('bird-highlight')) {
                const species = e.target.textContent;
                console.log(`Hovered over species: ${species}`);
                fetchFlickrImages(species, (imageUrls) => showPopup(e, imageUrls));
            }
        });

        document.addEventListener('mouseout', function(e) {
            if (e.target.classList.contains('bird-highlight') && !popupVisible) {
                console.log(`Mouse out from: ${e.target.textContent}`);
                hidePopup();
            }
        });

        console.log("Starting bird species detection...");
        findSpeciesInText(document.body);
        console.log("Bird species detection completed.");
    }

    // Create file input on page load
    createFileInput();

})();
