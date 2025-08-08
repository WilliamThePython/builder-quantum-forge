import React from "react";
import { Progress } from "./ui/progress";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Loader2, AlertTriangle, Lightbulb } from "lucide-react";

interface LargeFileProgressProps {
  fileName: string;
  fileSize: number;
  progress: number;
  stage: string;
  details: string;
  isLargeFile: boolean;
}

export function LargeFileProgress({
  fileName,
  fileSize,
  progress,
  stage,
  details,
  isLargeFile,
}: LargeFileProgressProps) {
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

  const getProgressColor = () => {
    if (progress < 30) return "bg-blue-500";
    if (progress < 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getStageIcon = () => {
    if (stage === "Complete") return "✅";
    if (stage === "Error") return "❌";
    if (stage.includes("Warning")) return "⚠️";
    return "⚡";
  };

  const tips = [
    "💡 Close other browser tabs to free up memory",
    "⚡ Enable hardware acceleration in browser settings",
    "🔧 Consider reducing file size before uploading",
    "🚀 Chrome and Firefox provide best 3D performance",
  ];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2
            className={`h-5 w-5 ${progress < 100 ? "animate-spin" : ""}`}
          />
          Loading {fileName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Info */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>File Size: {fileSizeMB}MB</span>
          <span>
            {getStageIcon()} {stage}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{details}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
        </div>

        {/* Large File Warning */}
        {isLargeFile && progress < 100 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Large file detected ({fileSizeMB}MB). Processing may take 15-60
              seconds depending on your device.
            </AlertDescription>
          </Alert>
        )}

        {/* Performance Tips */}
        {isLargeFile && (
          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Performance Tips:</p>
                <ul className="text-xs space-y-1">
                  {tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Memory Usage Warning */}
        {typeof window !== "undefined" && "memory" in performance && (
          <MemoryUsageIndicator />
        )}
      </CardContent>
    </Card>
  );
}

function MemoryUsageIndicator() {
  const [memoryInfo, setMemoryInfo] = React.useState<{
    used: number;
    total: number;
    percentage: number;
  } | null>(null);

  React.useEffect(() => {
    const updateMemory = () => {
      if ("memory" in performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        const used = memory.usedJSHeapSize;
        const total = memory.jsHeapSizeLimit;
        const percentage = (used / total) * 100;

        setMemoryInfo({ used, total, percentage });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!memoryInfo) return null;

  const isHighUsage = memoryInfo.percentage > 80;
  const usedMB = (memoryInfo.used / 1024 / 1024).toFixed(0);
  const totalMB = (memoryInfo.total / 1024 / 1024).toFixed(0);

  return (
    <div className="text-xs text-muted-foreground">
      <div className="flex justify-between items-center">
        <span>Memory Usage:</span>
        <span className={isHighUsage ? "text-orange-500 font-medium" : ""}>
          {usedMB}MB / {totalMB}MB ({memoryInfo.percentage.toFixed(0)}%)
        </span>
      </div>
      {isHighUsage && (
        <p className="text-orange-500 mt-1">
          ⚠️ High memory usage - consider closing other tabs
        </p>
      )}
    </div>
  );
}
