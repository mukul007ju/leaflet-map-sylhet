
/* =========================================================
   CONFIGURATION
========================================================= */

const SUPABASE_URL = "https://ldkfpvmwmhooqgprgoxs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxka2Zwdm13bWhvb3FncHJnb3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTM0OTMsImV4cCI6MjA5MzMyOTQ5M30.noPI1ixmtugFRNuLZkhYFiA_pvxWc-iHrtgJeejCarY";
const TABLE = "rupayan_sylhet_pro_wgs";


/* =========================================================
   GLOBAL STATE VARIABLES
========================================================= */

let allData = [];
let filteredData = [];
let geoLayer;
let highlightLayer;

let measureActive = false;
let measurePoints = [];
let measureLine = null;

let measureMode = null;
let distancePoints = [];
let areaPoints = [];

let distanceLayer = null;
let areaLayer = null;
let tempMarkers = [];

let initialBounds = null;
let initialData = [];

let usedLabelPositions = [];


/* =========================================================
   MAP INITIALIZATION
========================================================= */

const map = L.map("map").setView([24.87,  91.85], 12);


/* =========================================================
   DEFAULT VIEW CONFIG
========================================================= */

const defaultView = {
    center: [24.87,  91.85],
    zoom: 12
};


/* =========================================================
   BASEMAPS
========================================================= */

const street = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "© OpenStreetMap contributors" }
);

const satellite = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" }
);

street.addTo(map);

const baseMaps = {
    "Street Map": street,
    "Satellite": satellite
};

L.control.layers(baseMaps, null, {
    position: "topright",
    collapsed: true
}).addTo(map);


/* =========================================================
   MOUSE COORDINATES
========================================================= */

map.on("mousemove", function (e) {

    document.getElementById("mouseCoords").innerHTML = `
        <b>Lat:</b> ${e.latlng.lat.toFixed(5)}<br>
        <b>Lon:</b> ${e.latlng.lng.toFixed(5)}
    `;
});


/* =========================================================
   OVERVIEW MAP
========================================================= */

const overviewMap = L.map("overviewMap", {
    attributionControl: false,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false
}).setView([47.8, 13.04], 8);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
).addTo(overviewMap);

let overviewRect;


/* =========================================================
   DATA LOADING
========================================================= */

