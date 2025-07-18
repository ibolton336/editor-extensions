import React from "react";
import "./DiffLegend.css";

export const DiffLegend: React.FC = () => {
  return (
    <div className="diff-legend">
      <span className="legend-title">Legend:</span>
      <div className="legend-item">
        <div className="legend-color addition"></div>
        <span>Added</span>
      </div>
      <div className="legend-item">
        <div className="legend-color deletion"></div>
        <span>Removed</span>
      </div>
      <div className="legend-item">
        <div className="legend-color context"></div>
        <span>Context</span>
      </div>
    </div>
  );
};
