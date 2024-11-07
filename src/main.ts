// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

import "./style.css";

// Deterministic random number generator
import luck from "./luck.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const NULL_ISLAND = leaflet.latLng(0, 0);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const cellCache = new Map<string, leaflet.Rectangle>();

interface Cell {
  i: number;
  j: number;
  cache?: Coin[];
}

interface Coin {
  i: number;
  j: number;
  serial: number;
}

const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

function spawnCache(i: number, j: number) {
  const rect = flyweightHash({ i, j });
  let pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);
  //fill up the Cache with coins and their serial numbers
  // for (let serial = 0; serial < pointValue; serial++) {
  console.log("Spawning cache at", i, j, "with value", pointValue);

  // }
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>There is a cache here at "${i},${j}". It has value <span id="value">${pointValue}</span>.</div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        pointValue--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        playerPoints++;
        statusPanel.innerHTML = `${playerPoints} points accumulated`;
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        playerPoints--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        pointValue--;
        statusPanel.innerHTML = `${playerPoints} points accumulated`;
      },
    );

    return popupDiv;
  });
}

const oakesGrid = translateLatLngToTile(
  OAKES_CLASSROOM.lat,
  OAKES_CLASSROOM.lng,
);
console.log("Oakes classroom is at", oakesGrid);
const mapCenterLatLng: [number, number] = [
  oakesGrid.i * TILE_DEGREES,
  oakesGrid.j * TILE_DEGREES,
];

map.setView(mapCenterLatLng, GAMEPLAY_ZOOM_LEVEL);
const baseI = oakesGrid.i;
const baseJ = oakesGrid.j;

for (let i = baseI - NEIGHBORHOOD_SIZE; i < baseI + NEIGHBORHOOD_SIZE; i++) {
  for (let j = baseJ - NEIGHBORHOOD_SIZE; j < baseJ + NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

function translateLatLngToTile(lat: number, lng: number) {
  //global coordinate sysetm anchored at Null Island
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function flyweightHash(Cell: Cell): leaflet.Rectangle {
  const key = `${Cell.i},${Cell.j}`;
  if (cellCache.has(key)) {
    return cellCache.get(key)!;
  }
  const origin = NULL_ISLAND;
  const bounds = leaflet.latLngBounds([
    [origin.lat + Cell.i * TILE_DEGREES, origin.lng + Cell.j * TILE_DEGREES],
    [
      origin.lat + (Cell.i + 1) * TILE_DEGREES,
      origin.lng + (Cell.j + 1) * TILE_DEGREES,
    ],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  cellCache.set(key, rect);
  return rect;
}
