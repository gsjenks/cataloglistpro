// services/ExportService.ts
// MOBILE-FIRST: CSV export for LiveAuctioneers with offline support and photo packaging

import { supabase } from '../lib/supabase';
import offlineStorage from './Offlinestorage';
import PhotoService from './PhotoService';
import JSZip from 'jszip';
import type { Lot, Photo } from '../types';

class ExportService {
  /**
   * Export sale lots to LiveAuctioneers CSV format
   * Works offline using local data
   */
  async exportToLiveAuctioneersCSV(
    saleId: string,
    saleName: string,
    includePhotos: boolean = false
  ): Promise<{ success: boolean; message: string; zipBlob?: Blob }> {
    try {
      console.log('ðŸ”„ Starting LiveAuctioneers export...');

      // Fetch lots - try cloud first, fallback to offline
      const lots = await this.fetchLots(saleId);
      
      if (!lots || lots.length === 0) {
        return {
          success: false,
          message: 'No lots found for this sale.'
        };
      }

      console.log(`ðŸ“¦ Found ${lots.length} lots`);

      // Fetch photos for each lot
      const lotsWithPhotos = await this.fetchPhotosForLots(lots);

      // Generate CSV content
      const csvContent = this.generateCSV(lotsWithPhotos);

      if (includePhotos) {
        // Create ZIP with CSV and photos
        const zipBlob = await this.createZipWithPhotos(
          csvContent,
          saleName,
          lotsWithPhotos
        );

        return {
          success: true,
          message: `Successfully exported ${lots.length} lots with photos`,
          zipBlob
        };
      } else {
        // Download CSV only
        this.downloadCSV(csvContent, saleName);

        return {
          success: true,
          message: `Successfully exported ${lots.length} lots`
        };
      }
    } catch (error) {
      console.error('âŒ Export failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Export failed'
      };
    }
  }

