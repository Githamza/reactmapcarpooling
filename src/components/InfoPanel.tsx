import React, { useState } from "react";
import { useTripData } from "../contexts/TripDataContext";
import MapLegend from "./MapLegend";
import { InfoPanelProps } from "../types";
import { formatNumber, formatDistance, formatDate } from "../utils/format";
import { MIN_ZOOM_FOR_TRIPS } from "../config";

const InfoPanel: React.FC<InfoPanelProps> = ({ mapStats, selectedZone }) => {
  const { isLoading, stats, fetchTripData, selectedTrip, clearSelectedTrip } =
    useTripData();

  // Panel is collapsible; hidden by default on small (mobile) screens so the
  // map is visible, shown by default on desktop.
  const [isOpen, setIsOpen] = useState<boolean>(
    () => typeof window === "undefined" || window.innerWidth >= 768
  );

  const handleRefresh = (): void => {
    fetchTripData();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="info-panel-toggle"
        aria-label="Afficher le panneau d'information"
      >
        <span aria-hidden="true">ℹ️</span>
        <span>Infos</span>
      </button>
    );
  }

  return (
    <div className="info-panel">
      {/* Header (pinned) */}
      <div className="shrink-0 border-b border-gray-200 pb-3 mb-3 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Covoiturage en France</h1>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            Visualisation des trajets de covoiturage en France
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="shrink-0 -mr-1 -mt-1 h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          aria-label="Masquer le panneau"
          title="Masquer"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="info-panel__body">
        {/* Current view — or, when a zone/cluster is selected, its details */}
        {selectedZone ? (
          <div className="map-stats mb-4 p-3 border border-pink-300 bg-pink-50 rounded-md">
            <h3 className="text-sm font-bold text-pink-700 mb-1">
              {selectedZone.town}
            </h3>
            <div className="text-xs space-y-1">
              <p>
                <strong>Départs:</strong>{" "}
                {formatNumber(selectedZone.startCount)} ·{" "}
                <strong>Arrivées:</strong> {formatNumber(selectedZone.endCount)}
              </p>
              {selectedZone.intraCount > 0 && (
                <p>
                  <strong>Trajets internes:</strong>{" "}
                  {formatNumber(selectedZone.intraCount)}
                </p>
              )}
              {selectedZone.topDestinations.length > 0 && (
                <div>
                  <strong>Top destinations:</strong>
                  <ul className="list-disc ml-4 mt-0.5">
                    {selectedZone.topDestinations.map((d, i) => (
                      <li key={i}>
                        {d.town} ({formatNumber(d.count)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-gray-500 pt-1">
                Cliquez la zone à nouveau pour désélectionner
              </p>
            </div>
          </div>
        ) : (
          mapStats && (
            <div className="map-stats mb-4 p-2 border border-gray-300 bg-gray-50 rounded-md">
              <h3 className="text-sm font-semibold mb-1">Vue actuelle</h3>
              <div className="text-xs">
                <p>Zoom: {mapStats.zoom?.toFixed(1) || "N/A"}</p>
                {mapStats.zoom < MIN_ZOOM_FOR_TRIPS ? (
                  <p>
                    Zones: {formatNumber(mapStats.zoneCount)} · Flux:{" "}
                    {formatNumber(mapStats.flowCount)}
                  </p>
                ) : (
                  <p>Trajets affichés: {formatNumber(mapStats.tripCount)}</p>
                )}
                <p className="text-gray-500 mt-1">
                  {mapStats.zoom < MIN_ZOOM_FOR_TRIPS
                    ? `${formatNumber(mapStats.totalTripsInView)} départs dans la vue — cliquez une zone ou un flux pour les détails`
                    : mapStats.totalTripsInView > mapStats.tripCount
                      ? `Affichage limité à ${formatNumber(
                          mapStats.tripCount
                        )} trajets sur ${formatNumber(
                          mapStats.totalTripsInView
                        )} pour des performances optimales`
                      : `${formatNumber(mapStats.totalTripsInView)} trajets dans la vue`}
                </p>
              </div>
            </div>
          )
        )}

      {/* Selected Trip Information */}
      {selectedTrip && (
        <div className="selected-trip mb-4 p-3 border border-blue-300 bg-blue-50 rounded-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-blue-700">
              Trajet sélectionné
            </h3>
            <button
              type="button"
              onClick={() => clearSelectedTrip()}
              className="text-xs text-gray-500 hover:text-gray-700"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="text-xs">
            <p>
              <strong>Date:</strong> {formatDate(selectedTrip.datetime)}
            </p>
            <p>
              <strong>Distance:</strong>{" "}
              {formatDistance(selectedTrip.journey_distance)}
            </p>
            {selectedTrip.operator_class && (
              <p>
                <strong>Classe d'opérateur:</strong>{" "}
                {selectedTrip.operator_class}
              </p>
            )}
            {selectedTrip.passenger_seats > 0 && (
              <p>
                <strong>Passagers:</strong> {selectedTrip.passenger_seats}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats Information */}
      <div className="stats-section mb-4 p-3 border border-green-200 bg-green-50 rounded-md">
        <h3 className="text-sm font-semibold text-green-700 mb-2">
          Statistiques générales
        </h3>
        <div className="text-xs">
          <p>
            <strong>Nombre total de trajets:</strong>{" "}
            {formatNumber(stats.totalTrips)}
          </p>
          <p>
            <strong>Distance totale parcourue:</strong>{" "}
            {formatDistance(stats.totalDistance)}
          </p>
        </div>
      </div>

        {/* Legend */}
        <div className="legend-section">
          <h3 className="text-sm font-semibold mb-2">Légende</h3>
          <MapLegend />
        </div>
      </div>

      {/* Footer with refresh button (pinned) */}
      <div className="footer shrink-0 border-t border-gray-200 pt-3 mt-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="refresh-button w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {isLoading ? "Chargement..." : "Rafraîchir les données"}
        </button>
      </div>
    </div>
  );
};

export default InfoPanel;
