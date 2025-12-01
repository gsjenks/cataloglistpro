import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, Package, Tag } from 'lucide-react';
import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabase';

interface EOAProcessingProps {
  saleId: string;
  saleName: string;
}

interface EOALot {
  'Lot Number': string;
  'Lot ID': string;
  'Title': string;
  'Sale Price': string;
  'Buyer Premium': string;
  'First Name': string;
  'Last Name': string;
  'Username': string;
  'Email': string;
  'Account phone': string;
  'Shipping Method': string;
  'Shipping Status': string;
  'Ship to, Phone': string;
  'Ship to, Name': string;
  'Ship to, Surname': string;
  'Company': string;
  'Address': string;
  'City': string;
  'State': string;
  'Country': string;
  'Postal Code': string;
  'Paddle Number': string;
  'Premium Bidder': string;
}

interface ProcessingStats {
  lotsProcessed: number;
  lotsUpdated: number;
  errors: string[];
}

export default function EOAProcessing({ saleId, saleName }: EOAProcessingProps) {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [parsedLots, setParsedLots] = useState<EOALot[]>([]);
  
  // Options
  const [updatePrices, setUpdatePrices] = useState(true);
  const [generateLabels, setGenerateLabels] = useState(true);
  const [generatePackingList, setGeneratePackingList] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.xlsx')) {
        setFile(selectedFile);
        setError(null);
        setStats(null);
        setParsedLots([]);
      } else if (selectedFile.name.endsWith('.xls')) {
        setError('Old Excel format (.xls) not supported. Please save as .xlsx in Excel and try again.');
        setFile(null);
      } else {
        setError('Please select an Excel file (.xlsx)');
        setFile(null);
      }
    }
  };

  const parseExcelFile = async (file: File): Promise<EOALot[]> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No worksheet found in Excel file');
      }
      
      const lots: EOALot[] = [];
      let headers: string[] = [];
      
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          headers = row.values as string[];
          headers.shift();
        } else {
          const lot: any = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              lot[header] = cell.text || cell.value?.toString() || '';
            }
          });
          
          if (lot['Lot Number']) {
            lots.push(lot as EOALot);
          }
        }
      });
      
      return lots;
    } catch (err) {
      if (err instanceof Error && err.message.includes('central directory')) {
        throw new Error('Invalid Excel file format. If this is a .xls file, please save as .xlsx in Excel and try again.');
      }
      throw err;
    }
  };

  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone;
  };

  const processData = async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setStats(null);

    try {
      // Parse Excel file
      const lots = await parseExcelFile(file);
      
      if (lots.length === 0) {
        throw new Error('No data found in Excel file');
      }

      setParsedLots(lots);

      const processingStats: ProcessingStats = {
        lotsProcessed: 0,
        lotsUpdated: 0,
        errors: []
      };

      // Process each lot
      for (const eaoLot of lots) {
        processingStats.lotsProcessed++;

        try {
          const lotNumber = eaoLot['Lot Number']?.trim();
          
          if (!lotNumber) {
            processingStats.errors.push(`Row ${processingStats.lotsProcessed}: Missing lot number`);
            continue;
          }

          // Find matching lot in database
          const { data: dbLots, error: lotError } = await supabase
            .from('lots')
            .select('id, lot_number')
            .eq('sale_id', saleId)
            .eq('lot_number', lotNumber);

          if (lotError) throw lotError;

          if (!dbLots || dbLots.length === 0) {
            processingStats.errors.push(`Lot ${lotNumber}: Not found in database`);
            continue;
          }

          const dbLot = dbLots[0];

          // Update sold price if enabled
          if (updatePrices) {
            const salePrice = parseCurrency(eaoLot['Sale Price'] || '0');
            
            if (salePrice > 0) {
              const { error: updateError } = await supabase
                .from('lots')
                .update({ sold_price: salePrice })
                .eq('id', dbLot.id);

              if (updateError) {
                processingStats.errors.push(`Lot ${lotNumber}: Failed to update price - ${updateError.message}`);
              } else {
                processingStats.lotsUpdated++;
              }
            }
          }

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          processingStats.errors.push(`Lot ${eaoLot['Lot Number']}: ${errorMsg}`);
          console.error(`Error processing lot ${eaoLot['Lot Number']}:`, err);
        }
      }

      setStats(processingStats);
      
      if (processingStats.errors.length > 0) {
        setError(`Processing completed with ${processingStats.errors.length} errors. See details below.`);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMsg);
      console.error('Processing error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const downloadShippingLabels = async () => {
    if (parsedLots.length === 0) return;

    try {
      // Fetch company info to get logo
      const { data: sale } = await supabase
        .from('sales')
        .select('company_id')
        .eq('id', saleId)
        .single();

      let logoData: string | null = null;
      
      if (sale?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('logo_url')
          .eq('id', sale.company_id)
          .single();

        // Load logo image if available
        if (company?.logo_url) {
          try {
            const response = await fetch(company.logo_url);
            const blob = await response.blob();
            logoData = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.warn('Could not load company logo:', err);
          }
        }
      }

      // Sort lots by lot number
      const sortedLots = [...parsedLots].sort((a, b) => 
        String(a['Lot Number']).localeCompare(String(b['Lot Number']), undefined, { numeric: true })
      );

      // Generate labels PDF (using browser-based approach)
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter'
      });

      // Avery 55163 specs: 2" x 4" labels, 2 across, 5 down
      const labelWidth = 4;
      const labelHeight = 2;
      const leftMargin = 0.16;
      const topMargin = 0.5;
      const horizontalGap = 0.18;
      const verticalGap = 0;

      let labelCount = 0;

      for (const lot of sortedLots) {
        const row = Math.floor((labelCount % 10) / 2);
        const col = labelCount % 2;

        if (labelCount > 0 && labelCount % 10 === 0) {
          doc.addPage();
        }

        const x = leftMargin + col * (labelWidth + horizontalGap);
        const y = topMargin + row * (labelHeight + verticalGap);

        // Draw label content
        let currentY = y + 0.15;

        // Add company logo if available
        if (logoData) {
          try {
            doc.addImage(logoData, 'PNG', x + 0.05, y + 0.05, 0.5, 0.5);
          } catch (err) {
            console.warn('Could not add logo to label:', err);
          }
        }


        // Header - Centered first 3 lines
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const line1 = 'Benson Auction Services';
        const line1Width = doc.getTextWidth(line1);
        doc.text(line1, x + (labelWidth - line1Width) / 2, currentY);
        currentY += 0.12;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        const line2 = 'November 1, 2025';
        const line2Width = doc.getTextWidth(line2);
        doc.text(line2, x + (labelWidth - line2Width) / 2, currentY);
        currentY += 0.12;

        doc.setFontSize(7);
        const line3 = '(404) 441-5329';
        const line3Width = doc.getTextWidth(line3);
        doc.text(line3, x + (labelWidth - line3Width) / 2, currentY);
        currentY += 0.15;

        // Lot number - Centered
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 0, 0);
        const lotText = `Lot#${lot['Lot Number']}`;
        const lotTextWidth = doc.getTextWidth(lotText);
        doc.text(lotText, x + (labelWidth - lotTextWidth) / 2, currentY);
        currentY += 0.15;

        // Title - Centered
        doc.setFontSize(8);
        doc.setTextColor(128, 0, 128);
        const title = lot['Title'].substring(0, 60);
        const titleWidth = doc.getTextWidth(title);
        doc.text(title, x + (labelWidth - titleWidth) / 2, currentY);
        currentY += 0.2;

        // Address
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        const shipName = `${lot['Ship to, Name']} ${lot['Ship to, Surname']}`.trim();
        if (shipName) {
          doc.text(shipName, x + 0.1, currentY);
          currentY += 0.12;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        
        if (lot['Company']) {
          doc.text(lot['Company'], x + 0.1, currentY);
          currentY += 0.12;
        }
        if (lot['Address']) {
          doc.text(lot['Address'], x + 0.1, currentY);
          currentY += 0.12;
        }
        
        const cityLine = `${lot['City']}, ${lot['State']} ${lot['Postal Code']}`.trim();
        if (cityLine.replace(/,/g, '')) {
          doc.text(cityLine, x + 0.1, currentY);
          currentY += 0.12;
        }

        const phone = formatPhone(lot['Ship to, Phone'] || '');
        if (phone) {
          doc.text(`Phone: ${phone}`, x + 0.1, currentY);
          currentY += 0.12;
        }

        doc.setFontSize(6);
        const email = lot['Email']?.substring(0, 45) || '';
        if (email) {
          doc.text(`Email: ${email}`, x + 0.1, currentY);
        }

        labelCount++;
      }

      doc.save(`${saleName}_Shipping_Labels.pdf`);
    } catch (err) {
      console.error('Error generating labels:', err);
      alert('Failed to generate shipping labels');
    }
  };

  const downloadPackingList = async () => {
    if (parsedLots.length === 0) return;

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Packing List');

      // Headers
      const headers = [
        'Lot Number', 'Title', 'Sale Price', 'Shipping Method',
        'Ship to Name', 'Ship to Surname', 'Company', 
        'Address', 'City', 'State', 'Postal Code', 'Country',
        'Phone', 'Email'
      ];

      worksheet.addRow(headers);

      // Style header
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Sort by shipping method then lot number
      const sortedLots = [...parsedLots].sort((a, b) => {
        const methodCompare = (a['Shipping Method'] || '').localeCompare(b['Shipping Method'] || '');
        if (methodCompare !== 0) return methodCompare;
        return String(a['Lot Number']).localeCompare(String(b['Lot Number']), undefined, { numeric: true });
      });

      // Add data
      for (const lot of sortedLots) {
        worksheet.addRow([
          lot['Lot Number'],
          lot['Title'],
          lot['Sale Price'],
          lot['Shipping Method'],
          lot['Ship to, Name'],
          lot['Ship to, Surname'],
          lot['Company'],
          lot['Address'],
          lot['City'],
          lot['State'],
          lot['Postal Code'],
          lot['Country'],
          formatPhone(lot['Ship to, Phone'] || ''),
          lot['Email']
        ]);
      }

      // Auto-size columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: false }, cell => {
          const length = cell.value ? cell.value.toString().length : 0;
          if (length > maxLength) maxLength = length;
        });
        column.width = Math.min(maxLength + 2, 50);
      });

      // Download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${saleName}_Packing_List.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating packing list:', err);
      alert('Failed to generate packing list');
    }
  };

  const downloadReport = () => {
    if (!stats) return;

    const report = [
      'EOA Processing Report',
      `Sale: ${saleName}`,
      `Date: ${new Date().toLocaleString()}`,
      '',
      'Summary:',
      `- Lots Processed: ${stats.lotsProcessed}`,
      `- Lots Updated: ${stats.lotsUpdated}`,
      `- Errors: ${stats.errors.length}`,
      '',
    ];

    if (stats.errors.length > 0) {
      report.push('Errors:');
      stats.errors.forEach(err => report.push(`- ${err}`));
    }

    const blob = new Blob([report.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EOA_Processing_Report_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-indigo-50 rounded-lg">
          <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            EOA Processing
          </h2>
          <p className="text-sm text-gray-600">
            Import LiveAuctioneers End of Auction Report, update prices, and generate shipping documents.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={updatePrices}
            onChange={(e) => setUpdatePrices(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Update lot sold prices
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={generateLabels}
            onChange={(e) => setGenerateLabels(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Generate shipping labels (Avery 55163)
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={generatePackingList}
            onChange={(e) => setGeneratePackingList(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Generate packing list (Excel)
          </span>
        </label>
      </div>

      {/* File Upload */}
      <div className="mb-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
        />
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            {file ? file.name : 'Select EOA Excel File (.xlsx)'}
          </span>
        </button>
      </div>

      {/* Process Button */}
      {file && !stats && (
        <button
          onClick={processData}
          disabled={processing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {processing ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Package className="w-5 h-5" />
              <span>Process EOA File</span>
            </>
          )}
        </button>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 mb-1">Processing Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Success Stats & Downloads */}
      {stats && (
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 mb-2">
                  Processing Completed
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm text-green-700">
                  <div>Lots Processed: <strong>{stats.lotsProcessed}</strong></div>
                  <div>Lots Updated: <strong>{stats.lotsUpdated}</strong></div>
                </div>
              </div>
            </div>

            {stats.errors.length > 0 && (
              <div className="mt-3 pt-3 border-t border-green-200">
                <p className="text-sm font-medium text-green-800 mb-2">
                  Errors ({stats.errors.length}):
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {stats.errors.slice(0, 10).map((err, idx) => (
                    <p key={idx} className="text-xs text-green-700">• {err}</p>
                  ))}
                  {stats.errors.length > 10 && (
                    <p className="text-xs text-green-700 italic">
                      ... and {stats.errors.length - 10} more errors
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Download Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {generateLabels && (
              <button
                onClick={downloadShippingLabels}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                <Tag className="w-4 h-4" />
                Shipping Labels
              </button>
            )}

            {generatePackingList && (
              <button
                onClick={downloadPackingList}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Packing List
              </button>
            )}
          </div>

          {/* Report Download */}
          <button
            onClick={downloadReport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
          >
            <Download className="w-4 h-4" />
            Download Full Report
          </button>

          {/* Reset Button */}
          <button
            onClick={() => {
              setFile(null);
              setStats(null);
              setError(null);
              setParsedLots([]);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            className="w-full px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Process Another File
          </button>
        </div>
      )}
    </div>
  );
}