  /**
   * Fetch lots from cloud or offline storage
   */
  private async fetchLots(saleId: string): Promise<Lot[]> {
    try {
      // Try cloud first
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('lots')
          .select('*')
          .eq('sale_id', saleId)
          .order('lot_number', { ascending: true });

        if (!error && data) {
          console.log('â˜ï¸ Fetched lots from cloud');
          return data;
        }
      }

      // Fallback to offline storage
      console.log('ðŸ“± Fetching lots from offline storage');
      await offlineStorage.initialize();
      const offlineLots = await offlineStorage.getLotsBySale(saleId);
      return offlineLots;
    } catch (error) {
      console.error('Error fetching lots:', error);
      return [];
    }
  }

  /**
   * Fetch photos for all lots
   * CRITICAL: Primary photo is ALWAYS first (becomes lotNumber_1.jpg in ImageFile.1)
   */
  private async fetchPhotosForLots(lots: Lot[]): Promise<Array<Lot & { photos: Photo[] }>> {
    const lotsWithPhotos = await Promise.all(
      lots.map(async (lot) => {
        try {
          const photos = await PhotoService.getPhotosForLot(lot.id);
          
          // CRITICAL SORT: Primary photo MUST be first
          // 1. Primary photo (is_primary = true) â†’ position 1 â†’ lotNumber_1.jpg â†’ ImageFile.1
          // 2. Remaining photos sorted by created_at â†’ positions 2-20 â†’ lotNumber_2.jpg to lotNumber_20.jpg
          const sortedPhotos = photos
            .sort((a, b) => {
              if (a.is_primary && !b.is_primary) return -1;
              if (!a.is_primary && b.is_primary) return 1;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            })
            .map((photo, index) => ({
              ...photo,
              sequence: index + 1 // Primary photo gets sequence 1
            }));

          return {
            ...lot,
            photos: sortedPhotos
          };
        } catch (error) {
          console.error(`Error fetching photos for lot ${lot.lot_number}:`, error);
          return {
            ...lot,
            photos: []
          };
        }
      })
    );

    return lotsWithPhotos;
  }

  /**
   * Generate CSV content in LiveAuctioneers format
   */
  private generateCSV(lots: Array<Lot & { photos: Photo[] }>): string {
    // CSV Header - exactly as LiveAuctioneers expects
    const headers = [
      'LotNum',
      'Title',
      'Description',
      'LowEst',
      'HighEst',
      'StartPrice',
      'Condition',
      'Consigner',
      // Up to 20 image columns
      'ImageFile.1', 'ImageFile.2', 'ImageFile.3', 'ImageFile.4', 'ImageFile.5',
      'ImageFile.6', 'ImageFile.7', 'ImageFile.8', 'ImageFile.9', 'ImageFile.10',
      'ImageFile.11', 'ImageFile.12', 'ImageFile.13', 'ImageFile.14', 'ImageFile.15',
      'ImageFile.16', 'ImageFile.17', 'ImageFile.18', 'ImageFile.19', 'ImageFile.20',
      'Buy Now Price',
      'Exclude From Buy Now',
      'Reserve Price',
      'Height',
      'Width',
      'Depth',
      'Dimension Unit',
      'Weight',
      'Weight Unit',
      'Domestic Flat Shipping Price',
      'Quantity',
      'Category',
      'Origin',
      'Style & Period',
      'Creator',
      'Materials & Techniques',
      'Lot Reference Number',
      'Location Nickname'
    ];

    // Build CSV rows
    const rows = lots.map(lot => {
      // Prepare image file names in LiveAuctioneers format: lotNumber_sequence.jpg
      // CRITICAL: Primary photo is ALWAYS at index 0 â†’ becomes lotNumber_1.jpg in ImageFile.1
      // This ensures the primary photo displays as the main image on LiveAuctioneers
      const imageColumns = Array(20).fill('');
      lot.photos.forEach((_photo, index) => {
        if (index < 20) {
          // Format: lotNumber_sequence.jpg (e.g., 123_1.jpg, 123_2.jpg)
          // Primary photo at index 0 â†’ 123_1.jpg â†’ ImageFile.1 column
          imageColumns[index] = `${lot.lot_number}_${index + 1}.jpg`;
        }
      });

      return [
        lot.lot_number || '',
        this.escapeCSV(lot.name || ''),
        this.escapeCSV(lot.description || ''),
        lot.estimate_low || '',
        lot.estimate_high || '',
        lot.starting_bid || (lot.estimate_low ? Math.floor(lot.estimate_low * 0.5) : ''),
        this.escapeCSV(lot.condition || ''),
        this.escapeCSV(lot.consignor || ''),
        ...imageColumns,
        lot.buy_now_price || '',
        '0', // Default: eligible for Buy Now
        lot.reserve_price || '',
        lot.height || '',
        lot.width || '',
        lot.depth || '',
        lot.dimension_unit || 'in',
        lot.weight || '',
        'lb', // Weight unit (default to lb)
        '', // Domestic shipping price
        lot.quantity || '1',
        lot.category || '',
        lot.origin || '',
        lot.style || '',
        lot.creator || '',
        lot.materials || '',
        '', // Lot reference number
        ''  // Location nickname
      ];
    });

    // Combine headers and rows
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ];

    return csvLines.join('\n');
  }

  /**
   * Escape CSV field values
   */
  private escapeCSV(value: string): string {
    if (!value) return '';
    
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    
    return value;
  }

  /**
   * Download CSV file
   */
  private downloadCSV(content: string, saleName: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.sanitizeFilename(saleName)}_LiveAuctioneers.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Create ZIP file with CSV and photos
   */
  private async createZipWithPhotos(
    csvContent: string,
    saleName: string,
    lots: Array<Lot & { photos: Photo[] }>
  ): Promise<Blob> {
    console.log('ðŸ“¦ Creating ZIP with photos...');
    
    const zip = new JSZip();
    
    // Add CSV to zip
    const csvFilename = `${this.sanitizeFilename(saleName)}_LiveAuctioneers.csv`;
    zip.file(csvFilename, csvContent);

    // Create photos folder
    const photosFolder = zip.folder('photos');
    
    if (!photosFolder) {
      throw new Error('Failed to create photos folder in ZIP');
    }

    let photoCount = 0;
    let failedCount = 0;

    // Add photos to zip
    for (const lot of lots) {
      for (let i = 0; i < lot.photos.length && i < 20; i++) {
        const photo = lot.photos[i];
        
        try {
          // Get photo blob from PhotoService
          const photoBlob = await PhotoService.getPhotoBlob(photo.id);
          
          if (photoBlob) {
            // Rename photo to LiveAuctioneers format: lotNumber_sequence.jpg
            const photoFilename = `${lot.lot_number}_${i + 1}.jpg`;
            photosFolder.file(photoFilename, photoBlob);
            photoCount++;
          } else {
            console.warn(`[WARN] Photo blob not found for ${photo.file_name}`);
            failedCount++;
          }
        } catch (error) {
          console.error(`âŒ Failed to add photo ${photo.file_name}:`, error);
          failedCount++;
        }
      }
    }

    console.log(`[OK] Added ${photoCount} photos to ZIP (${failedCount} failed)`);

    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6 // Balance between size and speed
      }
    });

    // Download ZIP
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.sanitizeFilename(saleName)}_LiveAuctioneers.zip`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);

    return zipBlob;
  }

  /**
   * Sanitize filename for safe file system use
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-z0-9_-]/gi, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }

  /**
   * Get export stats for a sale
   */
  async getExportStats(saleId: string): Promise<{
    totalLots: number;
    lotsWithPhotos: number;
    totalPhotos: number;
    missingData: string[];
  }> {
    try {
      const lots = await this.fetchLots(saleId);
      const lotsWithPhotos = await this.fetchPhotosForLots(lots);

      const totalPhotos = lotsWithPhotos.reduce((sum, lot) => sum + lot.photos.length, 0);
      const lotsWithPhotosCount = lotsWithPhotos.filter(lot => lot.photos.length > 0).length;

      // Check for missing required data
      const missingData: string[] = [];
      lotsWithPhotos.forEach(lot => {
        if (!lot.name || lot.name.length > 100) {
          missingData.push(`Lot ${lot.lot_number}: Title missing or exceeds 100 characters`);
        }
        if (!lot.description) {
          missingData.push(`Lot ${lot.lot_number}: Description missing`);
        }
        if (!lot.estimate_low || !lot.estimate_high) {
          missingData.push(`Lot ${lot.lot_number}: Estimates missing`);
        }
      });

      return {
        totalLots: lots.length,
        lotsWithPhotos: lotsWithPhotosCount,
        totalPhotos,
        missingData: missingData.slice(0, 10) // Limit to first 10 issues
      };
    } catch (error) {
      console.error('Error getting export stats:', error);
      return {
        totalLots: 0,
        lotsWithPhotos: 0,
        totalPhotos: 0,
        missingData: ['Error loading export statistics']
      };
    }
  }
}

export default new ExportService();