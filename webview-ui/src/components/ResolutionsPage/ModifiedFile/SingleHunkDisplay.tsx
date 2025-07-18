import React from "react";
import { DiffLinesRenderer } from "./DiffLinesRenderer";
import { DiffLegend } from "./DiffLegend";
import "./SingleHunkDisplay.css";

interface SingleHunkDisplayProps {
  diff: string;
  filePath: string;
  content?: string;
}

export const SingleHunkDisplay: React.FC<SingleHunkDisplayProps> = ({
  diff,
  filePath,
  content,
}) => {
  // Determine if we should use enhanced renderer based on diff size
  return (
    <div className="expanded-diff-display">
      <DiffLegend />
      <DiffLinesRenderer diffContent={diff} filePath={filePath} content={content} />
    </div>
  );
};
