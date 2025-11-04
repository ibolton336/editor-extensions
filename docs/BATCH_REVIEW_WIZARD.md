# Batch Review Wizard - PatternFly Implementation

## Overview

Transformed the `BatchReviewModal` into a **guided wizard experience** using PatternFly's Wizard component. Each file becomes a step in the wizard, with a final review/summary step.

## Key Benefits

### 🧭 Guided Experience

- **Linear flow** - Users progress file-by-file naturally
- **Clear progress** - Wizard shows exactly where they are (3/24)
- **Enforced decisions** - Can't move forward without applying or rejecting
- **Navigation sidebar** - See all files at a glance

### ✅ Better than Previous Modal

- **Less overwhelming** - Focus on one file at a time
- **No more overflow issues** - Each step is self-contained
- **Built-in navigation** - Previous/Next handled by wizard
- **Visual status** - Steps show success (green) or error (red) states

## Architecture

```typescript
<Modal variant={ModalVariant.large}>
  <Wizard>
    <WizardHeader
      title="Review Code Changes"
      description="24 files • 5/24 reviewed (21%)"
    />

    {/* One step per file */}
    <WizardStep name="1. InventoryEntity.java" status="success">
      <FileReview file={file1} />
    </WizardStep>

    <WizardStep name="2. Controller.java" status="error">
      <FileReview file={file2} />
    </WizardStep>

    {/* ... more file steps ... */}

    {/* Final summary step */}
    <WizardStep name="Review & Finish">
      <Summary decisions={decisions} />
    </WizardStep>
  </Wizard>
</Modal>
```

## Step Structure

### File Step Layout

```
┌─────────────────────────────────────────────────────────┐
│ 📁 /path/to/file/Controller.java        [New File]     │  ← File Info
├─────────────────────────────────────────────────────────┤
│ ✅ This file will be applied                            │  ← Status Alert
├─────────────────────────────────────────────────────────┤
│        📝 Review in Editor with Changes                 │  ← PRIMARY ACTION
│    Opens file with inline decorators showing changes    │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ - import javax.ejb.Stateless;                       │ │  ← Diff Preview
│ │ + import jakarta.ejb.Stateless;                     │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│  [  Reject File  ]        [  Apply File  ]             │  ← Actions
└─────────────────────────────────────────────────────────┘
```

### Final Summary Step

```
┌─────────────────────────────────────────────────────────┐
│ ✓ Review complete! 24 of 24 files processed            │
├─────────────────────────────────────────────────────────┤
│ Summary:                                                │
│  ✓ Controller.java                        [Applied]    │
│  ✗ OldService.java                        [Rejected]   │
│  ✓ Repository.java                        [Applied]    │
│  ⏳ Util.java                              [Pending]    │
├─────────────────────────────────────────────────────────┤
│ [Reject All Remaining] [Apply All Remaining]           │
└─────────────────────────────────────────────────────────┘
```

## User Journey

### Flow 1: Methodical Review

```
1. Modal opens → First file displayed
2. User reviews diff in modal
3. Clicks "Review in Editor with Changes" ⭐
4. VSCode opens file with decorators
5. User examines changes in context
6. Returns to modal
7. Clicks "Apply File"
8. Wizard auto-advances to next file
9. Repeat for all files
10. Summary step shows all decisions
11. Click "Finish Review"
```

### Flow 2: Quick Decisions

```
1. Modal opens → First file displayed
2. Diff looks good
3. Click "Apply File" directly
4. Auto-advance to next file
5. Reject this one
6. Auto-advance
7. Continue rapid review...
```

### Flow 3: Bulk Action

```
1. Modal opens
2. User clicks through first few files
3. All remaining files similar
4. Navigate to "Review & Finish" step
5. Click "Apply All Remaining Files"
6. Done!
```

## Features

### ✅ Step Status Indicators

- **Default (gray)** - No decision made
- **Success (green)** - File applied
- **Error (red)** - File rejected
- **Visible in sidebar** - See all file statuses at once

### ✅ Enforced Decisions

```typescript
footer: {
  isNextDisabled: !decision, // Can't advance without Apply/Reject
}
```

User must make a decision before moving to next file (or can skip to summary).

### ✅ Critical Actions Preserved

- **Review in Editor with Decorators** - Still primary action
- **Individual Apply/Reject** - Per file
- **Bulk Apply/Reject** - In summary step
- **All original functionality** - Nothing lost

### ✅ Progress Tracking

```typescript
description={`${files.length} files • ${reviewedCount}/${files.length} reviewed (${progressPercentage}%)`}
```

Always visible in wizard header.

### ✅ Flexible Navigation

- **Next/Previous** buttons in wizard footer
- **Jump to any step** via sidebar navigation
- **Skip to summary** anytime
- **Back button** to revisit files

