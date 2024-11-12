// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);
const NULL_ISLAND = leaflet.latLng(0, 0);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const cellCache = new Map<string, Cell>();
const cacheMementos = new Map<string, { pointValue: number; coins: Coin[] }>();

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

const playerPosition = { lat: OAKES_CLASSROOM.lat, lng: OAKES_CLASSROOM.lng };

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
  const key = `${i},${j}`;

  let cell: Cell;
  if (cacheMementos.has(key)) {
    const memento = cacheMementos.get(key)!;
    const origin = NULL_ISLAND;
    const bounds = leaflet.latLngBounds([
      [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
      [
        origin.lat + (i + 1) * TILE_DEGREES,
        origin.lng + (j + 1) * TILE_DEGREES,
      ],
    ]);

    const rect = leaflet.rectangle(bounds);
    rect.addTo(map);
    cell = { i, j, rectangle: rect, coins: [...memento.coins] };
  } else {
    cell = flyweightHash({ i, j } as Cell);
    cacheMementos.set(key, {
      pointValue: cell.coins.length,
      coins: [...cell.coins],
    });
  }

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
        if (pointValue <= 0) return;
        const currentCoin = cell.coins.pop();
        playerCoins.push(currentCoin!);

        pointValue--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        playerPoints++;
        const coinIdentity = coinToString(currentCoin!);
        statusPanel.innerHTML =
          `Collected coin ${coinIdentity}. Total points: ${playerPoints}`;

        cacheMementos.set(key, { pointValue, coins: [...cell.coins] });
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        if (playerCoins.length <= 0) return;
        const currentCoin = playerCoins.pop();
        cell.coins.push(currentCoin!);
        playerPoints--;
        pointValue++;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        const coinIdentity = coinToString(currentCoin!);
        statusPanel.innerHTML =
          `Deposited coin ${coinIdentity}. Total points: ${playerPoints}`;

        cacheMementos.set(key, { pointValue, coins: [...cell.coins] });
      },
    );

    return popupDiv;
  });
}

function initializeCaches() {
  const { i, j } = translateLatLngToTile(
    OAKES_CLASSROOM.lat,
    OAKES_CLASSROOM.lng,
  );
  for (let x = i - NEIGHBORHOOD_SIZE; x <= i + NEIGHBORHOOD_SIZE; x++) {
    for (let y = j - NEIGHBORHOOD_SIZE; y <= j + NEIGHBORHOOD_SIZE; y++) {
      if (luck([x, y].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(x, y);
      }
    }
  }
}

initializeCaches();

function translateLatLngToTile(lat: number, lng: number) {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function flyweightHash(cell: Cell): Cell {
  const key = `${cell.i},${cell.j}`;
  if (cellCache.has(key)) {
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

function clearCaches() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });
}

function regenerateCaches() {
  clearCaches();

  const { i, j } = translateLatLngToTile(
    playerPosition.lat,
    playerPosition.lng,
  );

  for (let x = i - NEIGHBORHOOD_SIZE; x <= i + NEIGHBORHOOD_SIZE; x++) {
    for (let y = j - NEIGHBORHOOD_SIZE; y <= j + NEIGHBORHOOD_SIZE; y++) {
      if (luck([x, y].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(x, y);
      }
    }
  }

  map.setView([playerPosition.lat, playerPosition.lng], GAMEPLAY_ZOOM_LEVEL);
  playerMarker.setLatLng([playerPosition.lat, playerPosition.lng]);
}

document.getElementById("north")!.addEventListener("click", () => {
  playerPosition.lat += TILE_DEGREES; // Move north
  regenerateCaches();
});

document.getElementById("south")!.addEventListener("click", () => {
  playerPosition.lat -= TILE_DEGREES; // Move south
  regenerateCaches();
});

document.getElementById("west")!.addEventListener("click", () => {
  playerPosition.lng -= TILE_DEGREES; // Move west
  regenerateCaches();
});

document.getElementById("east")!.addEventListener("click", () => {
  playerPosition.lng += TILE_DEGREES; // Move east
  regenerateCaches();
});
