let currentYear = 2020;
let map, heatmapLayer, regionsLayer;
let statsData = {};


function initMap() {
    const center = [65.0, 150.0];
    const initialZoom = 3;

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


function createSafeId(name) {
    if (!name) return 'unknown';
    
    // Убираем все не-буквенно-цифровые символы, включая скобки
    return name
        .replace(/[()\[\]{}]/g, '')  // убираем скобки
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]/g, '') // оставляем только буквы и цифры
        .replace(/\s+/g, '');
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

document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.querySelector(".header-team-btn");
    const teamdrop = document.querySelector(".header-drop");

    menuBtn.addEventListener('click', () => {
        teamdrop.classList.toggle("open");
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const menuBtn = document.querySelector(".header-legend-btn");
    const teamdrop = document.querySelector(".header-drop-legend");

    menuBtn.addEventListener('click', () => {
        teamdrop.classList.toggle("open");
    });
});

function createRegionsLayer(geoData) {
    regionsLayer = L.geoJSON(geoData, {
        style: function() {
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
            
            if (!regionStats) {
                layer.bindPopup(`
                    <div class="header-text">${regionName}</div>
                    <div class="team-text-position">Данные отсутствуют</div>
                `);
                return;
            }

            layer.chartInstance = null;
            layer.ringInstance = null;

            const safeId = createSafeId(regionName);
            const popupHTML = `
                <div class="header-text">
                    ${regionStats.region}
                </div>

                <div id="info-${safeId}" style="margin-bottom:8px;">
                    <span class="team-text-position">Год:</span> 
                    <span class="team-text-position year-value"></span><br>
                    <span class="team-text-position">ШПД:</span> 
                    <span class="team-text-position spd-value"></span>
                </div>

                <!-- Кольцевой график — теперь первый -->
                <div id="ring-title-${safeId}"
                     style="text-align:center; margin:16px 0 8px 0;" 
                     class="team-text-position">
                    Распространение ШПД (${currentYear})
                </div>

                <div style="width:140px; height:140px; margin:auto;">
                    <canvas id="ring-${safeId}" width="140" height="140"></canvas>
                </div>

                <br>

                <!-- Линейный график — теперь второй -->
                <div style="text-align:center; margin:12px 0 8px 0;" class="team-text-position">
                    Динамика по годам
                </div>

                <canvas id="chart-${safeId}" width="250" height="120"></canvas>
            `;

            layer.bindPopup(popupHTML);

            layer.on('popupopen', () => {
                if (layer.chartInstance) {
                    layer.chartInstance.destroy();
                    layer.chartInstance = null;
                }
                if (layer.ringInstance) {
                    layer.ringInstance.destroy();
                    layer.ringInstance = null;
                }
                const infoBox = document.querySelector(`#info-${safeId}`);
                if (infoBox) {
                    const yearBox = infoBox.querySelector(".year-value");
                    const spdBox = infoBox.querySelector(".spd-value");
                    const valueNow = regionStats.data[currentYear]?.[0] ?? "—";

                    yearBox.textContent = currentYear;
                    spdBox.textContent = valueNow + "%";
                }

                const ringTitle = document.getElementById(`ring-title-${safeId}`);
                if (ringTitle) {
                    ringTitle.textContent = `Распространение ШПД (${currentYear})`;
                }

                const years = Object.keys(regionStats.data);
                const values = years.map(y => regionStats.data[y][0]);

                const ctxLine = document.getElementById(`chart-${safeId}`);
                const ctxRing = document.getElementById(`ring-${safeId}`);

                if (!layer.ringInstance) {
                    const current = regionStats.data[currentYear][0];

                    const gradient = ctxRing.getContext("2d")
                        .createLinearGradient(0, 0, 140, 140);

                    gradient.addColorStop(0, "#22ccb4");
                    gradient.addColorStop(0.5, "#56f560");
                    gradient.addColorStop(1, "#e7ff4e");

                    layer.ringInstance = new Chart(ctxRing, {
                        type: 'doughnut',
                        data: {
                            labels: ["ШПД"],
                            datasets: [{
                                data: [current, 100 - current],
                                backgroundColor: [gradient, "#e5e5e5"],
                                borderWidth: 0,
                                cutout: "70%"
                            }]
                        },
                        options: {
                            events: [],
                            plugins: {
                                legend: { display: false },
                                tooltip: { enabled: false },
                                title: { display: false }
                            }
                        }
                    });
                }

                if (!layer.chartInstance) {
                    layer.chartInstance = new Chart(ctxLine, {
                        type: 'line',
                        data: {
                            labels: years,
                            datasets: [{
                                data: values,
                                borderWidth: 2,
                                tension: 0.3,
                                borderColor: '#22cc69',
                                pointBackgroundColor: '#22cc69'
                            }]
                        },
                        options: {
                            plugins: {
                                legend: { display: false },
                                title: { display: false }
                            },
                            scales: {
                                x: { 
                                    ticks: { 
                                        display: true,
                                        callback: function(value, index, ticks) {
                                            if (index === 0) return '2020';
                                            if (index === ticks.length - 1) return '2024';
                                            return '';
                                        },
                                        font: {
                                            size: 11,
                                            weight: '600'
                                        }
                                    },
                                    grid: { display: false }
                                },
                                y: { ticks: { display: false }, grid: { display: false } }
                            }
                        }
                    });
                }
            });

            layer.on("popupclose", () => {
                if (layer.chartInstance) {
                    layer.chartInstance.destroy();
                    layer.chartInstance = null;
                }
                if (layer.ringInstance) {
                    layer.ringInstance.destroy();
                    layer.ringInstance = null;
                }
            });

            layer.on("click", () => highlightRegion(layer));
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
            if (percentage < 60) color = 'rgb(212, 255, 100)';
            else if (percentage < 70) color = 'rgba(136, 255, 100, 1)';
            else if (percentage < 75) color = 'rgb(86, 245, 96)';
            else if (percentage < 80) color = 'rgba(45, 218, 105, 1)';
            else if (percentage < 85) color = 'rgba(12, 170, 78, 1)';
            else if (percentage < 90) color = 'rgba(3, 138, 59, 1)';
            else if (percentage < 95) color = 'rgba(0, 92, 54, 1)';
            else if (percentage >= 95) color = 'rgba(2, 68, 40, 1)';
            
            layer.setStyle({
                fillColor: color,
                fillOpacity: 0.7,
                weight: 1,
                color: 'rgba(192, 255, 216, 1)',
                opacity: 0.5
            });
            
            const popup = layer.getPopup();

            if (popup && popup._isOpen) {
                const safeId = createSafeId(regionName);

            const infoBox = document.getElementById(`info-${safeId}`);
            if (infoBox) {
                 infoBox.querySelector('.year-value').textContent = currentYear;
                infoBox.querySelector('.spd-value').textContent = percentage + '%';
            }

}
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
            color: 'rgba(234, 59, 0, 1)',
            opacity: 1
        });
    }
}
        
