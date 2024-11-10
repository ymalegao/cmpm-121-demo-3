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

const cellCache = new Map<string, Cell>();

interface Cell {
  i: number;
  j: number;
  rectangle: leaflet.Rectangle;
  coins: Coin[];
}

const playerCoins: Coin[] = [];

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
  const cell = flyweightHash({ i, j } as Cell);
  let pointValue = cell.coins.length;

  cell.rectangle.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>There is a cache here at "${i},${j}". It has value <span id="value">${pointValue}</span>.</div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        if (pointValue <= 0) {
          return;
        }
        const currentcoin = cell.coins.pop();
        playerCoins.push(currentcoin!);

        pointValue--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        playerPoints++;
        const coinIdentity = coinToString(currentcoin!);
        statusPanel.innerHTML =
          `Collected coin ${coinIdentity}. Total points: ${playerPoints}`;
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins.length <= 0) {
          return;
        }
        const currentcoin = playerCoins.pop();
        cell.coins.push(currentcoin!);
        playerPoints--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        pointValue++;
        const coinIdentity = coinToString(currentcoin!);
        statusPanel.innerHTML =
          `Deposited coin ${coinIdentity}. Total points: ${playerPoints}`;
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

function flyweightHash(cell: Cell): Cell {
  const key = `${cell.i},${cell.j}`;
  if (cellCache.has(key)) {
    console.log(`Using cached cell for ${key}`);
    return cellCache.get(key)!;
  }
  const origin = NULL_ISLAND;
  const bounds = leaflet.latLngBounds([
    [origin.lat + cell.i * TILE_DEGREES, origin.lng + cell.j * TILE_DEGREES],
    [
      origin.lat + (cell.i + 1) * TILE_DEGREES,
      origin.lng + (cell.j + 1) * TILE_DEGREES,
    ],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  const pointValue = Math.floor(
    luck([cell.i, cell.j, "initialValue"].toString()) * 100,
  );

  const coins: Coin[] = [];
  for (let serial = 0; serial < pointValue; serial++) {
    coins.push({ i: cell.i, j: cell.j, serial });
  }

  const cellData: Cell = { i: cell.i, j: cell.j, rectangle: rect, coins };

  cellCache.set(key, cellData);

  return cellData;
}

function coinToString(coin: Coin) {
  return `${coin.i}:${coin.j}#${coin.serial}`;
}
