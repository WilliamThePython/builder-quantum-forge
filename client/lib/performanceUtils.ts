/**
 * Browser performance utilities for handling large 3D files
 */
export class PerformanceUtils {
  /**
   * Check if browser can handle large files
   */
  static checkBrowserCapabilities(): {
    canHandleLargeFiles: boolean;
    maxRecommendedSize: number;
    suggestions: string[];
  } {
    const capabilities = {
      canHandleLargeFiles: true,
      maxRecommendedSize: 40 * 1024 * 1024, // 40MB default
      suggestions: [] as string[],
    };

    // Check available memory (if supported)
    if ("memory" in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const availableMemory = memory.jsHeapSizeLimit - memory.usedJSHeapSize;

      if (availableMemory < 100 * 1024 * 1024) {
        // Less than 100MB available
        capabilities.maxRecommendedSize = 15 * 1024 * 1024; // Reduce to 15MB
        capabilities.suggestions.push(
          "Low memory detected - consider using smaller files or closing other tabs",
        );
      }
    }

    // Check for mobile devices
    if (this.isMobileDevice()) {
      capabilities.maxRecommendedSize = Math.min(
        capabilities.maxRecommendedSize,
        20 * 1024 * 1024,
      );
      capabilities.suggestions.push(
        "Mobile device detected - recommend files under 20MB for best performance",
      );
    }

    // Check for older browsers
    if (!this.hasModernFeatures()) {
      capabilities.maxRecommendedSize = Math.min(
        capabilities.maxRecommendedSize,
        25 * 1024 * 1024,
      );
      capabilities.suggestions.push(
        "Browser compatibility - recommend files under 25MB",
      );
    }

    return capabilities;
  }

  /**
   * Request browser optimizations for large file processing
   */
  static async requestPerformanceMode(): Promise<void> {
    // Request high performance mode if available
    if ("requestIdleCallback" in window) {
      return new Promise<void>((resolve) => {
        requestIdleCallback(() => resolve(), { timeout: 1000 });
      });
    }

    // Fallback to setTimeout
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }

  /**
   * Create a performance-aware progress updater
   */
  static createThrottledProgressUpdater(
    callback: (progress: number, message: string) => void,
    interval: number = 100,
  ): (progress: number, message: string) => void {
    let lastUpdate = 0;

    return (progress: number, message: string) => {
      const now = Date.now();
      if (now - lastUpdate >= interval || progress >= 100) {
        lastUpdate = now;
        callback(progress, message);
      }
    };
  }

  /**
   * Yield control to browser to prevent freezing
   */
  static async yieldToBrowser(minTime: number = 1): Promise<void> {
    if ("scheduler" in window && (window.scheduler as any).postTask) {
      // Use Scheduler API if available
      return new Promise((resolve) => {
        (window.scheduler as any).postTask(() => resolve(), {
          priority: "background",
        });
      });
    }

    // Fallback to setTimeout
    return new Promise((resolve) => {
      setTimeout(resolve, minTime);
    });
  }

  /**
   * Monitor memory usage during processing
   */
  static getMemoryInfo(): {
    used: number;
    available: number;
    isLowMemory: boolean;
  } {
    if ("memory" in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const used = memory.usedJSHeapSize;
      const available = memory.jsHeapSizeLimit - used;

      return {
        used,
        available,
        isLowMemory: available < 50 * 1024 * 1024, // Less than 50MB available
      };
    }

    // Fallback for browsers without memory API
    return {
      used: 0,
      available: 100 * 1024 * 1024, // Assume 100MB available
      isLowMemory: false,
    };
  }

  /**
   * Suggest browser optimizations
   */
  static getBrowserOptimizationTips(): string[] {
    const tips: string[] = [];

    // Check memory
    const memoryInfo = this.getMemoryInfo();
    if (memoryInfo.isLowMemory) {
      tips.push("💡 Close other browser tabs to free up memory");
      tips.push("💡 Restart your browser to clear memory leaks");
    }

    // Check for mobile
    if (this.isMobileDevice()) {
      tips.push("📱 For large files on mobile, try using a desktop computer");
      tips.push("📱 Close other apps to free up device memory");
    }

    // General performance tips
    tips.push("⚡ Use Chrome or Firefox for best 3D performance");
    tips.push("⚡ Enable hardware acceleration in browser settings");
    tips.push("🔧 Consider reducing the file size before uploading");

    return tips;
  }

  /**
   * Detect mobile devices
   */
  private static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  /**
   * Check for modern browser features
   */
  private static hasModernFeatures(): boolean {
    return !!(
      window.WebAssembly &&
      window.Worker &&
      window.OffscreenCanvas &&
      window.SharedArrayBuffer
    );
  }

  /**
   * Estimate processing time for file size
   */
  static estimateProcessingTime(fileSizeBytes: number): {
    estimatedSeconds: number;
    category: "fast" | "medium" | "slow" | "very-slow";
  } {
    const sizeMB = fileSizeBytes / (1024 * 1024);

    // Base estimates (can vary significantly by device)
    let estimatedSeconds: number;
    let category: "fast" | "medium" | "slow" | "very-slow";

    if (sizeMB < 5) {
      estimatedSeconds = 2;
      category = "fast";
    } else if (sizeMB < 15) {
      estimatedSeconds = 5;
      category = "medium";
    } else if (sizeMB < 30) {
      estimatedSeconds = 15;
      category = "slow";
    } else {
      estimatedSeconds = 30;
      category = "very-slow";
    }

    // Adjust for mobile devices
    if (this.isMobileDevice()) {
      estimatedSeconds *= 2;
      if (category === "fast") category = "medium";
      else if (category === "medium") category = "slow";
      else if (category === "slow") category = "very-slow";
    }

    return { estimatedSeconds, category };
  }

  /**
   * Create user-friendly file size warning
   */
  static createFileSizeWarning(fileSizeBytes: number): string | null {
    const sizeMB = fileSizeBytes / (1024 * 1024);
    const estimate = this.estimateProcessingTime(fileSizeBytes);

    if (sizeMB > 15) {
      return `Large file (${sizeMB.toFixed(1)}MB) - estimated ${estimate.estimatedSeconds}s processing time. Consider reducing file size for faster loading.`;
    }

    if (sizeMB > 30) {
      return `Very large file (${sizeMB.toFixed(1)}MB) - this may take ${estimate.estimatedSeconds}s+ and could cause browser slowdown.`;
    }

    return null;
  }
}
