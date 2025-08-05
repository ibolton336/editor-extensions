// Simplified AnalysisPage Header Example
// This shows how the header could be cleaned up by moving broader settings to the status bar modal

import React, { useState } from "react";
import {
  Button,
  Flex,
  FlexItem,
  Masthead,
  MastheadContent,
  MastheadMain,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core";

// Simplified Header Component
const SimplifiedAnalysisHeader: React.FC = () => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const handleRunAnalysis = () => {
    // Run analysis logic
  };

  return (
    <Masthead>
      <MastheadMain>
        <Title headingLevel="h1" size="2xl">
          Konveyor Analysis
        </Title>
      </MastheadMain>
      <MastheadContent>
        <Toolbar>
          <ToolbarContent>
            <ToolbarGroup align={{ default: "alignEnd" }}>
              {/* Profile Selector - Analysis-specific */}
              <ToolbarItem>
                <ProfileSelector
                  profiles={profiles}
                  activeProfile={activeProfileId}
                  onChange={(id) => dispatch({ type: "SET_ACTIVE_PROFILE", payload: id })}
                  onManageProfiles={() => dispatch({ type: "OPEN_PROFILE_MANAGER", payload: {} })}
                  isDisabled={isStartingServer || isAnalyzing}
                />
              </ToolbarItem>

              {/* Analysis Config Button - Analysis-specific */}
              <ToolbarItem>
                <ConfigButton
                  onClick={() => setIsConfigOpen(true)}
                  hasWarning={configErrors.length > 0}
                  warningMessage="Please review your analysis configuration."
                />
              </ToolbarItem>

              {/* Run Analysis Button - Primary action */}
              <ToolbarItem>
                <Button
                  variant="primary"
                  onClick={handleRunAnalysis}
                  isLoading={isAnalyzing}
                  isDisabled={
                    isAnalyzing || 
                    isStartingServer || 
                    !serverRunning || 
                    isWaitingForSolution
                  }
                >
                  {isAnalyzing ? "Analyzing..." : "Run Analysis"}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );
};

// Status Bar Modal (Enhanced)
// This would contain the broader system settings that were removed from the header

const StatusBarModalContent = () => {
  return (
    <div className="container">
      <h1>Konveyor System Settings</h1>
      
      {/* Server Status Section */}
      <div className="section">
        <h2>Server Status</h2>
        <div className="form-group">
          <div className="flex-between">
            <div>
              <div className="status-indicator status-running">
                🟢 Running
              </div>
              <div className="description">
                Konveyor server is running and ready
              </div>
            </div>
            <button className="button button-primary">
              Stop Server
            </button>
          </div>
        </div>
      </div>

      {/* Agent Mode Section */}
      <div className="section">
        <h2>Agent Mode</h2>
        <div className="form-group">
          <div className="flex-between">
            <div>
              <label>Enable Agent Mode</label>
              <div className="description">
                Agent mode is active - AI will assist with resolutions
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Profile Management Section */}
      <div className="section">
        <h2>Profile Management</h2>
        <div className="form-group">
          <label>Active Profile</label>
          <select className="select">
            <option value="">Select a profile...</option>
            <option value="profile1" selected>Default Profile</option>
            <option value="profile2">Custom Profile</option>
          </select>
          <div className="description">
            Active profile: Default Profile
          </div>
        </div>
        <button className="button button-secondary">
          Manage Profiles
        </button>
      </div>

      {/* Navigation Section */}
      <div className="section">
        <h2>Navigation</h2>
        <div className="form-group">
          <button className="button button-secondary">
            Open Analysis View
          </button>
        </div>
        <div className="form-group">
          <button className="button button-secondary">
            Open Resolution View
          </button>
        </div>
      </div>
    </div>
  );
};

// Benefits of this approach:

/*
1. **Cleaner Header**
   - Focuses on analysis workflow
   - Only analysis-specific controls
   - Better visual hierarchy

2. **Better Organization**
   - System settings in status bar modal
   - Analysis config in header
   - Clear separation of concerns

3. **Improved UX**
   - Status bar always accessible
   - Header not cluttered
   - Logical grouping of functionality

4. **Maintains Functionality**
   - All features still available
   - Just better organized
   - More intuitive placement
*/ 