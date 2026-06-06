
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
let queryConditions = [];


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
   FEATURE COUNT (QUERY TOOL)
========================================================= */

function updateFeatureCount(selected, total) {

    const el = document.getElementById("featureCount");

    if (!el) {
        console.log("featureCount div NOT found");
        return;
    }

    el.innerHTML = `${selected} Selected of ${total} Features`;

    console.log("Counter updated:", selected, total);
}



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
   ADVANCED QUERY BUILDER
========================================================= */

document.getElementById("addQueryBtn")
.addEventListener("click", function () {

    const column =
        document.getElementById("columnSelect").value;

    const operator =
        document.getElementById("operatorSelect").value;

    const value =
        document.getElementById("searchBox").value.trim();

    if (!value) {
        alert("Enter a value");
        return;
    }

    queryConditions.push({
        column,
        operator,
        value
    });

    displayQueryConditions();

    document.getElementById("searchBox").value = "";
});


document.getElementById("runQueryBtn")
.addEventListener("click", function () {

    filteredData = allData.filter(row => {

        return queryConditions.every(cond => {

            const val = row[cond.column];

            if (val === null || val === undefined)
                return false;

            switch (cond.operator) {

                case "=":
                    return String(val).toLowerCase() ===
                        cond.value.toLowerCase();

                case "!=":
                    return String(val).toLowerCase() !==
                        cond.value.toLowerCase();

                case ">":
                    return Number(val) >
                        Number(cond.value);

                case "<":
                    return Number(val) <
                        Number(cond.value);

                case ">=":
                    return Number(val) >=
                        Number(cond.value);

                case "<=":
                    return Number(val) <=
                        Number(cond.value);

                case "contains":
                default:
                    return String(val)
                        .toLowerCase()
                        .includes(cond.value.toLowerCase());
            }
        });
    });

    clearHighlight();

    renderMap(filteredData);
    renderTable(filteredData);

    updateFeatureCount(
        filteredData.length,
        allData.length
    );
});


document.getElementById("clearQueryBtn")
.addEventListener("click", function () {

    queryConditions = [];

    filteredData = [...allData];

    renderMap(filteredData);
    renderTable(filteredData);

    updateFeatureCount(
        filteredData.length,
        allData.length
    );

    document.getElementById("activeQueries").innerHTML = "";

    document.getElementById("searchBox").value = "";
});


function displayQueryConditions() {

    const div =
        document.getElementById("activeQueries");

    if (!div) return;

    let html = "";

    queryConditions.forEach((q, i) => {

        html += `
        <div>
            ${i + 1}.
            ${q.column}
            ${q.operator}
            ${q.value}
        </div>`;
    });

    div.innerHTML = html;
}


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

            layer.on("click", () => {

    const i = filteredData.findIndex(r => r === f.properties);

    const feature = {
        type: "Feature",
        geometry: f.geometry,
        properties: f.properties
    };

    selectFeature(i, feature);
});

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

  
}


/* =========================================================
   ROW CLICK
========================================================= */

document.getElementById("table").addEventListener("click", function (e) {

    const row = e.target.closest(".table-row");
    if (!row) return;

    const i = parseInt(row.getAttribute("data-i"));
    const f = filteredData[i];

    // remove old selection
    document.querySelectorAll(".table-row").forEach(r => {
        r.classList.remove("selected");
    });

    // select new row
    row.classList.add("selected");

    // scroll (fast mode)
    row.scrollIntoView({
        block: "center",
        behavior: "auto"
    });

    const feature = {
        type: "Feature",
        geometry: parseGeom(f.geom),
        properties: f
    };

    requestAnimationFrame(() => {
        highlight(feature);
    });
});


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

    disableFeatureInteraction();   // 👈 ADD THIS

    distanceBtn.classList.add("measure-active");
});

areaBtn.addEventListener("click", () => {

    resetMeasureButtons();

    measureMode = "area";

    disableFeatureInteraction();   // 👈 ADD THIS

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

    // ✅ RESTORE FEATURE INTERACTION AFTER MEASURE MODE
    enableFeatureInteraction();

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
	
	queryConditions = [];

const activeQueries =
    document.getElementById("activeQueries");

if (activeQueries) {
    activeQueries.innerHTML = "";
}

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

clearHighlight();

/* =========================================================
   CLEAR HIGHLIGHT
========================================================= */

function clearHighlight() {
    if (highlightLayer) {
        map.removeLayer(highlightLayer);
        highlightLayer = null;
    }
    document.getElementById("featureInfo").innerHTML = "";
}

/* =========================================================
   DISABLE RIGHTCLICK
========================================================= */

function clearHighlight() {
    if (highlightLayer) {
        map.removeLayer(highlightLayer);
        highlightLayer = null;
    }
    document.getElementById("featureInfo").innerHTML = "";
	
	document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
});
}