## Technical Implementation

### Dynamic Step Generation

```typescript
const fileSteps = files.map((file, index) => {
  const decision = decisions.get(file.messageToken);
  const stepNumber = index + 1;

  return (
    <WizardStep
      key={file.messageToken}
      name={`${stepNumber}. ${file.path.split("/").pop()}`}
      id={`file-step-${file.messageToken}`}
      status={decision === "apply" ? "success" : decision === "reject" ? "error" : "default"}
      footer={{ isNextDisabled: !decision }}
    >
      <FileReviewContent file={file} />
    </WizardStep>
  );
});
```

### State Management

```typescript
const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
const [viewingDiffFor, setViewingDiffFor] = useState<string | null>(null);
```

Simple state - decisions tracked per file, no complex navigation state needed (wizard handles it).

### Message Protocol (Unchanged)

All backend messages remain the same:

- `SHOW_DIFF_WITH_DECORATORS`
- `FILE_RESPONSE` (apply/reject)
- `BATCH_APPLY_ALL`
- `BATCH_REJECT_ALL`

## CSS Highlights

```css
/* Wizard step content with fade-in animation */
.batch-review-wizard-step {
  padding: var(--pf-v5-global--spacer--md);
  animation: fadeIn 0.3s ease-in;
}

/* File info with background */
.batch-review-file-info {
  padding: var(--pf-v5-global--spacer--md);
  background-color: var(--pf-v5-global--BackgroundColor--200);
  border-radius: var(--pf-v5-global--BorderRadius--sm);
}

/* Status colors in sidebar */
.batch-review-modal .pf-v5-c-wizard__nav-item.pf-m-success {
  background-color: var(--pf-v5-global--success-color--100);
}

.batch-review-modal .pf-v5-c-wizard__nav-item.pf-m-danger {
  background-color: var(--pf-v5-global--danger-color--100);
}
```

## Comparison: Before vs After

| Aspect         | Old Modal                          | Wizard                   |
| -------------- | ---------------------------------- | ------------------------ |
| **Layout**     | Single view with manual navigation | Multi-step guided flow   |
| **Progress**   | Manual counter                     | Built-in progress bar    |
| **Navigation** | Custom Previous/Next buttons       | Wizard handles it        |
| **Overview**   | Collapsible accordion              | Sidebar navigation       |
| **Status**     | Labels in list                     | Color-coded steps        |
| **Decisions**  | Optional                           | Enforced (to advance)    |
| **Overflow**   | Issues with long content           | Each step self-contained |
| **UX**         | All-at-once overwhelming           | One-at-a-time focused    |

## Benefits Over Previous Implementation

### 1. **No Overflow Issues** ✅

Each step is independent - no more content pushing to the right.

### 2. **Better Progress Visibility** ✅

Sidebar shows all files with status at a glance.

### 3. **Guided Experience** ✅

Users naturally flow through files one-by-one.

### 4. **Enforced Quality** ✅

Can't skip files without making a decision (or explicitly going to summary).

### 5. **Professional UX** ✅

Wizard pattern is familiar from software installations, setup flows, etc.

### 6. **Cleaner Code** ✅

- No manual index tracking
- No accordion state management
- No custom navigation logic
- Wizard component handles complexity

## Future Enhancements

Consider adding:

- 🔮 **Keyboard shortcuts per step** - (A) to apply, (R) to reject
- 🔮 **Step validation** - Mark steps requiring attention
- 🔮 **Skip functionality** - Explicitly skip files for later
- 🔮 **Filtering** - Show only pending/applied/rejected in sidebar
- 🔮 **Search** - Find specific files in wizard nav
- 🔮 **Bookmarks** - Flag files for special attention

## Testing Scenarios

- [x] Open wizard with 24 files
- [x] Review first file in editor
- [x] Apply file → advances to next
- [x] Reject file → advances to next
- [x] Navigate backward
- [x] Jump to specific file via sidebar
- [x] Skip to summary step
- [x] Apply all remaining from summary
- [x] Close wizard without finishing
- [x] Reopen - decisions preserved
- [x] Status colors in sidebar
- [x] Responsive on mobile
- [x] Dark theme support

## Related Files

- **`BatchReviewModal.tsx`** - Wizard implementation
- **`batchReviewModal.css`** - Wizard-specific styles
- **`BatchReviewFooter.tsx`** - Footer that triggers wizard
- **`ModifiedFileMessage.tsx`** - Original decorator flow reference

## Key Takeaways

✅ **Wizard pattern perfect for file-by-file review**  
✅ **PatternFly component handles navigation complexity**  
✅ **Enforced decisions improve review quality**  
✅ **Status visibility helps track progress**  
✅ **All original functionality preserved and enhanced**

The wizard transforms batch file review from an overwhelming task into a guided, manageable process! 🎉
