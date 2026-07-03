import React, { useState, useCallback } from "react";
import { useTripData } from "./contexts/TripDataContext";
import Map from "./components/Map";
import InfoPanel from "./components/InfoPanel";
import MessageToast from "./components/MessageToast";
import { MapStats, SelectedZone } from "./types";

function App(): React.ReactElement {
  const { message } = useTripData();
  const [mapStats, setMapStats] = useState<MapStats | null>(null);
  const [selectedZone, setSelectedZone] = useState<SelectedZone | null>(null);

  // Handle map stats updates from Map component
  const handleMapStatsChange = useCallback((stats: MapStats): void => {
    setMapStats(stats);
  }, []);

  // Selected zone/cluster details, shown in the InfoPanel's current-view section
  const handleSelectedZoneChange = useCallback(
    (zone: SelectedZone | null): void => {
      setSelectedZone(zone);
    },
    []
  );

  return (
    <div className="App relative">
      <Map
        onStatsChange={handleMapStatsChange}
        onSelectedZoneChange={handleSelectedZoneChange}
      />
      <InfoPanel mapStats={mapStats} selectedZone={selectedZone} />
      {message && <MessageToast type={message.type} text={message.text} />}
    </div>
  );
}

export default App;
