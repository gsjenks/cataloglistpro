import { useState, useRef, useEffect } from 'react';
import { Upload, FileSpreadsheet, Image, CheckCircle2, AlertCircle, Download, X, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PhotoService from '../services/PhotoService';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  lotNumbers: string[];
}

interface UploadProgress {
  total: number;
  current: number;
  percentage: number;
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  message: string;
}

interface ImportResult {
  success: boolean;
  lotsCreated: number;
  lotsUpdated: number;
  photosAdded: number;
  photosSkipped: number;
  warnings: string[];
  errors: string[];
}

interface Sale {
  id: string;
  name: string;
  status: string;
}

interface LiveAuctioneersUploadProps {
  saleId?: string;
  saleName?: string;
}

export default function LiveAuctioneersUpload({ saleId: initialSaleId, saleName: initialSaleName }: LiveAuctioneersUploadProps) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(initialSaleId || null);
  const [selectedSaleName, setSelectedSaleName] = useState<string>(initialSaleName || '');
  const [availableSales, setAvailableSales] = useState<Sale[]>([]);
  const [showSaleSelector, setShowSaleSelector] = useState(false);
  const [loadingSales, setLoadingSales] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvValidation, setCsvValidation] = useState<ValidationResult | null>(null);
  const [csvProgress, setCsvProgress] = useState<UploadProgress>({
    total: 0,
    current: 0,
    percentage: 0,
    status: 'idle',
    message: ''
  });

  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageValidation, setImageValidation] = useState<ValidationResult | null>(null);
  const [imageProgress, setImageProgress] = useState<UploadProgress>({
    total: 0,
    current: 0,
    percentage: 0,
    status: 'idle',
    message: ''
  });

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load available sales if no saleId provided
  useEffect(() => {
    if (!initialSaleId) {
      loadAvailableSales();
    }
  }, [initialSaleId]);

  const loadAvailableSales = async () => {
    setLoadingSales(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id, name, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableSales(data || []);
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoadingSales(false);
    }
  };

  // Validate lot numbers exist in database for selected sale
  const validateLotsExistInDatabase = async (lotNumbers: string[]): Promise<{ valid: boolean; missingLots: string[] }> => {
    if (!selectedSaleId) {
      return { valid: false, missingLots: lotNumbers };
    }

    try {
      const { data, error } = await supabase
        .from('lots')
        .select('lot_number')
        .eq('sale_id', selectedSaleId);

      if (error) throw error;

      const existingLotNumbers = new Set((data || []).map(lot => String(lot.lot_number)));
      const missingLots = lotNumbers.filter(lotNum => !existingLotNumbers.has(String(lotNum)));

      console.log('Database lot numbers:', Array.from(existingLotNumbers));
      console.log('Image filename lot numbers:', lotNumbers);
      console.log('Missing lots:', missingLots);

      return {
        valid: missingLots.length === 0,
        missingLots
      };
    } catch (error) {
      console.error('Error validating lots:', error);
      return { valid: false, missingLots: lotNumbers };
    }
  };

  // Properly parse CSV line respecting quotes
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    
    return result;
  };

  // CSV Validation
  const validateCSV = async (file: File): Promise<ValidationResult> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        const errors: string[] = [];
        const warnings: string[] = [];
        const lotNumbers: string[] = [];

        if (lines.length < 2) {
          errors.push('CSV file appears to be empty or missing data rows');
          resolve({ valid: false, errors, warnings, lotNumbers });
          return;
        }

        // Check header row
        const header = lines[0].toLowerCase().replace(/\s+/g, '');
        const requiredColumns = ['lotnum', 'title', 'description'];
        const estimateColumns = ['lowest', 'lowes', 'lowestimate'];
        const priceColumns = ['startprice', 'starting'];
        
        const missingColumns = requiredColumns.filter(col => !header.includes(col));
        
        // Check for estimate columns (need at least one)
        const hasEstimate = estimateColumns.some(col => header.includes(col));
        if (!hasEstimate) {
          warnings.push('No estimate columns found (LowEst/LowEstimate)');
        }
        
        // Check for price columns (need at least one)
        const hasPrice = priceColumns.some(col => header.includes(col));
        if (!hasPrice) {
          warnings.push('No starting price column found (StartPrice)');
        }
        
        if (missingColumns.length > 0) {
          errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Parse lot numbers from data rows
        const headerCols = parseCSVLine(lines[0]);
        const lotNumIndex = headerCols.findIndex(col => col.toLowerCase().includes('lotnum'));
        
        if (lotNumIndex === -1) {
          errors.push('Cannot find LotNum column');
        } else {
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            const lotNum = cols[lotNumIndex]?.trim();
            if (lotNum && lotNum !== '') {
              lotNumbers.push(lotNum);
            }
          }
        }

        if (lotNumbers.length === 0) {
          warnings.push('No lot numbers found in CSV');
        }

        resolve({
          valid: errors.length === 0,
          errors,
          warnings,
          lotNumbers
        });
      };

      reader.onerror = () => {
        resolve({
          valid: false,
          errors: ['Failed to read CSV file'],
          warnings: [],
          lotNumbers: []
        });
      };

      reader.readAsText(file);
    });
  };

  // Image Validation
  const validateImages = async (files: File[], lotNumbers: string[]): Promise<ValidationResult> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const acceptedFormats = ['.jpg', '.jpeg', '.png', '.tiff', '.pdf', '.heif', '.heic'];
    
    // Check file formats
    const invalidFiles = files.filter(file => 
      !acceptedFormats.some(format => file.name.toLowerCase().endsWith(format))
    );
    
    if (invalidFiles.length > 0) {
      errors.push(`${invalidFiles.length} files have invalid formats. Accepted: ${acceptedFormats.join(', ')}`);
    }

    // Check file sizes (must be > 15kb)
    const tooSmall = files.filter(file => file.size < 15360); // 15kb
    if (tooSmall.length > 0) {
      warnings.push(`${tooSmall.length} files are smaller than 15kb and may be rejected by LiveAuctioneers`);
    }

    // Parse lot numbers from filenames
    const imagesByLot = new Map<string, string[]>();
    files.forEach(file => {
      // Match formats: lotnum_sequence.ext OR lotnum.sequence.ext
      const match = file.name.match(/^(\d+[A-Za-z]?)[-_.](\d+)\./);
      if (match) {
        const lotNum = match[1];
        if (!imagesByLot.has(lotNum)) {
          imagesByLot.set(lotNum, []);
        }
        imagesByLot.get(lotNum)!.push(file.name);
      } else {
        warnings.push(`Image "${file.name}" doesn't follow naming convention (lotNum_sequence.jpg or lotNum.sequence.jpg)`);
      }
    });

    const imageLotNumbers = Array.from(imagesByLot.keys());

    // If no CSV provided (images only), validate against database
    if (lotNumbers.length === 0 && imageLotNumbers.length > 0) {
      if (!selectedSaleId) {
        errors.push('Please select a sale before uploading images');
        return {
          valid: false,
          errors,
          warnings,
          lotNumbers: imageLotNumbers
        };
      }

      // Check if lots exist in database
      const { valid, missingLots } = await validateLotsExistInDatabase(imageLotNumbers);
      
      if (!valid && missingLots.length > 0) {
        // Don't block import - just warn about missing lots
        warnings.push(`Warning: ${missingLots.length} lot(s) do not exist and their images will be skipped:`);
        missingLots.forEach(lotNum => {
          warnings.push(`  • Lot ${lotNum} - images will be skipped`);
        });
        
        // Still return valid=true so import can proceed
        return {
          valid: true,
          errors,
          warnings,
          lotNumbers: imageLotNumbers
        };
      }
    }

    // Check for orphaned images (no matching lot in CSV)
    if (lotNumbers.length > 0) {
      const orphanedLots: string[] = [];
      imagesByLot.forEach((_images, lotNum) => {
        if (!lotNumbers.includes(lotNum)) {
          orphanedLots.push(lotNum);
        }
      });
      
      if (orphanedLots.length > 0) {
        warnings.push(`Images found for lots not in CSV: ${orphanedLots.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      lotNumbers: imageLotNumbers
    };
  };

  // Handle CSV Upload
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvProgress({ total: 1, current: 0, percentage: 0, status: 'uploading', message: 'Reading CSV file...' });
    setCsvFile(file);

    try {
      setCsvProgress(prev => ({ ...prev, status: 'processing', message: 'Validating CSV...' }));
      const validation = await validateCSV(file);
      setCsvValidation(validation);
      
      setCsvProgress({
        total: 1,
        current: 1,
        percentage: 100,
        status: validation.valid ? 'complete' : 'error',
        message: validation.valid 
          ? `CSV validated: ${validation.lotNumbers.length} lots found`
          : 'CSV validation failed'
      });
    } catch (error) {
      setCsvProgress({
        total: 1,
        current: 0,
        percentage: 0,
        status: 'error',
        message: 'Failed to process CSV file'
      });
    }
  };

  // Handle Image Upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setImageProgress({ total: files.length, current: 0, percentage: 0, status: 'uploading', message: 'Loading images...' });
    setImageFiles(files);

    try {
      // Simulate progressive loading
      for (let i = 0; i < files.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        setImageProgress({
          total: files.length,
          current: i + 1,
          percentage: Math.round(((i + 1) / files.length) * 100),
          status: 'uploading',
          message: `Loading images... ${i + 1}/${files.length}`
        });
      }

      setImageProgress(prev => ({ ...prev, status: 'processing', message: 'Validating images...' }));
      const validation = await validateImages(files, csvValidation?.lotNumbers || []);
      setImageValidation(validation);
      
      setImageProgress({
        total: files.length,
        current: files.length,
        percentage: 100,
        status: validation.valid ? 'complete' : 'error',
        message: validation.valid 
          ? `${files.length} images validated`
          : 'Image validation failed - see errors below'
      });
    } catch (error) {
      setImageProgress({
        total: files.length,
        current: 0,
        percentage: 0,
        status: 'error',
        message: 'Failed to process images'
      });
    }
  };

  // Parse CSV row into Lot object
  const parseLotFromCSV = (row: string[], headers: string[]): any => {
    const lot: any = {};
    
    headers.forEach((header, index) => {
      const value = row[index]?.trim(); // parseCSVLine already removes quotes
      const headerLower = header.toLowerCase().replace(/\s+/g, ''); // Remove spaces for matching
      
      if (!value) return;
      
      // Map CSV columns to database fields
      if (headerLower.includes('lotnum')) {
        // Try to parse as number, keep as string if it contains letters
        const numValue = parseInt(value);
        lot.lot_number = isNaN(numValue) ? value : numValue;
      } else if (headerLower.includes('title')) {
        lot.name = value;
      } else if (headerLower.includes('description')) {
        lot.description = value;
      } else if (headerLower === 'lowestimate' || headerLower === 'lowest' || headerLower === 'lowes') {
        lot.estimate_low = parseFloat(value) || undefined;
      } else if (headerLower === 'highestimate' || headerLower === 'highest' || headerLower === 'highes') {
        lot.estimate_high = parseFloat(value) || undefined;
      } else if (headerLower === 'startprice') {
        lot.starting_bid = parseFloat(value) || undefined;
      } else if (headerLower === 'reserveprice' || headerLower.includes('reserve')) {
        lot.reserve_price = parseFloat(value) || undefined;
      } else if (headerLower === 'buynowprice' || headerLower.includes('buynow')) {
        lot.buy_now_price = parseFloat(value) || undefined;
      } else if (headerLower === 'condition') {
        lot.condition = value;
      } else if (headerLower.includes('consign')) {
        lot.consignor = value;
      } else if (headerLower === 'height') {
        lot.height = parseFloat(value) || undefined;
      } else if (headerLower === 'width') {
        lot.width = parseFloat(value) || undefined;
      } else if (headerLower === 'depth') {
        lot.depth = parseFloat(value) || undefined;
      } else if (headerLower === 'dimensionunit' || headerLower === 'dimension_unit') {
        lot.dimension_unit = value;
      } else if (headerLower === 'weight') {
        lot.weight = parseFloat(value) || undefined;
      } else if (headerLower === 'quantity') {
        lot.quantity = parseInt(value) || undefined;
      } else if (headerLower === 'category') {
        lot.category = value;
      } else if (headerLower === 'origin') {
        lot.origin = value;
      } else if (headerLower === 'style&period' || headerLower.includes('style')) {
        lot.style = value;
      } else if (headerLower.includes('creator')) {
        lot.creator = value;
      } else if (headerLower === 'materials&techniques' || headerLower.includes('material')) {
        lot.materials = value;
      }
    });
    
    return lot;
  };

  // Import lots from CSV
  const handleImportCSV = async (): Promise<{ created: number; updated: number; warnings: string[]; errors: string[] }> => {
    if (!csvFile || !selectedSaleId) {
      return { created: 0, updated: 0, warnings: [], errors: ['No CSV file or sale selected'] };
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            resolve({ created: 0, updated: 0, warnings: [], errors: ['CSV file is empty'] });
            return;
          }

          const headers = parseCSVLine(lines[0]);
          const dataRows = lines.slice(1);
          
          let created = 0;
          let updated = 0;
          const warnings: string[] = [];
          const errors: string[] = [];

          // Get existing lot numbers for this sale
          const { data: existingLots } = await supabase
            .from('lots')
            .select('id, lot_number')
            .eq('sale_id', selectedSaleId);

          const existingLotNumbers = new Map(
            (existingLots || []).map(lot => [String(lot.lot_number), lot.id])
          );

          // Process each row
          for (let i = 0; i < dataRows.length; i++) {
            setCsvProgress({
              total: dataRows.length,
              current: i + 1,
              percentage: Math.round(((i + 1) / dataRows.length) * 100),
              status: 'processing',
              message: `Importing lot ${i + 1} of ${dataRows.length}...`
            });

            const row = parseCSVLine(dataRows[i]);
            const lotData = parseLotFromCSV(row, headers);
            
            if (!lotData.lot_number) {
              errors.push(`Row ${i + 2}: Missing lot number`);
              continue;
            }

            lotData.sale_id = selectedSaleId;

            // Check if lot exists
            const existingLotId = existingLotNumbers.get(String(lotData.lot_number));
            
            if (existingLotId) {
              // Warn about duplicate
              warnings.push(`Lot ${lotData.lot_number} already exists (will be created as duplicate)`);
            }

            // Always create new lot (as per requirements)
            const { error: insertError } = await supabase
              .from('lots')
              .insert(lotData);

            if (insertError) {
              errors.push(`Lot ${lotData.lot_number}: ${insertError.message}`);
            } else {
              created++;
            }
          }

          setCsvProgress({
            total: dataRows.length,
            current: dataRows.length,
            percentage: 100,
            status: 'complete',
            message: `Imported ${created} lots`
          });

          resolve({ created, updated, warnings, errors });
        } catch (error) {
          resolve({
            created: 0,
            updated: 0,
            warnings: [],
            errors: [error instanceof Error ? error.message : 'Failed to import CSV']
          });
        }
      };

      reader.onerror = () => {
        resolve({ created: 0, updated: 0, warnings: [], errors: ['Failed to read CSV file'] });
      };

      reader.readAsText(csvFile);
    });
  };

  // Import images
  const handleImportImages = async (): Promise<{ added: number; skipped: number; warnings: string[]; errors: string[] }> => {
    if (!selectedSaleId || imageFiles.length === 0) {
      return { added: 0, skipped: 0, warnings: [], errors: ['No images to import'] };
    }

    let added = 0;
    let skipped = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Get all lots for this sale
      const { data: lots } = await supabase
        .from('lots')
        .select('id, lot_number')
        .eq('sale_id', selectedSaleId);

      if (!lots || lots.length === 0) {
        return { added: 0, skipped: 0, warnings: [], errors: ['No lots found in sale'] };
      }

      const lotMap = new Map(lots.map(lot => [String(lot.lot_number), lot.id]));

      console.log('Available lots:', Array.from(lotMap.keys()));
      console.log('Processing', imageFiles.length, 'images');

      // Get existing photos to check for duplicates
      const { data: existingPhotos } = await supabase
        .from('photos')
        .select('lot_id, file_name')
        .in('lot_id', lots.map(l => l.id));

      const existingPhotoSet = new Set(
        (existingPhotos || []).map(p => `${p.lot_id}_${p.file_name}`)
      );

      // Process each image
      for (let i = 0; i < imageFiles.length; i++) {
        setImageProgress({
          total: imageFiles.length,
          current: i + 1,
          percentage: Math.round(((i + 1) / imageFiles.length) * 100),
          status: 'uploading',
          message: `Uploading image ${i + 1} of ${imageFiles.length}...`
        });

        const file = imageFiles[i];
        
        // Parse filename: lotnum_sequence.ext or lotnum.sequence.ext
        const match = file.name.match(/^(\d+[A-Za-z]?)[-_.](\d+)\./);
        
        console.log(`Processing file: ${file.name}, match:`, match);
        
        if (!match) {
          warnings.push(`${file.name}: Invalid filename format`);
          continue;
        }

        const [, lotNumber, sequence] = match;
        const lotId = lotMap.get(lotNumber);

        console.log(`File ${file.name} -> Lot ${lotNumber}, Sequence ${sequence}, LotID: ${lotId}`);

        if (!lotId) {
          errors.push(`${file.name}: Lot ${lotNumber} does not exist in this sale - skipped`);
          console.error(`Lot ${lotNumber} not found for ${file.name} - continuing with next image`);
          continue;
        }

        // Check if this lot/sequence combo already exists
        const photoKey = `${lotId}_${file.name}`;
        if (existingPhotoSet.has(photoKey)) {
          warnings.push(`${file.name}: Already exists for lot ${lotNumber}, skipping`);
          skipped++;
          continue;
        }

        // Upload photo
        const photoId = crypto.randomUUID(); // Generate proper UUID
        const filePath = `${selectedSaleId}/${lotId}/${photoId}.jpg`;
        
        try {
          // Convert file to blob
          const blob = new Blob([await file.arrayBuffer()], { type: file.type });
          
          console.log(`Uploading ${file.name} for lot ${lotNumber} (ID: ${lotId})`);
          
          // Save blob locally first
          await PhotoService.savePhotoBlob(photoId, blob);
          
          // Upload to Supabase
          const uploadResult = await PhotoService.uploadToSupabase(blob, filePath);
          
          if (!uploadResult.success) {
            errors.push(`${file.name}: Upload failed - ${uploadResult.error}`);
            console.error(`Upload failed for ${file.name}:`, uploadResult.error);
            continue;
          }

          console.log(`Upload successful for ${file.name}, saving metadata...`);

          // Save metadata to database
          const isPrimary = parseInt(sequence) === 1;
          const photoMetadata = {
            id: photoId,
            lot_id: lotId,
            file_path: filePath,
            file_name: file.name,
            is_primary: isPrimary,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Use supabase directly for better error messages
          const { error: metadataError } = await supabase
            .from('photos')
            .insert(photoMetadata);
          
          if (metadataError) {
            errors.push(`${file.name}: Metadata error - ${metadataError.message}`);
            console.error(`Metadata save failed for ${file.name}:`, metadataError);
            continue;
          }

          console.log(`Successfully imported ${file.name}`);
          added++;
          existingPhotoSet.add(photoKey);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Upload failed';
          errors.push(`${file.name}: ${errorMsg}`);
          console.error(`Error importing ${file.name}:`, error);
        }
      }

      setImageProgress({
        total: imageFiles.length,
        current: imageFiles.length,
        percentage: 100,
        status: 'complete',
        message: `Uploaded ${added} images`
      });

      return { added, skipped, warnings, errors };
    } catch (error) {
      return {
        added,
        skipped,
        warnings,
        errors: [...errors, error instanceof Error ? error.message : 'Failed to import images']
      };
    }
  };

  // Main import handler
  const handleImport = async () => {
    if (!selectedSaleId) {
      alert('Please select a sale first');
      return;
    }

    if (!csvFile && imageFiles.length === 0) {
      alert('Please upload CSV or images to import');
      return;
    }

    setImporting(true);
    setImportResult(null);

    const result: ImportResult = {
      success: false,
      lotsCreated: 0,
      lotsUpdated: 0,
      photosAdded: 0,
      photosSkipped: 0,
      warnings: [],
      errors: []
    };

    try {
      // Import CSV if provided
      if (csvFile) {
        const csvResult = await handleImportCSV();
        result.lotsCreated = csvResult.created;
        result.lotsUpdated = csvResult.updated;
        result.warnings.push(...csvResult.warnings);
        result.errors.push(...csvResult.errors);
      }

      // Import images if provided
      if (imageFiles.length > 0) {
        const imageResult = await handleImportImages();
        result.photosAdded = imageResult.added;
        result.photosSkipped = imageResult.skipped;
        result.warnings.push(...imageResult.warnings);
        result.errors.push(...imageResult.errors);
      }

      // Consider it successful if any lots were created or any photos were added
      // Even if some images failed, partial success is still success
      result.success = (result.lotsCreated > 0 || result.photosAdded > 0);
      setImportResult(result);
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Import failed');
      setImportResult(result);
    } finally {
      setImporting(false);
    }
  };

  // Download Package
  const handleDownload = () => {
    // In a real implementation, this would create a ZIP file
    alert('Download functionality would create a ZIP with validated CSV and images');
  };

  // Clear CSV
  const clearCsv = () => {
    setCsvFile(null);
    setCsvValidation(null);
    setCsvProgress({ total: 0, current: 0, percentage: 0, status: 'idle', message: '' });
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  // Clear Images
  const clearImages = () => {
    setImageFiles([]);
    setImageValidation(null);
    setImageProgress({ total: 0, current: 0, percentage: 0, status: 'idle', message: '' });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Progress Bar Component
  const ProgressBar = ({ progress }: { progress: UploadProgress }) => {
    if (progress.status === 'idle') return null;

    const getStatusColor = () => {
      switch (progress.status) {
        case 'complete': return 'bg-green-600';
        case 'error': return 'bg-red-600';
        default: return 'bg-indigo-600';
      }
    };

    const getStatusIcon = () => {
      switch (progress.status) {
        case 'complete': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
        case 'error': return <AlertCircle className="w-4 h-4 text-red-600" />;
        default: return <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>;
      }
    };

    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          {getStatusIcon()}
          <span className="text-sm font-medium text-gray-700">{progress.message}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${getStatusColor()}`}
            style={{ width: `${progress.percentage}%` }}
          ></div>
        </div>
        {progress.total > 0 && (
          <div className="mt-1 text-xs text-gray-500 text-right">
            {progress.current} / {progress.total}
          </div>
        )}
      </div>
    );
  };

  // Validation Messages Component
  const ValidationMessages = ({ validation }: { validation: ValidationResult }) => {
    if (!validation || (validation.errors.length === 0 && validation.warnings.length === 0)) {
      return null;
    }

    return (
      <div className="mt-3 space-y-2">
        {validation.errors.map((error, idx) => (
          <div key={`error-${idx}`} className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ))}
        {validation.warnings.map((warning, idx) => (
          <div key={`warning-${idx}`} className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{warning}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">LiveAuctioneers Upload</h2>
        <p className="text-sm text-gray-600 mt-1">
          Prepare and validate your catalog CSV and images for LiveAuctioneers upload
        </p>
      </div>

      {/* Sale Selector */}
      {!initialSaleId && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Select Sale</h3>
              <p className="text-sm text-gray-600">Choose which sale these lots and images belong to</p>
            </div>
          </div>

          {loadingSales ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent"></div>
              <span className="ml-3 text-gray-600">Loading sales...</span>
            </div>
          ) : selectedSaleId ? (
            <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div>
                <p className="font-medium text-indigo-900">{selectedSaleName}</p>
                <p className="text-sm text-indigo-700">Selected Sale</p>
              </div>
              <button
                onClick={() => {
                  setSelectedSaleId(null);
                  setSelectedSaleName('');
                  setShowSaleSelector(true);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Change Sale
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowSaleSelector(!showSaleSelector)}
                className="w-full flex items-center justify-between p-4 bg-white border-2 border-gray-300 rounded-lg hover:border-indigo-400 transition-colors"
              >
                <span className="text-gray-500">Select a sale...</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showSaleSelector ? 'rotate-180' : ''}`} />
              </button>

              {showSaleSelector && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {availableSales.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No sales found. Create a sale first.
                    </div>
                  ) : (
                    availableSales.map((sale) => (
                      <button
                        key={sale.id}
                        onClick={() => {
                          setSelectedSaleId(sale.id);
                          setSelectedSaleName(sale.name);
                          setShowSaleSelector(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-gray-100 last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{sale.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{sale.status}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show current sale if provided via props */}
      {initialSaleId && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-sm font-medium text-indigo-900">
                Importing to: <span className="font-bold">{selectedSaleName}</span>
              </p>
              <p className="text-xs text-indigo-700">Lots and images will be associated with this sale</p>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Section */}
      <div className={`bg-white rounded-lg shadow border border-gray-200 p-6 ${!selectedSaleId ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Catalog CSV File</h3>
              <p className="text-sm text-gray-600">Required - Upload your LiveAuctioneers formatted CSV</p>
            </div>
          </div>
          {csvFile && (
            <button
              onClick={clearCsv}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {!selectedSaleId && !initialSaleId && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Please select a sale before uploading CSV
          </div>
        )}

        {!csvFile ? (
          <div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">Click to upload CSV file</span>
              <span className="text-xs text-gray-400 mt-1">LiveAuctioneers format (.csv)</span>
            </label>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{csvFile.name}</p>
                <p className="text-xs text-gray-500">{(csvFile.size / 1024).toFixed(2)} KB</p>
              </div>
              {csvValidation?.valid && (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              )}
            </div>
            
            <ProgressBar progress={csvProgress} />
            {csvValidation && <ValidationMessages validation={csvValidation} />}
            
            {csvValidation && csvValidation.lotNumbers.length > 0 && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm font-medium text-indigo-900">
                  ✓ Found {csvValidation.lotNumbers.length} lots in CSV
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  You can now upload images for these lots
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Upload Section */}
      <div className={`bg-white rounded-lg shadow border border-gray-200 p-6 ${!selectedSaleId ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Image className="w-8 h-8 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Lot Images</h3>
              <p className="text-sm text-gray-600">Upload images named as: lotNumber_sequence.jpg or lotNumber.sequence.jpg</p>
            </div>
          </div>
          {imageFiles.length > 0 && (
            <button
              onClick={clearImages}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {!selectedSaleId && !initialSaleId && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            Please select a sale before uploading images
          </div>
        )}

        {selectedSaleId && !csvFile && imageFiles.length === 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Upload Images to Existing Lots
                </p>
                <p className="text-xs text-blue-800">
                  Image filenames will be matched to existing lot numbers in <strong>{selectedSaleName}</strong>
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  Example: <code className="bg-blue-100 px-1 py-0.5 rounded">123_1.jpg</code> will be added to lot #123
                </p>
              </div>
            </div>
          </div>
        )}

        {imageFiles.length === 0 && selectedSaleId && (
          <div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,.tiff,.pdf,.heif,.heic"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-gray-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">Click to upload images</span>
              <span className="text-xs text-gray-400 mt-1">Multiple files: .jpg, .png, .tiff, .pdf, .heif, .heic</span>
            </label>
          </div>
        )}

        {imageFiles.length > 0 && (
          <div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <Image className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{imageFiles.length} images selected</p>
                  <p className="text-xs text-gray-500">
                    Total size: {(imageFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {imageValidation?.valid && (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                )}
              </div>
            </div>
            
            <ProgressBar progress={imageProgress} />
            {imageValidation && <ValidationMessages validation={imageValidation} />}
          </div>
        )}
      </div>

      {/* Requirements Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">LiveAuctioneers Requirements</h4>
        <div className="text-xs text-blue-800 space-y-1">
          <p>• CSV must include: LotNum, Title, Description, LowEst, HighEst, StartPrice</p>
          <p>• Images must be named: lotNumber_1.jpg or lotNumber.1.jpg format</p>
          <p>• Supported formats: .jpg, .jpeg, .png, .tiff, .pdf, .heif, .heic</p>
          <p>• Recommended size: up to 3840x3840 (4K)</p>
          <p>• Minimum file size: 15kb</p>
          <p>• No URLs, emails, or watermarks allowed</p>
        </div>
      </div>

      {/* Action Buttons */}
      {((csvFile && csvValidation?.valid) || (imageFiles.length > 0 && imageValidation?.valid)) && !importResult && (
        <div className="flex gap-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {importing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                <span>Import to Database</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            disabled={importing || !imageFiles.length || !csvFile}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <Download className="w-5 h-5" />
            Download Validated Package
          </button>
          <button
            onClick={() => {
              clearCsv();
              clearImages();
            }}
            disabled={importing}
            className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Start Over
          </button>
        </div>
      )}

      {/* Import Results */}
      {importResult && (
        <div className="space-y-4">
          {/* Success Summary */}
          {importResult.success && (
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-green-900 mb-3">
                    {importResult.errors.length > 0 ? 'Import Partially Successful' : 'Import Successful!'}
                  </h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{importResult.lotsCreated}</p>
                      <p className="text-sm text-gray-600">Lots Created</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{importResult.lotsUpdated}</p>
                      <p className="text-sm text-gray-600">Lots Updated</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{importResult.photosAdded}</p>
                      <p className="text-sm text-gray-600">Photos Added</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <p className="text-2xl font-bold text-yellow-600">{importResult.photosSkipped}</p>
                      <p className="text-sm text-gray-600">Photos Skipped</p>
                    </div>
                  </div>

                  {importResult.warnings.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm font-medium text-yellow-900 mb-2">Warnings:</p>
                      <ul className="text-xs text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
                        {importResult.warnings.slice(0, 20).map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                        {importResult.warnings.length > 20 && (
                          <li>• ... and {importResult.warnings.length - 20} more warnings</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm font-medium text-red-900 mb-2">
                        Errors ({importResult.photosAdded} photos successfully imported):
                      </p>
                      <ul className="text-xs text-red-800 space-y-1 max-h-40 overflow-y-auto">
                        {importResult.errors.slice(0, 20).map((error, idx) => (
                          <li key={idx}>• {error}</li>
                        ))}
                        {importResult.errors.length > 20 && (
                          <li>• ... and {importResult.errors.length - 20} more errors</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Summary */}
          {!importResult.success && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-900 mb-3">Import Failed</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="text-2xl font-bold text-green-600">{importResult.lotsCreated}</p>
                      <p className="text-sm text-gray-600">Lots Created</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="text-2xl font-bold text-green-600">{importResult.photosAdded}</p>
                      <p className="text-sm text-gray-600">Photos Added</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                      <p className="text-sm text-gray-600">Errors</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="text-2xl font-bold text-yellow-600">{importResult.warnings.length}</p>
                      <p className="text-sm text-gray-600">Warnings</p>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
                      <p className="text-sm font-medium text-red-900 mb-2">Errors:</p>
                      <ul className="text-xs text-red-800 space-y-1 max-h-40 overflow-y-auto">
                        {importResult.errors.slice(0, 20).map((error, idx) => (
                          <li key={idx}>• {error}</li>
                        ))}
                        {importResult.errors.length > 20 && (
                          <li>• ... and {importResult.errors.length - 20} more errors</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {importResult.warnings.length > 0 && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm font-medium text-yellow-900 mb-2">Warnings:</p>
                      <ul className="text-xs text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
                        {importResult.warnings.slice(0, 20).map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                        {importResult.warnings.length > 20 && (
                          <li>• ... and {importResult.warnings.length - 20} more warnings</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons After Import */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setImportResult(null);
                clearCsv();
                clearImages();
              }}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Import Another File
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}