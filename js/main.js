let currentYear = 2020;
let map, heatmapLayer, regionsLayer;
let statsData = {};


function initMap() {
    const center = [65.0, 150.0];
    const initialZoom = 3;
    
    const worldBounds = L.latLngBounds(
        [-75, -180],
        [85, 180]
    );
    
    const maxBounds = L.latLngBounds(
        [-75, -210],
        [82, 210]
    );
    
    map = L.map('map', {
        zoomControl: false,
        center: center,
        zoom: initialZoom,
        maxBounds: maxBounds,
        maxBoundsViscosity: 0.8,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: false
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        noWrap: false,
        bounds: [[-85, -180], [85, 180]]
    }).addTo(map);

    map.attributionControl.remove();
    map.setMaxBounds(maxBounds);
       
    loadData();
}



function loadData() {
    fetch('../regions.json')
        .then(response => response.json())
        .then(data => {
            statsData = data;                
            loadGeoJSONData(); 
        })
        .catch(error => console.error('Error loading regions.json:', error));
}

function normalizeCoordinates(feature) {
    function normalizeLng(lng) {
        return lng < 0 ? lng + 360 : lng;
    }

    function processCoords(coords) {
        if (typeof coords[0] === "number") {
            return [ normalizeLng(coords[0]), coords[1] ];
        }

        return coords.map(c => processCoords(c));
    }

    if (feature.geometry && feature.geometry.coordinates) {
        feature.geometry.coordinates = processCoords(feature.geometry.coordinates);
    }

    return feature;
}


function loadGeoJSONData() {
    const allGeoData = [];

    const loadFirst = fetch('../russia_regions.geojson')
        .then(response => response.json())
        .then(geoData => {
            console.log('russia_regions loaded:', geoData.features.length, 'features');

            geoData.features.forEach(f => {
                const normalized = normalizeCoordinates(f);
                allGeoData.push(normalized);
            });
        })
        .catch(error => console.error('Error loading russia_regions:', error));
    
    const loadNewRegions = fetch('../new_regions.geojson')
        .then(response => response.json())
        .then(geoData => {
            console.log('new_regions loaded:', geoData.features.length, 'features');

            geoData.features.forEach(f => {
                const normalized = normalizeCoordinates(f);
                allGeoData.push(normalized);
            });
        })
        .catch(error => console.error('Error loading new_regions:', error));

    Promise.all([loadFirst, loadNewRegions])
        .then(() => {
            console.log('Total features after merge:', allGeoData.length);
            const combinedGeoData = {
                type: "FeatureCollection",
                features: allGeoData
            };
            createRegionsLayer(combinedGeoData);
            updateHeatmap();
        })
        .catch(error => console.error('Error in Promise.all:', error));
}

function createRegionsLayer(geoData) {
    regionsLayer = L.geoJSON(geoData, {
        style: function(feature) {
            const regionName = feature.properties.name || feature.properties.region;
            const regionStats = findRegionByName(regionName); 
            
            return {                    
                fillColor: 'transparent', 
                fillOpacity: 0,           
                weight: 2,                
                opacity: 0.8,             
                color: 'gray'             
            };
        },
        onEachFeature: function(feature, layer) {
            const regionName = feature.properties.name || feature.properties.region;
            const regionStats = findRegionByName(regionName);
            
            if (regionStats) {
                const updatePopup = function() {
                    const currentData = regionStats.data[currentYear];
                    if (currentData) {
                        return `
                            <b>${regionStats.region}</b><br>
                            Год: ${currentYear}<br>
                            ШПД: ${currentData[0]}%
                        `;
                    } else {
                        return `<b>${regionStats.region}</b><br>Нет данных за ${currentYear} год`;
                    }
                };
                
                layer.bindPopup(updatePopup());
                
                layer.on('click', function(e) {                        
                    layer.setPopupContent(updatePopup());
                    highlightRegion(layer);
                });
            } else {
                layer.bindPopup(`<b>${regionName}</b><br>Данные отсутствуют`);
            }
        }
    }).addTo(map);
}

function findRegionByName(name) {
    for (const regionId in statsData) {
        if (statsData[regionId].region === name) {
            return statsData[regionId];
        }
    }
    return null;
}

function fixLngBack(lng) {
    return lng > 180 ? lng - 360 : lng;
}

function updateHeatmap() {
    if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
    }
    
    // Обновляем стили регионов на основе данных
    regionsLayer.eachLayer(function(layer) {
        const regionName = layer.feature.properties.region;
        const regionStats = findRegionByName(regionName);
        
        if (regionStats && regionStats.data[currentYear]) {
            const percentage = regionStats.data[currentYear][0];
            const intensity = percentage / 100;
            
            // Определяем цвет на основе процента
            let color;
            if (percentage < 60) color = 'blue';
            else if (percentage < 70) color = 'cyan';
            else if (percentage < 75) color = 'lime';
            else if (percentage < 80) color = 'yellow';
            else if (percentage < 85) color = 'orange';
            else if (percentage < 90) color = 'red';
            else if (percentage < 95) color = 'darkred';
            else color = 'purple';
            
            // Применяем стиль
            layer.setStyle({
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1,
                color: '#333',
                opacity: 0.5
            });
            
            // Обновляем popup
            const popupContent = `
                <b>${regionStats.region}</b><br>
                Год: ${currentYear}<br>
                ШПД: ${percentage}%
            `;
            layer.bindPopup(popupContent);
        } else {
            // Серый цвет для регионов без данных
            layer.setStyle({
                fillColor: '#ccc',
                fillOpacity: 0.3,
                weight: 1,
                color: '#999',
                opacity: 0.3
            });
        }
    });
}

function highlightRegion(layer) {
    if (regionsLayer) {
        regionsLayer.eachLayer(function(regionLayer) {
            regionLayer.setStyle({ 
                weight: 1, 
                color: 'gray',
                opacity: 0.7
            });
        });
        layer.setStyle({ 
            weight: 3, 
            color: '#ff0000',
            opacity: 1
        });
    }
}
        
document.getElementById('yearSlider').addEventListener('input', function(e) {
    currentYear = parseInt(e.target.value);
    document.getElementById('currentYear').textContent = currentYear;

    if (regionsLayer) {
        regionsLayer.eachLayer(function(layer) {
            const regionName = layer.feature.properties.region;
            const regionStats = findRegionByName(regionName);
            
            if (regionStats) {
                const currentData = regionStats.data[currentYear];
                if (currentData) {
                    layer.setPopupContent(`
                        <b>${regionStats.region}</b><br>
                        Год: ${currentYear}<br>
                        ШПД: ${currentData[0]}%
                    `);
                } else {
                    layer.setPopupContent(`<b>${regionStats.region}</b><br>Нет данных за ${currentYear} год`);
                }
            }
        });
    }
    
    updateHeatmap();
});

initMap();