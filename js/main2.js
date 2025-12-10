let currentYear = 2020;
let map, heatmapLayer, regionsLayer;
let statsData = {};


function initMap() {
    map = L.map('map', { zoomControl: false }).setView([55.7558, 37.6173], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(map);

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

    const loadFirst = fetch('../russia_regions.geojson')
        .then(response => response.json())
        .then(geoData => allGeoData.push(...geoData.features));

    const loadSecond = fetch('../new_regions.geojson')
        .then(response => response.json())
        .then(geoData => allGeoData.push(...geoData.features));

    Promise.all([loadFirst, loadSecond])
        .then(() => {
            createRegionsLayer({
                type: "FeatureCollection",
                features: allGeoData
            });
            updateHeatmap();
        })
        .catch(error => console.error("Ошибка загрузки GeoJSON:", error));
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
    const teamdrop = document.querySelector(".header-drop-legens");

    menuBtn.addEventListener('click', () => {
        teamdrop.classList.toggle("open");
    });
});

function createRegionsLayer(geoData) {
    regionsLayer = L.geoJSON(geoData, {
        style: () => ({
            fillColor: 'transparent',
            fillOpacity: 0,
            weight: 1,
            opacity: 0.7,
            color: 'gray'
        }),

        onEachFeature: function (feature, layer) {
            const regionName = feature.properties.region;
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

            const safeId = regionName.replace(/\s+/g, '');

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

function updateHeatmap() {
    if (heatmapLayer) map.removeLayer(heatmapLayer);

    const heatPoints = [];

    regionsLayer.eachLayer(layer => {
        const center = layer.getBounds().getCenter();
        const regionName = layer.feature.properties.region;
        const regionStats = findRegionByName(regionName);

        if (regionStats && regionStats.data[currentYear]) {
            const percentage = regionStats.data[currentYear][0];
            heatPoints.push([center.lat, center.lng, percentage / 100]);
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
    regionsLayer.eachLayer(regionLayer => {
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

document.getElementById('yearSlider').addEventListener('input', function (e) {
    currentYear = parseInt(e.target.value);
    document.getElementById('currentYear').textContent = currentYear;

    regionsLayer.eachLayer(layer => {
        const regionName = layer.feature.properties.region;
        const regionStats = findRegionByName(regionName);
        if (!regionStats) return;

        const safeId = regionName.replace(/\s+/g, '');
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
