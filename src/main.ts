// @deno-types="npm:@types/leaflet@^1.9.14"
// import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// // Deterministic random number generator
// import luck from "./luck.ts";

// const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

const container = document.getElementById("container") || document.body;

const button = document.createElement("button");
button.textContent = "Click Me";

button.addEventListener("click", () => {
  alert("You clicked the button!");
});

container.appendChild(button);
