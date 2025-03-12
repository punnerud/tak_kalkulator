// Price calculation constants
const PRICE_CONFIG = {
    rigging: 1500, // Rigging kostnad i NOK
    pricePerM2: {
        flat: 85,    // Pris per m² for flatt tak
        sloped: 95   // Pris per m² for skråtak
    },
    osloCenter: {
        lat: 59.9139,
        lon: 10.7522
    },
    travelCostPerKm: 15, // Reisekostnad per km
    maxDistance: 50  // Maksimal distanse i km
};

// Global function to handle quote request
window.requestQuote = function(area, roofType, distance, areaPrice, travelCost, totalPrice) {
    const address = document.getElementById('address-input').value;
    const heightResult = document.getElementById('height-result').textContent;
    
    const emailSubject = `Pristilbud på takvask - ${address}`;
    const emailBody = `
Hei!

Jeg ønsker pristilbud på takvask basert på følgende beregning:

Adresse: ${address}
${heightResult}
Takareal: ${Math.round(area)} m²
Taktype: ${roofType === 'flat' ? 'Flatt tak' : 'Skråtak'}
Avstand fra Oslo: ${Math.round(distance)} km

Estimert pris:
- Rigging: ${PRICE_CONFIG.rigging} kr
- Takvask: ${areaPrice} kr (${PRICE_CONFIG.pricePerM2[roofType]} kr/m²)
- Reisekostnad: ${travelCost} kr
- Totalt: ${totalPrice} kr (inkl. mva)

Vennligst send meg et bindende pristilbud.

Med vennlig hilsen
`;

    const mailtoLink = `mailto:post@takvask.no?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoLink;
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize map
    const map = L.map('map').setView([20, 0], 2); // Default view of the world
    
    // Define base maps
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    });
    
    // Add satellite layer to map by default
    satelliteLayer.addTo(map);
    
    // Create layer control
    const baseMaps = {
        "Satellitt": satelliteLayer,
        "Gatekart": osmLayer
    };
    
    L.control.layers(baseMaps, null, {position: 'topright'}).addTo(map);
    
    // Create a feature group for markers
    const markersLayer = L.featureGroup().addTo(map);
    
    // Create a feature group for drawn items
    const drawnItems = new L.FeatureGroup().addTo(map);
    
    // Initialize the draw control and pass it the FeatureGroup of editable layers
    const drawControl = new L.Control.Draw({
        draw: {
            marker: false,
            circlemarker: false,
            circle: false,
            rectangle: false,
            polyline: false,
            polygon: {
                allowIntersection: false,
                showArea: true,
                shapeOptions: {
                    color: '#3388ff',
                    weight: 3
                }
            }
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);
    
    // Add custom draw button with indicator (initially hidden)
    const mapContainer = document.getElementById('map');
    const drawButtonContainer = document.createElement('div');
    drawButtonContainer.className = 'draw-button-container';
    drawButtonContainer.innerHTML = `
        <div class="indicator-arrow">↓</div>
        <button class="draw-area-btn pulse">
            <span class="draw-icon">✏️</span>
            Tegn takområdet
        </button>
    `;
    mapContainer.appendChild(drawButtonContainer);
    
    // Initially hide the draw button container
    drawButtonContainer.style.display = 'none';
    
    // Add event listener to the custom draw button
    const drawAreaBtn = drawButtonContainer.querySelector('.draw-area-btn');
    drawAreaBtn.addEventListener('click', function() {
        // Trigger the polygon drawing tool
        new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
        
        // Remove pulse effect and indicator once clicked
        this.classList.remove('pulse');
        const indicator = drawButtonContainer.querySelector('.indicator-arrow');
        if (indicator) {
            indicator.style.display = 'none';
        }
    });
    
    // Get DOM elements
    const addressInput = document.getElementById('address-input');
    const searchButton = document.getElementById('search-button');
    const searchResults = document.getElementById('search-results');
    const areaValue = document.getElementById('area-value');
    
    // Add event listeners
    searchButton.addEventListener('click', performSearch);
    addressInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Event handler for when a polygon is created
    map.on('draw:created', function(e) {
        // Clear previous drawn items
        drawnItems.clearLayers();
        
        const layer = e.layer;
        drawnItems.addLayer(layer);
        
        // Calculate area
        calculateArea(layer);
        
        // Hide the draw button with fade effect
        drawButtonContainer.classList.add('hidden');
        
        // Add class to shrink map
        document.getElementById('map').classList.add('with-area');
        // Show area info
        document.getElementById('area-info').classList.add('visible');

        // Wait for transition to complete before fitting bounds
        setTimeout(() => {
            // Get the bounds of the drawn polygon
            const bounds = layer.getBounds();
            
            // Calculate appropriate zoom level based on polygon size
            const polygonArea = calculatePolygonArea(layer);
            let paddingValue;
            
            // Adjust padding based on area size
            if (polygonArea > 1000000) { // > 1 km²
                paddingValue = 80;
            } else if (polygonArea > 100000) { // > 0.1 km²
                paddingValue = 60;
            } else {
                paddingValue = 40;
            }
            
            // Fit the map to the drawn polygon with calculated padding
            map.fitBounds(bounds, {
                padding: [paddingValue, paddingValue],
                maxZoom: 19,
                animate: true,
                duration: 1
            });
            
            // Force a map refresh
            map.invalidateSize({
                animate: true,
                duration: 0.5
            });
        }, 500);
    });
    
    // Event handler for when a polygon is edited
    map.on('draw:edited', function(e) {
        const layers = e.layers;
        layers.eachLayer(function(layer) {
            calculateArea(layer);
            
            // Get the bounds of the edited polygon
            const bounds = layer.getBounds();
            const polygonArea = calculatePolygonArea(layer);
            
            // Adjust padding based on area size
            let paddingValue;
            if (polygonArea > 1000000) {
                paddingValue = 80;
            } else if (polygonArea > 100000) {
                paddingValue = 60;
            } else {
                paddingValue = 40;
            }
            
            // Update map view with new bounds
            map.fitBounds(bounds, {
                padding: [paddingValue, paddingValue],
                maxZoom: 19,
                animate: true,
                duration: 1
            });
            
            map.invalidateSize({
                animate: true,
                duration: 0.5
            });
        });
    });
    
    // Event handler for when a polygon is deleted
    map.on('draw:deleted', function() {
        areaValue.textContent = '';
        
        // Remove the shrunk map class
        document.getElementById('map').classList.remove('with-area');
        // Hide area info
        document.getElementById('area-info').classList.remove('visible');
        
        // Wait for transition to complete before updating map
        setTimeout(() => {
            map.invalidateSize();
            
            // Only show the draw button if markers exist
            if (markersLayer.getLayers().length > 0) {
                drawButtonContainer.classList.remove('hidden');
                drawButtonContainer.style.display = 'block';
                drawAreaBtn.classList.add('pulse');
                const indicator = drawButtonContainer.querySelector('.indicator-arrow');
                if (indicator) {
                    indicator.style.display = 'block';
                }
            }
        }, 500);
        
        // Show building details form
        document.getElementById('building-details').style.display = 'none';
        document.getElementById('height-result').textContent = '';
        document.getElementById('floor-count').value = '1';
        const radioButtons = document.querySelectorAll('input[name="roof-type"]');
        radioButtons.forEach(radio => radio.checked = false);
        
        // Reset floor and roof selections
        document.querySelectorAll('.floor-btn, .roof-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('custom-floors').style.display = 'none';
        document.getElementById('height-result').style.display = 'none';
    });
    
    // Function to calculate area of a polygon
    function calculateArea(layer) {
        const latlngs = layer.getLatLngs()[0];
        
        // Convert to GeoJSON
        const coordinates = latlngs.map(latlng => [latlng.lng, latlng.lat]);
        
        // Close the polygon by adding the first point at the end
        coordinates.push(coordinates[0]);
        
        // Create a polygon using turf.js
        const polygon = turf.polygon([coordinates]);
        
        // Calculate area in square meters
        const area = turf.area(polygon);
        
        // Format the area
        let formattedArea;
        if (area >= 1000000) {
            formattedArea = `${(area / 1000000).toFixed(2)} km²`;
        } else {
            formattedArea = `${Math.round(area)} m²`;
        }
        
        // Display the area
        areaValue.textContent = `Areal: ${formattedArea}`;
        
        // Show building details form
        document.getElementById('building-details').style.display = 'block';
    }
    
    // Helper function to calculate polygon area in square meters
    function calculatePolygonArea(layer) {
        const latlngs = layer.getLatLngs()[0];
        const coordinates = latlngs.map(latlng => [latlng.lng, latlng.lat]);
        coordinates.push(coordinates[0]); // Close the polygon
        const polygon = turf.polygon([coordinates]);
        return turf.area(polygon);
    }
    
    // Function to perform the search
    function performSearch() {
        const query = addressInput.value.trim();
        
        if (query === '') {
            alert('Vennligst skriv inn en adresse');
            return;
        }
        
        // Show loading state
        searchButton.disabled = true;
        searchButton.textContent = 'Søker...';
        searchResults.innerHTML = '<p>Søker...</p>';
        
        // Reset map size and area info when performing new search
        document.getElementById('map').classList.remove('with-area');
        document.getElementById('area-info').classList.remove('visible');
        drawButtonContainer.classList.add('hidden');
        
        // Call the Nominatim API for geocoding
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Nettverksfeil');
                }
                return response.json();
            })
            .then(data => {
                // Reset loading state
                searchButton.disabled = false;
                searchButton.textContent = 'Søk';
                
                // Clear previous results
                searchResults.innerHTML = '';
                markersLayer.clearLayers();
                drawnItems.clearLayers(); // Clear any drawn polygons
                areaValue.textContent = ''; // Clear area display
                
                if (data.length === 0) {
                    searchResults.innerHTML = '<p>Ingen resultater funnet. Prøv et annet søk.</p>';
                    drawButtonContainer.style.display = 'none';
                    return;
                }
                
                // Display results and add markers to the map
                data.forEach(result => {
                    // Create marker
                    const marker = L.marker([result.lat, result.lon])
                        .bindPopup(`<strong>${result.display_name}</strong><br><button class="draw-around-btn">Tegn område</button>`)
                        .addTo(markersLayer);
                    
                    // Add event listener to the popup content when it's opened
                    marker.on('popupopen', function() {
                        setTimeout(() => {
                            const drawBtn = document.querySelector('.draw-around-btn');
                            if (drawBtn) {
                                drawBtn.addEventListener('click', function() {
                                    // Trigger the polygon drawing tool
                                    new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
                                    marker.closePopup();
                                    
                                    // Remove pulse effect and indicator
                                    drawAreaBtn.classList.remove('pulse');
                                    const indicator = drawButtonContainer.querySelector('.indicator-arrow');
                                    if (indicator) {
                                        indicator.style.display = 'none';
                                    }
                                });
                            }
                        }, 100);
                    });
                    
                    // Create result item in the list
                    const resultItem = document.createElement('div');
                    resultItem.className = 'result-item';
                    resultItem.innerHTML = `
                        <div class="result-name">${result.name || result.display_name.split(',')[0]}</div>
                        <div class="result-address">${result.display_name}</div>
                    `;
                    
                    // Add click event to the result item
                    resultItem.addEventListener('click', function() {
                        map.setView([result.lat, result.lon], 16);
                        marker.openPopup();
                    });
                    
                    searchResults.appendChild(resultItem);
                });
                
                // If we have results, zoom to the first one and show the draw button
                if (data.length > 0) {
                    map.fitBounds(markersLayer.getBounds());
                    
                    // Show the draw button now that we have pins
                    drawButtonContainer.style.display = 'block';
                    drawButtonContainer.classList.remove('hidden'); // Remove the hidden class
                    drawAreaBtn.classList.add('pulse');
                    const indicator = drawButtonContainer.querySelector('.indicator-arrow');
                    if (indicator) {
                        indicator.style.display = 'block';
                    }
                }
            })
            .catch(error => {
                console.error('Feil ved søk:', error);
                searchButton.disabled = false;
                searchButton.textContent = 'Søk';
                searchResults.innerHTML = '<p>En feil oppstod under søket. Vennligst prøv igjen.</p>';
                
                // Hide the draw button in case of error
                drawButtonContainer.style.display = 'none';
                drawButtonContainer.classList.add('hidden');
            });
    }
    
    // Add event listeners for floor buttons
    document.querySelector('.floor-buttons').addEventListener('click', function(e) {
        if (e.target.classList.contains('floor-btn')) {
            // Remove active class from all buttons
            document.querySelectorAll('.floor-btn').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            e.target.classList.add('active');
            
            const floors = e.target.dataset.floors;
            
            if (floors === '5') {
                // Show custom floor input for 5+ floors
                document.getElementById('custom-floors').style.display = 'flex';
                document.getElementById('floor-count').focus();
            } else {
                // Hide custom floor input and calculate height
                document.getElementById('custom-floors').style.display = 'none';
                calculateBuildingHeight(parseInt(floors));
            }
        }
    });
    
    // Add event listener for custom floor count
    document.getElementById('apply-floors').addEventListener('click', function() {
        const customFloors = parseInt(document.getElementById('floor-count').value);
        if (customFloors >= 5) {
            calculateBuildingHeight(customFloors);
        }
    });
    
    // Add event listeners for roof buttons
    document.querySelector('.roof-buttons').addEventListener('click', function(e) {
        if (e.target.classList.contains('roof-btn')) {
            // Remove active class from all roof buttons
            document.querySelectorAll('.roof-btn').forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            e.target.classList.add('active');
            
            // Get current floor count
            let floors;
            const activeFloorBtn = document.querySelector('.floor-btn.active');
            if (activeFloorBtn && activeFloorBtn.dataset.floors === '5') {
                floors = parseInt(document.getElementById('floor-count').value);
            } else if (activeFloorBtn) {
                floors = parseInt(activeFloorBtn.dataset.floors);
            }
            
            if (floors) {
                calculateBuildingHeight(floors);
            }
        }
    });
    
    function calculateBuildingHeight(floors) {
        const roofType = document.querySelector('.roof-btn.active')?.dataset.roof;
        
        if (!floors || !roofType) {
            return;
        }
        
        const standardFloorHeight = 3;
        let totalHeight = floors * standardFloorHeight;
        
        if (roofType === 'sloped') {
            totalHeight += 2.5;
        } else {
            totalHeight += 0.5;
        }
        
        const heightResult = document.getElementById('height-result');
        heightResult.textContent = `Estimert bygghøyde: ${totalHeight.toFixed(1)} meter`;
        heightResult.style.display = 'block';
        
        // Show price calculation button after height is calculated
        document.getElementById('calculate-price').style.display = 'block';
    }

    // Function to calculate distance between two points
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    // Function to calculate cleaning price
    function calculateCleaningPrice() {
        const area = calculatePolygonArea(drawnItems.getLayers()[0]);
        const roofType = document.querySelector('.roof-btn.active')?.dataset.roof;
        const marker = markersLayer.getLayers()[0];
        
        if (!area || !roofType || !marker) {
            alert('Mangler nødvendig informasjon for prisberegning');
            return;
        }

        // Calculate distance from Oslo center
        const distance = calculateDistance(
            PRICE_CONFIG.osloCenter.lat,
            PRICE_CONFIG.osloCenter.lon,
            marker.getLatLng().lat,
            marker.getLatLng().lng
        );

        if (distance > PRICE_CONFIG.maxDistance) {
            const priceResult = document.getElementById('price-result');
            priceResult.innerHTML = `
                <div class="price-details">
                    <p class="outside-area">Dette området er utenfor vårt serviceområde (${Math.round(distance)} km fra Oslo).</p>
                    <p>Ta kontakt for et spesialtilbud.</p>
                </div>
            `;
            priceResult.style.display = 'block';
            return;
        }

        // Calculate costs
        const areaPrice = Math.round(area * PRICE_CONFIG.pricePerM2[roofType]);
        const travelCost = Math.round(distance * PRICE_CONFIG.travelCostPerKm * 2); // Tur/retur
        const totalPrice = PRICE_CONFIG.rigging + areaPrice + travelCost;

        const priceResult = document.getElementById('price-result');
        priceResult.innerHTML = `
            <div class="price-details">
                <p><strong>Avstand fra Oslo:</strong> ${Math.round(distance)} km</p>
                <p><strong>Rigging:</strong> ${PRICE_CONFIG.rigging} kr</p>
                <p><strong>Takvask:</strong> ${areaPrice} kr (${PRICE_CONFIG.pricePerM2[roofType]} kr/m² - ${roofType === 'flat' ? 'flatt tak' : 'skråtak'})</p>
                <p><strong>Reisekostnad:</strong> ${travelCost} kr</p>
                <p class="total-price"><strong>Totalpris:</strong> ${totalPrice} kr</p>
                <p class="price-note">* Alle priser er estimater inkl. mva</p>
                
                <button onclick="requestQuote(${area}, '${roofType}', ${distance}, ${areaPrice}, ${travelCost}, ${totalPrice})" class="quote-request-btn">
                    <span class="lock-icon">🔒</span>
                    Få prislås (uforpliktende)
                </button>
                <p class="quote-note">Anbefales før bestilling - få pristilbud på e-post</p>
                
                <div class="value-proposition">
                    <h4>Hvorfor velge takvask?</h4>
                    <ul>
                        <li><strong>Unngå kostbar takutskiftning:</strong> Et nytt tak koster typisk 1000-2000 kr/m² (${Math.round(area * 1500)} kr for ditt tak)</li>
                        <li><strong>Økt levetid:</strong> Regelmessig takvask kan forlenge takets levetid med 10-15 år</li>
                        <li><strong>Forebyggende vedlikehold:</strong> Mose og alger holder på fuktighet som kan føre til frostskader og råte</li>
                        <li><strong>Energisparing:</strong> Et rent tak reflekterer sollys bedre og kan redusere kjølebehov om sommeren</li>
                        <li><strong>Verdiøkning:</strong> Et velholdt tak øker husets verdi og førsteinntrykk</li>
                    </ul>
                    <p class="savings-highlight"><strong>Potensiell besparelse:</strong> ${Math.round(area * 1500 - totalPrice).toLocaleString()} kr sammenlignet med takutskiftning</p>
                </div>
            </div>
        `;
        priceResult.style.display = 'block';
    }

    // Add event listener for price calculation button
    document.getElementById('calculate-price').addEventListener('click', calculateCleaningPrice);
}); 