document.getElementById('yearSlider').addEventListener('input', function (e) {
    currentYear = parseInt(e.target.value);
    document.getElementById('currentYear').textContent = currentYear;

    regionsLayer.eachLayer(layer => {
        const regionName = layer.feature.properties.region;
        const regionStats = findRegionByName(regionName);
        if (!regionStats) return;

        const safeId = createSafeId(regionName);
        const infoBox = document.getElementById(`info-${safeId}`);

        if (infoBox) {
            const currentData = regionStats.data[currentYear];
            infoBox.innerHTML = `
                <span class="team-text-position">Год:</span> 
                <span class="team-text-position">${currentYear}</span><br>
                <span class="team-text-position">ШПД:</span> 
                <span class="team-text-position">${currentData ? currentData[0] : "—"}%</span>
            `;
        }

        if (layer.chartInstance) {
            const years = Object.keys(regionStats.data);
            const values = years.map(y => regionStats.data[y][0]);

            layer.chartInstance.data.datasets[0].data = values;
            layer.chartInstance.update();
        }

        if (layer.ringInstance) {
            const newValue = regionStats.data[currentYear][0];

            layer.ringInstance.data.datasets[0].data = [newValue, 100 - newValue];
            layer.ringInstance.update();
        }

        const ringTitle = document.getElementById(`ring-title-${safeId}`);
        if (ringTitle) {
            ringTitle.textContent = `Распространение ШПД (${currentYear})`;
            ringTitle.className = "team-text-position";
            ringTitle.style.cssText = 'text-align:center; margin:16px 0 8px 0;';
        }
    });

    updateHeatmap();
});

initMap();