async function loadData() {

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?select=*`,
        {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    const data = await res.json();

    allData = data;
    filteredData = data;
    initialData = data;

    renderMap(data);
    renderTable(data);
    loadColumns(data);
}

loadData();


/* =========================================================
   COLUMN LOADING (QUERY TOOL)
========================================================= */

function loadColumns(data) {

    const col = document.getElementById("columnSelect");

    col.innerHTML = "";

    Object.keys(data[0]).forEach(k => {

        if (k !== "geom") {

            let opt = document.createElement("option");

            opt.value = k;

            opt.textContent = k
                .replace(/_/g, " ")
                .toUpperCase();

            col.appendChild(opt);
        }
    });
}


/* =========================================================
   QUERY TOOL
========================================================= */

document.getElementById("queryBtn").addEventListener("click", function () {

    const column = document.getElementById("columnSelect").value;
    const value = document.getElementById("searchBox").value;

    filteredData = allData.filter(r =>
        r[column] && r[column].toString().toLowerCase().includes(value.toLowerCase())
    );

    renderMap(filteredData);
    renderTable(filteredData);
});


/* =========================================================
   MAP RENDER
========================================================= */

function renderMap(data) {

    if (geoLayer) map.removeLayer(geoLayer);

    geoLayer = L.geoJSON({
        type: "FeatureCollection",
        features: data.map(r => ({
            type: "Feature",
            geometry: parseGeom(r.geom),
            properties: r
        }))
    }, {
        style: {
            color: "#1565c0",
            weight: 1,
            fillColor: "#42a5f5",
            fillOpacity: 0.2
        },

        onEachFeature: (f, layer) => {

            layer.on("click", () => highlight(f));

if (f.properties && f.properties.plot) {

    const label = L.tooltip({
        permanent: true,
        direction: "center",
        className: "zone-label"
    }).setContent(f.properties.plot.toString());

    layer.bindTooltip(label);

    layer._labelText = f.properties.plot.toString();
    layer._labelLayer = label;
}
        }
    }).addTo(map);

    if (geoLayer.getBounds().isValid()) {
        map.fitBounds(geoLayer.getBounds());
    }

    if (!initialBounds && geoLayer.getBounds().isValid()) {
        initialBounds = geoLayer.getBounds();
    }
}


/* =========================================================
   OVERVIEW MAP UPDATE
========================================================= */

map.on("moveend", function () {

    const bounds = map.getBounds();

    overviewMap.fitBounds(bounds);

    if (overviewRect) {
        overviewMap.removeLayer(overviewRect);
    }

    overviewRect = L.rectangle(bounds, {
        color: "red",
        weight: 1,
        fillOpacity: 0
    }).addTo(overviewMap);
});


/* =========================================================
   LABEL CONTROL (ZOOM + COLLISION)
========================================================= */

function updateLabelsByZoom() {

    const zoom = map.getZoom();

    geoLayer.eachLayer(layer => {

        if (!layer.label) return;

        if (zoom < 11) {
            layer.closeTooltip();
        } else {
            layer.openTooltip();
        }
    });
}

map.on("zoomend", updateLabelsByZoom);

map.on("zoomend moveend", updateLabelCollision);

function updateLabelCollision() {

    usedLabelPositions = [];

    geoLayer.eachLayer(layer => {

        if (!layer._latlngs && !layer.getBounds) return;
        if (!layer._labelLayer) return;

        const center = layer.getBounds().getCenter();
        const point = map.latLngToContainerPoint(center);

        let tooClose = false;

        for (let p of usedLabelPositions) {

            const dx = point.x - p.x;
            const dy = point.y - p.y;

            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 30) {
                tooClose = true;
                break;
            }
        }

        if (tooClose) {
            layer.closeTooltip();
        } else {
            layer.openTooltip();
            usedLabelPositions.push(point);
        }
    });
}


/* =========================================================
   LOCATION SEARCH
========================================================= */

document.getElementById("locationSearch")
.addEventListener("keypress", async function (e) {

    if (e.key !== "Enter") return;

    const query = this.value;

    if (!query) return;

    const url =
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}`;

    try {

        const res = await fetch(url);
        const data = await res.json();

        if (!data.length) {
            alert("Location not found");
            return;
        }

        const place = data[0];

        map.setView([parseFloat(place.lat), parseFloat(place.lon)], 14);

        L.marker([place.lat, place.lon])
            .addTo(map)
            .bindPopup(place.display_name)
            .openPopup();

    } catch (err) {
        console.error(err);
    }
});


/* =========================================================
   FEATURE HIGHLIGHT
========================================================= */

function highlight(feature) {

    if (highlightLayer) {
        map.removeLayer(highlightLayer);
    }

    highlightLayer = L.geoJSON(feature, {
        style: {
            color: "red",
            weight: 4,
            fillColor: "yellow",
            fillOpacity: 0.5
        }
    }).addTo(map);

    const info = document.getElementById("featureInfo");

    let html = "";

    Object.entries(feature.properties).forEach(([k, v]) => {

        if (k !== "geom") {

            html += `
                <div>
                    <b>${k.replace(/_/g, " ").toUpperCase()}</b><br>
                    ${v ?? ""}
                </div>
            `;
        }
    });

    info.innerHTML = html;

    try {
        map.fitBounds(highlightLayer.getBounds());
    } catch (e) {}
}


/* =========================================================
   TABLE RENDERING
========================================================= */

function renderTable(data) {

    const table = document.getElementById("table");

    const clean = data.map(r => {
        const o = { ...r };
        delete o.geom;
        return o;
    });

    const cols = Object.keys(clean[0] || {});

    let html = `<thead class="table-dark"><tr>`;

    cols.forEach(c => html += `<th>${c.toUpperCase()}</th>`);

    html += `</tr></thead><tbody>`;

    clean.forEach((r, i) => {

        html += `<tr class="table-row" data-i="${i}">`;

        cols.forEach(c => html += `<td>${r[c] ?? ""}</td>`);

        html += `</tr>`;
    });

    html += `</tbody>`;

    table.innerHTML = html;

    addRowClick();
}


/* =========================================================
   ROW CLICK
========================================================= */

