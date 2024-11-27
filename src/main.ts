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

const playerPosition = JSON.parse(
  localStorage.getItem("playerPosition") ||
    JSON.stringify({
      lat: OAKES_CLASSROOM.lat,
      lng: OAKES_CLASSROOM.lng,
    }),
);

const map = leaflet.map(document.getElementById("map")!, {
  center: playerPosition,
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

const playerMarker = leaflet.marker(playerPosition);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

let playerPoints = Number(localStorage.getItem("playerPoints") || 0);
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = playerPoints > 0
  ? `Total points: ${playerPoints}`
  : "No points yet...";

const movementHistory: leaflet.LatLng[] = JSON.parse(
  localStorage.getItem("movementHistory") || "[]",
);

const polyline = leaflet
  .polyline(movementHistory, { color: "blue" })
  .addTo(map);

function savePlayerState() {
  localStorage.setItem("playerPosition", JSON.stringify(playerPosition));
  localStorage.setItem("playerPoints", playerPoints.toString());
}

function saveMovementHistory() {
  localStorage.setItem("movementHistory", JSON.stringify(movementHistory));
}

function saveCachesState() {
  localStorage.setItem(
    "cacheMementos",
    JSON.stringify(Array.from(cacheMementos.entries())),
  );
}

function savePlayerCoins() {
  localStorage.setItem("playerCoins", JSON.stringify(playerCoins));
}

function updateStorage() {
  savePlayerState();
  saveMovementHistory();
  saveCachesState();
  savePlayerCoins();
}

const savedCacheMementos = localStorage.getItem("cacheMementos");
if (savedCacheMementos) {
  const entries = JSON.parse(savedCacheMementos);
  for (const [key, value] of entries) {
    cacheMementos.set(key, value);
  }
}

// Load playerCoins from localStorage
const savedPlayerCoins = localStorage.getItem("playerCoins");
if (savedPlayerCoins) {
  const coins = JSON.parse(savedPlayerCoins);
  playerCoins.push(...coins);
}

updateCoinList();

function createCacheRectangle(i: number, j: number): leaflet.Rectangle {
  const origin = NULL_ISLAND;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [
      origin.lat + (i + 1) * TILE_DEGREES,
      origin.lng + (j + 1) * TILE_DEGREES,
    ],
  ]);
  return leaflet.rectangle(bounds).addTo(map);
}

function initializeCacheState(i: number, j: number): Cell {
  const key = `${i},${j}`;

  if (cacheMementos.has(key)) {
    // Use saved state
    const memento = cacheMementos.get(key)!;
    const rect = createCacheRectangle(i, j);
    return { i, j, rectangle: rect, coins: [...memento.coins] };
  } else {
    // Initialize new state
    const cell = flyweightHash({ i, j } as Cell);
    cacheMementos.set(key, {
      pointValue: cell.coins.length,
      coins: [...cell.coins],
    });
    return cell;
  }
}

function attachPopupHandlers(cell: Cell) {
  let pointValue = cell.coins.length;
  cell.rectangle.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>There is a cache here at "${cell.i},${cell.j}". It has value <span id="value">${pointValue}</span>.</div>
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

        const key = `${cell.i},${cell.j}`;
        cacheMementos.set(key, { pointValue, coins: [...cell.coins] });
        updateStorage();
        updateCoinList();
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

        const key = `${cell.i},${cell.j}`;
        cacheMementos.set(key, { pointValue, coins: [...cell.coins] });
        updateStorage();
        updateCoinList();
      },
    );

    return popupDiv;
  });
}

function spawnCache(i: number, j: number) {
  const cell = initializeCacheState(i, j);
  attachPopupHandlers(cell);
}

function initializeCaches() {
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
  movementHistory.push(
    leaflet.latLng(playerPosition.lat, playerPosition.lng),
  );
  polyline.addLatLng([
    playerPosition.lat,
    playerPosition.lng,
  ]);
  updateStorage();

  regenerateCaches();
});

