import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { TripDataProvider } from "./contexts/TripDataContext";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <React.StrictMode>
    <TripDataProvider>
      <App />
    </TripDataProvider>
  </React.StrictMode>
);
