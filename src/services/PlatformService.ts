// services/PlatformService.ts
// Platform detection service for mobile-first architecture
import { Capacitor } from '@capacitor/core';

class PlatformService {
  /**
   * Check if running as native mobile app (iOS/Android with Capacitor)
   * Returns true when app is installed on mobile device
   */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Check if running in web browser (desktop/laptop/surface)
   * Returns true when accessing via Chrome, Safari, Edge, etc.
   */
  isWeb(): boolean {
    return !Capacitor.isNativePlatform();
  }

  /**
   * Get current platform name
   * @returns 'ios' | 'android' | 'web'
   */
  getPlatform(): string {
    return Capacitor.getPlatform();
  }

  /**
   * Check if device has camera capability
   * Web: Checks for getUserMedia API
   * Native: Always returns true
   */
  hasCamera(): boolean {
    if (this.isWeb()) {
      // Check if getUserMedia is available
      // Note: navigator.mediaDevices requires HTTPS (except localhost)
      const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      
      // Also check legacy API for older browsers
      const nav = navigator as unknown as Record<string, unknown>;
      const hasLegacyApi = !!(
        nav.getUserMedia ||
        nav.webkitGetUserMedia ||
        nav.mozGetUserMedia
      );
      
      const result = hasMediaDevices || hasLegacyApi;
      console.log('ðŸ“· Camera check:', { hasMediaDevices, hasLegacyApi, result });
      
      // Return true by default on web to show the button - actual camera access will fail gracefully
      return true;
    }
    return true;
  }

  /**
   * Check if running on iOS
   */
  isIOS(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  /**
   * Check if running on Android
   */
  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /**
   * Get platform capabilities for photo capture
   */
  getPhotoCapabilities() {
    const capabilities = {
      platform: this.getPlatform(),
      isNative: this.isNative(),
      isWeb: this.isWeb(),
      isIOS: this.isIOS(),
      isAndroid: this.isAndroid(),
      hasCamera: this.hasCamera(),
      supportsNativeCamera: this.isNative(), // Native camera with device controls
      supportsFileUpload: true, // File picker always available
      nativeCameraFeatures: this.isNative() ? [
        'flash',
        'zoom',
        'focus',
        'brightness',
        'save_to_gallery'
      ] : []
    };
    
    console.log('ðŸ“± Platform Capabilities:', capabilities);
    return capabilities;
  }

  /**
   * Log platform information for debugging
   */
  logPlatformInfo(): void {
    const info = this.getPhotoCapabilities();
    console.log('Ã°Å¸â€œÂ± Platform Info:', {
      platform: info.platform,
      isNative: info.isNative,
      isWeb: info.isWeb,
      nativeCameraAvailable: info.supportsNativeCamera,
      cameraFeatures: info.nativeCameraFeatures
    });
  }
}

export default new PlatformService();