document.getElementById("south")!.addEventListener("click", () => {
  playerPosition.lat -= TILE_DEGREES; // Move south
  movementHistory.push(
    leaflet.latLng(playerPosition.lat, playerPosition.lng),
  );
  polyline.addLatLng([
    playerPosition.lat,
    playerPosition.lng,
  ]);
  updateStorage();
  regenerateCaches();
});

document.getElementById("west")!.addEventListener("click", () => {
  playerPosition.lng -= TILE_DEGREES; // Move west
  movementHistory.push(
    leaflet.latLng(playerPosition.lat, playerPosition.lng),
  );
  polyline.addLatLng([
    playerPosition.lat,
    playerPosition.lng,
  ]);
  updateStorage();
  regenerateCaches();
});

document.getElementById("east")!.addEventListener("click", () => {
  playerPosition.lng += TILE_DEGREES; // Move east
  movementHistory.push(
    leaflet.latLng(playerPosition.lat, playerPosition.lng),
  );
  polyline.addLatLng([
    playerPosition.lat,
    playerPosition.lng,
  ]);
  updateStorage();
  regenerateCaches();
});

let watchId: number | null = null;
document
  .getElementById("sensor")!
  .addEventListener("click", () => {
    if (watchId === null) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          playerPosition.lat = position.coords.latitude;
          playerPosition.lng = position.coords.longitude;
          movementHistory.push(
            leaflet.latLng(
              playerPosition.lat,
              playerPosition.lng,
            ),
          );
          polyline.addLatLng([
            playerPosition.lat,
            playerPosition.lng,
          ]);
          updateStorage();
          regenerateCaches();
        },
        (error) => alert("Geolocation error: " + error.message),
        { enableHighAccuracy: true },
      );
      alert("Automatic position updating enabled.");
    } else {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      alert("Automatic position updating disabled.");
    }
  });

document.getElementById("reset")!.addEventListener("click", () => {
  const confirmReset = prompt(
    "Are you sure you want to erase your game state? Type 'yes' to confirm.",
  );
  if (confirmReset && confirmReset.toLowerCase() === "yes") {
    localStorage.clear();
    playerPoints = 0;
    playerCoins.length = 0;
    movementHistory.length = 0;
    polyline.setLatLngs([]);
    playerPosition.lat = OAKES_CLASSROOM.lat;
    playerPosition.lng = OAKES_CLASSROOM.lng;
    cacheMementos.clear();
    updateStorage();
    regenerateCaches();
    updateCoinList();
    statusPanel.innerHTML = "No points yet...";
    alert("Game state reset successfully!");
  }
});

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains("coin-id")) {
    const i = Number(target.dataset.i);
    const j = Number(target.dataset.j);
    const cacheLat = NULL_ISLAND.lat + i * TILE_DEGREES;
    const cacheLng = NULL_ISLAND.lng + j * TILE_DEGREES;
    map.setView([cacheLat, cacheLng], GAMEPLAY_ZOOM_LEVEL);
  }
});

function updateCoinList() {
  const coinListDiv = document.getElementById("coinList")!;
  coinListDiv.innerHTML = "";

  if (playerCoins.length === 0) {
    coinListDiv.innerText = "No collected coins yet.";
  } else {
    playerCoins.forEach((coin) => {
      const coinIdentity = coinToString(coin);
      const coinElement = document.createElement("span");
      coinElement.classList.add("coin-id");
      coinElement.dataset.i = coin.i.toString();
      coinElement.dataset.j = coin.j.toString();
      coinElement.innerText = coinIdentity;
      coinElement.style.display = "block";

      coinListDiv.appendChild(coinElement);
    });
  }
}

document.getElementById("coinListHeader")!.addEventListener("click", () => {
  const coinListDiv = document.getElementById("coinList")!;
  const coinListHeader = document.getElementById("coinListHeader")!;

  if (coinListDiv.style.display === "none") {
    coinListDiv.style.display = "block";
    coinListHeader.innerText = "Collected Coins ▲";
  } else {
    coinListDiv.style.display = "none";
    coinListHeader.innerText = "Collected Coins ▼";
  }
});
