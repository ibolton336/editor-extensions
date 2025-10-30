/**
 * Example React Component using Redux Toolkit
 *
 * ✅ KEY BENEFITS:
 * 1. useSelector only re-renders when selected data changes
 * 2. Memoized selectors prevent unnecessary re-computation
 * 3. No need for complex shouldUpdateState logic
 */

import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import {
  selectEnhancedIncidents,
  selectIncidentsByFile,
  selectIncidentCount,
  updateIncident,
} from '../slices/analysisSlice';

/**
 * ✅ BENEFIT: Component only re-renders when incidents array reference changes
 * NOT when other parts of state change (chat, ui, config, etc.)
 */
export function IncidentsList() {
  const dispatch = useDispatch();

  // ✅ Only re-renders when incidents array reference changes
  const incidents = useSelector(selectEnhancedIncidents);

  // ✅ Uses memoized selector - expensive groupBy only runs when incidents change
  const incidentsByFile = useSelector(selectIncidentsByFile);

  // ✅ Even cheaper - just returns length
  const count = useSelector(selectIncidentCount);

  const handleIncidentClick = (violationId: string) => {
    // ✅ Dispatch action instead of mutating state
    dispatch(
      updateIncident({
        violationId,
        updates: { /* some updates */ },
      })
    );
  };

  return (
    <div>
      <h2>Incidents ({count})</h2>
      {incidents.map((incident) => (
        <div key={incident.violationId} onClick={() => handleIncidentClick(incident.violationId)}>
          {incident.message}
        </div>
      ))}
    </div>
  );
}

/**
 * ✅ BENEFIT: Shallow equality check optimization
 * Component only re-renders if specific fields change
 */
export function AnalysisStatusIndicator() {
  const dispatch = useDispatch();

  // Multiple selectors - component re-renders only if ANY of these change
  const isAnalyzing = useSelector((state: RootState) => state.analysis.isAnalyzing);
  const serverState = useSelector((state: RootState) => state.analysis.serverState);

  // ❌ Chat messages changing does NOT trigger re-render here!
  // ✅ This is the power of selective subscriptions

  return (
    <div>
      {isAnalyzing ? 'Analyzing...' : 'Ready'}
      <span>Server: {serverState}</span>
    </div>
  );
}

/**
 * ✅ BENEFIT: Can use custom equality function for complex comparisons
 */
export function IncidentCount() {
  const count = useSelector(
    (state: RootState) => state.analysis.enhancedIncidents.length,
    // Custom equality - only re-render if count actually changed
    (left, right) => left === right
  );

  return <div>Total Incidents: {count}</div>;
}

/**
 * COMPARISON:
 *
 * ❌ OLD WAY (Context):
 * - Any state change → all consumers re-render
 * - Need manual shouldUpdateState checks
 * - Full state clone on every mutation
 *
 * ✅ NEW WAY (Redux):
 * - Only re-renders when selected data changes
 * - Automatic via reference equality
 * - Structural sharing = minimal cloning
 */