/* =========================================================
   SELECT FEATURE AND HIGHLIGHT IN ROW
========================================================= */

let selectedRowIndex = null;

function selectFeature(index, feature) {

    selectedRowIndex = index;

    // clear previous selection
    document.querySelectorAll(".table-row").forEach(r => {
        r.classList.remove("selected");
    });

    const row = document.querySelector(`.table-row[data-i="${index}"]`);

    if (row) {
        row.classList.add("selected");

        // ✅ SCROLL TO ROW 
        row.scrollIntoView({
            behavior: "auto",
            block: "center"
        });
    }

    highlight(feature);
}

/* =========================================================
   DISABLE FEATURE SELECTION WHEN MEASURING
========================================================= */

function disableFeatureInteraction() {

    if (!geoLayer) return;

    geoLayer.eachLayer(layer => {
        if (layer.getElement) {
            const el = layer.getElement();
            if (el) el.style.pointerEvents = "none";
        }

        // also disable tooltip click interference
        layer.off("click");
    });
}

function enableFeatureInteraction() {

    if (!geoLayer) return;

    geoLayer.eachLayer(layer => {

        if (layer.getElement) {
            const el = layer.getElement();
            if (el) el.style.pointerEvents = "auto";
        }

        // rebind click again safely
        layer.off("click"); // avoid duplicates

        layer.on("click", () => {

            const i = filteredData.findIndex(r => r === layer.feature.properties);

            const feature = {
                type: "Feature",
                geometry: layer.feature.geometry,
                properties: layer.feature.properties
            };

            selectFeature(i, feature);
        });
    });
}


/* =========================================================
   EXPORT TABLE (PROFESSIONAL PDF)
========================================================= */

document.getElementById("exportTablePdfBtn")
.addEventListener("click", function () {

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });

    /* =========================================================
       QUERY TITLE
    ========================================================= */

    let queryTitle = "All Features";

    if (queryConditions && queryConditions.length > 0) {

        queryTitle = queryConditions
            .map(q => `${q.column} ${q.operator} ${q.value}`)
            .join(" AND ");
    }

    /* =========================================================
       PREPARE DATA
    ========================================================= */

    const cleanData = filteredData.map(row => {

        const obj = {};

        Object.keys(row).forEach(key => {

            if (key === "geom") return;

            let value = row[key];

            // limit decimals to 3
            if (
                typeof value === "number" &&
                !Number.isInteger(value)
            ) {
                value = Number(value).toFixed(3);
            }

            obj[key.toUpperCase()] = value;
        });

        return obj;
    });

    if (cleanData.length === 0) {

        alert("No records found.");

        return;
    }

    const columns = Object.keys(cleanData[0]);

    const rows = cleanData.map(row =>
        columns.map(col => row[col] ?? "")
    );

    /* =========================================================
       TABLE
    ========================================================= */

    pdf.autoTable({

        head: [columns],

        body: rows,

        startY: 32,

        margin: {
            top: 30,
            left: 8,
            right: 8,
            bottom: 12
        },

        theme: "grid",

        styles: {
            fontSize: 7,
            cellPadding: 1.8,
            overflow: "linebreak",
            valign: "middle",
            textColor: [0, 0, 0]
        },

        headStyles: {
            fillColor: [33, 37, 41],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "center",
            valign: "middle",
            fontSize: 7
        },

        alternateRowStyles: {
            fillColor: [245, 245, 245]
        },

        didDrawPage: function (data) {

            const pageWidth =
                pdf.internal.pageSize.getWidth();

            const pageHeight =
                pdf.internal.pageSize.getHeight();

            /* ===============================
               HEADER
            =============================== */

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(13);

            pdf.text(
                "ATTRIBUTE QUERY RESULT",
                10,
                10
            );

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(8);

            pdf.text(
                `QUERY: ${queryTitle}`,
                10,
                16
            );

            pdf.text(
                `TOTAL FEATURES: ${cleanData.length}`,
                10,
                21
            );

            pdf.line(
                10,
                24,
                pageWidth - 10,
                24
            );

            /* ===============================
               FOOTER
            =============================== */

            pdf.setFontSize(8);

            pdf.text(
                `PAGE ${data.pageNumber}`,
                pageWidth - 25,
                pageHeight - 6
            );

            pdf.text(
                new Date().toLocaleDateString(),
                10,
                pageHeight - 6
            );
        }
    });

    /* =========================================================
       SAVE PDF
    ========================================================= */

    pdf.save("attribute_table.pdf");

});