let currentYear = 2020;
let map, heatmapLayer, regionsLayer;
let statsData = {};

function initMap() {
    map = L.map('map', {zoomControl: false}).setView([55.7558, 37.6173], 4);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    }).addTo(map);

    map.attributionControl.remove();

    loadData();
}

function loadData() {
    fetch('../data.json')
        .then(response => response.json())
        .then(data => {
            statsData = data;                
            loadGeoJSONData(); 
        });
}

function loadGeoJSONData() {
    const allGeoData = [];

    const loadFirst =  fetch('../russia_regions.geojson')
        .then(response => response.json())
        .then(geoData => {
            allGeoData.push(...geoData.features);
        })

    const loadSecond = fetch('../new_regions.geojson')
        .then(response => response.json())
        .then(geoData => {
            allGeoData.push(...geoData.features);
        });
        

    Promise.all([loadFirst, loadSecond])
        .then(() => {
            const combinedGeoData = {
                type: "FeatureCollection",
                features: allGeoData
            };
            createRegionsLayer(combinedGeoData);
            updateHeatmap();
        })
        .catch(error => {
            console.error("Ошибка загрузки GeoJSON:", error);
        });
  
}        

document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.querySelector(".header-team-btn");
    const teamdrop = document.querySelector(".header-drop");

    menuBtn.addEventListener('click', () => {
        teamdrop.classList.toggle("open");
    });
});

function createRegionsLayer(geoData) {
    regionsLayer = L.geoJSON(geoData, {
        style: function(feature) {
            const regionName = feature.properties.region;
            const regionStats = findRegionByName(regionName); 
            
            return {                    
                fillColor: 'transparent', 
                fillOpacity: 0,           
                weight: 1,                
                opacity: 0.7,             
                color: 'gray'             
            };
        },
        onEachFeature: function(feature, layer) {
            const regionName = feature.properties.region;
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

function updateHeatmap() {
    if (heatmapLayer) {
        map.removeLayer(heatmapLayer);
    }
    
    const heatPoints = [];
    
    regionsLayer.eachLayer(function(layer) {
        const center = layer.getBounds().getCenter();
        const regionName = layer.feature.properties.region;
        const regionStats = findRegionByName(regionName);
        
        if (regionStats && regionStats.data[currentYear]) {
            const percentage = regionStats.data[currentYear][0];
            heatPoints.push([
                center.lat,
                center.lng,
                percentage / 100
            ]);
        }
    });
    
    if (heatPoints.length > 0) {
        heatmapLayer = L.heatLayer(heatPoints, {
            radius: 40,
            blur: 5,
            maxZoom: 10,
            minOpacity: 0.3,
            max: 1.0,
            gradient: {
                0.1: 'rgb(212, 255, 100)',
                0.3: 'rgba(136, 255, 100, 1)', 
                0.5: 'rgb(86, 245, 96)',
                0.7: 'rgba(45, 218, 105, 1)',
                0.9: 'rgba(14, 178, 109, 1)'
            }
        }).addTo(map);

    } 
}

function highlightRegion(layer) {
    if (regionsLayer) {
        regionsLayer.eachLayer(function(regionLayer) {
            const regionName = regionLayer.feature.properties.region;
            const regionStats = findRegionByName(regionName);

                regionLayer.setStyle({ 
                    weight: 1, 
                    color: 'gray',
                    opacity: 0.7
                });
            });
        layer.setStyle({ 
            weight: 3, 
            color: '#007616ff',
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
                        ШПД: ${currentData[0]}%<br>
                        Домов: ${currentData[1]}
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
