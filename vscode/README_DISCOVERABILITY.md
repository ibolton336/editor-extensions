# Konveyor AI (KAI) - Discoverability Features

## 🎯 Quick Access to KAI Settings

The Konveyor AI extension provides multiple ways to access settings and manage your AI-powered migration tools.

### Primary Access: Status Bar Icon

Look for the **KAI** icon in the bottom status bar of VS Code. This icon provides quick access to all Konveyor AI settings.

**Icon States:**

- 🤖 **Robot Icon** - Default state (AI mode)
- ✅ **Check Icon** - Server is running
- ⏹️ **Server Icon** - Server is stopped
- 🔄 **Loading Icon** - Server is starting
- ⚠️ **Warning Icon** - No active profile
- ❌ **Error Icon** - Configuration errors detected

### Multiple Access Methods

#### 1. **Status Bar Icon** (Primary)

- Click the **KAI** icon in the bottom status bar
- Right-aligned for easy access
- Color-coded based on status

#### 2. **Keyboard Shortcuts**

- `Ctrl+Shift+K` (Windows/Linux) or `Cmd+Shift+K` (Mac) - Quick settings access
- `Ctrl+Shift+O` (Windows/Linux) or `Cmd+Shift+O` (Mac) - Open settings

#### 3. **Command Palette**

- Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
- Type "Konveyor AI" to see all available commands:
  - `Konveyor AI: Open Settings`
  - `Konveyor AI: Toggle Server`
  - `Konveyor AI: Toggle Agent Mode`
  - `Konveyor AI: Show Welcome`

### Smart Notifications

The extension provides contextual help when you need it:

- **First-time users** see a welcome message with instructions
- **Configuration errors** trigger helpful prompts with "Open Settings" buttons
- **Missing profiles** show guidance to set up a profile
- **Server issues** provide quick access to server management

### Enhanced Tooltips

Hover over the KAI icon to see detailed status information:

```
Konveyor AI (KAI) - Click to open settings and manage server

Status:
✅ Server: Running
🤖 Mode: Agent
📋 Profile: Default Profile

Quick Access:
• Click KAI icon for settings
• Ctrl+Shift+K for quick access
• Command Palette: "Konveyor AI: Open Settings"
```

### Settings Modal

Clicking the KAI icon opens a comprehensive settings modal with:

- **Server Management** - Start/stop the analysis server
- **Agent Mode** - Toggle between manual and AI-assisted modes
- **Profile Management** - Select and configure analysis profiles
- **Quick Actions** - Direct access to analysis and resolution views
- **Status Overview** - Real-time status of all components

### Getting Started

1. **First Launch**: You'll see a welcome message pointing to the KAI icon
2. **Configuration**: Click the KAI icon to set up your first profile
3. **Server Management**: Use the settings to start the analysis server
4. **Analysis**: Once configured, run analysis from the Konveyor sidebar

### Troubleshooting

**Icon not visible?**

- Check that the Konveyor AI extension is activated
- Look in the bottom-right status bar area
- Try the Command Palette: "Konveyor AI: Show Welcome"

**Configuration errors?**

- Click the KAI icon (will show error state)
- Follow the prompts to fix configuration issues
- Check the VS Code output panel for detailed error messages

**Server won't start?**

- Click the KAI icon to open settings
- Check your model provider configuration
- Verify network connectivity for AI services

### Pro Tips

- **Quick Toggle**: Use `Ctrl+Shift+K` for instant settings access
- **Status at a Glance**: The icon color and symbol tell you everything you need to know
- **Contextual Help**: Error states automatically show helpful prompts
- **Multiple Access**: Use Command Palette, keyboard shortcuts, or the icon - whatever works best for you

The KAI status bar item is designed to be your central hub for all Konveyor AI operations, making it easy to discover and access the powerful AI-assisted migration tools.