function addRowClick() {

    document.querySelectorAll(".table-row").forEach(row => {

        row.addEventListener("click", function () {

            const i = this.getAttribute("data-i");
            const f = filteredData[i];

            highlight({
                type: "Feature",
                geometry: parseGeom(f.geom),
                properties: f
            });
        });
    });
}


/* =========================================================
   GEOMETRY PARSER
========================================================= */

function parseGeom(g) {

    if (!g) return null;

    if (typeof g === "object") return g;

    try {
        return JSON.parse(g);
    } catch (e) {
        return null;
    }
}


/* =========================================================
   MEASURE TOOL SYSTEM
========================================================= */

const distanceBtn = document.getElementById("distanceBtn");
const areaBtn = document.getElementById("areaBtn");
const clearBtn = document.getElementById("clearMeasureBtn");

distanceBtn.addEventListener("click", () => {

    resetMeasureButtons();

    measureMode = "distance";

    distanceBtn.classList.add("measure-active");
});

areaBtn.addEventListener("click", () => {

    resetMeasureButtons();

    measureMode = "area";

    areaBtn.classList.add("measure-active");
});

clearBtn.addEventListener("click", clearMeasurements);

function resetMeasureButtons() {

    distanceBtn.classList.remove("measure-active");
    areaBtn.classList.remove("measure-active");
}


/* =========================================================
   MAP CLICK (MEASURE)
========================================================= */

map.on("click", function (e) {

    if (!measureMode) return;

    const latlng = e.latlng;

    const marker = L.circleMarker(latlng, {
        radius: 5,
        color: "black",
        fillColor: "yellow",
        fillOpacity: 1
    }).addTo(map);

    tempMarkers.push(marker);

    if (measureMode === "distance") {

        distancePoints.push(latlng);

        if (distanceLayer) map.removeLayer(distanceLayer);

        distanceLayer = L.polyline(distancePoints, {
            color: "blue",
            weight: 3
        }).addTo(map);

        let total = 0;

        for (let i = 1; i < distancePoints.length; i++) {
            total += map.distance(distancePoints[i - 1], distancePoints[i]);
        }

        updateDistance(total);
    }

    if (measureMode === "area") {

        areaPoints.push(latlng);

        if (areaLayer) map.removeLayer(areaLayer);

        areaLayer = L.polygon(areaPoints, {
            color: "green",
            fillOpacity: 0.2
        }).addTo(map);

        if (areaPoints.length >= 3) {
            const sqm = calculatePolygonArea(areaPoints);
            updateArea(sqm);
        }
    }
});


/* =========================================================
   MEASURE HELPERS
========================================================= */

function updateDistance(meters) {

    document.querySelectorAll(".measure-box")[0].innerHTML = `
        <b>Distance:</b><br>
        ${meters.toFixed(2)} m
    `;
}

function updateArea(area) {

    document.querySelectorAll(".measure-box")[1].innerHTML = `
        <b>Area:</b><br>
        ${area.toFixed(2)} sqm
    `;
}

function calculatePolygonArea(latlngs) {

    const pts = latlngs.map(p => [p.lng, p.lat]);

    let area = 0;

    for (let i = 0; i < pts.length; i++) {

        const j = (i + 1) % pts.length;

        area += pts[i][0] * pts[j][1];
        area -= pts[j][0] * pts[i][1];
    }

    area = Math.abs(area / 2);

    return area * 12365000000;
}

function clearMeasurements() {

    measureMode = null;

    resetMeasureButtons();

    distancePoints = [];
    areaPoints = [];

    if (distanceLayer) map.removeLayer(distanceLayer);
    if (areaLayer) map.removeLayer(areaLayer);

    tempMarkers.forEach(m => map.removeLayer(m));
    tempMarkers = [];

    updateDistance(0);
    updateArea(0);
}


/* =========================================================
   RESET MAP VIEW
========================================================= */

function resetMapView() {

    filteredData = initialData;

    renderMap(initialData);
    renderTable(initialData);

    if (initialBounds) {
        map.fitBounds(initialBounds);
    } else {
        map.setView([47.8, 13.04], 12);
    }

    if (highlightLayer) {
        map.removeLayer(highlightLayer);
        highlightLayer = null;
    }

    document.getElementById("searchBox").value = "";
    document.getElementById("columnSelect").selectedIndex = 0;
}

document.getElementById("resetMapBtn")
.addEventListener("click", resetMapView);