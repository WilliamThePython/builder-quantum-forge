import React from "react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { AlertTriangle, CheckCircle, HelpCircle, Zap } from "lucide-react";
import { PerformanceUtils } from "../lib/performanceUtils";

interface FileSizeCheckerProps {
  file: File | null;
  onProceed?: () => void;
  onCancel?: () => void;
}

export function FileSizeChecker({
  file,
  onProceed,
  onCancel,
}: FileSizeCheckerProps) {
  if (!file) return null;

  const fileSizeMB = file.size / (1024 * 1024);
  const capabilities = PerformanceUtils.checkBrowserCapabilities();
  const estimate = PerformanceUtils.estimateProcessingTime(file.size);
  const warning = PerformanceUtils.createFileSizeWarning(file.size);

  const getSizeCategory = () => {
    if (fileSizeMB < 5) return "small";
    if (fileSizeMB < 15) return "medium";
    if (fileSizeMB < 30) return "large";
    return "very-large";
  };

  const category = getSizeCategory();

  const getIcon = () => {
    switch (category) {
      case "small":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "medium":
        return <HelpCircle className="h-4 w-4 text-blue-500" />;
      case "large":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "very-large":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  const getAlertVariant = () => {
    if (category === "small" || category === "medium") return "default";
    return "destructive";
  };

  const shouldShowWarning = category === "large" || category === "very-large";

  if (!shouldShowWarning) {
    return null; // No warning needed for small/medium files
  }

  return (
    <Alert variant={getAlertVariant()} className="mb-4">
      {getIcon()}
      <AlertTitle className="flex items-center gap-2">
        Large File Detected: {fileSizeMB.toFixed(1)}MB
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <div>
          <p className="font-medium">
            Estimated processing time: {estimate.estimatedSeconds} seconds
          </p>
          {warning && <p className="text-sm">{warning}</p>}
        </div>

        {category === "very-large" && (
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-medium mb-2">⚠️ Performance Warning:</p>
            <ul className="space-y-1 text-xs">
              <li>• This file may cause browser slowdown or crashes</li>
              <li>• Consider using a desktop computer with more RAM</li>
              <li>• Close all other browser tabs before proceeding</li>
              <li>• Consider reducing file size using external tools</li>
            </ul>
          </div>
        )}

        <div className="bg-muted p-3 rounded text-sm">
          <p className="font-medium mb-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Optimization Tips:
          </p>
          <ul className="space-y-1 text-xs">
            {capabilities.suggestions.map((suggestion, index) => (
              <li key={index}>• {suggestion}</li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={onProceed}
            variant={category === "very-large" ? "destructive" : "default"}
            size="sm"
          >
            {category === "very-large" ? "Proceed Anyway" : "Continue Loading"}
          </Button>
          <Button onClick={onCancel} variant="outline" size="sm">
            Choose Different File
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

// Helper hook for file size validation
export function useFileSizeValidation() {
  const [showChecker, setShowChecker] = React.useState(false);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  const checkFileSize = (file: File): boolean => {
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > 15) {
      setPendingFile(file);
      setShowChecker(true);
      return false; // Don't proceed immediately
    }

    return true; // Proceed with upload
  };

  const handleProceed = () => {
    setShowChecker(false);
    return pendingFile;
  };

  const handleCancel = () => {
    setShowChecker(false);
    setPendingFile(null);
    return null;
  };

  return {
    showChecker,
    pendingFile,
    checkFileSize,
    handleProceed,
    handleCancel,
  };
}
