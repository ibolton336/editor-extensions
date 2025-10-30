/**
 * Example React Components using Zustand
 *
 * ✅ BENEFITS:
 * - Simpler than Redux (no useDispatch, no action creators)
 * - Still has selective subscriptions
 * - Auto-batches updates like Redux
 */

import React from 'react';
import {
  useExtensionStore,
  selectIncidentCount,
  selectIncidentsByFile,
} from '../store';

/**
 * ✅ BENEFIT: Component only re-renders when incidents change
 * Simple selector-based subscription
 */
export function IncidentsList() {
  // ✅ Only re-renders when enhancedIncidents array reference changes
  const incidents = useExtensionStore((state) => state.enhancedIncidents);

  // ✅ Get actions directly (no useDispatch needed)
  const setEnhancedIncidents = useExtensionStore((state) => state.setEnhancedIncidents);

  const handleRefresh = () => {
    // Call action directly
    setEnhancedIncidents([/* new data */]);
  };

  return (
    <div>
      <h2>Incidents ({incidents.length})</h2>
      <button onClick={handleRefresh}>Refresh</button>
      {incidents.map((incident) => (
        <div key={incident.violationId}>
          {incident.message}
        </div>
      ))}
    </div>
  );
}

/**
 * ✅ BENEFIT: Multiple selectors - only re-renders if ANY of them change
 */
export function AnalysisStatusIndicator() {
  const isAnalyzing = useExtensionStore((state) => state.isAnalyzing);
  const serverState = useExtensionStore((state) => state.serverState);

  // ❌ Chat messages changing does NOT trigger re-render!
  // ✅ Same selective subscription as Redux, simpler API

  return (
    <div>
      {isAnalyzing ? 'Analyzing...' : 'Ready'}
      <span>Server: {serverState}</span>
    </div>
  );
}

/**
 * ✅ BENEFIT: Can use derived selectors
 */
export function IncidentCount() {
  const count = useExtensionStore(selectIncidentCount);

  return <div>Total Incidents: {count}</div>;
}

/**
 * ✅ BENEFIT: Complex derived state with memoization
 */
export function IncidentsByFile() {
  // This selector is memoized - expensive groupBy only runs when incidents change
  const incidentsByFile = useExtensionStore(selectIncidentsByFile);

  return (
    <div>
      {Array.from(incidentsByFile.entries()).map(([file, incidents]) => (
        <div key={file}>
          <h3>{file}</h3>
          <ul>
            {incidents.map((inc) => (
              <li key={inc.violationId}>{inc.message}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * ✅ BENEFIT: Custom equality function
 */
export function OptimizedIncidentCount() {
  const count = useExtensionStore(
    (state) => state.enhancedIncidents.length,
    // Only re-render if count actually changed (not if array ref changed)
    (prev, next) => prev === next
  );

  return <div>Total: {count}</div>;
}

/**
 * ✅ BENEFIT: Can access store outside React
 * Great for VSCode extension code that's not in React
 */
export function nonReactExample() {
  const { setIsAnalyzing, enhancedIncidents } = useExtensionStore.getState();

  // Use in VSCode command handler
  setIsAnalyzing(true);
  console.log(`Current incidents: ${enhancedIncidents.length}`);
}

/**
 * ✅ BENEFIT: Subscribe to specific slice outside React
 */
export function setupExternalListener() {
  const unsubscribe = useExtensionStore.subscribe(
    (state) => state.isAnalyzing,
    (isAnalyzing) => {
      console.log('Analysis state changed:', isAnalyzing);
    }
  );

  return unsubscribe;
}

/**
 * COMPARISON:
 *
 * ZUSTAND vs REDUX:
 * - ✅ Simpler API (no dispatch, no action types)
 * - ✅ Same selective subscription benefits
 * - ✅ Smaller bundle size
 * - ⚠️ Less middleware options
 * - ⚠️ Simpler DevTools
 *
 * ZUSTAND vs CONTEXT:
 * - ✅ Selective subscriptions (no unnecessary re-renders)
 * - ✅ Better performance
 * - ✅ Can use outside React
 * - ✅ Built-in persistence
 */
